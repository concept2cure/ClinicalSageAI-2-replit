/**
 * An artifact's review record as a copy an inspector can take (21 CFR Part 11
 * §11.10(b); row D5, 2026-10-01, slice 4).
 *
 * Review-thread comments are fixed once posted and every act on one is chained
 * (review-comments-record.dbtest.ts). Until this export an inspector could see
 * them only as raw rows inside the organisation's whole audit-trail export:
 * there was no copy of one artifact's review: its threads, every comment and
 * retraction, who, when, and whether each still matches its chained row.
 *
 * Here, on PostgreSQL built by install-fresh + deploy-migrate, through the real
 * router behind authenticateToken as production mounts it, with RLS enforcing:
 *   - an audit reader takes the record; it is checkable from the package alone;
 *   - a comment rewritten past the triggers, or never chained, says so;
 *   - the export is itself on the chain, and refused when it cannot be;
 *   - a member, and another organisation, cannot take it.
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
const BASE = '/api/concept2cure';
const ART = `${TAG}-rr-art`;
const THREAD = `${TAG}-rr-thread`;

let app: express.Express;
let admin: number;
let adminToken: string;
let memberToken: string;
let project: number;
let artifactPk: number;
let startedAt: Date;
const posted: Record<string, string> = {};

const exportPath = () => `${BASE}/projects/${project}/artifacts/${ART}/review-record/export`;

/** As an inspector would: the JSON body of the downloaded file. */
async function takeRecord(token = adminToken) {
  const res = await request(app).get(exportPath()).set(auth(token)).buffer(true).parse((r, cb) => {
    let data = '';
    r.on('data', (c: Buffer) => (data += c.toString('utf8')));
    r.on('end', () => cb(null, data));
  });
  return { res, pkg: res.status === 200 ? JSON.parse(res.body as string) : null };
}

/** The owner past the triggers: what the record's verdicts exist to show. */
async function asOwnerPastTheGuard(sql: string, params: unknown[]): Promise<void> {
  const c = await owner.connect();
  try {
    await c.query('BEGIN');
    await c.query("SET LOCAL session_replication_role = 'replica'");
    await c.query(sql, params);
    await c.query('COMMIT');
  } catch (err) {
    await c.query('ROLLBACK');
    throw err;
  } finally {
    c.release();
  }
}

beforeAll(async () => {
  await provisionTwoTenantFixture();
  startedAt = (await owner.query('SELECT now() AS t')).rows[0].t;
  admin = await provisionMember(ORG_A, 'admin', 'rr-admin');
  adminToken = accessToken(admin, ORG_A, 'admin');
  memberToken = accessToken(await provisionMember(ORG_A, 'member', 'rr-member'), ORG_A, 'member');
  project = Number(ids.A.projects);
  const art = await owner.query(
    `INSERT INTO concept2cure_artifacts (artifact_id, project_id, organization_id, type, category, title, content, created_by_id)
     VALUES ($1, $2, $3, 'document', 'clinical', 'Clinical Study Report 302', 'Body', $4) RETURNING id`,
    [ART, project, ORG_A, admin],
  );
  artifactPk = Number(art.rows[0].id);
  await owner.query(
    `INSERT INTO concept2cure_review_threads (thread_id, org_id, project_id, artifact_id, created_by_id, created_by_name, title, status)
     VALUES ($1, $2, $3, $4, $5, 'Reviewer', 'Section 12 safety tables', 'open')`,
    [THREAD, ORG_A, project, artifactPk, admin],
  );
  app = express();
  app.use(express.json());
  app.use(BASE, authenticateToken, reviewRoutes);

  for (const [key, body, kind] of [
    ['first', 'Table 14.3.1 omits the two discontinuations in week 6.', 'comment'],
    ['changes', 'Add the discontinuations and re-run the AE summary.', 'request_changes'],
    ['retracted', 'Withdrawn: the discontinuations are in Table 14.3.2.', 'comment'],
  ] as const) {
    const res = await request(app).post(`${BASE}/review-threads/${THREAD}/comments`).set(auth(adminToken)).send({ body, kind });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    posted[key] = res.body.data.commentId;
  }
  const retract = await request(app)
    .delete(`${BASE}/review-comments/${posted.retracted}`)
    .set(auth(adminToken))
    .send({ reason: 'Found in Table 14.3.2.' });
  expect(retract.status).toBe(200);
});

afterAll(async () => {
  // Every audit row this file wrote for the fixture tenants, so their chains
  // are as they were (files run one at a time: every row since startedAt is ours).
  await asOwnerPastTheGuard('DELETE FROM audit_logs WHERE tenant_id = ANY($1::int[]) AND created_at >= $2', [[ORG_A, ORG_B], startedAt]);
  await teardownTwoTenantFixture();
});

describe('an audit reader takes the review record', () => {
  it('every thread and comment, a retraction with who and why, each intact against its chained row', async () => {
    const { res, pkg } = await takeRecord();
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="review-record-/);
    expect(pkg.format).toBe('review-record-export/1');
    expect(pkg.artifact).toMatchObject({ artifactId: ART, title: 'Clinical Study Report 302' });
    expect(pkg.threads.map((t: { threadId: string }) => t.threadId)).toEqual([THREAD]);
    const byId = new Map(pkg.comments.map((c: { commentId: string }) => [c.commentId, c]));
    expect([...byId.keys()]).toEqual([posted.first, posted.changes, posted.retracted]);
    expect(byId.get(posted.retracted)).toMatchObject({
      body: 'Withdrawn: the discontinuations are in Table 14.3.2.',
      retracted: { by: admin, reason: 'Found in Table 14.3.2.' },
    });
    expect(byId.get(posted.changes)).toMatchObject({ kind: 'request_changes', origin: 'person', authorId: admin });
    for (const id of Object.values(posted)) expect(pkg.verdicts[id], id).toEqual({ status: 'intact' });
    expect(pkg.summary).toMatchObject({ comments: 3, intact: 3, mismatched: 0, notChained: 0, retracted: 1, truncated: false });
    expect(pkg.tenantChain.ok).not.toBe(false);
  });

  it('the package alone lets an inspector check every comment against its chained row', async () => {
    const { pkg } = await takeRecord();
    for (const c of pkg.comments) {
      const link = pkg.chain[c.commentId];
      expect(link.posted.details.commentId).toBe(c.commentId);
      expect(link.posted.details.bodySha256).toBe(sha256(c.body));
      expect(Number(link.posted.userId)).toBe(c.authorId);
      expect(link.posted.sha256Chain).toMatch(/^[0-9a-f]{64}$/);
      if (c.retracted) expect(link.retracted.details.bodySha256).toBe(sha256(c.body));
    }
    expect(pkg.howToVerify.length).toBeGreaterThan(3);
  });

  it('the export itself is on the chain: who took which record, and what it said', async () => {
    const before = (await owner.query(`SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id = $1 AND action = 'review.record.exported'`, [ORG_A])).rows[0].n;
    const { pkg } = await takeRecord();
    const { rows } = await owner.query(
      `SELECT user_id, record_id, new_values FROM audit_logs WHERE tenant_id = $1 AND action = 'review.record.exported' ORDER BY created_at DESC LIMIT 1`,
      [ORG_A],
    );
    expect((await owner.query(`SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id = $1 AND action = 'review.record.exported'`, [ORG_A])).rows[0].n).toBe(before + 1);
    expect(Number(rows[0].user_id)).toBe(admin);
    expect(rows[0].record_id).toBe(ART);
    const details = typeof rows[0].new_values === 'string' ? JSON.parse(rows[0].new_values) : rows[0].new_values;
    expect(details).toMatchObject({ format: 'review-record-export/1', comments: 3, intact: 3, exportedAt: pkg.exportedAt });
  });
});

describe('the record says when it does not match', () => {
  it('a comment rewritten past the triggers is reported, and only that one', async () => {
    await asOwnerPastTheGuard('UPDATE concept2cure_thread_comments SET body = $2 WHERE comment_id = $1', [
      posted.first,
      'Table 14.3.1 is complete.',
    ]);
    const { pkg } = await takeRecord();
    expect(pkg.verdicts[posted.first]).toEqual({ status: 'mismatch', fields: ['body'] });
    expect(pkg.verdicts[posted.changes]).toEqual({ status: 'intact' });
    expect(pkg.summary).toMatchObject({ intact: 2, mismatched: 1 });
  });

  it('a comment with no chained row (as before 2026-10-01) is not chained, never intact', async () => {
    await owner.query(
      `INSERT INTO concept2cure_thread_comments (comment_id, org_id, thread_id, artifact_id, author_id, author_name, body, kind)
       SELECT $1, $2, id, $3, $4, 'Reviewer', 'An old comment.', 'comment' FROM concept2cure_review_threads WHERE thread_id = $5`,
      [`${TAG}-rr-old`, ORG_A, artifactPk, admin, THREAD],
    );
    const { pkg } = await takeRecord();
    expect(pkg.verdicts[`${TAG}-rr-old`]).toMatchObject({ status: 'not_chained' });
    expect(pkg.summary).toMatchObject({ comments: 4, notChained: 1 });
  });

  it('a retraction the row shows but the chain does not is reported', async () => {
    await asOwnerPastTheGuard('UPDATE concept2cure_thread_comments SET deleted_at = now() WHERE comment_id = $1', [posted.changes]);
    const { pkg } = await takeRecord();
    expect(pkg.verdicts[posted.changes]).toEqual({ status: 'mismatch', fields: ['retraction'] });
  });
});

describe('who may take it, and when it may not leave', () => {
  it('the Review queue offers the export exactly to those the route serves', async () => {
    const queue = async (token: string) =>
      (await request(app).get(`${BASE}/reviews/my-queue`).set(auth(token))).body.data.permissions.canExportRecord;
    expect(await queue(adminToken)).toBe(true);
    expect(await queue(memberToken)).toBe(false);
  });

  it('a member is refused (DP-18: the audit trail is read by owners, admins and managers)', async () => {
    const { res } = await takeRecord(memberToken);
    expect(res.status).toBe(403);
  });

  it("another organisation's administrator does not reach this artifact", async () => {
    const { res } = await takeRecord(tokenB);
    expect([403, 404]).toContain(res.status);
  });

  it('when the export cannot be recorded it is refused, and nothing leaves', async () => {
    await owner.query(`CREATE OR REPLACE FUNCTION pg_temp_refuse_export() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action = 'review.record.exported' THEN RAISE EXCEPTION 'probe: audit store refuses'; END IF; RETURN NEW; END $$`);
    await owner.query('CREATE TRIGGER review_record_export_probe BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION pg_temp_refuse_export()');
    try {
      const res = await request(app).get(exportPath()).set(auth(adminToken));
      expect(res.status).toBe(503);
      expect(JSON.stringify(res.body)).not.toContain('Table 14.3');
    } finally {
      await owner.query('DROP TRIGGER review_record_export_probe ON audit_logs');
      await owner.query('DROP FUNCTION pg_temp_refuse_export()');
    }
  });
});
