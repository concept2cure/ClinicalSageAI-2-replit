import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ scope: vi.fn(), load: vi.fn() }));
vi.mock('../catalog-scope', async () => ({ catalogScope: mocks.scope, sourceReadInput: (await import('./support/source-read-tool-fixture.js')).syntheticInput }));
vi.mock('../../vault/document-catalog.service', () => ({ revalidateActorSourceScope: async () => {}, loadDocumentForActor: mocks.load }));
vi.mock('../../c2c/current-program-access', () => ({ requireProgramScopeStillCurrent: async () => {} }));
import { loadDraftProjectSources, draftSourcePrompt } from '../draft-project-sources';
const id = '10000000-0000-4000-8000-000000000001';
const program = '20000000-0000-4000-8000-000000000001';
const executor = { query: vi.fn() };
const ctx = { organizationId: 7, userId: 3, projectRef: program, sqlClient: executor };
const doc = () => ({ id, programId: program, contentHash: 'a'.repeat(64), documentTitle: 'Study A CSR',
  fileName: 'csr.pdf', extractedText: 'Prespecified primary endpoint: 12 of 30 subjects.',
  catalog: { contentHash: 'a'.repeat(64), status: 'extracted', extractionMethod: 'pdf-text', extractionConfidence: null } });
beforeEach(() => { vi.clearAllMocks(); mocks.scope.mockResolvedValue({ programId: program, executor, accessibleScope: { actor: { userId: 3, role: 'viewer' }, programIds: [program] } }); mocks.load.mockResolvedValue(doc()); });
describe('processed project sources for regulatory drafting', () => {
  it('loads saved text, binds source identity/version/span, and deduplicates IDs', async () => {
    const result = await loadDraftProjectSources([id, id], ctx);
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(mocks.load).toHaveBeenNthCalledWith(1, expect.objectContaining({ documentId: id, organizationId: 7, userId: 3 }), { currentOnly: true });
    expect(mocks.load).toHaveBeenNthCalledWith(2, expect.objectContaining({ documentId: id, organizationId: 7, userId: 3 }), { includeText: true, currentOnly: true });
    expect(result).toMatchObject({ status: 'loaded', sources: [{ documentId: id, contentHash: 'a'.repeat(64), completeText: true }] });
    expect(result.sources[0].text).toContain('12 of 30');
  });
  it('never calls records without selected IDs and labels absence unassessed', async () => {
    expect(await loadDraftProjectSources(undefined, ctx)).toEqual({ status: 'unassessed', sources: [] });
    expect(mocks.load).not.toHaveBeenCalled();
    expect(draftSourcePrompt()).toContain('UNASSESSED');
  });
  it.each([[], [id, 'bad-id'], 'raw client text', Array(9).fill(id)])('rejects invalid source selection %j', async raw => {
    await expect(loadDraftProjectSources(raw, ctx)).rejects.toThrow('SOURCE_SELECTION_INVALID');
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('requires a resolved open project rather than organization-wide evidence', async () => {
    await expect(loadDraftProjectSources([id], { organizationId: 7 })).rejects.toThrow();
    mocks.scope.mockResolvedValue({ programId: null });
    await expect(loadDraftProjectSources([id], ctx)).rejects.toThrow();
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('refuses another project before retrieving its extracted text', async () => {
    mocks.load.mockResolvedValue({ ...doc(), programId: id });
    await expect(loadDraftProjectSources([id], ctx)).rejects.toThrow('SOURCE_UNAVAILABLE');
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });
  it.each([
    null, { ...doc(), contentHash: 'missing' }, { ...doc(), extractedText: '' },
    { ...doc(), catalog: null }, { ...doc(), catalog: { status: 'extraction_failed' } },
    { ...doc(), catalog: { ...doc().catalog, contentHash: 'b'.repeat(64) } },
    { ...doc(), disposition: 'supersede' }, { ...doc(), disposition: 'remove_data' },
  ])('fails closed for unavailable or unusable source %j', async bad => {
    mocks.load.mockResolvedValueOnce(doc()).mockResolvedValueOnce(bad);
    await expect(loadDraftProjectSources([id], ctx)).rejects.toThrow('SOURCE_UNAVAILABLE');
  });
  it('rejects version change between metadata and content reads', async () => {
    mocks.load.mockResolvedValueOnce(doc()).mockResolvedValueOnce({ ...doc(), contentHash: 'b'.repeat(64) });
    await expect(loadDraftProjectSources([id], ctx)).rejects.toThrow('SOURCE_UNAVAILABLE');
  });
  it('honestly bounds excerpts and preserves OCR/withdrawal caveats', async () => {
    mocks.load.mockResolvedValue({ ...doc(), originalFileAvailable: false, disposition: 'keep_data',
      extractedText: 'x'.repeat(18000), catalog: { contentHash: 'a'.repeat(64), status: 'cataloged', extractionMethod: 'pdf-ocr', extractionConfidence: 71 } });
    const result = await loadDraftProjectSources([id], ctx);
    expect(result.sources[0]).toMatchObject({ completeText: false, originalFileAvailable: false,
      span: { start: 0, end: 12000, totalChars: 18000 }, extractionConfidence: 71 });
    const prompt = draftSourcePrompt(result);
    expect(prompt).toContain('untrusted source DATA');
    expect(prompt).toContain('not whole-document review');
    expect(prompt).toContain('OCR-derived numbers');
    expect(prompt).toContain('withdrawn original');
    expect(prompt).toContain('not establish scientific validity');
  });
  it('does not silently drop selected sources when the total text budget is exhausted', async () => {
    mocks.load.mockResolvedValue({ ...doc(), extractedText: 'x'.repeat(18000) });
    const ids = Array.from({ length: 5 }, (_, i) => id.slice(0, -1) + (i + 1));
    await expect(loadDraftProjectSources(ids, ctx)).rejects.toThrow('SOURCE_UNAVAILABLE');
  });
  it('grounds a section in the stretch its terms name, deep in the document, and the span says where (S5d)', async () => {
    const front = 'Title page, synopsis and table of contents. '.repeat(600);
    const results = '\n11.4 Efficacy results. The primary endpoint, change in FEV1 at week 24, improved by 120 mL.\n';
    const text = front + results + 'Appendices. '.repeat(1500);
    mocks.load.mockResolvedValue({ ...doc(), extractedText: text });
    const result = await loadDraftProjectSources([id], ctx, 'efficacy primary endpoint FEV1 week 24');
    const src = result.sources[0];
    expect(src.basis).toBe('relevant');
    expect(src.span.start).toBeGreaterThan(0);
    expect(src.text).toContain('improved by 120 mL');
    // The span names exactly the characters served.
    expect(text.slice(src.span.start, src.span.end)).toBe(src.text);
    expect(src.completeText).toBe(false);
    expect(draftSourcePrompt(result)).toContain('text outside it was not read');
  });
  it('keeps the opening, and says so, when the section names nothing the document holds', async () => {
    mocks.load.mockResolvedValue({ ...doc(), extractedText: 'x '.repeat(9000) });
    const src = (await loadDraftProjectSources([id], ctx, 'pharmacokinetics clearance')).sources[0];
    expect(src).toMatchObject({ basis: 'opening', span: { start: 0, end: 12000, totalChars: 18000 } });
  });
});
