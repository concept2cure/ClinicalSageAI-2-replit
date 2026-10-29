import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../vault/document-catalog.service', () => ({ loadDocumentForOrg: m.load }));
import { renderAuthoringExport, type RenderExportArgs } from '../authoring-export';
import { draftSourceIdentityForText } from '../../ana/draft-source-identity';
import { verifyDraftSourceReferences } from '../draft-source-references';
import { releaseGovernanceRead } from './release-governance-reads';

const program = '20000000-0000-4000-8000-000000000001';
const sourceId = '10000000-0000-4000-8000-000000000001';
const source = () => ({ id: sourceId, programId: program, contentHash: 'a'.repeat(64),
  fileName: 'validated-tlf.pdf', documentTitle: 'Study TLFs', extractedText: 'Exact study evidence',
  catalog: { contentHash: 'a'.repeat(64), status: 'extracted', extractionMethod: 'pdf-text' } });
function args(): RenderExportArgs {
  return { executor: { query: vi.fn(async (sql: string) => releaseGovernanceRead(sql) ?? { rows: [] }) }, tenantId: 7,
    // Not a CSR: a CSR's release also needs its scientific-review receipt
    // (csr-scientific-review.ts), held by csr-scientific-release-order.test.ts.
    doc: { id: '30000000-0000-4000-8000-000000000001', title: 'Clinical overview', module: 'M2', status: 'APPROVED',
      client_program_id: program, provenance: { source: 'ana', projectSourceReferences: [{ sectionCode: '12',
        qualification: 'unassessed', verification: 'current_at_save', sources: [{ documentId: sourceId,
          programId: program, contentHash: 'a'.repeat(64), span: { start: 0, end: 20, totalChars: 20 } }] }] } },
    sections: [{ id: 'section', code: '12', title: 'Efficacy', content: '<p>Draft findings.</p>' }], format: 'xml', signatures: [] };
}
function exactArgs(): RenderExportArgs {
  const a = args();
  const span = { start: 0, end: 10, totalChars: source().extractedText.length };
  a.doc.provenance = { source: 'ana', projectSourceReferences: [{ sectionCode: '12', sourceReferenceVersion: 2,
    qualification: 'unassessed', verification: 'current_at_save', sources: [{ documentId: sourceId,
      programId: program, contentHash: 'a'.repeat(64), span, ...draftSourceIdentityForText(source().extractedText, span) }] }] };
  return a;
}
beforeEach(() => { vi.clearAllMocks(); m.load.mockResolvedValue(source()); });
describe('new source-linked Authoring renditions reverify their saved evidence', () => {
  it.each([null, { ...source(), disposition: 'remove_data' }, { ...source(), disposition: 'supersede' },
    { ...source(), contentHash: 'b'.repeat(64) }, { ...source(), programId: sourceId },
    { ...source(), catalog: { ...source().catalog, status: 'extraction_failed' } },
    { ...source(), extractedText: 'shorter' }])('refuses unavailable or changed saved evidence %j', async unavailable => {
    m.load.mockResolvedValue(unavailable);
    await expect(renderAuthoringExport(args())).rejects.toMatchObject({ code: 'SOURCE_REFERENCES_UNAVAILABLE' });
  });
  it('keeps valid retained data usable and verifies through the caller executor', async () => {
    m.load.mockResolvedValue({ ...source(), originalFileAvailable: false, disposition: 'keep_data' });
    const a = args();
    expect((await renderAuthoringExport(a)).fileContent.toString()).toContain('Draft findings.');
    expect(m.load).toHaveBeenCalledWith(sourceId, 7, { includeText: true, executor: a.executor, programId: program, currentOnly: true });
  });
  it('does not invent source qualification for legacy or manually authored documents', async () => {
    const a = args();
    delete a.doc.provenance;
    expect((await renderAuthoringExport(a)).fileContent.toString()).toContain('Draft findings.');
    expect(m.load).not.toHaveBeenCalled();
  });
  it('does not discard malformed persisted source groups or a conflicting saved source scope', async () => {
    const a = args();
    a.doc.provenance = { projectSourceReferences: [{ sectionCode: '12', sources: [{ documentId: sourceId, programId: sourceId }] }] };
    await expect(renderAuthoringExport(a)).rejects.toMatchObject({ code: 'SOURCE_REFERENCES_UNAVAILABLE' });
  });
  it('fails closed when the current source read fails', async () => {
    m.load.mockRejectedValue(new Error('database temporarily unavailable'));
    await expect(renderAuthoringExport(args())).rejects.toMatchObject({ code: 'SOURCE_REFERENCES_UNAVAILABLE' });
  });
  it.each(['Xxact study evidence', 'Exact study evidencX'])('refuses a same-length extraction correction inside or outside the excerpt: %s', async extractedText => {
    m.load.mockResolvedValue({ ...source(), extractedText });
    await expect(renderAuthoringExport(exactArgs())).rejects.toMatchObject({ code: 'SOURCE_REFERENCES_UNAVAILABLE' });
  });
  it('retains untouched V2 and eligible original-unavailable text without storing a second text copy', async () => {
    m.load.mockResolvedValue({ ...source(), originalFileAvailable: false, disposition: 'keep_data' });
    const a = exactArgs(); const before = JSON.stringify(a.doc.provenance);
    expect((await renderAuthoringExport(a)).fileContent.toString()).toContain('Draft findings.');
    expect(JSON.stringify(a.doc.provenance)).toBe(before);
    expect(before).not.toContain(source().extractedText);
  });
  it.each(['version', 'extractedTextSha256', 'spanSha256'])('a marked V2 group cannot downgrade by stripping %s', async key => {
    const a = exactArgs();
    const group = (a.doc.provenance as { projectSourceReferences: Array<{ sources: Array<Record<string, unknown>> }> }).projectSourceReferences[0];
    delete group.sources[0][key];
    await expect(renderAuthoringExport(a)).rejects.toMatchObject({ code: 'SOURCE_REFERENCES_UNAVAILABLE' });
    expect(m.load).not.toHaveBeenCalled();
  });
  it('refuses a missing/unknown group marker while any V2 reference identity remains', async () => {
    for (const marker of [undefined, 3, '2', null]) {
      const a = exactArgs();
      const group = (a.doc.provenance as { projectSourceReferences: Array<Record<string, unknown>> }).projectSourceReferences[0];
      if (marker === undefined) delete group.sourceReferenceVersion; else group.sourceReferenceVersion = marker;
      await expect(renderAuthoringExport(a)).rejects.toMatchObject({ code: 'SOURCE_REFERENCES_UNAVAILABLE' });
    }
    expect(m.load).not.toHaveBeenCalled();
  });
  it('preserves legacy original-byte/length semantics without manufacturing extraction identity', async () => {
    m.load.mockResolvedValue({ ...source(), extractedText: 'Xxact study evidence' });
    const a = args(); const original = JSON.stringify(a.doc.provenance);
    expect((await renderAuthoringExport(a)).fileContent.toString()).toContain('Draft findings.');
    expect(JSON.stringify(a.doc.provenance)).toBe(original); expect(original).not.toContain('extractedTextSha256');
  });
  it('privately snapshots direct verifier input and actor before its first asynchronous source load', async () => {
    const span = { start: 0, end: 10, totalChars: source().extractedText.length };
    const ref = { documentId: sourceId, contentHash: 'a'.repeat(64), span, ...draftSourceIdentityForText(source().extractedText, span) };
    const actor = { id: '5', email: null };
    const pending = verifyDraftSourceReferences([ref], { query: vi.fn() }, 7, program, { actor });
    ref.span.start = 5; ref.extractedTextSha256 = 'f'.repeat(64); actor.id = '99';
    const [verified] = await pending;
    expect(verified.span.start).toBe(0); expect(verified.identityVerification).toBe('exact_extraction_and_span');
    expect(m.load).toHaveBeenCalledWith(sourceId, 7, expect.objectContaining({ userId: 5 }));
  });
  it('refuses a forged slice digest on direct typed verifier calls', async () => {
    const span = { start: 0, end: 10, totalChars: source().extractedText.length };
    const ref = { documentId: sourceId, contentHash: 'a'.repeat(64), span, ...draftSourceIdentityForText(source().extractedText, span), spanSha256: 'f'.repeat(64) };
    await expect(verifyDraftSourceReferences([ref], { query: vi.fn() }, 7, program, { actor: undefined })).rejects.toThrow();
  });
});
