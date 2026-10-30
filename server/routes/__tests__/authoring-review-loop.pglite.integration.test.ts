/**
 * The review loop closes on the server (wave 2D; outside-file requests D and E
 * of wave 2C, docs/evidence/D2-ONE-ANA/2026-10-08/ana-2d-review-loop-closes/).
 *
 * The REAL authoring router over HTTP (supertest, real signed JWTs) on
 * in-process Postgres (PGlite), with the real task tables, the real tasking
 * services (state machine, unifiedTaskService, completion cascade, task-audit)
 * and the real governed ledger (recordGovernedAction → audit_logs +
 * c2c_ana_actions). Only the notification service is replaced, to observe it.
 *
 *   E. A reviewer's verdict (POST /documents/:id/review) completes that
 *      reviewer's open review task on that document, through the tasking
 *      path's audited transition, on the verdict's own transaction. Before, the
 *      verdict and the task were two records nothing joined: the task stayed
 *      open after the verdict, and the Tasks rail could only say so.
 *   D. Asking a reviewer again (POST /documents/:id/request-review) reopens
 *      their recorded verdict: the row is pending again. Before, ON CONFLICT
 *      refreshed requested_at only, so a change request stayed the current
 *      verdict and "revise and ask again" could not be done. The earlier
 *      verdict stays in its own document_reviewed audit row.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { AUTHORING_REVIEW_BINDING_BASIS, authoringReviewReadSchema } from '@shared/authoring/peer-review';

import { createJourneyDb, extractTableDdl, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { GOVERNED_ACTION_LEDGER_PGLITE_DDL } from '../../services/ana-ri/__tests__/governed-action-ledger.fixture';
import { PREREQ, AUTHORING_ACCESS_DDL, AUTHOR, PROGRAM, ORG, OTHER_ORG, mint, makeApp, asToken } from './_authoring-canvas-fixture';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown, notified: [] as unknown[] }));
vi.mock('../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));
vi.mock('../../services/notifications/notification-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/notifications/notification-service')>()),
  createNotification: async (input: unknown) => {
    h.notified.push(input);
    return 1;
  },
}));

const T = 180_000;
const REVIEWER = { id: '21', organizationId: ORG, email: 'reviewer@canvas.example', name: 'Robin Reviewer' };
const OTHER_REVIEWER = { id: '22', organizationId: ORG, email: 'second@canvas.example', name: 'Sam Second' };
const WHY = 'Section 2.5.4 cites the wrong SAP version.';

let jdb: JourneyDb;
let app: express.Express;
let authoringRouter: express.Router;
let author: (r: request.Test) => request.Test;
let reviewer: (r: request.Test) => request.Test;

type Row = Record<string, any>;
async function rows<R = Row>(sql: string, params: unknown[] = []): Promise<R[]> {
  return (await jdb.pool.query(sql, params)).rows as R[];
}

async function seedDoc(): Promise<string> {
  const docId = randomUUID();
  await jdb.pool.query(
    `INSERT INTO authoring_documents (id, title, module, status, created_by, tenant_id, client_program_id, version)
     VALUES ($1, $2, 'M2', 'draft', $3, $4, $5, '0.4')`,
    [docId, `Module 2.5 — review loop ${docId.slice(0, 8)}`, AUTHOR.id, ORG, PROGRAM],
  );
  return docId;
}

/** A unified task as SendForReviewDialog.tsx creates a review task (buildReviewTaskBody). */
async function seedTask(taskId: string, over: Partial<Record<string, unknown>> & { docId: string }) {
  const t = {
    status: 'pending', assignee: Number(REVIEWER.id), taskType: 'review', approvalRequired: false,
    org: ORG, deletedAt: null as string | null, ...over,
  };
  await jdb.pool.query(
    `INSERT INTO unified_tasks
       (task_id, organization_id, module_type, title, task_type, category, status, assignee_id,
        source_entity_type, source_entity_id, approval_required, created_by_id, deleted_at)
     VALUES ($1, $2, 'Authoring', $3, $4, 'review', $5, $6, 'authoring_document', $7, $8, $9, $10)`,
    [taskId, t.org, `Review: ${t.docId.slice(0, 8)}`, t.taskType, t.status, t.assignee, t.docId, t.approvalRequired, Number(AUTHOR.id), t.deletedAt],
  );
}

/**
 * The notices after the request: since RR5 the request itself tells each
 * reviewer (task_assigned, on their route task), so what a verdict sends is
 * read without those.
 */
const afterRequest = () => h.notified.filter((n) => (n as { category?: string }).category !== 'task_assigned');

const taskOf = async (taskId: string) =>
  (await rows(`SELECT status, completed_at, last_modified_by, progress FROM unified_tasks WHERE task_id = $1`, [taskId]))[0];

/** The governed ledger's task.transition rows for a task, in the order written. */
const transitionsOf = async (taskId: string) =>
  rows<{ payload: Row; proposed_by: number }>(
    `SELECT a.payload, a.proposed_by FROM c2c_ana_actions a
       JOIN audit_logs l ON l.ana_action_id = a.id
      WHERE a.command = 'task.transition' AND a.target = $1
      ORDER BY l.chain_seq`,
    [`task:${taskId}`],
  );

const verdict = async (docId: string, body: Record<string, unknown>, as = reviewer) =>
  as(request(app).post(`/api/authoring/documents/${docId}/review`)).send({
    ...body, expected: body.expected ?? await expectedRead(docId, as),
  });
/** RR5: a request names the route's review due date, and its reviewers hold signing authority (docs/design/REVIEW_ROUTING_2026-10-23.md). */
const REVIEW_DUE = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
const ask = (docId: string, people = [REVIEWER]) =>
  author(request(app).post(`/api/authoring/documents/${docId}/request-review`)).send({
    reviewers: people.map(p => ({ id: p.id, name: p.name })),
    reason: 'Ready for medical review before the pre-IND package.',
    route: { reviewDueDate: REVIEW_DUE },
  });

/** A structurally valid expected basis also reaches the old route, which ignores it. */
async function expectedRead(docId: string, as = reviewer) {
  const read = await as(request(app).get(`/api/authoring/documents/${docId}/reviews`));
  const context = read.body.reviewContext;
  return {
    reviewId: context?.myReview?.reviewId ?? randomUUID(),
    requestedAt: context?.myReview?.requestedAt ?? new Date().toISOString(),
    snapshotHash: context?.snapshotHash ?? '0'.repeat(64),
    bindingBasis: AUTHORING_REVIEW_BINDING_BASIS,
  };
}

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: `${PREREQ}\n${AUTHORING_ACCESS_DDL}
      ALTER TABLE organizations ADD COLUMN payment_status text NOT NULL DEFAULT 'active';
      ${extractTableDdl('migrations/0000_sweet_joseph.sql', ['unified_tasks', 'task_dependencies', 'cross_module_task_links'])}`,
    migrations: [
      // The authoring subsystem unit, in the durable applier's order.
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'migrations/20260727_authoring_document_program_scope.sql',
      'db/migrations/20260725_authoring_audit_trail.sql',
      'db/migrations/20260725_authoring_signatures_and_workflow.sql',
      'db/migrations/20260725_authoring_signature_freeze_binding.sql',
      'db/migrations/20260727_authoring_object_permissions.sql',
      'db/migrations/20260730_authoring_runtime_ddl.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
      'db/migrations/20260730_authoring_subsystem_schema.sql',
      'migrations/20260921_audit_logs_chain_seq.sql',
      'db/migrations/20260813_audit_tamper_proof_log.sql',
      // The task tables as deployed: the baseline (above) and what extended it.
      'db/migrations/20260727_unified_tasks_mdx_metadata.sql',
      'db/migrations/20260807_task_graph_org_columns.sql',
      'db/migrations/20260807_unified_tasks_soft_delete.sql',
      // The review route columns the Drizzle model names (RR1a).
      'migrations/20261023_review_routes.sql',
    ],
    testOnlySql: `
      ${GOVERNED_ACTION_LEDGER_PGLITE_DDL}
      -- The ledger is created here, after the routes migration ran, so its grant to the route writer (P-59) is given here, as the migration gives it where the ledger already exists.
      GRANT SELECT ON c2c_ana_actions TO review_route_writer;
      INSERT INTO users (id, name, email) VALUES
        (${REVIEWER.id}, '${REVIEWER.name}', '${REVIEWER.email}'),
        (${OTHER_REVIEWER.id}, '${OTHER_REVIEWER.name}', '${OTHER_REVIEWER.email}');
      -- RR5: a reviewer named on the review route holds signing authority (the route's member validator), and reaches the program's project.
      INSERT INTO organization_users (organization_id, user_id, role) VALUES
        (${ORG}, ${REVIEWER.id}, 'reviewer'),
        (${ORG}, ${OTHER_REVIEWER.id}, 'reviewer');
      INSERT INTO project_members (project_id, organization_id, user_id, role, status) VALUES
        (42, ${ORG}, ${REVIEWER.id}, 'edit', 'active'), (42, ${ORG}, ${OTHER_REVIEWER.id}, 'edit', 'active');
      CREATE TABLE IF NOT EXISTS notification_preferences (id serial PRIMARY KEY, user_id integer, timezone text);
    `,
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
  author = asToken(await mint(AUTHOR));
  reviewer = asToken(await mint(REVIEWER));
  const { default: router } = await import('../authoring.router');
  authoringRouter = router;
  const pinned = express.Router();
  pinned.use((req, _res, next) => {
    req.dbClient = { query: async (text: string, params?: unknown[]) => jdb.pool.query(text, params) } as typeof req.dbClient;
    next();
  });
  pinned.use(router);
  app = makeApp(pinned);
}, T);

afterAll(async () => {
  await jdb?.close();
});

beforeEach(() => {
  h.notified = [];
});

describe('bound human review — old native-route security regressions', () => {
  it('refuses an unassigned direct verdict without creating a review or audit', async () => {
    const docId = await seedDoc();
    await jdb.pool.query(`INSERT INTO doc_permissions (doc_id, tenant_id, principal_id, email, role, granted_by)
      VALUES ($1, $2, $3, $4, 'REVIEWER', $5)`, [docId, ORG, REVIEWER.id, REVIEWER.email, AUTHOR.id]);
    const res = await verdict(docId, { review_status: 'approved', expected: await expectedRead(docId) });
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(await rows('SELECT 1 FROM authoring_reviews WHERE doc_id = $1', [docId])).toEqual([]);
    expect(await rows("SELECT 1 FROM authoring_audit_trail WHERE doc_id = $1 AND operation_type = 'document_reviewed'", [docId])).toEqual([]);
  }, T);

  it('refuses an original author deciding their own document directly', async () => {
    const docId = await seedDoc();
    const res = await verdict(docId, { review_status: 'approved', expected: await expectedRead(docId, author) }, author);
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(await rows('SELECT 1 FROM authoring_reviews WHERE doc_id = $1', [docId])).toEqual([]);
  }, T);

  it('returns complete bound context and does not count a legacy unbound approval as current', async () => {
    const docId = await seedDoc();
    const sectionIds = [randomUUID(), randomUUID()];
    await jdb.pool.query(`INSERT INTO doc_permissions (doc_id, tenant_id, principal_id, email, role, granted_by)
      VALUES ($1, $2, $3, $4, 'REVIEWER', $5)`, [docId, ORG, REVIEWER.id, REVIEWER.email, AUTHOR.id]);
    for (const [index, id] of sectionIds.entries()) {
      await jdb.pool.query(`INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, docId, `2.5.${index + 1}`, `Section ${index + 1}`, `<p>Complete saved section ${index + 1}.</p>`, index, ORG]);
    }
    await jdb.pool.query(`INSERT INTO authoring_reviews
      (id, doc_id, reviewer_id, reviewer_name, reviewer_email, review_status, requested_by, reviewed_at, tenant_id)
      VALUES ($1, $2, $3, $4, $5, 'approved', $6, NOW(), $7)`,
    [randomUUID(), docId, REVIEWER.id, REVIEWER.name, REVIEWER.email, AUTHOR.email, ORG]);
    const read = await reviewer(request(app).get(`/api/authoring/documents/${docId}/reviews`));
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    expect(authoringReviewReadSchema.safeParse(read.body).success).toBe(true);
    expect(read.body.reviewContext.snapshot.sections.map((section: { id: string }) => section.id)).toEqual(sectionIds);
    expect(read.body.stats).toMatchObject({ approved: 0, unbound: 1 });
    expect(read.body.canApprove).toBe(false);
    expect(read.body.reviews[0]).toMatchObject({ review_status: 'approved', standing: 'unbound', reviewed_snapshot: null });
    const upper = await reviewer(request(app).get(`/api/authoring/documents/${docId.toUpperCase()}/reviews`));
    expect(upper.status).toBe(200);
    expect(upper.body.reviewContext).toMatchObject({ documentId: docId,
      snapshot: read.body.reviewContext.snapshot, snapshotHash: read.body.reviewContext.snapshotHash });
  }, T);

  it('resolves reviewer names and emails from actual membership instead of the supplied label', async () => {
    const docId = await seedDoc();
    const res = await author(request(app).post(`/api/authoring/documents/${docId}/request-review`)).send({
      reviewers: [{ id: REVIEWER.id, name: 'Forged display label', email: OTHER_REVIEWER.email }],
      reason: 'Request the actual assigned reviewer.',
      route: { reviewDueDate: REVIEW_DUE },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.reviews[0]).toMatchObject({ reviewer_id: REVIEWER.id, reviewer_name: REVIEWER.name, reviewer_email: REVIEWER.email });
  }, T);
});

describe('a native heading-only writer remains a protected contributor', () => {
  it('refuses the actual secondary title writer at request and verdict gates without changing the original author', async () => {
    const docId = await seedDoc(); const sectionId = randomUUID();
    const secondary = asToken(await mint(OTHER_REVIEWER));
    await jdb.pool.query(`INSERT INTO authoring_sections (id,doc_id,tenant_id,code,title,content)
      VALUES ($1,$2,$3,'2.5.1','Original heading','<p>Original saved body.</p>')`, [sectionId, docId, ORG]);
    await jdb.pool.query(`INSERT INTO doc_revisions (id,section_id,content,created_by,tenant_id)
      VALUES ($1,$2,'<p>Original saved body.</p>',$3,$4)`, [randomUUID(), sectionId, AUTHOR.id, ORG]);
    await jdb.pool.query(`INSERT INTO doc_permissions (doc_id,tenant_id,principal_id,email,role,granted_by)
      VALUES ($1,$2,$3,$4,'AUTHOR',$5)`, [docId, ORG, OTHER_REVIEWER.id, OTHER_REVIEWER.email, AUTHOR.id]);
    const previous = process.env.AUTH_ENFORCE_SECTION_PERMS;
    process.env.AUTH_ENFORCE_SECTION_PERMS = '1';
    let changed: request.Response;
    try {
      changed = await secondary(request(app).patch(`/api/authoring/sections/${sectionId}`))
        .send({ title: 'Secondary writer authored heading' });
    } finally {
      if (previous === undefined) delete process.env.AUTH_ENFORCE_SECTION_PERMS;
      else process.env.AUTH_ENFORCE_SECTION_PERMS = previous;
    }
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(await rows('SELECT title,content FROM authoring_sections WHERE id=$1', [sectionId]))
      .toEqual([{ title: 'Secondary writer authored heading', content: '<p>Original saved body.</p>' }]);
    expect(await rows('SELECT created_by FROM authoring_documents WHERE id=$1', [docId])).toEqual([{ created_by: AUTHOR.id }]);
    expect(await rows('SELECT DISTINCT created_by FROM doc_revisions WHERE section_id=$1', [sectionId])).toEqual([{ created_by: AUTHOR.id }]);
    expect((await rows("SELECT actor_id,metadata FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='RENAME'", [docId]))[0])
      .toMatchObject({ actor_id: OTHER_REVIEWER.id, metadata: { source: 'section-metadata', changes: [
        { field: 'title', from: 'Original heading', to: 'Secondary writer authored heading' },
      ] } });
    expect(await rows("SELECT user_id FROM audit_logs WHERE action='authoring.section.RENAME' AND record_id=$1", [sectionId]))
      .toEqual([{ user_id: Number(OTHER_REVIEWER.id) }]);
    const requested = await ask(docId, [OTHER_REVIEWER]);
    expect(requested.status, JSON.stringify(requested.body)).toBe(409);
    expect(requested.body.error).toMatchObject({ code: 'REVIEWER_IS_AUTHOR' });
    expect(await rows('SELECT 1 FROM authoring_reviews WHERE doc_id=$1', [docId])).toEqual([]);
    // A historical assignment cannot grant independence after this edit.
    await jdb.pool.query(`INSERT INTO authoring_reviews (id,doc_id,reviewer_id,review_status,requested_by,tenant_id)
      VALUES ($1,$2,$3,'pending',$4,$5)`, [randomUUID(), docId, OTHER_REVIEWER.id, AUTHOR.id, ORG]);
    await jdb.pool.query(`INSERT INTO doc_permissions (doc_id,tenant_id,principal_id,email,role,granted_by)
      VALUES ($1,$2,$3,$4,'REVIEWER',$5)`, [docId, ORG, OTHER_REVIEWER.id, OTHER_REVIEWER.email, AUTHOR.id]);
    await seedTask('TASK-HEADING-WRITER', { docId, status: 'in-progress', assignee: Number(OTHER_REVIEWER.id) });
    const read = await secondary(request(app).get(`/api/authoring/documents/${docId}/reviews`));
    expect(read.status).toBe(200);
    expect(read.body.reviewContext.canReview).toBe(false);
    expect(read.body.reviewContext.snapshot.sections[0].title).toBe('Secondary writer authored heading');
    const refused = await verdict(docId, { review_status: 'approved' }, secondary);
    expect(refused.status).toBe(403);
    expect(refused.body.error).toMatchObject({ code: 'REVIEWER_IS_AUTHOR' });
    expect((await taskOf('TASK-HEADING-WRITER')).status).toBe('in-progress');
    expect(await transitionsOf('TASK-HEADING-WRITER')).toEqual([]);
    expect((await rows('SELECT review_status,reviewed_snapshot_hash FROM authoring_reviews WHERE doc_id=$1', [docId]))[0])
      .toEqual({ review_status: 'pending', reviewed_snapshot_hash: null });
    expect(await rows("SELECT 1 FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='document_reviewed'", [docId])).toEqual([]);
    expect(h.notified).toEqual([]);
  }, T);
});

describe('E — the verdict completes the reviewer’s review task on the same transaction', () => {
  it('an in-progress review task is completed, with its task.transition row naming the verdict', async () => {
    const docId = await seedDoc();
    expect((await ask(docId)).status).toBe(200);
    await seedTask('TASK-E1', { docId, status: 'in-progress' });

    const res = await verdict(docId, { review_status: 'approved' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    expect(await taskOf('TASK-E1')).toMatchObject({ status: 'completed', last_modified_by: Number(REVIEWER.id), progress: 100 });
    expect((await taskOf('TASK-E1')).completed_at).not.toBeNull();
    const ledger = await transitionsOf('TASK-E1');
    expect(ledger).toHaveLength(1);
    expect(ledger[0].proposed_by).toBe(Number(REVIEWER.id));
    expect(ledger[0].payload).toMatchObject({
      from: 'in-progress', to: 'completed', cause: 'review-verdict', verdict: 'approved', docId,
      reviewId: res.body.review.id, summary: 'Completed by the reviewer’s verdict on the document',
    });
    expect(res.body.tasks).toEqual({ completed: ['TASK-E1'], leftOpen: [] });
    // The person who sent it is told, once the verdict has committed.
    expect(afterRequest()).toEqual([expect.objectContaining({ recipientUserId: Number(AUTHOR.id), category: 'task_completed', resourceId: 'TASK-E1' })]);
  }, T);

  it('a pending review task is started, then completed: two legal moves, two ledger rows, the reviewer’s reason on each', async () => {
    const docId = await seedDoc();
    expect((await ask(docId)).status).toBe(200);
    await seedTask('TASK-E2', { docId, status: 'pending' });

    const res = await verdict(docId, { review_status: 'changes_requested', review_comments: WHY });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    expect((await taskOf('TASK-E2')).status).toBe('completed');
    const ledger = await transitionsOf('TASK-E2');
    expect(ledger.map(r => [r.payload.from, r.payload.to])).toEqual([['pending', 'in-progress'], ['in-progress', 'completed']]);
    expect(ledger.every(r => r.payload.verdict === 'changes_requested')).toBe(true);
    const reasons = await rows<{ reason: string | null }>(
      `SELECT l.reason FROM audit_logs l JOIN c2c_ana_actions a ON a.id = l.ana_action_id
        WHERE a.target = 'task:TASK-E2' ORDER BY l.chain_seq`,
    );
    expect(reasons.map(r => r.reason)).toEqual([WHY, WHY]);
  }, T);

  it('only this reviewer’s open review task on this document moves', async () => {
    const docId = await seedDoc();
    expect((await ask(docId)).status).toBe(200);
    const otherDoc = await seedDoc();
    await seedTask('TASK-MINE', { docId, status: 'in-progress' });
    await seedTask('TASK-THEIRS', { docId, status: 'in-progress', assignee: Number(OTHER_REVIEWER.id) });
    await seedTask('TASK-ELSEWHERE', { docId: otherDoc, status: 'in-progress' });
    await seedTask('TASK-NOT-REVIEW', { docId, status: 'in-progress', taskType: 'action' });
    await seedTask('TASK-ARCHIVED', { docId, status: 'in-progress', deletedAt: '2026-10-01T00:00:00Z' });
    await seedTask('TASK-OTHER-ORG', { docId, status: 'in-progress', org: OTHER_ORG });

    const res = await verdict(docId, { review_status: 'approved' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    expect((await taskOf('TASK-MINE')).status).toBe('completed');
    for (const id of ['TASK-THEIRS', 'TASK-ELSEWHERE', 'TASK-NOT-REVIEW', 'TASK-ARCHIVED', 'TASK-OTHER-ORG']) {
      expect((await taskOf(id)).status, id).toBe('in-progress');
      expect(await transitionsOf(id), id).toEqual([]);
    }
  }, T);

  it('an approval-gated task is left open: completing it is the reviewer’s signature, which a verdict is not', async () => {
    const docId = await seedDoc();
    expect((await ask(docId)).status).toBe(200);
    await seedTask('TASK-GATED', { docId, status: 'in-progress', approvalRequired: true });

    const res = await verdict(docId, { review_status: 'approved' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    expect((await taskOf('TASK-GATED')).status).toBe('in-progress');
    expect(await transitionsOf('TASK-GATED')).toEqual([]);
    expect(res.body.tasks).toEqual({ completed: [], leftOpen: [{ taskId: 'TASK-GATED', why: 'signature-required' }] });
  }, T);

});

describe('E — dependency and atomic rollback guards', () => {
  it('a blocked dependent review stays open while its unfinished predecessor is retained', async () => {
    const docId = await seedDoc();
    expect((await ask(docId)).status).toBe(200);
    await seedTask('TASK-PREDECESSOR', { docId, status: 'in-progress', taskType: 'action' });
    await seedTask('TASK-DEPENDENT', { docId, status: 'blocked' });
    await jdb.pool.query(`INSERT INTO task_dependencies
      (dependency_id,predecessor_task_id,successor_task_id,dependency_type,organization_id)
      VALUES ($1,$2,$3,'finish-to-start',$4)`, ['DEP-REVIEW-LOOP', 'TASK-PREDECESSOR', 'TASK-DEPENDENT', ORG]);
    const res = await verdict(docId, { review_status: 'approved' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.tasks).toEqual({ completed: [], leftOpen: [{ taskId: 'TASK-DEPENDENT', why: 'blocked' }] });
    expect((await taskOf('TASK-DEPENDENT')).status).toBe('blocked');
    expect((await taskOf('TASK-PREDECESSOR')).status).toBe('in-progress');
    expect(await transitionsOf('TASK-DEPENDENT')).toEqual([]);
    expect(await transitionsOf('TASK-PREDECESSOR')).toEqual([]);
  }, T);

  it('a verdict with no review task is recorded exactly as before', async () => {
    const docId = await seedDoc();
    expect((await ask(docId)).status).toBe(200);
    const res = await verdict(docId, { review_status: 'approved' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.review).toMatchObject({ doc_id: docId, reviewer_id: REVIEWER.id, review_status: 'approved' });
    expect(await rows(`SELECT 1 FROM c2c_ana_actions WHERE command = 'task.transition'
                         AND payload->>'docId' = $1`, [docId])).toEqual([]);
  }, T);

  it('the verdict and the task cannot disagree: when the task’s ledger row cannot be written, neither is recorded', async () => {
    const docId = await seedDoc();
    expect((await ask(docId)).status).toBe(200);
    await seedTask('TASK-ATOMIC', { docId, status: 'in-progress' });
    await jdb.pglite.exec('ALTER TABLE c2c_ana_actions RENAME TO c2c_ana_actions_down');
    let res: request.Response;
    try {
      res = await verdict(docId, { review_status: 'changes_requested', review_comments: WHY });
    } finally {
      await jdb.pglite.exec('ALTER TABLE c2c_ana_actions_down RENAME TO c2c_ana_actions');
    }
    expect(res.status, JSON.stringify(res.body)).toBe(503);
    expect(res.body.error).toMatchObject({ code: 'REVIEW_UNAVAILABLE' });
    expect(JSON.stringify(res.body)).not.toContain('c2c_ana_actions');
    expect((await taskOf('TASK-ATOMIC')).status).toBe('in-progress');
    expect(await rows(`SELECT review_status, reviewed_snapshot, reviewed_snapshot_hash FROM authoring_reviews WHERE doc_id = $1`, [docId])).toEqual([{ review_status: 'pending', reviewed_snapshot: null, reviewed_snapshot_hash: null }]);
    expect(await rows(`SELECT 1 FROM authoring_audit_trail WHERE doc_id = $1 AND operation_type = 'document_reviewed'`, [docId])).toEqual([]);
    expect(afterRequest()).toEqual([]);
  }, T);
});

describe('D — asking a reviewer again reopens their recorded verdict', () => {
  it('the row is pending again, with no verdict time and no comments', async () => {
    const docId = await seedDoc();
    expect((await ask(docId)).status).toBe(200);
    const decided = await verdict(docId, { review_status: 'changes_requested', review_comments: WHY });
    expect(decided.status).toBe(200);

    const again = await ask(docId);
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect(again.body.reviews).toEqual([expect.objectContaining({ reviewer_id: REVIEWER.id, review_status: 'pending', reviewed_at: null, review_comments: null })]);
    expect(again.body.reviews[0].id).not.toBe(decided.body.review.id);

    const read = await author(request(app).get(`/api/authoring/documents/${docId}/reviews`));
    expect(read.status).toBe(200);
    expect(read.body.reviews).toEqual([expect.objectContaining({ reviewer_id: REVIEWER.id, review_status: 'pending', reviewed_at: null, review_comments: null })]);
    expect(read.body.stats).toMatchObject({ total: 1, pending: 1, changes_requested: 0 });
  }, T);

  it('the earlier verdict stays in its document_reviewed audit row, untouched, and the new request names it', async () => {
    const docId = await seedDoc();
    await ask(docId);
    const decided = await verdict(docId, { review_status: 'changes_requested', review_comments: WHY });
    const trailOf = (op: string) => rows(
      `SELECT id, actor_id, change_reason, metadata, created_at FROM authoring_audit_trail
        WHERE doc_id = $1 AND operation_type = $2 ORDER BY created_at, id`, [docId, op]);
    const before = await trailOf('document_reviewed');
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ actor_id: REVIEWER.id, change_reason: WHY, metadata: { review_status: 'changes_requested', review_comments: WHY } });

    await ask(docId);

    expect(await trailOf('document_reviewed')).toEqual(before);
    const requests = await trailOf('review_requested');
    expect(requests).toHaveLength(2);
    expect(requests[0].metadata.reopenedVerdicts).toEqual([]);
    expect(requests[1].metadata.reopenedVerdicts).toEqual([
      expect.objectContaining({ reviewId: decided.body.review.id, reviewerId: REVIEWER.id, verdict: 'changes_requested', reviewedAt: expect.any(String) }),
    ]);
  }, T);

  it('the whole loop: change request closes the first task, a new request opens the review again, approval closes the second', async () => {
    const docId = await seedDoc();
    await ask(docId);
    await seedTask('TASK-ROUND-1', { docId, status: 'pending' });
    await verdict(docId, { review_status: 'changes_requested', review_comments: WHY });
    expect((await taskOf('TASK-ROUND-1')).status).toBe('completed');

    expect((await ask(docId)).body.reviews[0].review_status).toBe('pending');
    await seedTask('TASK-ROUND-2', { docId, status: 'pending' });
    const approved = await verdict(docId, { review_status: 'approved' });
    expect(approved.status).toBe(200);
    expect(approved.body.tasks.completed).toEqual(['TASK-ROUND-2']);
    expect((await taskOf('TASK-ROUND-2')).status).toBe('completed');
    expect((await transitionsOf('TASK-ROUND-1')).map(r => r.payload.verdict)).toEqual(['changes_requested', 'changes_requested']);
    expect(await rows(`SELECT review_status FROM authoring_reviews WHERE doc_id = $1`, [docId])).toEqual([{ review_status: 'approved' }]);
  }, T);
});

describe('request connection and uncertain commit remain honest at the native boundary', () => {
  it('refuses a missing request database client while the shared pool is healthy', async () => {
    const docId = await seedDoc(); expect((await ask(docId)).status).toBe(200);
    await seedTask('TASK-NO-REQUEST-CLIENT', { docId, status: 'in-progress' });
    const captured = await expectedRead(docId);
    const unpinned = makeApp(authoringRouter);
    const res = await reviewer(request(unpinned).post(`/api/authoring/documents/${docId}/review`))
      .send({ review_status: 'approved', expected: captured });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatchObject({ code: 'REVIEW_UNAVAILABLE' });
    expect(await rows('SELECT 1 AS healthy')).toEqual([{ healthy: 1 }]);
    expect((await taskOf('TASK-NO-REQUEST-CLIENT')).status).toBe('in-progress');
    expect(await transitionsOf('TASK-NO-REQUEST-CLIENT')).toEqual([]);
    expect((await rows('SELECT review_status,reviewed_snapshot_hash FROM authoring_reviews WHERE doc_id=$1', [docId]))[0])
      .toEqual({ review_status: 'pending', reviewed_snapshot_hash: null });
    expect(await rows("SELECT 1 FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='document_reviewed'", [docId])).toEqual([]);
    expect(afterRequest()).toEqual([]);
  }, T);

  it('reports an uncertain COMMIT safely without notifying, even when that commit reached Postgres', async () => {
    const docId = await seedDoc(); expect((await ask(docId)).status).toBe(200);
    await seedTask('TASK-UNCERTAIN-COMMIT', { docId, status: 'in-progress' });
    const captured = await expectedRead(docId);
    const privateMarker = 'fixture internal commit transport detail';
    const internalCode = 'FIXTURE_DATABASE_COMMIT_CODE';
    class FixtureCommitTransportFailure extends Error { readonly code = internalCode; }
    const transport = express.Router();
    transport.use((req, _res, next) => {
      req.dbClient = { query: async (text: string, params?: unknown[]) => {
        const result = await jdb.pool.query(text, params);
        // The database committed; the client did not receive confirmation.
        if (text === 'COMMIT') throw new FixtureCommitTransportFailure(privateMarker);
        return result;
      } } as typeof req.dbClient;
      next();
    });
    transport.use(authoringRouter);
    const uncertain = makeApp(transport);
    const res = await reviewer(request(uncertain).post(`/api/authoring/documents/${docId}/review`))
      .send({ review_status: 'approved', expected: captured });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatchObject({ code: 'REVIEW_COMMIT_UNCONFIRMED' });
    for (const privateFact of [privateMarker, internalCode, 'FixtureCommitTransportFailure']) {
      expect(JSON.stringify(res.body)).not.toContain(privateFact);
    }
    expect(afterRequest()).toEqual([]);
    expect((await taskOf('TASK-UNCERTAIN-COMMIT')).status).toBe('completed');
    expect(await transitionsOf('TASK-UNCERTAIN-COMMIT')).toHaveLength(1);
    const recovered = await reviewer(request(app).get(`/api/authoring/documents/${docId}/reviews`));
    expect(recovered.status).toBe(200);
    expect(recovered.body.reviews[0]).toMatchObject({ review_status: 'approved', standing: 'current' });
    expect(await rows("SELECT 1 FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='document_reviewed'", [docId])).toHaveLength(1);
  }, T);
});
