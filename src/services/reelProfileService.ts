import { supabase } from '../lib/supabaseClient';
import type {
  CreatorLookupHistoryItem,
  CreatorLookupResultItem,
  ReelCreatorBatchItemResult,
  ReelCreatorProfileResult,
} from '../types/reeldata';
import { parseInstagramReelUrl } from './reelDataService';

const DEFAULT_API_BASE_URL = 'https://reeldata-api.onrender.com';
const INSTAGRAM_USERNAME_REGEX = /^[A-Za-z0-9._]{1,30}$/;
export const SIMPLE_LOOKUP_ERROR_MESSAGE =
  'Unable to find creator. Please try again.';

const JOB_POLL_INTERVAL_MS = 1500;
const JOB_POLL_TIMEOUT_MS = 90_000;

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

export interface InvalidCreatorInputEntry {
  submittedReelUrl: string;
  error: string;
}

export function parseFindCreatorInputUrls(rawInput: string): {
  valid: boolean;
  urls: string[];
  entries: ParsedCreatorInputEntry[];
  invalidEntries: InvalidCreatorInputEntry[];
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
      invalidEntries: [],
      errorMessage: 'Please paste one or more Instagram Reel URLs before searching.',
    };
  }

  const normalizedUrls: string[] = [];
  const entries: ParsedCreatorInputEntry[] = [];
  const invalidEntries: InvalidCreatorInputEntry[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const parsed = parseInstagramReelUrl(token);
    if (!parsed.valid || !parsed.normalizedUrl || !parsed.shortcode) {
      invalidEntries.push({
        submittedReelUrl: token,
        error:
          parsed.errorMessage ||
          'Please enter a valid Instagram Reel URL (https://www.instagram.com/reel/...).',
      });
      continue;
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

  if (entries.length === 0) {
    return {
      valid: false,
      urls: [],
      entries: [],
      invalidEntries,
      errorMessage:
        invalidEntries[0]?.error ||
        'Please enter a valid Instagram Reel URL (https://www.instagram.com/reel/...).',
    };
  }

  return {
    valid: true,
    urls: normalizedUrls,
    entries,
    invalidEntries,
  };
}

async function getLatestAccessToken(): Promise<string> {
  if (!supabase) {
    throw new ReelProfileLookupError(
      'Supabase authentication is not configured.',
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

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === 'AbortError') ||
    (typeof DOMException !== 'undefined' &&
      err instanceof DOMException &&
      err.name === 'AbortError')
  );
}

function isHtmlBody(contentType: string, text: string): boolean {
  if (
    contentType.includes('text/html') ||
    contentType.includes('application/xhtml+xml')
  ) {
    return true;
  }
  const normalized = text.trim().toLowerCase();
  return (
    normalized.startsWith('<!doctype') ||
    normalized.startsWith('<html') ||
    normalized.startsWith('<head') ||
    normalized.startsWith('<body')
  );
}

const SENSITIVE_KEY_PATTERN =
  /password|token|secret|authorization|cookie|credential/i;

function extractBackendErrorString(value: unknown, depth = 0): string {
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
      .map((item) => extractBackendErrorString(item, depth + 1))
      .filter(Boolean)
      .join('; ');
  }
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    for (const key of ['error', 'message', 'detail', 'details', 'reason']) {
      if (key in rec && !SENSITIVE_KEY_PATTERN.test(key)) {
        const extracted = extractBackendErrorString(rec[key], depth + 1);
        if (extracted) {
          return extracted;
        }
      }
    }
  }
  return '';
}

async function parseResponseErrorMessage(response: Response): Promise<string> {
  const status = response.status;
  let detail = '';

  try {
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json')) {
      const jsonBody: unknown = await response.json();
      detail = extractBackendErrorString(jsonBody).slice(0, 300);
    } else {
      const text = await response.text();
      if (text.trim() && !isHtmlBody(contentType, text)) {
        detail = text.trim().slice(0, 300);
      }
    }
  } catch {
    // Fall back to HTTP status text below
  }

  if (status === 401) {
    return detail || 'Your session has expired. Please sign in again.';
  }

  if (!detail) {
    detail = response.statusText
      ? `Backend request failed (${response.statusText}).`
      : 'Backend request failed.';
  }

  const prefix = `[HTTP ${status}]`;
  return detail.startsWith(prefix) ? detail : `${prefix} ${detail}`;
}

async function fetchJsonWithAuth(
  url: string,
  init: RequestInit,
  signal?: AbortSignal
): Promise<unknown> {
  const accessToken = await getLatestAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
      signal,
    });
  } catch (err) {
    if (isAbortError(err)) {
      throw err;
    }

    const detail =
      err instanceof Error && err.message ? err.message : 'Network or CORS error';
    throw new ReelProfileLookupError(
      `Unable to reach ReelData backend API (${detail}).`,
      0,
      'network_error'
    );
  }

  if (response.status === 401) {
    const msg = await parseResponseErrorMessage(response);
    throw new ReelProfileLookupError(msg, 401, 'unauthenticated');
  }

  if (!response.ok) {
    const msg = await parseResponseErrorMessage(response);
    throw new ReelProfileLookupError(msg, response.status, 'request_failed');
  }

  try {
    return await response.json();
  } catch {
    throw new ReelProfileLookupError(
      `[HTTP ${response.status}] Backend returned an invalid JSON response.`,
      502,
      'invalid_json_response'
    );
  }
}

function extractResultsArray(rawPayload: unknown): unknown[] | null {
  if (Array.isArray(rawPayload)) {
    return rawPayload;
  }

  const record = asObjectRecord(rawPayload);
  if (!record) {
    return null;
  }

  if (Array.isArray(record.results)) {
    return record.results;
  }
  if (Array.isArray(record.items)) {
    return record.items;
  }

  const dataRecord = asObjectRecord(record.data);
  if (dataRecord) {
    if (Array.isArray(dataRecord.results)) {
      return dataRecord.results;
    }
    if (Array.isArray(dataRecord.items)) {
      return dataRecord.items;
    }
  }

  const jobRecord = asObjectRecord(record.job);
  if (jobRecord && Array.isArray(jobRecord.results)) {
    return jobRecord.results;
  }

  // Handle direct single-creator payloads if returned directly
  if (
    typeof record.username === 'string' ||
    typeof record.creatorUsername === 'string' ||
    asObjectRecord(record.creator)
  ) {
    return [record];
  }

  return null;
}

function parseCreatorResultWithSubmittedUrl(
  rawEntry: unknown,
  fallbackSubmittedReelUrl: string,
  index: number
): CreatorLookupResultItem {
  const item = asObjectRecord(rawEntry);
  const nestedCreator = item ? asObjectRecord(item.creator) : null;

  const rawId =
    item && typeof item.id === 'string' && item.id.trim() ? item.id.trim() : '';
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
      error: 'Backend returned an invalid creator result entry.',
    };
  }

  if (typeof item.error === 'string' && item.error.trim()) {
    return {
      id,
      submittedReelUrl,
      creatorUsername: null,
      instagramProfileUrl: null,
      error: item.error.trim(),
    };
  }

  const rawUsername = pickFirstNonEmptyString(
    [item, nestedCreator],
    ['username', 'creatorUsername', 'creator_username', 'handle']
  );
  const creatorUsername = rawUsername.replace(/^@+/, '');

  if (!creatorUsername || !INSTAGRAM_USERNAME_REGEX.test(creatorUsername)) {
    return {
      id,
      submittedReelUrl,
      creatorUsername: null,
      instagramProfileUrl: null,
      error: 'Backend did not return a creator username for this Reel.',
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
      error: 'Backend returned an invalid Instagram profile URL.',
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
  const results = extractResultsArray(rawPayload);
  if (!results || results.length === 0) {
    const backendError = extractBackendErrorString(rawPayload);
    throw new ReelProfileLookupError(
      backendError || 'Backend returned an empty results list.',
      422,
      'empty_results'
    );
  }

  const usedEntryIndices = new Set<number>();

  return results.map((entry, index) => {
    const entryObj = asObjectRecord(entry);
    const rawItemReelUrl =
      entryObj && typeof entryObj.reelUrl === 'string'
        ? entryObj.reelUrl.trim()
        : '';
    const parsedItemReel = rawItemReelUrl
      ? parseInstagramReelUrl(rawItemReelUrl)
      : null;

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
            ...(item.submittedReelUrl
              ? { reelUrl: item.submittedReelUrl }
              : {}),
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
      first?.error || SIMPLE_LOOKUP_ERROR_MESSAGE,
      422,
      'creator_lookup_failed'
    );
  }
  return first.creator;
}

function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

function extractJobMetadata(rawPayload: unknown): {
  jobId: string;
  status: string;
  errorMessage: string;
} {
  const record = asObjectRecord(rawPayload);
  const jobRecord = record ? asObjectRecord(record.job) : null;
  const dataRecord = record ? asObjectRecord(record.data) : null;

  const jobId = pickFirstNonEmptyString(
    [record, jobRecord, dataRecord],
    ['jobId', 'id']
  );
  const status = pickFirstNonEmptyString(
    [record, jobRecord, dataRecord],
    ['status', 'state']
  ).toLowerCase();
  const errorMessage = pickFirstNonEmptyString(
    [record, jobRecord, dataRecord],
    ['error', 'message', 'reason', 'detail']
  );

  return { jobId, status, errorMessage };
}

function isCompletedJobStatus(status: string): boolean {
  return (
    status === 'completed' ||
    status === 'complete' ||
    status === 'done' ||
    status === 'succeeded' ||
    status === 'success'
  );
}

function isFailedJobStatus(status: string): boolean {
  return (
    status === 'failed' ||
    status === 'error' ||
    status === 'cancelled' ||
    status === 'canceled'
  );
}

async function pollJobUntilComplete(
  baseUrl: string,
  jobId: string,
  submittedEntries: ParsedCreatorInputEntry[],
  signal?: AbortSignal
): Promise<CreatorLookupResultItem[]> {
  const startedAt = Date.now();
  const encodedJobId = encodeURIComponent(jobId);

  while (Date.now() - startedAt < JOB_POLL_TIMEOUT_MS) {
    await sleepWithSignal(JOB_POLL_INTERVAL_MS, signal);

    const statusPayload = await fetchJsonWithAuth(
      `${baseUrl}/api/jobs/${encodedJobId}`,
      { method: 'GET', cache: 'no-store' },
      signal
    );

    const meta = extractJobMetadata(statusPayload);
    const inlineResults = extractResultsArray(statusPayload);

    if (isFailedJobStatus(meta.status)) {
      throw new ReelProfileLookupError(
        meta.errorMessage || 'Creator lookup job failed on backend.',
        502,
        'job_failed'
      );
    }

    if (inlineResults && inlineResults.length > 0) {
      return parseJobCreatorLookupResults(
        { results: inlineResults },
        submittedEntries
      );
    }

    if (isCompletedJobStatus(meta.status)) {
      const resultsPayload = await fetchJsonWithAuth(
        `${baseUrl}/api/jobs/${encodedJobId}/results`,
        { method: 'GET', cache: 'no-store' },
        signal
      );
      return parseJobCreatorLookupResults(resultsPayload, submittedEntries);
    }
  }

  throw new ReelProfileLookupError(
    'Creator lookup timed out before the backend job finished.',
    504,
    'job_timeout'
  );
}

export async function lookupCreatorDetails(
  rawInputOrUrls: string | string[],
  options?: {
    signal?: AbortSignal;
    onStatusChange?: (statusMessage: string) => void;
  }
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

  const invalidItems: CreatorLookupResultItem[] = parsedUrls.invalidEntries.map(
    (entry, idx) => ({
      id: `invalid-${Date.now()}-${idx}`,
      submittedReelUrl: entry.submittedReelUrl,
      creatorUsername: null,
      instagramProfileUrl: null,
      error: entry.error,
    })
  );

  const baseUrl = getReelDataApiBaseUrl();
  options?.onStatusChange?.(
    `Submitting ${parsedUrls.entries.length} Reel ${
      parsedUrls.entries.length === 1 ? 'URL' : 'URLs'
    }...`
  );

  const rawPayload = await fetchJsonWithAuth(
    `${baseUrl}/api/jobs`,
    {
      method: 'POST',
      body: JSON.stringify({
        urls: parsedUrls.entries.map((entry) => entry.normalizedUrl),
      }),
    },
    options?.signal
  );

  // 1. Immediate synchronous results[] returned by POST /api/jobs
  const immediateResults = extractResultsArray(rawPayload);
  if (immediateResults && immediateResults.length > 0) {
    const backendItems = parseJobCreatorLookupResults(
      { results: immediateResults },
      parsedUrls.entries
    );
    return [...backendItems, ...invalidItems];
  }

  // 2. Asynchronous job queued/processing response with jobId
  const meta = extractJobMetadata(rawPayload);
  if (isFailedJobStatus(meta.status)) {
    throw new ReelProfileLookupError(
      meta.errorMessage || 'Creator lookup job failed.',
      502,
      'job_failed'
    );
  }

  if (meta.jobId) {
    options?.onStatusChange?.(
      `Processing ${parsedUrls.entries.length} Reel ${
        parsedUrls.entries.length === 1 ? 'URL' : 'URLs'
      }...`
    );
    const backendItems = await pollJobUntilComplete(
      baseUrl,
      meta.jobId,
      parsedUrls.entries,
      options?.signal
    );
    return [...backendItems, ...invalidItems];
  }

  // 3. Unexpected empty or error response without results or jobId
  throw new ReelProfileLookupError(
    meta.errorMessage || 'Backend returned neither creator results nor a job ID.',
    502,
    'unexpected_response'
  );
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
            ...(item.submittedReelUrl
              ? { reelUrl: item.submittedReelUrl }
              : {}),
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
      first?.error || SIMPLE_LOOKUP_ERROR_MESSAGE,
      422,
      'creator_lookup_failed'
    );
  }
  return first.creator;
}

export function parseCreatorLookupHistoryResponse(
  rawPayload: unknown
): CreatorLookupHistoryItem[] {
  const record = asObjectRecord(rawPayload);
  if (!record || !Array.isArray(record.items)) {
    throw new ReelProfileLookupError(
      'Backend returned an invalid creator lookup history response.',
      502,
      'invalid_history_response'
    );
  }

  return record.items.map((rawItem, index) => {
    const entry = asObjectRecord(rawItem) ?? {};
    const idRaw =
      typeof entry.id === 'string' && entry.id.trim()
        ? entry.id.trim()
        : typeof entry.id === 'number'
          ? String(entry.id)
          : `history-${index}`;

    const batchId =
      typeof entry.batch_id === 'string' && entry.batch_id.trim()
        ? entry.batch_id.trim()
        : null;

    const reelUrl =
      typeof entry.reel_url === 'string' ? entry.reel_url.trim() : '';

    const rawUsername =
      typeof entry.creator_username === 'string'
        ? entry.creator_username.trim().replace(/^@+/, '')
        : '';
    const creatorUsername =
      rawUsername && INSTAGRAM_USERNAME_REGEX.test(rawUsername)
        ? rawUsername
        : null;

    const profileName =
      typeof entry.profile_name === 'string' && entry.profile_name.trim()
        ? entry.profile_name.trim()
        : null;

    const rawProfileUrl =
      typeof entry.profile_url === 'string' ? entry.profile_url.trim() : '';
    const validatedProfileUrl =
      validateInstagramProfileUrl(rawProfileUrl) ??
      (creatorUsername
        ? validateInstagramProfileUrl(
            `https://www.instagram.com/${creatorUsername}/`
          )
        : null);

    const error =
      typeof entry.error === 'string' && entry.error.trim()
        ? entry.error.trim()
        : null;

    const createdAt =
      typeof entry.created_at === 'string' ? entry.created_at.trim() : '';

    return {
      id: idRaw,
      batch_id: batchId,
      reel_url: reelUrl,
      creator_username: creatorUsername,
      profile_name: profileName,
      profile_url: validatedProfileUrl,
      error,
      created_at: createdAt,
    };
  });
}

export async function fetchCreatorLookupHistory(
  limit = 200,
  options?: { signal?: AbortSignal }
): Promise<CreatorLookupHistoryItem[]> {
  const safeLimit =
    Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 200;
  const baseUrl = getReelDataApiBaseUrl();
  const rawPayload = await fetchJsonWithAuth(
    `${baseUrl}/api/creator-lookups/history?limit=${encodeURIComponent(String(safeLimit))}`,
    {
      method: 'GET',
      cache: 'no-store',
    },
    options?.signal
  );

  return parseCreatorLookupHistoryResponse(rawPayload);
}
