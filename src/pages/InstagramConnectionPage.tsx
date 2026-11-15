import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Globe,
  Info,
  KeyRound,
  Loader2,
  MousePointerClick,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Unplug,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  ApiRequestError,
  cancelInstagramLoginSession,
  completeInstagramLoginSession,
  disconnectInstagramConnection,
  fetchInstagramConnectionStatus,
  fetchLoginSessionFrame,
  sendLoginSessionInput,
  startInstagramLoginSession,
} from '../services/instagramConnectionService';
import { formatShortDate } from '../services/reelDataService';
import type {
  AllowedBrowserKey,
  InstagramConnectionUiStatus,
  ToastMessage,
} from '../types/reeldata';

interface InstagramConnectionPageProps {
  onAddToast: (toast: Omit<ToastMessage, 'id'>) => void;
}

const BROWSER_VIEWPORT_WIDTH = 1280;
const BROWSER_VIEWPORT_HEIGHT = 800;
const FRAME_POLL_INTERVAL_MS = 1000;

const SPECIAL_KEY_SET = new Set<AllowedBrowserKey>([
  'Enter',
  'Tab',
  'Backspace',
  'Delete',
  'Escape',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  ' ',
]);

const QUICK_KEYS: { label: string; key: AllowedBrowserKey }[] = [
  { label: 'Enter', key: 'Enter' },
  { label: 'Tab', key: 'Tab' },
  { label: 'Backspace', key: 'Backspace' },
  { label: 'Delete', key: 'Delete' },
  { label: 'Escape', key: 'Escape' },
  { label: 'Space', key: ' ' },
  { label: 'Up', key: 'ArrowUp' },
  { label: 'Down', key: 'ArrowDown' },
  { label: 'Left', key: 'ArrowLeft' },
  { label: 'Right', key: 'ArrowRight' },
  { label: 'Home', key: 'Home' },
  { label: 'End', key: 'End' },
];

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function InstagramConnectionPage({
  onAddToast,
}: InstagramConnectionPageProps) {
  const { isAuthenticated } = useAuth();

  const [uiStatus, setUiStatus] = useState<InstagramConnectionUiStatus>('Disconnected');
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState<boolean>(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [startingSession, setStartingSession] = useState<boolean>(false);
  const [completingSession, setCompletingSession] = useState<boolean>(false);
  const [cancelingSession, setCancelingSession] = useState<boolean>(false);

  const [confirmDisconnectOpen, setConfirmDisconnectOpen] = useState<boolean>(false);
  const [disconnecting, setDisconnecting] = useState<boolean>(false);

  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [frameLoading, setFrameLoading] = useState<boolean>(false);
  const [frameError, setFrameError] = useState<string | null>(null);
  const [browserError, setBrowserError] = useState<string | null>(null);

  // Ephemeral input box for direct text relay (never persisted or logged)
  const [relayText, setRelayText] = useState<string>('');
  const [sendingInput, setSendingInput] = useState<boolean>(false);

  const frameObjectUrlRef = useRef<string | null>(null);
  const browserImgRef = useRef<HTMLImageElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastScrollSentRef = useRef<number>(0);
  const typeBufferRef = useRef<string>('');
  const typeFlushTimerRef = useRef<number | null>(null);

  const revokeCurrentFrameUrl = useCallback(() => {
    if (frameObjectUrlRef.current) {
      URL.revokeObjectURL(frameObjectUrlRef.current);
      frameObjectUrlRef.current = null;
    }
    setFrameUrl(null);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (typeFlushTimerRef.current !== null) {
      window.clearTimeout(typeFlushTimerRef.current);
      typeFlushTimerRef.current = null;
    }
    typeBufferRef.current = '';
  }, []);

  const refreshConnectionStatus = useCallback(async () => {
    if (!isAuthenticated) {
      setStatusLoading(false);
      return;
    }

    setStatusLoading(true);
    setStatusError(null);
    try {
      const data = await fetchInstagramConnectionStatus();
      const normalized = (data.status || '').toLowerCase();
      setConnectedAt(data.connectedAt ?? null);
      setUpdatedAt(data.updatedAt ?? null);

      if (normalized === 'connected') {
        setUiStatus('Connected');
      } else if (normalized === 'expired' || normalized === 'session_expired') {
        setUiStatus('Session expired');
      } else {
        setUiStatus('Disconnected');
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to fetch Instagram connection status.';
      setStatusError(message);
      setUiStatus('Error');
    } finally {
      setStatusLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void refreshConnectionStatus();
  }, [refreshConnectionStatus]);

  // Clean up timers, abort controllers, and object URLs on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      revokeCurrentFrameUrl();
    };
  }, [stopPolling, revokeCurrentFrameUrl]);

  // Countdown timer for active 10-minute session
  useEffect(() => {
    if (!sessionId || remainingSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          stopPolling();
          revokeCurrentFrameUrl();
          setSessionId(null);
          setUiStatus('Session expired');
          setBrowserError(
            'The 10-minute interactive login session expired. Start a new session to try again.'
          );
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [sessionId, remainingSeconds, stopPolling, revokeCurrentFrameUrl]);

  const loadFrameOnce = useCallback(
    async (activeSessionId: string): Promise<boolean> => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const blob = await fetchLoginSessionFrame(activeSessionId, controller.signal);
        if (controller.signal.aborted) return false;

        const nextObjectUrl = URL.createObjectURL(blob);
        if (frameObjectUrlRef.current) {
          URL.revokeObjectURL(frameObjectUrlRef.current);
        }
        frameObjectUrlRef.current = nextObjectUrl;
        setFrameUrl(nextObjectUrl);
        setFrameLoading(false);
        setFrameError(null);
        return true;
      } catch (err) {
        if (controller.signal.aborted) return false;

        if (err instanceof ApiRequestError && err.status === 404) {
          stopPolling();
          revokeCurrentFrameUrl();
          setSessionId(null);
          setRemainingSeconds(0);
          setUiStatus('Session expired');
          setBrowserError(
            err.message || 'Interactive browser session expired or closed.'
          );
          return false;
        }

        setFrameLoading(false);
        setFrameError(
          err instanceof Error ? err.message : 'Unable to fetch browser frame.'
        );
        return true;
      }
    },
    [stopPolling, revokeCurrentFrameUrl]
  );

  // Poll JPEG frames roughly every second while a login session is active
  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;
    setFrameLoading(true);
    setFrameError(null);

    const tick = async () => {
      if (cancelled) return;
      const shouldContinue = await loadFrameOnce(sessionId);
      if (!cancelled && shouldContinue) {
        pollTimerRef.current = window.setTimeout(() => {
          void tick();
        }, FRAME_POLL_INTERVAL_MS);
      }
    };

    void tick();

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [sessionId, loadFrameOnce, stopPolling]);

  const handleStartSession = async () => {
    if (!isAuthenticated) {
      onAddToast({
        type: 'error',
        title: 'Authentication required',
        message: 'Sign in before connecting your Instagram account.',
      });
      return;
    }

    setStartingSession(true);
    setBrowserError(null);
    setStatusError(null);
    setFrameError(null);
    revokeCurrentFrameUrl();

    try {
      const session = await startInstagramLoginSession();
      setSessionId(session.sessionId);
      setRemainingSeconds(session.expiresInSeconds || 600);
      setUiStatus('Connecting');
      onAddToast({
        type: 'info',
        title: 'Browser session started',
        message: 'Sign in inside the embedded Instagram browser, then click Finish & Save Connection.',
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to start interactive Instagram login session.';
      setStatusError(message);
      setUiStatus('Error');
      onAddToast({
        type: 'error',
        title: 'Could not start login session',
        message,
      });
    } finally {
      setStartingSession(false);
    }
  };

  const handleSessionExpiredDuringInput = useCallback(
    (message: string) => {
      stopPolling();
      revokeCurrentFrameUrl();
      setSessionId(null);
      setRemainingSeconds(0);
      setUiStatus('Session expired');
      setBrowserError(message);
    },
    [stopPolling, revokeCurrentFrameUrl]
  );

  const relayInput = useCallback(
    async (
      activeSessionId: string,
      payload: Parameters<typeof sendLoginSessionInput>[1]
    ) => {
      setSendingInput(true);
      setBrowserError(null);
      try {
        await sendLoginSessionInput(activeSessionId, payload);
        window.setTimeout(() => {
          void loadFrameOnce(activeSessionId);
        }, 180);
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) {
          handleSessionExpiredDuringInput(
            err.message || 'Browser session expired or not found.'
          );
          return;
        }
        setBrowserError(
          err instanceof Error ? err.message : 'Unable to send browser input.'
        );
      } finally {
        setSendingInput(false);
      }
    },
    [loadFrameOnce, handleSessionExpiredDuringInput]
  );

  const handleBrowserClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!sessionId || !browserImgRef.current) return;

    const rect = browserImgRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const scaledX = Math.round(
      ((e.clientX - rect.left) / rect.width) * BROWSER_VIEWPORT_WIDTH
    );
    const scaledY = Math.round(
      ((e.clientY - rect.top) / rect.height) * BROWSER_VIEWPORT_HEIGHT
    );

    const x = Math.max(0, Math.min(BROWSER_VIEWPORT_WIDTH, scaledX));
    const y = Math.max(0, Math.min(BROWSER_VIEWPORT_HEIGHT, scaledY));

    viewportRef.current?.focus();

    void relayInput(sessionId, { action: 'click', x, y });
  };

  const flushTypedBuffer = useCallback(
    (activeSessionId: string) => {
      const pendingText = typeBufferRef.current;
      typeBufferRef.current = '';
      typeFlushTimerRef.current = null;
      if (!pendingText) return;
      void relayInput(activeSessionId, { action: 'type', text: pendingText });
    },
    [relayInput]
  );

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !sessionId) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const now = Date.now();
      if (now - lastScrollSentRef.current < 160) return;
      lastScrollSentRef.current = now;

      const deltaY = Math.max(-1200, Math.min(1200, Math.round(event.deltaY)));
      if (deltaY === 0) return;

      void relayInput(sessionId, { action: 'scroll', deltaY });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [sessionId, relayInput]);

  const handleBrowserKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!sessionId) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (SPECIAL_KEY_SET.has(e.key as AllowedBrowserKey)) {
      e.preventDefault();
      if (typeBufferRef.current) {
        if (typeFlushTimerRef.current !== null) {
          window.clearTimeout(typeFlushTimerRef.current);
        }
        flushTypedBuffer(sessionId);
      }
      void relayInput(sessionId, {
        action: 'press',
        key: e.key as AllowedBrowserKey,
      });
      return;
    }

    if (e.key.length === 1) {
      e.preventDefault();
      typeBufferRef.current += e.key;
      if (typeFlushTimerRef.current !== null) {
        window.clearTimeout(typeFlushTimerRef.current);
      }
      const activeSessionId = sessionId;
      typeFlushTimerRef.current = window.setTimeout(() => {
        flushTypedBuffer(activeSessionId);
      }, 90);
    }
  };

  const handleSendRelayText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId || !relayText) return;

    const textToSend = relayText;
    setRelayText('');
    await relayInput(sessionId, { action: 'type', text: textToSend });
  };

  const handleCompleteConnection = async () => {
    if (!sessionId) return;

    setCompletingSession(true);
    setBrowserError(null);
    try {
      const result = await completeInstagramLoginSession(sessionId);
      if (!result.connected) {
        setBrowserError(
          result.message ||
            'Please finish logging in inside the Instagram browser first before saving the connection.'
        );
        onAddToast({
          type: 'warning',
          title: 'Login not finished yet',
          message: 'Finish logging in inside Instagram (including any 2FA or CAPTCHA prompts) first.',
        });
        return;
      }

      stopPolling();
      revokeCurrentFrameUrl();
      setSessionId(null);
      setRemainingSeconds(0);
      setRelayText('');
      await refreshConnectionStatus();
      onAddToast({
        type: 'success',
        title: 'Instagram connected',
        message: 'Encrypted Instagram session saved on the backend.',
      });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) {
        handleSessionExpiredDuringInput(
          err.message || 'Browser session expired or not found.'
        );
        return;
      }

      const message =
        err instanceof Error ? err.message : 'Unable to save Instagram connection.';
      setBrowserError(message);
      onAddToast({
        type: 'error',
        title: 'Connection save failed',
        message,
      });
    } finally {
      setCompletingSession(false);
    }
  };

  const handleCancelLogin = async () => {
    const activeId = sessionId;
    setCancelingSession(true);
    stopPolling();
    revokeCurrentFrameUrl();
    setRelayText('');
    setBrowserError(null);
    setFrameError(null);
    setSessionId(null);
    setRemainingSeconds(0);

    try {
      if (activeId) {
        await cancelInstagramLoginSession(activeId);
      }
    } catch {
      // Even if cleanup returns an error or 404, local session state is cleared
    } finally {
      setCancelingSession(false);
      await refreshConnectionStatus();
      onAddToast({
        type: 'info',
        title: 'Login session canceled',
        message: 'Interactive Instagram browser closed.',
      });
    }
  };

  const handleConfirmDisconnect = async () => {
    setDisconnecting(true);
    setStatusError(null);
    try {
      await disconnectInstagramConnection();
      setConfirmDisconnectOpen(false);
      await refreshConnectionStatus();
      onAddToast({
        type: 'info',
        title: 'Instagram disconnected',
        message: 'Your stored Instagram session has been deleted from the backend.',
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to disconnect Instagram.';
      setStatusError(message);
      setUiStatus('Error');
      onAddToast({
        type: 'error',
        title: 'Disconnect failed',
        message,
      });
    } finally {
      setDisconnecting(false);
    }
  };

  const renderStatusBadge = () => {
    switch (uiStatus) {
      case 'Connected':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 rounded-lg">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Connected</span>
          </span>
        );
      case 'Connecting':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 px-2.5 py-1 rounded-lg">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Connecting</span>
          </span>
        );
      case 'Session expired':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded-lg">
            <Clock className="w-3.5 h-3.5" />
            <span>Session expired</span>
          </span>
        );
      case 'Error':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 px-2.5 py-1 rounded-lg">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Error</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg">
            <XCircle className="w-3.5 h-3.5" />
            <span>Disconnected</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Connection Status Card */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
                Instagram Connection
              </h2>
              {statusLoading ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Checking status...</span>
                </span>
              ) : (
                renderStatusBadge()
              )}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Connect your Instagram account to start collecting Reel data.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => void refreshConnectionStatus()}
              disabled={statusLoading || !isAuthenticated}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${statusLoading ? 'animate-spin' : ''}`}
              />
              <span>Refresh Status</span>
            </button>

            {uiStatus === 'Connected' && !sessionId && (
              <button
                type="button"
                onClick={() => setConfirmDisconnectOpen(true)}
                disabled={!isAuthenticated || disconnecting}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100/70 dark:hover:bg-rose-950/70 disabled:opacity-50 transition-colors"
              >
                <Unplug className="w-4 h-4" />
                <span>Disconnect</span>
              </button>
            )}

            {uiStatus !== 'Connected' && !sessionId && (
              <button
                type="button"
                onClick={() => void handleStartSession()}
                disabled={!isAuthenticated || startingSession || statusLoading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {startingSession ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Starting browser...</span>
                  </>
                ) : (
                  <>
                    <Globe className="w-4 h-4" />
                    <span>Connect Instagram</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Connected Metadata */}
        {uiStatus === 'Connected' && (connectedAt || updatedAt) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            {connectedAt && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800 px-4 py-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Connected on
                </div>
                <div className="mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                  {formatShortDate(connectedAt)}
                </div>
              </div>
            )}
            {updatedAt && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800 px-4 py-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Last verified
                </div>
                <div className="mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                  {formatShortDate(updatedAt)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Status Error Alert */}
        {statusError && (
          <div
            role="alert"
            className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-4 flex items-start gap-3 text-xs text-rose-700 dark:text-rose-300 leading-relaxed"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            <span>{statusError}</span>
          </div>
        )}

        {/* Security & Session Policy Notes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="rounded-xl bg-slate-50/80 dark:bg-slate-950/50 border border-slate-200/70 dark:border-slate-800 p-3.5 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              <span className="font-semibold text-slate-900 dark:text-slate-200">
                No plaintext password storage:
              </span>{' '}
              ReelData relays your interactions directly to the real Instagram browser and never stores your Instagram password as plaintext.
            </div>
          </div>

          <div className="rounded-xl bg-slate-50/80 dark:bg-slate-950/50 border border-slate-200/70 dark:border-slate-800 p-3.5 flex items-start gap-2.5">
            <KeyRound className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              <span className="font-semibold text-slate-900 dark:text-slate-200">
                2FA &amp; CAPTCHA support:
              </span>{' '}
              Instagram may prompt for two-factor verification or security challenges. Complete those steps directly inside the browser view.
            </div>
          </div>

          <div className="rounded-xl bg-slate-50/80 dark:bg-slate-950/50 border border-slate-200/70 dark:border-slate-800 p-3.5 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              <span className="font-semibold text-slate-900 dark:text-slate-200">
                10-minute single session:
              </span>{' '}
              Interactive login sessions expire after 10 minutes, and only one active login session is allowed at a time.
            </div>
          </div>
        </div>
      </div>

      {/* Embedded Real Browser Session Panel */}
      {sessionId && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 overflow-hidden">
          {/* Toolbar */}
          <div className="px-5 py-4 border-b border-slate-200/80 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800 px-2.5 py-1 rounded-lg">
                <Globe className="w-3.5 h-3.5" />
                <span>Live Instagram Browser (1280 × 800)</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Expires in {formatCountdown(remainingSeconds)}</span>
              </span>
              {sendingInput && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Relaying input...</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => void handleCancelLogin()}
                disabled={cancelingSession || completingSession}
                className="px-3.5 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {cancelingSession ? 'Canceling...' : 'Cancel'}
              </button>

              <button
                type="button"
                onClick={() => void handleCompleteConnection()}
                disabled={completingSession || cancelingSession}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm disabled:opacity-50 transition-colors"
              >
                {completingSession ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving connection...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Finish &amp; Save Connection</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Inline Browser Error Banner */}
          {(browserError || frameError) && (
            <div
              role="alert"
              className="mx-5 mt-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-3.5 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <span>{browserError || frameError}</span>
            </div>
          )}

          {/* Browser Viewport + Input Controls */}
          <div className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <MousePointerClick className="w-3.5 h-3.5 text-indigo-500" />
                <span>
                  Click inside the browser viewport to focus fields, type directly with your keyboard, or scroll.
                </span>
              </span>
              <button
                type="button"
                onClick={() => sessionId && void loadFrameOnce(sessionId)}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Refresh frame</span>
              </button>
            </div>

            {/* Interactive 1280x800 Viewport Container */}
            <div
              ref={viewportRef}
              tabIndex={0}
              onKeyDown={handleBrowserKeyDown}
              aria-label="Interactive Instagram browser viewport. Click to focus and type."
              className="relative w-full max-w-[1280px] mx-auto aspect-[1280/800] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {frameLoading && !frameUrl && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-slate-300">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                  <span className="text-xs font-medium">
                    Loading live Instagram browser frame...
                  </span>
                </div>
              )}

              {frameUrl && (
                <img
                  ref={browserImgRef}
                  src={frameUrl}
                  alt="Live remote Instagram login browser"
                  onClick={handleBrowserClick}
                  draggable={false}
                  className="w-full h-full object-contain select-none cursor-pointer block"
                />
              )}
            </div>

            {/* Mobile/Fallback Text & Key Controls */}
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
              <form
                onSubmit={handleSendRelayText}
                className="flex flex-col sm:flex-row gap-2.5"
              >
                <input
                  type="text"
                  value={relayText}
                  onChange={(e) => setRelayText(e.target.value)}
                  maxLength={500}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="Optional: type text to relay to the currently focused browser field..."
                  className="flex-1 h-9 px-3 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={!relayText || sendingInput}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 h-9 text-xs font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Text</span>
                </button>
              </form>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">
                  Special keys:
                </span>
                {QUICK_KEYS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    disabled={sendingInput}
                    onClick={() =>
                      sessionId &&
                      void relayInput(sessionId, {
                        action: 'press',
                        key: item.key,
                      })
                    }
                    className="px-2.5 py-1 text-[11px] font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={sendingInput}
                  onClick={() =>
                    sessionId &&
                    void relayInput(sessionId, { action: 'scroll', deltaY: -400 })
                  }
                  className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors ml-auto"
                >
                  Scroll Up
                </button>
                <button
                  type="button"
                  disabled={sendingInput}
                  onClick={() =>
                    sessionId &&
                    void relayInput(sessionId, { action: 'scroll', deltaY: 400 })
                  }
                  className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                >
                  Scroll Down
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect Confirmation Modal */}
      {confirmDisconnectOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-[1px] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="disconnect-modal-title"
          onClick={() => !disconnecting && setConfirmDisconnectOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3
                  id="disconnect-modal-title"
                  className="font-display text-base font-semibold text-slate-900 dark:text-white"
                >
                  Disconnect Instagram account?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  This removes your encrypted Instagram session from the ReelData backend. You will need to sign in again to reconnect.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDisconnectOpen(false)}
                disabled={disconnecting}
                className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                Keep Connected
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDisconnect()}
                disabled={disconnecting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
              >
                {disconnecting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Disconnecting...</span>
                  </>
                ) : (
                  <span>Disconnect Instagram</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
