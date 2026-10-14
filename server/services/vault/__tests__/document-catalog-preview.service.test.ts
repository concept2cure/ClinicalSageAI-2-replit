import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const h = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), admit: vi.fn(), embed: vi.fn(), write: vi.fn(), connect: vi.fn(), source: {} as any, covered: true }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query, connect: h.connect } }));
vi.mock('../../enhancedEmbeddingService.js', () => ({ getEmbeddingService: () => ({ embed: h.embed }) }));
vi.mock('../document-catalog-governance.service.js', () => ({ catalogStateOf: () => 'suggested', writeCatalogSuggestion: h.write }));
vi.mock('../document-catalog-admission.js', () => ({ admitCatalogActor: h.admit, CatalogAdmissionError: class extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } } }));
import { previewSourceFacts } from '../document-catalog.service.js';
import { CatalogAdmissionError } from '../document-catalog-admission.js';
const id = '20000000-0000-4000-8000-000000000002';
const program = '10000000-0000-4000-8000-000000000001';
const text = 'Batch B-104 assay result was 99.2%.';
const digest = createHash('sha256').update(text).digest('hex');
const anchor = () => ({ documentId: id, contentHash: 'a'.repeat(64), extractedTextSha256: digest, range: { start: 0, end: text.length }, exactQuote: text });
const candidate = () => ({ schemaVersion: 1, meaning: { kind: 'cmc_result', property: 'assay', productRef: null, batchAsWritten: 'B-104', materialAsWritten: null, methodAsWritten: null, resultRole: 'measured_result' }, value: { kind: 'scalar', asWritten: '99.2', unitAsWritten: '%' }, origin: { kind: 'source_statement', valueAnchor: anchor(), witnesses: [{ path: 'meaning.batchAsWritten', anchor: anchor() }] } });
const input = () => ({ documentId: id, organizationId: 42, userId: 7, programId: program, candidates: [candidate()] });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('ANA_CATALOG_SOURCE_FACT_PREVIEW', '1'); vi.stubEnv('ANA_DOCUMENT_CATALOG_FORCE_ON', 'true');
  h.source = { id, organization_id: 42, program_id: program, content_hash: 'a'.repeat(64), catalog_content_hash: 'a'.repeat(64), catalog_status: 'extracted', extraction_method: 'utf8', char_count: text.length, extracted_text: text, file_name: 'assay.txt', original_file_available: true };
  h.covered = true; h.admit.mockResolvedValue({ role: 'member', projectId: 17 });
  h.connect.mockResolvedValue({ query: h.query, release: h.release });
  h.query.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT d.id')) return { rows: h.source ? [h.source] : [] };
    if (sql.includes('SELECT char_start')) return { rows: h.covered ? [{ char_start: 0, char_end: text.length }] : [{ char_start: 0, char_end: 5 }] };
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql.trim())) return { rows: [] };
    throw new Error('Unexpected preview query');
  });
});
describe('canonical read-only scientific catalog preview service', () => {
  it('default-off gate refuses before opening a connection', async () => {
    vi.stubEnv('ANA_CATALOG_SOURCE_FACT_PREVIEW', '');
    expect(await previewSourceFacts(input())).toMatchObject({ ok: false, code: 'SOURCE_FACT_PREVIEW_DISABLED', persisted: false });
    expect(h.connect).not.toHaveBeenCalled();
  });
  it('invalid candidates refuse before a document or authority read', async () => {
    expect(await previewSourceFacts({ ...input(), candidates: [{ schemaVersion: 1, accepted: true }] })).toMatchObject({ ok: false, code: 'INVALID_FACT_SCHEMA', persisted: false });
    expect(h.connect).not.toHaveBeenCalled();
  });
  it('uses current write authority and exact project on a read-only executor', async () => {
    const result = await previewSourceFacts(input());
    expect(result).toMatchObject({ ok: true, persisted: false, reviewState: 'not_recorded', scientificQualification: 'unassessed', source: { contentHash: 'a'.repeat(64), extractedTextSha256: digest } });
    expect(result.results?.[0]).toMatchObject({ ok: true, transcription: { state: 'passed' }, context: { state: 'not_established' }, persisted: false });
    expect(h.admit).toHaveBeenCalledWith(expect.objectContaining({ query: h.query }), { organizationId: 42, userId: 7, programId: program }, { write: true, hold: false });
    expect(h.query.mock.calls[0][0]).toContain('READ ONLY');
    expect(h.query.mock.calls.find(([sql]) => sql.includes('SELECT d.id'))?.[1]).toEqual([id, 42, program]);
    expect(h.query.mock.calls.some(([sql]) => /INSERT|UPDATE|DELETE|SAVEPOINT/.test(sql))).toBe(false);
    expect(h.embed).not.toHaveBeenCalled(); expect(h.write).not.toHaveBeenCalled(); expect(h.release).toHaveBeenCalledOnce();
  });
  it('refuses revoked/private-project access and never loads the source', async () => {
    h.admit.mockRejectedValue(new CatalogAdmissionError(403, 'ANA_PROJECT_ACCESS_DENIED', 'Current access denied.'));
    expect(await previewSourceFacts(input())).toMatchObject({ ok: false, code: 'ANA_PROJECT_ACCESS_DENIED', persisted: false });
    expect(h.query.mock.calls.some(([sql]) => sql.includes('SELECT d.id'))).toBe(false);
    expect(h.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK'); expect(h.release).toHaveBeenCalledOnce();
  });
  it.each([7, null, undefined])('refuses a mismatched or absent recorded document organization: %s', async organizationId => {
    h.source.organization_id = organizationId;
    expect(await previewSourceFacts(input())).toMatchObject({ ok: false, code: 'SOURCE_UNAVAILABLE', persisted: false });
    const sourceSql = h.query.mock.calls.find(([sql]) => sql.includes('SELECT d.id'))?.[0];
    expect(sourceSql).toContain('d.organization_id = $2');
    expect(h.query.mock.calls.some(([sql]) => sql.includes('SELECT char_start'))).toBe(false);
  });
  it.each(['absent', 'wrong_hash', 'missing_hash', 'failed_extraction', 'empty', 'unsupported'])('refuses unavailable or unsupported current source: %s', async kind => {
    if (kind === 'absent') h.source = null;
    if (kind === 'wrong_hash') h.source.catalog_content_hash = 'b'.repeat(64);
    if (kind === 'missing_hash') h.source.content_hash = 'legacy-hash';
    if (kind === 'failed_extraction') h.source.catalog_status = 'extraction_failed';
    if (kind === 'empty') h.source.extracted_text = '  ';
    if (kind === 'unsupported') h.source.extraction_method = 'invented-method';
    expect(await previewSourceFacts(input())).toMatchObject({ ok: false, persisted: false });
    expect(h.embed).not.toHaveBeenCalled(); expect(h.write).not.toHaveBeenCalled();
  });
  it('retained data previews preserve the original availability caveat', async () => {
    h.source.original_file_available = false; h.source.disposition = 'keep_data';
    expect(await previewSourceFacts(input())).toMatchObject({ ok: true, persisted: false, source: { originalFileAvailable: false } });
  });
  it('requires complete byte-bound coverage against actual text', async () => {
    h.covered = false;
    expect(await previewSourceFacts(input())).toMatchObject({ ok: false, code: 'SOURCE_NOT_FULLY_READ', coverage: { complete: false }, persisted: false });
    h.source.char_count = 5;
    expect(await previewSourceFacts(input())).toMatchObject({ ok: false, code: 'SOURCE_NOT_FULLY_READ' });
  });
  it.each(['quote', 'text_hash', 'byte_hash', 'value'])('rejects the whole batch when one candidate binding fails: %s', async kind => {
    const request = input(); const bad = candidate();
    if (kind === 'quote') bad.origin.valueAnchor.exactQuote = 'Different source quote';
    if (kind === 'text_hash') bad.origin.valueAnchor.extractedTextSha256 = 'b'.repeat(64);
    if (kind === 'byte_hash') bad.origin.valueAnchor.contentHash = 'b'.repeat(64);
    if (kind === 'value') bad.value.asWritten = '88.4';
    request.candidates.push(bad);
    expect(await previewSourceFacts(request)).toMatchObject({ ok: false, code: 'SOURCE_FACT_BINDING_FAILED', persisted: false });
    expect(h.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false); expect(h.write).not.toHaveBeenCalled();
  });
  it('OCR output never acquires established context approval', async () => {
    h.source.extraction_method = 'pdf-ocr';
    expect((await previewSourceFacts(input())).results?.[0]).toMatchObject({ context: { state: 'not_established', reasons: [expect.objectContaining({ code: 'EXTRACTION_CAVEAT' })] }, scientificQualification: 'unassessed' });
  });
  it('read failure is visible and releases the connection', async () => {
    h.query.mockImplementation(async (sql: string) => { if (sql.includes('SELECT d.id')) throw new Error('Source read unavailable'); return { rows: [] }; });
    await expect(previewSourceFacts(input())).rejects.toThrow('Source read unavailable');
    expect(h.release).toHaveBeenCalledOnce(); expect(h.write).not.toHaveBeenCalled();
  });
  it('a caller cannot change candidates while authority admission waits', async () => {
    const request = input();
    h.admit.mockImplementation(async () => { request.candidates[0].value.asWritten = '88.4'; return { role: 'member', projectId: 17 }; });
    expect((await previewSourceFacts(request)).results?.[0]).toMatchObject({ ok: true, transcription: { state: 'passed' } });
  });
});
