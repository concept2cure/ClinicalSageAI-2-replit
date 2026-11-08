import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const h = vi.hoisted(() => ({ query: vi.fn(), admit: vi.fn(), recheck: vi.fn(), eligible: vi.fn(), order: [] as string[] }));
vi.mock('../../../db', () => ({ pool: { query: h.query } }));
vi.mock('../evidence-spine.service', () => ({ getSource: h.eligible, sourceIdList: (v: unknown) => Array.isArray(v) ? v.map(Number).filter(Number.isSafeInteger) : [] }));
vi.mock('../source-read-access', () => ({ getCurrentReadableSourceScope: h.admit, requireSourceReadScopeStillCurrent: h.recheck,
  SourceReadAccessError: class extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } } }));
import { nativeSourceDispatchGuard, readRetainedSourceContexts } from '../retained-source-context';
const PROGRAM = '11111111-1111-4111-8111-111111111111';
let text = 'Quality nonconformance NC-1: disposition pending. No approval asserted.';
let stored = text;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
beforeEach(() => {
  vi.resetAllMocks(); h.order = []; text = 'Quality nonconformance NC-1: disposition pending. No approval asserted.'; stored = text;
  h.eligible.mockImplementation(async () => { h.order.push('eligible'); return { id: 9, organizationId: 7, clientProgramId: PROGRAM, sourceType: 'client_document', isCurrent: true, dataEligible: true }; });
  h.admit.mockImplementation(async () => { h.order.push('admitted'); return { scope: 'verified-accessible-sources', sourceIds: [9] }; });
  h.recheck.mockImplementation(async () => { h.order.push('rechecked'); });
  h.query.mockImplementation(async (sql: string) => {
    if (sql.includes('text_record.content')) return { rows: [] };
    if (sql.includes('s.extracted_text')) { h.order.push('body'); return { rows: [{ id: 9, title: 'NC-1', checksum: sha(text), content: stored }] }; }
    return { rows: [{ id: 9 }] };
  });
});
describe('existing selected-source conversation context admits native snapshots', () => {
  it('reads exact native text only after current parent admission and rechecks before supply', async () => {
    const result = await readRetainedSourceContexts(7, PROGRAM, [9], { userId: 11 });
    expect(h.order).toEqual(['admitted', 'eligible', 'body', 'rechecked', 'eligible']);
    expect(h.admit).toHaveBeenCalledWith(expect.anything(), { organizationId: 7, userId: 11, programId: PROGRAM, sourceIds: [9] });
    expect(result).toEqual([expect.objectContaining({ sourceId: 9, text, origin: 'native_record_snapshot', sha256: sha(text), originalFileAvailable: false, truncated: false })]);
  });
  it('cannot supply native text without a verified current actor', async () => {
    expect(await readRetainedSourceContexts(7, PROGRAM, [9])).toEqual([]);
    expect(h.order).toEqual([]);
  });
  it('does not convert denied or failed native permission checks into successful empty context', async () => {
    h.admit.mockRejectedValue(new Error('native parent verification unavailable'));
    await expect(readRetainedSourceContexts(7, PROGRAM, [9], { userId: 11 })).rejects.toThrow('verification unavailable');
    expect(h.order).not.toContain('body');
  });
  it('refuses changed native facts and retained-text tampering before handing context to a model', async () => {
    stored = 'Fabricated approved disposition';
    await expect(readRetainedSourceContexts(7, PROGRAM, [9], { userId: 11 })).rejects.toMatchObject({ status: 409 });
    stored = text; h.recheck.mockRejectedValue(new Error('native record changed'));
    await expect(readRetainedSourceContexts(7, PROGRAM, [9], { userId: 11 })).rejects.toThrow('native record changed');
  });
  it('never cuts a supplementary character into a lone UTF-16 surrogate', async () => {
    stored = text = 'a'.repeat(15999) + '😀' + 'tail';
    const [result] = await readRetainedSourceContexts(7, PROGRAM, [9], { userId: 11 });
    expect(Buffer.from(result.text, 'utf8').toString('utf8')).toBe(result.text);
    expect(result.text).toHaveLength(15999);
    expect(result.truncated).toBe(true);
  });
  it('refuses withdrawn native data before text and rechecks withdrawal after the read', async () => {
    h.eligible.mockResolvedValueOnce({ id: 9, organizationId: 7, clientProgramId: PROGRAM, sourceType: 'client_document', isCurrent: true, dataEligible: false });
    await expect(readRetainedSourceContexts(7, PROGRAM, [9], { userId: 11 })).rejects.toMatchObject({ status: 409 });
    expect(h.order).not.toContain('body');
    h.eligible.mockResolvedValueOnce({ id: 9, organizationId: 7, clientProgramId: PROGRAM, sourceType: 'client_document', isCurrent: true, dataEligible: true })
      .mockResolvedValueOnce({ id: 9, organizationId: 7, clientProgramId: PROGRAM, sourceType: 'client_document', isCurrent: true, dataEligible: false });
    await expect(readRetainedSourceContexts(7, PROGRAM, [9], { userId: 11 })).rejects.toMatchObject({ status: 409 });
  });
  it('labels bounded native excerpts truthfully', async () => {
    stored = text = 'pending nonconformance; '.repeat(1000);
    const [result] = await readRetainedSourceContexts(7, PROGRAM, [9], { userId: 11 });
    expect(result.text).toHaveLength(16000);
    expect(result.truncated).toBe(true);
    expect(result.textSha256).toBe(sha(result.text));
  });
});


describe('selected native context remains current at every provider dispatch', () => {
  const scope = () => ({ organizationId: 7, programId: PROGRAM, userId: 11 });
  const captured = () => readRetainedSourceContexts(7, PROGRAM, [9], { userId: 11 });

  it('rechecks the same admitted native snapshot on successive dispatches', async () => {
    const guard = nativeSourceDispatchGuard(scope(), await captured());
    expect(guard).toBeTypeOf('function');
    await guard!();
    await guard!();
    expect(h.admit).toHaveBeenCalledTimes(3);
    expect(h.recheck).toHaveBeenCalledTimes(3);
    expect(h.admit).toHaveBeenLastCalledWith(expect.anything(), { ...scope(), sourceIds: [9] });
  });

  it('copies the admitted identity and authenticated scope instead of following mutable input', async () => {
    const actor = scope();
    const contexts = await captured();
    const guard = nativeSourceDispatchGuard(actor, contexts);
    actor.organizationId = 99; actor.userId = 99; actor.programId = '22222222-2222-4222-8222-222222222222';
    contexts[0].sourceId = 99; contexts[0].text = 'Replacement'; contexts[0].sha256 = sha('Replacement');
    contexts[0].textSha256 = sha('Replacement'); contexts[0].representationId = 'native:99';
    await guard!();
    expect(h.admit).toHaveBeenLastCalledWith(expect.anything(), { ...scope(), sourceIds: [9] });
  });

  it('keeps zero-native legacy context unguarded and does not reread it', async () => {
    const [native] = await captured();
    const legacy = { ...native, origin: undefined, representationId: 'vault:legacy' };
    h.query.mockClear();
    expect(nativeSourceDispatchGuard(scope(), [legacy])).toBeUndefined();
    expect(nativeSourceDispatchGuard(scope(), [])).toBeUndefined();
    expect(h.query).not.toHaveBeenCalled();
  });

  it('guards only the admitted native IDs in a mixed retained/native selection', async () => {
    const [native] = await captured();
    const legacy = { ...native, sourceId: 22, origin: undefined, representationId: 'vault:legacy' };
    const guard = nativeSourceDispatchGuard(scope(), [legacy, native]);
    h.query.mockClear();
    await guard!();
    expect(h.query.mock.calls.every(([, parameters]) => JSON.stringify(parameters) === JSON.stringify([7, PROGRAM, [9]]))).toBe(true);
  });

  it('preserves the exact stable bounded excerpt and UTF-8 digest', async () => {
    stored = text = 'a'.repeat(15999) + '😀' + 'pending Quality record'.repeat(100);
    const contexts = await captured();
    const guard = nativeSourceDispatchGuard(scope(), contexts);
    expect(contexts[0].truncated).toBe(true);
    expect(contexts[0].text).toHaveLength(15999);
    await expect(guard!()).resolves.toBeUndefined();
  });

  it('refuses an originally supplied ID that disappears instead of accepting an empty reread', async () => {
    const guard = nativeSourceDispatchGuard(scope(), await captured());
    h.query.mockResolvedValue({ rows: [] });
    await expect(guard!()).rejects.toMatchObject({ code: 'NATIVE_SOURCE_CHANGED' });
  });

  it('does not adopt a newer valid snapshot after an earlier successful dispatch', async () => {
    const guard = nativeSourceDispatchGuard(scope(), await captured());
    await guard!();
    stored = text = 'Quality NC-1: new recorded facts, still no approval.';
    await expect(guard!()).rejects.toMatchObject({ code: 'NATIVE_SOURCE_CHANGED' });
  });

  it.each(['access', 'current fact', 'disposition', 'query'])(
    'refuses a late %s failure rather than treating it as empty success', async failure => {
      const guard = nativeSourceDispatchGuard(scope(), await captured());
      if (failure === 'access') h.admit.mockRejectedValue(new Error('access unavailable'));
      if (failure === 'current fact') h.recheck.mockRejectedValue(new Error('native fact superseded'));
      if (failure === 'disposition') h.eligible.mockResolvedValue({ id: 9, organizationId: 7, clientProgramId: PROGRAM,
        sourceType: 'client_document', isCurrent: true, dataEligible: false });
      if (failure === 'query') h.query.mockRejectedValue(new Error('source store unavailable'));
      await expect(guard!()).rejects.toThrow();
    },
  );
});
