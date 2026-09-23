/**
 * The freeze/dispatch row lock and the leaf-write row lock, interleaved on two
 * REAL Postgres connections.
 *
 * 2026-09-23 (W5/D7, round-2 skeptic, second pass). freeze-gate-binding.pglite
 * proves the digest re-check and the under-lock status re-check, but PGlite is
 * one connection: its hooks run one after another, so the thing the fix rests
 * on — SELECT … FOR UPDATE on the ectd_sequences row making a leaf write and a
 * governed transition WAIT for each other under READ COMMITTED — was never
 * observed. Here each side holds its transaction open on its own connection at
 * exactly the point the other side must block, the test waits until Postgres
 * reports a backend waiting on a lock, then commits:
 *
 *  1. The freeze has taken the row lock and set 'frozen' (uncommitted). An
 *     upsertLeaf started now must wait, then see 'frozen' and refuse. Without
 *     the lock it read 'validated', wrote, and left a leaf in a frozen sequence.
 *  2. A leaf write holds the row lock with a draft leaf inserted (uncommitted).
 *     A freeze started now — signed and gate-assembled against the manifest
 *     WITHOUT that leaf — must wait at its lock, then see the moved digest and
 *     refuse. Without it the status-only compare-and-set froze the unjudged leaf.
 *
 * Needs TEST_DATABASE_URL (a Postgres the test may create and drop a schema
 * in); skipped otherwise, as the other real-Postgres suites are. Runs the REAL
 * upsertLeaf / freezeSequence / assembleSequence / deriveGovernedTargetBinding.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// tests/setup.ts replaces pg with a stub; this suite needs the real driver.
vi.unmock('pg');

const holder = vi.hoisted(() => ({ db: null as any, pool: null as any }));

vi.mock('../../../db', () => ({
  get db() { return holder.db; },
  get pool() { return holder.pool; },
}));
vi.mock('../../auditService', () => ({
  default: { logAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })) },
  writeChainedAuditRow: vi.fn(async (client: any, row: any) => {
    await client.query(
      `INSERT INTO audit_logs (tenant_id, table_name, record_id, action, new_values) VALUES ($1,$2,$3,$4,$5)`,
      [row.organizationId, row.resourceType, String(row.resourceId), row.action, JSON.stringify(row.details)],
    );
  }),
}));
vi.mock('../../ectd/assess-dispatch-readiness', () => ({
  assessSequenceDispatchReadiness: async () => ({
    gate: { cleared: true, blockers: [] }, freezeGate: { cleared: true, blockers: [] },
    validationErrors: 0, unacknowledgedShadowCriticals: 0,
  }),
}));

import { Pool, type PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { IND_PGLITE_DDL, SUBMISSION_CORE_PGLITE_DDL, LEAF_SOURCE_PGLITE_DDL } from '../../../db/pglite-harness';
import { deriveGovernedTargetBinding } from '../../part11/signature-persistence';
import { freezeSequence, upsertLeaf } from '../submission-service';

const databaseUrl = process.env.TEST_DATABASE_URL;
// The sentinel tests/setup.ts installs points at nothing.
const skip = !databaseUrl || databaseUrl === 'postgresql://test:test@localhost:5432/test';
const describeIfDb = skip ? describe.skip : describe;

const ORG = 7, USER = 3;
const ctx = { organizationId: ORG, userId: USER };
const SCHEMA = `fg_lock_${process.pid}_${Date.now()}`;
let admin: Pool;
let pool: Pool;
let sigN = 0;

const q = (text: string, params?: unknown[]) => pool.query(text, params as any[]);
const outcome = (p: Promise<unknown>) => p.then(() => null, (e: any) => e);

async function sign(seqId: number, intent: string): Promise<string> {
  const id = `sig-${++sigN}`;
  const binding = await deriveGovernedTargetBinding({ query: (t: string, p?: unknown[]) => q(t, p) as any }, `ectd-sequence:${seqId}`, ORG);
  await q(`INSERT INTO c2c_ana_actions (id, org_id, command, target, state, proposed_by, payload) VALUES ($1,$2,'sign',$3,'executed',$4,$5)`,
    [id, ORG, `ectd-sequence:${seqId}`, USER, JSON.stringify({ intent })]);
  await q(`INSERT INTO electronic_signatures (organization_id, signed_target, signature_manifest, bound_payload_digest, binding_basis, is_valid, verification_status)
           VALUES ($1,$2,$3,$4,$5,true,'valid')`,
    [ORG, `ectd-sequence:${seqId}`, JSON.stringify({ actionId: id }), binding.digest, binding.basis]);
  return id;
}

/**
 * Resolve once `pending` has settled or another backend of this database is
 * waiting on a lock; report which. Bounded, so a lock that is never taken
 * shows up as `blocked: false`, not as a hung suite.
 */
async function untilBlockedOrSettled(pending: Promise<unknown>): Promise<{ blocked: boolean }> {
  let settled = false;
  void pending.finally(() => { settled = true; }).catch(() => {});
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (settled) return { blocked: false };
    const r = await admin.query(
      `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE '%ectd_sequences%'`,
    );
    if ((r.rows[0] as { n: number }).n > 0) return { blocked: true };
    await new Promise((res) => setTimeout(res, 20));
  }
  return { blocked: false };
}

describeIfDb('the sequence row lock serializes leaf writes with a governed freeze (real Postgres)', () => {
  beforeAll(async () => {
    admin = new Pool({ connectionString: databaseUrl, max: 2 });
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    pool = new Pool({ connectionString: databaseUrl, max: 6 });
    // Every connection works in this run's schema; queued ahead of its first query.
    pool.on('connect', (c) => { void c.query(`SET search_path TO ${SCHEMA}`); });
    holder.pool = pool;
    holder.db = drizzle(pool);
    await q(IND_PGLITE_DDL);
    await q(SUBMISSION_CORE_PGLITE_DDL);
    await q(LEAF_SOURCE_PGLITE_DDL);
    await q(`
      CREATE TABLE c2c_ana_actions (id TEXT PRIMARY KEY, org_id INTEGER, command TEXT, target TEXT, state TEXT, proposed_by INTEGER, payload JSONB);
      CREATE TABLE electronic_signatures (id SERIAL PRIMARY KEY, organization_id INTEGER, signed_target TEXT, signature_manifest TEXT, bound_payload_digest TEXT, binding_basis TEXT, superseded_by INTEGER, is_valid BOOLEAN, verification_status TEXT);
      CREATE TABLE IF NOT EXISTS audit_logs (id SERIAL PRIMARY KEY, tenant_id INTEGER, table_name TEXT, record_id TEXT, action TEXT, new_values TEXT);
      CREATE TABLE IF NOT EXISTS ectd_compilations (id SERIAL PRIMARY KEY, organization_id INTEGER, submission_id INTEGER, sequence_number TEXT, leaf_manifest JSONB, compiled_at TIMESTAMP DEFAULT NOW());
      INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by) VALUES
        (1, 'lock A', 'ind', 'biotech', 'fda', ${ORG}, ${USER}), (2, 'lock B', 'ind', 'biotech', 'fda', ${ORG}, ${USER});
      INSERT INTO coauthor_documents (id, organization_id, title, content, module_number, status) VALUES
        (200, ${ORG}, 'Clinical Overview', '<p>approved</p>', 'm2.5', 'approved'),
        (201, ${ORG}, 'Nonclinical Overview', '<p>still a draft</p>', 'm2.4', 'draft');
    `);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin?.end();
  });

  it('an upsertLeaf that starts while a freeze holds the row lock waits for it, then refuses the frozen sequence', async () => {
    await q(`INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status) VALUES (1, 1, 'fda', '0000', ${ORG}, ${USER}, 'validated')`);
    const freezeTx: PoolClient = await pool.connect();
    try {
      // What the governed freeze does inside its transaction: lock, then set 'frozen'.
      await freezeTx.query('BEGIN');
      await freezeTx.query(`SELECT id FROM ectd_sequences WHERE id = 1 FOR UPDATE`);
      await freezeTx.query(`UPDATE ectd_sequences SET status = 'frozen', frozen_at = NOW() WHERE id = 1`);

      const write = outcome(upsertLeaf({ sequenceId: 1, sectionCode: 'm2.5', title: 'Clinical Overview', lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: 200 }, ctx));
      const { blocked } = await untilBlockedOrSettled(write);
      await freezeTx.query('COMMIT');
      const err = await write;

      expect(blocked, 'the leaf write did not wait for the freeze holding the sequence row').toBe(true);
      expect(err, 'a leaf was written into a sequence frozen while the write was in flight').toMatchObject({
        code: 'INVALID_STATE',
        message: expect.stringMatching(/frozen; its leaves are immutable/),
      });
    } finally {
      freezeTx.release();
    }
    const n = (await q(`SELECT count(*)::int AS n FROM submission_leaves WHERE sequence_id = 1 AND deleted_at IS NULL`)).rows[0] as { n: number };
    expect(n.n).toBe(0);
  }, 60_000);

  it('a freeze that reaches its row lock while a leaf write holds it waits, then refuses the leaf manifest it never judged', async () => {
    await q(`
      INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status) VALUES (2, 2, 'fda', '0000', ${ORG}, ${USER}, 'validated');
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (2, 'm2.5', 'Clinical Overview', 'new', 'coauthor_documents', 200, ${ORG}, ${USER});
    `);
    const sig = await sign(2, 'freeze');
    const leafTx: PoolClient = await pool.connect();
    try {
      // What lockSequenceForLeafWrite does: lock the row, then write — here a
      // draft document, which the package gate would have refused had it seen it.
      await leafTx.query('BEGIN');
      await leafTx.query(`SELECT status FROM ectd_sequences WHERE id = 2 AND organization_id = ${ORG} FOR UPDATE`);
      await leafTx.query(
        `INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by)
         VALUES (2, 'm2.4', 'Nonclinical Overview', 'new', 'coauthor_documents', 201, ${ORG}, ${USER})`,
      );

      const freeze = outcome(freezeSequence(2, ctx, sig));
      const { blocked } = await untilBlockedOrSettled(freeze);
      await leafTx.query('COMMIT');
      const err = await freeze;

      expect(blocked, 'the freeze did not wait for the leaf write holding the sequence row').toBe(true);
      expect(err, 'a leaf committed while the freeze waited was frozen without being judged').toMatchObject({
        code: 'INVALID_STATE',
        message: expect.stringMatching(/leaves changed while this freeze was being checked/),
      });
    } finally {
      leafTx.release();
    }
    const s = (await q(`SELECT status FROM ectd_sequences WHERE id = 2`)).rows[0] as { status: string };
    expect(s.status).toBe('validated');
  }, 120_000);
});
