/**
 * P-90: Vault ingestion reaches the self-hosted layout reader, through the one
 * text extractor, when the deployment turned it on (2026-11-01;
 * extractDocumentText.ts extractPdfWithLayout, vault-inline-extraction.ts).
 *
 * Before: nothing reached the reader. The flag `oss.ingestion.docling_primary`
 * was read only by a function no code called, and the intake pipeline that
 * held the client had no caller. Vault read every PDF with pdf-parse, so a
 * table came out as runs of numbers with no rows or columns.
 *
 * The PDF is a real one in this repository (csrs/), read by the real pdf-parse
 * when the reader is not used. The reader is the docling-serve stand-in, which
 * answers with a real DoclingDocument from Docling's own test data.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { extractDocumentText } from '../extractDocumentText';
import { extractInline } from '../../vault/vault-inline-extraction';
import { layoutFromDoclingDocument } from '../../../integrations/docling/client';
import { chunkTypeOf } from '../../vault/document-section-structure';
import {
  doclingFixture, startDoclingServeStandIn, type StandIn,
} from '../../../integrations/docling/__tests__/docling-serve-stand-in';

const PDF = readFileSync(path.resolve(__dirname, '../../../../csrs/A0081186_Synopsis.pdf'));
const ENV = ['OSS_INGESTION_DOCLING_PRIMARY', 'DOCLING_BASE_URL', 'DOCLING_API_KEY', 'DOCLING_TIMEOUT_MS'] as const;
const saved: Partial<Record<(typeof ENV)[number], string | undefined>> = {};

let reader: StandIn;
beforeAll(async () => { reader = await startDoclingServeStandIn(); });
afterAll(async () => { await reader?.close(); });
beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  reader.seen.length = 0;
  reader.answer = { document: doclingFixture('masked_tables') };
  process.env.DOCLING_BASE_URL = reader.url;
  process.env.DOCLING_API_KEY = '';
  process.env.OSS_INGESTION_DOCLING_PRIMARY = 'true';
});
afterEach(() => {
  for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

const expected = () => layoutFromDoclingDocument(doclingFixture('masked_tables'));

describe('Vault ingestion reads a PDF with the layout reader when the deployment turned it on', () => {
  it('a PDF asked for with layout is the reader\'s reading: its tables cell by cell, its rows read as tables', async () => {
    const out = await extractDocumentText(PDF, 'application/pdf', 'A0081186_Synopsis.pdf', { layout: true });
    expect(reader.seen.map((r) => r.url)).toEqual(['/v1/convert/file']);
    expect(out.method).toBe('pdf-layout');
    expect(out.text).toBe(expected().text);
    expect(out.layout?.reader).toBe('docling');
    expect(out.layout?.tables).toHaveLength(3);
    for (const t of out.layout!.tables) expect(chunkTypeOf(out.text.slice(t.start, t.end))).toBe('TABLE');
    expect(out.pageSpans).toEqual([{ page: 1, start: 0, end: out.text.length }]);
    expect(out.layoutNotUsed).toBeUndefined();
  });

  it('the upload request asks for it too', async () => {
    const inline = await extractInline(PDF, 'application/pdf', 'A0081186_Synopsis.pdf');
    expect(inline.kind).toBe('read');
    expect(inline.kind === 'read' && inline.extracted.method).toBe('pdf-layout');
    expect(reader.seen).toHaveLength(1);
  });

  it('a reader that refuses the file leaves the platform\'s own reading, and says why', async () => {
    reader.answer = { document: null, httpStatus: 500 };
    const out = await extractDocumentText(PDF, 'application/pdf', 'A0081186_Synopsis.pdf', { layout: true });
    expect(out.method).toBe('pdf-text');
    expect(out.text.length).toBeGreaterThan(200);
    expect(out.layoutNotUsed).toMatch(/^The layout reader refused the file \(HTTP 500\)\. The PDF was read by the platform's own extractor\.$/);
  });

  it('an unreachable reader is said, never silent', async () => {
    process.env.DOCLING_BASE_URL = 'http://127.0.0.1:9';
    const out = await extractDocumentText(PDF, 'application/pdf', 'A0081186_Synopsis.pdf', { layout: true });
    expect(out.method).toBe('pdf-text');
    expect(out.layoutNotUsed).toMatch(/could not be reached/);
  });
});

describe('the reader is reached only where it was admitted', () => {
  it('with the flag off, nothing is sent to the reader and nothing is said', async () => {
    process.env.OSS_INGESTION_DOCLING_PRIMARY = 'false';
    const out = await extractDocumentText(PDF, 'application/pdf', 'A0081186_Synopsis.pdf', { layout: true });
    expect(reader.seen).toEqual([]);
    expect(out.method).toBe('pdf-text');
    expect(out.layoutNotUsed).toBeUndefined();
  });

  it('a caller that does not ask for layout (a chat upload, a review) never reaches it', async () => {
    const out = await extractDocumentText(PDF, 'application/pdf', 'A0081186_Synopsis.pdf');
    expect(reader.seen).toEqual([]);
    expect(out.method).toBe('pdf-text');
  });
});
