/** Descriptive extraction evidence, never processing or source-use authority. */
import { createHash } from 'node:crypto';
import type { PageSpan } from '../ocr/page-offsets.js';

export interface CaptureExtractionEvidence {
  version: 1;
  sourceSha256: string;
  extractedTextSha256: string;
  method: string;
  /** Already located pages, as half-open UTF-16 coordinates in the bound text. */
  pageSpans?: PageSpan[];
  /** Aggregate extractor-reported OCR score, 0–100; not scientific confidence. */
  ocrConfidence?: number;
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const between = (value: number, min: number, max: number) => value >= min && value <= max;
const splitPair = (text: string, at: number) => at > 0 && at < text.length &&
  between(text.charCodeAt(at - 1), 0xd800, 0xdbff) && between(text.charCodeAt(at), 0xdc00, 0xdfff);

/** Validate and detach a located map; do not align, repair or infer pages here. */
function pageMap(text: string, value: unknown): PageSpan[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const spans: PageSpan[] = [];
  let previousPage = 0;
  let previousEnd = 0;
  for (const row of value) {
    if (!object(row)) return undefined;
    const { page, start, end } = row;
    if (!integer(page) || page <= previousPage || !integer(start) || start < previousEnd ||
        !integer(end) || end < start || end > text.length || splitPair(text, start) || splitPair(text, end)) return undefined;
    spans.push({ page, start, end });
    previousPage = page;
    previousEnd = end;
  }
  return spans;
}

function reportedOcrConfidence(method: string, value: unknown): number | undefined {
  if (method !== 'pdf-ocr' && method !== 'image-ocr') return undefined;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : undefined;
}

/** Keep only evidence the existing extractor returned for this exact text. */
export function captureExtractionEvidence(
  sourceSha256: string, text: string, method: string,
  details: { pageSpans?: unknown; confidence?: unknown } = {},
): CaptureExtractionEvidence | undefined {
  const bytes = Buffer.from(text, 'utf8');
  // UTF-8 replaces lone surrogates. Such an identity would not bind exact text.
  if (!/^[0-9a-f]{64}$/.test(sourceSha256) || !text || !method || bytes.toString('utf8') !== text) return undefined;
  const pageSpans = pageMap(text, details.pageSpans);
  const ocrConfidence = reportedOcrConfidence(method, details.confidence);
  return { version: 1, sourceSha256, extractedTextSha256: createHash('sha256').update(bytes).digest('hex'), method,
    ...(pageSpans ? { pageSpans } : {}), ...(ocrConfidence === undefined ? {} : { ocrConfidence }) };
}

/** Strict cached-receipt check, returning a detached copy; absence is separate. */
export function readCaptureExtractionEvidence(
  value: unknown, sourceSha256: string, text: string, method: string,
): CaptureExtractionEvidence | null {
  if (!object(value)) return null;
  const receipt = captureExtractionEvidence(sourceSha256, text, method,
    { pageSpans: value.pageSpans, confidence: value.ocrConfidence });
  if (!receipt || value.version !== 1 || value.sourceSha256 !== receipt.sourceSha256 ||
      value.extractedTextSha256 !== receipt.extractedTextSha256 || value.method !== receipt.method) return null;
  if (value.pageSpans !== undefined && !receipt.pageSpans) return null;
  if (value.ocrConfidence !== undefined && receipt.ocrConfidence === undefined) return null;
  return receipt;
}
