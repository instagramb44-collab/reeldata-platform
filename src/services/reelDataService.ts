import type {
  CsvParseResult,
  ExtractedReelRecord,
  ParsedUrlResult,
  ProcessingJob,
  UserSettings,
} from '../types/reeldata';

/**
 * Isolated service layer for ReelData.
 * Currently operates in local browser-only demo mode.
 * Future integration point for the Node.js + Express + Playwright backend.
 */

export const SAMPLE_MANUAL_URLS = [
  'https://www.instagram.com/reel/ABC123xyz/',
  'https://www.instagram.com/reel/DEF456xyz/',
  'https://instagram.com/reels/GHI789mno/?igsh=demo01',
].join('\n');

export const SAMPLE_CSV_CONTENT = [
  'reel_url,label',
  'https://www.instagram.com/reel/ABC123xyz/,Product Launch Teaser',
  'https://www.instagram.com/reel/DEF456xyz/,Behind the Scenes Cut',
  'https://www.instagram.com/reels/KLM321pqr/,Creator Spotlight',
  'https://www.instagram.com/p/INVALIDPOST1/,Example Post URL (Invalid for Reels)',
  'https://www.instagram.com/reel/ABC123xyz/,Duplicate Entry Example',
].join('\n');

const INSTAGRAM_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
  'instagr.am',
  'www.instagr.am',
]);

const SHORTCODE_REGEX = /^[A-Za-z0-9_-]{5,40}$/;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatCompactNumber(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatShortDate(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Validates a single Instagram Reel URL and extracts its canonical shortcode.
 */
export function parseInstagramReelUrl(raw: string): {
  valid: boolean;
  normalizedUrl: string | null;
  shortcode: string | null;
  errorMessage?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      valid: false,
      normalizedUrl: null,
      shortcode: null,
      errorMessage: 'Empty line',
    };
  }

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    if (/^(www\.|m\.)?(instagram\.com|instagr\.am)\//i.test(candidate)) {
      candidate = `https://${candidate}`;
    } else {
      return {
        valid: false,
        normalizedUrl: null,
        shortcode: null,
        errorMessage: 'Must be a full URL starting with https://www.instagram.com/reel/...',
      };
    }
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(candidate);
  } catch {
    return {
      valid: false,
      normalizedUrl: null,
      shortcode: null,
      errorMessage: 'Malformed URL syntax. Verify protocol and characters.',
    };
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (!INSTAGRAM_HOSTS.has(hostname)) {
    return {
      valid: false,
      normalizedUrl: null,
      shortcode: null,
      errorMessage: `Unsupported domain "${hostname}". Only instagram.com URLs are supported.`,
    };
  }

  const segments = parsedUrl.pathname.split('/').filter(Boolean);
  if (segments.length === 0) {
    return {
      valid: false,
      normalizedUrl: null,
      shortcode: null,
      errorMessage: 'Missing Reel path (/reel/<shortcode>/).',
    };
  }

  // Handle optional username prefix before /reel/ e.g. /username/reel/SHORTCODE/
  let reelKeywordIdx = -1;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i].toLowerCase();
    if (seg === 'reel' || seg === 'reels') {
      reelKeywordIdx = i;
      break;
    }
  }

  if (reelKeywordIdx === -1) {
    const first = segments[0].toLowerCase();
    if (first === 'p') {
      return {
        valid: false,
        normalizedUrl: null,
        shortcode: null,
        errorMessage: 'Standard post URL (/p/) detected. Only Reel URLs (/reel/ or /reels/) are accepted.',
      };
    }
    if (first === 'stories') {
      return {
        valid: false,
        normalizedUrl: null,
        shortcode: null,
        errorMessage: 'Instagram Story URL detected. Paste a Reel URL (/reel/<shortcode>/).',
      };
    }
    return {
      valid: false,
      normalizedUrl: null,
      shortcode: null,
      errorMessage: 'URL path must contain /reel/<shortcode>/ or /reels/<shortcode>/.',
    };
  }

  const shortcode = segments[reelKeywordIdx + 1];
  if (!shortcode) {
    return {
      valid: false,
      normalizedUrl: null,
      shortcode: null,
      errorMessage: 'Missing Reel shortcode after /reel/.',
    };
  }

  if (!SHORTCODE_REGEX.test(shortcode)) {
    return {
      valid: false,
      normalizedUrl: null,
      shortcode: null,
      errorMessage: `Shortcode "${shortcode}" has invalid length or characters.`,
    };
  }

  return {
    valid: true,
    normalizedUrl: `https://www.instagram.com/reel/${shortcode}/`,
    shortcode,
  };
}

/**
 * Validates multiline raw text input line-by-line, detecting duplicates and invalid formats.
 */
export function validateBulkUrls(rawText: string): {
  results: ParsedUrlResult[];
  detectedCount: number;
  validCount: number;
  duplicateCount: number;
  invalidCount: number;
} {
  const lines = rawText.split(/\r?\n/);
  const seenShortcodes = new Map<string, number>();
  const results: ParsedUrlResult[] = [];

  let validCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const lineNumber = index + 1;
    const parsed = parseInstagramReelUrl(trimmed);

    if (!parsed.valid || !parsed.shortcode) {
      invalidCount++;
      results.push({
        id: `line-${lineNumber}-${Math.random().toString(36).slice(2, 7)}`,
        lineNumber,
        rawInput: trimmed,
        normalizedUrl: null,
        shortcode: null,
        status: 'invalid',
        errorMessage: parsed.errorMessage || 'Invalid Instagram Reel URL.',
      });
      return;
    }

    const existingLine = seenShortcodes.get(parsed.shortcode);
    if (existingLine !== undefined) {
      duplicateCount++;
      results.push({
        id: `line-${lineNumber}-${Math.random().toString(36).slice(2, 7)}`,
        lineNumber,
        rawInput: trimmed,
        normalizedUrl: parsed.normalizedUrl,
        shortcode: parsed.shortcode,
        status: 'duplicate',
        duplicateOfLine: existingLine,
        errorMessage: `Duplicate shortcode "${parsed.shortcode}" (already detected on line ${existingLine}).`,
      });
      return;
    }

    seenShortcodes.set(parsed.shortcode, lineNumber);
    validCount++;
    results.push({
      id: `line-${lineNumber}-${Math.random().toString(36).slice(2, 7)}`,
      lineNumber,
      rawInput: trimmed,
      normalizedUrl: parsed.normalizedUrl,
      shortcode: parsed.shortcode,
      status: 'valid',
    });
  });

  return {
    results,
    detectedCount: results.length,
    validCount,
    duplicateCount,
    invalidCount,
  };
}

/**
 * RFC-4180 compliant local CSV line parser (handles quoted strings, escaped quotes, BOM).
 */
function parseCsvMatrix(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const nextChar = cleaned[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r' && nextChar === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.some((cell) => cell !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        i++;
      } else if (char === '\n' || char === '\r') {
        currentRow.push(currentField.trim());
        if (currentRow.some((cell) => cell !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((cell) => cell !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Parses a local CSV file in-browser without uploading externally.
 * Supports columns named `reel_url` or `url` (case-insensitive).
 */
export function parseCsvLocally(
  fileName: string,
  fileSize: number,
  csvText: string
): CsvParseResult {
  const matrix = parseCsvMatrix(csvText);

  if (matrix.length === 0) {
    return {
      fileName,
      fileSize,
      detectedColumn: null,
      headers: [],
      rows: [],
      totalRows: 0,
      validCount: 0,
      invalidCount: 0,
      duplicateCount: 0,
      error: 'The CSV file appears to be empty.',
    };
  }

  const headers = matrix[0];
  const normalizedHeaders = headers.map((h) => h.trim().toLowerCase());
  const urlColIndex = normalizedHeaders.findIndex(
    (h) => h === 'reel_url' || h === 'url'
  );

  if (urlColIndex === -1) {
    return {
      fileName,
      fileSize,
      detectedColumn: null,
      headers,
      rows: [],
      totalRows: Math.max(0, matrix.length - 1),
      validCount: 0,
      invalidCount: 0,
      duplicateCount: 0,
      error: 'Missing required column header "reel_url" or "url". Please rename your URL column or download the sample CSV.',
    };
  }

  const detectedColumn = headers[urlColIndex];
  const notesColIndex = normalizedHeaders.findIndex(
    (h) => h === 'label' || h === 'note' || h === 'notes' || h === 'campaign'
  );

  const dataRows = matrix.slice(1);
  const seenShortcodes = new Map<string, number>();
  const rows: ParsedUrlResult[] = [];
  let validCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;

  dataRows.forEach((cols, idx) => {
    const rowNumber = idx + 1;
    const rawValue = (cols[urlColIndex] ?? '').trim();
    const extraNotes =
      notesColIndex !== -1 && cols[notesColIndex] ? cols[notesColIndex].trim() : undefined;

    if (!rawValue) {
      invalidCount++;
      rows.push({
        id: `csv-row-${rowNumber}`,
        lineNumber: rowNumber,
        rawInput: '(empty cell)',
        normalizedUrl: null,
        shortcode: null,
        status: 'invalid',
        errorMessage: `Row ${rowNumber} has an empty "${detectedColumn}" value.`,
        extraNotes,
      });
      return;
    }

    const parsed = parseInstagramReelUrl(rawValue);
    if (!parsed.valid || !parsed.shortcode) {
      invalidCount++;
      rows.push({
        id: `csv-row-${rowNumber}`,
        lineNumber: rowNumber,
        rawInput: rawValue,
        normalizedUrl: null,
        shortcode: null,
        status: 'invalid',
        errorMessage: parsed.errorMessage || 'Invalid Instagram Reel URL.',
        extraNotes,
      });
      return;
    }

    const existingRow = seenShortcodes.get(parsed.shortcode);
    if (existingRow !== undefined) {
      duplicateCount++;
      rows.push({
        id: `csv-row-${rowNumber}`,
        lineNumber: rowNumber,
        rawInput: rawValue,
        normalizedUrl: parsed.normalizedUrl,
        shortcode: parsed.shortcode,
        status: 'duplicate',
        duplicateOfLine: existingRow,
        errorMessage: `Duplicate shortcode "${parsed.shortcode}" (first seen in row ${existingRow}).`,
        extraNotes,
      });
      return;
    }

    seenShortcodes.set(parsed.shortcode, rowNumber);
    validCount++;
    rows.push({
      id: `csv-row-${rowNumber}`,
      lineNumber: rowNumber,
      rawInput: rawValue,
      normalizedUrl: parsed.normalizedUrl,
      shortcode: parsed.shortcode,
      status: 'valid',
      extraNotes,
    });
  });

  return {
    fileName,
    fileSize,
    detectedColumn,
    headers,
    rows,
    totalRows: rows.length,
    validCount,
    invalidCount,
    duplicateCount,
  };
}

function escapeCsvCell(value: string | number | null | undefined, delimiter: string): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateExtractedCsv(
  records: ExtractedReelRecord[],
  options?: Pick<UserSettings, 'csvDelimiter' | 'includeCsvHeaders' | 'includeDemoColumn'>
): string {
  const delimiter = options?.csvDelimiter ?? ',';
  const includeHeaders = options?.includeCsvHeaders ?? true;
  const includeDemoColumn = options?.includeDemoColumn ?? true;

  const headerCols = [
    'reel_url',
    'shortcode',
    'username',
    'caption',
    'views',
    'likes',
    'comments',
    'published_date',
    'processing_status',
    ...(includeDemoColumn ? ['demo_record'] : []),
  ];

  const lines: string[] = [];
  if (includeHeaders) {
    lines.push(headerCols.join(delimiter));
  }

  for (const rec of records) {
    const row = [
      rec.reelUrl,
      rec.shortcode,
      rec.username,
      rec.caption,
      rec.views ?? '',
      rec.likes ?? '',
      rec.comments ?? '',
      rec.publishedDate,
      rec.status,
      ...(includeDemoColumn ? [rec.isDemo ? 'true' : 'false'] : []),
    ].map((cell) => escapeCsvCell(cell, delimiter));
    lines.push(row.join(delimiter));
  }

  return lines.join('\n');
}

export function triggerCsvDownload(fileName: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates deterministic clearly-labelled demo records for simulated local imports.
 * Never makes external network or Instagram requests.
 */
export function buildSimulatedDemoRecord(
  jobId: string,
  url: string,
  shortcode: string,
  index: number,
  failed: boolean
): ExtractedReelRecord {
  const nowIso = new Date().toISOString();
  if (failed) {
    return {
      id: `rec-${jobId}-${shortcode}-${index}`,
      jobId,
      reelUrl: url,
      username: '@demo_unavailable',
      shortcode,
      caption: '[Demo Simulation] Simulated timeout or unavailable reel placeholder.',
      views: null,
      likes: null,
      comments: null,
      publishedDate: nowIso.slice(0, 10),
      status: 'Failed',
      isDemo: true,
      origin: 'Simulated Import',
    };
  }

  // Deterministic pseudo-metrics seeded by shortcode characters so it feels consistent without claiming real scraping
  let seed = 0;
  for (let i = 0; i < shortcode.length; i++) {
    seed += shortcode.charCodeAt(i) * (i + 1);
  }
  const views = 12400 + (seed % 85000);
  const likes = Math.round(views * 0.062);
  const comments = Math.round(likes * 0.045);

  return {
    id: `rec-${jobId}-${shortcode}-${index}`,
    jobId,
    reelUrl: url,
    username: `@demo_creator_${(seed % 90) + 10}`,
    shortcode,
    caption: `[Demo Simulation] Placeholder metadata preview for imported shortcode ${shortcode}. Connect Express + Playwright backend for live extraction.`,
    views,
    likes,
    comments,
    publishedDate: nowIso.slice(0, 10),
    status: 'Completed',
    isDemo: true,
    origin: 'Simulated Import',
  };
}

/**
 * Future Backend API Adapter Boundary.
 * Ready to connect to Node.js + Express + Playwright endpoints without touching UI components.
 */
export const reelDataBackendAdapter = {
  async checkHealth(baseUrl: string): Promise<{ connected: boolean; message: string }> {
    return {
      connected: false,
      message: `Frontend-only demo mode active. Target backend (${baseUrl}) will be enabled when Express + Playwright server is attached.`,
    };
  },

  async createImportJob(
    urls: { url: string; shortcode: string }[],
    sourceType: 'Manual Paste' | 'CSV Upload',
    sourceLabel: string
  ): Promise<ProcessingJob> {
    const jobNumber = Math.floor(1040 + Math.random() * 8900);
    return {
      id: `JOB-${jobNumber}`,
      importDate: new Date().toISOString(),
      sourceType,
      sourceLabel,
      totalUrls: urls.length,
      completed: 0,
      pending: urls.length,
      failed: 0,
      status: 'Queued',
      shortcodes: urls.map((u) => u.shortcode),
      urls,
      isDemo: true,
    };
  },
};
