import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../vault/document-catalog.service', () => ({ loadDocumentForOrg: m.load }));
import { renderAuthoringExport, type RenderExportArgs } from '../authoring-export';

const program = '20000000-0000-4000-8000-000000000001';
const sourceId = '10000000-0000-4000-8000-000000000001';
const source = () => ({ id: sourceId, programId: program, contentHash: 'a'.repeat(64),
  fileName: 'validated-tlf.pdf', documentTitle: 'Study TLFs', extractedText: 'Exact study evidence',
  catalog: { contentHash: 'a'.repeat(64), status: 'extracted', extractionMethod: 'pdf-text' } });
function args(): RenderExportArgs {
  return { executor: { query: vi.fn(async () => ({ rows: [] })) }, tenantId: 7,
    doc: { id: '30000000-0000-4000-8000-000000000001', title: 'CSR', module: 'M5', status: 'APPROVED',
      client_program_id: program, provenance: { source: 'ana', projectSourceReferences: [{ sectionCode: '12',
        qualification: 'unassessed', verification: 'current_at_save', sources: [{ documentId: sourceId,
          programId: program, contentHash: 'a'.repeat(64), span: { start: 0, end: 20, totalChars: 20 } }] }] } },
    sections: [{ id: 'section', code: '12', title: 'Efficacy', content: '<p>Draft findings.</p>' }], format: 'xml', signatures: [] };
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
});
