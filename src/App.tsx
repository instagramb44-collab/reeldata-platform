import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { HelpSupportModal } from './components/HelpSupportModal';
import { Sidebar } from './components/Sidebar';
import { ToastContainer } from './components/ToastContainer';
import { TopHeader } from './components/TopHeader';
import { useAuth } from './context/AuthContext';
import {
  DEFAULT_SETTINGS,
  DEMO_EXPORT_HISTORY,
  DEMO_EXTRACTED_REELS,
  DEMO_JOBS,
  DEMO_NOTIFICATIONS,
} from './data/demoData';
import { DashboardPage } from './pages/DashboardPage';
import { ExportHistoryPage } from './pages/ExportHistoryPage';
import { ExtractedDataPage } from './pages/ExtractedDataPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ImportReelsPage } from './pages/ImportReelsPage';
import { InstagramConnectionPage } from './pages/InstagramConnectionPage';
import { LoginPage } from './pages/LoginPage';
import { ProcessingJobsPage } from './pages/ProcessingJobsPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SettingsPage } from './pages/SettingsPage';
import { SignupPage } from './pages/SignupPage';
import { cleanupActiveInstagramSession } from './services/instagramConnectionService';
import {
  buildSimulatedDemoRecord,
  generateExtractedCsv,
  reelDataBackendAdapter,
  triggerCsvDownload,
} from './services/reelDataService';
import type {
  ExportHistoryItem,
  ExtractedReelRecord,
  NavPage,
  NotificationItem,
  ProcessingJob,
  ToastMessage,
  UserSettings,
} from './types/reeldata';

const PAGE_TITLES: Record<NavPage, string> = {
  dashboard: 'Dashboard',
  import: 'Import Reels',
  jobs: 'Processing Jobs',
  extracted: 'Extracted Data',
  exports: 'Export History',
  instagram: 'Instagram Connection',
  settings: 'Settings',
};

const SETTINGS_STORAGE_KEY = 'reeldata_settings_v1';

type AuthView = 'login' | 'signup' | 'forgot-password';

export default function App() {
  const {
    user,
    userName,
    userEmail,
    isAuthenticated,
    isLoading: authLoading,
    isConfigured,
    isPasswordRecovery,
    clearPasswordRecovery,
    signOut,
  } = useAuth();

  const [authView, setAuthView] = useState<AuthView>('login');
  const [activePage, setActivePage] = useState<NavPage>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  const [settings, setSettings] = useState<UserSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        return {
          ...DEFAULT_SETTINGS,
          ...JSON.parse(saved),
          displayName: '',
          email: '',
        };
      }
    } catch {
      // Ignore storage errors
    }
    return DEFAULT_SETTINGS;
  });

  const [jobs, setJobs] = useState<ProcessingJob[]>(DEMO_JOBS);
  const [records, setRecords] = useState<ExtractedReelRecord[]>(DEMO_EXTRACTED_REELS);
  const [exports, setExports] = useState<ExportHistoryItem[]>(DEMO_EXPORT_HISTORY);
  const [notifications, setNotifications] = useState<NotificationItem[]>(DEMO_NOTIFICATIONS);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage errors
    }
  }, [settings]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentId = user?.id ?? null;
    if (currentId && prevUserIdRef.current !== currentId) {
      setActivePage('dashboard');
    }
    if (!currentId && prevUserIdRef.current !== null) {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
      setJobs(DEMO_JOBS);
      setRecords(DEMO_EXTRACTED_REELS);
      setExports(DEMO_EXPORT_HISTORY);
      setNotifications(DEMO_NOTIFICATIONS);
      setGlobalSearch('');
      setMobileMenuOpen(false);
      setHelpOpen(false);
      setActivePage('dashboard');
    }
    prevUserIdRef.current = currentId;
  }, [user?.id]);

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    const timeoutId = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
    timersRef.current.push(timeoutId);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const existingShortcodes = useMemo(
    () => new Set(records.map((r) => r.shortcode)),
    [records]
  );

  const activeJobsCount = useMemo(
    () => jobs.filter((j) => j.status === 'Queued' || j.status === 'Processing').length,
    [jobs]
  );

  const simulateJobLifecycle = useCallback(
    (job: ProcessingJob) => {
      const startProcessingTimer = window.setTimeout(() => {
        setJobs((prev) =>
          prev.map((j) => (j.id === job.id ? { ...j, status: 'Processing' } : j))
        );
      }, 900);
      timersRef.current.push(startProcessingTimer);

      const total = job.urls.length;
      const stepDelay = 650;

      job.urls.forEach((item, index) => {
        const stepTimer = window.setTimeout(() => {
          const isLast = index === total - 1;
          const simulatedFail = total >= 4 && index === total - 1 && item.shortcode.endsWith('9');

          setJobs((prev) =>
            prev.map((j) => {
              if (j.id !== job.id) return j;
              const nextCompleted = simulatedFail ? j.completed : j.completed + 1;
              const nextFailed = simulatedFail ? j.failed + 1 : j.failed;
              const nextPending = Math.max(0, j.totalUrls - nextCompleted - nextFailed);
              const nextStatus = isLast
                ? nextCompleted === 0 && nextFailed > 0
                  ? 'Failed'
                  : 'Completed'
                : 'Processing';
              return {
                ...j,
                completed: nextCompleted,
                failed: nextFailed,
                pending: nextPending,
                status: nextStatus,
              };
            })
          );

          const newDemoRecord = buildSimulatedDemoRecord(
            job.id,
            item.url,
            item.shortcode,
            index,
            simulatedFail
          );
          setRecords((prev) => [newDemoRecord, ...prev]);

          if (isLast) {
            setNotifications((prev) => [
              {
                id: `notif-${Date.now()}`,
                title: `Demo Job ${job.id} completed`,
                description: `${total} simulated URLs processed from ${job.sourceLabel}.`,
                timestamp: 'Just now',
                read: false,
                targetPage: 'extracted',
              },
              ...prev,
            ]);
            addToast({
              type: 'success',
              title: `Demo job ${job.id} finished`,
              message: `Added ${total} clearly-labelled demo records to Extracted Data.`,
            });
          }
        }, 1400 + index * stepDelay);

        timersRef.current.push(stepTimer);
      });
    },
    [addToast]
  );

  const handleCreateImportJob = useCallback(
    async (
      urls: { url: string; shortcode: string }[],
      sourceType: 'Manual Paste' | 'CSV Upload',
      sourceLabel: string
    ) => {
      const newJob = await reelDataBackendAdapter.createImportJob(
        urls,
        sourceType,
        sourceLabel
      );

      setJobs((prev) => [newJob, ...prev]);
      setActivePage('jobs');

      addToast({
        type: 'success',
        title: `Queued ${newJob.id} (Demo Simulation)`,
        message: `${urls.length} valid Reel ${urls.length === 1 ? 'URL' : 'URLs'} queued for local demo simulation.`,
      });

      simulateJobLifecycle(newJob);
    },
    [addToast, simulateJobLifecycle]
  );

  const handleRetryJob = useCallback(
    (jobId: string) => {
      const target = jobs.find((j) => j.id === jobId);
      if (!target) return;

      const resetJob: ProcessingJob = {
        ...target,
        status: 'Queued',
        completed: 0,
        failed: 0,
        pending: target.urls.length,
        totalUrls: target.urls.length,
      };
      setJobs((prev) => prev.map((j) => (j.id === jobId ? resetJob : j)));
      addToast({
        type: 'info',
        title: `Re-running demo job ${jobId}`,
        message: 'Simulated processing restarted.',
      });
      simulateJobLifecycle(resetJob);
    },
    [jobs, addToast, simulateJobLifecycle]
  );

  const handleDeleteJob = useCallback(
    (jobId: string) => {
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      addToast({
        type: 'info',
        title: `Removed ${jobId}`,
        message: 'Job removed from local queue.',
      });
    },
    [addToast]
  );

  const handleExportCsv = useCallback(
    (filteredRecords: ExtractedReelRecord[], filterSummary: string) => {
      if (filteredRecords.length === 0) {
        addToast({
          type: 'warning',
          title: 'Nothing to export',
          message: 'No records match the current filter.',
        });
        return;
      }

      const dateSlug = new Date().toISOString().slice(0, 10);
      const prefix = settings.exportFilenamePrefix.trim() || 'reeldata_export';
      const fileName = `${prefix}_${dateSlug}_${filteredRecords.length}rows.csv`;
      const csvContent = generateExtractedCsv(filteredRecords, settings);

      triggerCsvDownload(fileName, csvContent);

      const newExport: ExportHistoryItem = {
        id: `EXP-${Math.floor(210 + Math.random() * 780)}`,
        fileName,
        exportDate: new Date().toISOString(),
        recordCount: filteredRecords.length,
        filterSummary,
        csvContent,
        isDemo: true,
      };

      setExports((prev) => [newExport, ...prev]);
      addToast({
        type: 'success',
        title: 'CSV exported',
        message: `Downloaded ${fileName} (${filteredRecords.length} records).`,
      });
    },
    [settings, addToast]
  );

  const handleDownloadSavedExport = useCallback(
    (item: ExportHistoryItem) => {
      const content =
        item.csvContent ||
        generateExtractedCsv(records.slice(0, Math.min(item.recordCount, records.length)), settings);
      triggerCsvDownload(item.fileName, content);
      addToast({
        type: 'success',
        title: 'Download started',
        message: item.fileName,
      });
    },
    [records, settings, addToast]
  );

  const handleDeleteExport = useCallback(
    (id: string) => {
      setExports((prev) => prev.filter((e) => e.id !== id));
      addToast({
        type: 'info',
        title: 'Export entry removed',
      });
    },
    [addToast]
  );

  const handleResetDemoWorkspace = useCallback(() => {
    setJobs(DEMO_JOBS);
    setRecords(DEMO_EXTRACTED_REELS);
    setExports(DEMO_EXPORT_HISTORY);
    setNotifications(DEMO_NOTIFICATIONS);
    setSettings(DEFAULT_SETTINGS);
    addToast({
      type: 'info',
      title: 'Demo workspace reset',
      message: 'Restored initial demo jobs, records, and export history.',
    });
  }, [addToast]);

  const handleMarkAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const handleSelectNotification = useCallback((notif: NotificationItem) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
    );
    if (notif.targetPage) {
      setActivePage(notif.targetPage);
    }
  }, []);

  const handleToggleTheme = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      theme: prev.theme === 'dark' ? 'light' : 'dark',
    }));
  }, []);

  const handleSignOut = useCallback(async () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];

    await cleanupActiveInstagramSession(user?.id);
    const result = await signOut();

    try {
      localStorage.removeItem(SETTINGS_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }

    setJobs(DEMO_JOBS);
    setRecords(DEMO_EXTRACTED_REELS);
    setExports(DEMO_EXPORT_HISTORY);
    setNotifications(DEMO_NOTIFICATIONS);
    setSettings((prev) => ({ ...DEFAULT_SETTINGS, theme: prev.theme }));
    setGlobalSearch('');
    setMobileMenuOpen(false);
    setHelpOpen(false);
    setToasts([]);
    setActivePage('dashboard');
    setAuthView('login');

    if (!result.ok && result.error) {
      addToast({
        type: 'error',
        title: 'Sign out warning',
        message: result.error,
      });
    }
  }, [user?.id, signOut, addToast]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8FAFC] dark:bg-slate-950 text-[#0F172A] dark:text-slate-100 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-indigo-600 dark:text-indigo-400" />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Checking session...
        </p>
      </div>
    );
  }

  if (isPasswordRecovery) {
    return (
      <ResetPasswordPage
        hasSession={isAuthenticated}
        userEmail={userEmail}
        onPasswordUpdated={() => {
          clearPasswordRecovery();
          setActivePage('dashboard');
          addToast({
            type: 'success',
            title: 'Password updated',
            message: 'Your account password has been updated.',
          });
        }}
        onRequestNewLink={() => {
          clearPasswordRecovery();
          setAuthView('forgot-password');
        }}
        onBackToLogin={() => {
          clearPasswordRecovery();
          setAuthView('login');
        }}
      />
    );
  }

  if (!isAuthenticated) {
    if (authView === 'signup') {
      return (
        <SignupPage
          isConfigured={isConfigured}
          onNavigateToLogin={() => setAuthView('login')}
          onSignupAuthenticated={() => setActivePage('dashboard')}
        />
      );
    }

    if (authView === 'forgot-password') {
      return (
        <ForgotPasswordPage
          isConfigured={isConfigured}
          onNavigateToLogin={() => setAuthView('login')}
        />
      );
    }

    return (
      <LoginPage
        isConfigured={isConfigured}
        onNavigateToSignup={() => setAuthView('signup')}
        onNavigateToForgotPassword={() => setAuthView('forgot-password')}
        onLoginSuccess={() => setActivePage('dashboard')}
      />
    );
  }

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] dark:bg-slate-950 text-[#0F172A] dark:text-slate-100">
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        onOpenHelp={() => setHelpOpen(true)}
        userName={userName}
        userEmail={userEmail}
        onSignOut={handleSignOut}
        activeJobsCount={activeJobsCount}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopHeader
          pageTitle={PAGE_TITLES[activePage]}
          searchQuery={globalSearch}
          onSearchChange={setGlobalSearch}
          onNavigate={setActivePage}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          notifications={notifications}
          onMarkAllRead={handleMarkAllRead}
          onSelectNotification={handleSelectNotification}
          settings={settings}
          userName={userName}
          userEmail={userEmail}
          onSignOut={handleSignOut}
          onToggleTheme={handleToggleTheme}
          jobs={jobs}
          records={records}
        />

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1440px] w-full mx-auto">
          {activePage === 'dashboard' && (
            <DashboardPage
              jobs={jobs}
              records={records}
              exports={exports}
              userName={userName}
              userEmail={userEmail}
              onSignOut={handleSignOut}
              onNavigate={setActivePage}
              onDownloadExport={handleDownloadSavedExport}
            />
          )}

          {activePage === 'import' && (
            <ImportReelsPage
              existingShortcodes={existingShortcodes}
              onCreateImportJob={handleCreateImportJob}
              onAddToast={addToast}
            />
          )}

          {activePage === 'jobs' && (
            <ProcessingJobsPage
              jobs={jobs}
              onRetryJob={handleRetryJob}
              onDeleteJob={handleDeleteJob}
              onNavigate={setActivePage}
            />
          )}

          {activePage === 'extracted' && (
            <ExtractedDataPage
              records={records}
              globalSearchQuery={globalSearch}
              onExportCsv={handleExportCsv}
              onNavigate={setActivePage}
              onAddToast={addToast}
            />
          )}

          {activePage === 'exports' && (
            <ExportHistoryPage
              exports={exports}
              onDownloadExport={handleDownloadSavedExport}
              onDeleteExport={handleDeleteExport}
              onNavigate={setActivePage}
            />
          )}

          {activePage === 'instagram' && (
            <InstagramConnectionPage onAddToast={addToast} />
          )}

          {activePage === 'settings' && (
            <SettingsPage
              settings={settings}
              userName={userName}
              userEmail={userEmail}
              onSignOut={handleSignOut}
              onUpdateSettings={setSettings}
              onResetDemoWorkspace={handleResetDemoWorkspace}
              onAddToast={addToast}
            />
          )}
        </main>
      </div>

      <HelpSupportModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        onNavigateToImport={() => setActivePage('import')}
        onNavigateToSettings={() => setActivePage('settings')}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
