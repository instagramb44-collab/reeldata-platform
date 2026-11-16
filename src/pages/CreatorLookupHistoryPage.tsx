import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Clock,
  Copy,
  ExternalLink,
  History,
  Loader2,
  RefreshCw,
  User,
} from 'lucide-react';
import { formatShortDate, parseInstagramReelUrl } from '../services/reelDataService';
import {
  fetchCreatorLookupHistory,
  ReelProfileLookupError,
  validateInstagramProfileUrl,
} from '../services/reelProfileService';
import type { CreatorLookupHistoryItem, ToastMessage } from '../types/reeldata';

interface CreatorLookupHistoryPageProps {
  refreshTrigger?: number;
  onAddToast: (toast: Omit<ToastMessage, 'id'>) => void;
}

const HISTORY_ERROR_FALLBACK =
  'Unable to load creator lookup history. Please try again.';

export function CreatorLookupHistoryPage({
  refreshTrigger = 0,
  onAddToast,
}: CreatorLookupHistoryPageProps) {
  const [items, setItems] = useState<CreatorLookupHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const loadHistory = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const historyItems = await fetchCreatorLookupHistory(200, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setItems(historyItems);
      }
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
          : HISTORY_ERROR_FALLBACK;
      setError(message);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadHistory();
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [loadHistory, refreshTrigger]);

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

  const getSafeReelHref = (reelUrl: string): string | null => {
    const direct = validateInstagramProfileUrl(reelUrl);
    if (direct) return direct;
    const parsed = parseInstagramReelUrl(reelUrl);
    if (parsed.valid && parsed.normalizedUrl) {
      return validateInstagramProfileUrl(parsed.normalizedUrl);
    }
    return null;
  };

  const formatLookupTimestamp = (isoString: string): string => {
    if (!isoString) return 'Unknown date';
    return formatShortDate(isoString);
  };

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="creator-lookup-history-heading"
        className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-6 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2
                id="creator-lookup-history-heading"
                className="font-display text-xl font-semibold text-slate-900 dark:text-white tracking-tight"
              >
                Creator Lookup History
              </h2>
              {!loading && !error && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-mono font-medium tabular-nums bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {items.length} {items.length === 1 ? 'record' : 'records'}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Saved creator lookup results with Instagram profile links, original Reel URLs, and lookup timestamps.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadHistory()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {loading && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900 p-6 flex items-center justify-center gap-3 text-sm font-medium text-indigo-700 dark:text-indigo-300"
          >
            <Loader2 className="w-5 h-5 animate-spin shrink-0 text-indigo-600 dark:text-indigo-400" />
            <span>Loading creator lookup history...</span>
          </div>
        )}

        {!loading && error && (
          <div
            role="alert"
            className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-rose-700 dark:text-rose-300"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => void loadHistory()}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Try Again</span>
            </button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="rounded-xl bg-slate-50/70 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800 px-6 py-10 text-center space-y-2">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center mx-auto">
              <History className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              No creator lookup history yet
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Saved creator lookups from Find Reel Creator will appear here automatically.
            </p>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="space-y-3">
            {items.map((item, index) => {
              const safeProfileUrl = item.profile_url
                ? validateInstagramProfileUrl(item.profile_url)
                : null;
              const safeReelHref = item.reel_url
                ? getSafeReelHref(item.reel_url)
                : null;
              const formattedDate = formatLookupTimestamp(item.created_at);
              const hasCreator = Boolean(item.creator_username && safeProfileUrl);

              if (!hasCreator) {
                return (
                  <article
                    key={`${item.id}-${index}`}
                    className="rounded-xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/80 p-4 space-y-2"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                        <div className="min-w-0 space-y-1">
                          <div className="text-xs font-semibold text-rose-800 dark:text-rose-200">
                            {item.error || 'Creator lookup did not return a profile.'}
                          </div>
                          {item.creator_username && (
                            <div className="text-xs text-rose-700 dark:text-rose-300">
                              Creator: @{item.creator_username}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="inline-flex items-center gap-1.5 text-[11px] text-rose-600/90 dark:text-rose-400/90 whitespace-nowrap shrink-0">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>{formattedDate}</span>
                      </div>
                    </div>

                    {item.reel_url && (
                      <div className="text-[11px] text-rose-700/90 dark:text-rose-300/90 break-all pl-6.5">
                        <span>Reel URL: </span>
                        {safeReelHref ? (
                          <a
                            href={safeReelHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono underline hover:text-rose-900 dark:hover:text-rose-100 break-all"
                          >
                            <span>{item.reel_url}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        ) : (
                          <span className="font-mono">{item.reel_url}</span>
                        )}
                      </div>
                    )}
                  </article>
                );
              }

              return (
                <article
                  key={`${item.id}-${index}`}
                  className="rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/60 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-4 h-4" />
                    </div>

                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {item.profile_name && (
                          <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {item.profile_name}
                          </span>
                        )}
                        <span
                          className={`${
                            item.profile_name
                              ? 'text-xs font-medium text-slate-600 dark:text-slate-300'
                              : 'text-sm font-semibold text-slate-900 dark:text-white'
                          } truncate`}
                        >
                          @{item.creator_username}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>{formattedDate}</span>
                        </span>
                      </div>

                      {safeProfileUrl && (
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
                      )}

                      {item.reel_url && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 break-all">
                          <span>Reel URL: </span>
                          {safeReelHref ? (
                            <a
                              href={safeReelHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline break-all"
                            >
                              <span>{item.reel_url}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          ) : (
                            <span className="font-mono text-slate-700 dark:text-slate-300">
                              {item.reel_url}
                            </span>
                          )}
                        </div>
                      )}

                      {item.error && (
                        <div className="inline-flex items-start gap-1.5 text-xs text-rose-700 dark:text-rose-300 pt-0.5">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                          <span>{item.error}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {safeProfileUrl && (
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
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
