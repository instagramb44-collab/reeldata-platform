import { useState } from 'react';
import {
  Check,
  FileSpreadsheet,
  LogOut,
  Moon,
  RotateCcw,
  Server,
  Sun,
  User,
} from 'lucide-react';
import { UserAvatar } from '../components/UserAvatar';
import { reelDataBackendAdapter } from '../services/reelDataService';
import type { ToastMessage, UserSettings } from '../types/reeldata';

interface SettingsPageProps {
  settings: UserSettings;
  userName: string;
  userEmail: string;
  onSignOut: () => void;
  onUpdateSettings: (next: UserSettings) => void;
  onResetDemoWorkspace: () => void;
  onAddToast: (toast: Omit<ToastMessage, 'id'>) => void;
}

export function SettingsPage({
  settings,
  userName,
  userEmail,
  onSignOut,
  onUpdateSettings,
  onResetDemoWorkspace,
  onAddToast,
}: SettingsPageProps) {
  const [draft, setDraft] = useState<UserSettings>(settings);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connectionNote, setConnectionNote] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings(draft);
    onAddToast({
      type: 'success',
      title: 'Settings saved',
      message: 'Workspace preferences updated locally.',
    });
  };

  const handleThemeSelect = (theme: 'light' | 'dark') => {
    const updated = { ...draft, theme };
    setDraft(updated);
    onUpdateSettings(updated);
  };

  const handleCheckBackend = async () => {
    setCheckingConnection(true);
    const res = await reelDataBackendAdapter.checkHealth(draft.apiBaseUrl);
    setConnectionNote(res.message);
    setCheckingConnection(false);
    onAddToast({
      type: 'info',
      title: 'Frontend demo mode',
      message: 'Backend adapter is ready for Express + Playwright integration.',
    });
  };

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
      {/* Account Information */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-6 space-y-5">
        <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100 dark:border-slate-800">
          <User className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Account information
          </h2>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <UserAvatar name={userName} size="lg" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {userName}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {userEmail} · {draft.workspaceName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50/70 dark:hover:bg-rose-950/40 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="settings-name"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Authenticated Name
            </label>
            <input
              id="settings-name"
              type="text"
              value={userName}
              readOnly
              className="w-full h-10 px-3 text-sm rounded-xl bg-slate-100/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 cursor-default"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="settings-email"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Authenticated Email
            </label>
            <input
              id="settings-email"
              type="email"
              value={userEmail}
              readOnly
              className="w-full h-10 px-3 text-sm rounded-xl bg-slate-100/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 cursor-default"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="settings-workspace"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Workspace Name
            </label>
            <input
              id="settings-workspace"
              type="text"
              value={draft.workspaceName}
              onChange={(e) => setDraft({ ...draft, workspaceName: e.target.value })}
              className="w-full h-10 px-3 text-sm rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="settings-role"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Role
            </label>
            <input
              id="settings-role"
              type="text"
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              className="w-full h-10 px-3 text-sm rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            />
          </div>
        </div>
      </section>

      {/* API Configuration Placeholder */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <Server className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Backend API configuration
            </h2>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Local demo adapter · Ready for Node.js + Express + Playwright
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <label
              htmlFor="settings-api-url"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Express Backend Endpoint Placeholder
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                id="settings-api-url"
                type="url"
                value={draft.apiBaseUrl}
                onChange={(e) => setDraft({ ...draft, apiBaseUrl: e.target.value })}
                placeholder="http://localhost:4000/api"
                className="flex-1 h-10 px-3 font-mono text-xs rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleCheckBackend}
                disabled={checkingConnection}
                className="px-4 h-10 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                {checkingConnection ? 'Checking...' : 'Check Adapter Status'}
              </button>
            </div>
            {connectionNote && (
              <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1.5">
                {connectionNote}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="settings-mode"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Execution Mode
            </label>
            <select
              id="settings-mode"
              value={draft.executionMode}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  executionMode: e.target.value as UserSettings['executionMode'],
                })
              }
              className="w-full h-10 px-3 text-sm rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            >
              <option value="local-demo">Local Demo Simulation (Active)</option>
              <option value="express-playwright" disabled>
                Express + Playwright Backend (Attach server to enable)
              </option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="settings-timeout"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Worker Request Timeout (ms)
            </label>
            <input
              id="settings-timeout"
              type="number"
              min={5000}
              max={120000}
              step={1000}
              value={draft.requestTimeoutMs}
              onChange={(e) =>
                setDraft({ ...draft, requestTimeoutMs: Number(e.target.value) || 30000 })
              }
              className="w-full h-10 px-3 font-mono text-sm rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 tabular-nums"
            />
          </div>
        </div>
      </section>

      {/* Data Export Preferences */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-6 space-y-5">
        <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100 dark:border-slate-800">
          <FileSpreadsheet className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Data export preferences
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="settings-prefix"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Export Filename Prefix
            </label>
            <input
              id="settings-prefix"
              type="text"
              value={draft.exportFilenamePrefix}
              onChange={(e) =>
                setDraft({ ...draft, exportFilenamePrefix: e.target.value })
              }
              className="w-full h-10 px-3 font-mono text-xs rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="settings-delimiter"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              CSV Delimiter
            </label>
            <select
              id="settings-delimiter"
              value={draft.csvDelimiter}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  csvDelimiter: e.target.value as UserSettings['csvDelimiter'],
                })
              }
              className="w-full h-10 px-3 text-sm rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            >
              <option value=",">Comma (,)</option>
              <option value=";">Semicolon (;)</option>
              <option value={'\t'}>Tab (\t)</option>
            </select>
          </div>
        </div>

        <div className="space-y-3 pt-1">
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Include column header row
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Adds reel_url, shortcode, username, caption, views, likes, comments headers
              </p>
            </div>
            <input
              type="checkbox"
              checked={draft.includeCsvHeaders}
              onChange={(e) =>
                setDraft({ ...draft, includeCsvHeaders: e.target.checked })
              }
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
          </label>

          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Include demo_record flag column
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Marks simulated demo records clearly inside exported CSV files
              </p>
            </div>
            <input
              type="checkbox"
              checked={draft.includeDemoColumn}
              onChange={(e) =>
                setDraft({ ...draft, includeDemoColumn: e.target.checked })
              }
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
          </label>
        </div>
      </section>

      {/* Theme Preference */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-6 space-y-4">
        <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Theme preference
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Switch between the crisp light workspace and dark mode.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleThemeSelect('light')}
            className={`flex items-center justify-between p-4 rounded-xl border text-left transition-all ${
              draft.theme === 'light'
                ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 ring-1 ring-indigo-600'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <div className="flex items-center gap-3">
              <Sun className="w-4 h-4 text-amber-500" />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Light Mode
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Soft off-white canvas & deep navy ink
                </p>
              </div>
            </div>
            {draft.theme === 'light' && <Check className="w-4 h-4 text-indigo-600" />}
          </button>

          <button
            type="button"
            onClick={() => handleThemeSelect('dark')}
            className={`flex items-center justify-between p-4 rounded-xl border text-left transition-all ${
              draft.theme === 'dark'
                ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 ring-1 ring-indigo-500'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <div className="flex items-center gap-3">
              <Moon className="w-4 h-4 text-indigo-400" />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Dark Mode
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Low-glare slate surface palette
                </p>
              </div>
            </div>
            {draft.theme === 'dark' && <Check className="w-4 h-4 text-indigo-400" />}
          </button>
        </div>
      </section>

      {/* Bottom Save & Reset Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={onResetDemoWorkspace}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reset Demo Data</span>
        </button>

        <button
          type="submit"
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-600/20 transition-colors"
        >
          <Check className="w-4 h-4" />
          <span>Save Preferences</span>
        </button>
      </div>
    </form>
  );
}
