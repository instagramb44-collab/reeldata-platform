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

function withHttpStatusPrefix(status: number, message: string): string {
  const prefix = `[HTTP ${status}]`;
  return message.startsWith(prefix) ? message : `${prefix} ${message}`;
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
      const payload = (await response.json()) as { error?: string; message?: string };
      if (payload.error) {
        detail = payload.error;
      } else if (payload.message) {
        detail = payload.message;
      }
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
    } else if (status === 429) {
      detail = 'All interactive browser slots are currently in use. Please try again shortly.';
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

    const browserReason =
      err instanceof Error
        ? `${err.name ? `${err.name}: ` : ''}${err.message || 'Fetch failed'}`
        : String(err || 'Unknown network error');

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

  return (await response.json()) as InstagramConnectionResponse;
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

  return (await response.json()) as { status: string };
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

  return (await response.json()) as InstagramLoginSession;
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

  return (await response.json()) as { accepted: boolean };
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

  return { connected: true };
}

export async function cancelInstagramLoginSession(
  sessionId: string
): Promise<void> {
  const response = await authenticatedFetch(
    `/api/instagram/login/session/${encodeURIComponent(sessionId)}`,
    {
      method: 'DELETE',
    }
  );

  if (!response.ok && response.status !== 404) {
    throw new ApiRequestError(
      await parseErrorMessage(response),
      response.status
    );
  }
}
