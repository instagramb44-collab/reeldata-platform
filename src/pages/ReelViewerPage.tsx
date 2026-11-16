import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  ShieldCheck,
  User,
  WifiOff,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  closeReelLookupSession,
  connectReelLookupWebSocket,
  isValidReelLookupBroadcastMessage,
  REEL_LOOKUP_BROADCAST_CHANNEL,
  type ReelLookupWebSocketConnection,
  validateInstagramProfileUrl,
} from '../services/reelProfileService';
import type {
  ReelCreatorProfileResult,
  ReelLookupBroadcastMessage,
  ReelLookupStep,
} from '../types/reeldata';

interface ReelViewerPageProps {
  lookupId: string;
}

type ViewerConnectionState =
  | 'initializing'
  | 'connecting'
  | 'live'
  | 'completed'
  | 'disconnected'
  | 'error'
  | 'closed';

const STEP_LABELS: Record<ReelLookupStep, string> = {
  opening_viewer: 'Preparing secure browser tab...',
  starting_browser: 'Starting isolated remote Chromium browser...',
  loading_session: 'Loading your encrypted Instagram session...',
  navigating: 'Opening Instagram Reel...',
  extracting: 'Extracting Reel creator details...',
  completed: 'Creator details extracted.',
  error: 'Lookup failed.',
  closed: 'Remote browser closed.',
};

export function ReelViewerPage({ lookupId }: ReelViewerPageProps) {
  const { isAuthenticated, isLoading: authLoading, session } = useAuth();
  const accessToken = session?.access_token ?? null;

  const [connectionState, setConnectionState] =
    useState<ViewerConnectionState>('initializing');
  const [step, setStep] = useState<ReelLookupStep>('opening_viewer');
  const [statusMessage, setStatusMessage] = useState<string>(
    'Initializing secure remote browser viewer...'
  );
  const [reelUrl, setReelUrl] = useState<string>('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    lookupId
      ? null
      : 'Missing lookup session identifier. Close this tab and run Find Creator from ReelData.'
  );
  const [result, setResult] = useState<ReelCreatorProfileResult | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [pendingFrameUrl, setPendingFrameUrl] = useState<string | null>(null);

  const accessTokenRef = useRef<string | null>(accessToken);
  const sessionIdRef = useRef<string | null>(null);
  const connectedSessionIdRef = useRef<string | null>(null);
  const wsRef = useRef<ReelLookupWebSocketConnection | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const terminalRef = useRef<boolean>(false);

  const frameUrlRef = useRef<string | null>(null);
  const pendingFrameUrlRef = useRef<string | null>(null);
  const allocatedObjectUrlsRef = useRef<Set<string>>(new Set());
  const urlsPendingRevokeRef = useRef<Set<string>>(new Set());

  accessTokenRef.current = accessToken;

  const revokeSingleObjectUrl = useCallback((url: string | null) => {
    if (!url) return;
    urlsPendingRevokeRef.current.delete(url);
    if (allocatedObjectUrlsRef.current.has(url)) {
      URL.revokeObjectURL(url);
      allocatedObjectUrlsRef.current.delete(url);
    }
  }, []);

  const revokeAllFrameUrls = useCallback(() => {
    for (const url of allocatedObjectUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    allocatedObjectUrlsRef.current.clear();
    urlsPendingRevokeRef.current.clear();
    frameUrlRef.current = null;
    pendingFrameUrlRef.current = null;
    setFrameUrl(null);
    setPendingFrameUrl(null);
  }, []);

  const stageFrameBlob = useCallback(
    (blob: Blob) => {
      const nextUrl = URL.createObjectURL(blob);
      allocatedObjectUrlsRef.current.add(nextUrl);

      if (
        pendingFrameUrlRef.current &&
        pendingFrameUrlRef.current !== frameUrlRef.current
      ) {
        revokeSingleObjectUrl(pendingFrameUrlRef.current);
      }

      pendingFrameUrlRef.current = nextUrl;
      setPendingFrameUrl(nextUrl);
    },
    [revokeSingleObjectUrl]
  );

  const handlePendingFrameLoad = useCallback(
    (loadedUrl: string) => {
      if (pendingFrameUrlRef.current !== loadedUrl) {
        if (
          loadedUrl !== frameUrlRef.current &&
          loadedUrl !== pendingFrameUrlRef.current
        ) {
          revokeSingleObjectUrl(loadedUrl);
        }
        return;
      }

      pendingFrameUrlRef.current = null;
      setPendingFrameUrl(null);

      const previousUrl = frameUrlRef.current;
      if (previousUrl && previousUrl !== loadedUrl) {
        urlsPendingRevokeRef.current.add(previousUrl);
      }

      frameUrlRef.current = loadedUrl;
      setFrameUrl(loadedUrl);
    },
    [revokeSingleObjectUrl]
  );

  const handleVisibleFrameLoad = useCallback(
    (loadedUrl: string) => {
      if (frameUrlRef.current !== loadedUrl) return;
      for (const oldUrl of Array.from(urlsPendingRevokeRef.current)) {
        if (oldUrl !== loadedUrl) {
          revokeSingleObjectUrl(oldUrl);
        }
      }
    },
    [revokeSingleObjectUrl]
  );

  const handlePendingFrameError = useCallback(
    (failedUrl: string) => {
      revokeSingleObjectUrl(failedUrl);
      if (pendingFrameUrlRef.current === failedUrl) {
        pendingFrameUrlRef.current = null;
        setPendingFrameUrl(null);
      }
    },
    [revokeSingleObjectUrl]
  );

  const handleVisibleFrameError = useCallback(
    (failedUrl: string) => {
      revokeSingleObjectUrl(failedUrl);
      if (frameUrlRef.current === failedUrl) {
        frameUrlRef.current = null;
        setFrameUrl(null);
      }
    },
    [revokeSingleObjectUrl]
  );

  const postToOpener = useCallback((message: ReelLookupBroadcastMessage) => {
    try {
      channelRef.current?.postMessage(message);
    } catch {
      // Opener tab may already be closed
    }
  }, []);

  const cleanupRemoteSession = useCallback(
    (reason: 'user_closed' | 'completed' | 'error', keepalive = true) => {
      const activeId = sessionIdRef.current;
      if (wsRef.current) {
        wsRef.current.close(1000, reason);
        wsRef.current = null;
      }
      if (activeId) {
        void closeReelLookupSession(activeId, {
          keepalive,
          accessTokenOverride: accessTokenRef.current,
        });
      }
      if (lookupId) {
        postToOpener({
          type: 'viewer_closed',
          lookupId,
          sessionId: activeId,
          reason,
          origin: window.location.origin,
        });
      }
    },
    [lookupId, postToOpener]
  );

  useEffect(() => {
    if (!authLoading && !isAuthenticated && !terminalRef.current) {
      terminalRef.current = true;
      setConnectionState('error');
      setStep('error');
      setErrorMessage(
        'You must be signed in to ReelData to view a remote Instagram browser session.'
      );
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (!lookupId) {
      setConnectionState('error');
      setStep('error');
      return;
    }

    if (typeof BroadcastChannel === 'undefined') {
      setConnectionState('error');
      setStep('error');
      setErrorMessage(
        'Your browser does not support same-origin tab communication (BroadcastChannel).'
      );
      return;
    }

    const channel = new BroadcastChannel(REEL_LOOKUP_BROADCAST_CHANNEL);
    channelRef.current = channel;

    const handshakeTimeout = window.setTimeout(() => {
      if (!sessionIdRef.current && !terminalRef.current) {
        terminalRef.current = true;
        setConnectionState('error');
        setStep('error');
        setErrorMessage(
          'Timed out waiting for the ReelData tab to start the remote browser session.'
        );
      }
    }, 25000);

    channel.onmessage = (event: MessageEvent) => {
      if (
        !isValidReelLookupBroadcastMessage(event.data, {
          expectedOrigin: window.location.origin,
          expectedLookupId: lookupId,
          eventOrigin: event.origin || window.location.origin,
        })
      ) {
        return;
      }

      const msg = event.data;

      if (msg.type === 'session_failed') {
        window.clearTimeout(handshakeTimeout);
        if (terminalRef.current) return;
        terminalRef.current = true;
        setConnectionState('error');
        setStep('error');
        setErrorMessage(
          msg.error || 'Unable to start remote Instagram browser session.'
        );
        return;
      }

      if (msg.type === 'session_started') {
        window.clearTimeout(handshakeTimeout);
        if (
          terminalRef.current ||
          connectedSessionIdRef.current === msg.sessionId
        ) {
          return;
        }

        connectedSessionIdRef.current = msg.sessionId;
        sessionIdRef.current = msg.sessionId;
        setSessionId(msg.sessionId);
        setReelUrl(msg.reelUrl);
        setConnectionState('connecting');
        setStep('starting_browser');
        setStatusMessage(STEP_LABELS.starting_browser);
        setErrorMessage(null);

        try {
          wsRef.current = connectReelLookupWebSocket({
            sessionId: msg.sessionId,
            viewerToken: msg.viewerToken,
            callbacks: {
              onOpen: () => {
                if (terminalRef.current) return;
                setConnectionState('live');
                setStep('loading_session');
                setStatusMessage(STEP_LABELS.loading_session);
              },
              onStatus: (nextStep, nextMessage) => {
                if (terminalRef.current) return;
                setConnectionState('live');
                setStep(nextStep);
                const resolvedMessage =
                  nextMessage ||
                  STEP_LABELS[nextStep] ||
                  'Processing Instagram Reel...';
                setStatusMessage(resolvedMessage);
                postToOpener({
                  type: 'lookup_progress',
                  lookupId,
                  sessionId: msg.sessionId,
                  step: nextStep,
                  message: resolvedMessage,
                  origin: window.location.origin,
                });
              },
              onFrame: (blob) => {
                if (terminalRef.current) return;
                setConnectionState('live');
                stageFrameBlob(blob);
              },
              onResult: (creatorResult) => {
                if (terminalRef.current) return;
                terminalRef.current = true;
                setResult(creatorResult);
                setConnectionState('completed');
                setStep('completed');
                setStatusMessage(STEP_LABELS.completed);
                postToOpener({
                  type: 'lookup_result',
                  lookupId,
                  sessionId: msg.sessionId,
                  result: creatorResult,
                  origin: window.location.origin,
                });
                wsRef.current?.close(1000, 'Lookup completed');
                wsRef.current = null;
                void closeReelLookupSession(msg.sessionId, {
                  accessTokenOverride: accessTokenRef.current,
                });
              },
              onError: (errMsg) => {
                if (terminalRef.current) return;
                terminalRef.current = true;
                setConnectionState('error');
                setStep('error');
                setErrorMessage(errMsg);
                postToOpener({
                  type: 'lookup_error',
                  lookupId,
                  sessionId: msg.sessionId,
                  error: errMsg,
                  origin: window.location.origin,
                });
                wsRef.current?.close(1000, 'Lookup error');
                wsRef.current = null;
                void closeReelLookupSession(msg.sessionId, {
                  accessTokenOverride: accessTokenRef.current,
                });
              },
              onClose: (closeEvt) => {
                if (terminalRef.current) return;
                terminalRef.current = true;
                setConnectionState('disconnected');
                setStep('error');
                const disconnectMsg =
                  closeEvt.reason ||
                  'Connection to the remote Instagram browser was closed before creator extraction finished.';
                setErrorMessage(disconnectMsg);
                postToOpener({
                  type: 'lookup_error',
                  lookupId,
                  sessionId: msg.sessionId,
                  error: disconnectMsg,
                  origin: window.location.origin,
                });
                void closeReelLookupSession(msg.sessionId, {
                  accessTokenOverride: accessTokenRef.current,
                });
              },
            },
          });
        } catch (err) {
          terminalRef.current = true;
          const message =
            err instanceof Error
              ? err.message
              : 'Unable to open live browser WebSocket connection.';
          setConnectionState('error');
          setStep('error');
          setErrorMessage(message);
          postToOpener({
            type: 'lookup_error',
            lookupId,
            sessionId: msg.sessionId,
            error: message,
            origin: window.location.origin,
          });
          void closeReelLookupSession(msg.sessionId, {
            accessTokenOverride: accessTokenRef.current,
          });
        }
      }
    };

    const announceReady = () => {
      postToOpener({
        type: 'viewer_ready',
        lookupId,
        origin: window.location.origin,
      });
    };

    announceReady();
    const retryReadyTimer = window.setTimeout(() => {
      if (!sessionIdRef.current && !terminalRef.current) {
        announceReady();
      }
    }, 250);

    const handleUnload = () => {
      if (!terminalRef.current) {
        terminalRef.current = true;
        cleanupRemoteSession('user_closed', true);
      } else if (sessionIdRef.current) {
        void closeReelLookupSession(sessionIdRef.current, {
          keepalive: true,
          accessTokenOverride: accessTokenRef.current,
        });
      }
    };

    window.addEventListener('pagehide', handleUnload);
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.clearTimeout(handshakeTimeout);
      window.clearTimeout(retryReadyTimer);
      window.removeEventListener('pagehide', handleUnload);
      window.removeEventListener('beforeunload', handleUnload);
      if (!terminalRef.current) {
        terminalRef.current = true;
        cleanupRemoteSession('user_closed', true);
      } else {
        wsRef.current?.close();
        wsRef.current = null;
      }
      revokeAllFrameUrls();
      channel.close();
      channelRef.current = null;
    };
  }, [lookupId, postToOpener, stageFrameBlob, cleanupRemoteSession, revokeAllFrameUrls]);

  const handleCloseBrowser = () => {
    const reason = result
      ? 'completed'
      : errorMessage
        ? 'error'
        : 'user_closed';
    terminalRef.current = true;
    cleanupRemoteSession(reason, true);
    setConnectionState('closed');
    setStep('closed');
    setStatusMessage(STEP_LABELS.closed);
    try {
      window.close();
    } catch {
      // Ignore if browser blocks programmatic window close
    }
  };

  const handleCopyProfileLink = async (profileUrl: string) => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const safeProfileUrl = result
    ? validateInstagramProfileUrl(result.profileUrl)
    : null;

  const renderStatusBadge = () => {
    switch (connectionState) {
      case 'live':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live Browser</span>
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Completed</span>
          </span>
        );
      case 'disconnected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <WifiOff className="w-3.5 h-3.5" />
            <span>Disconnected</span>
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Error</span>
          </span>
        );
      case 'closed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <span>Closed</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Connecting</span>
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-[#0F172A] dark:text-slate-100 p-4 sm:p-6">
      <div className="max-w-[1320px] mx-auto space-y-5">
        {/* Top Viewer Header */}
        <header className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                <Globe className="w-4 h-4" />
                <span>ReelData Remote Browser Viewer</span>
              </span>
              {renderStatusBadge()}
            </div>
            <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-white tracking-tight">
              {statusMessage || STEP_LABELS[step]}
            </h1>
            {reelUrl && (
              <p className="font-mono text-xs text-slate-500 dark:text-slate-400 truncate">
                Target Reel: {reelUrl}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleCloseBrowser}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
              <span>Close Browser</span>
            </button>
          </div>
        </header>

        {/* Error Banner */}
        {errorMessage && (
          <div
            role="alert"
            className="rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-4 flex items-start gap-3 text-xs text-rose-700 dark:text-rose-300 leading-relaxed"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            <div className="space-y-1">
              <p className="font-semibold text-rose-800 dark:text-rose-200">
                Remote browser lookup could not complete
              </p>
              <p>{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Closed Banner */}
        {connectionState === 'closed' && !errorMessage && (
          <div className="rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-600 dark:text-slate-300">
            The remote Instagram browser session is closed. You can safely close this browser tab.
          </div>
        )}

        {/* Extracted Creator Result Card */}
        {result && safeProfileUrl && (
          <div className="rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                <User className="w-5 h-5" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  Creator extracted and returned to ReelData
                </div>
                <div className="text-base font-semibold text-slate-900 dark:text-white truncate">
                  @{result.username}
                </div>
                <a
                  href={safeProfileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-mono text-xs text-indigo-600 dark:text-indigo-400 hover:underline break-all"
                >
                  <span>{safeProfileUrl}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleCopyProfileLink(safeProfileUrl)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedLink ? 'Copied' : 'Copy Profile Link'}</span>
              </button>
              <a
                href={safeProfileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                <span>Open Profile</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}

        {/* Read-Only Remote Chromium Viewport */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
              <span>
                Read-only isolated Playwright Chromium stream (1280 × 800)
              </span>
            </span>
            {sessionId && (
              <span className="font-mono text-[11px] text-slate-400">
                Session ready
              </span>
            )}
          </div>

          <div className="p-4 sm:p-5">
            <div className="relative w-full max-w-[1280px] mx-auto aspect-[1280/800] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950">
              {!frameUrl &&
                connectionState !== 'error' &&
                connectionState !== 'closed' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300 px-4 text-center">
                    <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
                    <span className="text-xs font-medium">
                      {statusMessage || 'Waiting for live Instagram browser frames...'}
                    </span>
                  </div>
                )}

              {pendingFrameUrl && pendingFrameUrl !== frameUrl && (
                <img
                  key={pendingFrameUrl}
                  src={pendingFrameUrl}
                  alt=""
                  aria-hidden="true"
                  onLoad={() => handlePendingFrameLoad(pendingFrameUrl)}
                  onError={() => handlePendingFrameError(pendingFrameUrl)}
                  className="pointer-events-none absolute h-px w-px opacity-0"
                />
              )}

              {frameUrl && (
                <img
                  src={frameUrl}
                  alt="Live remote Instagram Reel browser stream"
                  onLoad={() => handleVisibleFrameLoad(frameUrl)}
                  onError={() => handleVisibleFrameError(frameUrl)}
                  draggable={false}
                  className="w-full h-full object-contain select-none block"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
