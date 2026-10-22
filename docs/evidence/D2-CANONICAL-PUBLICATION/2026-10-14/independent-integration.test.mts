/** Actual selected writer/default settlement and actual append/fingerprint
 * engine; controlled source/SQL seams. No PostgreSQL or provider claim here. */
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ queries: [] as string[], rows: new Map<string, any>(), role: 'viewer', text: '', denied: false,
  legacy: 'ok', returning: 'ok', commitFails: false, abort: null as AbortController | null, released: 0 }));
const rowFor = (v: any[]) => ({ id: v[0], organization_id: v[1], receipt_version: v[2], checkpoint: v[3], actor_user_id: v[4], admitted_role: v[5], program_id: v[6], document_id: v[7], original_sha256: v[8], extraction_sha256: v[9], total_chars: v[10], ranges: JSON.parse(v[11]), payload_sha256: v[12], tool_use_id: v[13], thread_id: v[14], receipt_sha256: v[15] });
vi.mock('../../../../server/db.js', () => ({ db: {}, pool: { connect: async () => ({ release: () => { h.released++; }, query: async (sql: string, v: any[] = []) => {
  h.queries.push(sql);
  if (sql.startsWith('INSERT INTO public.ana_source_read_receipts')) {
    if (h.returning === 'zero') return { rows: [], rowCount: 0 };
    if (h.rows.has(v[0])) return { rows: [], rowCount: 0 };
    const row = rowFor(v); h.rows.set(v[0], row); h.abort?.abort();
    if (h.returning === 'wrong') return { rows: [{ ...row, actor_user_id: 9999 }], rowCount: 1 };
    if (h.returning === 'ambiguous') return { rows: [row, row], rowCount: 1 };
    return { rows: [row], rowCount: h.returning === 'null' ? null : 1 };
  }
  if (/SELECT id, organization_id/.test(sql) && sql.includes('public.ana_source_read_receipts')) return { rows: h.rows.has(v[0]) ? [h.rows.get(v[0])] : [], rowCount: h.rows.has(v[0]) ? 1 : 0 };
  if (sql.startsWith('INSERT INTO vault.document_read_receipts')) {
    if (h.legacy === 'permission') throw Object.assign(new Error('new row violates row-level security policy for table "document_read_receipts"'), { code: '42501' });
    if (h.legacy === 'integrity') throw Object.assign(new Error('synthetic check constraint failure'), { code: '23514' });
    if (h.legacy === 'wrong_permission') throw Object.assign(new Error('permission denied for function private_source_check'), { code: '42501' });
    return { rows: [{ id: '7', document_id: v[0], content_hash: v[1], char_start: v[2], char_end: v[3], read_by: v[4], thread_id: v[5] }], rowCount: 1 };
  }
  if (sql === 'COMMIT' && h.commitFails) throw new Error('synthetic commit acknowledgement unavailable');
  return { rows: [], rowCount: 0 };
} }) } }));
vi.mock('../../../../server/db/tenantStore.js', () => ({ getTenantScope: () => ({ tenantId: '815', role: 'member' }) }));
vi.mock('../../../../server/services/ana/source-read-scope.js', () => ({ admitAnaSourceReadScope: async () => {
  if (h.denied) throw new Error('synthetic revoked access');
  return { organizationId: 815, userId: 8151, role: h.role, projectId: 81501, programId: PROGRAM, accessibleProgramIds: [PROGRAM], actorFiltered: true };
} }));
vi.mock('../../../../server/services/vault/document-catalog-admission.js', () => ({ admitCatalogActor: async () => { if (h.denied) throw new Error('synthetic revoked access'); return { role: h.role, projectId: 81501 }; } }));
vi.mock('../../../../server/services/vault/document-catalog.service.js', () => ({ loadDocumentForOrg: async () => ({ id: DOC, organizationId: 815, programId: PROGRAM, contentHash: HASH, extractedText: h.text, disposition: null, catalog: { contentHash: HASH, status: 'extracted' } }) }));
import { deferReadReceipt, readReceiptContext, settleReadReceipts } from '../../../../server/services/ana/read-receipts.ts';
import { writeGuardedReadReceipt, verifyDeferredReadReceipt, snapshotDeferredReadReceipt } from '../../../../server/services/ana/source-read-receipt.ts';
const PROGRAM = '81818181-1111-4111-8111-000000000001', DOC = '82828282-1111-4111-8111-000000000001';
const HASH = 'a'.repeat(64), TEXT = 'prefix '.repeat(3000) + '🧬 Specimen K17 measured 27 mg.';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function candidate() {
  const span = { start: 21000, end: TEXT.length };
  const sourceSnapshot = { organizationId: 815, userId: 8151, programId: PROGRAM, documentId: DOC, contentHash: HASH, extractedTextSha256: sha(TEXT), totalChars: TEXT.length, span, threadId: 'reported-thread' };
  return { documentId: DOC, contentHash: HASH, span, readBy: 8151, sourceSnapshot,
    result: JSON.stringify({ ok: true, documentId: DOC, contentHash: HASH, extractedTextSha256: sha(TEXT), totalChars: TEXT.length, window: { ...span, text: TEXT.slice(span.start) } }) };
}
function pending(c: any = candidate()) { const map = new Map(); expect(deferReadReceipt(readReceiptContext(map, 'server-tool'), c)).toBe(true); return map; }
async function settle(map: Map<string, any>, opts: any = {}) { const r = map.get('server-tool'); const entries = [{ tool_use_id: 'server-tool', content: r.result }]; return settleReadReceipts(entries, entries, map, undefined, opts); }
beforeEach(() => { vi.stubEnv('ANA_DURABLE_SOURCE_READ_RECEIPTS', '1'); h.queries = []; h.rows = new Map(); h.role = 'viewer'; h.text = TEXT; h.denied = false; h.legacy = 'ok'; h.returning = 'ok'; h.commitFails = false; h.abort = null; h.released = 0; });
afterEach(() => vi.unstubAllEnvs());
describe('held-out durable writer boundary', () => {
  it('actual default selected settlement stores a late exact viewer slice and commits before notification', async () => {
    const map = pending(); const r = map.get('server-tool'); const notifications: any[] = [];
    expect(await settle(map, { onReceiptSettled: (_id: string, out: any) => { expect(h.queries.at(-1)).toBe('COMMIT'); notifications.push(out); } })).toBe(1);
    const row = h.rows.get(r.admissionId); expect(row).toMatchObject({ admitted_role: 'viewer', extraction_sha256: sha(TEXT), payload_sha256: sha(r.result), ranges: [{ start: 21000, end: TEXT.length, sha256: sha(TEXT.slice(21000)) }], tool_use_id: 'server-tool' });
    expect(JSON.stringify(row)).not.toContain('Specimen'); expect(notifications[0]).toMatchObject({ checkpoint: 'host_budget_admitted', outcome: 'recorded' });
  });
  it('flag off and truthy near-matches stay legacy-only', async () => { for (const flag of ['', '0', 'true', '1 ']) { vi.stubEnv('ANA_DURABLE_SOURCE_READ_RECEIPTS', flag); expect(await settle(pending())).toBe(1); } expect(h.rows.size).toBe(0); });
  it('caller receipt identity cannot mint server origin for the V2 writer', async () => { await expect(writeGuardedReadReceipt({ ...candidate(), admissionId: '83838383-1111-4111-8111-000000000001', toolUseId: 'body-tool' } as any)).rejects.toThrow(); expect(h.queries).toEqual([]); });
  it('genuine deferral replaces body identity and preserves it during private snapshot retry', async () => { const map = pending({ ...candidate(), admissionId: 'spoof', toolUseId: 'body-tool' }); const r = map.get('server-tool'); expect(r.admissionId).not.toBe('spoof'); expect(snapshotDeferredReadReceipt(r)).toMatchObject({ admissionId: r.admissionId, toolUseId: 'server-tool' }); });
  it('two actual deferrals get different admission identities', () => { const a = pending().get('server-tool'); const b = pending().get('server-tool'); expect(a.admissionId).not.toBe(b.admissionId); });
  it('fresh custom role supersedes body and stale request role claims', async () => { h.role = 'custom_lab_observer'; const c = candidate(); c.result = JSON.stringify({ ...JSON.parse(c.result), admittedRole: 'admin' }); expect(await settle(pending(c))).toBe(1); expect([...h.rows.values()][0].admitted_role).toBe(h.role); });
  it('actual store retry distinguishes existing same-ID history from a new row', async () => { const map = pending(); const r = map.get('server-tool'); expect(await settle(map)).toBe(1); const notify: any[] = []; expect(await settle(new Map([['server-tool', snapshotDeferredReadReceipt(r)]]), { onReceiptSettled: (_id: string, out: any) => notify.push(out) })).toBe(0); expect(h.rows.size).toBe(1); expect(notify[0].outcome).toBe('already_recorded'); });
  it('ordinary legacy INSERT policy denial is isolated and reported without legacy persistence', async () => { h.legacy = 'permission'; const n: any[] = []; expect(await settle(pending(), { onReceiptSettled: (_id: string, out: any) => n.push(out) })).toBe(1); expect(h.queries).toContain('ROLLBACK TO SAVEPOINT ana_optional_legacy_read_receipt'); expect(h.queries.at(-1)).toBe('COMMIT'); expect(n[0].legacyReceipt).toBe('not_recorded_permission_denied'); });
  it('unrelated permission and integrity errors refuse acknowledgement and commit', async () => { for (const legacy of ['wrong_permission', 'integrity']) { h.legacy = legacy; h.queries = []; expect(await settle(pending())).toBe(0); expect(h.queries).toContain('ROLLBACK'); expect(h.queries).not.toContain('COMMIT'); } });
  it('zero, null, ambiguous and mismatched actual store RETURNING refuse', async () => { for (const returning of ['zero', 'null', 'ambiguous', 'wrong']) { h.rows = new Map(); h.returning = returning; h.queries = []; expect(await settle(pending())).toBe(0); expect(h.queries).toContain('ROLLBACK'); expect(h.queries).not.toContain('COMMIT'); } });
  it('same-length extraction replacement refuses before either INSERT', async () => { const map = pending(); h.text = TEXT.replace('27 mg', '72 mg'); expect(await settle(map)).toBe(0); expect(h.queries.some(q => q.startsWith('INSERT'))).toBe(false); });
  it('cancel after V2 append refuses COMMIT and new count', async () => { const c = new AbortController(); h.abort = c; expect(await settle(pending(), { signal: c.signal })).toBe(0); expect(h.queries).not.toContain('COMMIT'); expect(h.queries).toContain('ROLLBACK'); });
  it('uncertain COMMIT has no acknowledged durable notification', async () => { h.commitFails = true; const n: any[] = []; expect(await settle(pending(), { onReceiptSettled: (_id: string, out: any) => n.push(out) })).toBe(0); expect(n).toEqual([]); expect(h.queries).toContain('ROLLBACK'); });
  it('revocation after actual deferral blocks persistence', async () => { const map = pending(); h.denied = true; expect(await settle(map)).toBe(0); expect(h.rows.size).toBe(0); });
  it('positive read-only handoff verification commits and releases without rollback', async () => { const r = pending().get('server-tool'); await verifyDeferredReadReceipt(r); expect(h.queries).toContain('COMMIT'); expect(h.queries).not.toContain('ROLLBACK'); expect(h.released).toBe(1); });
});
