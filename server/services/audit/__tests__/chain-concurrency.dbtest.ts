/**
 * chain-concurrency.dbtest.ts — reproduction of VSR-001 finding F-1 against a
 * REAL PostgreSQL server (row locks, advisory locks, row level security and
 * concurrent transactions are the subject, so PGlite's single connection
 * cannot exercise them).
 *
 * Each test builds the audit_logs fixture in a throw-away database created
 * from DATABASE_URL, applies migrations/20260921_audit_logs_chain_seq.sql to
 * it (proving the migration applies and re-applies on PostgreSQL 16), and
 * drives the real writer (computeAuditChainSealed) and the real verifier.
 *
 * Run:  set -a; source .env; set +a
 *       npx vitest run --config vitest.db.config.ts server/services/audit/__tests__/chain-concurrency.dbtest.ts
 *
 * Three ways the pre-fix recipe forked or mis-ordered the chain, each of which
 * this suite makes the verifier report before the fix and pass after it
 * (docs/evidence/WA/2026-09-21/F-1-repro-before.txt / F-1-repro-after.txt):
 *
 *   1. concurrent writers — the writer locked the head ROW with FOR UPDATE; a
 *      blocked writer re-read the same stale head after the first committed;
 *   2. commit order vs occurred_at — a row whose occurred_at was generated
 *      before it acquired the lock committed behind a row with a later one;
 *   3. RLS view — a tenant-scoped connection saw only its tenant's rows, so
 *      its head differed from an unscoped connection's head.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { databaseUrl } from '../../../../tests/setup.db';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { computeAuditChainSealed, hashPayload, verifyAuditChain, type ChainRow } from '../chain';

const MIGRATION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../migrations/20260921_audit_logs_chain_seq.sql',
);

/** The tenant_isolation_policy shape from migrations/0021 (FORCE applies it to the owner too). */
const RLS_FIXTURE = `
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON audit_logs
  USING (
    NULLIF(current_setting('app.rls_enforce', true), '') IS DISTINCT FROM 'on'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::integer
  )
  WITH CHECK (
    NULLIF(current_setting('app.rls_enforce', true), '') IS DISTINCT FROM 'on'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::integer
  );
`;

let admin: Pool;
let pool: Pool;
let dbName: string;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function writeRow(
  client: PoolClient,
  tenantId: number,
  action: string,
  occurredAt: string = new Date().toISOString(),
): Promise<string> {
  const row: ChainRow = {
    action,
    actor_id: 1,
    target: `case:${tenantId}`,
    payload_hash: hashPayload({ action, tenantId }),
    occurred_at: occurredAt,
    tenant_id: tenantId,
  };
  const { sha256Chain, hmacSeal } = await computeAuditChainSealed(client, row);
  const id = randomUUID();
  await client.query(
    `INSERT INTO audit_logs
       (id, tenant_id, user_id, action, table_name, record_id,
        actor_id, target, payload_hash, sha256_chain, occurred_at, hmac_seal)
     VALUES ($1,$2,1,$3,'case',$4,1,$5,$6,$7,$8,$9)`,
    [id, tenantId, action, String(tenantId), row.target, row.payload_hash, sha256Chain, occurredAt, hmacSeal],
  );
  return id;
}

/** One writer: its own connection, its own transaction, like every governed route. */
async function writeInTx(tenantId: number, action: string, occurredAt?: string, scopeTenant?: number): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (scopeTenant != null) {
      await client.query("SELECT set_config('app.rls_enforce', 'on', true)");
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [String(scopeTenant)]);
    }
    await sleep(Math.floor(Math.random() * 15));
    const id = await writeRow(client, tenantId, action, occurredAt);
    await client.query('COMMIT');
    return id;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  admin = new Pool({ connectionString: databaseUrl, max: 2 });
  dbName = `wa_audit_chain_${randomBytes(4).toString('hex')}`;
  await admin.query(`CREATE DATABASE "${dbName}"`);
  const url = new URL(databaseUrl);
  url.pathname = `/${dbName}`;
  pool = new Pool({ connectionString: url.toString(), max: 12 });
  await pool.query(AUDIT_LOGS_PGLITE_DDL);
  const migration = fs.readFileSync(MIGRATION, 'utf8');
  await pool.query(migration);
  await pool.query(migration); // replays on every deploy (CLAUDE.md Rule 1): must be idempotent
  await pool.query(RLS_FIXTURE);
});

afterAll(async () => {
  await pool?.end();
  // pg-pool's end() resolves once it has ASKED each client to close — it does
  // not await client.end() — so the backends can still be open here. A FORCE
  // drop then terminates them mid-close, and each one surfaces as an uncaught
  // 57P01 ("terminating connection due to administrator command") on a client
  // nothing listens to any more: five unhandled errors that failed the
  // real-database step with every test passing (CI run 12120, 2026-09-23).
  // Wait for the server to see them gone; FORCE stays as the backstop.
  if (admin && dbName) {
    for (let i = 0; i < 100; i++) {
      const { rows } = await admin.query(
        'SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1',
        [dbName],
      );
      if (rows[0].n === 0) break;
      await sleep(50);
    }
  }
  await admin?.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin?.end();
});

beforeEach(async () => {
  delete process.env.AUDIT_HMAC_KEY; // unsealed, like the local chain (IQ-DEV-002)
  // tenant-isolation-safe: throw-away test database created by this suite; every tenant here is a fixture
  await pool.query('DELETE FROM audit_logs');
});

describe('audit_logs chain under real PostgreSQL concurrency (F-1)', () => {
  it('1. eight concurrent writers of one tenant never fork the chain', async () => {
    await writeInTx(7, 'seed');
    await Promise.all(Array.from({ length: 8 }, (_, i) => writeInTx(7, `concurrent.${i}`)));
    const client = await pool.connect();
    try {
      const verdict = await verifyAuditChain(client);
      expect(verdict).toMatchObject({ ok: true, rowsChecked: 9 });
      // tenant-isolation-safe: throw-away test database; asserting the order key across the one fixture tenant
      const seqs = await client.query(
        'SELECT chain_seq FROM audit_logs WHERE sha256_chain IS NOT NULL ORDER BY chain_seq',
      );
      const values = seqs.rows.map((r) => r.chain_seq);
      expect(values.every((v) => v != null)).toBe(true);
      expect(new Set(values).size).toBe(9);
    } finally {
      client.release();
    }
  });

  it('2. chain order is commit order, not occurred_at order', async () => {
    const now = Date.now();
    await writeInTx(7, 'later-timestamp-first', new Date(now).toISOString());
    // Its occurred_at was generated before the first writer's, as happens when a
    // request stamps the time and then waits for the lock.
    await writeInTx(7, 'earlier-timestamp-second', new Date(now - 5_000).toISOString());
    const client = await pool.connect();
    try {
      expect(await verifyAuditChain(client)).toMatchObject({ ok: true, rowsChecked: 2 });
    } finally {
      client.release();
    }
  });

  it('3. tenant-scoped (RLS) and unscoped connections write one verifiable chain per tenant', async () => {
    await writeInTx(7, 'unscoped.t7');
    await writeInTx(8, 'unscoped.t8');
    await writeInTx(7, 'scoped.t7', undefined, 7);
    await writeInTx(8, 'scoped.t8', undefined, 8);
    await writeInTx(7, 'unscoped.t7.again');
    const client = await pool.connect();
    try {
      expect(await verifyAuditChain(client)).toMatchObject({ ok: true, rowsChecked: 5 });
    } finally {
      client.release();
    }
  });

  it('4. a connection whose search_path puts another schema first still takes the head in chain order', async () => {
    // current_schema() is the first schema on the search_path that exists; the
    // unqualified `audit_logs` every statement names resolves further down. The
    // writer asked current_schema() whether chain_seq existed, got "no", and took
    // the head by occurred_at. Seen in a full real-database run: tenant 0's row 45
    // (tests/db/master-licensing-console.dbtest.ts, which sets such a search_path
    // on its runtime role) chained to row 43, skipping 44, whose occurred_at was
    // the earlier of two racing password resets.
    // The search_path is set for the connection from its start, as a role-level
    // setting does, so the writer's first look at this connection sees it.
    await pool.query('CREATE SCHEMA IF NOT EXISTS chain_elsewhere');
    const now = Date.now();
    await writeInTx(7, 'later-timestamp-first', new Date(now).toISOString());
    await writeInTx(7, 'earlier-timestamp-second', new Date(now - 5_000).toISOString());
    const skewedUrl = new URL((pool as unknown as { options: { connectionString: string } }).options.connectionString);
    skewedUrl.searchParams.set('options', '-c search_path=chain_elsewhere,public');
    const skewed = new Pool({ connectionString: skewedUrl.toString(), max: 1 });
    try {
      const writer = await skewed.connect();
      try {
        await writer.query('BEGIN');
        await writeRow(writer, 7, 'written-under-another-search-path');
        await writer.query('COMMIT');
      } finally {
        writer.release();
      }
    } finally {
      await skewed.end();
    }
    const client = await pool.connect();
    try {
      const verdict = await verifyAuditChain(client);
      expect(verdict, JSON.stringify(verdict.brokenAt)).toMatchObject({ ok: true, rowsChecked: 3 });
    } finally {
      client.release();
    }
  });
});
