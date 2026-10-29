/**
 * What the upload request reads of a new version, and what it leaves for the
 * processing sweep (MR-08 Stage 3 step 4).
 *
 * A scanned PDF was OCR'd page by page inside the request, so a long one held
 * the response open past any load balancer's timeout. The request now reads a
 * text layer only, for a file up to INLINE_EXTRACT_MAX_BYTES and within
 * INLINE_EXTRACT_BUDGET_MS. A born-digital file is read as before, and its
 * filing suggestion still uses its text. A file that needs OCR, is larger, or
 * takes longer is recorded as pending, and `server/jobs/vaultProcessingSweep.ts`
 * reads it.
 */
import type { ExtractedDocumentText } from '../ocr/extractDocumentText.js';

export const INLINE_EXTRACT_MAX_BYTES = 20 * 1024 * 1024;
export const INLINE_EXTRACT_BUDGET_MS = 10_000;

export type InlineExtraction =
  | { kind: 'read'; extracted: ExtractedDocumentText }
  | { kind: 'pending'; reason: 'needs_ocr' | 'too_large' | 'over_time' }
  | { kind: 'failed'; error: string };

type Extract = (buffer: Buffer, mime: string, fileName: string, options: { ocr: false }) => Promise<ExtractedDocumentText>;

/** Read what the request may read; never OCR, never past the budget. */
export async function extractInline(
  buffer: Buffer,
  mime: string,
  fileName: string,
  opts: { maxBytes?: number; budgetMs?: number; extract?: Extract } = {},
): Promise<InlineExtraction> {
  if (buffer.length > (opts.maxBytes ?? INLINE_EXTRACT_MAX_BYTES)) return { kind: 'pending', reason: 'too_large' };
  const extract: Extract = opts.extract ?? (async (b, m, f, o) => (await import('../ocr/index.js')).extractDocumentText(b, m, f, o));
  let timer: NodeJS.Timeout | undefined;
  const overTime = new Promise<'over_time'>((resolve) => { timer = setTimeout(() => resolve('over_time'), opts.budgetMs ?? INLINE_EXTRACT_BUDGET_MS); });
  try {
    // The extraction that loses the race is left to finish and is ignored: the
    // parser cannot be interrupted, and its result is not what was recorded.
    const read = extract(buffer, mime, fileName, { ocr: false });
    read.catch(() => undefined);
    const won = await Promise.race([read, overTime]);
    if (won === 'over_time') return { kind: 'pending', reason: 'over_time' };
    if (won.ocrDeferred) return { kind: 'pending', reason: 'needs_ocr' };
    return { kind: 'read', extracted: won };
  } catch (err) {
    return { kind: 'failed', error: err instanceof Error && err.message ? err.message : 'unknown extraction error' };
  } finally {
    clearTimeout(timer);
  }
}
