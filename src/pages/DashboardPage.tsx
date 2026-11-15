import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  Link2,
  LogOut,
  Plus,
  TriangleAlert,
  UploadCloud,
} from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { formatCompactNumber, formatShortDate } from '../services/reelDataService';
import type {
  ExportHistoryItem,
  ExtractedReelRecord,
  NavPage,
  ProcessingJob,
} from '../types/reeldata';

interface DashboardPageProps {
  jobs: ProcessingJob[];
  records: ExtractedReelRecord[];
  exports: ExportHistoryItem[];
  userName: string;
  userEmail: string;
  onSignOut: () => void;
  onNavigate: (page: NavPage) => void;
  onDownloadExport: (item: ExportHistoryItem) => void;
}

export function DashboardPage({
  jobs,
  records,
  exports,
  userName,
  userEmail,
  onSignOut,
  onNavigate,
  onDownloadExport,
}: DashboardPageProps) {
  const totalImported = jobs.reduce((sum, job) => sum + job.totalUrls, 0);
  const totalCompleted = jobs.reduce((sum, job) => sum + job.completed, 0);
  const totalPending = jobs.reduce((sum, job) => sum + job.pending, 0);
  const totalFailed = jobs.reduce((sum, job) => sum + job.failed, 0);

  const summaryCards = [
    {
      label: 'Total Reels Imported',
      value: totalImported,
      subtext: `Across ${jobs.length} demo jobs`,
      icon: Link2,
      accent: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60',
    },
    {
      label: 'Successfully Processed',
      value: totalCompleted,
      subtext: `${totalImported > 0 ? Math.round((totalCompleted / totalImported) * 100) : 0}% completion rate`,
      icon: CheckCircle2,
      accent: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60',
    },
    {
      label: 'Pending Jobs',
      value: jobs.filter((j) => j.status === 'Queued' || j.status === 'Processing').length,
      subtext: `${formatCompactNumber(totalPending)} URLs in queue`,
      icon: Clock,
      accent: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60',
    },
    {
      label: 'Failed Imports',
      value: totalFailed,
      subtext: 'Simulated unavailable or private',
      icon: TriangleAlert,
      accent: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60',
    },
  ];

  const latestJobs = jobs.slice(0, 5);
  const recentExports = exports.slice(0, 4);
  const recentActivity = [
    ...jobs.slice(0, 4).map((job) => ({
      id: `act-job-${job.id}`,
      title: `${job.sourceType === 'CSV Upload' ? 'Imported CSV' : 'Manual URL batch'} · ${job.sourceLabel}`,
      meta: `${job.id} · ${job.totalUrls} URLs · ${formatShortDate(job.importDate)}`,
      status: job.status,
      actionPage: 'jobs' as NavPage,
    })),
    ...records.slice(0, 2).map((rec) => ({
      id: `act-rec-${rec.id}`,
      title: `Demo record preview · ${rec.shortcode}`,
      meta: `${rec.username} · ${rec.origin} · ${rec.publishedDate}`,
      status: rec.status,
      actionPage: 'extracted' as NavPage,
    })),
  ].slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Top Action & Authenticated Account Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 px-6 py-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-indigo-600 dark:text-indigo-400">
              {userName}
            </span>
            <span aria-hidden="true">·</span>
            <span>{userEmail}</span>
          </div>
          <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
            Reel ingestion & queue overview
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('extracted')}
            className="px-4 py-2.5 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            View Extracted Data
          </button>
          <button
            type="button"
            onClick={() => onNavigate('import')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-600/20 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Quick Import</span>
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign out</span>
          </button>
        </div>
      </div>

      {/* 4 Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 flex flex-col justify-between gap-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {card.label}
                </span>
                <span
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${card.accent}`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </span>
              </div>
              <div>
                <div className="font-display text-2xl font-bold text-slate-900 dark:text-white tabular-nums tracking-tight">
                  {formatCompactNumber(card.value)}
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {card.subtext}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Content Grid: Latest Processing Jobs + Recent Activity & Exports */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Latest Processing Jobs (2 cols) */}
        <div className="xl:col-span-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Latest processing jobs
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Demo queue status and batch progress
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('jobs')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 whitespace-nowrap shrink-0"
            >
              <span>All jobs</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                  <th className="py-3 px-6">Job ID</th>
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4 text-right">URLs</th>
                  <th className="py-3 px-4 text-right">Done</th>
                  <th className="py-3 px-6 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {latestJobs.map((job) => (
                  <tr
                    key={job.id}
                    onClick={() => onNavigate('jobs')}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3.5 px-6 font-mono text-xs font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {job.id}
                    </td>
                    <td className="py-3.5 px-4 max-w-[220px]">
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                        {job.sourceLabel}
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                        {job.sourceType} · {formatShortDate(job.importDate)}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums">
                      {job.totalUrls}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums">
                      {job.completed}/{job.totalUrls}
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <StatusBadge status={job.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Recent Activity + Recent Exports */}
        <div className="space-y-6">
          {/* Recent Import Activity */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Recent import activity
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('import')}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>New</span>
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentActivity.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.actionPage)}
                  className="w-full px-5 py-3.5 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                      {item.title}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate tabular-nums">
                      {item.meta}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </button>
              ))}
            </div>
          </div>

          {/* Recent Exports */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Recent exports
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('exports')}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
              >
                View all
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentExports.map((exp) => (
                <div
                  key={exp.id}
                  className="px-5 py-3.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileSpreadsheet
                      className="w-4 h-4 text-slate-400 shrink-0"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-mono font-medium text-slate-800 dark:text-slate-200 truncate">
                        {exp.fileName}
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 tabular-nums">
                        {exp.recordCount} records · {formatShortDate(exp.exportDate)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDownloadExport(exp)}
                    className="p-2 rounded-lg text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                    aria-label={`Download ${exp.fileName}`}
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
