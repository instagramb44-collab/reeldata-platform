import { AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react';

export type BadgeStatus = 'Queued' | 'Processing' | 'Completed' | 'Failed' | 'Pending';

interface StatusBadgeProps {
  status: BadgeStatus;
  size?: 'sm' | 'md';
}

const STATUS_STYLES: Record<
  BadgeStatus,
  {
    wrapper: string;
    icon: typeof CheckCircle2;
    spin?: boolean;
  }
> = {
  Completed: {
    wrapper:
      'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60',
    icon: CheckCircle2,
  },
  Processing: {
    wrapper:
      'bg-indigo-50 text-indigo-700 border-indigo-200/80 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800/60',
    icon: Loader2,
    spin: true,
  },
  Queued: {
    wrapper:
      'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60',
    icon: Clock,
  },
  Pending: {
    wrapper:
      'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60',
    icon: Clock,
  },
  Failed: {
    wrapper:
      'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/60',
    icon: AlertCircle,
  },
};

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const config = STATUS_STYLES[status];
  const Icon = config.icon;
  const padding = size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-md border whitespace-nowrap shrink-0 ${padding} ${config.wrapper}`}
    >
      <Icon
        className={`w-3.5 h-3.5 shrink-0 ${config.spin ? 'animate-spin' : ''}`}
        aria-hidden="true"
      />
      <span>{status}</span>
    </span>
  );
}
