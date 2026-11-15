import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Check,
  Database,
  ListChecks,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  UploadCloud,
} from 'lucide-react';
import type {
  ExtractedReelRecord,
  NavPage,
  NotificationItem,
  ProcessingJob,
  UserSettings,
} from '../types/reeldata';
import { UserAvatar } from './UserAvatar';

interface TopHeaderProps {
  pageTitle: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onNavigate: (page: NavPage) => void;
  onOpenMobileMenu: () => void;
  notifications: NotificationItem[];
  onMarkAllRead: () => void;
  onSelectNotification: (notif: NotificationItem) => void;
  settings: UserSettings;
  userName: string;
  userEmail: string;
  onSignOut: () => void;
  onToggleTheme: () => void;
  jobs: ProcessingJob[];
  records: ExtractedReelRecord[];
}

export function TopHeader({
  pageTitle,
  searchQuery,
  onSearchChange,
  onNavigate,
  onOpenMobileMenu,
  notifications,
  onMarkAllRead,
  onSelectNotification,
  settings,
  userName,
  userEmail,
  onSignOut,
  onToggleTheme,
  jobs,
  records,
}: TopHeaderProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const quickResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { matchedJobs: [], matchedRecords: [] };
    const matchedJobs = jobs
      .filter(
        (j) =>
          j.id.toLowerCase().includes(q) ||
          j.sourceLabel.toLowerCase().includes(q) ||
          j.status.toLowerCase().includes(q)
      )
      .slice(0, 3);
    const matchedRecords = records
      .filter(
        (r) =>
          r.shortcode.toLowerCase().includes(q) ||
          r.username.toLowerCase().includes(q) ||
          r.reelUrl.toLowerCase().includes(q) ||
          r.caption.toLowerCase().includes(q)
      )
      .slice(0, 4);
    return { matchedJobs, matchedRecords };
  }, [searchQuery, jobs, records]);

  const hasQuickResults =
    quickResults.matchedJobs.length > 0 || quickResults.matchedRecords.length > 0;

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200/80 dark:border-slate-800 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
      {/* Left: Mobile menu button + Page Title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 -ml-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-white tracking-tight truncate">
          {pageTitle}
        </h1>
      </div>

      {/* Right: Search + Notifications + Avatar */}
      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
        {/* Search Input with quick-jump dropdown */}
        <div ref={searchRef} className="relative hidden sm:block w-56 md:w-72">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onFocus={() => setSearchFocused(true)}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                setSearchFocused(false);
                onNavigate('extracted');
              }
            }}
            placeholder="Search shortcodes, jobs, users..."
            aria-label="Global search"
            className="w-full h-9 pl-9 pr-3 text-sm rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
          />

          {searchFocused && searchQuery.trim().length > 0 && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-2 z-50">
              {!hasQuickResults ? (
                <div className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                  No matching jobs or records for &ldquo;{searchQuery}&rdquo;
                </div>
              ) : (
                <div className="space-y-2">
                  {quickResults.matchedJobs.length > 0 && (
                    <div>
                      <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                        Processing Jobs
                      </div>
                      {quickResults.matchedJobs.map((job) => (
                        <button
                          key={job.id}
                          type="button"
                          onClick={() => {
                            setSearchFocused(false);
                            onNavigate('jobs');
                          }}
                          className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <ListChecks className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <span className="text-xs font-mono font-medium text-slate-900 dark:text-slate-100">
                              {job.id}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {job.sourceLabel}
                            </span>
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0 ml-2">
                            {job.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {quickResults.matchedRecords.length > 0 && (
                    <div>
                      <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                        Extracted Data
                      </div>
                      {quickResults.matchedRecords.map((rec) => (
                        <button
                          key={rec.id}
                          type="button"
                          onClick={() => {
                            setSearchFocused(false);
                            onNavigate('extracted');
                          }}
                          className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <Database className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <span className="text-xs font-mono font-medium text-slate-900 dark:text-slate-100">
                              {rec.shortcode}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {rec.username}
                            </span>
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0 ml-2">
                            {rec.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Notifications Popover */}
        <div ref={notifRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setNotifOpen((prev) => !prev);
              setProfileOpen(false);
            }}
            className="relative w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
            aria-label="Notifications"
            aria-expanded={notifOpen}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-semibold tabular-nums flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={onMarkAllRead}
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
                  >
                    <Check className="w-3 h-3" />
                    <span>Mark all read</span>
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                    All caught up.
                  </div>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        onSelectNotification(n);
                        setNotifOpen(false);
                      }}
                      className={`w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${
                        !n.read ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {n.title}
                        </span>
                        <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                          {n.timestamp}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        {n.description}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Avatar Menu */}
        <div ref={profileRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setProfileOpen((prev) => !prev);
              setNotifOpen(false);
            }}
            className="flex items-center gap-2 p-1 pr-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            aria-label="User menu"
            aria-expanded={profileOpen}
          >
            <UserAvatar name={userName} size="sm" />
            <span className="hidden md:block text-xs font-medium text-slate-700 dark:text-slate-200 max-w-[140px] truncate">
              {userName}
            </span>
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-2 z-50">
              <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {userName}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {userEmail}
                </p>
              </div>
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onNavigate('import');
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
                >
                  <UploadCloud className="w-4 h-4 text-slate-400" />
                  <span>Import Reels</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onNavigate('settings');
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
                >
                  <Settings className="w-4 h-4 text-slate-400" />
                  <span>Settings</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onToggleTheme();
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between"
                >
                  <span className="flex items-center gap-2.5">
                    {settings.theme === 'dark' ? (
                      <Sun className="w-4 h-4 text-slate-400" />
                    ) : (
                      <Moon className="w-4 h-4 text-slate-400" />
                    )}
                    <span>Appearance</span>
                  </span>
                  <span className="text-xs text-slate-400 capitalize">{settings.theme}</span>
                </button>
              </div>
              <div className="pt-1 mt-1 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onSignOut();
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50/70 dark:hover:bg-rose-950/40 flex items-center gap-2.5"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
