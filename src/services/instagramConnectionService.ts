import { supabase } from '../lib/supabaseClient';
import type {
  BrowserInputPayload,
  InstagramConnectionResponse,
  InstagramDiagnosticEvent,
  InstagramFrontendDiagnosticCode,
  InstagramLoginSession,
} from '../types/reeldata';

const DEFAULT_API_BASE_URL = 'https://reeldata-api.onrender.com';

export const INSTAGRAM_DIAGNOSTIC_LABELS: Record<
  InstagramFrontendDiagnosticCode,
  string
> = {
  'IG-FE-001': 'Failed to fetch connection status',
  'IG-FE-002': 'Failed to start login session',
  'IG-FE-003': 'Session ID missing from response',
  'IG-FE-004': 'Browser frame failed to load',
  'IG-FE-005': 'Browser frame returned invalid image',
  'IG-FE-006': 'Browser frame polling failed',
  'IG-FE-007': 'Browser input relay failed',
  'IG-FE-008': 'Login session expired',
  'IG-FE-009': 'Finish & Save Connection failed',
  'IG-FE-010': 'Instagram connection status refresh failed',
  'IG-FE-011': 'Browser session cleanup failed',
};

export function getReelDataApiBaseUrl(): string {
  const env =
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env as Record<string, string | undefined>)
      : undefined;
  const configured = env?.VITE_REELDATA_API_URL?.trim();
  const base = configured || DEFAULT_API_BASE_URL;
  return base.replace(/\/+$/, '');
}

export function sanitizeDiagnosticMessage(rawMessage: unknown): string {
  const raw =
    typeof rawMessage === 'string' ? rawMessage : String(rawMessage ?? '');
  if (!raw.trim()) {
    return '';
  }

  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+)?/g, '[redacted-jwt]')
    .replace(/(\/session\/)[^/\s?#]+/gi, '$1[redacted]')
    .replace(
      /\b(password|pass|cookie|cookies|sessionid|session_id|csrftoken|authorization|access_token|refresh_token|secret|apikey|api_key)\s*[:=]\s*[^\s;,&]+/gi,
      '$1=[redacted]'
    )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

export function isRetryableDiagnostic(
  httpStatus: number,
  code?: InstagramFrontendDiagnosticCode
): boolean {
  if (code === 'IG-FE-008') {
    return false;
  }
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 404) {
    return false;
  }
  if (httpStatus === 409) {
    return code === 'IG-FE-009';
  }
  if (httpStatus === 429 || httpStatus === 0 || httpStatus >= 500) {
    return true;
  }
  if (code === 'IG-FE-004' || code === 'IG-FE-005' || code === 'IG-FE-006' || code === 'IG-FE-007') {
    return true;
  }
  return false;
}

export function createInstagramDiagnostic(params: {
  code: InstagramFrontendDiagnosticCode;
  backendCode?: string;
  operation: string;
  httpStatus: number;
  message: string;
  timestamp?: string;
  retryable?: boolean;
}): InstagramDiagnosticEvent {
  const sanitized =
    sanitizeDiagnosticMessage(params.message) ||
    INSTAGRAM_DIAGNOSTIC_LABELS[params.code];
  return {
    code: params.code,
    ...(params.backendCode ? { backendCode: params.backendCode } : {}),
    operation: params.operation,
    httpStatus: params.httpStatus,
    message: sanitized,
    timestamp: params.timestamp || new Date().toISOString(),
    retryable:
      typeof params.retryable === 'boolean'
        ? params.retryable
        : isRetryableDiagnostic(params.httpStatus, params.code),
  };
}

export function logInstagramDiagnostic(event: InstagramDiagnosticEvent): void {
  console.warn('[ReelData IG Diagnostic]', {
    code: event.code,
    ...(event.backendCode ? { backendCode: event.backendCode } : {}),
    operation: event.operation,
    httpStatus: event.httpStatus,
    retryable: event.retryable,
    timestamp: event.timestamp,
    message: sanitizeDiagnosticMessage(event.message),
  });
}

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  diagnosticCode?: InstagramFrontendDiagnosticCode;
  backendCode?: string;
  operation?: string;
  timestamp: string;
  retryable: boolean;

  constructor(
    message: string,
    status: number,
    code?: string,
    options?: {
      diagnosticCode?: InstagramFrontendDiagnosticCode;
      backendCode?: string;
      operation?: string;
      timestamp?: string;
      retryable?: boolean;
    }
  ) {
    const safeMessage = sanitizeDiagnosticMessage(message) || 'Request failed.';
    super(safeMessage);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.diagnosticCode = options?.diagnosticCode;
    this.backendCode = options?.backendCode;
    this.operation = options?.operation;
    this.timestamp = options?.timestamp || new Date().toISOString();
    this.retryable =
      typeof options?.retryable === 'boolean'
        ? options.retryable
        : isRetryableDiagnostic(status, options?.diagnosticCode);
  }

  toDiagnostic(
    fallbackCode: InstagramFrontendDiagnosticCode,
    fallbackOperation: string
  ): InstagramDiagnosticEvent {
    const resolvedCode = this.diagnosticCode ?? fallbackCode;
    return createInstagramDiagnostic({
      code: resolvedCode,
      backendCode: this.backendCode,
      operation: this.operation ?? fallbackOperation,
      httpStatus: this.status,
      message: this.message,
      timestamp: this.timestamp,
      retryable: this.retryable,
    });
  }
}

function isHtmlContent(contentType: unknown, body: unknown): boolean {
  if (
    typeof contentType === 'string' &&
    (contentType.includes('text/html') ||
      contentType.includes('application/xhtml+xml'))
  ) {
    return true;
  }
  if (typeof body !== 'string') {
    return false;
  }
  const normalized = body.trim().toLowerCase();
  return (
    normalized.startsWith('<!doctype') ||
    normalized.startsWith('<html') ||
    normalized.startsWith('<head') ||
    normalized.startsWith('<body')
  );
}

const SENSITIVE_KEY_PATTERN =
  /password|token|secret|authorization|cookie|credential/i;

function extractErrorString(value: unknown, depth = 0): string {
  if (depth > 3 || value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => extractErrorString(item, depth + 1))
      .filter(Boolean)
      .join('; ');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const candidateKeys = ['error', 'message', 'detail', 'details', 'reason'];
    for (const key of candidateKeys) {
      if (key in record && !SENSITIVE_KEY_PATTERN.test(key)) {
        const extracted = extractErrorString(record[key], depth + 1);
        if (extracted) {
          return extracted;
        }
      }
    }
  }
  return '';
}

function extractBackendDiagnosticCode(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of ['diagnosticCode', 'errorCode', 'code']) {
    const candidate = record[key];
    if (
      typeof candidate === 'string' &&
      /^[A-Za-z0-9_-]{2,40}$/.test(candidate.trim()) &&
      !SENSITIVE_KEY_PATTERN.test(candidate)
    ) {
      return candidate.trim();
    }
  }
  const nestedError = record.error;
  if (nestedError && typeof nestedError === 'object' && !Array.isArray(nestedError)) {
    return extractBackendDiagnosticCode(nestedError);
  }
  return undefined;
}

function withHttpStatusPrefix(status: number, message: unknown): string {
  const safeMessage = sanitizeDiagnosticMessage(
    typeof message === 'string' ? message : extractErrorString(message)
  );
  const finalMessage = safeMessage || 'Request failed.';
  const prefix = `[HTTP ${status}]`;
  return finalMessage.startsWith(prefix)
    ? finalMessage
    : `${prefix} ${finalMessage}`;
}

async function getAuthenticatedAccessToken(
  diagnosticCode: InstagramFrontendDiagnosticCode,
  operation: string
): Promise<string> {
  if (!supabase) {
    throw new ApiRequestError(
      '[HTTP 401] Supabase authentication is not configured.',
      401,
      'auth_not_configured',
      {
        diagnosticCode,
        operation,
        retryable: false,
      }
    );
  }

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new ApiRequestError(
      '[HTTP 401] You must be signed in to manage Instagram connections.',
      401,
      'unauthenticated',
      {
        diagnosticCode,
        operation,
        retryable: false,
      }
    );
  }

  return data.session.access_token;
}

async function parseErrorDetails(response: Response): Promise<{
  message: string;
  backendCode?: string;
}> {
  const status = response.status;
  let detail = '';
  let backendCode: string | undefined;

  try {
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json')) {
      const payload: unknown = await response.json();
      backendCode = extractBackendDiagnosticCode(payload);
      detail = sanitizeDiagnosticMessage(extractErrorString(payload));
    } else {
      const text = await response.text();
      if (text.trim() && !isHtmlContent(contentType, text)) {
        detail = sanitizeDiagnosticMessage(text);
      }
    }
  } catch {
    // Ignore body parse errors and fall back to status-based message
  }

  if (!detail) {
    if (status === 401) {
      detail = 'Your session is invalid or expired. Please sign in again.';
    } else if (status === 403) {
      detail = 'You do not have permission to access this Instagram session.';
    } else if (status === 404) {
      detail = 'Interactive browser session expired or was not found.';
    } else if (status === 429) {
      detail =
        'All interactive browser slots are currently in use. Please try again shortly.';
    } else if (status === 502 || status === 503 || status === 504) {
      detail = `Backend service is temporarily unavailable${response.statusText ? ` (${response.statusText})` : ''}.`;
    } else {
      detail = response.statusText
        ? `Request failed (${response.statusText}).`
        : 'Request failed.';
    }
  }

  return {
    message: withHttpStatusPrefix(status, detail),
    backendCode,
  };
}

interface ActiveLoginSessionRecord {
  sessionId: string;
  userId: string;
  accessToken: string | null;
}

let activeLoginSession: ActiveLoginSessionRecord | null = null;
const cleanedLoginSessionIds = new Set<string>();
const inFlightCleanups = new Map<string, Promise<void>>();

function rememberCleanedSessionId(sessionId: string): void {
  if (cleanedLoginSessionIds.size > 100) {
    cleanedLoginSessionIds.clear();
  }
  cleanedLoginSessionIds.add(sessionId);
}

export function registerActiveInstagramSession(
  sessionId: string,
  userId: string,
  accessToken?: string | null
): void {
  if (!sessionId || !userId) return;
  cleanedLoginSessionIds.delete(sessionId);
  activeLoginSession = {
    sessionId,
    userId,
    accessToken: accessToken ?? null,
  };
}

export function updateActiveInstagramSessionToken(
  sessionId: string,
  userId: string,
  accessToken: string | null
): void {
  if (
    activeLoginSession &&
    activeLoginSession.sessionId === sessionId &&
    activeLoginSession.userId === userId
  ) {
    activeLoginSession.accessToken = accessToken;
  }
}

export function markInstagramSessionEnded(
  sessionId: string,
  userId?: string | null
): void {
  if (!sessionId) return;
  rememberCleanedSessionId(sessionId);
  if (
    activeLoginSession &&
    activeLoginSession.sessionId === sessionId &&
    (!userId || activeLoginSession.userId === userId)
  ) {
    activeLoginSession = null;
  }
}

export async function cleanupInstagramSession(
  sessionId: string,
  options?: {
    expectedUserId?: string | null;
    keepalive?: boolean;
    accessTokenOverride?: string | null;
    onDiagnostic?: (event: InstagramDiagnosticEvent) => void;
  }
): Promise<void> {
  if (!sessionId) return;
  if (cleanedLoginSessionIds.has(sessionId)) return;

  const existing = inFlightCleanups.get(sessionId);
  if (existing) {
    return existing;
  }

  const tracked =
    activeLoginSession && activeLoginSession.sessionId === sessionId
      ? activeLoginSession
      : null;

  if (
    tracked &&
    options?.expectedUserId &&
    tracked.userId !== options.expectedUserId
  ) {
    // Never close another user's session
    return;
  }

  rememberCleanedSessionId(sessionId);
  const syncToken = options?.accessTokenOverride ?? tracked?.accessToken ?? null;
  if (tracked) {
    activeLoginSession = null;
  }

  const baseUrl = getReelDataApiBaseUrl();
  const targetUrl = `${baseUrl}/api/instagram/login/session/${encodeURIComponent(sessionId)}`;

  const reportCleanupFailure = (
    httpStatus: number,
    message: string,
    backendCode?: string
  ) => {
    const diag = createInstagramDiagnostic({
      code: 'IG-FE-011',
      backendCode,
      operation: 'cleanup_browser_session',
      httpStatus,
      message,
    });
    logInstagramDiagnostic(diag);
    options?.onDiagnostic?.(diag);
  };

  const dispatchDelete = (token: string): Promise<void> => {
    const headers = new Headers();
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(targetUrl, {
      method: 'DELETE',
      headers,
      keepalive: Boolean(options?.keepalive),
    })
      .then(async (res) => {
        if (!res.ok && res.status !== 404) {
          const parsed = await parseErrorDetails(res);
          reportCleanupFailure(res.status, parsed.message, parsed.backendCode);
        }
      })
      .catch((err) => {
        const msg =
          err instanceof Error && err.message
            ? err.message
            : 'Network error during browser session cleanup.';
        reportCleanupFailure(0, msg);
      });
  };

  let cleanupPromise: Promise<void>;

  if (syncToken) {
    cleanupPromise = dispatchDelete(syncToken).finally(() => {
      inFlightCleanups.delete(sessionId);
    });
  } else if (options?.keepalive) {
    // Cannot reliably await async getSession() during page unload without a cached token
    return;
  } else {
    cleanupPromise = getAuthenticatedAccessToken('IG-FE-011', 'cleanup_browser_session')
      .then((token) => dispatchDelete(token))
      .catch((err) => {
        const status = err instanceof ApiRequestError ? err.status : 401;
        const msg =
          err instanceof Error && err.message
            ? err.message
            : 'Unable to authenticate browser session cleanup.';
        reportCleanupFailure(status, msg);
      })
      .finally(() => {
        inFlightCleanups.delete(sessionId);
      });
  }

  inFlightCleanups.set(sessionId, cleanupPromise);
  return cleanupPromise;
}

export async function cleanupActiveInstagramSession(
  expectedUserId?: string | null,
  options?: { keepalive?: boolean }
): Promise<void> {
  if (!activeLoginSession || !expectedUserId) {
    return;
  }
  if (activeLoginSession.userId !== expectedUserId) {
    return;
  }

  return cleanupInstagramSession(activeLoginSession.sessionId, {
    expectedUserId,
    keepalive: options?.keepalive,
    accessTokenOverride: activeLoginSession.accessToken,
  });
}

async function authenticatedFetch(
  path: string,
  options: RequestInit = {},
  diagnosticContext?: {
    code: InstagramFrontendDiagnosticCode;
    operation: string;
  }
): Promise<Response> {
  const code = diagnosticContext?.code ?? 'IG-FE-001';
  const operation = diagnosticContext?.operation ?? 'instagram_api_request';
  const accessToken = await getAuthenticatedAccessToken(code, operation);
  const baseUrl = getReelDataApiBaseUrl();

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    return await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
    });
  } catch (err) {
    if (
      (err instanceof Error && err.name === 'AbortError') ||
      (typeof DOMException !== 'undefined' &&
        err instanceof DOMException &&
        err.name === 'AbortError')
    ) {
      throw err;
    }

    const rawReason =
      err instanceof Error
        ? `${err.name ? `${err.name}: ` : ''}${err.message || 'Fetch failed'}`
        : String(err || 'Unknown network error');
    const safeReason = sanitizeDiagnosticMessage(rawReason).slice(0, 200);
    const safePath = path.replace(/(\/session\/)[^/\s?#]+/gi, '$1[redacted]');

    const diag = createInstagramDiagnostic({
      code,
      operation,
      httpStatus: 0,
      message: `[Network/CORS Error] Unable to reach the ReelData backend API (${safeReason}).`,
      retryable: true,
    });
    logInstagramDiagnostic(diag);

    console.error(
      `[ReelData API] Fetch failed for ${options.method || 'GET'} ${safePath}: ${safeReason}`
    );

    throw new ApiRequestError(diag.message, 0, 'network_error', {
      diagnosticCode: code,
      operation,
      timestamp: diag.timestamp,
      retryable: true,
    });
  }
}

async function throwHttpDiagnosticError(
  response: Response,
  diagnosticCode: InstagramFrontendDiagnosticCode,
  operation: string
): Promise<never> {
  const parsed = await parseErrorDetails(response);
  const err = new ApiRequestError(parsed.message, response.status, parsed.backendCode, {
    diagnosticCode,
    backendCode: parsed.backendCode,
    operation,
  });
  logInstagramDiagnostic(err.toDiagnostic(diagnosticCode, operation));
  throw err;
}

export async function fetchInstagramConnectionStatus(options?: {
  isRefresh?: boolean;
}): Promise<InstagramConnectionResponse> {
  const code: InstagramFrontendDiagnosticCode = options?.isRefresh
    ? 'IG-FE-010'
    : 'IG-FE-001';
  const operation = options?.isRefresh
    ? 'refresh_connection_status'
    : 'fetch_connection_status';

  const response = await authenticatedFetch(
    '/api/instagram/connection',
    { method: 'GET' },
    { code, operation }
  );

  if (!response.ok) {
    await throwHttpDiagnosticError(response, code, operation);
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    const err = new ApiRequestError(
      `[HTTP ${response.status}] Backend returned an invalid JSON connection status response.`,
      502,
      'invalid_connection_response',
      { diagnosticCode: code, operation, retryable: true }
    );
    logInstagramDiagnostic(err.toDiagnostic(code, operation));
    throw err;
  }

  const payload =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  return {
    status: typeof payload.status === 'string' ? payload.status : 'disconnected',
    connectedAt:
      typeof payload.connectedAt === 'string' && payload.connectedAt.trim()
        ? payload.connectedAt.trim()
        : null,
    updatedAt:
      typeof payload.updatedAt === 'string' && payload.updatedAt.trim()
        ? payload.updatedAt.trim()
        : null,
  };
}

export async function disconnectInstagramConnection(): Promise<{ status: string }> {
  const code: InstagramFrontendDiagnosticCode = 'IG-FE-010';
  const operation = 'disconnect_instagram_connection';
  const response = await authenticatedFetch(
    '/api/instagram/connection',
    { method: 'DELETE' },
    { code, operation }
  );

  if (!response.ok) {
    await throwHttpDiagnosticError(response, code, operation);
  }

  const raw: unknown = await response.json().catch(() => ({}));
  const payload =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  return {
    status: typeof payload.status === 'string' ? payload.status : 'disconnected',
  };
}

export async function startInstagramLoginSession(): Promise<InstagramLoginSession> {
  const response = await authenticatedFetch(
    '/api/instagram/login/session',
    { method: 'POST' },
    { code: 'IG-FE-002', operation: 'start_login_session' }
  );

  if (!response.ok) {
    await throwHttpDiagnosticError(response, 'IG-FE-002', 'start_login_session');
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    const err = new ApiRequestError(
      '[HTTP 502] Backend returned an invalid JSON response when starting browser session.',
      502,
      'invalid_session_response',
      {
        diagnosticCode: 'IG-FE-003',
        operation: 'validate_login_session_response',
        retryable: true,
      }
    );
    logInstagramDiagnostic(
      err.toDiagnostic('IG-FE-003', 'validate_login_session_response')
    );
    throw err;
  }

  const payload =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const sessionId =
    typeof payload.sessionId === 'string' ? payload.sessionId.trim() : '';
  if (!sessionId) {
    const backendCode = extractBackendDiagnosticCode(payload);
    const err = new ApiRequestError(
      '[HTTP 502] Backend returned a browser session response without a session ID.',
      502,
      'missing_session_id',
      {
        diagnosticCode: 'IG-FE-003',
        backendCode,
        operation: 'validate_login_session_response',
        retryable: true,
      }
    );
    logInstagramDiagnostic(
      err.toDiagnostic('IG-FE-003', 'validate_login_session_response')
    );
    throw err;
  }

  const expiresInSeconds =
    typeof payload.expiresInSeconds === 'number' &&
    Number.isFinite(payload.expiresInSeconds) &&
    payload.expiresInSeconds > 0
      ? Math.floor(payload.expiresInSeconds)
      : 600;

  return {
    sessionId,
    expiresInSeconds,
  };
}

const IMAGE_EXTENSION_CONTENT_TYPES = ['image/jpeg', 'image/jpg'];

async function hasValidImageSignature(blob: Blob): Promise<'image/jpeg' | 'image/other' | null> {
  try {
    const headerBuffer = await blob.slice(0, 12).arrayBuffer();
    const bytes = new Uint8Array(headerBuffer);
    if (bytes.length < 3) {
      return null;
    }
    // JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg';
    }
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return 'image/other';
    }
    // GIF: GIF8
    if (
      bytes.length >= 4 &&
      bytes[0] === 0x47 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x38
    ) {
      return 'image/other';
    }
    // WebP: RIFF....WEBP
    if (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return 'image/other';
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchLoginSessionFrame(
  sessionId: string,
  signal?: AbortSignal,
  options?: { source?: 'poll' | 'onDemand' }
): Promise<Blob> {
  const frameSource = options?.source ?? 'onDemand';
  const fetchCode: InstagramFrontendDiagnosticCode =
    frameSource === 'poll' ? 'IG-FE-006' : 'IG-FE-004';
  const fetchOperation =
    frameSource === 'poll' ? 'poll_browser_frame' : 'load_browser_frame';

  const response = await authenticatedFetch(
    `/api/instagram/login/session/${encodeURIComponent(sessionId)}/frame`,
    {
      method: 'GET',
      cache: 'no-store',
      signal,
    },
    { code: fetchCode, operation: fetchOperation }
  );

  if (!response.ok) {
    const resolvedCode: InstagramFrontendDiagnosticCode =
      response.status === 404 ? 'IG-FE-008' : fetchCode;
    const resolvedOperation =
      response.status === 404 ? 'login_session_expired' : fetchOperation;
    await throwHttpDiagnosticError(response, resolvedCode, resolvedOperation);
  }

  const headerContentType = (response.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();

  if (headerContentType && !headerContentType.startsWith('image/')) {
    const message = isHtmlContent(headerContentType, '')
      ? `[HTTP ${response.status}] Backend returned an HTML page instead of a browser screenshot (expected image/jpeg).`
      : `[HTTP ${response.status}] Unexpected browser frame content type "${headerContentType}" (expected image/jpeg).`;
    const err = new ApiRequestError(message, 502, 'invalid_frame_content_type', {
      diagnosticCode: 'IG-FE-005',
      operation: 'validate_frame_image',
      retryable: true,
    });
    logInstagramDiagnostic(err.toDiagnostic('IG-FE-005', 'validate_frame_image'));
    throw err;
  }

  const blob = await response.blob();
  if (!blob || blob.size === 0) {
    const err = new ApiRequestError(
      `[HTTP ${response.status}] Backend returned an empty screenshot image.`,
      502,
      'empty_frame_blob',
      {
        diagnosticCode: 'IG-FE-005',
        operation: 'validate_frame_image',
        retryable: true,
      }
    );
    logInstagramDiagnostic(err.toDiagnostic('IG-FE-005', 'validate_frame_image'));
    throw err;
  }

  const blobType = (blob.type || '').split(';')[0].trim().toLowerCase();
  if (blobType && !blobType.startsWith('image/')) {
    const err = new ApiRequestError(
      `[HTTP ${response.status}] Invalid browser frame format "${blobType}" (expected image/jpeg).`,
      502,
      'invalid_frame_blob_type',
      {
        diagnosticCode: 'IG-FE-005',
        operation: 'validate_frame_image',
        retryable: true,
      }
    );
    logInstagramDiagnostic(err.toDiagnostic('IG-FE-005', 'validate_frame_image'));
    throw err;
  }

  const signature = await hasValidImageSignature(blob);
  if (!signature) {
    const err = new ApiRequestError(
      `[HTTP ${response.status}] Backend response did not contain a valid JPEG or image screenshot.`,
      502,
      'invalid_frame_image',
      {
        diagnosticCode: 'IG-FE-005',
        operation: 'validate_frame_image',
        retryable: true,
      }
    );
    logInstagramDiagnostic(err.toDiagnostic('IG-FE-005', 'validate_frame_image'));
    throw err;
  }

  if (
    !blobType &&
    (IMAGE_EXTENSION_CONTENT_TYPES.includes(headerContentType) ||
      signature === 'image/jpeg')
  ) {
    return new Blob([blob], { type: 'image/jpeg' });
  }

  return blob;
}

export async function sendLoginSessionInput(
  sessionId: string,
  payload: BrowserInputPayload
): Promise<{ accepted: boolean }> {
  const response = await authenticatedFetch(
    `/api/instagram/login/session/${encodeURIComponent(sessionId)}/input`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    { code: 'IG-FE-007', operation: 'relay_browser_input' }
  );

  if (!response.ok) {
    const resolvedCode: InstagramFrontendDiagnosticCode =
      response.status === 404 ? 'IG-FE-008' : 'IG-FE-007';
    const resolvedOperation =
      response.status === 404 ? 'login_session_expired' : 'relay_browser_input';
    await throwHttpDiagnosticError(response, resolvedCode, resolvedOperation);
  }

  const raw: unknown = await response.json().catch(() => ({}));
  const data =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { accepted: Boolean(data.accepted) };
}

export async function completeInstagramLoginSession(
  sessionId: string
): Promise<{
  connected: boolean;
  message?: string;
  diagnostic?: InstagramDiagnosticEvent;
}> {
  const response = await authenticatedFetch(
    `/api/instagram/login/session/${encodeURIComponent(sessionId)}/complete`,
    {
      method: 'POST',
    },
    { code: 'IG-FE-009', operation: 'complete_login_session' }
  );

  if (response.status === 409) {
    const parsed = await parseErrorDetails(response);
    const diagnostic = createInstagramDiagnostic({
      code: 'IG-FE-009',
      backendCode: parsed.backendCode,
      operation: 'complete_login_session',
      httpStatus: 409,
      message: parsed.message,
      retryable: true,
    });
    logInstagramDiagnostic(diagnostic);
    return {
      connected: false,
      message: parsed.message,
      diagnostic,
    };
  }

  if (!response.ok) {
    const resolvedCode: InstagramFrontendDiagnosticCode =
      response.status === 404 ? 'IG-FE-008' : 'IG-FE-009';
    const resolvedOperation =
      response.status === 404 ? 'login_session_expired' : 'complete_login_session';
    await throwHttpDiagnosticError(response, resolvedCode, resolvedOperation);
  }

  markInstagramSessionEnded(sessionId);
  return { connected: true };
}

export async function cancelInstagramLoginSession(
  sessionId: string,
  options?: {
    expectedUserId?: string | null;
    keepalive?: boolean;
    onDiagnostic?: (event: InstagramDiagnosticEvent) => void;
  }
): Promise<void> {
  await cleanupInstagramSession(sessionId, options);
}
