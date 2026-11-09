/**
 * F1 repair A (re-plan step 4, 2026-11-08): one live sequence per number.
 *
 * On real PostgreSQL, as the non-owner runtime role under RLS, through the
 * routes a person uses (POST /api/submissions/:id/sequences and
 * POST /api/submissions/sequences/:seqId/transition).
 *
 * Before this repair:
 *   - nothing refused a second live sequence with a number a live sequence of
 *     the same submission and region already held. The filed fold joins
 *     compiles to sequences by number, so two live 0000s corrupt what the
 *     agency is read to hold (row D7);
 *   - createSequence took no lock, so two creates of 0000 in flight together
 *     both passed any check;
 *   - transitionSequence's compare-and-set did not ask that the sequence is
 *     still live, so one removed while the transition was in flight still
 *     moved.
 *
 * The races are made deterministic: another connection holds the row the act
 * must lock, does its own write, and commits. Only an act that takes the lock
 * waits and then sees that write.
 */
import { randomUUID } from 'node:crypto';
import express from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseUrl } from '../setup.db';

const RUN = randomUUID().slice(0, 8);
const TAG = `dbtest-seqonce-${RUN}`;
let owner: Pool;
let userId: number;
let orgId: number;
let orgUuid: string;
let programId: string;

async function submission(): Promise<number> {
  return Number((await owner.query(
    `INSERT INTO submissions (title, application_type, client_type, primary_region, organization_id, created_by, program_id)
     VALUES ($1, 'ind', 'pharma', 'fda', $2, $3, $4) RETURNING id`, [`${TAG} IND`, orgId, userId, programId])).rows[0].id);
}

async function app() {
  const submissionsRoutes = (await import('../../server/routes/submissions')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, { userId, tenantId: orgId, userRole: 'admin',
      user: { id: userId, organizationId: orgId, organizationUuid: orgUuid, role: 'admin' } });
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/submissions', submissionsRoutes);
  return a;
}

const createSequence = async (sub: number, sequenceNumber: string) =>
  request(await app()).post(`/api/submissions/${sub}/sequences`).send({ region: 'fda', sequenceNumber, type: sequenceNumber === '0000' ? 'original' : 'amendment' });

const liveCount = async (sub: number, sequenceNumber: string) =>
  Number((await owner.query(
    `SELECT count(*)::int AS n FROM ectd_sequences WHERE submission_id = $1 AND sequence_number = $2 AND deleted_at IS NULL`,
    [sub, sequenceNumber])).rows[0].n);

/** While `hold` keeps `lockSql`'s row locked in another connection, start `act`; then `write` and commit there. */
async function racedWith<T>(lockSql: string, params: unknown[], act: () => Promise<T>, write: (c: import('pg').PoolClient) => Promise<void>): Promise<T> {
  const c = await owner.connect();
  try {
    await c.query('BEGIN');
    await c.query(lockSql, params);
    const pending = act();
    await new Promise((r) => setTimeout(r, 400));
    await write(c);
    await c.query('COMMIT');
    return await pending;
  } catch (err) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL must use the provisioned non-owner runtime role.');
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  userId = Number((await owner.query(`INSERT INTO users (email, name, password_hash) VALUES ($1, 'Seq Once', 'not-a-real-hash') RETURNING id`,
    [`${TAG}@example.invalid`])).rows[0].id);
  const org = (await owner.query(`INSERT INTO organizations (name, slug, status) VALUES ($1, $1, 'active') RETURNING id, uuid`, [TAG])).rows[0];
  orgId = Number(org.id); orgUuid = String(org.uuid);
  programId = String((await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Invented product') RETURNING id`, [`${TAG} program`, TAG.toUpperCase(), orgId])).rows[0].id);
  await owner.query('INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, $3)', [orgId, userId, 'admin']);
});

afterAll(async () => {
  if (owner) await owner.query(`UPDATE organizations SET status = 'inactive' WHERE id = $1`, [orgId]).catch(() => undefined);
  await owner?.end();
});

describe('a sequence number is used once in a submission (F1 repair A)', () => {
  it('a second live 0000 is refused, by name', async () => {
    const sub = await submission();
    expect((await createSequence(sub, '0000')).status).toBe(201);
    const second = await createSequence(sub, '0000');
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({ code: 'INVALID_STATE', message: expect.stringMatching(/^Sequence 0000 already exists in this submission\. A sequence number is used once\./) });
    // P-86 (C2): the way to free a number is named where it is refused.
    expect(second.body.error.message).toContain(
      "A sequence never sent to the agency's production environment can be retired from its Dispatch tab, which frees its number. Nothing was created.");
    expect(await liveCount(sub, '0000')).toBe(1);
  });

  it('two creates of 0000 in flight together: the one that waits for the submission sees the other and is refused', async () => {
    const sub = await submission();
    // The other create holds the submission with the weakest lock any act takes on it (a share lock).
    // Only a create that takes the row exclusively waits for it; a shared one would pass and duplicate.
    const res = await racedWith(
      'SELECT id FROM submissions WHERE id = $1 FOR SHARE', [sub],
      () => createSequence(sub, '0000'),
      async (c) => {
        await c.query(
          `INSERT INTO ectd_sequences (submission_id, region, sequence_number, type, status, organization_id, created_by)
           VALUES ($1, 'fda', '0000', 'original', 'draft', $2, $3)`, [sub, orgId, userId]);
      },
    );
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(await liveCount(sub, '0000')).toBe(1);
  });

  it('a removed 0000 does not hold its number', async () => {
    const sub = await submission();
    const first = await createSequence(sub, '0000');
    // A removed sequence is made only by a recorded act (P-86's retirement, or the filed-elsewhere baseline's removal of
    // drafts): migrations/20261109_ectd_sequence_removal_guard.sql refuses any other removal at COMMIT. This fixture stands
    // in for one, with triggers off for its own transaction only (as review-route-guard.dbtest.ts lays a row).
    const lay = await owner.connect();
    try {
      await lay.query('BEGIN');
      await lay.query('SET LOCAL session_replication_role = replica');
      await lay.query('UPDATE ectd_sequences SET deleted_at = now() WHERE id = $1', [first.body.id]);
      await lay.query('COMMIT');
    } finally {
      lay.release();
    }
    const again = await createSequence(sub, '0000');
    expect(again.status, JSON.stringify(again.body)).toBe(201);
    expect(await liveCount(sub, '0000')).toBe(1);
  });

  it('a sequence removed while its transition is in flight does not move', async () => {
    const sub = await submission();
    const seq = (await createSequence(sub, '0000')).body;
    const res = await racedWith(
      'SELECT id FROM ectd_sequences WHERE id = $1 FOR UPDATE', [seq.id],
      async () => request(await app()).post(`/api/submissions/sequences/${seq.id}/transition`).send({ status: 'assembling' }),
      // The racing removal stands in for a recorded one, triggers off for its transaction only (see the case above).
      async (c) => {
        await c.query('SET LOCAL session_replication_role = replica');
        await c.query('UPDATE ectd_sequences SET deleted_at = now() WHERE id = $1', [seq.id]);
      },
    );
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect((await owner.query('SELECT status FROM ectd_sequences WHERE id = $1', [seq.id])).rows[0].status).toBe('draft');
  });
});
