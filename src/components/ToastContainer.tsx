import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import type { ToastMessage } from '../types/reeldata';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const TOAST_CONFIG: Record<
  ToastMessage['type'],
  {
    icon: typeof CheckCircle2;
    iconClass: string;
    borderClass: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    iconClass: 'text-emerald-600 dark:text-emerald-400',
    borderClass: 'border-slate-200 dark:border-slate-700',
  },
  error: {
    icon: AlertCircle,
    iconClass: 'text-rose-600 dark:text-rose-400',
    borderClass: 'border-rose-200 dark:border-rose-900',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-amber-600 dark:text-amber-400',
    borderClass: 'border-amber-200 dark:border-amber-900',
  },
  info: {
    icon: Info,
    iconClass: 'text-indigo-600 dark:text-indigo-400',
    borderClass: 'border-slate-200 dark:border-slate-700',
  },
};

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 w-full max-w-sm pointer-events-none px-4 sm:px-0"
    >
      {toasts.map((toast) => {
        const cfg = TOAST_CONFIG[toast.type];
        const Icon = cfg.icon;
        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 rounded-xl bg-white dark:bg-slate-900 border ${cfg.borderClass} p-3.5 shadow-lg shadow-slate-900/5 dark:shadow-black/30 transition-all duration-200`}
          >
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.iconClass}`} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-snug">
                {toast.title}
              </p>
              {toast.message && (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {toast.message}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
