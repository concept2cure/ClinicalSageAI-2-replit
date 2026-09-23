/**
 * F-6 (VSR-001 §4): a review requested in Authoring must be visible on the
 * Review board — END-TO-END on in-process PostgreSQL (PGlite), through the
 * REAL authoring router and the REAL board route.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Authoring writes `authoring_reviews` / `authoring_workflow_steps`
 * (POST /documents/:id/request-review, POST /docs/:id/submit). The Review board
 * read `document_workflows` / `workflow_approvals` — a second review store no
 * launch surface writes. OQ-AUTH-17b failed: the reviewer was told to look at
 * /concept2cure/review and the review was not there.
 *
 * ── The decision this pins (control tower, 2026-09-21) ───────────────────────
 * The authoring store is canonical. The board READS it; every decision the
 * board records goes through the authoring workflow's OWN transition routes
 * (POST /documents/:id/review), so there is one state machine, not two. The
 * board never signs — §11.50 signatures stay on the authoring e-sign route.
 *
 * Written before the repoint, when every case here failed against the real
 * board: the old read model 500'd on a database that has no document_workflows
 * (this one), and would have returned an empty queue on one that does.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { SignJWT, jwtVerify } from 'jose';
import { randomBytes } from 'node:crypto';
import { createJourneyDb, makeRequestDbClient, type JourneyDb } from '../../../tests/golden-journeys/harness';
import type { RequestDbClient } from '../../middleware/lazyRequestDbClient';
import { AUDIT_LOGS_PGLITE_DDL } from '../../db/pglite-harness';

const JWT_SECRET = randomBytes(32).toString('hex');
process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_SECRET_DEV = JWT_SECRET;

const AUTHOR = { id: '5a1c2a10-0000-4000-8000-000000000001', organizationId: 1, email: 'author@f6.example', name: 'Avery Author' };
const REVIEWER = { id: '5a1c2a10-0000-4000-8000-000000000002', organizationId: 1, email: 'reviewer@f6.example', name: 'Robin Reviewer' };
const BYSTANDER = { id: '5a1c2a10-0000-4000-8000-000000000003', organizationId: 1, email: 'bystander@f6.example', name: 'Blake Bystander' };
const OUTSIDER = { id: '5a1c2a10-0000-4000-8000-000000000099', organizationId: 2, email: 'outsider@other.example', name: 'Iris Intruder' };
type U = typeof AUTHOR;

const PROGRAM_A = 'a0000000-0000-4000-8000-00000000000a';
const PROGRAM_B = 'b0000000-0000-4000-8000-00000000000b';

const PREREQ = `
  ${AUDIT_LOGS_PGLITE_DDL}
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
  CREATE TABLE users (id UUID PRIMARY KEY, name TEXT, email TEXT);
  INSERT INTO organizations (id, name) VALUES (1, 'f6-org'), (2, 'other-org');
  INSERT INTO users (id, name, email) VALUES
    ('${AUTHOR.id}', '${AUTHOR.name}', '${AUTHOR.email}'),
    ('${REVIEWER.id}', '${REVIEWER.name}', '${REVIEWER.email}'),
    ('${BYSTANDER.id}', '${BYSTANDER.name}', '${BYSTANDER.email}'),
    ('${OUTSIDER.id}', '${OUTSIDER.name}', '${OUTSIDER.email}');
  /* The columns the board's program join reads (name, organization_id). */
  CREATE TABLE regulatory_programs (
    id UUID PRIMARY KEY, organization_id INTEGER NOT NULL, name TEXT NOT NULL, code TEXT
  );
  INSERT INTO regulatory_programs (id, organization_id, name, code) VALUES
    ('${PROGRAM_A}', 1, 'IND 12345 — Program A', 'PA'),
    ('${PROGRAM_B}', 1, 'NDA 200100 — Program B', 'PB');
`;

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));

async function mint(u: U) {
  return new SignJWT({ userId: u.id, email: u.email, name: u.name, organizationId: u.organizationId, tenant_id: u.organizationId })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

const T = 180_000;
let jdb: JourneyDb;
let app: express.Express;
const tokens = new Map<string, string>();
const as = (u: U) => (r: request.Test) => r.set('Authorization', `Bearer ${tokens.get(u.id)!}`);

/** What the mounted stack gives the board route: a verified user and the
 *  request-scoped client requestDb/requestPgClient read (`req.dbClient`). */
function boardContext(req: Request, res: Response, next: NextFunction) {
  const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  jwtVerify(token, new TextEncoder().encode(JWT_SECRET))
    .then(({ payload }) => {
      // jwtVerify's payload is Record<string, unknown>; the request user is a
      // narrow shape, so read the claims through it rather than casting each.
      const claims = payload as { userId?: number; email?: string; organizationId?: number };
      (req as Request & { user?: unknown }).user = {
        id: claims.userId, userId: claims.userId, email: claims.email, organizationId: claims.organizationId,
      };
      (req as Request & { dbClient?: unknown }).dbClient = makeRequestDbClient(jdb.pglite) as unknown as RequestDbClient;
      next();
    })
    .catch(() => res.status(401).json({ success: false, error: 'unauthenticated' }));
}

const board = (u: U, qs = '') => as(u)(request(app).get(`/api/review/board${qs}`));
const queueOf = (res: request.Response) => (res.body?.data?.queue ?? []) as Array<Record<string, any>>;

let docA = '';
let docB = '';
let sectionA = '';

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      // The program binding the board filters and labels by (client_program_id).
      'migrations/20260727_authoring_document_program_scope.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
      'db/migrations/20260725_authoring_audit_trail.sql',
      'db/migrations/20260725_authoring_signatures_and_workflow.sql',
      'db/migrations/20260725_authoring_signature_freeze_binding.sql',
      'migrations/20260728_authoring_comments_threading.sql',
      'db/migrations/20260730_authoring_runtime_ddl.sql',
      'db/migrations/20260803_document_span_lineage.sql',
      'migrations/20260907_span_lineage_accepted_machine_draft.sql',
      'migrations/20260908_span_lineage_machine_draft.sql',
      'migrations/20260728_authoring_reviews.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
  for (const u of [AUTHOR, REVIEWER, BYSTANDER, OUTSIDER]) tokens.set(u.id, await mint(u));

  const { default: authoringRouter } = await import('../authoring.router');
  const { default: createReviewBoardRoutes } = await import('../review-board-routes');
  app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/authoring', authoringRouter);
  app.use('/api/review', boardContext, createReviewBoardRoutes());

  const mk = async (title: string, programId: string | null) => {
    const r = await as(AUTHOR)(request(app).post('/api/authoring/docs')).send({ title, module: 'M2', client_program_id: programId });
    expect(r.status).toBe(201);
    return r.body.document.id as string;
  };
  docA = await mk('IND 12345 — Module 2.5 Clinical Overview', PROGRAM_A);
  docB = await mk('NDA 200100 — Module 2.7 Clinical Summary', PROGRAM_B);
  const sec = await as(AUTHOR)(request(app).post('/api/authoring/sections'))
    .send({ doc_id: docA, code: '2.5.1', title: 'Rationale', content: '<p>The pivotal study met its primary endpoint.</p>', order_index: 1 });
  expect(sec.status).toBe(201);
  sectionA = sec.body.section.id;
}, T);

afterAll(async () => { await jdb?.close(); });

describe('a review requested in Authoring reaches the Review board', () => {
  it('before any request: the board is an honest empty queue, not an error', async () => {
    const r = await board(REVIEWER);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data.queue)).toBe(true);
    expect(queueOf(r)).toHaveLength(0);
  }, T);

  it('POST /documents/:id/request-review → the reviewer sees it (scope=mine) and the requester sees it (scope=requested)', async () => {
    const rr = await as(AUTHOR)(request(app).post(`/api/authoring/documents/${docA}/request-review`))
      .send({ reviewers: [{ id: REVIEWER.id, name: REVIEWER.name, email: REVIEWER.email }] });
    expect(rr.status).toBe(200);

    const mine = await board(REVIEWER, '?scope=mine');
    expect(mine.status).toBe(200);
    const row = queueOf(mine).find((q) => q.id === docA);
    expect(row, 'the requested review is not on the reviewer’s board').toBeTruthy();
    expect(row!.doc).toBe('IND 12345 — Module 2.5 Clinical Overview');
    expect(row!.awaitingMyReview).toBe(true);
    expect(row!.mine).toBe(true);
    expect(row!.state).toBe('in-review');
    expect(row!.prog).toBe('IND 12345 — Program A');
    expect(row!.reviews).toHaveLength(1);
    expect(row!.reviews[0]).toMatchObject({ reviewerEmail: REVIEWER.email, status: 'pending', requestedBy: AUTHOR.email });

    const requested = await board(AUTHOR, '?scope=requested');
    const mineAsAuthor = queueOf(requested).find((q) => q.id === docA);
    expect(mineAsAuthor, 'the requester cannot see the review they asked for').toBeTruthy();
    expect(mineAsAuthor!.requestedByMe).toBe(true);
    expect(mineAsAuthor!.awaitingMyReview).toBe(false);

    // A colleague who neither asked nor was asked sees it under "all open"
    // (it is the organisation's open review work) but owns nothing on it.
    const all = await board(BYSTANDER);
    const seen = queueOf(all).find((q) => q.id === docA);
    expect(seen).toBeTruthy();
    expect(seen!.mine).toBe(false);
    expect(queueOf(await board(BYSTANDER, '?scope=mine'))).toHaveLength(0);
  }, T);

  it('the passage under review is the document’s own first section, and the thread is its comments', async () => {
    const c = await as(REVIEWER)(request(app).post(`/api/authoring/sections/${sectionA}/comment`))
      .send({ body: 'Please cite the stability data here.', doc_id: docA });
    expect(c.status).toBe(201);

    const r = await board(REVIEWER, `?itemId=${docA}`);
    const row = queueOf(r).find((q) => q.id === docA)!;
    expect(row.passage).toContain('The pivotal study met its primary endpoint.');
    expect(row.passage).not.toContain('<p>');
    expect(row.firstSectionId).toBe(sectionA);
    expect(row.comments).toBe(1);
    expect(r.body.data.meta.threadItemId).toBe(docA);
    const thread = r.body.data.thread as Array<Record<string, any>>;
    expect(thread).toHaveLength(1);
    expect(thread[0]).toMatchObject({ body: 'Please cite the stability data here.', state: 'open', sectionId: sectionA, author: REVIEWER.email });
  }, T);

  it('another tenant never sees it', async () => {
    const r = await board(OUTSIDER);
    expect(r.status).toBe(200);
    expect(queueOf(r)).toHaveLength(0);
    expect(queueOf(await board(OUTSIDER, `?itemId=${docA}`))).toHaveLength(0);
  }, T);

  it('filters by program, and refuses a program id that is not one', async () => {
    await as(AUTHOR)(request(app).post(`/api/authoring/documents/${docB}/request-review`))
      .send({ reviewers: [{ id: REVIEWER.id, name: REVIEWER.name, email: REVIEWER.email }] });
    const all = queueOf(await board(REVIEWER)).map((q) => q.id);
    expect(all).toEqual(expect.arrayContaining([docA, docB]));
    const onlyA = queueOf(await board(REVIEWER, `?programId=${PROGRAM_A}`)).map((q) => q.id);
    expect(onlyA).toEqual([docA]);
    expect((await board(REVIEWER, '?programId=not-a-uuid')).status).toBe(400);
  }, T);
});

describe('a decision on the board is the authoring workflow’s own transition', () => {
  it('POST /documents/:id/review {changes_requested} → the board row changes state, and the act is in the authoring audit trail', async () => {
    const d = await as(REVIEWER)(request(app).post(`/api/authoring/documents/${docA}/review`))
      .send({ review_status: 'changes_requested', review_comments: 'State the software version in §2.5.1.' });
    expect(d.status).toBe(200);

    const row = queueOf(await board(REVIEWER)).find((q) => q.id === docA)!;
    expect(row.state).toBe('changes-requested');
    expect(row.awaitingMyReview).toBe(false);
    expect(row.myReviewStatus).toBe('changes_requested');
    expect(row.reviews[0]).toMatchObject({ status: 'changes_requested', comments: 'State the software version in §2.5.1.' });

    const audit = await as(AUTHOR)(request(app).get(`/api/authoring/docs/${docA}/audit`));
    const ev = (audit.body.events as Array<Record<string, any>>).find((e) => e.event_type === 'document_reviewed');
    expect(ev, 'the decision is not audited').toBeTruthy();
    expect(ev!.actor).toBe(REVIEWER.email);
  }, T);

  it('re-requesting after changes puts it back on the reviewer’s queue; approving takes it off', async () => {
    await as(AUTHOR)(request(app).post(`/api/authoring/documents/${docA}/request-review`))
      .send({ reviewers: [{ id: REVIEWER.id, name: REVIEWER.name, email: REVIEWER.email }] });
    // The upsert refreshes requested_at/requested_by but keeps the verdict —
    // that is the authoring store's own rule; the board reports what it holds.
    const after = queueOf(await board(AUTHOR, '?scope=requested')).find((q) => q.id === docA);
    expect(after).toBeTruthy();
    expect(after!.awaitingMyReview).toBe(false);
    expect(queueOf(await board(REVIEWER, '?scope=mine')).find((q) => q.id === docA)).toBeUndefined();

    const ok = await as(REVIEWER)(request(app).post(`/api/authoring/documents/${docA}/review`))
      .send({ review_status: 'approved', review_comments: 'Software version stated.' });
    expect(ok.status).toBe(200);
    const row = queueOf(await board(AUTHOR, '?scope=requested')).find((q) => q.id === docA)!;
    expect(row.state).toBe('approved');
    // Nothing pending on it any more → it is not open work for anyone.
    expect(queueOf(await board(REVIEWER, '?scope=mine')).find((q) => q.id === docA)).toBeUndefined();
    expect(queueOf(await board(BYSTANDER)).find((q) => q.id === docA)).toBeUndefined();
  }, T);
});

describe('the approval chain (authoring_workflow_steps) is shown, owned, and never signed from the board', () => {
  it('POST /docs/:id/submit → the step is the board’s workflow, current and at the approver’s sign-off', async () => {
    const sub = await as(AUTHOR)(request(app).post(`/api/authoring/docs/${docB}/submit`))
      .send({ workflow_steps: [{ role: 'QA', approver_email: REVIEWER.email }, { role: 'RA_CMC', approver_email: AUTHOR.email }] });
    expect(sub.status).toBe(200);

    const r = await board(REVIEWER, '?scope=mine');
    const row = queueOf(r).find((q) => q.id === docB)!;
    expect(row.atMySignOff).toBe(true);
    expect(row.docStatus).toBe('IN_REVIEW');
    const wf = r.body.data.workflows[docB];
    expect(wf.templateId).toBe(sub.body.workflowId);
    expect(wf.steps).toHaveLength(2);
    expect(wf.steps[0]).toMatchObject({ order: 1, name: 'QA', approver: REVIEWER.email, requiredActions: ['sign'], status: 'current' });
    expect(wf.steps[1]).toMatchObject({ order: 2, name: 'RA_CMC', status: 'pending' });

    // The author owns step 2, which is not current: not "at your sign-off" yet,
    // so the document is not in the author's "mine" scope — only in "requested".
    expect(queueOf(await board(AUTHOR, '?scope=mine')).find((q) => q.id === docB)).toBeUndefined();
    const asAuthor = queueOf(await board(AUTHOR, '?scope=requested')).find((q) => q.id === docB)!;
    expect(asAuthor.atMySignOff).toBe(false);
    expect(asAuthor.requestedByMe).toBe(true);
  }, T);
});
