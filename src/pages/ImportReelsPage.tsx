import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Copy,
  ExternalLink,
  Loader2,
  Search,
  Trash2,
  User,
} from 'lucide-react';
import { parseInstagramReelUrl } from '../services/reelDataService';
import {
  lookupCreatorDetails,
  parseFindCreatorInputUrls,
  ReelProfileLookupError,
  SIMPLE_LOOKUP_ERROR_MESSAGE,
  validateInstagramProfileUrl,
} from '../services/reelProfileService';
import type { CreatorLookupResultItem, ToastMessage } from '../types/reeldata';

interface ImportReelsPageProps {
  existingShortcodes?: Set<string>;
  onCreateImportJob?: (
    urls: { url: string; shortcode: string }[],
    sourceType: 'Manual Paste' | 'CSV Upload',
    sourceLabel: string
  ) => void;
  onCreatorLookupComplete?: () => void;
  onAddToast: (toast: Omit<ToastMessage, 'id'>) => void;
}

export function ImportReelsPage({
  onCreatorLookupComplete,
  onAddToast,
}: ImportReelsPageProps) {
  const [creatorReelUrl, setCreatorReelUrl] = useState('');
  const [lookingUpCreator, setLookingUpCreator] = useState(false);
  const [lookupStatusMessage, setLookupStatusMessage] = useState<string | null>(
    null
  );
  const [creatorLookupError, setCreatorLookupError] = useState<string | null>(
    null
  );
  const [creatorResults, setCreatorResults] = useState<
    CreatorLookupResultItem[]
  >([]);

  const lookupInFlightRef = useRef(false);
  const lookupAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      lookupAbortRef.current?.abort();
      lookupAbortRef.current = null;
      lookupInFlightRef.current = false;
    };
  }, []);

  const detectedUrlCount = useMemo(() => {
    return creatorReelUrl
      .split(/[\r\n,\s]+/)
      .map((part) => part.trim())
      .filter(Boolean).length;
  }, [creatorReelUrl]);

  const handleFindCreator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lookupInFlightRef.current || lookingUpCreator) {
      return;
    }

    const parsedInput = parseFindCreatorInputUrls(creatorReelUrl);
    if (!parsedInput.valid || parsedInput.entries.length === 0) {
      setCreatorLookupError(
        parsedInput.errorMessage ||
          'Please paste one or more valid Instagram Reel URLs (https://www.instagram.com/reel/...).'
      );
      return;
    }

    lookupInFlightRef.current = true;
    setLookingUpCreator(true);
    setLookupStatusMessage(
      `Submitting ${parsedInput.entries.length} Reel ${
        parsedInput.entries.length === 1 ? 'URL' : 'URLs'
      }...`
    );
    setCreatorLookupError(null);

    const controller = new AbortController();
    lookupAbortRef.current = controller;

    try {
      const incomingResults = await lookupCreatorDetails(creatorReelUrl, {
        signal: controller.signal,
        onStatusChange: (statusText) => {
          if (!controller.signal.aborted) {
            setLookupStatusMessage(statusText);
          }
        },
      });

      if (controller.signal.aborted) {
        return;
      }

      setCreatorResults((prev) => {
        const incomingUrls = new Set(
          incomingResults.map((item) => item.submittedReelUrl)
        );
        const preserved = prev.filter(
          (item) => !incomingUrls.has(item.submittedReelUrl)
        );
        return [...incomingResults, ...preserved];
      });
      onCreatorLookupComplete?.();
    } catch (err) {
      if (
        controller.signal.aborted ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        return;
      }

      const message =
        err instanceof ReelProfileLookupError
          ? err.message
          : SIMPLE_LOOKUP_ERROR_MESSAGE;
      setCreatorLookupError(message);
    } finally {
      if (lookupAbortRef.current === controller) {
        lookupAbortRef.current = null;
      }
      lookupInFlightRef.current = false;
      setLookingUpCreator(false);
      setLookupStatusMessage(null);
    }
  };

  const handleClearCreatorLookup = () => {
    if (lookingUpCreator) return;
    setCreatorReelUrl('');
    setCreatorLookupError(null);
    setLookupStatusMessage(null);
    setCreatorResults([]);
  };

  const handleCopyProfileLink = async (profileUrl: string) => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      onAddToast({
        type: 'info',
        title: 'Copied profile link',
        message: profileUrl,
      });
    } catch {
      // Clipboard fallback ignored cleanly
    }
  };

  const getSafeOriginalReelHref = (submittedUrl: string): string | null => {
    const direct = validateInstagramProfileUrl(submittedUrl);
    if (direct) return direct;
    const parsed = parseInstagramReelUrl(submittedUrl);
    if (parsed.valid && parsed.normalizedUrl) {
      return validateInstagramProfileUrl(parsed.normalizedUrl);
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Unified Find Reel Creator Card */}
      <section
        aria-labelledby="find-reel-creator-heading"
        className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-6 space-y-5"
      >
        <div className="space-y-1 max-w-2xl">
          <h2
            id="find-reel-creator-heading"
            className="font-display text-xl font-semibold text-slate-900 dark:text-white tracking-tight"
          >
            Find Reel Creator
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Paste one or more Instagram Reel URLs to find their creators and Instagram profile links.
          </p>
        </div>

        <form onSubmit={(e) => void handleFindCreator(e)} className="space-y-4" noValidate>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="find-creator-reel-urls"
              className="block text-sm font-semibold text-slate-900 dark:text-white"
            >
              Instagram Reel URLs (one per line)
            </label>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Detected:{' '}
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {detectedUrlCount}
              </span>{' '}
              {detectedUrlCount === 1 ? 'URL' : 'URLs'}
            </span>
          </div>

          <textarea
            id="find-creator-reel-urls"
            rows={7}
            value={creatorReelUrl}
            onChange={(e) => setCreatorReelUrl(e.target.value)}
            disabled={lookingUpCreator}
            placeholder={
              'https://www.instagram.com/reel/ABC123xyz/\nhttps://www.instagram.com/reel/DEF456xyz/\nhttps://www.instagram.com/reel/GHI789mno/'
            }
            spellCheck={false}
            autoComplete="off"
            className="w-full rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 p-4 font-mono text-[13px] leading-relaxed text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 disabled:opacity-60 resize-y transition-colors"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={handleClearCreatorLookup}
              disabled={
                lookingUpCreator ||
                (!creatorReelUrl &&
                  creatorResults.length === 0 &&
                  !creatorLookupError)
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear</span>
            </button>

            <button
              type="submit"
              disabled={lookingUpCreator}
              aria-busy={lookingUpCreator}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
            >
              {lookingUpCreator ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Find Creator</span>
                </>
              )}
            </button>
          </div>
        </form>

        {lookingUpCreator && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900 p-3.5 flex items-center gap-2.5 text-xs font-medium text-indigo-700 dark:text-indigo-300"
          >
            <Loader2 className="w-4 h-4 animate-spin shrink-0 text-indigo-600 dark:text-indigo-400" />
            <span>
              {lookupStatusMessage || 'Processing Instagram Reel URLs...'}
            </span>
          </div>
        )}

        {creatorLookupError && (
          <div
            role="alert"
            className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-3.5 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300 leading-relaxed"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            <span>{creatorLookupError}</span>
          </div>
        )}

        {creatorResults.length === 0 && !lookingUpCreator && !creatorLookupError && (
          <div className="rounded-xl bg-slate-50/70 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800 px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
            No creator lookups yet. Paste one or more Instagram Reel URLs above and click Find Creator.
          </div>
        )}

        {creatorResults.length > 0 && (
          <div className="space-y-3 pt-1">
            {creatorResults.map((item, index) => {
              const safeProfileUrl = item.instagramProfileUrl
                ? validateInstagramProfileUrl(item.instagramProfileUrl)
                : null;
              const safeReelHref = item.submittedReelUrl
                ? getSafeOriginalReelHref(item.submittedReelUrl)
                : null;

              if (!item.creatorUsername || !safeProfileUrl) {
                return (
                  <div
                    key={`${item.id}-${item.submittedReelUrl}-${index}`}
                    role="alert"
                    className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-4 flex items-start gap-3 text-xs text-rose-700 dark:text-rose-300 leading-relaxed"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                    <div className="min-w-0 space-y-1">
                      <div className="font-medium">
                        {item.error || SIMPLE_LOOKUP_ERROR_MESSAGE}
                      </div>
                      {item.submittedReelUrl && (
                        <div className="text-[11px] text-rose-600/90 dark:text-rose-400/90 break-all">
                          <span>Reel URL: </span>
                          {safeReelHref ? (
                            <a
                              href={safeReelHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-mono underline hover:text-rose-800 dark:hover:text-rose-200 break-all"
                            >
                              <span>{item.submittedReelUrl}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          ) : (
                            <span className="font-mono">
                              {item.submittedReelUrl}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={`${item.id}-${item.submittedReelUrl}-${item.creatorUsername}-${index}`}
                  className="rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/60 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      {item.profileName && (
                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {item.profileName}
                        </div>
                      )}
                      <div
                        className={`${
                          item.profileName
                            ? 'text-xs font-medium text-slate-600 dark:text-slate-300'
                            : 'text-sm font-semibold text-slate-900 dark:text-white'
                        } truncate`}
                      >
                        @{item.creatorUsername}
                      </div>
                      <div>
                        <a
                          href={safeProfileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 font-mono text-xs text-indigo-600 dark:text-indigo-400 hover:underline break-all"
                        >
                          <span>{safeProfileUrl}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </div>
                      {item.submittedReelUrl && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 break-all">
                          <span>Reel URL: </span>
                          {safeReelHref ? (
                            <a
                              href={safeReelHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline break-all"
                            >
                              <span>{item.submittedReelUrl}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          ) : (
                            <span className="font-mono text-slate-700 dark:text-slate-300">
                              {item.submittedReelUrl}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleCopyProfileLink(safeProfileUrl)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Profile Link</span>
                    </button>
                    <a
                      href={safeProfileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                    >
                      <span>Open Profile</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
