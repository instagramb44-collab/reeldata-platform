import { supabase } from '../lib/supabaseClient';
import type { ReelCreatorProfileResult } from '../types/reeldata';
import { parseInstagramReelUrl } from './reelDataService';

const DEFAULT_API_BASE_URL = 'https://reeldata-api.onrender.com';

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

  const username =
    record && typeof record.username === 'string'
      ? record.username.trim().replace(/^@+/, '')
      : '';
  const profileUrl = record
    ? validateInstagramProfileUrl(record.profileUrl)
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
