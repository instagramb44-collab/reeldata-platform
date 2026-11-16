import { supabase } from '../lib/supabaseClient';
import type { ReelCreatorProfileResult } from '../types/reeldata';
import { parseInstagramReelUrl } from './reelDataService';

const DEFAULT_API_BASE_URL = 'https://reeldata-api.onrender.com';
const INSTAGRAM_USERNAME_REGEX = /^[A-Za-z0-9._]{1,30}$/;
const SIMPLE_LOOKUP_ERROR_MESSAGE = 'Unable to find creator. Please try again.';

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

async function getLatestAccessToken(): Promise<string> {
  if (!supabase) {
    throw new ReelProfileLookupError(
      'Your session has expired. Please sign in again.',
      401,
      'auth_not_configured'
    );
  }

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new ReelProfileLookupError(
      'Your session has expired. Please sign in again.',
      401,
      'unauthenticated'
    );
  }

  return data.session.access_token;
}

export function parseJobCreatorResult(rawPayload: unknown): ReelCreatorProfileResult {
  const record =
    rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
      ? (rawPayload as Record<string, unknown>)
      : null;

  const results = record && Array.isArray(record.results) ? record.results : null;
  if (!results || results.length === 0) {
    throw new ReelProfileLookupError(
      SIMPLE_LOOKUP_ERROR_MESSAGE,
      422,
      'empty_results'
    );
  }

  const first = results[0];
  const item =
    first && typeof first === 'object' && !Array.isArray(first)
      ? (first as Record<string, unknown>)
      : null;

  if (!item) {
    throw new ReelProfileLookupError(
      SIMPLE_LOOKUP_ERROR_MESSAGE,
      422,
      'invalid_result_item'
    );
  }

  if (typeof item.error === 'string' && item.error.trim()) {
    throw new ReelProfileLookupError(
      SIMPLE_LOOKUP_ERROR_MESSAGE,
      422,
      'creator_lookup_failed'
    );
  }

  const username =
    typeof item.username === 'string'
      ? item.username.trim().replace(/^@+/, '')
      : '';

  if (!username || !INSTAGRAM_USERNAME_REGEX.test(username)) {
    throw new ReelProfileLookupError(
      SIMPLE_LOOKUP_ERROR_MESSAGE,
      422,
      'missing_username'
    );
  }

  const profileName =
    typeof item.profileName === 'string' ? item.profileName.trim() : '';

  const profileUrl =
    validateInstagramProfileUrl(item.profileUrl) ??
    validateInstagramProfileUrl(`https://www.instagram.com/${username}/`);

  if (!profileUrl) {
    throw new ReelProfileLookupError(
      SIMPLE_LOOKUP_ERROR_MESSAGE,
      422,
      'invalid_profile_url'
    );
  }

  return {
    username,
    ...(profileName ? { profileName } : {}),
    profileUrl,
  };
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
    response = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ urls: [parsedReel.normalizedUrl] }),
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

    throw new ReelProfileLookupError(
      SIMPLE_LOOKUP_ERROR_MESSAGE,
      0,
      'network_error'
    );
  }

  if (response.status === 401) {
    throw new ReelProfileLookupError(
      'Your session has expired. Please sign in again.',
      401,
      'unauthenticated'
    );
  }

  if (!response.ok) {
    throw new ReelProfileLookupError(
      SIMPLE_LOOKUP_ERROR_MESSAGE,
      response.status,
      'request_failed'
    );
  }

  let rawPayload: unknown;
  try {
    rawPayload = await response.json();
  } catch {
    throw new ReelProfileLookupError(
      SIMPLE_LOOKUP_ERROR_MESSAGE,
      502,
      'invalid_json_response'
    );
  }

  return parseJobCreatorResult(rawPayload);
}
