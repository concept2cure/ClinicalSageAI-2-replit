/**
 * P-86, test T13 of the design (docs/evidence/RIM/2026-11-08-designs/p86-retire-unfiled-sequence.design.md §4 C1):
 * a sequence's retirement on two REAL PostgreSQL connections.
 *
 * sequence-retirement.pglite proves the act, but PGlite is one connection, so
 * two things the act rests on were never observed:
 *
 *  1. The retirement and a creation of a sequence in the same submission
 *     serialize on the submission row (the retirement takes it FOR SHARE, a
 *     creation FOR UPDATE), and whichever commits first, the other sees it:
 *     - a creation of 0001 that holds the row first: the retirement of 0000
 *       waits, then reads 0001 under its lock and refuses, naming it;
 *     - a retirement that holds the row first: a creation of the number it
 *       frees waits, then reads 0000 as removed and takes the number.
 *  2. The act's one instant is read after its locks. With another connection
 *     holding the sequence row FOR UPDATE for 500 ms after the retirement was
 *     seen waiting for it, the retirement's deleted_at equals its audit row's
 *     occurred_at and both are at least 500 ms after that wait was seen, so
 *     after the retirement transaction's now() (which is BEGIN's, before the
 *     wait). A removal stamped NOW() (mutation M20), or an audit row stamped
 *     with its own clock (M21), fails here.
 *
 * The retirement is the REAL retireSequence, with the REAL chained audit
 * writer. The creation side replays createSequence's own transaction (the
 * organization FOR SHARE, the submission FOR UPDATE, the number check, the
 * INSERT, COMMIT), as freeze-gate-row-lock replays a freeze: createSequence
 * reads public.submission_filed_baselines by its qualified name, and this
 * suite works in a schema of its own. The real createSequence's lock is proven
 * on real PostgreSQL by tests/db/sequence-number-once.dbtest.ts.
 *
 * Needs TEST_DATABASE_URL (a PostgreSQL the test may create and drop a schema
 * in); skipped otherwise, as the other real-PostgreSQL suites are. Its waits
 * are read from pg_stat_activity for this run's own application_name, so a
 * suite running beside it on the same database is not counted.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// tests/setup.ts replaces pg with a stub; this suite needs the real driver.
vi.unmock('pg');

const holder = vi.hoisted(() => ({ db: null as any, pool: null as any }));

vi.mock('../../../db', () => ({
  get db() { return holder.db; },
  get pool() { return holder.pool; },
}));
// Only the best-effort secondary log is stubbed; the act's record is the real writeChainedAuditRow's.
vi.mock('../../auditService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../auditService')>()),
  default: { logAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })) },
}));

import { Pool, type PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { IND_PGLITE_DDL, SUBMISSION_CORE_PGLITE_DDL, LEAF_SOURCE_PGLITE_DDL, AUDIT_LOGS_PGLITE_DDL, PROGRAM_SPINE_PGLITE_DDL } from '../../../db/pglite-harness';
import { deriveGovernedTargetBinding } from '../../part11/signature-persistence';
import { retireSequence } from '../submission-service';
import { retirementStatement } from '../filed-sequence-baseline';
import { ORG, USER, FREEZE_GATE_SEED_SQL, FREEZE_PROGRAM_ID } from './_freeze-gate-fixture';

const databaseUrl = process.env.TEST_DATABASE_URL;
// The sentinel tests/setup.ts installs points at nothing.
const skip = !databaseUrl || databaseUrl === 'postgresql://test:test@localhost:5432/test';
const describeIfDb = skip ? describe.skip : describe;

const ctx = { organizationId: ORG, userId: USER };
const AUTHOR = 4; // The sequence's creator: never its retirer.
const REASON = 'The test send found a content defect in Module 3.';
const SCHEMA = `p86_lock_${process.pid}_${Date.now()}`;
let admin: Pool;
let pool: Pool;
let sigN = 0;
let nextId = 9700;

const q = (text: string, params?: unknown[]) => pool.query(text, params as any[]);
const outcome = (p: Promise<unknown>) => p.then(() => null, (e: any) => e);
const serverNow = async () => (await admin.query(`SELECT clock_timestamp() AS t`)).rows[0].t as Date;

/** A dispatched 0000, its send pending, in a submission of its own, created by AUTHOR. */
async function sequenceOf(): Promise<{ id: number; submissionId: number }> {
  const id = nextId++;
  await q(`INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by, program_id)
           VALUES ($1, 'P-86 lock', 'ind', 'biotech', 'fda', ${ORG}, ${AUTHOR}, '${FREEZE_PROGRAM_ID}')`, [id]);
  await q(`INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status, dispatch_status)
           VALUES ($1, $1, 'fda', '0000', ${ORG}, ${AUTHOR}, 'dispatched', 'pending')`, [id]);
  return { id, submissionId: id };
}

/** A retirement signature as the sign route records it: intent 'retire', responsibility, the statement, the reason. */
async function retireSig(seqId: number): Promise<string> {
  const id = `ret-${++sigN}`;
  const binding = await deriveGovernedTargetBinding({ query: (t: string, p?: unknown[]) => q(t, p) as any }, `ectd-sequence:${seqId}`, ORG);
  await q(`INSERT INTO c2c_ana_actions (id, org_id, command, target, state, proposed_by, payload) VALUES ($1,$2,'sign',$3,'executed',$4,$5)`,
    [id, ORG, `ectd-sequence:${seqId}`, USER,
      JSON.stringify({ intent: 'retire', meaning: 'responsibility', notFiledElsewhere: true, statement: retirementStatement('0000') })]);
  await q(`INSERT INTO electronic_signatures (organization_id, signed_target, signature_manifest, bound_payload_digest, binding_basis, is_valid,
             verification_status, signer_id, signature_meaning, signature_type, signature_purpose)
           VALUES ($1,$2,$3,$4,$5,true,'valid',$6,'responsibility','governed-action',$7)`,
  [ORG, `ectd-sequence:${seqId}`, JSON.stringify({ actionId: id }), binding.digest, binding.basis, USER, REASON]);
  return id;
}

/** The first statements of createSequence's transaction (submission-service.ts), on a connection of the caller's. */
async function lockForCreation(c: PoolClient, submissionId: number): Promise<void> {
  await c.query(`SELECT id FROM organizations WHERE id = $1 FOR SHARE`, [ORG]);
  await c.query(`SELECT program_id FROM submissions WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL FOR UPDATE`, [submissionId, ORG]);
}

/**
 * Resolve once `n` backends of this run wait on a lock, or once `pending` has
 * settled; report which. Bounded, so a lock that is never taken shows up as
 * `waiting: false`, not as a hung suite.
 */
async function untilWaiting(pending: Promise<unknown>, n: number): Promise<{ waiting: boolean }> {
  let settled = false;
  void pending.finally(() => { settled = true; }).catch(() => {});
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (settled) return { waiting: false };
    const r = await admin.query(
      `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND application_name = $1 AND wait_event_type = 'Lock'`,
      [SCHEMA],
    );
    if ((r.rows[0] as { n: number }).n >= n) return { waiting: true };
    await new Promise((res) => setTimeout(res, 20));
  }
  return { waiting: false };
}

const row = async (id: number) => (await q(`SELECT deleted_at FROM ectd_sequences WHERE id = $1`, [id])).rows[0] as { deleted_at: Date | null };
const retiredRows = async (id: number) =>
  (await q(`SELECT occurred_at FROM audit_logs WHERE table_name = 'ectd_sequence' AND record_id = $1 AND action = 'ECTD_SEQUENCE_RETIRED'`, [String(id)])).rows;

/** This run's schema, with the tables the act reads and the freeze-gate fixture's signers. */
async function createSchema(): Promise<void> {
  admin = new Pool({ connectionString: databaseUrl, max: 2 });
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  pool = new Pool({ connectionString: databaseUrl, max: 8, application_name: SCHEMA });
  // Every connection works in this run's schema; queued ahead of its first query.
  pool.on('connect', (c) => { void c.query(`SET search_path TO ${SCHEMA}`); });
  holder.pool = pool;
  holder.db = drizzle(pool);
  await q(IND_PGLITE_DDL);
  await q(SUBMISSION_CORE_PGLITE_DDL);
  await q(LEAF_SOURCE_PGLITE_DDL);
  await q(PROGRAM_SPINE_PGLITE_DDL);
  await q(AUDIT_LOGS_PGLITE_DDL);
  await q('ALTER TABLE regulatory_programs ADD COLUMN IF NOT EXISTS applicant_sponsor_id UUID');
  await q(FREEZE_GATE_SEED_SQL);
  await q(`
    ALTER TABLE electronic_signatures ADD COLUMN IF NOT EXISTS signer_name TEXT, ADD COLUMN IF NOT EXISTS signed_at TIMESTAMP DEFAULT now(),
      ADD COLUMN IF NOT EXISTS signature_purpose TEXT;
    -- The real transmittal table's columns the package spine writes (migrations/20260509_submission_gateways.sql).
    ALTER TABLE submission_transmittals ADD COLUMN IF NOT EXISTS package_id INTEGER, ADD COLUMN IF NOT EXISTS program_id UUID,
      ADD COLUMN IF NOT EXISTS status TEXT, ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();`);
}

describeIfDb('P-86: a retirement on two real PostgreSQL connections (T13)', () => {
  beforeAll(createSchema, 120_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin?.end();
  });

  it('a creation of 0001 holding the submission first: the retirement of 0000 waits for it, then refuses, naming 0001', async () => {
    const { id, submissionId } = await sequenceOf();
    const sig = await retireSig(id);
    const creation = await pool.connect();
    try {
      await creation.query('BEGIN');
      await lockForCreation(creation, submissionId);
      await creation.query(`INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status)
                            VALUES ($1, $2, 'fda', '0001', ${ORG}, ${AUTHOR}, 'draft')`, [nextId++, submissionId]);

      const retirement = outcome(retireSequence({ sequenceId: id, signatureActionId: sig }, ctx));
      const { waiting } = await untilWaiting(retirement, 1);
      await creation.query('COMMIT');
      const err = await retirement;

      expect(waiting, 'the retirement did not wait for the creation holding the submission row').toBe(true);
      expect(err, 'a sequence was retired under a later sequence created while the retirement waited').toMatchObject({
        code: 'SEQUENCE_NOT_RETIRABLE',
        message: expect.stringMatching(/^Sequence 0001, numbered after 0000 in this submission, is still in use\. Retire 0001 first/),
      });
    } finally {
      creation.release();
    }
    expect((await row(id)).deleted_at).toBeNull();
    expect(await retiredRows(id)).toEqual([]);
  }, 60_000);

  it('a retirement that waits 500 ms for its sequence row seals the instant it got the lock; a creation of the freed number waits for it, then takes 0000', async () => {
    const { id, submissionId } = await sequenceOf();
    const sig = await retireSig(id);
    const rowHolder = await pool.connect();
    const creation = await pool.connect();
    const settled: string[] = [];
    try {
      await rowHolder.query('BEGIN');
      await rowHolder.query(`SELECT id FROM ectd_sequences WHERE id = $1 FOR UPDATE`, [id]);

      const retirement = retireSequence({ sequenceId: id, signatureActionId: sig }, ctx).then((a) => { settled.push('retirement'); return a; });
      void retirement.catch(() => {});
      // It holds the submission FOR SHARE and waits for the sequence row.
      const first = await untilWaiting(retirement, 1);
      const waitSeen = await serverNow();

      // The creation of 0000, the number the retirement frees, as createSequence does it.
      await creation.query('BEGIN');
      const created = (async () => {
        await lockForCreation(creation, submissionId);
        const taken = await creation.query(
          `SELECT 1 FROM ectd_sequences WHERE submission_id = $1 AND organization_id = $2 AND region = 'fda' AND sequence_number = '0000' AND deleted_at IS NULL`,
          [submissionId, ORG]);
        if (taken.rows.length > 0) { await creation.query('ROLLBACK'); return 'taken'; }
        await creation.query(`INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status)
                              VALUES ($1, $2, 'fda', '0000', ${ORG}, ${AUTHOR}, 'draft')`, [nextId++, submissionId]);
        await creation.query('COMMIT');
        settled.push('creation');
        return 'created';
      })();
      void created.catch(() => {});
      const second = await untilWaiting(created, 2);

      await new Promise((res) => setTimeout(res, 500));
      await rowHolder.query('COMMIT');
      const answer = await retirement;

      expect(first.waiting, 'the retirement did not wait for the connection holding its sequence row').toBe(true);
      expect(second.waiting, 'the creation did not wait for the retirement holding the submission row').toBe(true);
      expect(await created, 'the creation read 0000 as live: it did not wait for the retirement to commit').toBe('created');
      expect(settled).toEqual(['retirement', 'creation']);

      const sealed = (await q(
        `SELECT s.deleted_at = a.occurred_at AS same, (s.deleted_at - $2::timestamptz) >= interval '500 milliseconds' AS after_wait,
                to_char(s.deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS deleted_iso
           FROM ectd_sequences s JOIN audit_logs a ON a.record_id = s.id::text AND a.table_name = 'ectd_sequence' AND a.action = 'ECTD_SEQUENCE_RETIRED'
          WHERE s.id = $1`,
        [id, waitSeen])).rows;
      expect(sealed, 'one retirement record').toHaveLength(1);
      expect(sealed[0].same, "the removal's time is not the time its record seals").toBe(true);
      expect(sealed[0].after_wait, 'the removal was stamped before the retirement held its lock').toBe(true);
      expect(sealed[0].deleted_iso).toBe(answer.retiredAt);
    } finally {
      rowHolder.release();
      creation.release();
    }
    const live = (await q(`SELECT sequence_number FROM ectd_sequences WHERE submission_id = $1 AND deleted_at IS NULL`, [submissionId])).rows;
    expect(live).toEqual([{ sequence_number: '0000' }]);
  }, 60_000);
});
