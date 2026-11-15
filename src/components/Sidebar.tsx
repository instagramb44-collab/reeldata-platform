import {
  Database,
  Download,
  HelpCircle,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Settings,
  UploadCloud,
  UserCog,
  X,
} from 'lucide-react';
import type { NavPage } from '../types/reeldata';
import { UserAvatar } from './UserAvatar';

interface SidebarProps {
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
  onOpenHelp: () => void;
  userName: string;
  userEmail: string;
  onSignOut: () => void;
  activeJobsCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  id: NavPage;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: number;
}

export function Sidebar({
  activePage,
  onNavigate,
  onOpenHelp,
  userName,
  userEmail,
  onSignOut,
  activeJobsCount,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'import', label: 'Import Reels', icon: UploadCloud },
    {
      id: 'jobs',
      label: 'Processing Jobs',
      icon: ListChecks,
      badge: activeJobsCount > 0 ? activeJobsCount : undefined,
    },
    { id: 'extracted', label: 'Extracted Data', icon: Database },
    { id: 'exports', label: 'Export History', icon: Download },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleNav = (page: NavPage) => {
    onNavigate(page);
    onCloseMobile();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200/90 dark:border-slate-800">
      {/* Brand Logo */}
      <div className="flex items-center justify-between h-16 px-5 border-b border-slate-200/80 dark:border-slate-800 shrink-0">
        <button
          type="button"
          onClick={() => handleNav('dashboard')}
          className="flex items-center gap-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg"
        >
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-sm shadow-indigo-600/20 shrink-0">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="w-4.5 h-4.5 text-white"
              aria-hidden="true"
            >
              <rect
                x="3.5"
                y="4.5"
                width="17"
                height="15"
                rx="3"
                stroke="currentColor"
                strokeWidth="1.9"
              />
              <path
                d="M10.25 9.25L15.25 12L10.25 14.75V9.25Z"
                fill="currentColor"
              />
            </svg>
          </span>
          <span className="font-display text-[17px] font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            ReelData
          </span>
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Close navigation menu"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Primary Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Main navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNav(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-150 whitespace-nowrap ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/70'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </span>
              {item.badge !== undefined && (
                <span className="text-xs font-mono tabular-nums font-medium text-indigo-600 dark:text-indigo-300 bg-indigo-100/80 dark:bg-indigo-900/60 px-1.5 py-0.5 rounded-md">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Sidebar */}
      <div className="p-3 border-t border-slate-200/80 dark:border-slate-800 space-y-1 shrink-0">
        <button
          type="button"
          onClick={() => handleNav('settings')}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 transition-colors whitespace-nowrap"
        >
          <UserCog className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
          <span>Account settings</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onCloseMobile();
            onOpenHelp();
          }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 transition-colors whitespace-nowrap"
        >
          <HelpCircle className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
          <span>Help & support</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onCloseMobile();
            onSignOut();
          }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50/70 dark:hover:bg-rose-950/40 transition-colors whitespace-nowrap"
        >
          <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Sign out</span>
        </button>

        {/* User profile block */}
        <button
          type="button"
          onClick={() => handleNav('settings')}
          className="w-full mt-2 flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600 transition-colors text-left"
        >
          <UserAvatar name={userName} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              {userName}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {userEmail}
            </p>
          </div>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop fixed sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">
        {sidebarContent}
      </aside>

      {/* Mobile / Tablet drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] h-full z-10">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
