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
  cleanupInstagramSession,
  completeInstagramLoginSession,
  disconnectInstagramConnection,
  fetchInstagramConnectionStatus,
  fetchLoginSessionFrame,
  markInstagramSessionEnded,
  registerActiveInstagramSession,
  sendLoginSessionInput,
  startInstagramLoginSession,
  updateActiveInstagramSessionToken,
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
const MAX_TRANSIENT_FRAME_RETRIES = 5;
const TRANSIENT_BACKOFF_DELAYS_MS = [2000, 4000, 8000, 15000, 15000];

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

function formatApiError(err: unknown, fallback: string): string {
  if (err instanceof ApiRequestError) {
    const rawMsg = typeof err.message === 'string' ? err.message.trim() : '';
    if (err.status > 0) {
      const prefix = `[HTTP ${err.status}]`;
      if (!rawMsg) {
        return `${prefix} ${fallback}`;
      }
      return rawMsg.startsWith(prefix) ? rawMsg : `${prefix} ${rawMsg}`;
    }
    return rawMsg || fallback;
  }
  if (err instanceof Error && typeof err.message === 'string' && err.message.trim()) {
    return err.message.trim();
  }
  return fallback;
}

function formatConnectionTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }
  try {
    const formatted = formatShortDate(trimmed);
    return typeof formatted === 'string' ? formatted : trimmed;
  } catch {
    return trimmed;
  }
}

function isTransientRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600) || status === 0;
}

export function InstagramConnectionPage({
  onAddToast,
}: InstagramConnectionPageProps) {
  const { isAuthenticated, user, session } = useAuth();
  const currentUserId = user?.id ?? null;
  const currentAccessToken = session?.access_token ?? null;

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
  const currentUserIdRef = useRef<string | null>(currentUserId);
  const accessTokenRef = useRef<string | null>(currentAccessToken);
  const activeSessionIdRef = useRef<string | null>(null);
  const activeSessionOwnerRef = useRef<string | null>(null);
  const consecutiveFrameErrorsRef = useRef<number>(0);
  const prevUserIdRef = useRef<string | null>(currentUserId);

  currentUserIdRef.current = currentUserId;
  accessTokenRef.current = currentAccessToken;

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
    consecutiveFrameErrorsRef.current = 0;
  }, []);

  const clearLocalSessionState = useCallback(() => {
    activeSessionIdRef.current = null;
    activeSessionOwnerRef.current = null;
    stopPolling();
    revokeCurrentFrameUrl();
    setSessionId(null);
    setRemainingSeconds(0);
    setRelayText('');
  }, [stopPolling, revokeCurrentFrameUrl]);

  // Sync refreshed access token into active session record (in memory only)
  useEffect(() => {
    if (sessionId && currentUserId) {
      updateActiveInstagramSessionToken(
        sessionId,
        currentUserId,
        currentAccessToken
      );
    }
  }, [sessionId, currentUserId, currentAccessToken]);

  // Isolate session state per authenticated user
  useEffect(() => {
    if (prevUserIdRef.current !== currentUserId) {
      prevUserIdRef.current = currentUserId;
      clearLocalSessionState();
      setConnectedAt(null);
      setUpdatedAt(null);
      setStatusError(null);
      setBrowserError(null);
      setFrameError(null);
      setConfirmDisconnectOpen(false);
      setUiStatus('Disconnected');
    }
  }, [currentUserId, clearLocalSessionState]);

  const refreshConnectionStatus = useCallback(async () => {
    if (!isAuthenticated || !currentUserId) {
      setStatusLoading(false);
      return;
    }

    setStatusLoading(true);
    setStatusError(null);
    try {
      const data = await fetchInstagramConnectionStatus();
      if (currentUserIdRef.current !== currentUserId) {
        return;
      }

      const rawStatus =
        typeof data?.status === 'string' ? data.status.trim().toLowerCase() : '';
      setConnectedAt(
        typeof data?.connectedAt === 'string' && data.connectedAt.trim()
          ? data.connectedAt.trim()
          : null
      );
      setUpdatedAt(
        typeof data?.updatedAt === 'string' && data.updatedAt.trim()
          ? data.updatedAt.trim()
          : null
      );

      if (rawStatus === 'connected') {
        setUiStatus('Connected');
      } else if (rawStatus === 'expired' || rawStatus === 'session_expired') {
        setUiStatus('Session expired');
      } else {
        setUiStatus('Disconnected');
      }
    } catch (err) {
      if (currentUserIdRef.current !== currentUserId) {
        return;
      }
      setStatusError(
        formatApiError(err, 'Unable to fetch Instagram connection status.')
      );
      setUiStatus('Error');
    } finally {
      setStatusLoading(false);
    }
  }, [isAuthenticated, currentUserId]);

  useEffect(() => {
    void refreshConnectionStatus();
  }, [refreshConnectionStatus]);

  // Clean up timers, object URLs, and active remote login session on unmount
  useEffect(() => {
    return () => {
      const activeId = activeSessionIdRef.current;
      const ownerId = activeSessionOwnerRef.current;
      activeSessionIdRef.current = null;
      activeSessionOwnerRef.current = null;
      stopPolling();
      revokeCurrentFrameUrl();
      if (activeId && ownerId && ownerId === currentUserIdRef.current) {
        void cleanupInstagramSession(activeId, {
          expectedUserId: ownerId,
          keepalive: true,
          accessTokenOverride: accessTokenRef.current,
        });
      }
    };
  }, [stopPolling, revokeCurrentFrameUrl]);

  // Best-effort cleanup on browser tab close or page refresh
  useEffect(() => {
    if (!sessionId) return;

    const handleUnload = () => {
      const activeId = activeSessionIdRef.current;
      const ownerId = activeSessionOwnerRef.current;
      if (activeId && ownerId && ownerId === currentUserIdRef.current) {
        void cleanupInstagramSession(activeId, {
          expectedUserId: ownerId,
          keepalive: true,
          accessTokenOverride: accessTokenRef.current,
        });
      }
    };

    window.addEventListener('pagehide', handleUnload);
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('pagehide', handleUnload);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [sessionId]);

  // Countdown tick for active 10-minute session
  useEffect(() => {
    if (!sessionId) return;

    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [sessionId]);

  // Handle local session expiry when countdown reaches zero
  useEffect(() => {
    if (!sessionId || remainingSeconds > 0) return;

    const expiredId = sessionId;
    const ownerId = activeSessionOwnerRef.current;
    clearLocalSessionState();
    setUiStatus('Session expired');
    setBrowserError(
      'The 10-minute interactive login session expired. Start a new session to try again.'
    );
    if (ownerId && ownerId === currentUserIdRef.current) {
      void cleanupInstagramSession(expiredId, {
        expectedUserId: ownerId,
        keepalive: true,
        accessTokenOverride: accessTokenRef.current,
      });
    }
  }, [sessionId, remainingSeconds, clearLocalSessionState]);

  const loadFrameOnce = useCallback(
    async (
      activeSessionId: string
    ): Promise<{ shouldContinue: boolean; nextDelayMs: number }> => {
      if (activeSessionIdRef.current !== activeSessionId) {
        return { shouldContinue: false, nextDelayMs: 0 };
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const blob = await fetchLoginSessionFrame(activeSessionId, controller.signal);
        if (
          controller.signal.aborted ||
          activeSessionIdRef.current !== activeSessionId
        ) {
          return { shouldContinue: false, nextDelayMs: 0 };
        }

        const nextObjectUrl = URL.createObjectURL(blob);
        if (frameObjectUrlRef.current) {
          URL.revokeObjectURL(frameObjectUrlRef.current);
        }
        frameObjectUrlRef.current = nextObjectUrl;
        consecutiveFrameErrorsRef.current = 0;
        setFrameUrl(nextObjectUrl);
        setFrameLoading(false);
        setFrameError(null);
        return { shouldContinue: true, nextDelayMs: FRAME_POLL_INTERVAL_MS };
      } catch (err) {
        if (
          controller.signal.aborted ||
          activeSessionIdRef.current !== activeSessionId
        ) {
          return { shouldContinue: false, nextDelayMs: 0 };
        }

        setFrameLoading(false);

        if (err instanceof ApiRequestError && err.status === 404) {
          markInstagramSessionEnded(activeSessionId, activeSessionOwnerRef.current);
          clearLocalSessionState();
          setUiStatus('Session expired');
          setBrowserError(
            formatApiError(err, 'Interactive browser session expired or closed.')
          );
          return { shouldContinue: false, nextDelayMs: 0 };
        }

        if (
          err instanceof ApiRequestError &&
          (err.status === 401 || err.status === 403)
        ) {
          markInstagramSessionEnded(activeSessionId, activeSessionOwnerRef.current);
          clearLocalSessionState();
          setUiStatus('Error');
          setStatusError(
            formatApiError(
              err,
              'Your authentication session is no longer valid for this Instagram login session.'
            )
          );
          return { shouldContinue: false, nextDelayMs: 0 };
        }

        const status = err instanceof ApiRequestError ? err.status : 0;
        if (isTransientRetryableStatus(status)) {
          const attempt = consecutiveFrameErrorsRef.current + 1;
          consecutiveFrameErrorsRef.current = attempt;
          const baseMessage = formatApiError(
            err,
            'Temporary error fetching browser frame.'
          );

          if (attempt > MAX_TRANSIENT_FRAME_RETRIES) {
            setFrameError(
              `${baseMessage} Frame polling paused after ${MAX_TRANSIENT_FRAME_RETRIES} attempts. Click Refresh frame to retry or Cancel to close.`
            );
            return { shouldContinue: false, nextDelayMs: 0 };
          }

          const delayMs =
            TRANSIENT_BACKOFF_DELAYS_MS[
              Math.min(attempt - 1, TRANSIENT_BACKOFF_DELAYS_MS.length - 1)
            ];
          setFrameError(
            `${baseMessage} Retrying in ${Math.round(delayMs / 1000)}s (${attempt}/${MAX_TRANSIENT_FRAME_RETRIES})...`
          );
          return { shouldContinue: true, nextDelayMs: delayMs };
        }

        setFrameError(formatApiError(err, 'Unable to fetch browser frame.'));
        return { shouldContinue: false, nextDelayMs: 0 };
      }
    },
    [clearLocalSessionState]
  );

  // Poll JPEG frames while a login session is active, with bounded backoff on temporary errors
  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;
    consecutiveFrameErrorsRef.current = 0;
    setFrameLoading(true);
    setFrameError(null);

    const tick = async () => {
      if (cancelled || activeSessionIdRef.current !== sessionId) return;
      const { shouldContinue, nextDelayMs } = await loadFrameOnce(sessionId);
      if (
        !cancelled &&
        shouldContinue &&
        activeSessionIdRef.current === sessionId
      ) {
        pollTimerRef.current = window.setTimeout(() => {
          void tick();
        }, nextDelayMs);
      }
    };

    void tick();

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [sessionId, loadFrameOnce, stopPolling]);

  const handleManualRefreshFrame = useCallback(() => {
    if (!sessionId) return;
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    consecutiveFrameErrorsRef.current = 0;
    setFrameError(null);

    void loadFrameOnce(sessionId).then(({ shouldContinue, nextDelayMs }) => {
      if (shouldContinue && activeSessionIdRef.current === sessionId) {
        const loop = async () => {
          if (activeSessionIdRef.current !== sessionId) return;
          const next = await loadFrameOnce(sessionId);
          if (next.shouldContinue && activeSessionIdRef.current === sessionId) {
            pollTimerRef.current = window.setTimeout(() => {
              void loop();
            }, next.nextDelayMs);
          }
        };
        pollTimerRef.current = window.setTimeout(() => {
          void loop();
        }, nextDelayMs);
      }
    });
  }, [sessionId, loadFrameOnce]);

  const handleStartSession = async () => {
    const requestUserId = currentUserIdRef.current;
    if (!isAuthenticated || !requestUserId) {
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
      const sessionData = await startInstagramLoginSession();
      if (currentUserIdRef.current !== requestUserId) {
        // User signed out or switched accounts while request was in flight
        void cleanupInstagramSession(sessionData.sessionId, {
          expectedUserId: requestUserId,
          keepalive: true,
        });
        return;
      }

      registerActiveInstagramSession(
        sessionData.sessionId,
        requestUserId,
        accessTokenRef.current
      );
      activeSessionIdRef.current = sessionData.sessionId;
      activeSessionOwnerRef.current = requestUserId;
      setRemainingSeconds(sessionData.expiresInSeconds || 600);
      setSessionId(sessionData.sessionId);
      setUiStatus('Connecting');
      onAddToast({
        type: 'info',
        title: 'Browser session started',
        message:
          'Sign in inside the embedded Instagram browser, then click Finish & Save Connection.',
      });
    } catch (err) {
      if (currentUserIdRef.current !== requestUserId) {
        return;
      }

      if (err instanceof ApiRequestError && err.status === 429) {
        const message = formatApiError(
          err,
          'All interactive browser slots are currently in use. Please try again shortly.'
        );
        const retryMessage = message.toLowerCase().includes('try again') || message.toLowerCase().includes('retry')
          ? message
          : `${message} Please wait a moment and click Connect Instagram to retry.`;
        setStatusError(retryMessage);
        setUiStatus((prev) => (prev === 'Error' ? 'Disconnected' : prev));
        onAddToast({
          type: 'warning',
          title: 'Browser slots currently occupied',
          message: retryMessage,
        });
        return;
      }

      const message = formatApiError(
        err,
        'Unable to start interactive Instagram login session.'
      );
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
      clearLocalSessionState();
      setUiStatus('Session expired');
      setBrowserError(message);
    },
    [clearLocalSessionState]
  );

  const relayInput = useCallback(
    async (
      activeSessionId: string,
      payload: Parameters<typeof sendLoginSessionInput>[1]
    ) => {
      if (activeSessionIdRef.current !== activeSessionId) return;
      setSendingInput(true);
      setBrowserError(null);
      try {
        await sendLoginSessionInput(activeSessionId, payload);
        if (activeSessionIdRef.current === activeSessionId) {
          window.setTimeout(() => {
            if (activeSessionIdRef.current === activeSessionId) {
              void loadFrameOnce(activeSessionId);
            }
          }, 180);
        }
      } catch (err) {
        if (activeSessionIdRef.current !== activeSessionId) return;

        if (err instanceof ApiRequestError && err.status === 404) {
          markInstagramSessionEnded(activeSessionId, activeSessionOwnerRef.current);
          handleSessionExpiredDuringInput(
            formatApiError(err, 'Browser session expired or not found.')
          );
          return;
        }

        if (
          err instanceof ApiRequestError &&
          (err.status === 401 || err.status === 403)
        ) {
          markInstagramSessionEnded(activeSessionId, activeSessionOwnerRef.current);
          clearLocalSessionState();
          setUiStatus('Error');
          setStatusError(
            formatApiError(
              err,
              'Your authentication session is no longer valid.'
            )
          );
          return;
        }

        setBrowserError(formatApiError(err, 'Unable to send browser input.'));
      } finally {
        setSendingInput(false);
      }
    },
    [loadFrameOnce, handleSessionExpiredDuringInput, clearLocalSessionState]
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
    const activeId = sessionId;
    if (!activeId) return;

    setCompletingSession(true);
    setBrowserError(null);
    try {
      const result = await completeInstagramLoginSession(activeId);
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

      markInstagramSessionEnded(activeId, activeSessionOwnerRef.current);
      clearLocalSessionState();
      await refreshConnectionStatus();
      onAddToast({
        type: 'success',
        title: 'Instagram connected',
        message: 'Encrypted Instagram session saved on the backend.',
      });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) {
        markInstagramSessionEnded(activeId, activeSessionOwnerRef.current);
        handleSessionExpiredDuringInput(
          formatApiError(err, 'Browser session expired or not found.')
        );
        return;
      }

      if (
        err instanceof ApiRequestError &&
        (err.status === 401 || err.status === 403)
      ) {
        markInstagramSessionEnded(activeId, activeSessionOwnerRef.current);
        clearLocalSessionState();
        const message = formatApiError(
          err,
          'Your authentication session is no longer valid.'
        );
        setStatusError(message);
        setUiStatus('Error');
        onAddToast({
          type: 'error',
          title: 'Authentication error',
          message,
        });
        return;
      }

      const message = formatApiError(err, 'Unable to save Instagram connection.');
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
    const activeId = sessionId || activeSessionIdRef.current;
    const ownerId = activeSessionOwnerRef.current;
    setCancelingSession(true);
    clearLocalSessionState();
    setBrowserError(null);
    setFrameError(null);

    try {
      if (activeId) {
        await cancelInstagramLoginSession(activeId, { expectedUserId: ownerId });
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
      clearLocalSessionState();
      await refreshConnectionStatus();
      onAddToast({
        type: 'info',
        title: 'Instagram disconnected',
        message: 'Your stored Instagram session has been deleted from the backend.',
      });
    } catch (err) {
      const message = formatApiError(err, 'Unable to disconnect Instagram.');
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

  const formattedConnectedAt = formatConnectionTimestamp(connectedAt);
  const formattedUpdatedAt = formatConnectionTimestamp(updatedAt);

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
        {uiStatus === 'Connected' && (formattedConnectedAt || formattedUpdatedAt) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            {formattedConnectedAt && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800 px-4 py-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Connected on
                </div>
                <div className="mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                  {formattedConnectedAt}
                </div>
              </div>
            )}
            {formattedUpdatedAt && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800 px-4 py-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Last verified
                </div>
                <div className="mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                  {formattedUpdatedAt}
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
                onClick={handleManualRefreshFrame}
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
