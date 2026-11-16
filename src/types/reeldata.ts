export type NavPage =
  | 'dashboard'
  | 'import'
  | 'creator-history'
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

export type InstagramFrontendDiagnosticCode =
  | 'IG-FE-001'
  | 'IG-FE-002'
  | 'IG-FE-003'
  | 'IG-FE-004'
  | 'IG-FE-005'
  | 'IG-FE-006'
  | 'IG-FE-007'
  | 'IG-FE-008'
  | 'IG-FE-009'
  | 'IG-FE-010'
  | 'IG-FE-011';

export interface InstagramDiagnosticEvent {
  code: InstagramFrontendDiagnosticCode;
  backendCode?: string;
  operation: string;
  httpStatus: number;
  message: string;
  timestamp: string;
  retryable: boolean;
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
  id?: string;
  reelUrl?: string;
  username: string;
  profileName?: string;
  profileUrl: string;
}

export interface CreatorLookupResultItem {
  id: string;
  submittedReelUrl: string;
  creatorUsername: string | null;
  profileName?: string;
  instagramProfileUrl: string | null;
  error?: string;
}

export interface ReelCreatorBatchItemResult {
  id?: string;
  reelUrl?: string;
  creator: ReelCreatorProfileResult | null;
  error?: string;
}

export interface CreatorLookupHistoryItem {
  id: string;
  batch_id: string | null;
  reel_url: string;
  creator_username: string | null;
  profile_name: string | null;
  profile_url: string | null;
  error: string | null;
  created_at: string;
}
