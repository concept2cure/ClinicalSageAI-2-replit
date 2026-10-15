/** Held-out exact snapshot/host controls with explicit authority/DB seams.
 * Actual guard/writer SQL sequencing; PostgreSQL barriers are separate. */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../../server/db.js', () => ({ pool: { query: () => { throw new Error('UNOWNED_DATABASE_ACCESS'); } }, getPool: () => { throw new Error('UNOWNED_DATABASE_ACCESS'); }, db: {} }));
import { runWithTenantScope } from '../../../../server/db/tenantStore.ts';
import { deferReadReceipt, guardReadResultsForHandoff, settleReadReceipts } from '../../../../server/services/ana/read-receipts.ts';
import { validAnaSourceSnapshot, verifyDeferredReadReceipt, writeGuardedLegacyReadReceipt } from '../../../../server/services/ana/source-read-receipt.ts';

const program = '91919191-1111-4111-8111-000000000001';
const document = '92929292-1111-4111-8111-000000000001';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const TEXT = 'Subject K17 result 82 participants.';
const actorScope = { organizationId: 919, userId: 9191, role: 'viewer', projectId: 91901, programId: program, accessibleProgramIds: [program], actorFiltered: true as const };
let doc: any;
let denied = false;
let insertFail = false;
let zeroInsert = false;
let queries: string[];
const q = { query: async (sql: string, params: any[] = []) => {
  queries.push(sql);
  if (sql.startsWith('INSERT INTO vault.document_read_receipts')) {
    if (insertFail) throw new Error('synthetic failed insert');
    if (zeroInsert) return { rows: [], rowCount: 0 };
    return { rows: [{ id: '1', document_id: params[0], content_hash: params[1], char_start: params[2], char_end: params[3], read_by: params[4], thread_id: params[5] }], rowCount: 1 };
  }
  return { rows: [], rowCount: 0 };
}, release: vi.fn() };
const deps: any = { connect: async () => q,
  admitScope: async () => { if (denied) throw new Error('synthetic revoked scope'); return actorScope; },
  holdActor: async () => { if (denied) throw new Error('synthetic revoked actor'); }, loadDocument: async () => doc };
const scope = <T>(fn: () => T) => runWithTenantScope({ tenantId: '919', role: 'member', source: 'request', caller: 'independent-receipt-review' }, fn);
function receipt() {
  const snapshot = { organizationId: 919, userId: 9191, programId: program, documentId: document, contentHash: 'a'.repeat(64), extractedTextSha256: sha(TEXT), totalChars: TEXT.length, span: { start: 0, end: TEXT.length }, threadId: 'independent-thread' };
  const result = JSON.stringify({ ok: true, documentId: document, contentHash: snapshot.contentHash, extractedTextSha256: snapshot.extractedTextSha256, totalChars: TEXT.length, window: { start: 0, end: TEXT.length, text: TEXT }, receiptScope: 'host-budget-admitted legacy byte history', coverageAfterAdmission: { prospective: true } });
  return { documentId: document, contentHash: snapshot.contentHash, span: { ...snapshot.span }, readBy: 9191, sourceSnapshot: snapshot, result };
}
function pending() { const r = receipt(); const deferred = new Map(); expect(deferReadReceipt({ toolUseId: 'read-1', readReceipts: deferred }, r)).toBe(true); const original = [{ tool_use_id: 'read-1', content: r.result }]; return { r, deferred, original }; }
beforeEach(() => {
  denied = false; insertFail = false; zeroInsert = false; queries = []; vi.clearAllMocks();
  doc = { id: document, organizationId: 919, programId: program, contentHash: 'a'.repeat(64), isCurrent: true, disposition: null, originalFileAvailable: true, extractedText: TEXT,
    catalog: { contentHash: 'a'.repeat(64), status: 'extracted' } };
});

describe('independent exact source snapshot and legacy host admission', () => {
  it('R01 active viewer exact payload passes handoff and guarded legacy insertion', async () => {
    const p = pending();
    const guarded = await scope(() => guardReadResultsForHandoff(p.original, p.original, p.deferred, { verify: r => verifyDeferredReadReceipt(r, deps) }));
    expect(guarded).toEqual(p.original);
    expect(await scope(() => settleReadReceipts(p.original, guarded, p.deferred, r => writeGuardedLegacyReadReceipt(r, deps)))).toBe(1);
    expect(queries.some(sql => sql.includes('RETURNING id, document_id'))).toBe(true); expect(p.deferred.size).toBe(0);
  });
  it('R02 same-length extraction replacement cannot inherit its earlier hash', async () => {
    const p = pending(); doc.extractedText = TEXT.replace('82', '83'); expect(doc.extractedText.length).toBe(TEXT.length);
    const guarded = await scope(() => guardReadResultsForHandoff(p.original, p.original, p.deferred, { verify: r => verifyDeferredReadReceipt(r, deps) }));
    expect(JSON.parse(guarded[0].content)).toMatchObject({ ok: false, sourceContext: 'not_admitted', receiptRecorded: false });
    expect(guarded[0].content).not.toContain(TEXT);
    expect(await settleReadReceipts(p.original, guarded, p.deferred, vi.fn())).toBe(0);
  });
  it('R03 recorded source identity changes are refused before source handoff', async () => {
    for (const change of [{ contentHash: 'b'.repeat(64) }, { programId: '93939393-1111-4111-8111-000000000001' }, { organizationId: 920 }, { disposition: 'remove_data' }, { disposition: 'supersede' }]) {
      const previous = doc; doc = { ...previous, ...change }; const p = pending();
      const guarded = await scope(() => guardReadResultsForHandoff(p.original, p.original, p.deferred, { verify: r => verifyDeferredReadReceipt(r, deps) }));
      expect(JSON.parse(guarded[0].content).sourceContext).toBe('not_admitted'); expect(p.deferred.size).toBe(0); doc = previous;
    }
  });
  it('R04 revocation after deferral produces safe no-source response', async () => {
    const p = pending(); denied = true;
    const guarded = await scope(() => guardReadResultsForHandoff(p.original, p.original, p.deferred, { verify: r => verifyDeferredReadReceipt(r, deps) }));
    expect(JSON.parse(guarded[0].content)).toMatchObject({ code: 'ANA_SOURCE_READ_NOT_ADMITTED', receiptRecorded: false });
    expect(guarded[0].content).not.toContain(document); expect(guarded[0].content).not.toContain(TEXT);
  });
  it('R05 caller mutation does not mutate the private snapshot or original payload', async () => {
    const p = pending(); const saved = p.deferred.get('read-1');
    p.r.span.end = 1; p.r.sourceSnapshot.span.end = 1; p.r.sourceSnapshot.userId = 999; p.r.result = 'altered';
    expect(saved.sourceSnapshot).toMatchObject({ userId: 9191, span: { end: TEXT.length } });
    expect(Object.isFrozen(saved)).toBe(true); expect(Object.isFrozen(saved.sourceSnapshot.span)).toBe(true);
    expect(await scope(() => settleReadReceipts(p.original, p.original, p.deferred, r => writeGuardedLegacyReadReceipt(r, deps)))).toBe(1);
  });
  it('R06 invalid UTF-16 bounds and altered quote refuse rather than attesting metadata', async () => {
    for (const span of [{ start: -1, end: 1 }, { start: 0.5, end: 1 }, { start: 0, end: TEXT.length + 1 }, { start: 0, end: Number.MAX_SAFE_INTEGER + 1 }, { start: 1, end: 1 }]) {
      const r = receipt(); r.span = span; r.sourceSnapshot.span = span;
      expect(validAnaSourceSnapshot(r.sourceSnapshot)).toBe(false);
      expect(deferReadReceipt({ toolUseId: 'bad', readReceipts: new Map() }, r)).toBe(false);
    }
    const r = receipt(); const body = JSON.parse(r.result); body.window.text = TEXT.replace('82', '83'); r.result = JSON.stringify(body);
    const map = new Map(); expect(deferReadReceipt({ toolUseId: 'bad-payload', readReceipts: map }, r)).toBe(true);
    await expect(scope(() => verifyDeferredReadReceipt(map.get('bad-payload'), deps))).rejects.toThrow();
  });
  it('R07 budget replacement records nothing and clears the deferred round', async () => {
    const p = pending(); const writer = vi.fn();
    const replaced = [{ tool_use_id: 'read-1', content: 'whole result withheld by host budget' }];
    expect(await settleReadReceipts(p.original, replaced, p.deferred, writer)).toBe(0); expect(writer).not.toHaveBeenCalled(); expect(p.deferred.size).toBe(0);
  });
  it('R08 cancellation during the last verification also withdraws prior reads', async () => {
    const p = pending(); const r2 = receipt(); deferReadReceipt({ toolUseId: 'read-2', readReceipts: p.deferred }, r2);
    const entries = [...p.original, { tool_use_id: 'read-2', content: r2.result }]; const controller = new AbortController();
    let checks = 0;
    const guarded = await guardReadResultsForHandoff(entries, entries, p.deferred, { signal: controller.signal, verify: async () => { if (++checks === 2) controller.abort(); } });
    expect(guarded.every(r => JSON.parse(r.content).code === 'ANA_SOURCE_READ_CANCELLED')).toBe(true);
    expect(p.deferred.size).toBe(0); expect(await settleReadReceipts(entries, guarded, p.deferred, vi.fn())).toBe(0);
  });
  it('R09 failed and zero-row INSERT yield zero accepted receipts with rollback', async () => {
    for (const zero of [false, true]) {
      insertFail = !zero; zeroInsert = zero; const p = pending();
      expect(await scope(() => settleReadReceipts(p.original, p.original, p.deferred, r => writeGuardedLegacyReadReceipt(r, deps)))).toBe(0);
      expect(queries).toContain('ROLLBACK'); expect(p.deferred.size).toBe(0);
    }
  });
  it('R10 host helper result and writer columns do not fabricate provider or durable extraction proof', async () => {
    const p = pending(); const guarded = await guardReadResultsForHandoff(p.original, p.original, p.deferred, { verify: async () => {} });
    const body = JSON.parse(guarded[0].content); expect(body.receiptScope).toBe('host-budget-admitted legacy byte history'); expect(body.coverageAfterAdmission.prospective).toBe(true);
    expect(await scope(() => settleReadReceipts(p.original, guarded, p.deferred, r => writeGuardedLegacyReadReceipt(r, deps)))).toBe(1);
    const insert = queries.find(s => s.startsWith('INSERT INTO vault.document_read_receipts'))!;
    expect(insert).not.toContain('extracted_text_sha256'); expect(insert).not.toContain('provider'); expect(body).not.toHaveProperty('providerServed');
  });
});
