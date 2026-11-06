import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const h = vi.hoisted(() => ({ query: vi.fn(), admit: vi.fn(), recheck: vi.fn(), order: [] as string[] }));
vi.mock('../../../db', () => ({ pool: { query: h.query } }));
vi.mock('../evidence-spine.service', () => ({ sourceIdList: (v: unknown) => Array.isArray(v) ? v.map(Number).filter(Number.isSafeInteger) : [] }));
vi.mock('../source-read-access', () => ({ getCurrentReadableSourceScope: h.admit, requireSourceReadScopeStillCurrent: h.recheck,
  SourceReadAccessError: class extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } } }));
import { readRetainedSourceContexts } from '../retained-source-context';
const PROGRAM = '11111111-1111-4111-8111-111111111111';
let text = 'Quality nonconformance NC-1: disposition pending. No approval asserted.';
let stored = text;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
beforeEach(() => {
  vi.resetAllMocks(); h.order = []; text = 'Quality nonconformance NC-1: disposition pending. No approval asserted.'; stored = text;
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
    expect(h.order).toEqual(['admitted', 'body', 'rechecked']);
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
  it('labels bounded native excerpts truthfully', async () => {
    stored = text = 'pending nonconformance; '.repeat(1000);
    const [result] = await readRetainedSourceContexts(7, PROGRAM, [9], { userId: 11 });
    expect(result.text).toHaveLength(16000);
    expect(result.truncated).toBe(true);
    expect(result.textSha256).toBe(sha(result.text));
  });
});
