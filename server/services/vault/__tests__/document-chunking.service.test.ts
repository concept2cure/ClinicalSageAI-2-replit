/**
 * Vault chunker — the pure splitting core. No DB, no mocks.
 *
 * The property that matters is traceability: every chunk must be exactly
 * `text.slice(charStart, charEnd)`, the spans must jointly cover the whole
 * text, and consecutive chunks must overlap so no fact straddling a boundary
 * is lost to retrieval. A chunker that silently drops a tail would put a
 * document's ending outside the searchable world while the ledger says
 * "chunked" — the failure mode these tests exist to keep impossible.
 */
import { describe, it, expect } from 'vitest';
import { chunkExtractedText, MAX_CHUNKS } from '../document-chunking.service';

const para = (n: number, len = 300) =>
  `Paragraph ${n}. ` + 'x'.repeat(Math.max(0, len - 20)) + ' end.';

describe('chunkExtractedText', () => {
  it('returns nothing for empty text and one chunk for short text', () => {
    expect(chunkExtractedText('')).toEqual([]);
    const short = 'A single short document.';
    const chunks = chunkExtractedText(short);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ index: 0, charStart: 0, charEnd: short.length, text: short });
  });

  it('every chunk is exactly its span of the source text', () => {
    const text = Array.from({ length: 40 }, (_, i) => para(i)).join('\n\n');
    for (const c of chunkExtractedText(text)) {
      expect(c.text).toBe(text.slice(c.charStart, c.charEnd));
    }
  });

  it('spans jointly cover the whole text — no tail is silently dropped', () => {
    const text = Array.from({ length: 40 }, (_, i) => para(i)).join('\n\n');
    const chunks = chunkExtractedText(text);
    expect(chunks[0].charStart).toBe(0);
    expect(chunks[chunks.length - 1].charEnd).toBe(text.length);
    for (let i = 1; i < chunks.length; i++) {
      // The next chunk starts at or before the previous end (overlap ≥ 0):
      // a gap would be text no chunk carries.
      expect(chunks[i].charStart).toBeLessThanOrEqual(chunks[i - 1].charEnd);
    }
  });

  it('consecutive chunks overlap so boundary-straddling facts survive', () => {
    const text = Array.from({ length: 40 }, (_, i) => para(i)).join('\n\n');
    const chunks = chunkExtractedText(text, { maxChars: 2000, overlapChars: 300 });
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i - 1].charEnd - chunks[i].charStart).toBeGreaterThan(0);
    }
  });

  it('prefers paragraph boundaries when one is available', () => {
    const text = Array.from({ length: 40 }, (_, i) => para(i)).join('\n\n');
    const chunks = chunkExtractedText(text);
    // Cuts land AFTER a paragraph separator (starts then shift back by the
    // overlap), so a mid-document chunk's END sits right past a "\n\n".
    const paragraphEnds = chunks
      .slice(0, -1)
      .map(c => text.slice(c.charEnd - 2, c.charEnd) === '\n\n');
    expect(paragraphEnds.some(Boolean)).toBe(true);
  });

  it('still advances on pathological text with no boundaries at all', () => {
    const text = 'z'.repeat(30000);
    const chunks = chunkExtractedText(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThan(MAX_CHUNKS);
    expect(chunks[chunks.length - 1].charEnd).toBe(text.length);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].charStart).toBeGreaterThan(chunks[i - 1].charStart);
    }
  });

  it('is deterministic', () => {
    const text = Array.from({ length: 20 }, (_, i) => para(i)).join('\n\n');
    expect(chunkExtractedText(text)).toEqual(chunkExtractedText(text));
  });
});
