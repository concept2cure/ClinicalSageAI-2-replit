/**
 * F1 (2026-11-02, the review round advances): an assignment chooses its review
 * round under the artifact's row lock, so two assignments cannot split a round.
 *
 * ── The defect this pins (reproduced 2026-11-02, before the lock) ────────────
 * POST …/reviewers joins the latest review round while an assignment in it is
 * open, and opens the next round once every assignment in it is completed or
 * withdrawn. It first read the round, then validated the reviewers, then
 * inserted, with no lock between. So an assignment X read round 1 as open (Ben
 * pending); Ben decided; a second assignment Y read round 1 as closed and
 * opened round 2; and X then inserted into round 1. The quorum
 * (reviewQuorumVerdict) reads only the latest round, so X's reviewer was never
 * counted: the quorum was met while they were pending, and their rejection
 * changed nothing.
 *
 * ── What is real ─────────────────────────────────────────────────────────────
 * The production auth gate with signed access tokens, the runtime role through
 * APP_DATABASE_URL with RLS enforcing (asserted below), the artifacts
 * router's reviewer-assignment and review-decision routes, and the production
 * quorum reader. The PGlite suite for these routes
 * (server/routes/c2c/__tests__/artifact-approval-ceremony.pglite.integration.test.ts)
 * runs on one connection, so it cannot show a lock; this suite does.
 *
 * The races are made deterministic. The owner holds one row, the requests are
 * sent one after another, each once the one before it has answered or is
 * waiting on a lock, and the row is let go once all of them have:
 *   - Cam's users row (FOR UPDATE): X waits at its insert's reviewer_id foreign
 *     key, after it chose its round. Under the artifact's row lock, Ben's
 *     decision and Y wait for X. Without the lock both complete, and Y opens
 *     round 2 under X.
 *   - The artifact's row (FOR NO KEY UPDATE, which a foreign-key check does not
 *     wait for): X waits for the artifact's row before it reads the round, and
 *     Ben decides meanwhile. Read before the lock, X's round is the one Ben
 *     then closes.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbrrd": organization 93280, users `dbrrd-*@example.invalid`, reused
 * across runs. Each run creates its own workspace, project and artifacts, and
 * removes them; assignments, decisions and provenance cascade from the
 * artifacts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool, type PoolClient } from 'pg';
import { databaseUrl } from '../setup.db';
import { accessToken, auth } from './two-tenant-fixture';

const ORG = 93280;
const TAG = 'dbrrd';
const RUN = `${TAG}-${process.pid}-${Date.now().toString(36)}`;

let owner: Pool;
let workspace = 0;
let app: express.Express;
let project = 0;
let admin = 0;
let author = 0;
const reviewers = { ada: 0, ben: 0, cam: 0 };
const names = new Map<number, string>();
const artifacts: number[] = [];

type Decision = 'approve' | 'request_changes' | 'reject';
const base = (key: string) => `/api/concept2cure/projects/proj_${project}/artifacts/${key}`;
/** A signed access token as sign-in mints one; the membership row, not the token, decides the role. */
const bearer = (userId: number, role: string) => auth(accessToken(userId, ORG, role));
const assign = (key: string, reviewerIds: number[]) =>
  request(app).post(`${base(key)}/reviewers`).set(bearer(admin, 'admin')).send({ reviewerIds });
const decide = (key: string, reviewer: number, decision: Decision) =>
  request(app)
    .post(`${base(key)}/reviews/submit`)
    .set(bearer(reviewer, 'reviewer'))
    .send({ decision, comment: `Recorded: ${decision}.` });
const ok = (res: request.Response) => {
  expect(res.status, JSON.stringify(res.body).slice(0, 400)).toBe(200);
  return res.body.data;
};

/** A document in review, written by the author, at version 2. */
async function newArtifact(label: string): Promise<{ key: string; pk: number }> {
  const key = `${RUN}-${label}`;
  const { rows } = await owner.query(
    `INSERT INTO concept2cure_artifacts (artifact_id, project_id, organization_id, type, category, title, content, version, status, created_by_id)
     VALUES ($1, $2, $3, 'document', 'regulatory', 'Clinical overview', 'body', 2, 'review', $4) RETURNING id`,
    [key, project, ORG, author],
  );
  const pk = Number(rows[0].id);
  artifacts.push(pk);
  return { key, pk };
}

/** Every assignment on the artifact, as [reviewer, round, status]. */
async function assignmentRows(pk: number) {
  const { rows } = await owner.query(
    `SELECT reviewer_id, review_round, status FROM concept2cure_review_assignments
      WHERE artifact_id = $1 ORDER BY review_round, reviewer_id`,
    [pk],
  );
  return rows.map(r => [names.get(Number(r.reviewer_id)), Number(r.review_round), r.status]);
}

/** The production quorum, read as both approval doors read it. */
const quorum = async (pk: number, version = 2) => {
  const { reviewQuorumVerdict } = await import('../../server/services/artifact-approval-act');
  return reviewQuorumVerdict(owner, pk, ORG, version);
};

/** Backends of this database waiting on a lock, other than the owner's holder. */
async function lockWaiters(except: number): Promise<number> {
  const { rows } = await owner.query(
    `SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> $1`,
    [except],
  );
  return rows[0].n;
}

/** Polls `done` every 50 ms for up to 15 s; answers whether it came true. */
async function waitUntil(done: () => Promise<boolean>): Promise<boolean> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await done()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

/**
 * Sends `steps` one after another while the owner holds the row `hold` locks:
 * each once the requests before it have answered or are waiting on a lock. Lets
 * the row go once every request has, and answers their responses in order.
 */
async function raceAgainstHeldRow(
  hold: { sql: string; params: unknown[] },
  steps: Array<() => PromiseLike<request.Response>>,
): Promise<request.Response[]> {
  const holder: PoolClient = await owner.connect();
  let released = false;
  try {
    await holder.query('BEGIN');
    await holder.query(hold.sql, hold.params);
    const holderPid = Number((await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    const answered = new Set<number>();
    const sent: Array<Promise<request.Response>> = [];
    let settled = true;
    for (const step of steps) {
      const i = sent.length;
      sent.push(Promise.resolve(step()).then(r => (answered.add(i), r)));
      settled = (await waitUntil(async () => answered.size + (await lockWaiters(holderPid)) >= sent.length)) && settled;
    }
    await holder.query('COMMIT');
    released = true;
    expect(settled, 'a request neither answered nor waited on a lock within 15 s').toBe(true);
    return await Promise.all(sent);
  } finally {
    if (!released) await holder.query('ROLLBACK').catch(() => undefined);
    holder.release();
  }
}

/** A member of the lane's organization, created on the first run and reused after. */
async function member(key: string, role: string): Promise<number> {
  const { rows } = await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, $2, 'not-a-real-password', 'active')
     ON CONFLICT (email) DO UPDATE SET status = 'active' RETURNING id`,
    [`${TAG}-${key}@example.invalid`, `Review round ${key}`],
  );
  const id = Number(rows[0].id);
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role`,
    [ORG, id, role],
  );
  return id;
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('[dbrrd] APP_DATABASE_URL is required: owner execution proves nothing about RLS.');
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await owner.query(
    `INSERT INTO organizations (id, name, slug, status) VALUES ($1, $2, $2, 'active')
     ON CONFLICT (id) DO UPDATE SET status = 'active'`,
    [ORG, `${TAG}-artifact-review-round`],
  );
  admin = await member('admin', 'admin');
  author = await member('author', 'member');
  for (const name of ['ada', 'ben', 'cam'] as const) {
    reviewers[name] = await member(name, 'reviewer');
    names.set(reviewers[name], name);
  }
  const w = await owner.query(
    `INSERT INTO client_workspaces (organization_id, name, slug, created_by_id) VALUES ($1, $2, $2, $3) RETURNING id`,
    [ORG, `${RUN}-workspace`, admin],
  );
  workspace = Number(w.rows[0].id);
  const p = await owner.query(
    `INSERT INTO projects (organization_id, client_workspace_id, name, type, status, owner_id)
     VALUES ($1, $2, $3, 'regulatory', 'active', $4) RETURNING id`,
    [ORG, workspace, `${RUN}-project`, admin],
  );
  project = Number(p.rows[0].id);

  const { createAuthBoundary } = await import('../../server/middleware/authBoundary');
  const { authenticateToken } = await import('../../server/middleware/auth');
  app = express();
  app.use(express.json());
  app.use('/api', createAuthBoundary());
  app.use('/api/concept2cure', authenticateToken, (await import('../../server/routes/c2c/artifacts')).default);
}, 120_000);

afterAll(async () => {
  if (!owner) return;
  // Assignments, decisions, provenance and notifications cascade from the artifact.
  await owner.query('DELETE FROM concept2cure_artifacts WHERE id = ANY($1::int[])', [artifacts]).catch(() => undefined);
  await owner.query('DELETE FROM projects WHERE id = $1', [project]).catch(() => undefined);
  await owner.query('DELETE FROM client_workspaces WHERE id = $1', [workspace]).catch(() => undefined);
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end().catch(() => undefined);
  await owner.end();
});

describe('F1: a reviewer assignment chooses its round under the artifact row lock', () => {
  it('runs as a role RLS applies to (not the owner, not BYPASSRLS)', async () => {
    const { getPool } = await import('../../server/db/runtime');
    const { runWithSystemTenantScope } = await import('../../server/db/tenantStore');
    const r = await runWithSystemTenantScope('artifact-review-round-lock.dbtest', () =>
      getPool().query(`SELECT r.rolsuper, r.rolbypassrls, current_user AS who FROM pg_roles r WHERE r.rolname = current_user`),
    );
    expect(r.rows[0]).toMatchObject({ rolsuper: false, rolbypassrls: false });
    expect(r.rows[0].who).not.toBe('postgres');
  });

  it('on the production stack, routing again after a request for changes and an edit opens round 2, and the approval meets the quorum', async () => {
    const { key, pk } = await newArtifact('again');
    const { ada } = reviewers;
    expect(ok(await assign(key, [ada]))).toMatchObject({ reviewRound: 1 });
    ok(await decide(key, ada, 'request_changes'));
    expect(await quorum(pk)).toMatchObject({ met: false, message: expect.stringMatching(/decisions: request_changes/) });
    // A new round is not opened over an objection to the version the document
    // still has (objectionToCurrentVersion, 2026-11-02): the author edits first.
    expect((await assign(key, [ada])).status).toBe(409);
    await owner.query('UPDATE concept2cure_artifacts SET version = 3 WHERE id = $1', [pk]);

    expect(ok(await assign(key, [ada])), 'routing again answered already_assigned in the closed round').toMatchObject({
      reviewRound: 2,
      previousRound: 1,
      assignments: [{ reviewerId: ada, status: 'pending', reviewRound: 2 }],
    });
    ok(await decide(key, ada, 'approve'));
    expect(await quorum(pk, 3)).toEqual({ met: true });
  });

  it('X chose round 1 while Ben was pending and waits at its insert: Ben\'s decision and Y wait for X, so the round is not split and every reviewer counts', async () => {
    const { key, pk } = await newArtifact('race-insert');
    const { ada, ben, cam } = reviewers;
    expect(ok(await assign(key, [ada, ben]))).toMatchObject({ reviewRound: 1 });
    ok(await decide(key, ada, 'approve'));

    // X assigns Cam; Ben's decision would close round 1; Y routes Ada again.
    const [x, benDecided, y] = await raceAgainstHeldRow({ sql: 'SELECT id FROM users WHERE id = $1 FOR UPDATE', params: [cam] }, [
      () => assign(key, [cam]),
      () => decide(key, ben, 'approve'),
      () => assign(key, [ada]),
    ]);
    expect(ok(x)).toMatchObject({ reviewRound: 1, assignments: [{ reviewerId: cam, status: 'pending', reviewRound: 1 }] });
    expect(ok(benDecided)).toMatchObject({ reviewRound: 1 });
    const routedAgain = ok(y);
    expect(routedAgain, 'Y opened round 2 while Cam was being assigned to round 1').toMatchObject({
      reviewRound: 1,
      assignments: [{ reviewerId: ada, status: 'already_assigned', reviewRound: 1 }],
    });
    expect(routedAgain).not.toHaveProperty('previousRound');
    expect(await assignmentRows(pk), 'the round was split').toEqual([
      ['ada', 1, 'completed'],
      ['ben', 1, 'completed'],
      ['cam', 1, 'pending'],
    ]);
    expect(await quorum(pk), 'the quorum was met while Cam was pending').toMatchObject({
      met: false,
      message: expect.stringMatching(/1 of 3 reviewers have not yet submitted/),
    });

    ok(await decide(key, cam, 'reject'));
    expect(await quorum(pk), "Cam's rejection was not counted").toMatchObject({
      met: false,
      message: expect.stringMatching(/did not approve \(decisions: reject\)/),
    });
  }, 60_000);

  it('X waits for the artifact\'s row before it reads the round, and Ben closes round 1 meanwhile: X and Y both land in round 2', async () => {
    const { key, pk } = await newArtifact('race-read');
    const { ada, ben, cam } = reviewers;
    expect(ok(await assign(key, [ada, ben]))).toMatchObject({ reviewRound: 1 });
    ok(await decide(key, ada, 'approve'));

    const [x, benDecided, y] = await raceAgainstHeldRow(
      { sql: 'SELECT id FROM concept2cure_artifacts WHERE id = $1 FOR NO KEY UPDATE', params: [pk] },
      [() => assign(key, [cam]), () => decide(key, ben, 'approve'), () => assign(key, [ada])],
    );
    // Whichever of X and Y took the row first opened round 2; the other joined it.
    const answers = [ok(x), ok(y)];
    expect(answers.map(a => a.reviewRound), 'an assignment chose its round before Ben closed round 1').toEqual([2, 2]);
    expect(answers.filter(a => a.previousRound === 1)).toHaveLength(1);
    expect(ok(benDecided)).toMatchObject({ reviewRound: 1, roundSummary: { readyForApproval: true } });
    expect(await assignmentRows(pk), 'the round was split').toEqual([
      ['ada', 1, 'completed'],
      ['ben', 1, 'completed'],
      ['ada', 2, 'pending'],
      ['cam', 2, 'pending'],
    ]);
    expect(await quorum(pk)).toMatchObject({ met: false, message: expect.stringMatching(/2 of 2 reviewers have not yet submitted/) });
  }, 60_000);
});
