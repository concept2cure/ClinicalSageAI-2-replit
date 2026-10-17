import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const mocks = vi.hoisted(() => ({ scope: vi.fn(), load: vi.fn(), sourceRecheck: vi.fn(), programRecheck: vi.fn() }));
vi.mock('../catalog-scope', async () => ({ catalogScope: mocks.scope, sourceReadInput: (await import('./support/source-read-tool-fixture.js')).syntheticInput }));
vi.mock('../../vault/document-catalog.service', () => ({ revalidateActorSourceScope: mocks.sourceRecheck, loadDocumentForActor: mocks.load }));
vi.mock('../../c2c/current-program-access', () => ({ requireProgramScopeStillCurrent: mocks.programRecheck }));
import { loadDraftProjectSources, draftSourcePrompt, draftSourceAudit } from '../draft-project-sources';
const id = '10000000-0000-4000-8000-000000000001';
const program = '20000000-0000-4000-8000-000000000001';
const executor = { query: vi.fn() };
const ctx = { organizationId: 7, userId: 3, projectRef: program, sqlClient: executor };
const digest = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const sourceText = 'Prespecified primary endpoint: 12 of 30 subjects.';
const doc = (text = sourceText) => ({ id, organizationId: 7, programId: program, contentHash: 'a'.repeat(64), documentTitle: 'Study A CSR',
  fileName: 'csr.pdf', extractedText: text, extractedTextSha256: digest(text), isCurrent: true,
  originalFileAvailable: true, disposition: null,
  sourceAccess: { currentUseEligible: true },
  catalog: { contentHash: 'a'.repeat(64), status: 'extracted', extractionMethod: 'pdf-text', extractionConfidence: null } });
beforeEach(() => { vi.resetAllMocks(); mocks.scope.mockResolvedValue({ programId: program, executor,
  admittedScope: { organizationId: 7, userId: 3, programId: program, role: 'viewer', accessibleProgramIds: [program] },
  accessibleScope: { actor: { userId: 3, role: 'viewer' }, programIds: [program] } }); mocks.load.mockResolvedValue(doc()); });
describe('processed project sources for regulatory drafting', () => {
  it('loads saved text, binds source identity/version/span, and deduplicates IDs', async () => {
    const result = await loadDraftProjectSources([id, id], ctx);
    expect(mocks.load).toHaveBeenCalledTimes(3);
    expect(mocks.load).toHaveBeenNthCalledWith(1, expect.objectContaining({ documentId: id, organizationId: 7, userId: 3 }), { currentOnly: true });
    expect(mocks.load).toHaveBeenNthCalledWith(2, expect.objectContaining({ documentId: id, organizationId: 7, userId: 3 }), { includeText: true, currentOnly: true });
    expect(mocks.load).toHaveBeenNthCalledWith(3, expect.objectContaining({ documentId: id, organizationId: 7, userId: 3 }), { includeText: true, currentOnly: true });
    expect(result).toMatchObject({ status: 'loaded', sources: [{ version: 2, documentId: id, contentHash: 'a'.repeat(64), completeText: true,
      extractedTextSha256: digest(sourceText), spanSha256: digest(sourceText) }] });
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
    mocks.load.mockResolvedValue({ ...doc('x'.repeat(18000)), originalFileAvailable: false, disposition: 'keep_data',
      catalog: { contentHash: 'a'.repeat(64), status: 'cataloged', extractionMethod: 'pdf-ocr', extractionConfidence: 71 } });
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
    mocks.load.mockImplementation(async ({ documentId }: { documentId: string }) => ({ ...doc('x'.repeat(18000)), id: documentId }));
    const ids = Array.from({ length: 5 }, (_, i) => id.slice(0, -1) + (i + 1));
    await expect(loadDraftProjectSources(ids, ctx)).rejects.toThrow('SOURCE_UNAVAILABLE');
  });
  it('grounds a section in the stretch its terms name, deep in the document, and the span says where (S5d)', async () => {
    const front = 'Title page, synopsis and table of contents. '.repeat(2000);
    const results = '\n11.4 Efficacy results. The primary endpoint, change in FEV1 at week 24, improved by 120 mL.\n';
    const text = front + results + 'Appendices. '.repeat(1500);
    mocks.load.mockResolvedValue(doc(text));
    const result = await loadDraftProjectSources([id], ctx, 'efficacy primary endpoint FEV1 week 24');
    const src = result.sources[0];
    expect(src.basis).toBe('relevant');
    expect(src.span.start).toBeGreaterThan(80000);
    expect(src.text).toContain('improved by 120 mL');
    // The span names exactly the characters served.
    expect(text.slice(src.span.start, src.span.end)).toBe(src.text);
    expect(src.extractedTextSha256).toBe(digest(text));
    expect(src.spanSha256).toBe(digest(src.text));
    expect(src.completeText).toBe(false);
    expect(draftSourcePrompt(result)).toContain('text outside it was not read');
  });
  it('keeps the opening, and says so, when the section names nothing the document holds', async () => {
    mocks.load.mockResolvedValue(doc('x '.repeat(9000)));
    const src = (await loadDraftProjectSources([id], ctx, 'pharmacokinetics clearance')).sources[0];
    expect(src).toMatchObject({ basis: 'opening', span: { start: 0, end: 12000, totalChars: 18000 } });
  });
});

describe('V2 producer identity and final source authority', () => {
  it('retains text identities in audit metadata without raw evidence or shared span objects', async () => {
    const result = await loadDraftProjectSources([id], ctx);
    const audit = draftSourceAudit(result);
    expect(audit.projectSources[0]).toEqual({ version: 2, documentId: id, contentHash: 'a'.repeat(64),
      extractedTextSha256: digest(sourceText), spanSha256: digest(sourceText), span: result.sources[0].span });
    expect(JSON.stringify(audit)).not.toContain(sourceText);
    result.sources[0].span.end = 1;
    expect(audit.projectSources[0].span.end).toBe(sourceText.length);
  });

  it('rejects a same-length extraction change between metadata and text, including outside the window', async () => {
    const original = 'x'.repeat(18000);
    const changed = original.slice(0, -1) + 'y';
    mocks.load.mockResolvedValueOnce(doc(original)).mockResolvedValueOnce(doc(changed));
    await expect(loadDraftProjectSources([id], ctx)).rejects.toThrow('SOURCE_UNAVAILABLE');
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });

  it('refuses a claimed extraction digest that does not hash the actual loaded text', async () => {
    const forged = { ...doc(), extractedTextSha256: 'b'.repeat(64) };
    mocks.load.mockResolvedValue(forged);
    await expect(loadDraftProjectSources([id], ctx)).rejects.toThrow('SOURCE_UNAVAILABLE');
  });

  it.each([
    null, { ...doc(), extractedTextSha256: 'b'.repeat(64) },
    { ...doc(), contentHash: 'b'.repeat(64), catalog: { ...doc().catalog, contentHash: 'b'.repeat(64) } },
    { ...doc(), isCurrent: false }, { ...doc(), originalFileAvailable: false },
    { ...doc(), disposition: 'keep_data' }, { ...doc(), disposition: 'remove_data' },
    { ...doc(), disposition: 'supersede' }, { ...doc(), programId: id },
    { ...doc(), sourceAccess: { currentUseEligible: false } },
  ])('refuses the entire selection when final metadata changes: %j', async current => {
    mocks.load.mockResolvedValueOnce(doc()).mockResolvedValueOnce(doc()).mockResolvedValueOnce(current);
    await expect(loadDraftProjectSources([id], ctx)).rejects.toThrow('SOURCE_UNAVAILABLE');
    expect(mocks.sourceRecheck).not.toHaveBeenCalled();
  });

  it('rechecks the first source after reading a later source, rather than relying on its earlier admission', async () => {
    const other = '10000000-0000-4000-8000-000000000002';
    const later = { ...doc(), id: other };
    mocks.load.mockResolvedValueOnce(doc()).mockResolvedValueOnce(doc()).mockResolvedValueOnce(later).mockResolvedValueOnce(later)
      .mockResolvedValueOnce(doc(sourceText.replace('12', '13')));
    await expect(loadDraftProjectSources([id, other], ctx)).rejects.toThrow('SOURCE_UNAVAILABLE');
    expect(mocks.load).toHaveBeenNthCalledWith(5, expect.objectContaining({ documentId: id }), { includeText: true, currentOnly: true });
  });

  it('pins caller IDs, actor, project and request executor before the first await', async () => {
    const pendingIds = [id];
    const pendingCtx = { ...ctx };
    const pending = loadDraftProjectSources(pendingIds, pendingCtx);
    pendingIds[0] = program;
    pendingCtx.organizationId = 99;
    pendingCtx.userId = 88;
    pendingCtx.projectRef = id;
    pendingCtx.sqlClient = { query: vi.fn() };
    const result = await pending;
    expect(result.sources[0].documentId).toBe(id);
    expect(mocks.scope).toHaveBeenCalledWith(expect.objectContaining(ctx), 7, null, 'read');
    for (const [actor] of mocks.load.mock.calls) expect(actor).toMatchObject({ organizationId: 7, userId: 3, projectRef: program, documentId: id });
    expect(mocks.programRecheck).toHaveBeenCalledWith(executor, { organizationId: 7, userId: 3, programId: program }, expect.any(Object));
  });

  it.each(['source', 'program'])('refuses if final %s authority revalidation fails', async boundary => {
    (boundary === 'source' ? mocks.sourceRecheck : mocks.programRecheck).mockRejectedValueOnce(new Error('revoked'));
    await expect(loadDraftProjectSources([id], ctx)).rejects.toThrow('revoked');
  });

  it('moves a window end inward by one original UTF-16 unit instead of splitting a legitimate pair', async () => {
    const text = 'x'.repeat(11999) + '🧬' + 'later text';
    mocks.load.mockResolvedValue(doc(text));
    const result = await loadDraftProjectSources([id], ctx);
    expect(result.sources[0].span).toEqual({ start: 0, end: 11999, totalChars: text.length });
    expect(result.sources[0].text).toBe(text.slice(0, 11999));
    expect(result.sources[0].spanSha256).toBe(digest(text.slice(0, 11999)));
  });

  it('refuses ill-formed source text rather than inventing a Unicode replacement identity', async () => {
    mocks.load.mockResolvedValue(doc('Source \ud800 with unpaired surrogate'));
    await expect(loadDraftProjectSources([id], ctx)).rejects.toThrow('SOURCE_UNAVAILABLE');
  });

  it('refuses an ill-formed final extraction even when UTF-8 replacement yields the prior digest and length', async () => {
    const original = 'Source \ufffd marker';
    const invalid = 'Source \ud800 marker';
    expect(original.length).toBe(invalid.length);
    expect(digest(original)).toBe(digest(invalid));
    mocks.load.mockResolvedValueOnce(doc(original)).mockResolvedValueOnce(doc(original)).mockResolvedValueOnce(doc(invalid));
    await expect(loadDraftProjectSources([id], ctx)).rejects.toThrow('SOURCE_UNAVAILABLE');
  });

  it('keeps an unchanged astral extraction exact through final rechecking', async () => {
    const text = 'Study 🧬 日本語\nResult 47%';
    mocks.load.mockResolvedValue(doc(text));
    const result = await loadDraftProjectSources([id], ctx);
    expect(result.sources[0]).toMatchObject({ extractedTextSha256: digest(text), spanSha256: digest(text), text,
      span: { start: 0, end: text.length, totalChars: text.length }, completeText: true });
  });
});
