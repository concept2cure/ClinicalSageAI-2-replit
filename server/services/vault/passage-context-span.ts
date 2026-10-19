/**
 * A passage hit's surrounding context as one exact span of the source text
 * (D2, priority 3; docs/design/PASSAGE_CONTEXT_SPAN_2026-10-18.md,
 * docs/evidence/D2-PASSAGE-CONTEXT/).
 *
 * Neighbour chunks used to be joined with '\n\n'. Every chunk carries the
 * previous one's overlap, so the joined text repeated it at each seam and put
 * paragraph breaks where the document has none, and that text was quoted as
 * a citation. A result, its header and its denominator split across chunks
 * now come back as `extractedText.slice(start, end)`: the source's own
 * characters, once, with an identity the authoring save path can re-verify.
 *
 * Pure and deterministic. Every coordinate is checked against the text before
 * it is used; anything that does not verify is reported as unavailable, never
 * approximated.
 */
import { draftSourceIdentityForText } from '../ana/draft-source-identity.js';
import type { DraftSourceReferenceV2 } from '../../../shared/authoring/draft-source-reference.js';

/** Characters of context kept on each side of the hit chunk. */
export const PASSAGE_CONTEXT_SIDE_CHARS = 1000;
/** The identity contract's span cap (draftSourceIdentityForText). */
export const PASSAGE_CONTEXT_MAX_CHARS = 12000;

export interface ChunkCoordinate {
  id: string;
  chunkIndex: number;
  charStart: number | null;
  charEnd: number | null;
  text: string;
}

export type PassageContextUnavailableReason =
  'no_offsets' | 'basis_mismatch' | 'chunk_set_changed' | 'not_contiguous' | 'encoding' | 'budget' | 'not_expanded';

export type PassageContext =
  | { status: 'available'; text: string; reference: DraftSourceReferenceV2; chunkRange: [number, number]; clipped: boolean }
  | { status: 'unavailable'; reason: PassageContextUnavailableReason };

interface Span { start: number; end: number }

const unavailable = (reason: PassageContextUnavailableReason, hitSpan: Span | null = null) =>
  ({ context: { status: 'unavailable' as const, reason }, hitSpan });

const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff;
/** True when `at` falls between the two halves of a surrogate pair. */
const splitsPair = (text: string, at: number) =>
  at > 0 && at < text.length && isHigh(text.charCodeAt(at - 1)) && isLow(text.charCodeAt(at));

/** Each chunk's offsets name exactly its text in the source. */
function verifiedSpans(text: string, chunks: ChunkCoordinate[]): Span[] | null {
  const spans: Span[] = [];
  for (const c of chunks) {
    const { charStart: start, charEnd: end } = c;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
    if ((start as number) < 0 || (end as number) <= (start as number) || (end as number) > text.length) return null;
    if (text.slice(start as number, end as number) !== c.text) return null;
    spans.push({ start: start as number, end: end as number });
  }
  return spans;
}

/** Consecutive indices, strictly advancing starts, no gap between neighbours. */
function contiguous(chunks: ChunkCoordinate[], spans: Span[]): boolean {
  for (let i = 1; i < chunks.length; i++) {
    if (chunks[i].chunkIndex !== chunks[i - 1].chunkIndex + 1) return false;
    if (spans[i].start <= spans[i - 1].start || spans[i].start > spans[i - 1].end) return false;
  }
  return true;
}

/** Up to SIDE on each side of the hit, within the window, trimmed to MAX from the farther side. */
function contextSpan(hit: Span, window: Span): Span {
  let start = Math.max(window.start, hit.start - PASSAGE_CONTEXT_SIDE_CHARS);
  let end = Math.min(window.end, hit.end + PASSAGE_CONTEXT_SIDE_CHARS);
  let excess = end - start - PASSAGE_CONTEXT_MAX_CHARS;
  if (excess <= 0) return { start, end };
  // The larger side first, down to the smaller one.
  const before = hit.start - start;
  const after = end - hit.end;
  const fromLarger = Math.min(excess, Math.abs(before - after));
  if (before > after) start += fromLarger;
  else end -= fromLarger;
  excess -= fromLarger;
  // Then evenly. The hit fits within MAX, so neither side passes it.
  const fromStart = Math.ceil(excess / 2);
  return { start: start + fromStart, end: end - (excess - fromStart) };
}

/** Move an edge that splits a surrogate pair outward by one, within the window. */
function intactEdges(text: string, span: Span, window: Span): Span | null {
  let { start, end } = span;
  if (splitsPair(text, start)) start -= 1;
  if (splitsPair(text, end)) end += 1;
  if (start < window.start || end > window.end || end - start > PASSAGE_CONTEXT_MAX_CHARS) return null;
  return splitsPair(text, start) || splitsPair(text, end) ? null : { start, end };
}

export function buildPassageContext(input: {
  documentId: string;
  contentHash: string;
  extractedText: string | null;
  hit: { chunkId: string; chunkIndex: number };
  chunks: ChunkCoordinate[];
}): { context: PassageContext; hitSpan: Span | null } {
  const chunks = [...input.chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  const hitAt = chunks.findIndex((c) => c.id === input.hit.chunkId && c.chunkIndex === input.hit.chunkIndex);
  if (hitAt < 0) return unavailable('chunk_set_changed');
  const text = input.extractedText;
  if (text === null || chunks.some((c) => c.charStart === null || c.charEnd === null)) return unavailable('no_offsets');
  const spans = verifiedSpans(text, chunks);
  if (!spans) return unavailable('basis_mismatch');
  if (!contiguous(chunks, spans)) return unavailable('not_contiguous');
  const hitSpan = spans[hitAt];
  if (hitSpan.end - hitSpan.start > PASSAGE_CONTEXT_MAX_CHARS) return unavailable('budget', hitSpan);

  const window = { start: spans[0].start, end: spans[spans.length - 1].end };
  const span = intactEdges(text, contextSpan(hitSpan, window), window);
  if (!span) return unavailable('encoding', hitSpan);
  let identity: ReturnType<typeof draftSourceIdentityForText>;
  try {
    identity = draftSourceIdentityForText(text, { ...span, totalChars: text.length });
  } catch {
    return unavailable('encoding', hitSpan);
  }
  return {
    hitSpan,
    context: {
      status: 'available',
      text: text.slice(span.start, span.end),
      reference: { documentId: input.documentId, contentHash: input.contentHash,
        span: { start: span.start, end: span.end, totalChars: text.length }, ...identity },
      chunkRange: [chunks[0].chunkIndex, chunks[chunks.length - 1].chunkIndex],
      clipped: span.start > window.start || span.end < window.end,
    },
  };
}
