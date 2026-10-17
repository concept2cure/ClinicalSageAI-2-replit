import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PURGE_CHILD_TABLES, PURGE_DOORS, purgeTenant } from '../tenant-offboarding';
import { APPEND_ONLY_TABLES, auditRuntimeRoleGrants, withholdAppendOnlyPrivileges } from '../../../../scripts/db/provision-app-role.mjs';

vi.mock('../../../middleware/orgMembership', () => ({ invalidateOrgMembershipCache: vi.fn() }));
const ORG = 42;
const DIGEST = 'sha256:synthetic-final-export';
const STORE = 'ana_source_read_receipts';
const DOOR = 'purge_tenant_source_read_receipts';
const row = { id: ORG, name: 'Synthetic tenant', status: 'pending_deletion',
  deletion_requested_at: new Date('2026-07-01'), deletion_requested_by: 4, deletion_reason: 'synthetic lifecycle test',
  purge_eligible_at: new Date('2026-08-01'), purged_at: null, final_export_digest: null };
const receipt = { organization_id: ORG, digest: DIGEST, table_count: 2, row_count: 4, created_at: new Date('2026-10-01'), created_by: 4 };
type Options = { present?: boolean; door?: boolean; counts?: any[]; currentStatus?: string; futureRetention?: boolean; lostExport?: boolean; held?: boolean; auditFailure?: boolean; laterRetentionFailure?: boolean; statusRows?: any[]; statusRowCount?: number | null };

function preconditionResponse(via: 'pool' | 'client', sql: string, opts: Options) {
  if (/FROM tenant_export_receipts/.test(sql)) return { rows: opts.lostExport && via === 'client' ? [] : [receipt] };
  if (/FROM organizations/.test(sql)) return { rows: [{ ...row, status: via === 'client' ? opts.currentStatus ?? row.status : row.status,
    purge_eligible_at: via === 'client' && opts.futureRetention ? new Date('2099-01-01') : row.purge_eligible_at }] };
  if (/SELECT EXISTS.*qms_document_versions/s.test(sql)) return { rows: [{ qms_versions: false, frozen_inputs: false }] };
  if (/AS qms_versions/.test(sql)) return { rows: [{ qms_versions: true, frozen_inputs: true }] };
  if (/to_regclass/.test(sql)) return { rows: [{ present: opts.present !== false, door: opts.door !== false }] };
  if (/SELECT count\(\*\)::int AS active/.test(sql)) return { rows: [{ active: opts.held ? 1 : 0 }] };
  return undefined;
}

function deletionResponse(sql: string, opts: Options) {
  if (/^DELETE FROM ana_source_read_receipts/.test(sql)) throw Object.assign(new Error('Direct metadata deletion refused'), { code: opts.present === false ? '42P01' : '42501' });
  if (/^DELETE FROM documents/.test(sql) && opts.laterRetentionFailure) throw Object.assign(new Error('DOCUMENT_DISPOSITION_WRITE_REFUSED: retained derived data'), { code: '55000' });
  if (/^DELETE/.test(sql)) return { rows: [], rowCount: 1 };
  if (/^UPDATE organizations/.test(sql)) return { rows: opts.statusRows ?? [{ purged_at: new Date('2026-10-14') }],
    rowCount: opts.statusRowCount === undefined ? 1 : opts.statusRowCount };
  return undefined;
}

function fixture(opts: Options = {}) {
  const statements: Array<{ via: 'pool' | 'client'; sql: string; params: unknown[] }> = [];
  const respond = (via: 'pool' | 'client') => async (sql: string, params: unknown[] = []) => {
    statements.push({ via, sql, params });
    const precondition = preconditionResponse(via, sql, opts);
    if (precondition) return precondition;
    if (sql.includes(`FROM public.${DOOR}(`)) return { rows: opts.counts ?? [{ receipts: 3 }] };
    const deletion = deletionResponse(sql, opts);
    if (deletion) return deletion;
    if (/INSERT INTO audit_logs/.test(sql) && opts.auditFailure) throw new Error('Synthetic audit failure');
    return { rows: [], rowCount: 0 };
  };
  return { statements, query: vi.fn(respond('pool')), connect: vi.fn(async () => ({ query: vi.fn(respond('client')), release: vi.fn() })) } as any;
}
const purge = (db: any, childTables = [STORE, 'organization_users', 'documents']) => purgeTenant(db, {
  organizationId: ORG, purgedByUserId: 4, preconditions: { finalExportDigest: DIGEST }, childTables,
});
const index = (db: any, match: RegExp) => db.statements.findIndex((s: any) => match.test(s.sql));
const audit = (db: any) => JSON.parse(db.statements.find((s: any) => /INSERT INTO audit_logs/.test(s.sql)).params[13]);

describe('source admission metadata customer-data lifecycle', () => {
  it('preserves an existing narrowed tenant purge and its retained audit', async () => {
    const db = fixture();
    expect(await purge(db, ['documents'])).toMatchObject({ deletedRows: { documents: 1 } });
    expect(audit(db).exportManifest.digest).toBe(DIGEST);
    expect(index(db, /^COMMIT$/)).toBeGreaterThan(index(db, /INSERT INTO audit_logs/));
  });

  it('withholds runtime mutation grants after the broad schema grants', async () => {
    const calls: Array<{ sql: string; params: any[] }> = [];
    const db = { query: async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      const rows = sql.includes('WITH ORDINALITY') && params[1].includes(STORE)
        ? [{ schema: 'public', name: STORE, ref: `public.${STORE}`, cols: [] }] : [];
      return { rows, rowCount: rows.length };
    } };
    expect(await withholdAppendOnlyPrivileges(db, '"synthetic_runtime"')).toContain(`public.${STORE}`);
    expect(calls.some(c => c.sql === `REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.${STORE} FROM PUBLIC, "synthetic_runtime"`)).toBe(true);
  });

  it('detects mutation privileges on the source receipt store rather than treating it as mutable working data', async () => {
    const db = { query: async (sql: string) => {
      if (/FROM pg_roles/.test(sql)) return { rows: [{ rolname: 'synthetic_runtime', rolsuper: false, rolbypassrls: false, rolcanlogin: true }], rowCount: 1 };
      if (/has_schema_privilege/.test(sql)) return { rows: [{ schema: 'public', name: STORE, relkind: 'r', owned: false, schema_usage: true,
        can_select: true, can_insert: true, can_update: true, can_delete: true, can_truncate: true }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    } };
    expect((await auditRuntimeRoleGrants(db, 'synthetic_runtime')).excess).toContainEqual({ relation: `public.${STORE}`, held: ['UPDATE', 'DELETE', 'TRUNCATE'] });
  });

  it('registers append-only runtime grants and the controlled erasure door before actor/source parents', () => {
    expect(APPEND_ONLY_TABLES).toContainEqual({ schema: 'public', name: STORE });
    expect(PURGE_DOORS.find(d => d.fn === DOOR)).toMatchObject({ tables: [STORE], columns: ['receipts'], erasure: 'sourceReadReceiptErasure' });
    expect(PURGE_CHILD_TABLES).toContain(STORE);
    expect(PURGE_CHILD_TABLES.indexOf(STORE)).toBeLessThan(PURGE_CHILD_TABLES.indexOf('organization_users'));
    expect(PURGE_CHILD_TABLES.indexOf(STORE)).toBeLessThan(PURGE_CHILD_TABLES.indexOf('vault.documents'));
  });

  it('does not let runtime grant refresh revoke the reviewed exact purge door', () => {
    const allow = JSON.parse(readFileSync('scripts/db/security-definer-allowlist.json', 'utf8'));
    expect(allow.functions[`public.${DOOR}(p_org integer)`]).toMatchObject({ status: 'reviewed-risk' });
  });
});

describe('controlled source admission metadata erasure', () => {
  it.each([
    { statusRows: [], statusRowCount: 0 },
    { statusRows: [{ purged_at: null }], statusRowCount: 1 },
    { statusRows: [{ purged_at: new Date('2026-10-14') }], statusRowCount: 0 },
    { statusRows: [{ purged_at: new Date('2026-10-14') }], statusRowCount: null },
    { statusRows: [{ purged_at: 'unverified-time' }], statusRowCount: 1 },
  ])('rolls back new metadata erasure when final status UPDATE is unconfirmed %j', async opts => {
    const db = fixture(opts);
    await expect(purge(db)).rejects.toMatchObject({ code: 'SOURCE_READ_RECEIPT_PURGE_STATUS_UNCONFIRMED' });
    expect(index(db, new RegExp(`FROM public.${DOOR}\\(`))).toBeGreaterThan(-1);
    expect(index(db, /^ROLLBACK$/)).toBeGreaterThan(index(db, /^UPDATE organizations/));
    expect(index(db, /INSERT INTO audit_logs/)).toBe(-1);
    expect(index(db, /^COMMIT$/)).toBe(-1);
  });


  it('refuses an installed append-only store without its governed erasure door', async () => {
    const db = fixture({ door: false });
    await expect(purge(db)).rejects.toMatchObject({ code: 'SOURCE_READ_RECEIPT_PURGE_UNAVAILABLE' });
    expect(index(db, /^DELETE/)).toBe(-1);
    expect(index(db, /^COMMIT$/)).toBe(-1);
  });

  it('reports only the actual door count in the returned result and retained audit row', async () => {
    const db = fixture();
    const result = await purge(db);
    expect(result).toMatchObject({ sourceReadReceiptErasure: { receipts: 3 }, deletedRows: { [STORE]: 3 } });
    expect(audit(db).deletedRows[STORE]).toBe(3);
    expect(index(db, /^DELETE FROM ana_source_read_receipts/)).toBe(-1);
    expect(index(db, new RegExp(`FROM public.${DOOR}\\(`))).toBeLessThan(index(db, /UPDATE organizations/));
    expect(index(db, /INSERT INTO audit_logs/)).toBeLessThan(index(db, /^COMMIT$/));
  });

  it('records an absent optional store as absent, without claiming zero rows were erased', async () => {
    const db = fixture({ present: false });
    const result = await purge(db, [STORE]);
    expect(result).toMatchObject({ sourceReadReceiptErasure: { receipts: 0 } });
    expect(result.deletedRows).not.toHaveProperty(STORE);
    expect(audit(db).tablesAbsent).toContain(STORE);
    expect(index(db, new RegExp(`FROM public.${DOOR}\\(`))).toBe(-1);
  });

  it.each([[], [{ receipts: null }], [{ receipts: '' }], [{ receipts: false }], [{ receipts: -1 }], [{ receipts: 1.5 }], [{ receipts: 1 }, { receipts: 1 }]].map(counts => ({ counts })))('refuses unconfirmed erasure counts $counts', async ({ counts }) => {
    const db = fixture({ counts });
    await expect(purge(db)).rejects.toMatchObject({ code: 'SOURCE_READ_RECEIPT_PURGE_UNCONFIRMED' });
    expect(index(db, /^COMMIT$/)).toBe(-1);
    expect(index(db, /INSERT INTO audit_logs/)).toBe(-1);
  });

  it('reserves sources before status/hold state and before deleting actor rows', async () => {
    const db = fixture(); await purge(db);
    const catalog = index(db, /LOCK TABLE vault.document_catalog IN ROW EXCLUSIVE MODE/);
    const source = index(db, /LOCK TABLE vault.documents IN ROW EXCLUSIVE MODE/);
    const status = index(db, /FROM organizations[\s\S]*FOR UPDATE/);
    const hold = index(db, /LOCK TABLE vault.legal_holds IN SHARE MODE/);
    expect(catalog).toBeGreaterThan(-1); expect(source).toBeGreaterThan(catalog);
    expect(status).toBeGreaterThan(source); expect(hold).toBeGreaterThan(status);
    expect(hold).toBeLessThan(index(db, /^DELETE FROM organization_users/));
    expect(index(db, /FROM tenant_export_receipts[\s\S]*FOR SHARE/)).toBeGreaterThan(status);
  });

  it('rechecks status and retention after the source reservation wait', async () => {
    const changed = fixture({ currentStatus: 'active' });
    await expect(purge(changed)).rejects.toMatchObject({ code: 'TENANT_NOT_PENDING_DELETION' });
    expect(index(changed, /^DELETE/)).toBe(-1);
    const future = fixture({ futureRetention: true });
    await expect(purge(future)).rejects.toMatchObject({ code: 'RETENTION_WINDOW_OPEN' });
    expect(index(future, /^DELETE/)).toBe(-1);
  });

  it('refuses a final export that disappeared after preflight', async () => {
    const db = fixture({ lostExport: true });
    await expect(purge(db)).rejects.toMatchObject({ code: 'EXPORT_EVIDENCE_UNVERIFIED' });
    expect(index(db, /^DELETE/)).toBe(-1);
  });

  it('keeps a legal-hold barrier before the fresh hold check and all erasure', async () => {
    const db = fixture({ held: true });
    await expect(purge(db)).rejects.toMatchObject({ code: 'LEGAL_HOLD_ACTIVE' });
    expect(index(db, /LOCK TABLE vault.legal_holds IN SHARE MODE/)).toBeLessThan(index(db, /SELECT count\(\*\)::int AS active/));
    expect(index(db, /LOCK TABLE vault.legal_holds IN SHARE MODE/)).toBeGreaterThan(-1);
    expect(index(db, /^DELETE/)).toBe(-1);
  });

  it.each([{ auditFailure: true }, { laterRetentionFailure: true }])('rolls back receipt erasure when a later required control fails %j', async opts => {
    const db = fixture(opts);
    await expect(purge(db)).rejects.toThrow();
    expect(index(db, new RegExp(`FROM public.${DOOR}\\(`))).toBeGreaterThan(-1);
    expect(index(db, /^ROLLBACK$/)).toBeGreaterThan(-1);
    expect(index(db, /^COMMIT$/)).toBe(-1);
  });
});
