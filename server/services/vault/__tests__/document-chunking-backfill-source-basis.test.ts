/** Real sweep decisions with controlled writer/ledger seams, never a database or provider. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { backfillVaultChunks, type Queryable } from '../document-chunking-backfill.service';

const h = vi.hoisted(() => ({
  chunk: vi.fn<typeof import('../document-chunking.service.js').chunkAndEmbedDocument>(),
  chunkOutcome: vi.fn<typeof import('../document-chunking.service.js').recordChunkOutcome>(),
  extractionOutcome: vi.fn<typeof import('../document-catalog.service.js').recordExtractionOutcome>(),
  builderInputs: [] as Array<Parameters<typeof import('../document-catalog-core.js').buildExtractionOutcome>[0]>,
}));

vi.mock('../document-chunking.service.js', () => ({
  chunkAndEmbedDocument: h.chunk,
  recordChunkOutcome: h.chunkOutcome,
  isVaultChunkingEnabled: async () => false,
}));
vi.mock('../document-catalog.service.js', async () => {
  const core = await import('../document-catalog-core.js');
  return {
    recordExtractionOutcome: h.extractionOutcome,
    buildExtractionOutcome: (input: Parameters<typeof core.buildExtractionOutcome>[0]) => {
      h.builderInputs.push(input);
      return core.buildExtractionOutcome(input);
    },
  };
});
vi.mock('../../../db.js', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));

const ORG = 42;
const DOC = '20000000-0000-4000-8000-000000000042';
const HASH = 'a'.repeat(64);
type Row = {
  id: string; file_name: string | null; extracted_text: string | null;
  catalog_status: string | null; chunk_status: string | null;
  content_hash: string | null; page_count: number | null; uncatalogued: boolean;
};
function row(extractedText: string | null, overrides: Partial<Row> = {}): Row {
  return {
    id: DOC, file_name: 'diagnostics-study.pdf', extracted_text: extractedText,
    catalog_status: 'extracted', chunk_status: null, content_hash: HASH,
    page_count: 7, uncatalogued: false, ...overrides,
  };
}
function execWith(rows: Row[]): Queryable {
  return {
    // The cast adapts only the controlled function to the generic query surface.
    query: vi.fn(async () => ({ rows, rowCount: rows.length })) as unknown as Queryable['query'],
  };
}

beforeEach(() => {
  h.chunk.mockReset();
  h.chunk.mockResolvedValue({ ok: true, chunkCount: 2, embedded: false });
  h.chunkOutcome.mockReset();
  h.chunkOutcome.mockResolvedValue(undefined);
  h.extractionOutcome.mockReset();
  h.extractionOutcome.mockResolvedValue('extracted');
  h.builderInputs.length = 0;
});

const EDGE_SOURCES: Array<[string, string]> = [
  ['leading ASCII whitespace', '  \tSensitivity was 94% in the prespecified population.'],
  ['trailing whitespace', 'The device met the acceptance criterion. \r\n\t'],
  ['BOM and CRLF', '\ufeff\r\n  Lot 23-104 met specification.\r\n'],
  ['NBSP, Japanese and supplementary characters', '\u00a0\u3000診断試験の報告 𠮷 🧬 β\u3000\u00a0'],
];

describe('applied backfill hands the complete stored source to the canonical writer', () => {
  it.each(EDGE_SOURCES)('preserves %s exactly', async (_label, source) => {
    const report = await backfillVaultChunks(ORG, {
      apply: true, embed: false, exec: execWith([row(source)]),
    });
    expect(h.chunk).toHaveBeenCalledExactlyOnceWith({
      documentId: DOC, organizationId: ORG, text: source, embed: false,
    });
    expect(h.chunkOutcome).toHaveBeenCalledExactlyOnceWith({
      documentId: DOC, organizationId: ORG,
      result: { ok: true, chunkCount: 2, embedded: false },
    });
    expect(report).toEqual({
      examined: 1, indexed: 1, chunksWritten: 2, skipped: [], failed: [], dryRun: false,
    });
  });

  it('gives an uncatalogued source to the real outcome builder without changing its count convention', async () => {
    const source = '\ufeff\r\n  Approved diagnostic endpoint β 🧬.\u00a0\r\n';
    const exec = execWith([row(source, { uncatalogued: true, catalog_status: null })]);
    await backfillVaultChunks(ORG, { apply: true, embed: false, exec });
    expect(h.builderInputs).toEqual([{ text: source, method: 'stored_at_ingest' }]);
    expect(h.extractionOutcome).toHaveBeenCalledExactlyOnceWith(exec, {
      documentId: DOC, contentHash: HASH, pageCount: 7,
      outcome: {
        status: 'extracted', method: 'stored_at_ingest', confidence: null, error: null,
        charCount: source.trim().length, wordCount: source.trim().split(/\s+/).length,
      },
    });
    expect(h.chunk).toHaveBeenCalledExactlyOnceWith({
      documentId: DOC, organizationId: ORG, text: source, embed: false,
    });
  });

  it('leaves ordinary text and the existing report/ledger behavior unchanged', async () => {
    const source = 'The comparator assessment was independently adjudicated.';
    const report = await backfillVaultChunks(ORG, { apply: true, embed: false, exec: execWith([row(source)]) });
    expect(h.chunk).toHaveBeenCalledExactlyOnceWith({
      documentId: DOC, organizationId: ORG, text: source, embed: false,
    });
    expect(report).toMatchObject({ examined: 1, indexed: 1, chunksWritten: 2, dryRun: false });
    expect(h.builderInputs).toEqual([]);
    expect(h.extractionOutcome).not.toHaveBeenCalled();
  });
});

describe('source preservation retains blank skips and report-only behavior', () => {
  it.each<[string, string | null]>([
    ['NULL', null], ['empty', ''], ['ASCII whitespace', ' \t\r\n '], ['BOM/NBSP/ideographic whitespace', '\ufeff\u00a0\u3000'],
  ])('keeps %s skipped in both apply and dry-run modes', async (_label, source) => {
    for (const apply of [false, true]) {
      const report = await backfillVaultChunks(ORG, {
        apply, embed: false, exec: execWith([row(source, { uncatalogued: true })]),
      });
      expect(report).toEqual({
        examined: 1, indexed: 0, chunksWritten: 0, failed: [], dryRun: !apply,
        skipped: [{ documentId: DOC, fileName: 'diagnostics-study.pdf',
          reason: 'No extracted text is stored for this document. Re-ingest it to extract and index.' }],
      });
    }
    expect(h.chunk).not.toHaveBeenCalled();
    expect(h.chunkOutcome).not.toHaveBeenCalled();
    expect(h.builderInputs).toEqual([]);
    expect(h.extractionOutcome).not.toHaveBeenCalled();
  });

  it('retains the distinct extraction-failed explanation for whitespace-only failed extraction', async () => {
    const report = await backfillVaultChunks(ORG, {
      apply: true, embed: false,
      exec: execWith([row('\ufeff \r\n', { catalog_status: 'extraction_failed' })]),
    });
    expect(report.skipped).toEqual([{ documentId: DOC, fileName: 'diagnostics-study.pdf',
      reason: 'Extraction failed for this document; there is no text to index. Re-ingest it.' }]);
    expect(report.indexed).toBe(0);
    expect(h.chunk).not.toHaveBeenCalled();
    expect(h.chunkOutcome).not.toHaveBeenCalled();
  });

  it('never sends a nonblank edge-preserving source or uncatalogued outcome to a writer on dry-run', async () => {
    const source = '\ufeff\r\n   Study population: 42 participants.\r\n';
    const report = await backfillVaultChunks(ORG, {
      embed: true, exec: execWith([row(source, { uncatalogued: true })]),
    });
    expect(report).toEqual({ examined: 1, indexed: 0, chunksWritten: 0, skipped: [], failed: [], dryRun: true });
    expect(h.chunk).not.toHaveBeenCalled();
    expect(h.chunkOutcome).not.toHaveBeenCalled();
    expect(h.builderInputs).toEqual([]);
    expect(h.extractionOutcome).not.toHaveBeenCalled();
  });
});
