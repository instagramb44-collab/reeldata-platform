import { useMemo, useState } from 'react';
import {
  Eye,
  ListChecks,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { formatShortDate } from '../services/reelDataService';
import type { JobStatus, NavPage, ProcessingJob } from '../types/reeldata';

interface ProcessingJobsPageProps {
  jobs: ProcessingJob[];
  onRetryJob: (jobId: string) => void;
  onDeleteJob: (jobId: string) => void;
  onNavigate: (page: NavPage) => void;
}

export function ProcessingJobsPage({
  jobs,
  onRetryJob,
  onDeleteJob,
  onNavigate,
}: ProcessingJobsPageProps) {
  const [statusFilter, setStatusFilter] = useState<'All' | JobStatus>('All');
  const [search, setSearch] = useState('');
  const [selectedJob, setSelectedJob] = useState<ProcessingJob | null>(null);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesStatus = statusFilter === 'All' || job.status === statusFilter;
      const matchesSearch =
        !q ||
        job.id.toLowerCase().includes(q) ||
        job.sourceLabel.toLowerCase().includes(q) ||
        job.sourceType.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [jobs, statusFilter, search]);

  const counts = useMemo(
    () => ({
      All: jobs.length,
      Queued: jobs.filter((j) => j.status === 'Queued').length,
      Processing: jobs.filter((j) => j.status === 'Processing').length,
      Completed: jobs.filter((j) => j.status === 'Completed').length,
      Failed: jobs.filter((j) => j.status === 'Failed').length,
    }),
    [jobs]
  );

  return (
    <div className="space-y-6">
      {/* Header & Filter Bar */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium text-indigo-600 dark:text-indigo-400">
                Simulated Queue
              </span>
              <span aria-hidden="true">·</span>
              <span>Demo job progression only (no live Instagram scraping)</span>
            </div>
            <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white mt-0.5">
              Processing jobs
            </h2>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('import')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Import Reels</span>
          </button>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          {/* Segmented status filters */}
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80">
            {(['All', 'Queued', 'Processing', 'Completed', 'Failed'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap tabular-nums ${
                  statusFilter === status
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {status} ({counts[status]})
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-full md:w-64">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by Job ID or source..."
              className="w-full h-9 pl-9 pr-3 text-sm rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 overflow-hidden">
        {filteredJobs.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-3">
            <div className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <ListChecks className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              No processing jobs found
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              {jobs.length === 0
                ? 'Import a batch of Instagram Reel URLs manually or via CSV to create your first simulated processing job.'
                : 'Adjust your status filter or search query to view jobs.'}
            </p>
            <button
              type="button"
              onClick={() => onNavigate('import')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Import Reels</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-3.5 px-6">Job ID</th>
                  <th className="py-3.5 px-4">Import Date</th>
                  <th className="py-3.5 px-4">Source</th>
                  <th className="py-3.5 px-4 text-right">Total URLs</th>
                  <th className="py-3.5 px-4 text-right">Completed</th>
                  <th className="py-3.5 px-4 text-right">Pending</th>
                  <th className="py-3.5 px-4 text-right">Failed</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {filteredJobs.map((job) => (
                  <tr
                    key={job.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-6 font-mono text-xs font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                      {job.id}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap tabular-nums">
                      {formatShortDate(job.importDate)}
                    </td>
                    <td className="py-3.5 px-4 max-w-[220px]">
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                        {job.sourceLabel}
                      </div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500">
                        {job.sourceType} · Demo
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums">
                      {job.totalUrls}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {job.completed}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-amber-600 dark:text-amber-400 tabular-nums">
                      {job.pending}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-rose-600 dark:text-rose-400 tabular-nums">
                      {job.failed}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedJob(job)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          aria-label={`Inspect ${job.id}`}
                          title="Inspect job"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {(job.status === 'Failed' || job.failed > 0) && (
                          <button
                            type="button"
                            onClick={() => onRetryJob(job.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            aria-label={`Simulate retry for ${job.id}`}
                            title="Re-run demo simulation"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDeleteJob(job.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          aria-label={`Delete ${job.id}`}
                          title="Remove job"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Job Detail Inspection Modal */}
      {selectedJob && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-[1px] p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedJob(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                  {selectedJob.id}
                </span>
                <StatusBadge status={selectedJob.status} />
              </div>
              <button
                type="button"
                onClick={() => setSelectedJob(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close job details"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 p-3">
                  <div className="text-slate-500 dark:text-slate-400">Source</div>
                  <div className="mt-1 font-medium text-slate-900 dark:text-slate-100 truncate">
                    {selectedJob.sourceLabel}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 p-3">
                  <div className="text-slate-500 dark:text-slate-400">Imported</div>
                  <div className="mt-1 font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                    {formatShortDate(selectedJob.importDate)}
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Queued Reel URLs ({selectedJob.urls.length} shown)
                </p>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 max-h-52 overflow-y-auto">
                  {selectedJob.urls.map((u) => (
                    <div
                      key={u.shortcode}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="font-mono text-slate-700 dark:text-slate-300 truncate">
                        {u.url}
                      </span>
                      <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
                        {u.shortcode}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Demo simulation job
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedJob(null);
                  onNavigate('extracted');
                }}
                className="px-4 py-2 text-xs font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                View Extracted Records
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
