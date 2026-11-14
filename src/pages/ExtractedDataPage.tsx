import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  Download,
  ExternalLink,
  Search,
  UploadCloud,
} from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { formatCompactNumber } from '../services/reelDataService';
import type { ExtractedReelRecord, NavPage, ToastMessage } from '../types/reeldata';

interface ExtractedDataPageProps {
  records: ExtractedReelRecord[];
  globalSearchQuery: string;
  onExportCsv: (filteredRecords: ExtractedReelRecord[], filterSummary: string) => void;
  onNavigate: (page: NavPage) => void;
  onAddToast: (toast: Omit<ToastMessage, 'id'>) => void;
}

type SortKey =
  | 'shortcode'
  | 'username'
  | 'views'
  | 'likes'
  | 'comments'
  | 'publishedDate'
  | 'status';

type SortDirection = 'asc' | 'desc';

export function ExtractedDataPage({
  records,
  globalSearchQuery,
  onExportCsv,
  onNavigate,
  onAddToast,
}: ExtractedDataPageProps) {
  const [search, setSearch] = useState(globalSearchQuery);
  const [statusFilter, setStatusFilter] = useState<'All' | 'Completed' | 'Pending' | 'Failed'>('All');
  const [originFilter, setOriginFilter] = useState<'All' | 'Demo Dataset' | 'Simulated Import'>('All');
  const [sortKey, setSortKey] = useState<SortKey>('publishedDate');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);

  useEffect(() => {
    if (globalSearchQuery) {
      setSearch(globalSearchQuery);
      setPage(1);
    }
  }, [globalSearchQuery]);

  const filteredAndSorted = useMemo(() => {
    const q = search.trim().toLowerCase();

    const filtered = records.filter((rec) => {
      const matchesStatus = statusFilter === 'All' || rec.status === statusFilter;
      const matchesOrigin = originFilter === 'All' || rec.origin === originFilter;
      const matchesSearch =
        !q ||
        rec.shortcode.toLowerCase().includes(q) ||
        rec.username.toLowerCase().includes(q) ||
        rec.reelUrl.toLowerCase().includes(q) ||
        rec.caption.toLowerCase().includes(q) ||
        rec.jobId.toLowerCase().includes(q);
      return matchesStatus && matchesOrigin && matchesSearch;
    });

    const sorted = [...filtered].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'views':
        case 'likes':
        case 'comments': {
          const valA = a[sortKey] ?? -1;
          const valB = b[sortKey] ?? -1;
          return (valA - valB) * dir;
        }
        case 'publishedDate':
        case 'shortcode':
        case 'username':
        case 'status':
          return a[sortKey].localeCompare(b[sortKey]) * dir;
        default:
          return 0;
      }
    });

    return sorted;
  }, [records, search, statusFilter, originFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRecords = filteredAndSorted.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'views' || key === 'likes' || key === 'comments' || key === 'publishedDate' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="w-3 h-3 text-slate-400" aria-hidden="true" />;
    }
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
    ) : (
      <ArrowDown className="w-3 h-3 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
    );
  };

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      onAddToast({
        type: 'info',
        title: 'Copied Reel URL',
        message: url,
      });
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleExportClick = () => {
    const parts: string[] = [];
    if (statusFilter !== 'All') parts.push(`Status: ${statusFilter}`);
    if (originFilter !== 'All') parts.push(originFilter);
    if (search.trim()) parts.push(`Search: "${search.trim()}"`);
    const summary = parts.length > 0 ? `${parts.join(' · ')} (Demo)` : 'All Extracted Records (Demo)';
    onExportCsv(filteredAndSorted, summary);
  };

  return (
    <div className="space-y-6">
      {/* Header + Controls */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium text-indigo-600 dark:text-indigo-400">
                Demo Dataset Preview
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Usernames, captions, and engagement counts below are clearly-labelled placeholder demo records
              </span>
            </div>
            <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white mt-0.5">
              Extracted Reel data
            </h2>
          </div>

          <button
            type="button"
            onClick={handleExportClick}
            disabled={filteredAndSorted.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV ({filteredAndSorted.length})</span>
          </button>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-3">
            {/* Status Filter */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80">
              {(['All', 'Completed', 'Pending', 'Failed'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    setStatusFilter(status);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    statusFilter === status
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            {/* Origin Filter */}
            <select
              value={originFilter}
              onChange={(e) => {
                setOriginFilter(e.target.value as typeof originFilter);
                setPage(1);
              }}
              aria-label="Filter by dataset origin"
              className="h-9 px-3 text-xs font-medium rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            >
              <option value="All">All Origins</option>
              <option value="Demo Dataset">Demo Dataset</option>
              <option value="Simulated Import">Simulated Import</option>
            </select>
          </div>

          {/* Search */}
          <div className="relative w-full lg:w-72">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search shortcode, @user, caption..."
              className="w-full h-9 pl-9 pr-3 text-sm rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 overflow-hidden">
        {pagedRecords.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-3">
            <div className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <Database className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              No matching extracted records
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Clear active filters or import a new batch of Reel URLs to generate simulated demo records.
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              {(search || statusFilter !== 'All' || originFilter !== 'All') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('All');
                    setOriginFilter('All');
                    setPage(1);
                  }}
                  className="px-3.5 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Reset Filters
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigate('import')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Import Reels</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-3.5 px-5">Reel URL</th>
                    <th className="py-3.5 px-4">
                      <button
                        type="button"
                        onClick={() => handleSort('username')}
                        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200"
                      >
                        <span>Username</span>
                        {renderSortIcon('username')}
                      </button>
                    </th>
                    <th className="py-3.5 px-4">
                      <button
                        type="button"
                        onClick={() => handleSort('shortcode')}
                        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200"
                      >
                        <span>Shortcode</span>
                        {renderSortIcon('shortcode')}
                      </button>
                    </th>
                    <th className="py-3.5 px-4 min-w-[230px]">Caption (Demo)</th>
                    <th className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleSort('views')}
                        className="inline-flex items-center justify-end gap-1 hover:text-slate-900 dark:hover:text-slate-200 ml-auto"
                      >
                        <span>Views</span>
                        {renderSortIcon('views')}
                      </button>
                    </th>
                    <th className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleSort('likes')}
                        className="inline-flex items-center justify-end gap-1 hover:text-slate-900 dark:hover:text-slate-200 ml-auto"
                      >
                        <span>Likes</span>
                        {renderSortIcon('likes')}
                      </button>
                    </th>
                    <th className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleSort('comments')}
                        className="inline-flex items-center justify-end gap-1 hover:text-slate-900 dark:hover:text-slate-200 ml-auto"
                      >
                        <span>Comments</span>
                        {renderSortIcon('comments')}
                      </button>
                    </th>
                    <th className="py-3.5 px-4">
                      <button
                        type="button"
                        onClick={() => handleSort('publishedDate')}
                        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200"
                      >
                        <span>Published</span>
                        {renderSortIcon('publishedDate')}
                      </button>
                    </th>
                    <th className="py-3.5 px-5">
                      <button
                        type="button"
                        onClick={() => handleSort('status')}
                        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200"
                      >
                        <span>Status</span>
                        {renderSortIcon('status')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {pagedRecords.map((rec) => (
                    <tr
                      key={rec.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-5 max-w-[180px]">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="font-mono text-xs text-slate-600 dark:text-slate-300 truncate"
                            title={rec.reelUrl}
                          >
                            {rec.reelUrl.replace('https://www.', '')}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyUrl(rec.reelUrl)}
                            className="p-1 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 shrink-0"
                            aria-label={`Copy URL for ${rec.shortcode}`}
                            title="Copy URL"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          <a
                            href={rec.reelUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 shrink-0"
                            aria-label={`Open ${rec.shortcode} in new tab`}
                            title="Open URL"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {rec.username}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                        {rec.shortcode}
                      </td>
                      <td className="py-3.5 px-4 max-w-[260px]">
                        <p
                          className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed"
                          title={rec.caption}
                        >
                          {rec.caption}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                        {formatCompactNumber(rec.views)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                        {formatCompactNumber(rec.likes)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                        {formatCompactNumber(rec.comments)}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {rec.publishedDate}
                      </td>
                      <td className="py-3.5 px-5">
                        <StatusBadge status={rec.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-3 tabular-nums">
                <span>
                  Showing {(safePage - 1) * pageSize + 1}–
                  {Math.min(safePage * pageSize, filteredAndSorted.length)} of{' '}
                  {filteredAndSorted.length} records
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  aria-label="Rows per page"
                  className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                >
                  <option value={5}>5 / page</option>
                  <option value={8}>8 / page</option>
                  <option value={15}>15 / page</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>
                <span className="font-mono tabular-nums px-2">
                  Page {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
