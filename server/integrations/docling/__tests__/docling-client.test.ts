/**
 * P-90 (the founder, 2026-11-01): the self-hosted Docling layout reader is
 * admitted, through the existing client (server/integrations/docling/client.ts).
 *
 * Before: the client POSTed raw bytes to `/parse` and read `{ text, sections }`.
 * docling-serve has neither, so against a real reader every call came back empty
 * ("docling_unavailable"), and its default address, port 8070, is GROBID's in
 * this repository's own compose file.
 *
 * The mapping is tested on real DoclingDocuments from Docling's own test data
 * (fixtures/README.md); the transport on a stand-in that answers only what
 * docling-serve's v1 file endpoint answers (docling-serve-stand-in.ts).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DoclingClient, DoclingReaderError, layoutFromDoclingDocument } from '../client';
import { alignPageSpans } from '../../../services/ocr/page-offsets';
import { chunkTypeOf } from '../../../services/vault/document-section-structure';
import { doclingFixture, formField, startDoclingServeStandIn, type StandIn } from './docling-serve-stand-in';

let reader: StandIn;
beforeAll(async () => { reader = await startDoclingServeStandIn(); });
afterAll(async () => { await reader?.close(); });
beforeEach(() => { reader.seen.length = 0; reader.answer = {}; });

const PDF = Buffer.from('%PDF-1.4\n% a study report\n%%EOF\n');

describe('a DoclingDocument, as the platform reads it', () => {
  it('reads five pages in reading order, each page\'s span verified, each heading a section', () => {
    const doc = doclingFixture('multi_page');
    const reading = layoutFromDoclingDocument(doc);
    const spans = alignPageSpans(reading.text, reading.pages);
    expect(spans?.map((s) => s.page)).toEqual([1, 2, 3, 4, 5]);
    for (const s of spans!) expect(s.end).toBeGreaterThan(s.start);

    const headers = doc.texts.filter((t: { label: string }) => t.label === 'section_header');
    expect(reading.sections.map((s) => s.title)).toEqual(headers.map((t: { text: string }) => t.text));
    expect(reading.sections.map((s) => s.pageStart)).toEqual(headers.map((t: { prov: Array<{ page_no: number }> }) => t.prov[0].page_no));
    expect(reading.text.startsWith('The Evolution of the Word Processor\n\nThe concept of the word processor')).toBe(true);
    // Each heading stands on its own line, so the Vault chunker can find it.
    const blocks = reading.text.split('\n\n');
    for (const s of reading.sections) expect(blocks).toContain(s.title);
  });

  it('keeps each table\'s cells, and writes its rows as tab-separated lines the Vault chunker reads as a table', () => {
    const doc = doclingFixture('masked_tables');
    const reading = layoutFromDoclingDocument(doc);
    expect(reading.tables).toHaveLength(doc.tables.length);
    for (const [i, table] of reading.tables.entries()) {
      const source = doc.tables[i].data;
      expect([table.numRows, table.numCols]).toEqual([source.num_rows, source.num_cols]);
      expect(table.cells).toHaveLength(source.table_cells.length);
      const rendered = reading.text.slice(table.start, table.end);
      expect(chunkTypeOf(rendered)).toBe('TABLE');
      const lines = rendered.split('\n');
      // Every cell's text is in its own row's line, at its own column.
      for (const cell of table.cells.filter((c) => c.text)) {
        const rowLine = lines.find((l) => l.split('\t')[cell.col] === cell.text);
        expect(rowLine, `${table.ref} r${cell.row} c${cell.col}`).toBeTruthy();
      }
      expect(table.cells.filter((c) => c.row === 0).every((c) => c.columnHeader)).toBe(true);
    }
  });

  it('leaves page headers, page footers and other furniture out of the text', () => {
    const doc = doclingFixture('masked_tables');
    const reading = layoutFromDoclingDocument(doc);
    const furniture = doc.texts.filter((t: { label: string; content_layer?: string }) =>
      t.content_layer === 'furniture' || ['page_header', 'page_footer'].includes(t.label));
    expect(furniture.length).toBeGreaterThan(0);
    const blocks = reading.text.split('\n\n');
    for (const f of furniture) expect(blocks).not.toContain(f.text);
  });
});

describe('the client speaks docling-serve\'s v1 file endpoint', () => {
  it('sends the file as a multipart form to /v1/convert/file, asks for JSON and no OCR, with the deployment\'s key', async () => {
    reader.answer = { document: doclingFixture('masked_tables'), apiKey: 'reader-key' };
    const reading = await new DoclingClient(reader.url, 10_000, 'reader-key').read(PDF, 'study-report.pdf');
    expect(reading).toEqual(layoutFromDoclingDocument(doclingFixture('masked_tables')));
    const [sent] = reader.seen;
    expect([sent.method, sent.url]).toEqual(['POST', '/v1/convert/file']);
    expect(sent.headers['x-api-key']).toBe('reader-key');
    expect(formField(sent.body, 'to_formats')).toEqual(['json']);
    expect(formField(sent.body, 'do_ocr')).toEqual(['false']);
    expect(formField(sent.body, 'image_export_mode')).toEqual(['placeholder']);
    expect(sent.body.toString('latin1')).toMatch(/name="files"; filename="study-report\.pdf"\r\nContent-Type: application\/pdf/);
    expect(formField(sent.body, 'files')).toEqual([PDF.toString('latin1')]);
  });

  it('sends no key header when the deployment set none', async () => {
    reader.answer = { document: doclingFixture('multi_page') };
    await new DoclingClient(reader.url, 10_000, '').read(PDF, 'a.pdf');
    expect(reader.seen[0].headers['x-api-key']).toBeUndefined();
  });

  it('a refused key, a failed conversion, an unreachable reader and a slow one are each refused with the reason', async () => {
    reader.answer = { document: doclingFixture('multi_page'), apiKey: 'reader-key' };
    await expect(new DoclingClient(reader.url, 10_000, 'wrong').read(PDF, 'a.pdf')).rejects.toThrow(/refused the file \(HTTP 401\)/);
    reader.answer = { document: null, status: 'failure' };
    await expect(new DoclingClient(reader.url, 10_000, '').read(PDF, 'a.pdf')).rejects.toThrow(/did not convert the file \(status failure\)/);
    await expect(new DoclingClient('http://127.0.0.1:9', 10_000, '').read(PDF, 'a.pdf')).rejects.toThrow(/could not be reached/);
    reader.answer = { document: doclingFixture('multi_page'), delayMs: 1_500 };
    await expect(new DoclingClient(reader.url, 300, '').read(PDF, 'a.pdf')).rejects.toThrow(DoclingReaderError);
    await expect(new DoclingClient(reader.url, 300, '').read(PDF, 'a.pdf')).rejects.toThrow(/did not answer within 300 ms/);
  });

  it('the intake pipeline\'s parse() returns the document\'s text and sections from a real reader', async () => {
    reader.answer = { document: doclingFixture('multi_page') };
    const parsed = await new DoclingClient(reader.url, 10_000, '').parse(PDF, 'a.pdf');
    expect(parsed.warnings).toEqual([]);
    expect(parsed.text).toBe(layoutFromDoclingDocument(doclingFixture('multi_page')).text);
    expect(parsed.sections[0]).toMatchObject({ title: 'The Evolution of the Word Processor', pageStart: 1 });
    expect(parsed.metadata).toMatchObject({ confidenceReported: false });
  });
});
