/**
 * A review comment's words are fixed once posted, and every act on one is on
 * the chain (row D5, 2026-10-01).
 *
 * The Review launch surface's threads (concept2cure_thread_comments) could be
 * rewritten in place, through PATCH /api/concept2cure/review-comments/:id,
 * and soft-deleted, with no record of what a comment said. Its writes ran
 * outside any transaction. Here, on PostgreSQL built by install-fresh +
 * deploy-migrate, through the real router behind authenticateToken as
 * production mounts it, and as the runtime role with RLS enforcing:
 *
 *   - a posted comment commits with a chained audit_logs row that carries its
 *     words and their sha256, or neither commits;
 *   - PATCH is refused, and the database refuses the rewrite too, from any
 *     role, the owner included;
 *   - DELETE is a retraction: hidden from the thread, words kept, chained;
 *   - a comment cannot be deleted on its own, but goes with its thread.
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { authenticateToken } from '../../server/middleware/auth';
import reviewRoutes from '../../server/routes/c2c/reviews';
import {
  TAG,
  ORG_A,
  ORG_B,
  owner,
  tokenB,
  ids,
  auth,
  accessToken,
  provisionTwoTenantFixture,
  provisionMember,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const THREAD = `${TAG}-thread`;
const BASE = '/api/concept2cure';

let app: express.Express;
let reviewer: number;
let token: string;
let threadPk: number;
/** The database's clock when this file began: every audit row it writes is newer. */
let startedAt: Date;

async function chainedRow(action: string, commentId: string) {
  const { rows } = await owner.query(
    `SELECT user_id, reason, new_values, sha256_chain FROM audit_logs
      WHERE tenant_id = $1 AND action = $2 AND record_id = $3`,
    [ORG_A, action, commentId],
  );
  return rows;
}
const commentRow = async (commentId: string) =>
  (await owner.query('SELECT body, deleted_at, edited_at FROM concept2cure_thread_comments WHERE comment_id = $1', [commentId])).rows[0];

async function post(body: string) {
  return request(app).post(`${BASE}/review-threads/${THREAD}/comments`).set(auth(token)).send({ body, kind: 'comment' });
}

beforeAll(async () => {
  await provisionTwoTenantFixture();
  startedAt = (await owner.query('SELECT now() AS t')).rows[0].t;
  reviewer = await provisionMember(ORG_A, 'admin', 'review-comments');
  token = accessToken(reviewer, ORG_A, 'admin');
  const project = Number(ids.A.projects);
  const art = await owner.query(
    `INSERT INTO concept2cure_artifacts (artifact_id, project_id, organization_id, type, category, title, content, created_by_id)
     VALUES ($1, $2, $3, 'document', 'clinical', 'Clinical Study Report 301', 'Body', $4) RETURNING id`,
    [`${TAG}-art`, project, ORG_A, reviewer],
  );
  const thread = await owner.query(
    `INSERT INTO concept2cure_review_threads (thread_id, org_id, project_id, artifact_id, created_by_id, created_by_name, title, status)
     VALUES ($1, $2, $3, $4, $5, 'Reviewer', 'Section 11 efficacy tables', 'open') RETURNING id`,
    [THREAD, ORG_A, project, art.rows[0].id, reviewer],
  );
  threadPk = Number(thread.rows[0].id);
  app = express();
  app.use(express.json());
  app.use(BASE, authenticateToken, reviewRoutes);
});

afterAll(async () => {
  // This file's rows in the fixture tenants' audit chains, all of them, so the
  // chains are as they were before it ran: the fixture teardown removes only
  // its own tagged rows, and a chain with rows removed from its middle reads as
  // broken to every suite after this one (the store-wide verifier stops at the
  // first break). Files run one at a time (vitest.db.config.ts), so every row
  // these tenants gained since startedAt is this file's.
  const c = await owner.connect();
  try {
    await c.query('BEGIN');
    await c.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await c.query('DELETE FROM audit_logs WHERE tenant_id = ANY($1::int[]) AND created_at >= $2', [[ORG_A, ORG_B], startedAt]);
    await c.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
    await c.query('COMMIT');
  } catch (err) {
    await c.query('ROLLBACK');
    throw err;
  } finally {
    c.release();
  }
  // Projects cascade to their artifacts, threads and comments, which the guard
  // admits (a comment goes with what it belongs to).
  await teardownTwoTenantFixture();
});

describe('posting', () => {
  it('commits the comment with a chained row carrying its words and their sha256', async () => {
    const words = 'Table 14.2.1 reports the ITT population; the SAP specifies mITT.';
    const res = await post(words);
    expect(res.status).toBe(200);
    const id = res.body.data.commentId as string;
    expect((await commentRow(id)).body).toBe(words);
    const rows = await chainedRow('review.comment.posted', id);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].user_id)).toBe(reviewer);
    expect(rows[0].reason).toBeNull();
    const details = typeof rows[0].new_values === 'string' ? JSON.parse(rows[0].new_values) : rows[0].new_values;
    expect(details).toMatchObject({ commentId: id, threadId: threadPk, origin: 'person', body: words, bodySha256: sha256(words) });
    expect(rows[0].sha256_chain).toMatch(/^[0-9a-f]{64}$/);
  });

  it('writes neither when the chained row cannot be written', async () => {
    await owner.query(`CREATE OR REPLACE FUNCTION pg_temp_refuse_probe() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action = 'review.comment.posted' AND NEW.new_values::text LIKE '%atomicity-probe%' THEN
        RAISE EXCEPTION 'probe: audit store refuses'; END IF; RETURN NEW; END $$`);
    await owner.query('CREATE TRIGGER review_comment_probe BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION pg_temp_refuse_probe()');
    try {
      const res = await post('atomicity-probe: this must not be saved without its record');
      expect(res.status).toBe(500);
    } finally {
      await owner.query('DROP TRIGGER review_comment_probe ON audit_logs');
      await owner.query('DROP FUNCTION pg_temp_refuse_probe()');
    }
    const left = await owner.query(`SELECT 1 FROM concept2cure_thread_comments WHERE body LIKE 'atomicity-probe%'`);
    expect(left.rows).toHaveLength(0);
  });

  it("refuses another tenant's caller on this thread", async () => {
    const res = await request(app).post(`${BASE}/review-threads/${THREAD}/comments`).set(auth(tokenB)).send({ body: 'x' });
    expect([403, 404]).toContain(res.status);
  });
});

describe('the words are fixed', () => {
  it('PATCH is refused with COMMENT_TEXT_FIXED, and the words are unchanged', async () => {
    const id = (await post('The Kaplan-Meier figure is missing its censoring marks.')).body.data.commentId as string;
    const res = await request(app).patch(`${BASE}/review-comments/${id}`).set(auth(token)).send({ body: 'rewritten' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('COMMENT_TEXT_FIXED');
    expect((await commentRow(id)).body).toBe('The Kaplan-Meier figure is missing its censoring marks.');
  });

  it('the database refuses a rewrite, a direct delete and a truncate from the owner', async () => {
    const id = (await post('Dose-response is not shown for the 10 mg arm.')).body.data.commentId as string;
    for (const sql of [
      `UPDATE concept2cure_thread_comments SET body = 'rewritten' WHERE comment_id = '${id}'`,
      `UPDATE concept2cure_thread_comments SET author_name = 'Someone else' WHERE comment_id = '${id}'`,
      `DELETE FROM concept2cure_thread_comments WHERE comment_id = '${id}'`,
    ]) {
      await expect(owner.query(sql), sql).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    }
    // In a transaction that always rolls back: were the guard ever missing,
    // this would otherwise empty the table for every suite after it.
    const c = await owner.connect();
    try {
      await c.query('BEGIN');
      await expect(c.query('TRUNCATE concept2cure_thread_comments')).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
    expect((await commentRow(id)).body).toBe('Dose-response is not shown for the 10 mg arm.');
  });
});

describe('retraction', () => {
  it('hides the comment, keeps its words, and chains who retracted it and why', async () => {
    const words = 'Withdrawn: I misread the table footnote.';
    const id = (await post(words)).body.data.commentId as string;
    const res = await request(app)
      .delete(`${BASE}/review-comments/${id}`)
      .set(auth(token))
      .send({ reason: '  Misread the footnote; the table is correct.  ' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ commentId: id, retracted: true });
    const row = await commentRow(id);
    expect(row.body).toBe(words);
    expect(row.deleted_at).not.toBeNull();
    const rows = await chainedRow('review.comment.retracted', id);
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe('Misread the footnote; the table is correct.');
    const details = typeof rows[0].new_values === 'string' ? JSON.parse(rows[0].new_values) : rows[0].new_values;
    expect(details).toMatchObject({ commentId: id, bodySha256: sha256(words) });
    // The thread no longer lists it.
    const list = await request(app).get(`${BASE}/review-threads/${THREAD}/comments`).set(auth(token));
    expect(JSON.stringify(list.body)).not.toContain(id);
    // And a retraction happens once.
    await expect(
      owner.query(`UPDATE concept2cure_thread_comments SET deleted_at = now() WHERE comment_id = $1`, [id]),
    ).rejects.toThrow(/already retracted/);
  });
});

describe('a comment goes only with what it belongs to', () => {
  it('deleting its thread removes it (the cascade), and the chained rows remain', async () => {
    const art = await owner.query('SELECT artifact_id FROM concept2cure_review_threads WHERE id = $1', [threadPk]);
    const t2 = await owner.query(
      `INSERT INTO concept2cure_review_threads (thread_id, org_id, project_id, artifact_id, created_by_id, created_by_name, title, status)
       VALUES ($1, $2, $3, $4, $5, 'Reviewer', 'Scratch thread', 'open') RETURNING id`,
      [`${THREAD}-2`, ORG_A, Number(ids.A.projects), art.rows[0].artifact_id, reviewer],
    );
    const id = (
      await request(app).post(`${BASE}/review-threads/${THREAD}-2/comments`).set(auth(token)).send({ body: 'scratch' })
    ).body.data.commentId as string;
    await owner.query('DELETE FROM concept2cure_review_threads WHERE id = $1', [t2.rows[0].id]);
    expect(await commentRow(id)).toBeUndefined();
    expect(await chainedRow('review.comment.posted', id)).toHaveLength(1);
  });
});

describe('who takes part in a review: the organisation’s own roles', () => {
  // Until 2026-10-01 the permission map named roles no membership carries
  // (reviewer, approver, author, user), so every organisation role but admin
  // was read-only on the Review surface.
  let thread3: string;
  const tokens = new Map<string, Record<string, string>>();
  /** One member of the organisation per role, provisioned once. */
  const as = async (role: string) => {
    if (!tokens.has(role)) tokens.set(role, auth(accessToken(await provisionMember(ORG_A, role, `review-${role}`), ORG_A, role)));
    return tokens.get(role)!;
  };

  beforeAll(async () => {
    thread3 = `${THREAD}-3`;
    const art = await owner.query('SELECT artifact_id FROM concept2cure_review_threads WHERE id = $1', [threadPk]);
    await owner.query(
      `INSERT INTO concept2cure_review_threads (thread_id, org_id, project_id, artifact_id, created_by_id, created_by_name, title, status)
       VALUES ($1, $2, $3, $4, $5, 'Reviewer', 'Listing 16.2.6 dose units', 'open')`,
      [thread3, ORG_A, Number(ids.A.projects), art.rows[0].artifact_id, reviewer],
    );
  });

  it('a member doing the work comments and asks for changes', async () => {
    const member = await as('member');
    const comment = await request(app).post(`${BASE}/review-threads/${thread3}/comments`).set(member).send({ body: 'Units are mg, not mg/kg.', kind: 'comment' });
    expect(comment.status, JSON.stringify(comment.body)).toBe(200);
    const changes = await request(app).post(`${BASE}/review-threads/${thread3}/comments`).set(member).send({ body: 'Please correct the listing.', kind: 'request_changes' });
    expect(changes.status, JSON.stringify(changes.body)).toBe(200);
  });

  it('a member cannot reassign the thread; a manager can, and resolves it', async () => {
    const member = await as('member');
    const reassign = await request(app).patch(`${BASE}/review-threads/${thread3}`).set(member).send({ assigneeId: null });
    expect(reassign.status).toBe(403);
    const manager = await as('manager');
    expect((await request(app).patch(`${BASE}/review-threads/${thread3}`).set(manager).send({ assigneeId: null })).status).toBe(200);
    const resolved = await request(app).post(`${BASE}/review-threads/${thread3}/resolve`).set(manager).send({});
    expect(resolved.status, JSON.stringify(resolved.body)).toBe(200);
  });

  it('a viewer reads and cannot comment', async () => {
    const viewer = await as('viewer');
    expect((await request(app).get(`${BASE}/review-threads/${thread3}/comments`).set(viewer)).status).toBe(200);
    const res = await request(app).post(`${BASE}/review-threads/${thread3}/comments`).set(viewer).send({ body: 'x', kind: 'comment' });
    expect(res.status).toBe(403);
  });
});
