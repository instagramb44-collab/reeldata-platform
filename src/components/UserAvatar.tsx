import { useState } from 'react';
import { USER_AVATAR_URL } from '../data/demoData';

interface UserAvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

export function UserAvatar({ name, size = 'md' }: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'RD';

  const sizeClasses =
    size === 'sm'
      ? 'w-8 h-8 text-xs'
      : size === 'lg'
        ? 'w-12 h-12 text-sm'
        : 'w-9 h-9 text-xs';

  if (imgError) {
    return (
      <div
        className={`${sizeClasses} rounded-full bg-indigo-600 text-white font-semibold flex items-center justify-center shrink-0 select-none ring-1 ring-slate-200 dark:ring-slate-700`}
        aria-label={name}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={USER_AVATAR_URL}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setImgError(true)}
      className={`${sizeClasses} rounded-full object-cover shrink-0 ring-1 ring-slate-200 dark:ring-slate-700 bg-slate-100 dark:bg-slate-800`}
    />
  );
}
