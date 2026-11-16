import { supabase } from '../lib/supabaseClient';
import type {
  CreatorLookupResultItem,
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

export interface ParsedCreatorInputEntry {
  submittedReelUrl: string;
  normalizedUrl: string;
  shortcode: string;
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
  entries: ParsedCreatorInputEntry[];
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
      entries: [],
      errorMessage: 'Please paste an Instagram Reel URL before searching.',
    };
  }

  const normalizedUrls: string[] = [];
  const entries: ParsedCreatorInputEntry[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const parsed = parseInstagramReelUrl(token);
    if (!parsed.valid || !parsed.normalizedUrl || !parsed.shortcode) {
      return {
        valid: false,
        urls: [],
        entries: [],
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
      entries.push({
        submittedReelUrl: token,
        normalizedUrl: parsed.normalizedUrl,
        shortcode: parsed.shortcode,
      });
    }
  }

  return {
    valid: true,
    urls: normalizedUrls,
    entries,
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

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickFirstNonEmptyString(
  sources: Array<Record<string, unknown> | null>,
  keys: string[]
): string {
  for (const src of sources) {
    if (!src) continue;
    for (const key of keys) {
      const val = src[key];
      if (typeof val === 'string' && val.trim()) {
        return val.trim();
      }
    }
  }
  return '';
}

function parseCreatorResultWithSubmittedUrl(
  rawEntry: unknown,
  fallbackSubmittedReelUrl: string,
  index: number
): CreatorLookupResultItem {
  const item = asObjectRecord(rawEntry);
  const nestedCreator = item ? asObjectRecord(item.creator) : null;

  const rawId = item && typeof item.id === 'string' && item.id.trim() ? item.id.trim() : '';
  const id = rawId || `lookup-${Date.now()}-${index}`;

  const itemReelUrl =
    item && typeof item.reelUrl === 'string' && item.reelUrl.trim()
      ? item.reelUrl.trim()
      : '';
  const submittedReelUrl = fallbackSubmittedReelUrl || itemReelUrl;

  if (!item) {
    return {
      id,
      submittedReelUrl,
      creatorUsername: null,
      instagramProfileUrl: null,
      error: SIMPLE_LOOKUP_ERROR_MESSAGE,
    };
  }

  if (typeof item.error === 'string' && item.error.trim()) {
    return {
      id,
      submittedReelUrl,
      creatorUsername: null,
      instagramProfileUrl: null,
      error: SIMPLE_LOOKUP_ERROR_MESSAGE,
    };
  }

  const rawUsername = pickFirstNonEmptyString(
    [item, nestedCreator],
    ['username', 'creatorUsername', 'creator_username']
  );
  const creatorUsername = rawUsername.replace(/^@+/, '');

  if (!creatorUsername || !INSTAGRAM_USERNAME_REGEX.test(creatorUsername)) {
    return {
      id,
      submittedReelUrl,
      creatorUsername: null,
      instagramProfileUrl: null,
      error: SIMPLE_LOOKUP_ERROR_MESSAGE,
    };
  }

  const profileName = pickFirstNonEmptyString(
    [item, nestedCreator],
    ['profileName', 'profile_name', 'fullName', 'full_name', 'displayName']
  );

  const rawProfileUrl = pickFirstNonEmptyString(
    [item, nestedCreator],
    ['profileUrl', 'instagramProfileUrl', 'profile_url', 'creatorProfileUrl']
  );

  const instagramProfileUrl =
    validateInstagramProfileUrl(rawProfileUrl) ??
    validateInstagramProfileUrl(`https://www.instagram.com/${creatorUsername}/`);

  if (!instagramProfileUrl) {
    return {
      id,
      submittedReelUrl,
      creatorUsername: null,
      instagramProfileUrl: null,
      error: SIMPLE_LOOKUP_ERROR_MESSAGE,
    };
  }

  return {
    id,
    submittedReelUrl,
    creatorUsername,
    ...(profileName ? { profileName } : {}),
    instagramProfileUrl,
  };
}

export function parseJobCreatorLookupResults(
  rawPayload: unknown,
  submittedEntries: ParsedCreatorInputEntry[] = []
): CreatorLookupResultItem[] {
  const record = asObjectRecord(rawPayload);
  const results = record && Array.isArray(record.results) ? record.results : null;
  if (!results || results.length === 0) {
    throw new ReelProfileLookupError(
      SIMPLE_LOOKUP_ERROR_MESSAGE,
      422,
      'empty_results'
    );
  }

  const usedEntryIndices = new Set<number>();

  return results.map((entry, index) => {
    const entryObj = asObjectRecord(entry);
    const rawItemReelUrl =
      entryObj && typeof entryObj.reelUrl === 'string' ? entryObj.reelUrl.trim() : '';
    const parsedItemReel = rawItemReelUrl ? parseInstagramReelUrl(rawItemReelUrl) : null;

    let matchedIdx = -1;
    if (parsedItemReel?.shortcode) {
      matchedIdx = submittedEntries.findIndex(
        (candidate, idx) =>
          !usedEntryIndices.has(idx) &&
          candidate.shortcode === parsedItemReel.shortcode
      );
    }
    if (
      matchedIdx === -1 &&
      index < submittedEntries.length &&
      !usedEntryIndices.has(index)
    ) {
      matchedIdx = index;
    }

    if (matchedIdx !== -1) {
      usedEntryIndices.add(matchedIdx);
    }

    const fallbackSubmittedUrl =
      matchedIdx !== -1
        ? submittedEntries[matchedIdx].submittedReelUrl
        : parsedItemReel?.valid && parsedItemReel.normalizedUrl
          ? parsedItemReel.normalizedUrl
          : '';

    return parseCreatorResultWithSubmittedUrl(entry, fallbackSubmittedUrl, index);
  });
}

export function parseJobCreatorResults(
  rawPayload: unknown
): ReelCreatorBatchItemResult[] {
  return parseJobCreatorLookupResults(rawPayload).map((item) => ({
    id: item.id,
    ...(item.submittedReelUrl ? { reelUrl: item.submittedReelUrl } : {}),
    creator:
      item.creatorUsername && item.instagramProfileUrl
        ? {
            id: item.id,
            ...(item.submittedReelUrl ? { reelUrl: item.submittedReelUrl } : {}),
            username: item.creatorUsername,
            ...(item.profileName ? { profileName: item.profileName } : {}),
            profileUrl: item.instagramProfileUrl,
          }
        : null,
    ...(item.error ? { error: item.error } : {}),
  }));
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

export async function lookupCreatorDetails(
  rawInputOrUrls: string | string[],
  options?: { signal?: AbortSignal }
): Promise<CreatorLookupResultItem[]> {
  const normalizedInput = Array.isArray(rawInputOrUrls)
    ? rawInputOrUrls.join('\n')
    : rawInputOrUrls;

  const parsedUrls = parseFindCreatorInputUrls(normalizedInput);
  if (!parsedUrls.valid || parsedUrls.entries.length === 0) {
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
      body: JSON.stringify({
        urls: parsedUrls.entries.map((entry) => entry.normalizedUrl),
      }),
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

  const parsedResults = parseJobCreatorLookupResults(
    rawPayload,
    parsedUrls.entries
  );
  const hasAnyCreator = parsedResults.some(
    (item) => item.creatorUsername !== null && item.instagramProfileUrl !== null
  );
  if (!hasAnyCreator) {
    throw new ReelProfileLookupError(
      SIMPLE_LOOKUP_ERROR_MESSAGE,
      422,
      'creator_lookup_failed'
    );
  }

  return parsedResults;
}

export async function lookupReelCreatorProfiles(
  rawInputOrUrls: string | string[],
  options?: { signal?: AbortSignal }
): Promise<ReelCreatorBatchItemResult[]> {
  const details = await lookupCreatorDetails(rawInputOrUrls, options);
  return details.map((item) => ({
    id: item.id,
    ...(item.submittedReelUrl ? { reelUrl: item.submittedReelUrl } : {}),
    creator:
      item.creatorUsername && item.instagramProfileUrl
        ? {
            id: item.id,
            ...(item.submittedReelUrl ? { reelUrl: item.submittedReelUrl } : {}),
            username: item.creatorUsername,
            ...(item.profileName ? { profileName: item.profileName } : {}),
            profileUrl: item.instagramProfileUrl,
          }
        : null,
    ...(item.error ? { error: item.error } : {}),
  }));
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
