/**
 * Authoring's review request writes its review route on its own transaction
 * (RR5, docs/design/REVIEW_ROUTING_2026-10-23.md §2.1, §2.8, §2.9, §2.13;
 * findings B3, B5, M1, M2). On PostgreSQL as the runtime role with RLS on,
 * through the real authoring router behind the real object gate, with the
 * real signing ceremony (a bcrypt password, re-verified on the signature's
 * transaction) and the real notification writer.
 *
 *   - POST /documents/:id/request-review writes the authoring_reviews rows,
 *     the Reviewer grants, the review_routes header and each reviewer's route
 *     task on ONE transaction: they commit together, or (a refused member, a
 *     missing date, a missing reason) nothing is written;
 *   - a named reviewer's existing REVIEWER e-sign closes their route task,
 *     stamped with the authoring_signatures id, over the sections digest the
 *     route is about; the last reviewer's completes the route; before the
 *     credential, anyone else, a waiting step and changed content are refused;
 *   - a "changes requested" verdict still records the verdict, returns the
 *     route, tells the sender and opens nobody's step;
 *   - reassign and hand back, through the one validator;
 *   - a review requested before RR5 (rows and a task, no route) keeps today's
 *     loop.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import { nativeCatalogRunId } from './catalog-native-fixture';
import { seedVaultFixtureParent } from './vault-current-access-fixture';
import { databaseUrl } from '../setup.db';

const RUN = nativeCatalogRunId();
const TAG = `dbtest-rr5 ${RUN}`;
const PASSWORD = 'dbtest-rr5-signer-password';
const WHY = 'Ready for medical review before the pre-IND package.';
const WHO = ['author', 'r1', 'r2', 'r3', 'member', 'outsider'] as const;
type Who = (typeof WHO)[number];
const ROLE: Record<Who, string> = { author: 'admin', r1: 'reviewer', r2: 'reviewer', r3: 'reviewer', member: 'member', outsider: 'admin' };

let owner: Pool;
let orgA = 0;
let orgB = 0;
let programA = '';
const users = {} as Record<Who, number>;
const names = {} as Record<Who, string>;
const emails = {} as Record<Who, string>;
const apps = {} as Record<Who, { app: express.Express; auth: string }>;

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const orgOf = (who: Who) => (who === 'outsider' ? orgB : orgA);

async function bearer(who: Who): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET_DEV || process.env.JWT_SECRET);
  const token = await new SignJWT({
    userId: String(users[who]), id: String(users[who]), sub: String(users[who]), email: emails[who], name: names[who],
    organizationId: String(orgOf(who)), role: ROLE[who], roles: [ROLE[who]], type: 'access',
  }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30m').sign(secret);
  return `Bearer ${token}`;
}

/** The authoring router behind the object gate, as production mounts both (register-inline-routes.ts). */
async function appFor(who: Who): Promise<express.Express> {
  const router = (await import('../../server/routes/authoring.router')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const { authoringObjectAuthorization } = await import('../../server/middleware/authoringObjectAuthorization');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = users[who]; r.tenantId = orgOf(who); r.userRole = ROLE[who];
    r.user = { id: users[who], organizationId: orgOf(who), role: ROLE[who], roles: [ROLE[who]], email: emails[who] };
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api', authoringObjectAuthorization);
  a.use('/api/authoring', router);
  a.use('/api/review', (await import('../../server/routes/review-board-routes')).default());
  return a;
}

const call = (who: Who, method: 'get' | 'post', path: string, body?: object) => {
  const req = request(apps[who].app)[method](`/api/authoring${path}`).set('Authorization', apps[who].auth);
  return body ? req.send(body) : req;
};

/** A draft with two saved sections, authored by `author`. */
async function draft(suffix: string): Promise<string> {
  const doc = await call('author', 'post', '/docs', { title: `${TAG} ${suffix}`, module: 'M2', client_program_id: programA });
  expect(doc.status, JSON.stringify(doc.body)).toBe(201);
  const id = String(doc.body?.document?.id ?? doc.body?.id);
  for (const [i, code] of ['2.5.1', '2.5.2'].entries()) {
    const sec = await call('author', 'post', '/sections', { doc_id: id, code, title: code, content: `<p>Saved body ${i + 1}.</p>`, order_index: i });
    expect(sec.status, JSON.stringify(sec.body)).toBe(201);
  }
  return id;
}

/** The sections digest the e-sign binds (authoring-content-digests.ts sectionsDigest), recomputed here from the rows. */
async function digestOf(docId: string): Promise<string> {
  const { rows } = await owner.query(
    `SELECT code, content FROM authoring_sections WHERE doc_id = $1 ORDER BY order_index, created_at, id`, [docId]);
  return createHash('sha256').update(rows.map((s) => `${s.code}:${s.content}`).join('|||')).digest('hex');
}

const ask = (docId: string, who: Who[], route: Record<string, unknown> | null = { reviewDueDate: day(3) }, reason: string | null = WHY) =>
  call('author', 'post', `/documents/${docId}/request-review`, {
    reviewers: who.map((w) => ({ id: String(users[w]), name: names[w] })),
    ...(reason === null ? {} : { reason }), ...(route === null ? {} : { route }),
  });
const reviewSign = (who: Who, docId: string, password = PASSWORD) =>
  call(who, 'post', `/docs/${docId}/e-sign`, { meaning: 'REVIEWER', intent: 'I reviewed the saved document as it stands.', password });
async function verdict(who: Who, docId: string, review_status: string, review_comments?: string) {
  const read = await call(who, 'get', `/documents/${docId}/reviews`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  const c = read.body.reviewContext;
  return call(who, 'post', `/documents/${docId}/review`, {
    review_status, ...(review_comments ? { review_comments } : {}),
    expected: { reviewId: c.myReview.reviewId, requestedAt: c.myReview.requestedAt, snapshotHash: c.snapshotHash, bindingBasis: c.bindingBasis },
  });
}

async function routes(docId: string) {
  return (await owner.query(`SELECT * FROM review_routes WHERE organization_id = $1 AND subject_type = 'authoring_document' AND subject_id = $2 ORDER BY created_at`, [orgA, docId])).rows;
}
type Member = {
  task_id: string; assignee_id: number; status: string; review_role: string; review_step: number; module_type: string;
  source_entity_type: string; source_entity_id: string; due_date: Date | null; route_authoring_signature_id: string | null; route_act_id: string | null;
};
async function members(docId: string): Promise<Member[]> {
  const { rows } = await owner.query(
    `SELECT t.task_id, t.assignee_id, t.assignee_name, t.status, t.review_role, t.review_step, t.module_type, t.source_entity_type,
            t.source_entity_id, t.due_date, t.route_authoring_signature_id::text, t.route_signature_id, t.route_act_id, t.description
       FROM unified_tasks t JOIN review_routes r ON r.organization_id = t.organization_id AND r.id = t.review_route_id
      WHERE r.organization_id = $1 AND r.subject_id = $2 ORDER BY r.created_at, t.id`, [orgA, docId]);
  return rows.map((r) => ({ ...r, assignee_id: Number(r.assignee_id) }) as Member);
}
const memberOf = async (docId: string, who: Who) => (await members(docId)).find((m) => m.assignee_id === users[who])!;
async function governed(docId: string, command: string) {
  return (await owner.query(`SELECT payload, decision_reason, proposed_by FROM c2c_ana_actions WHERE org_id = $1 AND target = $2 AND command = $3 ORDER BY executed_at, id`,
    [orgA, `authoring-document:${docId}`, command])).rows;
}
async function transitions(taskId: string) {
  return (await owner.query(`SELECT payload FROM c2c_ana_actions WHERE org_id = $1 AND command = 'task.transition' AND target = $2 ORDER BY executed_at, id`,
    [orgA, `task:${taskId}`])).rows.map((r) => r.payload);
}
/** Everything a request could have written for this document. */
async function written(docId: string) {
  const q = async (sql: string) => Number((await owner.query(sql, [docId])).rows[0].n);
  return {
    reviews: await q(`SELECT count(*) AS n FROM authoring_reviews WHERE doc_id = $1`),
    grants: await q(`SELECT count(*) AS n FROM doc_permissions WHERE doc_id::text = $1 AND role = 'REVIEWER'`),
    routes: await q(`SELECT count(*) AS n FROM review_routes WHERE subject_id = $1`),
    tasks: await q(`SELECT count(*) AS n FROM unified_tasks WHERE source_entity_id = $1`),
    requested: await q(`SELECT count(*) AS n FROM authoring_audit_trail WHERE doc_id::text = $1 AND operation_type = 'review_requested'`),
  };
}
/** Notices are sent after COMMIT, fire-and-forget: wait for the recipient's. */
async function noticeFor(who: Who, title: string): Promise<{ category: string; body: string | null }> {
  for (let i = 0; i < 50; i++) {
    const { rows } = await owner.query(`SELECT category, body FROM mdx_notifications WHERE organization_id = $1 AND recipient_user_id = $2 AND title = $3 ORDER BY id DESC LIMIT 1`,
      [orgA, users[who], title]);
    if (rows[0]) return rows[0];
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`No notice "${title}" reached ${who}`);
}
const noticesTitled = async (who: Who, title: string) =>
  Number((await owner.query(`SELECT count(*) AS n FROM mdx_notifications WHERE organization_id = $1 AND recipient_user_id = $2 AND title = $3`, [orgA, users[who], title])).rows[0].n);
const titleOf = (suffix: string) => `${TAG} ${suffix}`;

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const org = async (slug: string) => (await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $1) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`dbtest-rr5-${RUN}-${slug}`])).rows[0];
  const a = await org('a');
  orgA = Number(a.id);
  orgB = Number((await org('b')).id);
  for (const who of WHO) {
    names[who] = `Rory ${who[0].toUpperCase()}${who.slice(1)}`;
    emails[who] = `dbtest-rr5-${RUN}-${who}@example.test`;
    users[who] = Number((await owner.query(
      `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash RETURNING id`,
      [emails[who], names[who], bcrypt.hashSync(PASSWORD, 4)])).rows[0].id);
    await owner.query(`INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [orgOf(who), users[who], ROLE[who]]);
  }
  programA = String((await owner.query(
    `INSERT INTO regulatory_programs (organization_id, name, code, program_type, product_type, primary_agency, product_name)
       VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', 'C2C-501')
     ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name, deleted_at = NULL RETURNING id`,
    [orgA, `${TAG} program`, `DBTEST-RR5-${RUN}`])).rows[0].id);
  // The program's project (the anchor authoring needs), private; the reviewers reach it as its members.
  await seedVaultFixtureParent(owner, { orgId: orgA, orgUuid: String(a.uuid), programId: programA }, { userId: users.author, namespace: `DBTEST-RR5-${RUN}` });
  await owner.query(
    `INSERT INTO project_members (project_id, organization_id, user_id, role, status, invited_by_id)
     SELECT p.id, p.organization_id, u.id, 'edit', 'active', $3 FROM projects p, unnest($4::int[]) AS u(id)
      WHERE p.organization_id = $1 AND p.regulatory_program_id = $2`,
    [orgA, programA, users.author, [users.r1, users.r2, users.r3, users.member]]);
  for (const who of WHO) apps[who] = { app: await appFor(who), auth: await bearer(who) };
}, 120_000);

afterAll(async () => {
  // Signatures, revisions and the chained ledger are append-only; the documents are retired by title.
  await owner?.query(`UPDATE authoring_documents SET title = title || ' (retired)' WHERE title LIKE $1`, [`${TAG}%`]).catch(() => undefined);
  await owner?.end().catch(() => undefined);
});

describe('the request and its route commit together (RR5)', () => {
  it('one request writes the review rows, the grants, the route header and each reviewer’s task, and tells each reviewer', async () => {
    const docId = await draft('together');
    const res = await ask(docId, ['r1', 'r2']);
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    expect(await written(docId)).toEqual({ reviews: 2, grants: 2, routes: 1, tasks: 2, requested: 1 });
    const [header] = await routes(docId);
    expect(header).toMatchObject({ subject_type: 'authoring_document', subject_id: docId, round: 1, sender_id: users.author,
      sender_name: names.author, review_order: 'parallel', status: 'open', approval_due_at: null });
    expect(header.content_digest).toBe(await digestOf(docId));
    expect(header.review_due_at).not.toBeNull();
    const rows = await members(docId);
    expect(rows.map((m) => [m.assignee_id, m.review_role, m.review_step, m.status, m.module_type, m.source_entity_type, m.source_entity_id]))
      .toEqual([users.r1, users.r2].map((u) => [u, 'reviewer', 1, 'pending', 'Authoring', 'authoring_document', docId]));
    expect(rows.every((m) => m.due_date !== null)).toBe(true);
    const [send] = await governed(docId, 'review-route.send');
    expect(send.decision_reason).toBe(WHY);
    expect(send.payload.members.map((m: { printedName: string }) => m.printedName)).toEqual([names.r1, names.r2]);
    expect(res.body.route).toMatchObject({ id: header.id, added: false });
    expect(res.body.route.tasks.map((t: { taskId: string }) => t.taskId).sort()).toEqual(rows.map((m) => m.task_id).sort());
    for (const who of ['r1', 'r2'] as const) {
      expect(await noticeFor(who, `Review requested: ${titleOf('together')}`)).toMatchObject({ category: 'task_assigned' });
    }
  });

  it('or neither does: a reviewer the validator refuses, after the request rows were written, leaves nothing', async () => {
    const docId = await draft('neither');
    const res = await ask(docId, ['r1', 'member']);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'MEMBER_CANNOT_SIGN' });
    expect(await written(docId)).toEqual({ reviews: 0, grants: 0, routes: 0, tasks: 0, requested: 0 });
  });

  it('a request with no due date, or no reason, is refused with nothing written', async () => {
    const docId = await draft('no-date');
    const undated = await ask(docId, ['r1'], null);
    expect(undated.status, JSON.stringify(undated.body)).toBe(400);
    expect(undated.body.error).toMatchObject({ code: 'ROUTE_DUE_DATES_REQUIRED' });
    const unreasoned = await ask(docId, ['r1'], { reviewDueDate: day(3) }, null);
    expect(unreasoned.status, JSON.stringify(unreasoned.body)).toBe(400);
    expect(unreasoned.body.error).toMatchObject({ code: 'REASON_REQUIRED' });
    expect(await written(docId)).toEqual({ reviews: 0, grants: 0, routes: 0, tasks: 0, requested: 0 });
  });

  it('the picker’s read answers with the one validator: a member without signing authority is refused, and why, before anything is sent', async () => {
    const docId = await draft('candidates');
    const res = await call('author', 'get', `/documents/${docId}/route-candidates`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const of = (who: Who) => res.body.candidates.find((c: { id: number }) => c.id === users[who]);
    expect(of('r1')).toMatchObject({ name: names.r1, reviewer: null });
    expect(of('member').reviewer).toMatchObject({ code: 'MEMBER_CANNOT_SIGN' });
    expect(of('author').reviewer).toMatchObject({ code: 'MEMBER_IS_AUTHOR' });
    expect(of('outsider')).toBeUndefined();
    expect(typeof res.body.timeZone).toBe('string');
    // A reviewer (no edit grant) does not read whom the sender may name.
    expect((await call('r1', 'get', `/documents/${docId}/route-candidates`)).status).toBe(403);
  });

  it('asking another reviewer while the route is open on the same content adds them to it', async () => {
    const docId = await draft('add');
    expect((await ask(docId, ['r1'])).status).toBe(200);
    const again = await ask(docId, ['r2']);
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect(again.body.route).toMatchObject({ added: true });
    expect((await routes(docId))).toHaveLength(1);
    expect((await members(docId)).map((m) => m.assignee_id)).toEqual([users.r1, users.r2]);
    expect(await governed(docId, 'review-route.add')).toHaveLength(1);
  });
});

describe('a REVIEWER /e-sign closes the reviewer’s route task (RR5, §2.8)', () => {
  it('stamps the signature on the member row, cites it, tells the sender, and the last reviewer completes the route', async () => {
    const docId = await draft('sign');
    expect((await ask(docId, ['r1', 'r2'])).status).toBe(200);

    const first = await reviewSign('r1', docId);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.documentHash).toBe(await digestOf(docId));
    const r1 = await memberOf(docId, 'r1');
    expect(r1).toMatchObject({ status: 'completed', route_authoring_signature_id: first.body.signatureId });
    expect(await transitions(r1.task_id)).toContainEqual(expect.objectContaining({ to: 'completed', signatureRef: `authoring-sig:${first.body.signatureId}` }));
    expect(await memberOf(docId, 'r2')).toMatchObject({ status: 'pending', route_authoring_signature_id: null });
    expect((await routes(docId))[0].status).toBe('open');
    expect(await noticeFor('author', `${names.r1} signed: ${titleOf('sign')}`)).toMatchObject({ category: 'task_completed' });

    const round = await call('author', 'get', `/documents/${docId}/review-route`);
    expect(round.status, JSON.stringify(round.body)).toBe(200);
    const mine = round.body.round.members.find((m: { userId: number }) => m.userId === users.r1);
    expect(mine).toMatchObject({ outcome: 'signed', signature: { id: first.body.signatureId, meaning: 'REVIEWER', printedName: names.r1 } });

    const second = await reviewSign('r2', docId);
    expect(second.status, JSON.stringify(second.body)).toBe(200);
    expect(await memberOf(docId, 'r2')).toMatchObject({ status: 'completed', route_authoring_signature_id: second.body.signatureId });
    expect((await routes(docId))[0]).toMatchObject({ status: 'complete', status_by: users.r2 });
  });

  it('refuses, before the credential, a reviewer the route does not name: a wrong password is never checked', async () => {
    const docId = await draft('not-named');
    expect((await ask(docId, ['r1'])).status).toBe(200);
    // r3 holds the Reviewer role on the document (an earlier grant), so the object gate admits the review act; the route does not name them.
    await owner.query(`INSERT INTO doc_permissions (doc_id, tenant_id, principal_id, email, role, granted_by)
      VALUES ($1, $2, $3, $4, 'REVIEWER', $5)`, [docId, orgA, String(users.r3), emails.r3, String(users.author)]);
    const res = await reviewSign('r3', docId, 'not-the-password');
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.code).toBe('ROUTE_NOT_NAMED');
    expect((await owner.query(`SELECT count(*)::int AS n FROM authoring_signatures WHERE doc_id = $1`, [docId])).rows[0].n).toBe(0);
  });

  it('refuses a reviewer whose step has not opened, one after another', async () => {
    const docId = await draft('step');
    expect((await ask(docId, ['r1', 'r2'], { order: 'sequential', reviewStepDueDates: [day(2), day(4)] })).status).toBe(200);
    expect(await memberOf(docId, 'r2')).toMatchObject({ status: 'blocked', review_step: 2 });
    const early = await reviewSign('r2', docId);
    expect(early.status, JSON.stringify(early.body)).toBe(409);
    expect(early.body.code).toBe('ROUTE_STEP_NOT_OPEN');
    expect((await reviewSign('r1', docId)).status).toBe(200);
    expect(await memberOf(docId, 'r2')).toMatchObject({ status: 'pending' });
    expect(await noticeFor('r2', `It is your turn: review ${titleOf('step')}`)).toMatchObject({ category: 'task_update' });
  });

  it('refuses a review signature over content the route is not about', async () => {
    const docId = await draft('changed');
    expect((await ask(docId, ['r1'])).status).toBe(200);
    await owner.query(`UPDATE authoring_sections SET content = '<p>Edited after the request.</p>' WHERE doc_id = $1 AND code = '2.5.2'`, [docId]);
    const res = await reviewSign('r1', docId);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.code).toBe('ROUTE_CONTENT_CHANGED');
    expect(await memberOf(docId, 'r1')).toMatchObject({ status: 'pending', route_authoring_signature_id: null });
  });
});

describe('the Authoring signature door (RR5 merged with P-59)', () => {
  /** The door, called as the runtime role in the organization's own scope, the way review-route.ts calls it. */
  async function throughDoor(routeId: string, taskId: string, signatureId: string) {
    const runtime = new Pool({ connectionString: process.env.APP_DATABASE_URL, max: 1 });
    const c = await runtime.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.current_tenant_id',$1,true), set_config('app.rls_enforce','on',true)`, [String(orgA)]);
      const r = await c.query('SELECT public.review_route_record_authoring_signature($1, $2::uuid, $3, $4::uuid, $5) AS status',
        [orgA, routeId, taskId, signatureId, users.r1]);
      await c.query('COMMIT');
      return r.rows[0].status as string;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
      await runtime.end();
    }
  }
  const forge = async (docId: string, email: string, meaning: string, hash: string) => {
    const id = randomUUID();
    await owner.query(
      `INSERT INTO authoring_signatures (id, doc_id, signer_email, signer_name, meaning, reason, method, content_hash, pin_verified, tenant_id)
       VALUES ($1, $2, $3, 'Forged', $4, 'test', 'PIN', $5, true, $6)`, [id, docId, email, meaning, hash, orgA]);
    return id;
  };

  it('closes a member’s task only on their own signature, with REVIEWER, over this document and the routed content', async () => {
    const docId = await draft('door');
    const other = await draft('door-other');
    expect((await ask(docId, ['r1'])).status).toBe(200);
    const routeId = String((await routes(docId))[0].id);
    const member = await memberOf(docId, 'r1');
    const digest = await digestOf(docId);
    const refused = async (sig: Promise<string>) =>
      expect(throughDoor(routeId, member.task_id, await sig)).rejects.toThrow(/ROUTE_TASK_OWNED_BY_ROUTE/);

    await refused(forge(docId, emails.r2, 'REVIEWER', digest));          // not the member's own
    await refused(forge(docId, emails.r1, 'APPROVER', digest));          // the wrong meaning for a reviewer
    await refused(forge(docId, emails.r1, 'REVIEWER', 'f'.repeat(64)));  // content the route is not about
    await refused(forge(other, emails.r1, 'REVIEWER', digest));          // another document
    expect(await memberOf(docId, 'r1')).toMatchObject({ status: 'pending', route_authoring_signature_id: null });

    // The control: the member's own REVIEWER signature over the routed content closes the task.
    const own = await forge(docId, emails.r1, 'REVIEWER', digest);
    expect(await throughDoor(routeId, member.task_id, own)).toBe('completed');
    expect(await memberOf(docId, 'r1')).toMatchObject({ status: 'completed', route_authoring_signature_id: own });
  });
});

describe('a negative verdict returns the route and opens nobody’s step (RR5, §2.9, B5)', () => {
  it('“changes requested” is recorded, the route is returned with its reason, every unsigned member is cancelled, the sender is told', async () => {
    const docId = await draft('changes');
    expect((await ask(docId, ['r1', 'r2'], { order: 'sequential', reviewStepDueDates: [day(2), day(4)] })).status).toBe(200);
    const why = 'Section 2.5.2 cites the wrong SAP version.';
    const res = await verdict('r1', docId, 'changes_requested', why);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.review).toMatchObject({ review_status: 'changes_requested', review_comments: why });

    const [header] = await routes(docId);
    expect(res.body.route).toEqual({ id: header.id, status: 'returned' });
    expect(header).toMatchObject({ status: 'returned', status_reason: why, status_by: users.r1 });
    const [ret] = await governed(docId, 'review-route.return');
    expect(ret.decision_reason).toBe(why);
    const r1 = await memberOf(docId, 'r1');
    const r2 = await memberOf(docId, 'r2');
    expect(r1).toMatchObject({ status: 'cancelled' });
    expect(r1.route_act_id).not.toBeNull();
    // The next step is not opened: it is cancelled, never pending, and its reviewer is never told it is their turn.
    expect(r2).toMatchObject({ status: 'cancelled', route_act_id: null });
    expect((await transitions(r2.task_id)).map((p) => p.to)).not.toContain('pending');
    expect(await noticesTitled('r2', `It is your turn: review ${titleOf('changes')}`)).toBe(0);
    // The grandfathered closure leaves route rows to the route: no verdict-cause transition on either.
    expect((await transitions(r1.task_id)).some((p) => p.cause === 'review-verdict')).toBe(false);
    expect(await noticeFor('author', `Returned for revision: ${titleOf('changes')}`)).toMatchObject({ category: 'task_update', body: why });

    // The loop: a new request is round 2 on its own route.
    expect((await ask(docId, ['r1'])).status).toBe(200);
    expect((await routes(docId)).map((r) => [r.round, r.status])).toEqual([[1, 'returned'], [2, 'open']]);
  });

  it('an approval verdict records the verdict and leaves the route task to the signature', async () => {
    const docId = await draft('approved-verdict');
    expect((await ask(docId, ['r1'])).status).toBe(200);
    const res = await verdict('r1', docId, 'approved');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.route).toBeNull();
    expect(await memberOf(docId, 'r1')).toMatchObject({ status: 'pending' });
    expect((await routes(docId))[0].status).toBe('open');
  });
});

describe('the Review board reads a reviewer’s route signature (RR5 phone acceptance, open item)', () => {
  type BoardReview = { reviewerId: string; status: string; routeSignedAt: string | null; requestedByName: string | null };
  async function boardRow(who: Who, docId: string, scope = 'all') {
    const res = await request(apps[who].app).get(`/api/review/board?scope=${scope}&limit=100`).set('Authorization', apps[who].auth);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.data.queue.find((r: { id: string }) => r.id === docId);
  }
  const reviewOf = (row: { reviews: BoardReview[] }, who: Who) => row.reviews.find((r) => r.reviewerId === String(users[who]))!;

  it('a reviewer who signed is no longer awaiting review; one who has not is; the request names who asked', async () => {
    const docId = await draft('board');
    expect((await ask(docId, ['r1', 'r2'])).status).toBe(200);
    expect(await boardRow('r1', docId)).toMatchObject({ awaitingMyReview: true, mine: true, myReviewSignedAt: null });

    const signed = await reviewSign('r1', docId);
    expect(signed.status, JSON.stringify(signed.body)).toBe(200);
    const r1 = await boardRow('r1', docId);
    expect(r1).toMatchObject({ awaitingMyReview: false, mine: false, state: 'in-review', myReviewSignedAt: expect.any(String) });
    expect(reviewOf(r1, 'r1')).toMatchObject({ status: 'pending', routeSignedAt: expect.any(String), requestedByName: names.author });
    expect(reviewOf(r1, 'r2')).toMatchObject({ status: 'pending', routeSignedAt: null });
    expect(r1.prov).toContain(`review requested by ${names.author}`);
    expect(await boardRow('r1', docId, 'mine')).toBeUndefined();
    expect(await boardRow('r2', docId)).toMatchObject({ awaitingMyReview: true, mine: true });

    // Every reviewer signed: the review is done, so it is no longer open work; its requester still sees it.
    expect((await reviewSign('r2', docId)).status).toBe(200);
    expect(await boardRow('author', docId)).toBeUndefined();
    expect(await boardRow('author', docId, 'requested')).toMatchObject({ state: 'approved', awaitingMyReview: false });
  });

  it('a signature over content the document no longer has is not a review of it: the reviewer is awaiting again', async () => {
    const docId = await draft('board-changed');
    expect((await ask(docId, ['r1', 'r2'])).status).toBe(200);
    expect((await reviewSign('r1', docId)).status).toBe(200);
    await owner.query(`UPDATE authoring_sections SET content = '<p>Changed after the signature.</p>' WHERE doc_id = $1 AND code = '2.5.2'`, [docId]);
    const r1 = await boardRow('r1', docId);
    expect(r1).toMatchObject({ awaitingMyReview: true, myReviewSignedAt: null });
    expect(reviewOf(r1, 'r1')).toMatchObject({ routeSignedAt: null });
  });
});

describe('reassign and hand back (RR5 with RR3’s acts)', () => {
  it('reassigns a reviewer: the task is kept, the review request moves, and the new reviewer signs', async () => {
    const docId = await draft('reassign');
    expect((await ask(docId, ['r1', 'r2'])).status).toBe(200);
    const before = await memberOf(docId, 'r1');
    const res = await call('author', 'post', `/documents/${docId}/review-route/reassign`,
      { taskId: before.task_id, assigneeId: users.r3, reason: 'Rory R1 is on leave for the review window' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await members(docId)).find((m) => m.task_id === before.task_id)).toMatchObject({ assignee_id: users.r3, status: 'pending' });
    const reviews = (await owner.query(`SELECT reviewer_id, review_status FROM authoring_reviews WHERE doc_id = $1 ORDER BY reviewer_id`, [docId])).rows;
    expect(reviews).toEqual(expect.arrayContaining([{ reviewer_id: String(users.r3), review_status: 'pending' }]));
    expect(reviews.some((r) => r.reviewer_id === String(users.r1))).toBe(false);
    const [moved] = await governed(docId, 'review-route.reassign');
    expect(moved.payload).toMatchObject({ from: { printedName: names.r1 }, to: { printedName: names.r3 } });
    expect((await reviewSign('r1', docId)).body.code).toBe('ROUTE_NOT_NAMED');
    expect((await reviewSign('r3', docId)).status).toBe(200);
    expect((await members(docId)).find((m) => m.task_id === before.task_id)).toMatchObject({ status: 'completed' });
  });

  it('a reviewer hands back: their task waits on the sender, who is told, and they do not sign meanwhile', async () => {
    const docId = await draft('hand-back');
    expect((await ask(docId, ['r1', 'r2'])).status).toBe(200);
    const res = await call('r2', 'post', `/documents/${docId}/review-route/hand-back`, { reason: 'I am on leave for the review window' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const r2 = await memberOf(docId, 'r2');
    expect(r2.status).toBe('blocked');
    expect(r2.route_act_id).not.toBeNull();
    expect(await noticeFor('author', `Handed back by ${names.r2}: ${titleOf('hand-back')}`)).toMatchObject({ category: 'task_update' });
    expect((await reviewSign('r2', docId)).body.code).toBe('ROUTE_HANDED_BACK');
  });

  it('another organization’s member reads no round', async () => {
    const docId = await draft('cross-tenant');
    expect((await ask(docId, ['r1'])).status).toBe(200);
    const res = await call('outsider', 'get', `/documents/${docId}/review-route`);
    expect([403, 404]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toContain(names.r1);
  });
});

describe('grandfathering: a review requested before RR5 keeps today’s loop (§2.13, M1)', () => {
  it('a reviewer with a request row and a task and no route: the verdict completes the task as before, and no route is written', async () => {
    const docId = await draft('legacy');
    await owner.query(`INSERT INTO authoring_reviews (id, doc_id, reviewer_id, reviewer_name, reviewer_email, review_status, requested_by, tenant_id)
      VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)`, [randomUUID(), docId, String(users.r1), names.r1, emails.r1, String(users.author), orgA]);
    await owner.query(`INSERT INTO doc_permissions (doc_id, tenant_id, principal_id, email, role, granted_by)
      VALUES ($1, $2, $3, $4, 'REVIEWER', $5)`, [docId, orgA, String(users.r1), emails.r1, String(users.author)]);
    const taskId = `TASK-RR5-LEGACY-${RUN}`;
    await owner.query(`INSERT INTO unified_tasks (task_id, organization_id, module_type, title, task_type, category, status, assignee_id,
        source_entity_type, source_entity_id, created_by_id)
      VALUES ($1, $2, 'Authoring', 'Review: legacy', 'review', 'review', 'in-progress', $3, 'authoring_document', $4, $5)`,
    [taskId, orgA, users.r1, docId, users.author]);
    const res = await verdict('r1', docId, 'changes_requested', 'The safety narrative needs the 120-day update.');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.tasks.completed).toEqual([taskId]);
    expect(res.body.route).toBeNull();
    expect(await routes(docId)).toEqual([]);
    // Its REVIEWER e-sign is taken as today: there is no route to refuse it.
    expect((await reviewSign('r1', docId)).status).toBe(200);
  });
});
