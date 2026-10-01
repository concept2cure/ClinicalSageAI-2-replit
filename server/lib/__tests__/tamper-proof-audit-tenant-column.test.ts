/**
 * audit.tamper_proof_log carries the tenant of every row it is given, and the
 * per-tenant reads filter on it (DP-28, plan P1-27;
 * docs/evidence/D6/2026-10-01-tranche-4/P1-7-P1-27-residuals/).
 *
 * The store was one global hash chain with no tenant column at all
 * (server/lib/tamper-proof-audit.ts INSERT; db/migrations/20260813). A Part 11
 * record could not say whose it was, `search` and `getRecentEntries` answered
 * with every tenant's rows, and the only per-tenant reader
 * (auditService.getAuditLog's fallback) had to refuse outright. The table lives
 * in schema `audit`, which no RLS sweep covers, and it must stay outside RLS:
 * the writer reads the chain tail across ALL tenants to link the next row.
 *
 * Driven through an in-memory pool that keeps rows by the INSERT's own column
 * list, so a column the writer does not name is simply absent from the row —
 * which is what the defect looked like.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { TamperProofAuditLog, verifyTamperProofLogRows } from '../tamper-proof-audit';
import { runWithTenantScope, runWithSystemTenantScope } from '../../db/tenantStore';

const SECRET = 'test-tamper-proof-tenant-secret';

beforeAll(() => {
  process.env.AUDIT_HMAC_SECRET = SECRET;
});

type Row = Record<string, any>;

class FakePool {
  rows: Row[] = [];
  reads: Array<{ sql: string; params: unknown[] }> = [];
  private seq = 0;

  private async run(sql: string, params: unknown[] = []): Promise<{ rows: any[] }> {
    const s = sql.trim();
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(s) || /pg_advisory_xact_lock/i.test(s)) return { rows: [] };
    if (/ORDER BY sequence_number DESC LIMIT 1\s*$/i.test(s)) {
      const last = this.rows[this.rows.length - 1];
      return { rows: last ? [{ chain_hash: last.chain_hash, sequence_number: last.sequence_number }] : [] };
    }
    if (s.startsWith('INSERT INTO audit.tamper_proof_log')) {
      const cols = s.slice(s.indexOf('(') + 1, s.indexOf(')')).split(',').map(c => c.trim());
      const row: Row = { sequence_number: ++this.seq };
      cols.forEach((c, i) => {
        const v = params[i];
        row[c] = c === 'details' && typeof v === 'string' ? JSON.parse(v) : (v ?? null);
      });
      this.rows.push(row);
      return { rows: [] };
    }
    if (/FROM audit\.tamper_proof_log/i.test(s)) {
      this.reads.push({ sql: s, params });
      return { rows: this.rows.map(r => ({ ...r })) };
    }
    throw new Error(`FakePool: unhandled query: ${s.slice(0, 80)}`);
  }

  query = (sql: string, params?: unknown[]) => this.run(sql, params);
  connect = async () => ({ query: (sql: string, params?: unknown[]) => this.run(sql, params), release: () => {} });
}

function fresh() {
  const pool = new FakePool();
  return { pool, log: new TamperProofAuditLog(pool as unknown as Pool) };
}

const inTenant = <T>(tenantId: string, fn: () => T) =>
  runWithTenantScope({ tenantId, source: 'test', caller: 'dp28' }, fn);

describe('every row names its tenant', () => {
  it('writes the organisation the writer names', async () => {
    const { pool, log } = fresh();
    await log.log('RECORD_CREATED', 'create', { a: 1 }, { organizationId: 11 });
    expect(pool.rows[0]).toHaveProperty('organization_id', 11);
  });

  it('takes the tenant from the request scope when the writer names none', async () => {
    const { pool, log } = fresh();
    await inTenant('11', () => log.log('RECORD_UPDATED', 'update', {}, { userId: '7' }));
    expect(pool.rows[0]).toHaveProperty('organization_id', 11);
  });

  it('a row written with no tenant (platform) is NULL, not absent', async () => {
    const { pool, log } = fresh();
    await log.log('SYSTEM_STARTUP', 'boot', {});
    await runWithSystemTenantScope('dp28-test', () => log.log('SYSTEM_SHUTDOWN', 'stop', {}));
    expect(pool.rows.map(r => r.organization_id)).toEqual([null, null]);
  });

  it('an explicit null inside a tenant scope writes a platform row', async () => {
    const { pool, log } = fresh();
    await inTenant('11', () => log.log('AUDIT_VERIFICATION_PASSED', 'verify', {}, { organizationId: null }));
    expect(pool.rows[0]).toHaveProperty('organization_id', null);
  });

  it('refuses to attribute a row to a tenant other than the session’s', async () => {
    const { pool, log } = fresh();
    await expect(
      inTenant('11', () => log.log('RECORD_DELETED', 'delete', {}, { organizationId: 12 })),
    ).rejects.toThrow(/tenant/i);
    expect(pool.rows).toHaveLength(0);
  });
});

describe('the tenant is inside the hash, and the cut-over breaks nothing', () => {
  it('moving a row to another tenant is detected as tampering', async () => {
    const { pool, log } = fresh();
    await log.log('RECORD_CREATED', 'create', { k: 'v' }, { organizationId: 11 });
    const rows = pool.rows.map(r => ({ ...r }));
    expect(verifyTamperProofLogRows(rows as any, { hmacSecret: SECRET }).valid).toBe(true);
    rows[0].organization_id = 12;
    const moved = verifyTamperProofLogRows(rows as any, { hmacSecret: SECRET });
    expect(moved.valid).toBe(false);
    expect(moved.invalidReason).toMatch(/content_hash mismatch/);
  });

  it('a row written before the column existed (no organization_id at all) still verifies', async () => {
    const { pool, log } = fresh();
    await log.log('RECORD_CREATED', 'pre-cut-over', { k: 'v' });
    const legacy = pool.rows.map(({ organization_id: _drop, ...rest }) => rest);
    expect(verifyTamperProofLogRows(legacy as any, { hmacSecret: SECRET }).valid).toBe(true);
  });

  it('one chain across tenants and platform rows verifies end to end', async () => {
    const { log } = fresh();
    await log.log('SYSTEM_STARTUP', 'boot', {});
    await inTenant('11', () => log.log('RECORD_CREATED', 'a', {}));
    await inTenant('12', () => log.log('RECORD_CREATED', 'b', {}));
    const v = await inTenant('11', () => log.verifyChain());
    expect(v.valid).toBe(true);
    expect(v.entriesVerified).toBe(3);
  });

  it('the verifier’s own row is a platform row even when a tenant asked for it', async () => {
    const { pool, log } = fresh();
    await inTenant('11', () => log.log('RECORD_CREATED', 'a', {}));
    await inTenant('11', () => log.verifyChain());
    const verification = pool.rows.find(r => r.event_type === 'AUDIT_VERIFICATION_PASSED');
    expect(verification).toHaveProperty('organization_id', null);
  });
});

describe('per-tenant reads filter on the column', () => {
  const filterOf = (pool: FakePool) => {
    const last = pool.reads[pool.reads.length - 1];
    const m = /organization_id = \$(\d+)/.exec(last.sql);
    return m ? last.params[Number(m[1]) - 1] : undefined;
  };

  it('search inside a tenant scope is that tenant’s rows only', async () => {
    const { pool, log } = fresh();
    await inTenant('11', () => log.search({ resourceType: 'ind_application' }));
    expect(filterOf(pool)).toBe(11);
  });

  it('search naming a tenant outside any scope (a job) filters on it', async () => {
    const { pool, log } = fresh();
    await log.search({ organizationId: 11, limit: 5 });
    expect(filterOf(pool)).toBe(11);
  });

  it('search naming another tenant from inside a scope is refused before it runs', async () => {
    const { pool, log } = fresh();
    await expect(inTenant('11', () => log.search({ organizationId: 12 }))).rejects.toThrow(/tenant/i);
    expect(pool.reads).toHaveLength(0);
  });

  it('getRecentEntries inside a tenant scope is that tenant’s rows only', async () => {
    const { pool, log } = fresh();
    await inTenant('11', () => log.getRecentEntries(10));
    expect(filterOf(pool)).toBe(11);
  });

  it('platform tooling outside any tenant scope still reads the whole store', async () => {
    const { pool, log } = fresh();
    await log.search({ resourceType: 'x' });
    expect(filterOf(pool)).toBeUndefined();
  });
});

describe('boot says plainly when the column is missing', () => {
  /** The three initialize() probes, answered as a database the amendment has or has not reached. */
  const bootPool = (column: boolean) => ({
    query: async (sql: string) => {
      if (sql.includes('to_regclass')) return { rows: [{ present: true }] };
      if (sql.includes("column_name = 'organization_id'")) return { rows: [{ present: column }] };
      if (sql.includes('has_table_privilege')) return { rows: [{ role: 'app_service', can_insert: true }] };
      throw new Error(`unexpected query: ${sql.slice(0, 60)}`);
    },
  });

  it('refuses to initialise a store without organization_id, naming the migration', async () => {
    const log = new TamperProofAuditLog(bootPool(false) as unknown as Pool);
    await expect(log.initialize()).rejects.toThrow(/organization_id.*20260813_audit_tamper_proof_log/);
  });

  it('initialises a store that has it', async () => {
    const log = new TamperProofAuditLog(bootPool(true) as unknown as Pool);
    await expect(log.initialize()).resolves.toBeUndefined();
  });
});
