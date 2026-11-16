import { supabase } from '../lib/supabaseClient';
import type {
  ReelCreatorBatchItemResult,
  ReelCreatorProfileResult,
} from '../types/reeldata';
import { parseInstagramReelUrl } from './reelDataService';

const DEFAULT_API_BASE_URL = 'https://reeldata-api.onrender.com';
const INSTAGRAM_USERNAME_REGEX = /^[A-Za-z0-9._]{1,30}$/;
export const SIMPLE_LOOKUP_ERROR_MESSAGE =
  'Unable to find creator. Please try again.';

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

export function parseFindCreatorInputUrls(rawInput: string): {
  valid: boolean;
  urls: string[];
  errorMessage?: string;
} {
  const tokens = rawInput
    .split(/[\r\n,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return {
      valid: false,
      urls: [],
      errorMessage: 'Please paste an Instagram Reel URL before searching.',
    };
  }

  const normalizedUrls: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const parsed = parseInstagramReelUrl(token);
    if (!parsed.valid || !parsed.normalizedUrl) {
      return {
        valid: false,
        urls: [],
        errorMessage:
          tokens.length === 1
            ? parsed.errorMessage ||
              'Please enter a valid Instagram Reel URL (https://www.instagram.com/reel/...).'
            : 'Please enter valid Instagram Reel URLs (https://www.instagram.com/reel/...).',
      };
    }

    if (!seen.has(parsed.normalizedUrl)) {
      seen.add(parsed.normalizedUrl);
      normalizedUrls.push(parsed.normalizedUrl);
    }
  }

  return {
    valid: true,
    urls: normalizedUrls,
  };
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

function parseSingleResultEntry(rawEntry: unknown): ReelCreatorBatchItemResult {
  const item =
    rawEntry && typeof rawEntry === 'object' && !Array.isArray(rawEntry)
      ? (rawEntry as Record<string, unknown>)
      : null;

  if (!item) {
    return {
      creator: null,
      error: SIMPLE_LOOKUP_ERROR_MESSAGE,
    };
  }

  const id =
    typeof item.id === 'string' && item.id.trim() ? item.id.trim() : undefined;

  const parsedReel =
    typeof item.reelUrl === 'string' && item.reelUrl.trim()
      ? parseInstagramReelUrl(item.reelUrl)
      : null;
  const reelUrl =
    parsedReel && parsedReel.valid && parsedReel.normalizedUrl
      ? parsedReel.normalizedUrl
      : undefined;

  if (typeof item.error === 'string' && item.error.trim()) {
    return {
      ...(id ? { id } : {}),
      ...(reelUrl ? { reelUrl } : {}),
      creator: null,
      error: SIMPLE_LOOKUP_ERROR_MESSAGE,
    };
  }

  const username =
    typeof item.username === 'string'
      ? item.username.trim().replace(/^@+/, '')
      : '';

  if (!username || !INSTAGRAM_USERNAME_REGEX.test(username)) {
    return {
      ...(id ? { id } : {}),
      ...(reelUrl ? { reelUrl } : {}),
      creator: null,
      error: SIMPLE_LOOKUP_ERROR_MESSAGE,
    };
  }

  const profileName =
    typeof item.profileName === 'string' ? item.profileName.trim() : '';

  const profileUrl =
    validateInstagramProfileUrl(item.profileUrl) ??
    validateInstagramProfileUrl(`https://www.instagram.com/${username}/`);

  if (!profileUrl) {
    return {
      ...(id ? { id } : {}),
      ...(reelUrl ? { reelUrl } : {}),
      creator: null,
      error: SIMPLE_LOOKUP_ERROR_MESSAGE,
    };
  }

  return {
    ...(id ? { id } : {}),
    ...(reelUrl ? { reelUrl } : {}),
    creator: {
      ...(id ? { id } : {}),
      ...(reelUrl ? { reelUrl } : {}),
      username,
      ...(profileName ? { profileName } : {}),
      profileUrl,
    },
  };
}

export function parseJobCreatorResults(
  rawPayload: unknown
): ReelCreatorBatchItemResult[] {
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

  return results.map((entry) => parseSingleResultEntry(entry));
}

export function parseJobCreatorResult(
  rawPayload: unknown
): ReelCreatorProfileResult {
  const parsedResults = parseJobCreatorResults(rawPayload);
  const first = parsedResults[0];
  if (!first || !first.creator) {
    throw new ReelProfileLookupError(
      SIMPLE_LOOKUP_ERROR_MESSAGE,
      422,
      'creator_lookup_failed'
    );
  }
  return first.creator;
}

export async function lookupReelCreatorProfiles(
  rawInputOrUrls: string | string[],
  options?: { signal?: AbortSignal }
): Promise<ReelCreatorBatchItemResult[]> {
  const normalizedInput = Array.isArray(rawInputOrUrls)
    ? rawInputOrUrls.join('\n')
    : rawInputOrUrls;

  const parsedUrls = parseFindCreatorInputUrls(normalizedInput);
  if (!parsedUrls.valid || parsedUrls.urls.length === 0) {
    throw new ReelProfileLookupError(
      parsedUrls.errorMessage ||
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
      body: JSON.stringify({ urls: parsedUrls.urls }),
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

  const parsedResults = parseJobCreatorResults(rawPayload);
  const hasAnyCreator = parsedResults.some((item) => item.creator !== null);
  if (!hasAnyCreator) {
    throw new ReelProfileLookupError(
      SIMPLE_LOOKUP_ERROR_MESSAGE,
      422,
      'creator_lookup_failed'
    );
  }

  return parsedResults;
}

export async function lookupReelCreatorProfile(
  rawReelUrl: string,
  options?: { signal?: AbortSignal }
): Promise<ReelCreatorProfileResult> {
  const results = await lookupReelCreatorProfiles([rawReelUrl], options);
  const first = results[0];
  if (!first || !first.creator) {
    throw new ReelProfileLookupError(
      SIMPLE_LOOKUP_ERROR_MESSAGE,
      422,
      'creator_lookup_failed'
    );
  }
  return first.creator;
}
