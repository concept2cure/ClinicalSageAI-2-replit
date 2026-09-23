/**
 * chain-order.pglite.test.ts — the chain order key END-TO-END, in-process.
 *
 * Applies migrations/20260921_audit_logs_chain_seq.sql to the shared
 * audit_logs fixture (twice: it replays on every deploy, CLAUDE.md Rule 1) and
 * drives the real writer, the real trigger and the real verifier through
 * PGlite transactions. Concurrency and row level security need a real server
 * and live in chain-concurrency.dbtest.ts.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import {
  computeAuditChainSealed,
  deriveChainHash,
  hashPayload,
  verifyAuditChain,
  verifyAuditChainSeals,
  AUDIT_CHAIN_TENANT_GUC,
  type ChainRow,
  type PoolClient,
} from '../chain';

const MIGRATION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../migrations/20260921_audit_logs_chain_seq.sql',
);
const migrationSql = fs.readFileSync(MIGRATION, 'utf8');

let pglite: PGlite;

/**
 * A strictly increasing instant for each row a test does not stamp itself.
 * The legacy walk and the seal index order rows by (occurred_at, id), to the
 * millisecond. Two rows written in the same millisecond were ordered by their
 * random ids, so a pair written a-then-b was read b-then-a half the time, and
 * four of these cases failed on the tie: "diagnoses the pre-fix fork" did so on
 * CI on 2026-09-23 (run 35885373726).
 */
let lastInstant = 0;
function nextInstant(): string {
  lastInstant = Math.max(lastInstant + 1, Date.now());
  return new Date(lastInstant).toISOString();
}

function row(tenantId: number, action: string, occurredAt?: string): ChainRow {
  return {
    action,
    actor_id: 1,
    target: `case:${tenantId}`,
    payload_hash: hashPayload({ action, tenantId }),
    occurred_at: occurredAt ?? nextInstant(),
    tenant_id: tenantId,
  };
}

const INSERT = `INSERT INTO audit_logs
   (id, tenant_id, user_id, action, table_name, record_id,
    actor_id, target, payload_hash, sha256_chain, occurred_at, hmac_seal)
 VALUES ($1,$2,1,$3,'case',$4,1,$5,$6,$7,$8,$9)`;

/** The real writer, in a transaction, like every governed route. */
async function writeInTx(tenantId: number, action: string, occurredAt?: string, insertTenant = tenantId): Promise<string> {
  const r = row(tenantId, action, occurredAt);
  const id = randomUUID();
  await pglite.transaction(async (tx) => {
    const { sha256Chain, hmacSeal } = await computeAuditChainSealed(tx as unknown as PoolClient, r);
    await tx.query(INSERT, [id, insertTenant, action, String(insertTenant), r.target, r.payload_hash, sha256Chain, r.occurred_at, hmacSeal]);
  });
  return id;
}

/** A pre-fix writer: chains onto the tenant head by occurred_at, announces nothing. */
async function writeLegacy(tenantId: number, action: string, previous?: string): Promise<string> {
  const r = row(tenantId, action);
  const head = previous ?? ((await pglite.query<{ sha256_chain: string }>(
    `SELECT sha256_chain FROM audit_logs WHERE sha256_chain IS NOT NULL AND tenant_id = $1
      ORDER BY occurred_at DESC, id DESC LIMIT 1`, [tenantId],
  )).rows[0]?.sha256_chain ?? '0'.repeat(64));
  const id = randomUUID();
  await pglite.query(INSERT, [id, tenantId, action, String(tenantId), r.target, r.payload_hash, deriveChainHash(r, head), r.occurred_at, null]);
  return id;
}

async function chainSeqOf(id: string): Promise<number | null> {
  const res = await pglite.query<{ chain_seq: string | null }>('SELECT chain_seq FROM audit_logs WHERE id = $1', [id]);
  return res.rows[0]?.chain_seq == null ? null : Number(res.rows[0].chain_seq);
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(AUDIT_LOGS_PGLITE_DDL);
  await pglite.exec(migrationSql);
  await pglite.exec(migrationSql); // idempotent replay
});
afterAll(async () => {
  await pglite.close();
});
beforeEach(async () => {
  delete process.env.AUDIT_HMAC_KEY;
  await pglite.exec('DELETE FROM audit_logs;');
});

describe('migrations/20260921_audit_logs_chain_seq.sql on the shared fixture', () => {
  it('adds chain_seq, the position trigger and the sequence, and replays without error', async () => {
    const col = await pglite.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'chain_seq'`);
    expect(col.rows).toHaveLength(1);
    const trg = await pglite.query(`SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_logs_chain_position'`);
    expect(trg.rows).toHaveLength(1);
    const seq = await pglite.query(`SELECT to_regclass('public.audit_logs_chain_seq_seq') AS r`);
    expect(seq.rows[0]).toEqual({ r: 'audit_logs_chain_seq_seq' });
    // No column default: old-recipe rows must not be numbered.
    const def = await pglite.query<{ column_default: string | null }>(`SELECT column_default FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'chain_seq'`);
    expect(def.rows[0].column_default).toBeNull();
  });

  it('names the same announcement GUC the writer uses (one recipe)', () => {
    expect(migrationSql).toContain(`current_setting('${AUDIT_CHAIN_TENANT_GUC}', true)`);
    expect(migrationSql).toContain(`set_config('${AUDIT_CHAIN_TENANT_GUC}', '', true)`);
    // Additive only: no DROP outside the commentary (ci:migration-drop-safety).
    const statements = migrationSql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
    expect(statements).not.toMatch(/\bDROP\b/i);
  });
});

describe('writer + trigger + verifier', () => {
  it('assigns increasing chain_seq per tenant and the verifier walks it', async () => {
    const a = await writeInTx(7, 'a');
    const b = await writeInTx(8, 'b');
    const c = await writeInTx(7, 'c');
    expect(await chainSeqOf(a)).toBeLessThan((await chainSeqOf(c))!);
    expect(await chainSeqOf(b)).not.toBeNull();
    const verdict = await verifyAuditChain(pglite as unknown as PoolClient);
    expect(verdict).toMatchObject({ ok: true, rowsChecked: 3, tenants: 2, legacyRows: 0, sequencedRows: 3 });
    expect(await verifyAuditChain(pglite as unknown as PoolClient, { tenantId: 7 })).toMatchObject({ ok: true, rowsChecked: 2, tenants: 1 });
  });

  it('verifies by commit order even when occurred_at runs backwards', async () => {
    const now = Date.now();
    await writeInTx(7, 'first', new Date(now).toISOString());
    await writeInTx(7, 'second-but-stamped-earlier', new Date(now - 5_000).toISOString());
    expect(await verifyAuditChain(pglite as unknown as PoolClient)).toMatchObject({ ok: true, rowsChecked: 2 });
  });

  it('refuses a row whose tenant_id differs from the position the writer took (fail closed)', async () => {
    await expect(writeInTx(7, 'wrong-tenant', undefined, 8)).rejects.toThrow(/chain position was taken for tenant 7 but the row belongs to tenant 8/);
    const count = await pglite.query<{ n: number }>('SELECT count(*)::int AS n FROM audit_logs');
    expect(count.rows[0].n).toBe(0);
  });

  it('records a chained row written without a position as legacy and still verifies it', async () => {
    await writeInTx(7, 'sequenced');
    const legacy = await writeLegacy(7, 'pre-fix-writer'); // chains onto the tenant head, announces nothing
    expect(await chainSeqOf(legacy)).toBeNull();
    const verdict = await verifyAuditChain(pglite as unknown as PoolClient);
    expect(verdict).toMatchObject({ ok: true, rowsChecked: 2, legacyRows: 1, sequencedRows: 1 });
  });

  it('records a row written outside a transaction as legacy (the lock and announcement end with their statement)', async () => {
    const r = row(7, 'autocommit');
    const { sha256Chain } = await computeAuditChainSealed(pglite as unknown as PoolClient, r);
    const id = randomUUID();
    await pglite.query(INSERT, [id, 7, r.action, '7', r.target, r.payload_hash, sha256Chain, r.occurred_at, null]);
    expect(await chainSeqOf(id)).toBeNull();
  });

  it("anchors a tenant's first sequenced row to its legacy head", async () => {
    await writeLegacy(7, 'legacy-1');
    const l2 = await writeLegacy(7, 'legacy-2');
    const s1 = await writeInTx(7, 'sequenced-1');
    expect(await chainSeqOf(l2)).toBeNull();
    expect(await chainSeqOf(s1)).not.toBeNull();
    expect(await verifyAuditChain(pglite as unknown as PoolClient)).toMatchObject({ ok: true, rowsChecked: 3, legacyRows: 2, sequencedRows: 1 });
  });

  it('detects a tampered sequenced row and names the segment', async () => {
    await writeInTx(7, 'a');
    const b = await writeInTx(7, 'b');
    await writeInTx(7, 'c');
    await pglite.query(`UPDATE audit_logs SET target = 'tampered' WHERE id = $1`, [b]); // the fixture has no immutability trigger
    const verdict = await verifyAuditChain(pglite as unknown as PoolClient);
    expect(verdict).toMatchObject({ ok: false, rowsChecked: 2, brokenAt: { id: b, segment: 'sequenced', tenantId: 7, commitsTo: null } });
  });

  it('diagnoses the pre-fix fork: a legacy row committing to genesis instead of its predecessor', async () => {
    await writeLegacy(7, 'first');
    const forked = await writeLegacy(7, 'forked', '0'.repeat(64));
    const verdict = await verifyAuditChain(pglite as unknown as PoolClient);
    expect(verdict).toMatchObject({ ok: false, brokenAt: { id: forked, segment: 'legacy', commitsTo: 'genesis' } });
  });

  it('seals through the same walk: valid when intact, failing closed after a break', async () => {
    process.env.AUDIT_HMAC_KEY = 'test-audit-hmac-key';
    await writeInTx(7, 'a');
    const b = await writeInTx(7, 'b');
    await writeInTx(7, 'c');
    expect(await verifyAuditChainSeals(pglite as unknown as PoolClient)).toEqual({ valid: true, brokenAt: null });
    await pglite.query(`UPDATE audit_logs SET payload_hash = 'tampered' WHERE id = $1`, [b]);
    expect(await verifyAuditChainSeals(pglite as unknown as PoolClient)).toEqual({ valid: false, brokenAt: 1 });
  });
});
