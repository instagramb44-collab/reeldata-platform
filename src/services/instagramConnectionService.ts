import { supabase } from '../lib/supabaseClient';
import type {
  BrowserInputPayload,
  InstagramConnectionResponse,
  InstagramLoginSession,
} from '../types/reeldata';

const DEFAULT_API_BASE_URL = 'https://reeldata-api.onrender.com';

export function getReelDataApiBaseUrl(): string {
  const configured = (import.meta.env.VITE_REELDATA_API_URL as string | undefined)?.trim();
  const base = configured || DEFAULT_API_BASE_URL;
  return base.replace(/\/+$/, '');
}

export class ApiRequestError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
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

function withHttpStatusPrefix(status: number, message: unknown): string {
  const safeMessage =
    typeof message === 'string' ? message.trim() : extractErrorString(message);
  const finalMessage = safeMessage || 'Request failed.';
  const prefix = `[HTTP ${status}]`;
  return finalMessage.startsWith(prefix)
    ? finalMessage
    : `${prefix} ${finalMessage}`;
}

async function getAuthenticatedAccessToken(): Promise<string> {
  if (!supabase) {
    throw new ApiRequestError(
      '[HTTP 401] Supabase authentication is not configured.',
      401,
      'auth_not_configured'
    );
  }

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new ApiRequestError(
      '[HTTP 401] You must be signed in to manage Instagram connections.',
      401,
      'unauthenticated'
    );
  }

  return data.session.access_token;
}

async function parseErrorMessage(response: Response): Promise<string> {
  const status = response.status;
  let detail = '';

  try {
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json')) {
      const payload: unknown = await response.json();
      detail = extractErrorString(payload).slice(0, 300);
    } else {
      const text = await response.text();
      if (text.trim() && !isHtmlContent(contentType, text)) {
        detail = text.trim().slice(0, 300);
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

  return withHttpStatusPrefix(status, detail);
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

  const dispatchDelete = (token: string): Promise<void> => {
    const headers = new Headers();
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(targetUrl, {
      method: 'DELETE',
      headers,
      keepalive: Boolean(options?.keepalive),
    })
      .then(() => undefined)
      .catch(() => undefined);
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
    cleanupPromise = getAuthenticatedAccessToken()
      .then((token) => dispatchDelete(token))
      .catch(() => undefined)
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
  options: RequestInit = {}
): Promise<Response> {
  const accessToken = await getAuthenticatedAccessToken();
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
    const browserReason = rawReason.slice(0, 200);

    console.error(
      `[ReelData API] Fetch failed for ${options.method || 'GET'} ${path}: ${browserReason}`
    );

    throw new ApiRequestError(
      `[Network/CORS Error] Unable to reach the ReelData backend API (${browserReason}).`,
      0,
      'network_error'
    );
  }
}

export async function fetchInstagramConnectionStatus(): Promise<InstagramConnectionResponse> {
  const response = await authenticatedFetch('/api/instagram/connection', {
    method: 'GET',
  });

  if (!response.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(response),
      response.status
    );
  }

  const raw: unknown = await response.json();
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
  const response = await authenticatedFetch('/api/instagram/connection', {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(response),
      response.status
    );
  }

  const raw: unknown = await response.json();
  const payload =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  return {
    status: typeof payload.status === 'string' ? payload.status : 'disconnected',
  };
}

export async function startInstagramLoginSession(): Promise<InstagramLoginSession> {
  const response = await authenticatedFetch('/api/instagram/login/session', {
    method: 'POST',
  });

  if (!response.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(response),
      response.status
    );
  }

  const raw: unknown = await response.json();
  const payload =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const sessionId =
    typeof payload.sessionId === 'string' ? payload.sessionId.trim() : '';
  if (!sessionId) {
    throw new ApiRequestError(
      '[HTTP 502] Backend returned an invalid browser session response.',
      502,
      'invalid_session_response'
    );
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

export async function fetchLoginSessionFrame(
  sessionId: string,
  signal?: AbortSignal
): Promise<Blob> {
  const response = await authenticatedFetch(
    `/api/instagram/login/session/${encodeURIComponent(sessionId)}/frame`,
    {
      method: 'GET',
      cache: 'no-store',
      signal,
    }
  );

  if (!response.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(response),
      response.status
    );
  }

  return await response.blob();
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
    }
  );

  if (!response.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(response),
      response.status
    );
  }

  const raw: unknown = await response.json();
  const data =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { accepted: Boolean(data.accepted) };
}

export async function completeInstagramLoginSession(
  sessionId: string
): Promise<{ connected: boolean; message?: string }> {
  const response = await authenticatedFetch(
    `/api/instagram/login/session/${encodeURIComponent(sessionId)}/complete`,
    {
      method: 'POST',
    }
  );

  if (response.status === 409) {
    return {
      connected: false,
      message: await parseErrorMessage(response),
    };
  }

  if (!response.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(response),
      response.status
    );
  }

  markInstagramSessionEnded(sessionId);
  return { connected: true };
}

export async function cancelInstagramLoginSession(
  sessionId: string,
  options?: { expectedUserId?: string | null; keepalive?: boolean }
): Promise<void> {
  await cleanupInstagramSession(sessionId, options);
}
