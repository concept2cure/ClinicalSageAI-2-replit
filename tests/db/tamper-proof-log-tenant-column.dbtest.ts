/**
 * audit.tamper_proof_log names the tenant of every row, on real PostgreSQL,
 * written and read as the runtime role (DP-28, plan P1-27;
 * docs/evidence/D6/2026-10-01-tranche-4/P1-7-P1-27-residuals/).
 *
 * The store was one global chain with no tenant column. It still is one chain —
 * no RLS policy can sit on it without hiding other tenants' tail rows from the
 * writer and forking it — so tenancy is a column the writer sets and every
 * per-tenant read filters on. This file proves the database half: the column
 * exists after the migration (applied here, not assumed), the append-only
 * runtime role can write it, a tenant's read returns that tenant's rows only,
 * and the tenant is sealed into the row's hash.
 *
 * NOTHING THIS FILE WRITES IS COMMITTED. The table is append-only and one chain
 * shared by everything on this database: deleting probe rows afterwards (as
 * part11-audit-store.dbtest.ts must, with the trigger disabled) would unlink
 * any row another writer chained onto them. So every write here runs on one
 * runtime-role connection inside one transaction, the writer's own BEGIN/COMMIT
 * mapped onto savepoints, and the transaction is rolled back at the end. The
 * advisory chain lock the writer takes is held to that rollback, so the probe
 * rows are contiguous and no other writer links to them.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { databaseUrl } from '../setup.db';
import {
  TamperProofAuditLog,
  verifyTamperProofLogRows,
  type TamperProofLogRow,
} from '../../server/lib/tamper-proof-audit';
import { runWithTenantScope } from '../../server/db/tenantStore';

const MIGRATION = path.join(__dirname, '../../db/migrations/20260813_audit_tamper_proof_log.sql');
const SECRET = 'dbtest-dp28-tamper-proof-secret';
const MARK = `dp28-dbtest-${randomUUID()}`;
// Organisation ids no fixture uses. The column has no FK by design (an audit
// row must outlive what it names), so no organisation rows are needed.
const ORG_A = 990_281;
const ORG_B = 990_282;

let owner: Pool;
let app: Pool;
let conn: PoolClient;
let store: TamperProofAuditLog;

/** The writer's pool, on one connection, its transactions turned into savepoints. */
function savepointPool(client: PoolClient) {
  let depth = 0;
  const query = (sql: string, params?: unknown[]) => {
    const verb = sql.trim().toUpperCase();
    if (verb === 'BEGIN') return client.query(`SAVEPOINT dp28_${++depth}`);
    if (verb === 'COMMIT') return client.query(`RELEASE SAVEPOINT dp28_${depth--}`);
    if (verb === 'ROLLBACK') return client.query(`ROLLBACK TO SAVEPOINT dp28_${depth--}`);
    return client.query(sql, params as any[]);
  };
  return { query, connect: async () => ({ query, release: () => {} }) };
}

const inTenant = <T>(org: number, fn: () => T) =>
  runWithTenantScope({ tenantId: String(org), source: 'test', caller: 'dp28-dbtest' }, fn);

async function probeRows(): Promise<TamperProofLogRow[]> {
  const { rows } = await conn.query(
    `SELECT * FROM audit.tamper_proof_log WHERE action LIKE $1 ORDER BY sequence_number ASC`,
    [`${MARK}%`],
  );
  return rows;
}

beforeAll(async () => {
  process.env.AUDIT_HMAC_SECRET = SECRET;
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  // The real file, as deploy-migrate applies it — not a restatement of its DDL.
  await owner.query(fs.readFileSync(MIGRATION, 'utf8'));

  const appUrl = process.env.APP_DATABASE_URL;
  if (!appUrl) throw new Error('APP_DATABASE_URL is required: the runtime role is what writes this store');
  app = new Pool({ connectionString: appUrl, max: 1 });
  conn = await app.connect();
  await conn.query('BEGIN');
  store = new TamperProofAuditLog(savepointPool(conn) as any);
}, 60_000);

afterAll(async () => {
  if (conn) {
    await conn.query('ROLLBACK').catch(() => {});
    conn.release();
  }
  await app?.end();
  await owner?.end();
});

describe('the column', () => {
  it('exists after the migration: INTEGER, nullable, its cut-over recorded', async () => {
    const { rows } = await owner.query(
      `SELECT data_type, is_nullable,
              col_description('audit.tamper_proof_log'::regclass, ordinal_position::int) AS note
         FROM information_schema.columns
        WHERE table_schema = 'audit' AND table_name = 'tamper_proof_log'
          AND column_name = 'organization_id'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ data_type: 'integer', is_nullable: 'YES' });
    expect(rows[0].note).toMatch(/Cut-over after sequence \d+/);
  });

  it('re-applying the migration changes nothing (the set re-runs it every deploy)', async () => {
    const before = await owner.query(
      `SELECT col_description('audit.tamper_proof_log'::regclass, attnum) AS note
         FROM pg_attribute WHERE attrelid = 'audit.tamper_proof_log'::regclass AND attname = 'organization_id'`,
    );
    await owner.query(fs.readFileSync(MIGRATION, 'utf8'));
    const after = await owner.query(
      `SELECT col_description('audit.tamper_proof_log'::regclass, attnum) AS note
         FROM pg_attribute WHERE attrelid = 'audit.tamper_proof_log'::regclass AND attname = 'organization_id'`,
    );
    expect(after.rows[0].note).toBe(before.rows[0].note);
  });
});

describe('writes and reads as the runtime role', () => {
  it('a row written in tenant A’s session carries A', async () => {
    await inTenant(ORG_A, () => store.log('RECORD_CREATED', `${MARK}-a1`, { n: 1 }));
    const [row] = await probeRows();
    expect(row.organization_id).toBe(ORG_A);
  });

  it('refuses a row attributed to B from inside A’s session, and writes nothing', async () => {
    const before = (await probeRows()).length;
    await expect(
      inTenant(ORG_A, () => store.log('RECORD_CREATED', `${MARK}-forged`, {}, { organizationId: ORG_B })),
    ).rejects.toThrow(/tenant/i);
    expect(await probeRows()).toHaveLength(before);
  });

  it('a tenant’s read returns its own rows only; platform tooling reads all', async () => {
    await inTenant(ORG_B, () => store.log('RECORD_UPDATED', `${MARK}-b1`, { n: 2 }));
    await store.log('SYSTEM_STARTUP', `${MARK}-platform`, {});

    const mine = (rows: Array<{ action: string }>) => rows.map(r => r.action).filter(a => a.startsWith(MARK)).sort();
    const asA = await inTenant(ORG_A, () => store.search({ limit: 1000 }));
    const asB = await inTenant(ORG_B, () => store.search({ limit: 1000 }));
    const platform = await store.search({ limit: 1000 });

    expect(mine(asA)).toEqual([`${MARK}-a1`]);
    expect(mine(asB)).toEqual([`${MARK}-b1`]);
    expect(asA.every(r => r.organizationId === ORG_A)).toBe(true);
    expect(mine(platform)).toEqual([`${MARK}-a1`, `${MARK}-b1`, `${MARK}-platform`]);
    await expect(inTenant(ORG_A, () => store.search({ organizationId: ORG_B }))).rejects.toThrow(/tenant/i);
  });

  it('the stored rows verify as one chain, and moving a row to another tenant breaks its hash', async () => {
    const rows = await probeRows();
    expect(rows.map(r => r.organization_id)).toEqual([ORG_A, ORG_B, null]);
    const walk = (rs: TamperProofLogRow[]) =>
      verifyTamperProofLogRows(rs, { hmacSecret: SECRET, expectedPreviousHash: rs[0].previous_hash });
    expect(walk(rows)).toMatchObject({ valid: true, entriesVerified: 3, signedEntries: 3 });

    const moved = rows.map(r => ({ ...r }));
    moved[0].organization_id = ORG_B;
    expect(walk(moved)).toMatchObject({ valid: false });
    expect(walk(moved).invalidReason).toMatch(/content_hash mismatch/);
  });
});
