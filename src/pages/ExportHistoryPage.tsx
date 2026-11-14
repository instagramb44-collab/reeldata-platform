import { Download, FileSpreadsheet, Trash2 } from 'lucide-react';
import { formatShortDate } from '../services/reelDataService';
import type { ExportHistoryItem, NavPage } from '../types/reeldata';

interface ExportHistoryPageProps {
  exports: ExportHistoryItem[];
  onDownloadExport: (item: ExportHistoryItem) => void;
  onDeleteExport: (id: string) => void;
  onNavigate: (page: NavPage) => void;
}

export function ExportHistoryPage({
  exports,
  onDownloadExport,
  onDeleteExport,
  onNavigate,
}: ExportHistoryPageProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-indigo-600 dark:text-indigo-400">
              Local CSV Archive
            </span>
            <span aria-hidden="true">·</span>
            <span>Demo history & exports generated during this session</span>
          </div>
          <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white mt-0.5">
            Export history
          </h2>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('extracted')}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Download className="w-4 h-4" />
          <span>New Export from Data</span>
        </button>
      </div>

      {/* Exports Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 overflow-hidden">
        {exports.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-3">
            <div className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              No exports recorded
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Export records from the Extracted Data table to download a CSV file and record it here.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('extracted')}
              className="px-4 py-2 text-xs font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              Go to Extracted Data
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-3.5 px-6">File Name</th>
                  <th className="py-3.5 px-4">Export Date</th>
                  <th className="py-3.5 px-4">Scope / Filter</th>
                  <th className="py-3.5 px-4 text-right">Records</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {exports.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-6">
                      <div className="flex items-center gap-3">
                        <FileSpreadsheet className="w-4 h-4 text-indigo-500 shrink-0" />
                        <span className="font-mono text-xs font-medium text-slate-900 dark:text-slate-100">
                          {item.fileName}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap tabular-nums">
                      {formatShortDate(item.exportDate)}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-400">
                      {item.filterSummary}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {item.recordCount}
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onDownloadExport(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          <span>Download</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteExport(item.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          aria-label={`Delete ${item.fileName} from history`}
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
    </div>
  );
}
