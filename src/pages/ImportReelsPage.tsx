import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Filter,
  Link2,
  Search,
  Sparkles,
  Trash2,
  Upload,
  UploadCloud,
  User,
  X,
} from 'lucide-react';
import {
  formatFileSize,
  parseCsvLocally,
  SAMPLE_CSV_CONTENT,
  SAMPLE_MANUAL_URLS,
  triggerCsvDownload,
  validateBulkUrls,
} from '../services/reelDataService';
import {
  lookupReelCreatorProfiles,
  parseFindCreatorInputUrls,
  ReelProfileLookupError,
  SIMPLE_LOOKUP_ERROR_MESSAGE,
  validateInstagramProfileUrl,
} from '../services/reelProfileService';
import type {
  CsvParseResult,
  ParsedUrlResult,
  ReelCreatorBatchItemResult,
  ToastMessage,
} from '../types/reeldata';

interface ImportReelsPageProps {
  existingShortcodes: Set<string>;
  onCreateImportJob: (
    urls: { url: string; shortcode: string }[],
    sourceType: 'Manual Paste' | 'CSV Upload',
    sourceLabel: string
  ) => void;
  onAddToast: (toast: Omit<ToastMessage, 'id'>) => void;
}

type ImportTab = 'manual' | 'csv';
type ValidationFilter = 'all' | 'valid' | 'duplicate' | 'invalid';

export function ImportReelsPage({
  existingShortcodes,
  onCreateImportJob,
  onAddToast,
}: ImportReelsPageProps) {
  const [activeTab, setActiveTab] = useState<ImportTab>('manual');

  // TAB A: Manual Import state
  const [rawText, setRawText] = useState('');
  const [manualFilter, setManualFilter] = useState<ValidationFilter>('all');
  const [hasExplicitlyValidated, setHasExplicitlyValidated] = useState(false);

  // TAB B: CSV Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [csvResult, setCsvResult] = useState<CsvParseResult | null>(null);
  const [csvFilter, setCsvFilter] = useState<ValidationFilter>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Single or Multi Reel Creator Lookup state
  const [creatorReelUrl, setCreatorReelUrl] = useState('');
  const [lookingUpCreator, setLookingUpCreator] = useState(false);
  const [creatorLookupError, setCreatorLookupError] = useState<string | null>(null);
  const [creatorResults, setCreatorResults] = useState<ReelCreatorBatchItemResult[]>([]);
  const lookupInFlightRef = useRef(false);
  const lookupAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      lookupAbortRef.current?.abort();
      lookupAbortRef.current = null;
      lookupInFlightRef.current = false;
    };
  }, []);

  const manualAnalysis = useMemo(() => validateBulkUrls(rawText), [rawText]);

  const filteredManualResults = useMemo(() => {
    if (manualFilter === 'all') return manualAnalysis.results;
    return manualAnalysis.results.filter((r) => r.status === manualFilter);
  }, [manualAnalysis.results, manualFilter]);

  const filteredCsvRows = useMemo(() => {
    if (!csvResult) return [];
    if (csvFilter === 'all') return csvResult.rows;
    return csvResult.rows.filter((r) => r.status === csvFilter);
  }, [csvResult, csvFilter]);

  const handleLoadManualExample = () => {
    setRawText(SAMPLE_MANUAL_URLS);
    setHasExplicitlyValidated(true);
    setManualFilter('all');
    onAddToast({
      type: 'info',
      title: 'Example URLs loaded',
      message: '3 sample Instagram Reel URLs added for validation.',
    });
  };

  const handleValidateManual = () => {
    if (!rawText.trim()) {
      onAddToast({
        type: 'warning',
        title: 'No URLs to validate',
        message: 'Paste at least one Instagram Reel URL first.',
      });
      return;
    }
    setHasExplicitlyValidated(true);
    if (manualAnalysis.invalidCount === 0 && manualAnalysis.duplicateCount === 0) {
      onAddToast({
        type: 'success',
        title: `All ${manualAnalysis.validCount} URLs valid`,
        message: 'Shortcodes extracted and ready to import.',
      });
    } else {
      onAddToast({
        type: 'info',
        title: 'Validation complete',
        message: `${manualAnalysis.validCount} valid, ${manualAnalysis.duplicateCount} duplicates, ${manualAnalysis.invalidCount} invalid.`,
      });
    }
  };

  const handleCleanManualToValidOnly = () => {
    const validLines = manualAnalysis.results
      .filter((r) => r.status === 'valid' && r.normalizedUrl)
      .map((r) => r.normalizedUrl as string);
    setRawText(validLines.join('\n'));
    setManualFilter('all');
    onAddToast({
      type: 'success',
      title: 'Cleaned URL list',
      message: `Kept ${validLines.length} unique valid Reel URLs.`,
    });
  };

  const handleClearManual = () => {
    setRawText('');
    setHasExplicitlyValidated(false);
    setManualFilter('all');
  };

  const handleImportManual = () => {
    const validItems = manualAnalysis.results
      .filter((r) => r.status === 'valid' && r.normalizedUrl && r.shortcode)
      .map((r) => ({
        url: r.normalizedUrl as string,
        shortcode: r.shortcode as string,
      }));

    if (validItems.length === 0) {
      onAddToast({
        type: 'error',
        title: 'Cannot import batch',
        message: 'Add at least one valid Instagram Reel URL before importing.',
      });
      return;
    }

    onCreateImportJob(
      validItems,
      'Manual Paste',
      `Manual Batch (${validItems.length} ${validItems.length === 1 ? 'URL' : 'URLs'})`
    );
    setRawText('');
    setHasExplicitlyValidated(false);
    setManualFilter('all');
  };

  const processCsvFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      onAddToast({
        type: 'error',
        title: 'Unsupported file format',
        message: 'Please select a .csv file.',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      const parsed = parseCsvLocally(file.name, file.size, content);
      setCsvResult(parsed);
      setCsvFilter('all');

      if (parsed.error) {
        onAddToast({
          type: 'error',
          title: 'CSV validation error',
          message: parsed.error,
        });
      } else {
        onAddToast({
          type: 'success',
          title: 'CSV parsed locally',
          message: `${parsed.totalRows} rows inspected (${parsed.validCount} valid, ${parsed.invalidCount} invalid, ${parsed.duplicateCount} duplicates).`,
        });
      }
    };
    reader.onerror = () => {
      onAddToast({
        type: 'error',
        title: 'Could not read file',
        message: 'Local file read failed. Please try selecting the CSV again.',
      });
    };
    reader.readAsText(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processCsvFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processCsvFile(file);
    }
  };

  const handleDownloadSampleCsv = () => {
    triggerCsvDownload('reeldata_sample.csv', SAMPLE_CSV_CONTENT);
    onAddToast({
      type: 'success',
      title: 'Sample CSV downloaded',
      message: 'Includes valid reel_url rows, an invalid /p/ post example, and a duplicate row.',
    });
  };

  const handleRemoveCsvFile = () => {
    setCsvResult(null);
    setCsvFilter('all');
  };

  const handleImportCsv = () => {
    if (!csvResult || csvResult.validCount === 0) {
      onAddToast({
        type: 'error',
        title: 'No valid URLs in CSV',
        message: 'Ensure the CSV has a reel_url or url column with valid Instagram Reel URLs.',
      });
      return;
    }

    const validItems = csvResult.rows
      .filter((r) => r.status === 'valid' && r.normalizedUrl && r.shortcode)
      .map((r) => ({
        url: r.normalizedUrl as string,
        shortcode: r.shortcode as string,
      }));

    onCreateImportJob(validItems, 'CSV Upload', csvResult.fileName);
    setCsvResult(null);
    setCsvFilter('all');
  };

  const handleCopyShortcode = async (shortcode: string) => {
    try {
      await navigator.clipboard.writeText(shortcode);
      onAddToast({
        type: 'info',
        title: 'Copied shortcode',
        message: shortcode,
      });
    } catch {
      // Clipboard fallback ignored cleanly
    }
  };

  const submitCreatorLookup = async () => {
    if (lookupInFlightRef.current || lookingUpCreator) {
      return;
    }

    const parsedInput = parseFindCreatorInputUrls(creatorReelUrl);
    if (!parsedInput.valid || parsedInput.urls.length === 0) {
      setCreatorLookupError(
        parsedInput.errorMessage ||
          'Please enter a valid Instagram Reel URL (https://www.instagram.com/reel/...).'
      );
      setCreatorResults([]);
      return;
    }

    lookupInFlightRef.current = true;
    setLookingUpCreator(true);
    setCreatorLookupError(null);
    setCreatorResults([]);

    const controller = new AbortController();
    lookupAbortRef.current = controller;

    try {
      const results = await lookupReelCreatorProfiles(parsedInput.urls, {
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        return;
      }

      setCreatorResults(results);
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
    }
  };

  const handleFindCreator = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitCreatorLookup();
  };

  const handleClearCreatorLookup = () => {
    if (lookingUpCreator) return;
    setCreatorReelUrl('');
    setCreatorLookupError(null);
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

  const renderStatusPill = (row: ParsedUrlResult) => {
    if (row.status === 'valid') {
      const alreadyInWorkspace = row.shortcode ? existingShortcodes.has(row.shortcode) : false;
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-800/60 px-2.5 py-0.5 rounded-md whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>{alreadyInWorkspace ? 'Valid (Seen Before)' : 'Valid'}</span>
        </span>
      );
    }
    if (row.status === 'duplicate') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/60 px-2.5 py-0.5 rounded-md whitespace-nowrap">
          <Filter className="w-3.5 h-3.5 shrink-0" />
          <span>Duplicate</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border border-rose-200/80 dark:border-rose-800/60 px-2.5 py-0.5 rounded-md whitespace-nowrap">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        <span>Invalid</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Intro & Tabs Header */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium text-indigo-600 dark:text-indigo-400">
                Local Browser Validation
              </span>
              <span aria-hidden="true">·</span>
              <span>Extracts Reel shortcodes & creates simulated processing jobs</span>
            </div>
            <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
              Import Instagram Reel URLs
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Paste URLs manually or inspect a local CSV file before queuing a batch. Invalid links and duplicates are surfaced for review and never silently discarded.
            </p>
          </div>

          {/* Segmented Tab Switcher */}
          <div
            role="tablist"
            aria-label="Import method"
            className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700/70 self-start md:self-auto shrink-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'manual'}
              onClick={() => setActiveTab('manual')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'manual'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Link2 className="w-4 h-4" />
              <span>Manual Import</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'csv'}
              onClick={() => setActiveTab('csv')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'csv'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>CSV Upload</span>
            </button>
          </div>
        </div>
      </div>

      {/* Find Reel Creator Lookup Card */}
      <section
        aria-labelledby="find-reel-creator-heading"
        className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3
              id="find-reel-creator-heading"
              className="font-display text-base font-semibold text-slate-900 dark:text-white"
            >
              Find Reel Creator
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Paste one or more Instagram Reel URLs to look up the creator&apos;s username and Instagram profile link.
            </p>
          </div>
          {(creatorReelUrl || creatorResults.length > 0 || creatorLookupError) &&
            !lookingUpCreator && (
              <button
                type="button"
                onClick={handleClearCreatorLookup}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 self-start sm:self-auto transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
        </div>

        <form
          onSubmit={(e) => void handleFindCreator(e)}
          className="flex flex-col sm:flex-row sm:items-start gap-2.5"
          noValidate
        >
          <label htmlFor="find-creator-reel-url" className="sr-only">
            Instagram Reel URLs
          </label>
          <textarea
            id="find-creator-reel-url"
            rows={creatorReelUrl.includes('\n') ? 3 : 1}
            value={creatorReelUrl}
            onChange={(e) => setCreatorReelUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submitCreatorLookup();
              }
            }}
            disabled={lookingUpCreator}
            placeholder="https://www.instagram.com/reel/..."
            spellCheck={false}
            autoComplete="off"
            className="flex-1 min-h-10 px-3.5 py-[9px] leading-5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 font-mono text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 disabled:opacity-60 transition-colors resize-none"
          />
          <button
            type="submit"
            disabled={lookingUpCreator}
            className="inline-flex items-center justify-center gap-2 px-4 h-10 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
          >
            <Search className="w-4 h-4" />
            <span>Find Creator</span>
          </button>
        </form>

        {creatorLookupError && (
          <div
            role="alert"
            className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-3.5 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300 leading-relaxed"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            <span>{creatorLookupError}</span>
          </div>
        )}

        {creatorResults.length > 0 && (
          <div className="space-y-2.5">
            {creatorResults.map((item, index) => {
              const profile = item.creator;
              const safeProfileUrl = profile
                ? validateInstagramProfileUrl(profile.profileUrl)
                : null;

              if (!profile || !safeProfileUrl) {
                return (
                  <div
                    key={item.id ?? item.reelUrl ?? `creator-err-${index}`}
                    role="alert"
                    className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-3.5 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300 leading-relaxed"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                    <div className="min-w-0 space-y-0.5">
                      <div>{SIMPLE_LOOKUP_ERROR_MESSAGE}</div>
                      {creatorResults.length > 1 && item.reelUrl && (
                        <div className="font-mono text-[11px] text-rose-600/80 dark:text-rose-400/80 break-all">
                          {item.reelUrl}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={item.id ?? item.reelUrl ?? `creator-${profile.username}-${index}`}
                  className="rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/60 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      {profile.profileName && (
                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {profile.profileName}
                        </div>
                      )}
                      <div
                        className={`${
                          profile.profileName
                            ? 'text-xs font-medium text-slate-600 dark:text-slate-300'
                            : 'text-sm font-semibold text-slate-900 dark:text-white'
                        } truncate`}
                      >
                        @{profile.username}
                      </div>
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

      {/* TAB A: MANUAL IMPORT */}
      {activeTab === 'manual' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left 7 Columns: Multiline Input & Actions */}
          <div className="xl:col-span-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <label
                  htmlFor="manual-urls-input"
                  className="block text-sm font-semibold text-slate-900 dark:text-white"
                >
                  Instagram Reel URLs (one per line)
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Detected:{' '}
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                    {manualAnalysis.detectedCount}
                  </span>{' '}
                  {manualAnalysis.detectedCount === 1 ? 'URL' : 'URLs'}
                  {manualAnalysis.detectedCount > 0 && (
                    <>
                      {' '}
                      ·{' '}
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">
                        {manualAnalysis.validCount} valid
                      </span>
                      {manualAnalysis.duplicateCount > 0 && (
                        <>
                          {' '}
                          ·{' '}
                          <span className="text-amber-600 dark:text-amber-400 font-medium tabular-nums">
                            {manualAnalysis.duplicateCount} duplicates
                          </span>
                        </>
                      )}
                      {manualAnalysis.invalidCount > 0 && (
                        <>
                          {' '}
                          ·{' '}
                          <span className="text-rose-600 dark:text-rose-400 font-medium tabular-nums">
                            {manualAnalysis.invalidCount} invalid
                          </span>
                        </>
                      )}
                    </>
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={handleLoadManualExample}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                <span>Load Example URLs</span>
              </button>
            </div>

            <textarea
              id="manual-urls-input"
              rows={11}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste Instagram Reel URLs here..."
              spellCheck={false}
              className="w-full rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 p-4 font-mono text-[13px] leading-relaxed text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 resize-y transition-colors"
            />

            {/* Example Format Guide */}
            <div className="rounded-xl bg-slate-50/80 dark:bg-slate-950/50 border border-slate-200/70 dark:border-slate-800 px-4 py-3">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Example format (one URL per line):
              </p>
              <div className="font-mono text-xs text-slate-500 dark:text-slate-400 space-y-0.5 select-all">
                <div>https://www.instagram.com/reel/ABC123xyz/</div>
                <div>https://www.instagram.com/reel/DEF456xyz/</div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleClearManual}
                  disabled={!rawText}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Clear All</span>
                </button>
                <button
                  type="button"
                  onClick={handleValidateManual}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Validate URLs</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleImportManual}
                disabled={manualAnalysis.validCount === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-600/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all whitespace-nowrap shrink-0"
              >
                <UploadCloud className="w-4 h-4" />
                <span>
                  Import Reels
                  {manualAnalysis.validCount > 0 ? ` (${manualAnalysis.validCount})` : ''}
                </span>
              </button>
            </div>
          </div>

          {/* Right 5 Columns: Live Validation Inspector */}
          <div className="xl:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Validation & shortcode inspector
                </h3>
                {(manualAnalysis.duplicateCount > 0 || manualAnalysis.invalidCount > 0) &&
                  manualAnalysis.validCount > 0 && (
                    <button
                      type="button"
                      onClick={handleCleanManualToValidOnly}
                      className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 whitespace-nowrap"
                    >
                      Keep valid only
                    </button>
                  )}
              </div>

              {/* Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
                {(
                  [
                    { id: 'all', label: 'All', count: manualAnalysis.detectedCount },
                    { id: 'valid', label: 'Valid', count: manualAnalysis.validCount },
                    { id: 'duplicate', label: 'Duplicates', count: manualAnalysis.duplicateCount },
                    { id: 'invalid', label: 'Invalid', count: manualAnalysis.invalidCount },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setManualFilter(tab.id)}
                    className={`flex-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap tabular-nums ${
                      manualFilter === tab.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>
            </div>

            {manualAnalysis.results.length === 0 ? (
              <div className="px-6 py-12 text-center space-y-2">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                  <Link2 className="w-5 h-5" />
                </div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {hasExplicitlyValidated ? 'No URLs detected' : 'Waiting for Reel URLs'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
                  Paste URLs on the left to inspect extracted shortcodes, duplicate lines, and format errors in real time.
                </p>
              </div>
            ) : filteredManualResults.length === 0 ? (
              <div className="px-6 py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                No URLs match the &ldquo;{manualFilter}&rdquo; filter.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[460px] overflow-y-auto">
                {filteredManualResults.map((item) => (
                  <div key={item.id} className="px-5 py-3.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono text-slate-400 tabular-nums">
                        Line {item.lineNumber}
                      </span>
                      {renderStatusPill(item)}
                    </div>

                    <p className="font-mono text-xs text-slate-800 dark:text-slate-200 break-all">
                      {item.rawInput}
                    </p>

                    {item.status === 'valid' && item.shortcode && (
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          Shortcode:{' '}
                          <code className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                            {item.shortcode}
                          </code>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyShortcode(item.shortcode!)}
                          className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                          aria-label={`Copy shortcode ${item.shortcode}`}
                        >
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </button>
                      </div>
                    )}

                    {item.errorMessage && (
                      <p
                        className={`text-xs leading-relaxed ${
                          item.status === 'duplicate'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {item.errorMessage}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB B: CSV UPLOAD */}
      {activeTab === 'csv' && (
        <div className="space-y-6">
          {/* Upload Dropzone Card */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Upload local CSV file
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Parsed locally in your browser. Requires a{' '}
                  <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                    reel_url
                  </code>{' '}
                  or{' '}
                  <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                    url
                  </code>{' '}
                  column.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadSampleCsv}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
              >
                <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Download Sample CSV</span>
              </button>
            </div>

            {!csvResult ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`rounded-2xl border-2 border-dashed p-10 sm:p-14 text-center transition-colors ${
                  isDragging
                    ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileInputChange}
                  className="hidden"
                  aria-label="Select CSV file"
                />
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Drag and drop your CSV file here
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-5">
                  Accepts <code className="font-mono text-xs">.csv</code> files · Processed 100% locally in browser
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-600/20 transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Browse Files</span>
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {/* File Summary Strip */}
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 px-5 py-4">
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100/80 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate font-mono">
                        {csvResult.fileName}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                        <span>{formatFileSize(csvResult.fileSize)}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Column:{' '}
                          <code className="font-mono text-slate-700 dark:text-slate-300">
                            {csvResult.detectedColumn ?? 'Not found'}
                          </code>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{csvResult.totalRows} total rows</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleRemoveCsvFile}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                    >
                      <X className="w-4 h-4" />
                      <span>Remove File</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleImportCsv}
                      disabled={!!csvResult.error || csvResult.validCount === 0}
                      className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-600/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                    >
                      <UploadCloud className="w-4 h-4" />
                      <span>
                        Import Reels
                        {csvResult.validCount > 0 ? ` (${csvResult.validCount})` : ''}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Error Banner if header missing or file empty */}
                {csvResult.error ? (
                  <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">
                        Unable to process CSV schema
                      </p>
                      <p className="text-xs text-rose-700 dark:text-rose-300 leading-relaxed">
                        {csvResult.error}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* 4 Validation Metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3">
                        <div className="text-xs text-slate-500 dark:text-slate-400">Total rows</div>
                        <div className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                          {csvResult.totalRows}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3">
                        <div className="text-xs text-slate-500 dark:text-slate-400">Valid URLs</div>
                        <div className="mt-1 font-display text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {csvResult.validCount}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3">
                        <div className="text-xs text-slate-500 dark:text-slate-400">Invalid URLs</div>
                        <div className="mt-1 font-display text-lg font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                          {csvResult.invalidCount}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3">
                        <div className="text-xs text-slate-500 dark:text-slate-400">Duplicates</div>
                        <div className="mt-1 font-display text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                          {csvResult.duplicateCount}
                        </div>
                      </div>
                    </div>

                    {/* Preview Table Header & Filters */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                      <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          Pre-import row preview
                        </span>
                        <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-200/60 dark:bg-slate-800">
                          {(
                            [
                              { id: 'all', label: 'All Rows', count: csvResult.totalRows },
                              { id: 'valid', label: 'Valid', count: csvResult.validCount },
                              { id: 'invalid', label: 'Invalid', count: csvResult.invalidCount },
                              { id: 'duplicate', label: 'Duplicates', count: csvResult.duplicateCount },
                            ] as const
                          ).map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => setCsvFilter(f.id)}
                              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap tabular-nums ${
                                csvFilter === f.id
                                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                              }`}
                            >
                              {f.label} ({f.count})
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="overflow-x-auto max-h-[420px]">
                        <table className="w-full text-left border-collapse">
                          <thead className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                            <tr>
                              <th className="py-3 px-4 w-16">Row</th>
                              <th className="py-3 px-4">URL Input</th>
                              <th className="py-3 px-4">Shortcode</th>
                              <th className="py-3 px-4">Status</th>
                              <th className="py-3 px-4">Notes / Validation Detail</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                            {filteredCsvRows.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={5}
                                  className="py-10 text-center text-xs text-slate-500 dark:text-slate-400"
                                >
                                  No CSV rows match the selected filter.
                                </td>
                              </tr>
                            ) : (
                              filteredCsvRows.map((row) => (
                                <tr
                                  key={row.id}
                                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                                >
                                  <td className="py-3 px-4 font-mono text-xs text-slate-400 tabular-nums">
                                    #{row.lineNumber}
                                  </td>
                                  <td className="py-3 px-4 font-mono text-xs text-slate-800 dark:text-slate-200 max-w-xs truncate">
                                    {row.rawInput}
                                  </td>
                                  <td className="py-3 px-4 font-mono text-xs font-medium text-indigo-600 dark:text-indigo-400">
                                    {row.shortcode ?? '—'}
                                  </td>
                                  <td className="py-3 px-4">{renderStatusPill(row)}</td>
                                  <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">
                                    {row.errorMessage ? (
                                      <span
                                        className={
                                          row.status === 'duplicate'
                                            ? 'text-amber-700 dark:text-amber-400'
                                            : 'text-rose-600 dark:text-rose-400'
                                        }
                                      >
                                        {row.errorMessage}
                                      </span>
                                    ) : (
                                      <span>{row.extraNotes || 'Ready for import'}</span>
                                    )}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
