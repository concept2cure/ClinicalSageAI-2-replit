/**
 * chain-anchor.dbtest.ts — the audit_logs chain head, anchored OUTSIDE the
 * database (security plan P0-8, audit finding DP-04), against a REAL
 * PostgreSQL 16.
 *
 * The chain walk (walkAuditChain) proves every row derives from the row before
 * it. It cannot see the newest rows being removed: what is left is still a
 * valid chain, ending one or more rows early. Case 1 shows that, and is the
 * reason the anchor exists. Every other case drives the real writer
 * (computeAuditChainSealed), the real anchor writer and the real anchor
 * verifier (chain-anchor.ts) against a production-shaped audit_logs with the
 * deploy's own triggers (db/migrations/20260617_audit_logs_immutability.sql,
 * migrations/20260921_audit_logs_chain_seq.sql), in a throw-away database.
 *
 * Tampering is done the way an attacker past the triggers would: the owner in
 * a transaction with `session_replication_role = replica`, which a restore
 * without triggers, a logical-replica apply or a DISABLE TRIGGER also gives.
 * A plain DELETE is shown refused first. Cases 9-12 (fix round, finding DP-68)
 * add the archive ledger to the attack: a row INSERTed into
 * public.audit_log_archives by a role holding only SELECT and INSERT on it,
 * which is what the runtime role holds. The role is created for this suite
 * and dropped after it.
 *
 * Run:  TEST_DATABASE_URL=… npx vitest run --config vitest.db.config.ts \
 *         server/services/audit/__tests__/chain-anchor.dbtest.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { databaseUrl } from '../../../../tests/setup.db';
import { computeAuditChainSealed, deriveChainHash, hashPayload, verifyAuditChain, type ChainRow } from '../chain';

// Loaded per test, not imported: case 1 (the defect) runs whether or not the
// anchor exists, so the red run shows the walk passing a truncated chain.
type AnchorModule = typeof import('../chain-anchor');
const loadAnchor = (): Promise<AnchorModule> => import('../chain-anchor');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const MIGRATIONS = [
  'db/migrations/20260617_audit_logs_immutability.sql',
  'migrations/20260921_audit_logs_chain_seq.sql',
].map((p) => path.join(ROOT, p));

/** public.audit_logs as the deployed database has it (uuid ids, NOT NULL tenant). */
const AUDIT_LOGS_DDL = `
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id integer NOT NULL, user_id integer,
  action text NOT NULL, table_name text NOT NULL, record_id text NOT NULL,
  old_values json, new_values json, ip_address text, user_agent text,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  actor_id integer, target text, target_type text, target_id text, reason text, payload_hash text,
  ana_action_id text, sha256_chain text, occurred_at timestamptz NOT NULL DEFAULT now(), hmac_seal text
);`;

let admin: Pool;
let pool: Pool;
let dbName: string;
/** Holds SELECT and INSERT on the archive ledger and nothing else: the runtime role's grant there. */
const forger = `p08_ledger_forger_${randomBytes(4).toString('hex')}`;

/** The anchor store's contract, in memory: put refuses a key that exists (If-None-Match: *); latest is the newest key. */
function memoryStore() {
  const objects = new Map<string, string>();
  return {
    objects,
    store: {
      location: 'memory://anchors/audit-chain/',
      async put(key: string, body: string) {
        if (objects.has(key)) throw new Error(`object ${key} exists`);
        objects.set(key, body);
      },
      async latest() {
        const key = [...objects.keys()].sort().at(-1);
        return key ? { key, body: objects.get(key) as string } : null;
      },
    },
  };
}

/** One governed write: its own transaction, through the canonical chain writer. */
async function writeRow(tenantId: number, action: string, createdAt?: string, occurred?: string): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const occurredAt = occurred ?? new Date().toISOString();
    const row: ChainRow = {
      action, actor_id: 1, target: `case:${tenantId}`,
      payload_hash: hashPayload({ action, tenantId }), occurred_at: occurredAt, tenant_id: tenantId,
    };
    const { sha256Chain } = await computeAuditChainSealed(client, row);
    const { rows } = await client.query(
      `INSERT INTO audit_logs
         (tenant_id, user_id, action, table_name, record_id, actor_id, target, payload_hash,
          sha256_chain, occurred_at, created_at)
       VALUES ($1, 1, $2, 'case', $3, 1, $4, $5, $6, $7, COALESCE($8::timestamp, now()))
       RETURNING id::text AS id`,
      [tenantId, action, String(tenantId), row.target, row.payload_hash, sha256Chain, occurredAt, createdAt ?? null],
    );
    await client.query('COMMIT');
    return rows[0].id as string;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function writeChain(tenantId: number, n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push(await writeRow(tenantId, `act.${tenantId}.${i}`));
  return ids;
}

/** The owner with the triggers out of the way, as a restore or replica apply would leave them. */
async function tamper(sql: string, params: unknown[] = []): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL session_replication_role = 'replica'");
    const r = await client.query(sql, params);
    await client.query('COMMIT');
    return r.rowCount ?? 0;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * One row INSERTed straight into the archive ledger, as `forger`: no door call,
 * no row removed. `archivedAt` and `cutoff` are SQL expressions (fixed by the
 * test, never input); the span is the oldest the CHECK admits.
 */
async function forgeLedgerRow(archivedAt: string, cutoff: string, rowCount = 1_000_000): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE "${forger}"`);
    await client.query(
      `INSERT INTO public.audit_log_archives (archived_at, row_count, min_created_at, max_created_at, cutoff, locator, sha256)
       VALUES (${archivedAt}, $1, '2000-01-01', '2000-01-02', ${cutoff}, 's3://forged/x', repeat('f', 64))`,
      [rowCount],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function withClient<T>(fn: (c: import('pg').PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  admin = new Pool({ connectionString: databaseUrl, max: 2 });
  dbName = `p08_anchor_${randomBytes(4).toString('hex')}`;
  await admin.query(`CREATE DATABASE "${dbName}"`);
  const url = new URL(databaseUrl);
  url.pathname = `/${dbName}`;
  pool = new Pool({ connectionString: url.toString(), max: 6 });
  await pool.query(AUDIT_LOGS_DDL);
  for (const file of MIGRATIONS) await pool.query(fs.readFileSync(file, 'utf8'));
  await admin.query(`CREATE ROLE "${forger}" NOLOGIN`);
  await pool.query(`GRANT USAGE ON SCHEMA public TO "${forger}"`);
  await pool.query(`GRANT SELECT, INSERT ON public.audit_log_archives TO "${forger}"`);
});

afterAll(async () => {
  await pool?.end();
  if (admin && dbName) {
    for (let i = 0; i < 100; i++) {
      const { rows } = await admin.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1', [dbName]);
      if (rows[0].n === 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  await admin?.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  // The role's grants lived in the dropped database, so nothing depends on it now.
  await admin?.query(`DROP ROLE IF EXISTS "${forger}"`);
  await admin?.end();
});

beforeEach(async () => {
  delete process.env.AUDIT_HMAC_KEY;
  // tenant-isolation-safe: throw-away test database created by this suite; every tenant here is a fixture
  await tamper('DELETE FROM audit_logs');
  // The ledger is append-only by trigger; replica mode clears it between cases.
  await tamper('DELETE FROM public.audit_log_archives');
});

describe('the audit_logs chain head is anchored outside the database (P0-8, DP-04)', () => {
  it('1. the chain walk alone passes a chain whose newest rows were removed (the defect)', async () => {
    const ids = await writeChain(7, 4);
    expect(await tamper('DELETE FROM audit_logs WHERE id = ANY($1::uuid[])', [ids.slice(2)])).toBe(2);
    const verdict = await withClient((c) => verifyAuditChain(c, { tenantId: 7 }));
    expect(verdict).toMatchObject({ ok: true, rowsChecked: 2 });
  });

  it('2. an intact chain verifies against its anchor, and rows appended after it are fine', async () => {
    const { writeAuditChainAnchor, verifyAuditChainAnchor, AUDIT_ANCHOR_FORMAT } = await loadAnchor();
    const { store, objects } = memoryStore();
    const seven = await writeChain(7, 3);
    await writeChain(8, 2);

    const written = await withClient((c) => writeAuditChainAnchor(c, store, new Date('2026-10-01T02:00:00.000Z')));
    expect(written.organizations).toBe(2);
    expect(written.key).toMatch(/^anchors\/audit-chain\/2026\/10\/01\/2026-10-01T02-00-00-000Z-[0-9a-f]{8}\.json$/);
    const anchor = JSON.parse(objects.get(written.key) as string);
    const head7 = await pool.query('SELECT chain_seq::text AS seq, sha256_chain FROM audit_logs WHERE id = $1', [seven[2]]);
    expect(anchor).toMatchObject({ format: AUDIT_ANCHOR_FORMAT, store: 'public.audit_logs', anchoredAt: '2026-10-01T02:00:00.000Z' });
    expect(anchor.heads.find((h: { organizationId: number }) => h.organizationId === 7)).toMatchObject({
      rowId: seven[2], chainSeq: head7.rows[0].seq, sha256Chain: head7.rows[0].sha256_chain, rowCount: 3,
    });

    await writeChain(7, 2);
    const verdict = await withClient((c) => verifyAuditChainAnchor(c, store));
    expect(verdict).toMatchObject({ status: 'ok', anchorKey: written.key, organizations: 2, breaks: [], archived: [] });
  });

  it('3. removing the anchored head (truncation after an anchor) is reported broken', async () => {
    const { writeAuditChainAnchor, verifyAuditChainAnchor } = await loadAnchor();
    const { store } = memoryStore();
    const seven = await writeChain(7, 4);
    await writeChain(8, 2);
    await withClient((c) => writeAuditChainAnchor(c, store));

    // The trigger refuses the runtime path; the anchor is for when it is out of the way.
    await expect(pool.query('DELETE FROM audit_logs WHERE id = $1', [seven[3]])).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    expect(await tamper('DELETE FROM audit_logs WHERE id = ANY($1::uuid[])', [seven.slice(2)])).toBe(2);

    expect(await withClient((c) => verifyAuditChain(c, { tenantId: 7 }))).toMatchObject({ ok: true });
    const verdict = await withClient((c) => verifyAuditChainAnchor(c, store));
    expect(verdict.status).toBe('broken');
    expect(verdict.breaks).toEqual([
      { organizationId: 7, rowId: seven[3], kind: 'head_missing', anchoredRows: 4, currentRows: 2 },
    ]);
  });

  it('4. a head rewritten and re-chained, so the walk still passes, is reported broken', async () => {
    const { writeAuditChainAnchor, verifyAuditChainAnchor } = await loadAnchor();
    const { store } = memoryStore();
    const seven = await writeChain(7, 3);
    await withClient((c) => writeAuditChainAnchor(c, store));

    const { rows } = await pool.query(
      `SELECT action, actor_id, target, payload_hash, occurred_at, tenant_id,
              (SELECT sha256_chain FROM audit_logs WHERE id = $2) AS previous
         FROM audit_logs WHERE id = $1`,
      [seven[2], seven[1]],
    );
    const forged: ChainRow = { ...rows[0], action: 'act.7.forged' };
    const reChained = deriveChainHash(forged, rows[0].previous);
    expect(await tamper('UPDATE audit_logs SET action = $2, sha256_chain = $3 WHERE id = $1', [seven[2], forged.action, reChained])).toBe(1);

    expect(await withClient((c) => verifyAuditChain(c, { tenantId: 7 }))).toMatchObject({ ok: true, rowsChecked: 3 });
    const verdict = await withClient((c) => verifyAuditChainAnchor(c, store));
    expect(verdict.status).toBe('broken');
    expect(verdict.breaks).toEqual([
      { organizationId: 7, rowId: seven[2], kind: 'head_differs', anchoredRows: 3, currentRows: 3 },
    ]);
  });

  it('5. a row removed before an intact head is reported by the anchored row count', async () => {
    const { writeAuditChainAnchor, verifyAuditChainAnchor } = await loadAnchor();
    const { store } = memoryStore();
    const seven = await writeChain(7, 4);
    await withClient((c) => writeAuditChainAnchor(c, store));
    expect(await tamper('DELETE FROM audit_logs WHERE id = $1', [seven[1]])).toBe(1);

    const verdict = await withClient((c) => verifyAuditChainAnchor(c, store));
    expect(verdict.status).toBe('broken');
    expect(verdict.breaks).toEqual([
      { organizationId: 7, rowId: seven[3], kind: 'rows_missing', anchoredRows: 4, currentRows: 3 },
    ]);
  });

});

describe('the anchor never claims more than it can show (P0-8, DP-04)', () => {
  it('6. with no anchor written the chain head is not verified, never ok', async () => {
    const { verifyAuditChainAnchor } = await loadAnchor();
    const { store } = memoryStore();
    await writeChain(7, 2);
    const verdict = await withClient((c) => verifyAuditChainAnchor(c, store));
    expect(verdict).toMatchObject({ status: 'not_anchored', anchorKey: null, breaks: [] });
    expect(verdict.reason).toMatch(/no anchor has been written/);
  });

  it('7. rows the archive door removed since the anchor are unverifiable, not tampering; truncation still breaks', async () => {
    const { writeAuditChainAnchor, verifyAuditChainAnchor } = await loadAnchor();
    const { store } = memoryStore();
    const old = [];
    for (let i = 0; i < 3; i++) old.push(await writeRow(9, `old.${i}`, "2023-01-01T00:00:00"));
    const recent = await writeChain(9, 2);
    await withClient((c) => writeAuditChainAnchor(c, store));

    const archived = await pool.query(
      `SELECT audit_logs_archive_delete($1::uuid[], 's3://cold/p08-anchor.json', repeat('a', 64),
                                        now() - interval '24 months 1 day') AS n`,
      [old.slice(0, 2)],
    );
    expect(Number(archived.rows[0].n)).toBe(2);
    const afterArchive = await withClient((c) => verifyAuditChainAnchor(c, store));
    expect(afterArchive.status).toBe('unverifiable');
    expect(afterArchive.breaks).toEqual([]);
    expect(afterArchive.archived).toEqual([
      { organizationId: 9, rowId: recent[1], kind: 'rows_missing', anchoredRows: 5, currentRows: 3 },
    ]);

    expect(await tamper('DELETE FROM audit_logs WHERE id = $1', [recent[1]])).toBe(1);
    const afterTruncation = await withClient((c) => verifyAuditChainAnchor(c, store));
    expect(afterTruncation.status).toBe('broken');
    expect(afterTruncation.breaks).toEqual([
      { organizationId: 9, rowId: recent[1], kind: 'head_missing', anchoredRows: 5, currentRows: 2 },
    ]);
  });

  it('8. a tenant-scoped connection refuses to anchor or verify a subset of the chain', async () => {
    const { writeAuditChainAnchor, verifyAuditChainAnchor } = await loadAnchor();
    const { store, objects } = memoryStore();
    await writeChain(7, 1);
    await withClient(async (c) => {
      await c.query('BEGIN');
      await c.query("SELECT set_config('app.rls_enforce', 'on', true), set_config('app.current_tenant_id', '7', true)");
      await expect(writeAuditChainAnchor(c, store)).rejects.toThrow(/scoped to one tenant/);
      await expect(verifyAuditChainAnchor(c, store)).rejects.toThrow(/scoped to one tenant/);
      await c.query('ROLLBACK');
    });
    expect(objects.size).toBe(0);
  });
});

describe('the archive ledger excuses only what the archive door could have removed (DP-68)', () => {
  // Ledger rows the door could never have written. The door refuses a cutoff
  // later than now() - 24 months, and stamps archived_at = now().
  const IMPOSSIBLE_LEDGER_ROWS = [
    ['a cutoff in the hot window (the reported forgery: cutoff 2100-01-01)', 'now()', "timestamptz '2100-01-01'"],
    ['an archived_at in the future, its cutoff 24 months before it', "now() + interval '30 months'", "now() + interval '6 months'"],
  ] as const;

  it.each(IMPOSSIBLE_LEDGER_ROWS)(
    '9. a forged ledger row with %s cannot turn a truncated head into "archived"',
    async (_label, archivedAt, cutoff) => {
      const { writeAuditChainAnchor, verifyAuditChainAnchor } = await loadAnchor();
      const { store } = memoryStore();
      const seven = await writeChain(7, 4);
      await withClient((c) => writeAuditChainAnchor(c, store));
      expect(await tamper('DELETE FROM audit_logs WHERE id = ANY($1::uuid[])', [seven.slice(2)])).toBe(2);
      const truncated = { organizationId: 7, rowId: seven[3], kind: 'head_missing', anchoredRows: 4, currentRows: 2 };
      expect(await withClient((c) => verifyAuditChainAnchor(c, store))).toMatchObject({ status: 'broken', breaks: [truncated] });

      await forgeLedgerRow(archivedAt, cutoff);
      const verdict = await withClient((c) => verifyAuditChainAnchor(c, store));
      expect(verdict).toMatchObject({ status: 'broken', breaks: [truncated], archived: [] });
    },
  );

  it.each(IMPOSSIBLE_LEDGER_ROWS)(
    '10. a forged ledger row with %s cannot excuse rows removed before an intact head',
    async (_label, archivedAt, cutoff) => {
      const { writeAuditChainAnchor, verifyAuditChainAnchor } = await loadAnchor();
      const { store } = memoryStore();
      const seven = await writeChain(7, 4);
      await withClient((c) => writeAuditChainAnchor(c, store));
      expect(await tamper('DELETE FROM audit_logs WHERE id = $1', [seven[1]])).toBe(1);

      await forgeLedgerRow(archivedAt, cutoff);
      const verdict = await withClient((c) => verifyAuditChainAnchor(c, store));
      expect(verdict).toMatchObject({
        status: 'broken',
        breaks: [{ organizationId: 7, rowId: seven[3], kind: 'rows_missing', anchoredRows: 4, currentRows: 3 }],
        archived: [],
      });
    },
  );

  it('11. a ledger row that keeps the door\'s own rules still never excuses a head inside the 24-month window', async () => {
    const { writeAuditChainAnchor, verifyAuditChainAnchor } = await loadAnchor();
    const { store } = memoryStore();
    const seven = await writeChain(7, 4);
    await withClient((c) => writeAuditChainAnchor(c, store));
    expect(await tamper('DELETE FROM audit_logs WHERE id = ANY($1::uuid[])', [seven.slice(2)])).toBe(2);

    await forgeLedgerRow('now()', "now() - interval '24 months 1 day'");
    const headGone = await withClient((c) => verifyAuditChainAnchor(c, store));
    expect(headGone).toMatchObject({
      status: 'broken',
      breaks: [{ organizationId: 7, rowId: seven[3], kind: 'head_missing', anchoredRows: 4, currentRows: 2 }],
      archived: [],
    });
  });

  it('12. a head older than the 24-month floor, removed through the door, is archived: not tampering, not verified', async () => {
    const { writeAuditChainAnchor, verifyAuditChainAnchor } = await loadAnchor();
    const { store } = memoryStore();
    const dormant = [];
    for (let i = 0; i < 3; i++) dormant.push(await writeRow(11, `dormant.${i}`, '2023-01-01T00:00:00', '2023-01-01T00:00:00.000Z'));
    await withClient((c) => writeAuditChainAnchor(c, store));

    const archived = await pool.query(
      `SELECT audit_logs_archive_delete($1::uuid[], 's3://cold/p08-dormant.json', repeat('b', 64),
                                        now() - interval '24 months 1 day') AS n`,
      [dormant],
    );
    expect(Number(archived.rows[0].n)).toBe(3);
    // This scenario verifies after the archive. PostgreSQL keeps microseconds;
    // an immediately sampled JS clock can still precede its ledger timestamp.
    // Supply the fixture clock explicitly; production keeps its independent
    // clock and strict future-ledger refusal.
    const verification = await pool.query<{ verified_at: Date }>(
      `SELECT date_trunc('milliseconds', max(archived_at)) + interval '1 millisecond' AS verified_at
         FROM public.audit_log_archives`,
    );
    expect(verification.rows[0].verified_at).toBeInstanceOf(Date);
    const verdict = await withClient((c) => verifyAuditChainAnchor(c, store, verification.rows[0].verified_at));
    expect(verdict).toMatchObject({
      status: 'unverifiable',
      breaks: [],
      archived: [{ organizationId: 11, rowId: dormant[2], kind: 'head_missing', anchoredRows: 3, currentRows: 0 }],
    });
  });
});

describe('the on-demand verifiers consult the anchor, or say they did not (P0-8 follow-up, 2026-10-01)', () => {
  // The verifiers an operator or a page runs on demand (verify-chain,
  // seal-integrity, the licensing history, the tenant verdict and
  // ops:verify-audit-chain) walked the chain only, so each answered ok for the
  // chain of case 1. They now take the head's verdict from verifyChainHead,
  // which is verifyAuditChainAnchor against the latest anchor, scoped to one
  // organisation where the caller is. The routes are driven in
  // chain-head-on-demand.test.ts; the ops script runs here, on this database.
  const loadOps = () => import('../../../../scripts/ops/verify-audit-chain.mjs');

  it('13. a truncated chain: the head verdict is broken for that organisation only, and the ops script exits 1', async () => {
    const { writeAuditChainAnchor, verifyChainHead } = await loadAnchor();
    const { verifyAuditChains } = await loadOps();
    const { store } = memoryStore();
    const seven = await writeChain(7, 4);
    await writeChain(8, 2);
    await withClient((c) => writeAuditChainAnchor(c, store));
    expect(await tamper('DELETE FROM audit_logs WHERE id = ANY($1::uuid[])', [seven.slice(2)])).toBe(2);
    expect(await withClient((c) => verifyAuditChain(c))).toMatchObject({ ok: true });

    const missing = { organizationId: 7, rowId: seven[3], kind: 'head_missing', anchoredRows: 4, currentRows: 2 };
    expect(await withClient((c) => verifyChainHead(c, { store }))).toMatchObject({ verified: false, status: 'broken', breaks: [missing] });
    expect(await withClient((c) => verifyChainHead(c, { store, organizationId: 7 }))).toMatchObject({ status: 'broken', breaks: [missing] });
    expect(await withClient((c) => verifyChainHead(c, { store, organizationId: 8 }))).toMatchObject({ verified: true, status: 'verified', breaks: [] });

    const report = await withClient((c) => verifyAuditChains(c, {}, { anchorStore: store }));
    const logs = report.tables.find((t: { table: string }) => t.table === 'public.audit_logs');
    expect(logs).toMatchObject({ status: 'broken', head: { status: 'broken', breaks: [missing] } });
    expect(report).toMatchObject({ verdict: 'broken', exitCode: 1 });
  });

  it('14. no anchor store: the walk passes, and every verdict says the head was not verified against the anchor', async () => {
    const { verifyChainHead } = await loadAnchor();
    const { verifyAuditChains } = await loadOps();
    const seven = await writeChain(7, 4);
    expect(await tamper('DELETE FROM audit_logs WHERE id = ANY($1::uuid[])', [seven.slice(2)])).toBe(2);

    const head = await withClient((c) => verifyChainHead(c, { store: null }));
    expect(head).toMatchObject({ verified: false, status: 'not_configured' });
    expect(head.reason).toMatch(/^head not verified against the anchor/);

    const report = await withClient((c) => verifyAuditChains(c, {}, { anchorStore: null }));
    const logs = report.tables.find((t: { table: string }) => t.table === 'public.audit_logs');
    expect(logs).toMatchObject({ status: 'ok', chainedRows: 2, head: { verified: false, status: 'not_configured' } });
    expect(logs?.head?.reason).toMatch(/^head not verified against the anchor/);
  });
});
