/** Browser-safe vocabulary for the existing Data Room derived-processing stage.
 * Identity/admission, claims and writes remain the server processor's authority. */
export const DATA_ROOM_PROCESSING_SCHEMA_VERSION = 1 as const;
export const DATA_ROOM_PROCESSING_STAGE = 'derived_capture' as const;
export const DATA_ROOM_PROCESSOR_REVISION = 'data-room-processing:v1' as const;

export const DATA_ROOM_PROCESSING_REASON_CODES = [
  'SOURCE_NOT_FOUND', 'SOURCE_SUPERSEDED', 'SOURCE_SCOPE_CHANGED', 'PROJECT_UNAVAILABLE',
  'ORIGINAL_IDENTITY_INVALID', 'ORIGINAL_UPLOAD_UNAVAILABLE', 'ORIGINAL_BYTES_MISSING',
  'ORIGINAL_INTEGRITY_FAILED', 'SOURCE_BYTES_MISMATCH', 'SOURCE_WITHDRAWN',
  'SOURCE_IDENTITY_CHANGED', 'STAGE_METADATA_INVALID', 'ATTEMPT_BUSY', 'RETRY_NOT_DUE',
  'RETRY_EXHAUSTED', 'ATTEMPT_STALE', 'LEASE_EXPIRED', 'EXTRACTION_FAILED',
  'PROCESSING_UNAVAILABLE', 'PERSISTENCE_FAILED',
] as const;
export type DataRoomProcessingReasonCode = (typeof DATA_ROOM_PROCESSING_REASON_CODES)[number];

/**
 * Reason codes a processing RESULT may carry beyond the stage vocabulary.
 * EXTRACTION_PARTIAL marks a capture that completed with text covering only
 * part of the document. It is never persisted in the stage record, whose
 * reasonCode must be null when completed.
 */
export const DATA_ROOM_RESULT_REASON_CODES = [...DATA_ROOM_PROCESSING_REASON_CODES, 'EXTRACTION_PARTIAL'] as const;

/** Why extracted text may not cover the whole document. */
export const EXTRACTION_COVERAGE_LIMITS = ['page_budget', 'time_budget', 'ocr_failed'] as const;

/**
 * How much of a scanned PDF OCR read: pages held, pages read, and what
 * stopped it short (`null` when nothing did). Recorded as the capture's
 * `provenance.extractionCoverage`.
 */
export interface ExtractionCoverage {
  pageCount: number | null;
  pagesRead: number | null;
  limitedBy: (typeof EXTRACTION_COVERAGE_LIMITS)[number] | null;
}

const pageTally = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);

/** A well-formed coverage record, copied; null for anything else. */
export function readExtractionCoverage(value: unknown): ExtractionCoverage | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const { pageCount, pagesRead, limitedBy } = value as Record<string, unknown>;
  if (!pageTally(pageCount) || !pageTally(pagesRead)) return null;
  if (limitedBy !== null && !EXTRACTION_COVERAGE_LIMITS.includes(limitedBy as ExtractionCoverage['limitedBy'] & string)) return null;
  return { pageCount, pagesRead, limitedBy: limitedBy as ExtractionCoverage['limitedBy'] };
}

/** Sanitized read model; excludes original paths, private binding and raw errors. */
export interface DataRoomProcessingSummary {
  state: 'running' | 'completed' | 'failed' | 'blocked' | 'unknown';
  retryable: boolean;
  reasonCode: DataRoomProcessingReasonCode | null;
  leaseExpiresAt: string | null;
  nextRetryAt: string | null;
  /** Read-only observation using the source SELECT's database clock; null if unavailable. */
  leaseExpired?: boolean | null;
}

export interface DataRoomReadableSource {
  textAvailable?: boolean | null;
  isCurrent?: boolean;
  dataEligible?: boolean;
  originalFileAvailable?: boolean;
  disposition?: 'keep_data' | 'remove_data' | 'supersede' | null;
  extractionStatus?: string | null;
  extractionMethod?: string | null;
  processing?: DataRoomProcessingSummary | null;
}

const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const STATES = ['running', 'completed', 'failed', 'blocked', 'unknown'] as const;

function timestamp(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

export function isDataRoomProcessingSummary(value: unknown): value is DataRoomProcessingSummary {
  const row = object(value);
  return Boolean(row && STATES.includes(row.state as DataRoomProcessingSummary['state'])
    && typeof row.retryable === 'boolean'
    && (row.reasonCode === null || DATA_ROOM_PROCESSING_REASON_CODES.includes(row.reasonCode as DataRoomProcessingReasonCode))
    && timestamp(row.leaseExpiresAt) && timestamp(row.nextRetryAt)
    && (row.leaseExpired === undefined || row.leaseExpired === null || typeof row.leaseExpired === 'boolean')
    && publicTimingCoherent(row));
}

function publicTimingCoherent(row: Record<string, unknown>): boolean {
  if (row.state === 'running') return typeof row.leaseExpiresAt === 'string' && row.nextRetryAt === null;
  if (row.leaseExpiresAt !== null) return false;
  if (row.state === 'completed') return row.retryable === false && row.reasonCode === null && row.nextRetryAt === null;
  return row.state === 'failed' && row.retryable === true ? typeof row.nextRetryAt === 'string' : row.nextRetryAt === null;
}

const invalidSummary = (): DataRoomProcessingSummary => ({ state: 'unknown', retryable: false,
  reasonCode: 'STAGE_METADATA_INVALID', leaseExpiresAt: null, nextRetryAt: null });

/** Only a safe read projection; it never admits, repairs or authenticates an attempt. */
export function summarizeDataRoomProcessing(metadata: unknown, observedAt: string | null = null): DataRoomProcessingSummary | null {
  const meta = object(metadata);
  if (!meta || !Object.hasOwn(meta, 'dataRoomProcessing')) return null;
  const row = object(meta.dataRoomProcessing);
  if (!row || row.version !== DATA_ROOM_PROCESSING_SCHEMA_VERSION || row.stage !== DATA_ROOM_PROCESSING_STAGE
    || row.processorRevision !== DATA_ROOM_PROCESSOR_REVISION || row.state === 'unknown') return invalidSummary();
  const result = { state: row.state, retryable: row.retryable, reasonCode: row.reasonCode ?? null,
    leaseExpiresAt: row.leaseExpiresAt ?? null, nextRetryAt: row.nextRetryAt ?? null };
  if (!isDataRoomProcessingSummary(result)) return invalidSummary();
  return { ...result, leaseExpired: observedLeaseExpiry(result, observedAt) };
}

function observedLeaseExpiry(result: DataRoomProcessingSummary, observedAt: string | null): boolean | null {
  if (result.state !== 'running' || !result.leaseExpiresAt || !observedAt || !timestamp(observedAt)) return null;
  return Date.parse(result.leaseExpiresAt) <= Date.parse(observedAt);
}

/** Unknown availability is never readable; retained text does not reopen original bytes. */
export function sourceHasGroundingText(source: DataRoomReadableSource): boolean {
  return source.textAvailable === true && source.isCurrent === true && source.dataEligible === true
    && source.disposition !== 'remove_data' && source.disposition !== 'supersede';
}

export interface DataRoomReadView { label: string; tone: 'ok' | 'warn' | 'muted'; detail: string | null }

/** Labels describe recorded text/state. No label promises an automatic worker or repair. */
export function sourceReadView(source: DataRoomReadableSource, readableLabel = 'Read'): DataRoomReadView {
  const excluded = sourceExclusionView(source);
  if (excluded) return excluded;
  const processing = source.processing == null ? null : isDataRoomProcessingSummary(source.processing) ? source.processing : invalidSummary();
  const snapshot = { ...source, processing };
  if (source.textAvailable === true) {
    /* keep_data: the original file was withdrawn and its extracted text kept.
       It still reads, but never as plainly "Read" — the original is gone, and
       a reader citing it must know (2c2417d7a; ana-retrieval-spec.md:114). */
    if (source.disposition === 'keep_data') {
      return { label: 'Data retained · original unavailable', tone: 'muted', detail: readableProcessingDetail(snapshot) };
    }
    const label = source.extractionMethod?.includes('ocr') ? `${readableLabel} via OCR` : readableLabel;
    return { label, tone: 'ok', detail: readableProcessingDetail(snapshot) };
  }
  return unavailableProcessingReadView(processing) ?? unavailableTextReadView(snapshot);
}

function sourceExclusionView(source: DataRoomReadableSource): DataRoomReadView | null {
  if (source.disposition === 'remove_data') return { label: 'Data withdrawn', tone: 'warn', detail: null };
  if (source.disposition === 'supersede') return { label: 'Replaced by newer data', tone: 'muted', detail: null };
  if (source.isCurrent === false) return { label: 'Superseded source', tone: 'muted', detail: null };
  if (source.dataEligible === false) return { label: 'Excluded from active data use', tone: 'warn', detail: null };
  return null;
}

function unavailableProcessingReadView(processing: DataRoomProcessingSummary | null): DataRoomReadView | null {
  if (!processing) return null;
  switch (processing.state) {
    case 'blocked': return { label: 'Processing blocked', tone: 'warn', detail: 'The original source must be checked before another processing attempt.' };
    case 'unknown': return { label: 'Processing status unconfirmed', tone: 'warn', detail: 'The recorded processing state could not be verified.' };
    case 'failed': return processing.retryable
      ? { label: 'Processing needs retry', tone: 'warn', detail: 'Readable text has not been saved; another processing attempt is needed.' }
      : unreadableTextView();
    case 'running': return processing.leaseExpired === true
      ? { label: 'Processing needs retry', tone: 'warn', detail: 'The processing time limit expired before readable text was saved; another attempt is needed.' }
      : { label: 'Processing claimed', tone: 'muted', detail: processing.leaseExpiresAt ? `Claim lease expires ${processing.leaseExpiresAt}; refresh to read the current status.` : 'Refresh to read the current processing status.' };
    default: return null;
  }
}

function unreadableTextView(): DataRoomReadView {
  return { label: 'Text not readable', tone: 'warn', detail: 'The file remains captured; use a readable original or inspect the processing failure.' };
}

function unavailableTextReadView(source: DataRoomReadableSource): DataRoomReadView {
  if (source.extractionStatus === 'failed') return unreadableTextView();
  if (source.textAvailable === null || source.textAvailable === undefined) return { label: 'Text availability unconfirmed', tone: 'warn', detail: 'The source read did not confirm persisted text.' };
  if (source.extractionStatus === 'extracted' || source.processing?.state === 'completed') return { label: 'Processing needs retry', tone: 'warn', detail: 'Readable text has not been saved; another processing attempt is needed.' };
  return { label: 'Not processed yet', tone: 'muted', detail: null };
}

function readableProcessingDetail(source: DataRoomReadableSource): string | null {
  if (source.processing?.state === 'failed' || source.processing?.state === 'blocked') return 'Readable text is available; the latest processing attempt did not complete.';
  if (source.processing?.state === 'unknown') return 'Readable text is available; the processing state is unconfirmed.';
  return source.originalFileAvailable === false ? 'Readable data is retained; the original file is unavailable.' : null;
}
