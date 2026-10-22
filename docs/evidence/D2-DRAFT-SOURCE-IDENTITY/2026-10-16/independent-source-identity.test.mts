/** Held-out contract controls. Catalog/actor seams are mocked; production parsing and
 * source verification run unchanged. These are not database or authorization proofs. */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const seams = vi.hoisted(() => ({ load: vi.fn(), actorLoad: vi.fn(), revalidate: vi.fn(), programRevalidate: vi.fn(), scope: vi.fn() }));
vi.mock('../../../../server/services/vault/document-catalog.service.js', () => ({
  loadDocumentForOrg: seams.load, loadDocumentForActor: seams.actorLoad, revalidateActorSourceScope: seams.revalidate,
}));
vi.mock('../../../../server/services/ana/catalog-scope.js', () => ({
  catalogScope: seams.scope,
  sourceReadInput: (ctx: { organizationId: number; userId: number; projectRef: string }) => ({ ...ctx }),
}));
vi.mock('../../../../server/services/c2c/current-program-access.js', () => ({ requireProgramScopeStillCurrent: seams.programRevalidate }));

import { parseDraftSourceReferences, verifyDraftSourceReferences, verifySavedDraftSourceReferences } from '../../../../server/services/authoring/draft-source-references.js';
import { loadDraftProjectSources, draftSourceAudit, draftSourcePrompt } from '../../../../server/services/ana/draft-project-sources.js';

const documentId = 'd0000000-0000-4000-8000-000000000001';
const programId = 'e0000000-0000-4000-8000-000000000001';
const contentHash = '1'.repeat(64);
const original = 'PREFIX\nSensitivity 95.2%; specificity 98.1%.\nSUFFIX';
const span = { start: 7, end: 42, totalChars: original.length };
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const identity = (text: string, selected = span) => ({ version: 2 as const, extractedTextSha256: sha(text), spanSha256: sha(text.slice(selected.start, selected.end)) });
const reference = () => ({ documentId, contentHash, span: { ...span }, ...identity(original) });
const legacy = () => ({ documentId, contentHash, span: { ...span } });
const q = { query: vi.fn(async () => ({ rows: [] })) };
const actor = { id: '17', role: 'member' };
const options = () => ({ actor });
const current = (text = original) => ({
  id: documentId, organizationId: 9, programId, contentHash, extractedText: text, extractedTextSha256: sha(text),
  documentTitle: 'Diagnostic performance report', fileName: 'performance.pdf',
  originalFileAvailable: true, disposition: null,
  isCurrent: true, admittedScope: { organizationId: 9, userId: 17, programId, actorFiltered: true },
  sourceAccess: { actorFiltered: true, currentVersion: true, retainedTextOnly: false, currentUseEligible: true, receiptEligible: true, scope: 'open_project', notice: 'Synthetic authority seam; not a real grant.' },
  catalog: { contentHash, status: 'cataloged', extractionMethod: 'pdf-text', extractionConfidence: null },
});
const saved = (sources: unknown[], group = {}) => ({ client_program_id: programId, provenance: { projectSourceReferences: [{
  sectionCode: '7.2', qualification: 'unassessed', verification: 'current_at_save',
  sources: sources.map(source => ({ ...(source as object), programId })), ...group,
}] } });

beforeEach(() => {
  vi.clearAllMocks();
  seams.load.mockResolvedValue(current());
  seams.actorLoad.mockImplementation(async (_input, opts) => ({ ...current(), extractedText: opts?.includeText ? original : null }));
  seams.revalidate.mockResolvedValue(undefined);
  seams.programRevalidate.mockResolvedValue(undefined);
  seams.scope.mockResolvedValue({ programId, executor: q, admittedScope: {}, accessibleScope: {} });
});

describe('held-out malformed identities and historical downgrade controls', () => {
  it.each([
    ['no version', { version: undefined }], ['string version', { version: '2' }],
    ['unknown version', { version: 3 }], ['null version', { version: null }],
    ['missing extraction digest', { extractedTextSha256: undefined }],
    ['missing span digest', { spanSha256: undefined }], ['invalid extraction digest', { extractedTextSha256: 'a'.repeat(63) }],
    ['invalid span digest', { spanSha256: 'z'.repeat(64) }],
    ['missing start', { span: { end: span.end, totalChars: span.totalChars } }],
    ['coerced start', { span: { ...span, start: '7' } }],
    ['coerced end', { span: { ...span, end: '42' } }],
    ['coerced total', { span: { ...span, totalChars: String(span.totalChars) } }],
    ['fractional start', { span: { ...span, start: 7.5 } }],
    ['unsafe total', { span: { ...span, totalChars: Number.MAX_SAFE_INTEGER + 1 } }],
  ])('refuses %s in the strict new decoder and direct verifier', async (_label, patch) => {
    const candidate = { ...reference(), ...patch };
    expect(() => parseDraftSourceReferences([candidate])).toThrow();
    await expect(verifyDraftSourceReferences([candidate] as never, q, 9, programId, options())).rejects.toThrow();
    expect(seams.load).not.toHaveBeenCalled();
  });
  it('normalizes valid UUID and digests without accepting asserted authority', () => {
    const upper = { ...reference(), documentId: documentId.toUpperCase(), contentHash: contentHash.toUpperCase(),
      extractedTextSha256: sha(original).toUpperCase(), spanSha256: identity(original).spanSha256.toUpperCase(),
      approved: true, identityVerification: 'agency_accepted', text: original };
    expect(parseDraftSourceReferences([upper])).toEqual([reference()]);
  });
  it.each([
    ['V2 group with legacy source', saved([legacy()], { sourceReferenceVersion: 2 })],
    ['unknown group version', saved([reference()], { sourceReferenceVersion: 99 })],
    ['string group version', saved([reference()], { sourceReferenceVersion: '2' })],
    ['V2 group with missing span digest', saved([{ ...reference(), spanSha256: undefined }], { sourceReferenceVersion: 2 })],
    ['unversioned group with V2 source', saved([reference()])],
    ['partially stripped legacy-looking source', saved([{ ...legacy(), extractedTextSha256: sha(original) }])],
    ['legacy-looking source with null version', saved([{ ...legacy(), version: null }])],
    ['legacy-looking group with null version', saved([legacy()], { sourceReferenceVersion: null })],
  ])('refuses saved downgrade or partial-version case: %s', async (_label, value) => {
    await expect(verifySavedDraftSourceReferences(value, q, 9, actor)).rejects.toThrow();
  });
  it('accepts a complete saved V2 group', async () => {
    await expect(verifySavedDraftSourceReferences(saved([reference()], { sourceReferenceVersion: 2 }), q, 9, actor)).resolves.toBeUndefined();
  });
  it('does not backfill historical digests or mutate old provenance', async () => {
    const old = saved([legacy()]);
    const unchanged = structuredClone(old);
    seams.load.mockResolvedValue(current(original.replace('95.2', '85.2')));
    await expect(verifySavedDraftSourceReferences(old, q, 9, actor)).resolves.toBeUndefined();
    expect(old).toEqual(unchanged);
    expect(JSON.stringify(old)).not.toContain('extractedTextSha256');
  });
  it('keeps manual historical records available without inventing a source selection', async () => {
    await expect(verifySavedDraftSourceReferences({ provenance: { source: 'manual' } }, q, 9, actor)).resolves.toBeUndefined();
    expect(seams.load).not.toHaveBeenCalled();
  });
  it('admits exactly eight distinct 6,000-unit spans at the aggregate bound', () => {
    const refs = Array.from({ length: 8 }, (_, index) => ({ ...reference(),
      documentId: documentId.slice(0, -1) + (index + 1), span: { start: 80001, end: 86001, totalChars: 90000 } }));
    expect(parseDraftSourceReferences(refs)).toHaveLength(8);
    expect(() => parseDraftSourceReferences([...refs, { ...reference(), documentId: documentId.slice(0, -1) + '9' }])).toThrow();
    expect(() => parseDraftSourceReferences(refs.map(ref => ({ ...ref, span: { ...ref.span, end: ref.span.end + 1 } })))).toThrow();
  });
});

describe('held-out UTF-16, source eligibility and immutable-call controls', () => {
  it('verifies exact UTF-16 slices past offset 80,000 and preserves digests without raw text', async () => {
    const text = '前置🧪'.repeat(20001) + '\n検査性能 e\u0301 μg/mL 🧬 diagnostic result\n' + 'Z'.repeat(15000);
    const start = text.indexOf('検査性能');
    const selected = { start, end: start + 31, totalChars: text.length };
    expect(start).toBeGreaterThan(80000);
    const ref = { documentId, contentHash, span: selected, ...identity(text, selected) };
    seams.load.mockResolvedValue(current(text));
    const excerpts: Array<{ text: string }> = [];
    const verified = await verifyDraftSourceReferences([ref], q, 9, programId, { ...options(), excerpts } as never);
    expect(verified[0]).toMatchObject(ref);
    expect(verified[0]).not.toHaveProperty('text');
    expect(excerpts[0].text).toBe(text.slice(start, start + 31));
    expect(sha(excerpts[0].text)).toBe(ref.spanSha256);
  });
  it.each([
    ['wrong program', () => ({ ...current(), programId: documentId })],
    ['changed original bytes', () => ({ ...current(), contentHash: '2'.repeat(64) })],
    ['catalog belongs to another original', () => ({ ...current(), catalog: { ...current().catalog, contentHash: '2'.repeat(64) } })],
    ['withdrawn data', () => ({ ...current(), disposition: 'remove_data' })],
    ['superseded data', () => ({ ...current(), disposition: 'supersede' })],
    ['extraction failed', () => ({ ...current(), catalog: { ...current().catalog, status: 'extraction_failed' } })],
    ['actor facade denies', () => null],
  ])('refuses %s despite a syntactically valid V2 receipt', async (_label, value) => {
    seams.load.mockResolvedValue(value());
    await expect(verifyDraftSourceReferences([reference()], q, 9, programId, options())).rejects.toThrow();
  });
  it('allows retained extracted data when the original file is unavailable', async () => {
    seams.load.mockResolvedValue({ ...current(), originalFileAvailable: false, disposition: 'keep_data' });
    const verified = await verifyDraftSourceReferences([reference()], q, 9, programId, options());
    expect(verified[0]).toMatchObject({ originalFileAvailable: false, disposition: 'keep_data', ...identity(original) });
    expect(verified[0].sourceAvailability).toContain('unavailable');
  });
  it('propagates a canonical catalog refusal for foreign tenant or private-parent access', async () => {
    seams.load.mockRejectedValue(new Error('SYNTHETIC_FOREIGN_TENANT_OR_PRIVATE_PARENT_DENIED'));
    await expect(verifyDraftSourceReferences([reference()], q, 9, programId, options())).rejects.toThrow('SYNTHETIC_FOREIGN_TENANT_OR_PRIVATE_PARENT_DENIED');
    expect(seams.load).toHaveBeenCalledWith(documentId, 9, expect.objectContaining({ userId: 17, programId, currentOnly: true }));
    await expect(verifySavedDraftSourceReferences(saved([reference()], { sourceReferenceVersion: 2 }), q, 9, actor)).rejects.toThrow();
  });
  it('snapshots all reference objects before an awaited source lookup can mutate them', async () => {
    let entered!: () => void;
    let release!: (doc: ReturnType<typeof current>) => void;
    const reached = new Promise<void>(resolve => { entered = resolve; });
    const blocked = new Promise<ReturnType<typeof current>>(resolve => { release = resolve; });
    seams.load.mockImplementationOnce(() => { entered(); return blocked; });
    const refs = [reference()];
    const pending = verifyDraftSourceReferences(refs, q, 9, programId, options());
    await reached;
    refs[0].span.start = 8;
    refs[0].spanSha256 = '0'.repeat(64);
    refs[0].documentId = programId;
    release(current());
    const result = await pending;
    expect(result[0]).toMatchObject(reference());
  });
  it.each([
    ['unpaired high surrogate', 'A\ud800B', { start: 0, end: 3, totalChars: 3 }],
    ['unpaired low surrogate', 'A\udc00B', { start: 0, end: 3, totalChars: 3 }],
    ['slice splitting a valid astral pair', 'A🧪B', { start: 0, end: 2, totalChars: 4 }],
    ['slice starting inside a valid astral pair', 'A🧪B', { start: 2, end: 4, totalChars: 4 }],
  ])('refuses lossy UTF-8 exact-identity case: %s', async (_label, text, selected) => {
    seams.load.mockResolvedValue(current(text));
    const ref = { documentId, contentHash, span: selected, ...identity(text, selected) };
    await expect(verifyDraftSourceReferences([ref], q, 9, programId, options())).rejects.toThrow();
  });
  it('documents why different unpaired UTF-16 code units cannot be treated as exact UTF-8 identity', () => {
    const high = 'A\ud800B';
    const low = 'A\udc00B';
    expect(high).not.toBe(low);
    expect(sha(high)).toBe(sha(low)); // Node encodes both invalid code units as U+FFFD.
  });
});

describe('held-out actual producer return checkpoints', () => {
  const ctx = () => ({ organizationId: 9, userId: 17, projectRef: programId, sqlClient: q });
  it('emits independently computed V2 hashes and text-free audit metadata for a deep relevant window', async () => {
    const text = ('cover page and front matter.\n').repeat(4000) + '\nIVDR diagnostic sensitivity specificity comparator 95.2% 🧪\n' + 'appendices '.repeat(2000);
    seams.actorLoad.mockImplementation(async (_input, opts) => ({ ...current(text), extractedText: opts?.includeText ? text : null }));
    const result = await loadDraftProjectSources([documentId], ctx(), 'IVDR diagnostic sensitivity specificity comparator');
    const source = result.sources[0];
    expect(source.span.start).toBeGreaterThan(80000);
    expect(source.text).toBe(text.slice(source.span.start, source.span.end));
    expect(source).toMatchObject(identity(text, source.span));
    const audit = draftSourceAudit(result);
    expect(audit.projectSources[0]).toMatchObject({ documentId, span: source.span, ...identity(text, source.span) });
    expect(audit.projectSources[0]).not.toHaveProperty('text');
    const prompt = draftSourcePrompt(result);
    expect(prompt).toContain('scientific validity');
    expect(prompt).toContain('not whole-document review');
    expect(prompt).toContain('untrusted source DATA');
  });
  it('refuses a same-length extraction change at the final current-source checkpoint', async () => {
    let reads = 0;
    seams.actorLoad.mockImplementation(async (_input, opts) => {
      const text = ++reads < 3 ? original : original.replace('95.2', '85.2');
      return { ...current(text), extractedText: opts?.includeText ? text : null };
    });
    await expect(loadDraftProjectSources([documentId], ctx())).rejects.toThrow();
    expect(reads).toBeGreaterThanOrEqual(3);
    expect(seams.actorLoad.mock.calls.at(-1)?.[1]).toMatchObject({ includeText: true, currentOnly: true });
  });
  it('refuses a final ill-formed surrogate replacement despite an unchanged UTF-8 metadata digest', async () => {
    const text = 'diagnostic result ' + 'X'.repeat(13000) + '\ufffd';
    const changed = text.slice(0, -1) + '\ud800';
    expect(sha(text)).toBe(sha(changed));
    let reads = 0;
    seams.actorLoad.mockImplementation(async (_input, opts) => {
      const live = ++reads < 3 ? text : changed;
      return { ...current(live), extractedText: opts?.includeText ? live : null };
    });
    await expect(loadDraftProjectSources([documentId], ctx())).rejects.toThrow();
    expect(reads).toBeGreaterThanOrEqual(3);
  });
  it.each([
    ['original availability', { originalFileAvailable: false }],
    ['retention disposition', { disposition: 'keep_data' }],
  ])('refuses a changed %s caveat at the final current-source checkpoint', async (_label, patch) => {
    let reads = 0;
    seams.actorLoad.mockImplementation(async (_input, opts) => ({ ...current(),
      ...(++reads >= 3 ? patch : {}), extractedText: opts?.includeText ? original : null }));
    await expect(loadDraftProjectSources([documentId], ctx())).rejects.toThrow();
  });
  it('rechecks an earlier selected source after later selected source reads', async () => {
    const secondId = documentId.slice(0, -1) + '2';
    let firstReads = 0;
    let secondWasRead = false;
    seams.actorLoad.mockImplementation(async (input, opts) => {
      if (input.documentId === secondId) secondWasRead = true;
      const text = input.documentId === documentId && ++firstReads >= 3 ? original.replace('95.2', '85.2') : original;
      return { ...current(text), id: input.documentId, extractedText: opts?.includeText ? text : null };
    });
    await expect(loadDraftProjectSources([documentId, secondId], ctx())).rejects.toThrow();
    expect(secondWasRead).toBe(true);
    expect(firstReads).toBeGreaterThanOrEqual(3);
  });
  it('refuses a stale actor-derived extraction digest even when returned text looks valid', async () => {
    seams.actorLoad.mockImplementation(async (_input, opts) => ({ ...current(),
      extractedText: opts?.includeText ? original : null, extractedTextSha256: '0'.repeat(64) }));
    await expect(loadDraftProjectSources([documentId], ctx())).rejects.toThrow();
  });
  it('does not pass selected source text after final actor revalidation refuses', async () => {
    seams.revalidate.mockRejectedValue(new Error('SYNTHETIC_CURRENT_ACTOR_DENIED'));
    await expect(loadDraftProjectSources([documentId], ctx())).rejects.toThrow('SYNTHETIC_CURRENT_ACTOR_DENIED');
  });
  it('does not pass selected source text after final program revalidation refuses', async () => {
    seams.programRevalidate.mockRejectedValue(new Error('SYNTHETIC_CURRENT_PROGRAM_DENIED'));
    await expect(loadDraftProjectSources([documentId], ctx())).rejects.toThrow('SYNTHETIC_CURRENT_PROGRAM_DENIED');
  });
  it('snapshots caller IDs and actor/project context before the first awaited scope lookup', async () => {
    let entered!: () => void;
    let release!: (scope: object) => void;
    const reached = new Promise<void>(resolve => { entered = resolve; });
    const blocked = new Promise<object>(resolve => { release = resolve; });
    seams.scope.mockImplementationOnce(() => { entered(); return blocked; });
    const input = ctx();
    const ids = [documentId];
    const pending = loadDraftProjectSources(ids, input);
    await reached;
    input.organizationId = 999;
    input.userId = 999;
    input.projectRef = documentId;
    ids[0] = programId;
    release({ programId, executor: q, admittedScope: {}, accessibleScope: {} });
    const result = await pending;
    expect(result.sources[0].documentId).toBe(documentId);
    for (const call of seams.actorLoad.mock.calls) expect(call[0]).toMatchObject({ organizationId: 9, userId: 17, documentId, projectRef: programId });
    expect(seams.programRevalidate).toHaveBeenCalledWith(q, { organizationId: 9, userId: 17, programId }, expect.anything());
  });
  it('moves a 12,000-unit opening boundary inward rather than splitting a valid surrogate pair', async () => {
    const text = 'X'.repeat(11999) + '🧪' + 'tail';
    seams.actorLoad.mockImplementation(async (_input, opts) => ({ ...current(text), extractedText: opts?.includeText ? text : null }));
    const source = (await loadDraftProjectSources([documentId], ctx())).sources[0];
    expect(source.span).toEqual({ start: 0, end: 11999, totalChars: text.length });
    expect(source.text).toBe(text.slice(0, 11999));
    expect(source).toMatchObject(identity(text, source.span));
  });
  it('refuses ill-formed full extraction even when an otherwise usable excerpt precedes it', async () => {
    const text = 'X'.repeat(13000) + '\ud800';
    seams.actorLoad.mockImplementation(async (_input, opts) => ({ ...current(text), extractedText: opts?.includeText ? text : null }));
    await expect(loadDraftProjectSources([documentId], ctx())).rejects.toThrow();
  });
  it.each([
    ['FDA / US biotech clinical', 'FDA investigational biologic study endpoint'],
    ['EMA / EU pharma', 'EMA medicinal product pharmacokinetic exposure'],
    ['PMDA / Japan diagnostics', 'PMDA 日本 体外診断 diagnostic sensitivity'],
    ['Health Canada / Canadian devices', 'Health Canada medical device performance'],
    ['TGA / Australia diagnostics', 'TGA Australia diagnostic specificity'],
    ['EU IVDR / diagnostics', 'IVDR clinical performance sensitivity specificity'],
  ])('retains unassessed evidence semantics for %s', async (_label, text) => {
    seams.actorLoad.mockImplementation(async (_input, opts) => ({ ...current(text), extractedText: opts?.includeText ? text : null }));
    const result = await loadDraftProjectSources([documentId], ctx(), text);
    const source = result.sources[0];
    expect(source).toMatchObject(identity(text, source.span));
    expect(source).not.toHaveProperty('qualification');
    expect(source).not.toHaveProperty('agencyAcceptance');
    expect(draftSourcePrompt(result)).toContain('does not establish scientific validity, approval, or submission readiness');
  });
});

describe('independent extraction-bound draft-source controls', () => {
  it('retains complete V2 identity and drops caller text and qualification', () => {
    expect(parseDraftSourceReferences([{ ...reference(), text: 'invented source', qualification: 'approved' }])).toEqual([reference()]);
  });
  it('refuses the unversioned shape for NEW writes', () => {
    expect(() => parseDraftSourceReferences([legacy()])).toThrow();
  });
  it('accepts an unchanged V2 source at the actual verifier', async () => {
    await expect(verifyDraftSourceReferences([reference()], q, 9, programId, options())).resolves.toHaveLength(1);
    expect(seams.load).toHaveBeenCalledWith(documentId, 9, expect.objectContaining({ includeText: true, userId: 17, programId, currentOnly: true }));
  });
  it('refuses a same-length extraction correction INSIDE the selected span', async () => {
    const changed = original.replace('95.2', '85.2');
    expect(changed.length).toBe(original.length);
    seams.load.mockResolvedValue(current(changed));
    await expect(verifyDraftSourceReferences([reference()], q, 9, programId, options())).rejects.toThrow();
  });
  it('refuses a same-length extraction correction OUTSIDE the selected span', async () => {
    const changed = 'X' + original.slice(1);
    expect(changed.slice(span.start, span.end)).toBe(original.slice(span.start, span.end));
    seams.load.mockResolvedValue(current(changed));
    await expect(verifyDraftSourceReferences([reference()], q, 9, programId, options())).rejects.toThrow();
  });
  it.each(['extractedTextSha256', 'spanSha256'] as const)('refuses an incorrect %s even when file bytes and length match', async field => {
    await expect(verifyDraftSourceReferences([{ ...reference(), [field]: '0'.repeat(64) }], q, 9, programId, options())).rejects.toThrow();
  });
  it('preserves stored legacy references under their historical byte-and-length semantics', async () => {
    const source = legacy();
    delete (source.span as Partial<typeof span>).start;
    source.span.end = 9;
    await expect(verifySavedDraftSourceReferences(saved([source]), q, 9, actor)).resolves.toBeUndefined();
  });
  it('refuses a withdrawn source even with a stored legacy receipt', async () => {
    seams.load.mockResolvedValue({ ...current(), disposition: 'remove_data' });
    await expect(verifySavedDraftSourceReferences(saved([legacy()]), q, 9, actor)).rejects.toThrow();
  });
});
