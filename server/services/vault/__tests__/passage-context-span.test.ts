/**
 * Passage context as one exact, verified source span: the pure builder.
 *
 * Written from docs/evidence/D2-PASSAGE-CONTEXT/2026-10-19/CONTRACT.md alone,
 * before the implementation existed. The defect it pins: vault neighbour chunks
 * joined with '\n\n' repeat every chunk overlap and insert paragraph breaks the
 * source does not have. The context must instead be `T.slice(start, end)` of
 * the document's own extracted text, carrying an identity the existing helper
 * (draftSourceIdentityForText) verifies, or an explicit unavailable reason.
 * Chunk coordinates come from the real chunker wherever the case allows.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildPassageContext,
  PASSAGE_CONTEXT_MAX_CHARS,
  PASSAGE_CONTEXT_SIDE_CHARS,
  type ChunkCoordinate,
} from '../passage-context-span';
import { chunkExtractedText } from '../document-chunking.service';
import { draftSourceIdentityForText } from '../../ana/draft-source-identity';

const DOC = '30000000-0000-4000-8000-000000000001';
const HASH = 'a'.repeat(64);
const SIDE = 1000;
const MAX = 12000;
const ASTRAL = '\u{20000}';
type Result = ReturnType<typeof buildPassageContext>;
type Span = { start: number; end: number };
/** A stored chunk whose offsets are known (fixtures null them explicitly). */
type Located = ChunkCoordinate & { charStart: number; charEnd: number };

const HEADER = 'Table 14.2.1 Primary efficacy responder analysis';
const RESULT = '12/40 (30%)';
const DENOMINATOR = 'N=40 (ITT)';

/** 100 code units ending '. ', so the chunker cuts at sentences; never '\n\n'. */
function sentence(n: number, body?: string): string {
  const head = body ?? `Sentence ${String(n).padStart(3, '0')} of the study report records a routine observation`;
  return `${head} ${'-'.repeat(98)}`.slice(0, 98) + '. ';
}

function coordinates(T: string, maxChars: number, overlapChars: number): Located[] {
  return chunkExtractedText(T, { maxChars, overlapChars }).map(c => ({
    id: `chunk-${c.index}`, chunkIndex: c.index, charStart: c.charStart, charEnd: c.charEnd, text: c.text,
  }));
}

function byIndex(chunks: Located[], index: number): Located {
  const found = chunks.find(c => c.chunkIndex === index);
  if (!found) throw new Error(`fixture has no chunk ${index}`);
  return found;
}

/** Header in chunk 4, result in chunk 5, denominator in chunk 6 (600-char chunks, 150 overlap). */
function splitFixture() {
  const T = Array.from({ length: 40 }, (_, i) => {
    if (i === 19) return sentence(i, HEADER);
    if (i === 22) return sentence(i, `Responders at week 12 were ${RESULT} of randomised participants`);
    if (i === 26) return sentence(i, `Analysis population ${DENOMINATOR} as randomised and dosed`);
    return sentence(i);
  }).join('');
  const window = coordinates(T, 600, 150).filter(c => c.chunkIndex >= 4 && c.chunkIndex <= 6);
  return { T, window, c4: byIndex(window, 4), c5: byIndex(window, 5), c6: byIndex(window, 6) };
}

/** ASCII filler with a surrogate pair (U+20000) starting at each listed code unit. */
function textWith(length: number, astralAt: Iterable<number> = []): string {
  const starts = new Set(astralAt);
  let out = '';
  while (out.length < length) out += starts.has(out.length) ? ASTRAL : 'abcdefghij klmnopqrst uvwxyz. '[out.length % 30];
  return out;
}

function replaceAt(T: string, at: number, unit: string): string {
  return T.slice(0, at) + unit + T.slice(at + 1);
}

function coord(T: string, chunkIndex: number, start: number, end: number): Located {
  return { id: `chunk-${chunkIndex}`, chunkIndex, charStart: start, charEnd: end, text: T.slice(start, end) };
}

function build(T: string | null, chunks: ChunkCoordinate[], hitIndex: number, hitId = `chunk-${hitIndex}`): Result {
  return buildPassageContext({
    documentId: DOC, contentHash: HASH, extractedText: T, hit: { chunkId: hitId, chunkIndex: hitIndex }, chunks,
  });
}

function occurrences(haystack: string, needle: string): number {
  return needle.length === 0 ? 0 : haystack.split(needle).length - 1;
}

function splitsPair(T: string, at: number): boolean {
  const before = T.charCodeAt(at - 1);
  const after = T.charCodeAt(at);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

/** An available context whose text is the source span and whose identity the existing helper reproduces. */
function expectVerified(T: string, r: Result) {
  if (r.context.status !== 'available') throw new Error(`expected an available context, got ${JSON.stringify(r.context)}`);
  const { reference, text } = r.context;
  expect(text).toBe(T.slice(reference.span.start, reference.span.end));
  expect(reference.span.totalChars).toBe(T.length);
  expect(reference).toEqual({
    documentId: DOC, contentHash: HASH, span: reference.span, ...draftSourceIdentityForText(T, reference.span),
  });
  expect(reference.version).toBe(2);
  expect(reference.spanSha256).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
  expect(reference.extractedTextSha256).toBe(createHash('sha256').update(T, 'utf8').digest('hex'));
  expect(text.length).toBeLessThanOrEqual(MAX);
  expect(splitsPair(T, reference.span.start) || splitsPair(T, reference.span.end)).toBe(false);
  expect(r.hitSpan).not.toBeNull();
  expect(reference.span.start).toBeLessThanOrEqual(r.hitSpan?.start ?? -1);
  expect(reference.span.end).toBeGreaterThanOrEqual(r.hitSpan?.end ?? Number.POSITIVE_INFINITY);
  return r.context;
}

const unavailable = (reason: string, hitSpan: Span | null = null) => ({ context: { status: 'unavailable', reason }, hitSpan });

describe('passage context constants', () => {
  it('extends 1000 characters on each side and caps at the 12000-character identity span', () => {
    expect(PASSAGE_CONTEXT_SIDE_CHARS).toBe(SIDE);
    expect(PASSAGE_CONTEXT_MAX_CHARS).toBe(MAX);
  });
});

describe('split result: header, result and denominator across three overlapping chunks', () => {
  it('fixture: the real chunker splits them into chunks 4, 5 and 6 with real overlap', () => {
    const { T, window, c4, c5, c6 } = splitFixture();
    expect(T).not.toContain('\n\n');
    expect(window.filter(c => c.text.includes(HEADER)).map(c => c.chunkIndex)).toEqual([4]);
    expect(window.filter(c => c.text.includes(RESULT)).map(c => c.chunkIndex)).toEqual([5]);
    expect(window.filter(c => c.text.includes(DENOMINATOR)).map(c => c.chunkIndex)).toEqual([6]);
    expect(c4.charEnd - c5.charStart).toBeGreaterThan(0);
    expect(c5.charEnd - c6.charStart).toBeGreaterThan(0);
    // The defect being replaced: joining chunk texts repeats each overlap.
    const joined = window.map(c => c.text).join('\n\n');
    expect(occurrences(joined, T.slice(c5.charStart, c4.charEnd))).toBe(2);
    expect(c5.charStart - SIDE).toBeLessThan(c4.charStart);
    expect(c5.charEnd + SIDE).toBeGreaterThan(c6.charEnd);
  });

  it('the context is T.slice of the window: overlap once, no invented seam, verified identity', () => {
    const { T, window, c4, c5, c6 } = splitFixture();
    const r = build(T, window, 5);
    const ctx = expectVerified(T, r);
    expect(r.hitSpan).toEqual({ start: c5.charStart, end: c5.charEnd });
    const span = { start: c4.charStart, end: c6.charEnd, totalChars: T.length };
    expect(ctx).toEqual({
      status: 'available',
      text: T.slice(c4.charStart, c6.charEnd),
      reference: { documentId: DOC, contentHash: HASH, span, ...draftSourceIdentityForText(T, span) },
      chunkRange: [4, 6],
      clipped: false,
    });
    for (const fact of [HEADER, RESULT, DENOMINATOR]) expect(occurrences(ctx.text, fact)).toBe(1);
    expect(occurrences(ctx.text, T.slice(c5.charStart, c4.charEnd))).toBe(1);
    expect(occurrences(ctx.text, T.slice(c6.charStart, c5.charEnd))).toBe(1);
    expect(ctx.text).not.toContain('\n\n');
  });

  it('keeps a paragraph break only where the source has one', () => {
    const T = replaceAt(replaceAt(textWith(5000), 2500, '\n'), 2501, '\n');
    const r = build(T, [coord(T, 4, 1000, 2200), coord(T, 5, 2000, 3000), coord(T, 6, 2800, 4000)], 5);
    const ctx = expectVerified(T, r);
    expect(ctx.reference.span).toEqual({ start: 1000, end: 4000, totalChars: T.length });
    expect(occurrences(ctx.text, '\n\n')).toBe(1);
    expect(ctx.reference.span.start + ctx.text.indexOf('\n\n')).toBe(2500);
  });
});

describe('unavailable reasons (checks 1 to 3)', () => {
  it('chunk_set_changed: the hit id is gone, sits at another index, or nothing came back', () => {
    const { T, window } = splitFixture();
    const rechunked = window.map(c => ({ ...c, id: `rechunk-${c.chunkIndex}` }));
    expect(build(T, rechunked, 5)).toEqual(unavailable('chunk_set_changed'));
    expect(build(T, window, 5, 'chunk-6')).toEqual(unavailable('chunk_set_changed'));
    expect(build(T, [], 5)).toEqual(unavailable('chunk_set_changed'));
  });

  it('no_offsets: no extracted text, or any chunk (neighbour or hit) without offsets', () => {
    const { T, window, c4, c5, c6 } = splitFixture();
    expect(build(null, window, 5)).toEqual(unavailable('no_offsets'));
    expect(build(T, [{ ...c4, charStart: null }, c5, c6], 5)).toEqual(unavailable('no_offsets'));
    expect(build(T, [c4, { ...c5, charEnd: null }, c6], 5)).toEqual(unavailable('no_offsets'));
    expect(build(T, window.map(c => ({ ...c, charStart: null, charEnd: null })), 5)).toEqual(unavailable('no_offsets'));
  });

  it('basis_mismatch: offsets cut from backfill-trimmed text never shift onto the raw text', () => {
    const { T, window } = splitFixture();
    expect(build(`\n  ${T}`, window, 5)).toEqual(unavailable('basis_mismatch'));
  });

  it('basis_mismatch: same-hash re-extraction changed the text under a chunk', () => {
    const { T, window, c6 } = splitFixture();
    const changed = replaceAt(T, c6.charEnd - 10, '#');
    expect(build(changed, window, 5)).toEqual(unavailable('basis_mismatch'));
  });

  it('basis_mismatch: offsets that slice() would quietly accept are still refused', () => {
    const { T, c4, c5, c6 } = splitFixture();
    const tail = T.slice(0, c6.charEnd);
    expect(build(tail, [c4, c5, { ...c6, charEnd: tail.length + 5 }], 5)).toEqual(unavailable('basis_mismatch'));
    expect(build(tail, [c4, c5, { ...c6, charEnd: 2 ** 53 }], 5)).toEqual(unavailable('basis_mismatch'));
    expect(build(T, [{ ...c4, charStart: c4.charStart + 0.5 }, c5, c6], 5)).toEqual(unavailable('basis_mismatch'));
    expect(build(T, [{ ...c4, charStart: -10, charEnd: c4.charEnd, text: '' }, c5, c6], 5)).toEqual(unavailable('basis_mismatch'));
    expect(build(T, [{ ...c4, charEnd: c4.charStart, text: '' }, c5, c6], 5)).toEqual(unavailable('basis_mismatch'));
    expect(build(T, [{ ...c4, charStart: Number.NaN }, c5, c6], 5)).toEqual(unavailable('basis_mismatch'));
  });
});

describe('unavailable reasons (checks 4 and 5)', () => {
  it('not_contiguous: a missing index, a duplicate index, a gap, or a start that does not advance', () => {
    const { T } = splitFixture();
    const all = coordinates(T, 600, 150);
    const [c3, c4, c5, c6] = [3, 4, 5, 6].map(i => byIndex(all, i));
    expect(build(T, [c3, c5, c6], 5)).toEqual(unavailable('not_contiguous'));
    expect(build(T, [c4, c5, { ...c5, id: 'chunk-5b' }, c6], 5)).toEqual(unavailable('not_contiguous'));
    expect(build(T, [c4, c5, coord(T, 6, c5.charEnd + 50, c6.charEnd)], 5)).toEqual(unavailable('not_contiguous'));
    expect(build(T, [c4, coord(T, 5, c4.charStart, c5.charEnd), c6], 5)).toEqual(unavailable('not_contiguous'));
    expect(build(T, [coord(T, 4, c5.charStart, c5.charEnd), coord(T, 5, c4.charStart, c4.charEnd), c6], 5))
      .toEqual(unavailable('not_contiguous'));
  });

  it('touching chunks (start equal to the previous end) are contiguous', () => {
    const { T, c4, c5, c6 } = splitFixture();
    const ctx = expectVerified(T, build(T, [c4, c5, coord(T, 6, c5.charEnd, c6.charEnd)], 5));
    expect(ctx.reference.span).toMatchObject({ start: c4.charStart, end: c6.charEnd });
  });

  it('budget: a hit chunk longer than the cap is refused with its own hitSpan', () => {
    const T = textWith(20000);
    const r = build(T, [coord(T, 0, 0, 3000), coord(T, 1, 2000, 14001), coord(T, 2, 13000, 16000)], 1);
    expect(r).toEqual(unavailable('budget', { start: 2000, end: 14001 }));
  });

  it('a hit of exactly the cap is the whole context, clipped', () => {
    const T = textWith(20000);
    const r = build(T, [coord(T, 0, 0, 3000), coord(T, 1, 2000, 14000), coord(T, 2, 13000, 16000)], 1);
    const ctx = expectVerified(T, r);
    expect(ctx.reference.span).toEqual({ start: 2000, end: 14000, totalChars: T.length });
    expect(ctx).toMatchObject({ chunkRange: [0, 2], clipped: true });
  });
});

describe('unavailable reasons: the first failing check decides', () => {
  it('chunk_set_changed beats no_offsets', () => {
    const { window } = splitFixture();
    expect(build(null, window.map(c => ({ ...c, id: `rechunk-${c.chunkIndex}` })), 5)).toEqual(unavailable('chunk_set_changed'));
  });

  it('no_offsets beats basis_mismatch', () => {
    const { T, c4, c5, c6 } = splitFixture();
    expect(build(T, [{ ...c4, text: 'edited' }, c5, { ...c6, charStart: null }], 5)).toEqual(unavailable('no_offsets'));
  });

  it('basis_mismatch beats not_contiguous', () => {
    const { T, c4, c5, c6 } = splitFixture();
    expect(build(T, [{ ...c4, text: 'edited' }, c5, coord(T, 6, c5.charEnd + 50, c6.charEnd)], 5)).toEqual(unavailable('basis_mismatch'));
  });

  it('not_contiguous beats budget, and leaves hitSpan null', () => {
    const T = textWith(20000);
    const r = build(T, [coord(T, 0, 0, 3000), coord(T, 1, 2000, 14001), coord(T, 2, 14100, 16000)], 1);
    expect(r).toEqual(unavailable('not_contiguous'));
  });

  it('budget beats encoding', () => {
    const T = replaceAt(textWith(20000), 8000, '\ud800');
    const r = build(T, [coord(T, 0, 0, 3000), coord(T, 1, 2000, 14001), coord(T, 2, 13000, 16000)], 1);
    expect(r).toEqual(unavailable('budget', { start: 2000, end: 14001 }));
  });
});

describe('span clipping', () => {
  it('extends at most SIDE characters on each side of the hit', () => {
    const T = Array.from({ length: 200 }, (_, i) => sentence(i)).join('');
    const all = coordinates(T, 3000, 300);
    const [c2, c3, c4] = [2, 3, 4].map(i => byIndex(all, i));
    expect(c2.charStart).toBeLessThan(c3.charStart - SIDE);
    expect(c4.charEnd).toBeGreaterThan(c3.charEnd + SIDE);
    const r = build(T, [c2, c3, c4], 3);
    const ctx = expectVerified(T, r);
    expect(r.hitSpan).toEqual({ start: c3.charStart, end: c3.charEnd });
    expect(ctx.reference.span).toEqual({ start: c3.charStart - SIDE, end: c3.charEnd + SIDE, totalChars: T.length });
    expect(ctx).toMatchObject({ chunkRange: [2, 4], clipped: true });
  });

  it('a hit at the start of the document extends only to the right', () => {
    const T = Array.from({ length: 200 }, (_, i) => sentence(i)).join('');
    const all = coordinates(T, 3000, 300);
    const [c0, c1] = [0, 1].map(i => byIndex(all, i));
    const ctx = expectVerified(T, build(T, [c1, c0], 0));
    expect(ctx.reference.span).toEqual({ start: 0, end: c0.charEnd + SIDE, totalChars: T.length });
    expect(ctx).toMatchObject({ chunkRange: [0, 1], clipped: true });
  });

  it('the hit alone is its own unclipped context', () => {
    const { T, c5 } = splitFixture();
    const ctx = expectVerified(T, build(T, [c5], 5));
    expect(ctx).toMatchObject({ text: c5.text, chunkRange: [5, 5], clipped: false });
  });

  it('MAX trims the side farther from the hit first', () => {
    const T = textWith(15000);
    const r = build(T, [coord(T, 0, 0, 250), coord(T, 1, 200, 11700), coord(T, 2, 11650, 14700)], 1);
    const ctx = expectVerified(T, r);
    expect(ctx.reference.span).toEqual({ start: 0, end: 12000, totalChars: T.length });
    expect(ctx.clipped).toBe(true);
  });

  it('MAX trimming that reaches both sides keeps the hit whole and the farther side no longer farther', () => {
    const T = textWith(15000);
    const r = build(T, [coord(T, 0, 0, 250), coord(T, 1, 200, 12100), coord(T, 2, 12050, 14700)], 1);
    const { span } = expectVerified(T, r).reference;
    const [left, right] = [200 - span.start, span.end - 12100];
    expect(span.end - span.start).toBe(MAX);
    expect(left).toBeLessThan(200);
    expect(right).toBeLessThanOrEqual(left);
  });

  it('MAX trimming with equal sides keeps the hit whole', () => {
    const T = textWith(16000);
    const r = build(T, [coord(T, 0, 0, 2000), coord(T, 1, 1500, 13000), coord(T, 2, 12900, 15000)], 1);
    const ctx = expectVerified(T, r);
    expect(ctx.reference.span.end - ctx.reference.span.start).toBe(MAX);
    expect(ctx.clipped).toBe(true);
  });
});

describe('surrogate-safe edges', () => {
  const chunks = (T: string, first = 0, last = 5000) => [coord(T, 0, first, 2000), coord(T, 1, 1800, 3000), coord(T, 2, 2800, last)];

  it('a left edge that splits a pair moves outward by one', () => {
    const T = textWith(5000, [799]);
    const ctx = expectVerified(T, build(T, chunks(T), 1));
    expect(ctx.reference.span).toEqual({ start: 799, end: 4000, totalChars: T.length });
    expect(ctx.text.startsWith(ASTRAL)).toBe(true);
  });

  it('a right edge that splits a pair moves outward by one', () => {
    const T = textWith(5000, [3999]);
    const ctx = expectVerified(T, build(T, chunks(T), 1));
    expect(ctx.reference.span).toEqual({ start: 800, end: 4001, totalChars: T.length });
    expect(ctx.text.endsWith(ASTRAL)).toBe(true);
  });

  it('a split pair at the first chunk start cannot move outward: encoding', () => {
    const T = textWith(5000, [999]);
    expect(build(T, chunks(T, 1000), 1)).toEqual(unavailable('encoding', { start: 1800, end: 3000 }));
  });

  it('a split pair at the last chunk end cannot move outward: encoding', () => {
    const T = textWith(5000, [3499]);
    expect(build(T, chunks(T, 0, 3500), 1)).toEqual(unavailable('encoding', { start: 1800, end: 3000 }));
  });

  it('a lone surrogate anywhere in the text is refused by the identity helper: encoding', () => {
    const outside = replaceAt(textWith(5000), 100, '\ud800');
    expect(build(outside, chunks(outside, 500), 1)).toEqual(unavailable('encoding', { start: 1800, end: 3000 }));
    const inside = replaceAt(textWith(5000), 2500, '\udc00');
    expect(build(inside, chunks(inside), 1)).toEqual(unavailable('encoding', { start: 1800, end: 3000 }));
  });

  it('a MAX cut inside an astral run never yields an over-budget or split-pair span', () => {
    const odd = Array.from({ length: 1400 }, (_, i) => 11701 + 2 * i);
    const T = textWith(15000, odd);
    expect(splitsPair(T, 12000)).toBe(true);
    const r = build(T, [coord(T, 0, 0, 250), coord(T, 1, 199, 11699), coord(T, 2, 11650, 14700)], 1);
    if (r.context.status === 'available') expectVerified(T, r);
    else expect(r).toEqual(unavailable('encoding', { start: 199, end: 11699 }));
  });
});

describe('order independence and determinism', () => {
  it('returns the same result for any input order, without reordering the caller array', () => {
    const { T, window, c4, c5, c6 } = splitFixture();
    const expected = build(T, window, 5);
    const shuffled = [c6, c4, c5];
    expect(build(T, shuffled, 5)).toEqual(expected);
    expect(build(T, [...window].reverse(), 5)).toEqual(expected);
    expect(shuffled.map(c => c.chunkIndex)).toEqual([6, 4, 5]);
  });

  it('is deterministic', () => {
    const { T, window } = splitFixture();
    expect(build(T, window, 5)).toEqual(build(T, window, 5));
  });
});
