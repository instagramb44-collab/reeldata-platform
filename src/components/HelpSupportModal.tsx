import { BookOpen, FileSpreadsheet, Link2, Server, X } from 'lucide-react';

interface HelpSupportModalProps {
  open: boolean;
  onClose: () => void;
  onNavigateToImport: () => void;
  onNavigateToSettings: () => void;
}

export function HelpSupportModal({
  open,
  onClose,
  onNavigateToImport,
  onNavigateToSettings,
}: HelpSupportModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-[1px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
            <h2
              id="help-modal-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              ReelData Documentation & Support
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close help modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Link2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              <span>Supported Instagram Reel URL Formats</span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              ReelData validates URLs locally and extracts the canonical Reel shortcode automatically. Standard posts (<code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">/p/</code>) and stories (<code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">/stories/</code>) are flagged during validation.
            </p>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 p-3 font-mono text-xs text-slate-700 dark:text-slate-300 space-y-1">
              <div>https://www.instagram.com/reel/ABC123xyz/</div>
              <div>https://www.instagram.com/reels/DEF456xyz/?igsh=...</div>
              <div>https://instagram.com/username/reel/GHI789mno/</div>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <FileSpreadsheet className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              <span>Local CSV Upload Specification</span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              All CSV files are parsed directly inside your browser without uploading to third-party servers. Include a header column named{' '}
              <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">reel_url</code> or{' '}
              <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">url</code>. Optional{' '}
              <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">label</code> or{' '}
              <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">notes</code> columns are preserved in the preview table.
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Server className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              <span>Demo Mode & Backend Architecture</span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              This workspace currently operates in local demo mode. Imported batches create simulated processing jobs and clearly-labelled demo records. Real metadata extraction is isolated in{' '}
              <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">reelDataService.ts</code> for connection to your Node.js + Express + Playwright backend.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => {
              onClose();
              onNavigateToSettings();
            }}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            API Settings
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onNavigateToImport();
            }}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0"
          >
            Go to Import Reels
          </button>
        </div>
      </div>
    </div>
  );
}
