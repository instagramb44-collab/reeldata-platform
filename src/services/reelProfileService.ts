import { supabase } from '../lib/supabaseClient';
import type {
  ReelCreatorProfileResult,
  ReelLookupBroadcastMessage,
  ReelLookupSessionStartResponse,
  ReelLookupStep,
} from '../types/reeldata';
import { parseInstagramReelUrl } from './reelDataService';

const DEFAULT_API_BASE_URL = 'https://reeldata-api.onrender.com';
export const REEL_LOOKUP_BROADCAST_CHANNEL = 'reeldata_reel_lookup_v1';

const SENSITIVE_KEY_PATTERN =
  /password|token|secret|authorization|cookie|credential|session/i;

export class ReelProfileLookupError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ReelProfileLookupError';
    this.status = status;
    this.code = code;
  }
}

export function getReelDataApiBaseUrl(): string {
  const env =
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env as Record<string, string | undefined>)
      : undefined;
  const configured = env?.VITE_REELDATA_API_URL?.trim();
  const base = configured || DEFAULT_API_BASE_URL;
  return base.replace(/\/+$/, '');
}

export function validateInstagramProfileUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') {
    return null;
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') {
    return null;
  }

  if (parsed.username || parsed.password) {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== 'instagram.com' && !hostname.endsWith('.instagram.com')) {
    return null;
  }

  if (!parsed.pathname || parsed.pathname === '/') {
    return null;
  }

  return parsed.toString();
}

function isHtmlContent(contentType: string, body: string): boolean {
  if (
    contentType.includes('text/html') ||
    contentType.includes('application/xhtml+xml')
  ) {
    return true;
  }
  const normalized = body.trim().toLowerCase();
  return (
    normalized.startsWith('<!doctype') ||
    normalized.startsWith('<html') ||
    normalized.startsWith('<head') ||
    normalized.startsWith('<body')
  );
}

function extractSafeErrorString(value: unknown, depth = 0): string {
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
      .map((item) => extractSafeErrorString(item, depth + 1))
      .filter(Boolean)
      .join('; ');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const candidateKeys = ['error', 'message', 'detail', 'details', 'reason'];
    for (const key of candidateKeys) {
      if (key in record && !SENSITIVE_KEY_PATTERN.test(key)) {
        const extracted = extractSafeErrorString(record[key], depth + 1);
        if (extracted) {
          return extracted;
        }
      }
    }
  }
  return '';
}

function formatHttpErrorPrefix(status: number, message: string): string {
  const trimmed = message.trim() || 'Request failed.';
  const prefix = `[HTTP ${status}]`;
  return trimmed.startsWith(prefix) ? trimmed : `${prefix} ${trimmed}`;
}

async function parseBackendErrorMessage(response: Response): Promise<string> {
  const status = response.status;
  let detail = '';

  try {
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json')) {
      const payload: unknown = await response.json();
      detail = extractSafeErrorString(payload).slice(0, 300);
    } else {
      const text = await response.text();
      if (text.trim() && !isHtmlContent(contentType, text)) {
        detail = text.trim().slice(0, 300);
      }
    }
  } catch {
    // Ignore parse errors and fall back to status-specific messages
  }

  if (!detail) {
    if (status === 401) {
      detail = 'Your session is invalid or expired. Please sign in again.';
    } else if (status === 403) {
      detail = 'You do not have permission to look up this Reel creator.';
    } else if (status === 404) {
      detail = 'Creator profile could not be found for this Instagram Reel.';
    } else if (status === 429) {
      detail = 'Too many requests. Please wait a moment and try again.';
    } else if (status === 502 || status === 503 || status === 504) {
      detail = `Backend service is temporarily unavailable${response.statusText ? ` (${response.statusText})` : ''}.`;
    } else if (status >= 500) {
      detail = 'Server error while looking up the Reel creator.';
    } else {
      detail = response.statusText
        ? `Request failed (${response.statusText}).`
        : 'Unable to look up the Reel creator.';
    }
  }

  return formatHttpErrorPrefix(status, detail);
}

async function getLatestAccessToken(): Promise<string> {
  if (!supabase) {
    throw new ReelProfileLookupError(
      '[HTTP 401] Supabase authentication is not configured.',
      401,
      'auth_not_configured'
    );
  }

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new ReelProfileLookupError(
      '[HTTP 401] You must be signed in to look up Reel creators.',
      401,
      'unauthenticated'
    );
  }

  return data.session.access_token;
}

export async function lookupReelCreatorProfile(
  rawReelUrl: string,
  options?: { signal?: AbortSignal }
): Promise<ReelCreatorProfileResult> {
  const parsedReel = parseInstagramReelUrl(rawReelUrl);
  if (!parsedReel.valid || !parsedReel.normalizedUrl) {
    throw new ReelProfileLookupError(
      parsedReel.errorMessage ||
        'Please enter a valid Instagram Reel URL (https://www.instagram.com/reel/...).',
      400,
      'invalid_reel_url'
    );
  }

  const accessToken = await getLatestAccessToken();
  const baseUrl = getReelDataApiBaseUrl();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/instagram/reel/profile`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: parsedReel.normalizedUrl }),
      signal: options?.signal,
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
    const safeReason = rawReason.slice(0, 200);

    throw new ReelProfileLookupError(
      `[Network Error] Unable to reach the ReelData backend API (${safeReason}).`,
      0,
      'network_error'
    );
  }

  if (!response.ok) {
    throw new ReelProfileLookupError(
      await parseBackendErrorMessage(response),
      response.status
    );
  }

  let rawPayload: unknown;
  try {
    rawPayload = await response.json();
  } catch {
    throw new ReelProfileLookupError(
      '[HTTP 502] Backend returned a non-JSON creator profile response.',
      502,
      'invalid_json_response'
    );
  }

  const record =
    rawPayload && typeof rawPayload === 'object'
      ? (rawPayload as Record<string, unknown>)
      : null;

  return parseValidatedCreatorProfile(record);
}

export function parseValidatedCreatorProfile(
  rawPayload: unknown
): ReelCreatorProfileResult {
  const record =
    rawPayload && typeof rawPayload === 'object'
      ? (rawPayload as Record<string, unknown>)
      : null;

  const creatorRecord =
    record &&
    record.creator &&
    typeof record.creator === 'object' &&
    !Array.isArray(record.creator)
      ? (record.creator as Record<string, unknown>)
      : null;

  const profileSource = creatorRecord ?? record;

  const username =
    profileSource && typeof profileSource.username === 'string'
      ? profileSource.username.trim().replace(/^@+/, '')
      : '';
  const profileUrl = profileSource
    ? validateInstagramProfileUrl(profileSource.profileUrl)
    : null;

  if (!username || !profileUrl) {
    throw new ReelProfileLookupError(
      '[HTTP 502] Backend returned an invalid or incomplete creator profile response.',
      502,
      'invalid_profile_response'
    );
  }

  return {
    username,
    profileUrl,
  };
}

const cleanedLookupSessionIds = new Set<string>();
const inFlightLookupCleanups = new Map<string, Promise<void>>();

function rememberCleanedLookupSessionId(sessionId: string): void {
  if (cleanedLookupSessionIds.size > 100) {
    cleanedLookupSessionIds.clear();
  }
  cleanedLookupSessionIds.add(sessionId);
}

export function markReelLookupSessionEnded(sessionId: string): void {
  if (!sessionId) return;
  rememberCleanedLookupSessionId(sessionId);
}

export async function startReelLookupSession(
  rawReelUrl: string,
  options?: { signal?: AbortSignal }
): Promise<ReelLookupSessionStartResponse> {
  const parsedReel = parseInstagramReelUrl(rawReelUrl);
  if (!parsedReel.valid || !parsedReel.normalizedUrl) {
    throw new ReelProfileLookupError(
      parsedReel.errorMessage ||
        'Please enter a valid Instagram Reel URL (https://www.instagram.com/reel/...).',
      400,
      'invalid_reel_url'
    );
  }

  const accessToken = await getLatestAccessToken();
  const baseUrl = getReelDataApiBaseUrl();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/instagram/reel/lookup/session`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: parsedReel.normalizedUrl }),
      signal: options?.signal,
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

    throw new ReelProfileLookupError(
      `[Network Error] Unable to start remote Reel browser session (${rawReason.slice(0, 200)}).`,
      0,
      'network_error'
    );
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new ReelProfileLookupError(
        '[HTTP 404] Live Reel browser streaming endpoint is not available on the backend yet.',
        404,
        'streaming_endpoint_unavailable'
      );
    }
    throw new ReelProfileLookupError(
      await parseBackendErrorMessage(response),
      response.status
    );
  }

  let rawPayload: unknown;
  try {
    rawPayload = await response.json();
  } catch {
    throw new ReelProfileLookupError(
      '[HTTP 502] Backend returned an invalid JSON session response.',
      502,
      'invalid_json_response'
    );
  }

  const record =
    rawPayload && typeof rawPayload === 'object'
      ? (rawPayload as Record<string, unknown>)
      : {};

  const sessionId =
    typeof record.sessionId === 'string' ? record.sessionId.trim() : '';
  const viewerToken =
    typeof record.viewerToken === 'string' ? record.viewerToken.trim() : '';
  const expiresInSeconds =
    typeof record.expiresInSeconds === 'number' &&
    Number.isFinite(record.expiresInSeconds) &&
    record.expiresInSeconds > 0
      ? Math.floor(record.expiresInSeconds)
      : 90;

  if (!sessionId || !viewerToken) {
    throw new ReelProfileLookupError(
      '[HTTP 502] Backend did not return a valid browser session ID and viewer token.',
      502,
      'invalid_session_response'
    );
  }

  cleanedLookupSessionIds.delete(sessionId);

  return {
    sessionId,
    viewerToken,
    expiresInSeconds,
  };
}

export async function closeReelLookupSession(
  sessionId: string,
  options?: { keepalive?: boolean; accessTokenOverride?: string | null }
): Promise<void> {
  if (!sessionId) return;
  if (cleanedLookupSessionIds.has(sessionId)) return;

  const existing = inFlightLookupCleanups.get(sessionId);
  if (existing) {
    return existing;
  }

  rememberCleanedLookupSessionId(sessionId);
  const baseUrl = getReelDataApiBaseUrl();
  const targetUrl = `${baseUrl}/api/instagram/reel/lookup/session/${encodeURIComponent(sessionId)}`;

  const dispatchDelete = (token: string): Promise<void> =>
    fetch(targetUrl, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      keepalive: Boolean(options?.keepalive),
    })
      .then(() => undefined)
      .catch(() => undefined);

  let cleanupPromise: Promise<void>;
  if (options?.accessTokenOverride) {
    cleanupPromise = dispatchDelete(options.accessTokenOverride).finally(() => {
      inFlightLookupCleanups.delete(sessionId);
    });
  } else if (options?.keepalive) {
    // Unload handlers cannot reliably await async getSession()
    return;
  } else {
    cleanupPromise = getLatestAccessToken()
      .then((token) => dispatchDelete(token))
      .catch(() => undefined)
      .finally(() => {
        inFlightLookupCleanups.delete(sessionId);
      });
  }

  inFlightLookupCleanups.set(sessionId, cleanupPromise);
  return cleanupPromise;
}

export function buildReelLookupWebSocketUrl(sessionId: string): string {
  const baseUrl = getReelDataApiBaseUrl();
  const parsed = new URL(baseUrl);
  parsed.protocol = parsed.protocol === 'http:' ? 'ws:' : 'wss:';
  parsed.pathname = `${parsed.pathname.replace(/\/+$/, '')}/ws/instagram/reel/lookup/${encodeURIComponent(sessionId)}`;
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

function base64ToJpegBlob(base64Data: string, mimeType = 'image/jpeg'): Blob | null {
  try {
    const cleaned = base64Data.replace(/^data:image\/[a-z0-9+.-]+;base64,/i, '').trim();
    if (!cleaned) return null;
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    if (bytes.length === 0) return null;
    return new Blob([bytes], { type: mimeType.startsWith('image/') ? mimeType : 'image/jpeg' });
  } catch {
    return null;
  }
}

export interface ReelLookupWebSocketCallbacks {
  onOpen?: () => void;
  onStatus?: (step: ReelLookupStep, message: string) => void;
  onFrame?: (blob: Blob) => void;
  onResult?: (result: ReelCreatorProfileResult) => void;
  onError?: (message: string, status?: number) => void;
  onClose?: (event: { code: number; reason: string; wasClean: boolean }) => void;
}

export interface ReelLookupWebSocketConnection {
  close: (code?: number, reason?: string) => void;
}

export function connectReelLookupWebSocket(params: {
  sessionId: string;
  viewerToken: string;
  callbacks: ReelLookupWebSocketCallbacks;
  WebSocketImpl?: typeof WebSocket;
}): ReelLookupWebSocketConnection {
  const { sessionId, viewerToken, callbacks } = params;
  const WsCtor =
    params.WebSocketImpl ??
    (typeof WebSocket !== 'undefined' ? WebSocket : undefined);

  if (!WsCtor) {
    throw new ReelProfileLookupError(
      'WebSocket is not supported in this browser.',
      0,
      'websocket_unsupported'
    );
  }

  const wsUrl = buildReelLookupWebSocketUrl(sessionId);
  const socket = new WsCtor(wsUrl);
  if ('binaryType' in socket) {
    socket.binaryType = 'arraybuffer';
  }

  let closedManually = false;

  socket.onopen = () => {
    // Authenticate via the first WebSocket message so the single-use viewer token
    // never appears in query parameters or HTTP logs.
    socket.send(
      JSON.stringify({
        type: 'auth',
        viewerToken,
      })
    );
    callbacks.onOpen?.();
  };

  socket.onmessage = (event: MessageEvent) => {
    const data = event.data;

    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      if (data.size > 0) {
        callbacks.onFrame?.(
          data.type && data.type.startsWith('image/')
            ? data
            : new Blob([data], { type: 'image/jpeg' })
        );
      }
      return;
    }

    if (data instanceof ArrayBuffer) {
      if (data.byteLength > 0) {
        callbacks.onFrame?.(new Blob([data], { type: 'image/jpeg' }));
      }
      return;
    }

    if (typeof data !== 'string') {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }

    if (!parsed || typeof parsed !== 'object') {
      return;
    }

    const msg = parsed as Record<string, unknown>;
    const msgType = typeof msg.type === 'string' ? msg.type : '';

    if (msgType === 'status') {
      const step = (typeof msg.step === 'string' ? msg.step : 'navigating') as ReelLookupStep;
      const message =
        typeof msg.message === 'string' && msg.message.trim()
          ? msg.message.trim()
          : 'Loading Instagram Reel...';
      callbacks.onStatus?.(step, message);
      return;
    }

    if (msgType === 'frame' && typeof msg.data === 'string') {
      const mimeType =
        typeof msg.mimeType === 'string' ? msg.mimeType : 'image/jpeg';
      const blob = base64ToJpegBlob(msg.data, mimeType);
      if (blob) {
        callbacks.onFrame?.(blob);
      }
      return;
    }

    if (msgType === 'result') {
      try {
        const result = parseValidatedCreatorProfile(msg.creator ? msg : msg.result ?? msg);
        markReelLookupSessionEnded(sessionId);
        callbacks.onResult?.(result);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Invalid creator profile returned from browser stream.';
        callbacks.onError?.(message, 502);
      }
      return;
    }

    if (msgType === 'error') {
      const status =
        typeof msg.status === 'number' && Number.isFinite(msg.status)
          ? msg.status
          : undefined;
      const message =
        typeof msg.message === 'string' && msg.message.trim()
          ? msg.message.trim()
          : typeof msg.error === 'string' && msg.error.trim()
            ? msg.error.trim()
            : 'Remote Instagram browser encountered an error.';
      markReelLookupSessionEnded(sessionId);
      callbacks.onError?.(
        status ? formatHttpErrorPrefix(status, message) : message,
        status
      );
    }
  };

  socket.onerror = () => {
    if (!closedManually) {
      callbacks.onError?.('WebSocket connection error while streaming live Instagram browser.');
    }
  };

  socket.onclose = (event: CloseEvent) => {
    if (!closedManually) {
      callbacks.onClose?.({
        code: event.code,
        reason: event.reason || '',
        wasClean: event.wasClean,
      });
    }
  };

  return {
    close: (code = 1000, reason = 'Viewer closed') => {
      closedManually = true;
      if (
        socket.readyState === WsCtor.OPEN ||
        socket.readyState === WsCtor.CONNECTING
      ) {
        socket.close(code, reason);
      }
    },
  };
}

export function isValidReelLookupBroadcastMessage(
  rawData: unknown,
  options: {
    expectedOrigin: string;
    expectedLookupId?: string;
    eventOrigin?: string;
  }
): rawData is ReelLookupBroadcastMessage {
  if (
    options.eventOrigin &&
    options.eventOrigin !== options.expectedOrigin
  ) {
    return false;
  }

  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
    return false;
  }

  const record = rawData as Record<string, unknown>;
  if (record.origin !== options.expectedOrigin) {
    return false;
  }

  if (
    typeof record.lookupId !== 'string' ||
    !record.lookupId.trim() ||
    (options.expectedLookupId && record.lookupId !== options.expectedLookupId)
  ) {
    return false;
  }

  // Reject any accidental sensitive properties on cross-tab messages
  const forbiddenKeys = [
    'accessToken',
    'access_token',
    'password',
    'cookies',
    'storageState',
    'storage_state',
  ];
  for (const key of forbiddenKeys) {
    if (key in record) {
      return false;
    }
  }

  return typeof record.type === 'string' && record.type.length > 0;
}
