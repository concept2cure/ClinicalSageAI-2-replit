/**
 * The prefix has to know it is a prefix.
 *
 * Both chat-upload embedding paths did `extractedText.substring(0, 16000)` and
 * wrote ONE atom per file. A clinical protocol is 300–600 KB of extracted text,
 * so the row held roughly the first four pages of a hundred and fifty, and
 * nothing recorded that. A retrieval hit returned those characters AS the
 * document's content — the "grab a page and call it the document" failure this
 * whole workstream exists to end, sitting in the pipeline itself.
 *
 * These cases pin the arithmetic and the record. They are pure: the bound and
 * what is written about it are computed without a database, because that is the
 * part every reader above depends on.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ATOM_CONTENT_LIMIT,
  atomRetrievalRecord,
  boundAtomContent,
  writeUploadRetrievalAtom,
} from '../upload-retrieval-atom';

const para = (n: number) => `Paragraph ${n}. ${'Sentence body filler. '.repeat(20)}`;
const longText = Array.from({ length: 200 }, (_, i) => para(i)).join('\n\n');

describe('boundAtomContent — what the atom holds vs what the file holds', () => {
  it('keeps a short document whole and says so', () => {
    const b = boundAtomContent('A short note about batch 23-104.');
    expect(b.truncated).toBe(false);
    expect(b.embeddedChars).toBe(b.extractedChars);
    expect(b.content).toBe('A short note about batch 23-104.');
  });

  it('reports the FILE length, not the atom length, when it truncates', () => {
    const b = boundAtomContent(longText);
    expect(longText.length).toBeGreaterThan(ATOM_CONTENT_LIMIT);
    expect(b.truncated).toBe(true);
    expect(b.extractedChars).toBe(longText.length);
    expect(b.embeddedChars).toBeLessThanOrEqual(ATOM_CONTENT_LIMIT);
    // The number that was never available anywhere: how much is missing.
    expect(b.extractedChars - b.embeddedChars).toBeGreaterThan(0);
  });

  it('cuts at a boundary rather than mid-sentence', () => {
    const b = boundAtomContent(longText);
    // A hard substring ends wherever character 16000 falls. Ending on a
    // terminator keeps every sentence in the atom a complete one, so the
    // embedding is not of a claim the document does not make.
    expect(b.content.trimEnd().endsWith('.')).toBe(true);
    // And it does not pay more than a tenth of the window for that.
    expect(b.embeddedChars).toBeGreaterThan(ATOM_CONTENT_LIMIT * 0.9);
  });

  it('falls back to the hard cut when there is no boundary to find', () => {
    const wall = 'x'.repeat(ATOM_CONTENT_LIMIT * 2);
    const b = boundAtomContent(wall);
    expect(b.embeddedChars).toBe(ATOM_CONTENT_LIMIT);
    expect(b.truncated).toBe(true);
  });

  it('a document exactly at the limit is not called truncated', () => {
    const exact = 'y'.repeat(ATOM_CONTENT_LIMIT);
    expect(boundAtomContent(exact).truncated).toBe(false);
  });
});

describe('atomRetrievalRecord — the row says what it is', () => {
  it('records the two lengths and names the remedy when truncated', () => {
    const rec = atomRetrievalRecord(boundAtomContent(longText)) as any;
    expect(rec.retrieval.truncated).toBe(true);
    expect(rec.retrieval.extractedChars).toBe(longText.length);
    expect(rec.retrieval.note).toContain('opening of the file only');
    // The remedy is a different pipeline, not a bigger number.
    expect(rec.retrieval.note).toContain('vault');
  });

  it('says plainly when it holds the whole thing', () => {
    const rec = atomRetrievalRecord(boundAtomContent('short')) as any;
    expect(rec.retrieval.truncated).toBe(false);
    expect(rec.retrieval.note).toContain('whole extracted text');
  });
});

describe('writeUploadRetrievalAtom — one writer for both upload paths', () => {
  const args = {
    organizationId: 7,
    sourceId: 'cre_source:42',
    fileName: 'protocol.pdf',
    text: longText,
    tags: ['source', 'chat_upload'],
  };

  it('writes the bound INTO the row, not just into the caller', async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [{ id: 91 }] }));
    const res = await writeUploadRetrievalAtom({ query } as any, args);
    expect(res.atomId).toBe(91);
    const params = query.mock.calls[0][1] as unknown[];
    expect(params).toBeDefined();
    const structured = JSON.parse(String(params[4]));
    expect(structured.retrieval.extractedChars).toBe(longText.length);
    expect(structured.retrieval.truncated).toBe(true);
    // And the content written is the bounded content, not the whole file.
    expect(String(params[3]).length).toBe(res.embeddedChars);
  });

  it('is idempotent — an upload already atomised writes nothing', async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] as Array<{ id: number }> }));
    const res = await writeUploadRetrievalAtom({ query } as any, args);
    expect(res.atomId).toBeNull();
    expect(res.embedded).toBe(false);
    // The bounds are still reported, so the caller can still say what is indexed.
    expect(res.truncated).toBe(true);
  });

  it('a failed write is not a failed upload, and still reports the bounds', async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => {
      throw new Error('relation "lumen_data_atoms" does not exist');
    });
    const res = await writeUploadRetrievalAtom({ query } as any, args);
    expect(res.atomId).toBeNull();
    expect(res.embedded).toBe(false);
    expect(res.extractedChars).toBe(longText.length);
  });
});
