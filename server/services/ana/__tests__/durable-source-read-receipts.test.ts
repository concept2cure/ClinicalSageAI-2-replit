/** Actual deferral/settlement/guarded writer; synthetic short-transaction source/admission seams.
 * SQL concurrency/installed role guarantees are qualified separately. */
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  text: 'Arm A 12/30.', admitted: true, role: 'viewer', queries: [] as string[], released: 0,
  legacy: 'ok' as 'ok'|'permission'|'rls'|'wrong_target'|'integrity'|'zero'|'wrong_actor',
  durableOutcome: 'recorded' as 'recorded'|'already_recorded',
  commitFails: false, abortAfterAppend: null as AbortController|null, abortAfterCommit: null as AbortController|null,
  descriptors: [] as any[], append: vi.fn(),
}));
vi.mock('../../../db.js', () => ({ pool: { connect: async () => ({
  query: async (sql: string, values: unknown[] = []) => {
    h.queries.push(sql);
    if (sql.includes('INSERT INTO vault.document_read_receipts')) {
      if (h.legacy === 'permission') throw Object.assign(new Error('permission denied for table document_read_receipts'), { code: '42501' });
      if (h.legacy === 'rls') throw Object.assign(new Error('new row violates row-level security policy for table "document_read_receipts"'), { code: '42501' });
      if (h.legacy === 'wrong_target') throw Object.assign(new Error('permission denied for function is_vault_program_owner'), { code: '42501' });
      if (h.legacy === 'integrity') throw Object.assign(new Error('unexpected integrity failure'), { code: '23514' });
      if (h.legacy === 'zero') return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ id: '41', document_id: values[0], content_hash: values[1],
        char_start: values[2], char_end: values[3], read_by: h.legacy === 'wrong_actor' ? 999 : values[4], thread_id: values[5] }] };
    }
    if (sql === 'COMMIT') { if (h.commitFails) throw new Error('commit acknowledgement lost'); h.abortAfterCommit?.abort(); }
    return { rowCount: 0, rows: [] };
  }, release: () => { h.released++; },
}) } }));
vi.mock('../../../db/tenantStore.js', () => ({ getTenantScope: () => ({ tenantId: '42', role: 'member' }) }));
vi.mock('../../tenant/governed-tenant-context.js', () => ({ setTenantContextTx: vi.fn(async () => {}) }));
vi.mock('../source-read-scope.js', () => ({ admitAnaSourceReadScope: async () => {
  if (!h.admitted) throw new Error('current actor/source denied');
  return { organizationId: 42, userId: 7, role: h.role, projectId: 3, programId: '20000000-0000-4000-8000-000000000001', accessibleProgramIds: ['20000000-0000-4000-8000-000000000001'], actorFiltered: true };
} }));
vi.mock('../../vault/document-catalog-admission.js', () => ({ admitCatalogActor: async () => {
  if (!h.admitted) throw new Error('current actor/source denied'); return { role: h.role, projectId: 3 };
} }));
vi.mock('../../vault/document-catalog.service.js', () => ({ loadDocumentForOrg: async () => ({
  id: '10000000-0000-4000-8000-000000000001', organizationId: 42, programId: '20000000-0000-4000-8000-000000000001', contentHash: 'a'.repeat(64),
  extractedText: h.text, disposition: null, catalog: { contentHash: 'a'.repeat(64), status: 'extracted' },
}) }));
vi.mock('../source-admission-receipt-store.js', () => ({ appendSourceAdmissionReceipt: h.append }));
import * as receipts from '../read-receipts.js';
import * as source from '../source-read-receipt.js';
import type { ToolResultEntry } from '../agentic-loop.js';
const DOC = '10000000-0000-4000-8000-000000000001', PROGRAM = '20000000-0000-4000-8000-000000000001', TEXT = 'Arm A 12/30.';
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
function candidate(span = { start: 0, end: TEXT.length }) {
  const sourceSnapshot = { organizationId: 42, userId: 7, programId: PROGRAM, documentId: DOC, contentHash: 'a'.repeat(64),
    extractedTextSha256: sha(TEXT), totalChars: TEXT.length, span, threadId: 'server-thread' };
  const result = JSON.stringify({ ok: true, documentId: DOC, contentHash: sourceSnapshot.contentHash,
    extractedTextSha256: sourceSnapshot.extractedTextSha256, totalChars: TEXT.length, window: { ...span, text: TEXT.slice(span.start, span.end) } });
  return { documentId: DOC, contentHash: sourceSnapshot.contentHash, span, readBy: 7, result, sourceSnapshot };
}
function deferred(r = candidate()) {
  const map: receipts.DeferredReadReceipts = new Map();
  expect(receipts.deferReadReceipt(receipts.readReceiptContext(map, 'server-tool'), r)).toBe(true);
  return map;
}
const entry = (r: receipts.DeferredReadReceipt): ToolResultEntry => ({ tool_use_id: 'server-tool', name: 'read_project_document', content: r.result });
const settle = async (map: receipts.DeferredReadReceipts, opts: any = {}) => {
  const r = map.get('server-tool')!;
  return receipts.settleReadReceipts([entry(r)], [entry(r)], map, undefined, opts);
};
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('ANA_DURABLE_SOURCE_READ_RECEIPTS', '1');
  h.text = TEXT; h.admitted = true; h.role = 'viewer'; h.queries = []; h.released = 0; h.legacy = 'ok';
  h.durableOutcome = 'recorded'; h.commitFails = false; h.abortAfterAppend = null; h.abortAfterCommit = null; h.descriptors = [];
  h.append.mockImplementation(async (_q: unknown, descriptor: any) => {
    h.descriptors.push(descriptor); h.abortAfterAppend?.abort(); return { receiptId: descriptor.receiptId, outcome: h.durableOutcome };
  });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('private server source-admission identity', () => {
  it('replaces caller IDs with a synchronous server UUID/tool context and preserves it through snapshot/retry', () => {
    const r = { ...candidate(), admissionId: 'caller-spoof', toolUseId: 'caller-tool' };
    const pinned = deferred(r).get('server-tool')! as any;
    expect(pinned.admissionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(pinned.toolUseId).toBe('server-tool'); expect(pinned.admissionId).not.toBe('caller-spoof');
    expect(source.snapshotDeferredReadReceipt(pinned)).toMatchObject({ admissionId: pinned.admissionId, toolUseId: 'server-tool' });
  });
  it('does not reuse one admission ID for two different tool deferrals', () => {
    const map: receipts.DeferredReadReceipts = new Map(); const r = candidate();
    receipts.deferReadReceipt(receipts.readReceiptContext(map, 'one'), r);
    receipts.deferReadReceipt(receipts.readReceiptContext(map, 'two'), r);
    expect((map.get('one') as any).admissionId).not.toBe((map.get('two') as any).admissionId);
  });
  it('refuses direct durable writing without a genuine server deferral identity', async () => {
    const writer = (source as any).writeGuardedReadReceipt;
    await expect(writer({ ...candidate(), admissionId: '30000000-0000-4000-8000-000000000001', toolUseId: 'body-tool' })).rejects.toThrow();
    expect(h.append).not.toHaveBeenCalled(); expect(h.queries).not.toContain('COMMIT');
  });
});

describe('selected exact-source durable admission', () => {
  it.each(['0', 'true', ''])('preserves legacy-only settlement when flag is %j', async flag => {
    vi.stubEnv('ANA_DURABLE_SOURCE_READ_RECEIPTS', flag);
    expect(await settle(deferred())).toBe(1); expect(h.append).not.toHaveBeenCalled();
    expect(h.queries.some(sql => sql.includes('INSERT INTO vault.document_read_receipts'))).toBe(true);
  });
  it('records exact viewer source/slice/payload identities with the fresh role after actual COMMIT', async () => {
    const map = deferred(candidate({ start: 4, end: TEXT.length })); const r = map.get('server-tool')! as any; const events: any[] = [];
    expect(await settle(map, { onReceiptSettled: (id: string, result: any) => { events.push({ id, result }); } })).toBe(1);
    expect(h.descriptors).toHaveLength(1); expect(h.descriptors[0]).toMatchObject({ version: 2, receiptId: r.admissionId, checkpoint: 'host_budget_admitted',
      organizationId: 42, actorId: 7, admittedRole: 'viewer', programId: PROGRAM, documentId: DOC,
      originalSha256: 'a'.repeat(64), extractionSha256: sha(TEXT), totalChars: TEXT.length,
      ranges: [{ start: 4, end: TEXT.length, sha256: sha(TEXT.slice(4)) }], payloadSha256: sha(r.result), toolUseId: 'server-tool', threadId: 'server-thread' });
    expect(JSON.stringify(h.descriptors[0])).not.toContain(TEXT); expect(h.queries).toContain('COMMIT');
    expect(events).toEqual([{ id: 'server-tool', result: expect.objectContaining({ outcome: 'recorded', legacyReceipt: 'recorded' }) }]);
  });
  it('keeps a custom reader role without promoting stale request/model role claims', async () => {
    h.role = 'custom_scientist'; const r = candidate(); r.result = JSON.stringify({ ...JSON.parse(r.result), admittedRole: 'admin', receiptId: 'body-id' });
    expect(await settle(deferred(r))).toBe(1); expect(h.descriptors[0].admittedRole).toBe('custom_scientist'); expect(h.descriptors[0].receiptId).not.toBe('body-id');
  });
  it.each(['permission', 'rls'] as const)('allows narrowly identified optional legacy denial (%s) without inventing legacy persistence', async mode => {
    h.legacy = mode; const events: any[] = [];
    expect(await settle(deferred(), { onReceiptSettled: (_id: string, result: any) => { events.push(result); } })).toBe(1);
    expect(h.descriptors).toHaveLength(1); expect(h.queries).toContain('COMMIT');
    expect(h.queries.some(sql => sql.startsWith('ROLLBACK TO SAVEPOINT'))).toBe(true);
    expect(events[0]).toMatchObject({ outcome: 'recorded', legacyReceipt: 'not_recorded_permission_denied' });
  });
  it.each(['wrong_target', 'integrity', 'zero', 'wrong_actor'] as const)('does not acknowledge durable admission after unexpected legacy failure (%s)', async mode => {
    h.legacy = mode; const events: any[] = [];
    expect(await settle(deferred(), { onReceiptSettled: (_id: string, result: any) => { events.push(result); } })).toBe(0);
    expect(events).toEqual([]); expect(h.queries).toContain('ROLLBACK'); expect(h.queries).not.toContain('COMMIT');
  });
  it('preserves stable ID on identical retry and distinguishes it from a new row', async () => {
    const map = deferred(); const r = map.get('server-tool')! as any; const events: any[] = [];
    expect(await settle(map)).toBe(1); h.durableOutcome = 'already_recorded';
    const retry: receipts.DeferredReadReceipts = new Map([['server-tool', source.snapshotDeferredReadReceipt(r)]]);
    expect(await settle(retry, { onReceiptSettled: (_id: string, result: any) => { events.push(result); } })).toBe(0);
    expect(h.descriptors.map(d => d.receiptId)).toEqual([r.admissionId, r.admissionId]); expect(events[0].outcome).toBe('already_recorded');
  });
  it('does not acknowledge a lost COMMIT response', async () => {
    h.commitFails = true; const events: any[] = [];
    expect(await settle(deferred(), { onReceiptSettled: (_id: string, result: any) => { events.push(result); } })).toBe(0);
    expect(events).toEqual([]); expect(h.queries).toContain('ROLLBACK');
  });
  it('retains the true committed new count even if a notification callback throws', async () => {
    let notified = false;
    expect(await settle(deferred(), { onReceiptSettled: () => { notified = true; throw new Error('notification failed'); } })).toBe(1);
    expect(notified).toBe(true);
    expect(h.queries).toContain('COMMIT');
  });
  it('rejects same-length extraction changes and notifies the existing source-refusal callback', async () => {
    const map = deferred(); h.text = 'Arm B 21/30.'; const refused: string[] = [];
    expect(await settle(map, { onSourceRefused: (id: string) => { refused.push(id); } })).toBe(0);
    expect(refused).toEqual(['server-tool']); expect(h.append).not.toHaveBeenCalled();
  });
  it('rejects a revoked reader before either receipt persistence', async () => {
    const map = deferred(); h.admitted = false;
    expect(await settle(map)).toBe(0); expect(h.append).not.toHaveBeenCalled(); expect(h.queries).not.toContain('COMMIT');
  });
  it('observed cancellation after append rolls back without an accepted count', async () => {
    const controller = new AbortController(); h.abortAfterAppend = controller;
    expect(await settle(deferred(), { signal: controller.signal })).toBe(0); expect(h.queries).toContain('ROLLBACK'); expect(h.queries).not.toContain('COMMIT');
  });
  it('cancellation after actual COMMIT retains the committed count', async () => {
    const controller = new AbortController(); h.abortAfterCommit = controller;
    expect(await settle(deferred(), { signal: controller.signal })).toBe(1); expect(h.queries).toContain('COMMIT'); expect(h.queries).not.toContain('ROLLBACK');
  });
});
