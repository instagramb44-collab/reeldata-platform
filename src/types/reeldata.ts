export type NavPage =
  | 'dashboard'
  | 'import'
  | 'jobs'
  | 'extracted'
  | 'exports'
  | 'instagram'
  | 'settings';

export type JobStatus = 'Queued' | 'Processing' | 'Completed' | 'Failed';

export type UrlValidationStatus = 'valid' | 'duplicate' | 'invalid';

export interface ParsedUrlResult {
  id: string;
  lineNumber: number;
  rawInput: string;
  normalizedUrl: string | null;
  shortcode: string | null;
  status: UrlValidationStatus;
  errorMessage?: string;
  duplicateOfLine?: number;
  extraNotes?: string;
}

export interface CsvParseResult {
  fileName: string;
  fileSize: number;
  detectedColumn: string | null;
  headers: string[];
  rows: ParsedUrlResult[];
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  error?: string;
}

export interface ProcessingJob {
  id: string;
  importDate: string;
  sourceType: 'Manual Paste' | 'CSV Upload';
  sourceLabel: string;
  totalUrls: number;
  completed: number;
  pending: number;
  failed: number;
  status: JobStatus;
  shortcodes: string[];
  urls: { url: string; shortcode: string }[];
  isDemo: boolean;
}

export interface ExtractedReelRecord {
  id: string;
  jobId: string;
  reelUrl: string;
  username: string;
  shortcode: string;
  caption: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  publishedDate: string;
  status: 'Completed' | 'Pending' | 'Failed';
  isDemo: boolean;
  origin: 'Demo Dataset' | 'Simulated Import';
}

export interface ExportHistoryItem {
  id: string;
  fileName: string;
  exportDate: string;
  recordCount: number;
  filterSummary: string;
  csvContent?: string;
  isDemo: boolean;
}

export interface UserSettings {
  displayName: string;
  email: string;
  workspaceName: string;
  role: string;
  apiBaseUrl: string;
  executionMode: 'local-demo' | 'express-playwright';
  requestTimeoutMs: number;
  maxConcurrentTabs: number;
  csvDelimiter: ',' | ';' | '\t';
  includeCsvHeaders: boolean;
  includeDemoColumn: boolean;
  exportFilenamePrefix: string;
  theme: 'light' | 'dark';
}

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
  targetPage?: NavPage;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
}

export type InstagramConnectionUiStatus =
  | 'Disconnected'
  | 'Connecting'
  | 'Connected'
  | 'Session expired'
  | 'Error';

export interface InstagramConnectionResponse {
  status: string;
  connectedAt: string | null;
  updatedAt: string | null;
}

export interface InstagramLoginSession {
  sessionId: string;
  expiresInSeconds: number;
}

export type AllowedBrowserKey =
  | 'Enter'
  | 'Tab'
  | 'Backspace'
  | 'Delete'
  | 'Escape'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'Home'
  | 'End'
  | ' ';

export type BrowserInputPayload =
  | { action: 'click'; x: number; y: number }
  | { action: 'type'; text: string }
  | { action: 'press'; key: AllowedBrowserKey }
  | { action: 'scroll'; deltaY: number };

export interface ReelCreatorProfileResult {
  username: string;
  profileUrl: string;
}

export type ReelLookupStep =
  | 'opening_viewer'
  | 'starting_browser'
  | 'loading_session'
  | 'navigating'
  | 'extracting'
  | 'completed'
  | 'error'
  | 'closed';

export interface ReelLookupSessionStartResponse {
  sessionId: string;
  viewerToken: string;
  expiresInSeconds: number;
}

export type ReelLookupBroadcastMessage =
  | {
      type: 'viewer_ready';
      lookupId: string;
      origin: string;
    }
  | {
      type: 'session_started';
      lookupId: string;
      sessionId: string;
      viewerToken: string;
      expiresInSeconds: number;
      reelUrl: string;
      origin: string;
    }
  | {
      type: 'session_failed';
      lookupId: string;
      error: string;
      origin: string;
    }
  | {
      type: 'lookup_progress';
      lookupId: string;
      sessionId: string;
      step: ReelLookupStep;
      message: string;
      origin: string;
    }
  | {
      type: 'lookup_result';
      lookupId: string;
      sessionId: string;
      result: ReelCreatorProfileResult;
      origin: string;
    }
  | {
      type: 'lookup_error';
      lookupId: string;
      sessionId: string | null;
      error: string;
      origin: string;
    }
  | {
      type: 'viewer_closed';
      lookupId: string;
      sessionId: string | null;
      reason: 'user_closed' | 'completed' | 'error';
      origin: string;
    };


