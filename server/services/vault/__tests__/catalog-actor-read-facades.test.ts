import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ scope: {} as any, q: { query: vi.fn() } }));
vi.mock('../document-catalog-actor-access.js', () => ({ withAnaSourceReadScope: (_input: unknown, run: any) => run(h.q, h.scope) }));
import { runLoadDocumentForActor, runListProjectDocumentsForActor } from '../document-catalog-actor-reads.js';
const docId = '20000000-0000-4000-8000-000000000002';
const program = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000009';
const text = 'Measured assay of source batch: 99.2%';
const digest = createHash('sha256').update(text).digest('hex');
const source = () => ({ id: docId, organizationId: 42, programId: program, contentHash: 'a'.repeat(64), isCurrent: true,
  disposition: null, originalFileAvailable: true, extractedText: text, catalog: { status: 'extracted', contentHash: 'a'.repeat(64) } });
const input = () => ({ organizationId: 42, userId: 7, projectRef: program, documentId: docId });
beforeEach(() => { vi.clearAllMocks(); h.scope = { organizationId: 42, userId: 7, role: 'viewer', projectId: 11, programId: program, accessibleProgramIds: [program], actorFiltered: true }; });
describe('actor-aware catalog by-ID facades', () => {
  it('loads full text only within canonical allowed programs on the admitted executor', async () => {
    const load = vi.fn().mockImplementation(async () => source());
    const doc = await runLoadDocumentForActor(input(), { includeText: true }, { load });
    expect(load).toHaveBeenCalledWith(docId, 42, { includeText: true, executor: h.q, currentOnly: false, allowedProgramIds: [program], programId: program });
    expect(doc).toMatchObject({ extractedText: text, extractedTextSha256: digest, admittedScope: h.scope,
      sourceAccess: { actorFiltered: true, currentVersion: true, currentUseEligible: true, receiptEligible: true, scope: 'open_project' } });
  });
  it.each(['wrong-document', 'wrong-org', 'wrong-program', 'unknown-current', 'invalid-bytes', 'withdrawn', 'catalog-hash-mismatch'])('refuses unverifiable source identity: %s', async kind => {
    const row: any = source();
    if (kind === 'wrong-document') row.id = '20000000-0000-4000-8000-000000000003';
    if (kind === 'wrong-org') row.organizationId = 8;
    if (kind === 'wrong-program') row.programId = other;
    if (kind === 'unknown-current') delete row.isCurrent;
    if (kind === 'invalid-bytes') row.contentHash = 'invented';
    if (kind === 'withdrawn') row.disposition = 'remove_data';
    if (kind === 'catalog-hash-mismatch') row.catalog.contentHash = 'b'.repeat(64);
    await expect(runLoadDocumentForActor(input(), { includeText: true }, { load: vi.fn().mockResolvedValue(row) })).rejects.toBeInstanceOf(Error);
  });
  it('same-length extraction replacement before return cannot return the old text', async () => {
    const load = vi.fn().mockResolvedValueOnce(source()).mockResolvedValueOnce({ ...source(), extractedText: text.replace('99.2', '98.4') });
    await expect(runLoadDocumentForActor(input(), { includeText: true }, { load })).rejects.toMatchObject({ code: 'ANA_SOURCE_CHANGED' });
  });
  it('historical by-ID read is explicit and cannot earn a new current-source receipt', async () => {
    const load = vi.fn().mockImplementation(async () => ({ ...source(), isCurrent: false }));
    const doc = await runLoadDocumentForActor(input(), { includeText: true }, { load });
    expect(doc).toMatchObject({ sourceAccess: { currentVersion: false, currentUseEligible: false, receiptEligible: false } });
    expect(doc?.sourceAccess.notice).toContain('historical version');
  });
  it('keep_data serves retained text with original unavailable, without binary access', async () => {
    const load = vi.fn().mockImplementation(async () => ({ ...source(), disposition: 'keep_data', originalFileAvailable: false }));
    const doc = await runLoadDocumentForActor(input(), { includeText: true }, { load });
    expect(doc).toMatchObject({ extractedText: text, sourceAccess: { retainedTextOnly: true, receiptEligible: true } });
    expect(doc?.sourceAccess.notice).toContain('original file is unavailable');
  });
  it('metadata-only reads do not claim a delivered extraction or earn a receipt', async () => {
    const load = vi.fn().mockImplementation(async () => source());
    expect(await runLoadDocumentForActor(input(), {}, { load })).toMatchObject({ extractedText: null, extractedTextSha256: digest, sourceAccess: { receiptEligible: false } });
  });
  it('legacy readable text without a coherent recorded catalog cannot earn a new receipt', async () => {
    const load = vi.fn().mockImplementation(async () => ({ ...source(), catalog: null }));
    expect(await runLoadDocumentForActor(input(), { includeText: true }, { load })).toMatchObject({ extractedText: text, sourceAccess: { receiptEligible: false } });
  });
  it('an authenticated empty source scope remains empty', async () => {
    expect(await runLoadDocumentForActor(input(), { includeText: true }, { load: vi.fn().mockResolvedValue(null) })).toBeNull();
  });
  it('list queries use admitted scope before pagination and retain exact counts', async () => {
    const list = vi.fn().mockResolvedValue({ documents: [{ id: docId, programId: program }], total: 80, withheld: 79, notYetStudied: 70, extractionFailed: 2, unfiled: 3 });
    expect(await runListProjectDocumentsForActor(input(), { limit: 1 }, list)).toMatchObject({ total: 80, withheld: 79, actorFiltered: true, admittedScope: h.scope });
    expect(list).toHaveBeenCalledWith(42, { programId: program, limit: 1, executor: h.q, allowedProgramIds: [program], currentOnly: true });
  });
  it('returned source rows outside the admitted scope are unavailable, never post-filtered pages', async () => {
    const list = vi.fn().mockResolvedValue({ documents: [{ programId: other }], total: 1 });
    await expect(runListProjectDocumentsForActor(input(), { limit: 1 }, list)).rejects.toMatchObject({ code: 'ANA_SOURCE_ACCESS_DENIED' });
  });
});
