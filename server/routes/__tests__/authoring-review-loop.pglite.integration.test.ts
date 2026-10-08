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
import type express from 'express';
import { randomUUID } from 'node:crypto';

import { createJourneyDb, extractTableDdl, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { GOVERNED_ACTION_LEDGER_PGLITE_DDL } from '../../services/ana-ri/__tests__/governed-action-ledger.fixture';
import { PREREQ, AUTHOR, ORG, OTHER_ORG, mint, makeApp, asToken } from './_authoring-canvas-fixture';

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
let author: (r: request.Test) => request.Test;
let reviewer: (r: request.Test) => request.Test;

type Row = Record<string, any>;
async function rows<R = Row>(sql: string, params: unknown[] = []): Promise<R[]> {
  return (await jdb.pool.query(sql, params)).rows as R[];
}

async function seedDoc(): Promise<string> {
  const docId = randomUUID();
  await jdb.pool.query(
    `INSERT INTO authoring_documents (id, title, module, status, created_by, tenant_id)
     VALUES ($1, $2, 'M2', 'draft', $3, $4)`,
    [docId, `Module 2.5 — review loop ${docId.slice(0, 8)}`, AUTHOR.id, ORG],
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

const verdict = (docId: string, body: Record<string, unknown>, as = reviewer) =>
  as(request(app).post(`/api/authoring/documents/${docId}/review`)).send(body);
const ask = (docId: string, people = [REVIEWER]) =>
  author(request(app).post(`/api/authoring/documents/${docId}/request-review`)).send({
    reviewers: people.map(p => ({ id: p.id, name: p.name })),
    reason: 'Ready for medical review before the pre-IND package.',
  });

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: `${PREREQ}\n${extractTableDdl('migrations/0000_sweet_joseph.sql', ['unified_tasks', 'task_dependencies', 'cross_module_task_links'])}`,
    migrations: [
      // The authoring subsystem unit, in the durable applier's order.
      'db/migrations/20260725_authoring_document_loop_tables.sql',
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
    ],
    testOnlySql: `
      ${GOVERNED_ACTION_LEDGER_PGLITE_DDL}
      INSERT INTO users (id, name, email) VALUES
        (${REVIEWER.id}, '${REVIEWER.name}', '${REVIEWER.email}'),
        (${OTHER_REVIEWER.id}, '${OTHER_REVIEWER.name}', '${OTHER_REVIEWER.email}');
      INSERT INTO organization_users (organization_id, user_id, role) VALUES
        (${ORG}, ${REVIEWER.id}, 'member'),
        (${ORG}, ${OTHER_REVIEWER.id}, 'member');
    `,
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
  author = asToken(await mint(AUTHOR));
  reviewer = asToken(await mint(REVIEWER));
  const { default: router } = await import('../authoring.router');
  app = makeApp(router);
}, T);

afterAll(async () => {
  await jdb?.close();
});

beforeEach(() => {
  h.notified = [];
});

describe('E — the verdict completes the reviewer’s review task on the same transaction', () => {
  it('an in-progress review task is completed, with its task.transition row naming the verdict', async () => {
    const docId = await seedDoc();
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
    expect(h.notified).toEqual([expect.objectContaining({ recipientUserId: Number(AUTHOR.id), category: 'task_completed', resourceId: 'TASK-E1' })]);
  }, T);

  it('a pending review task is started, then completed: two legal moves, two ledger rows, the reviewer’s reason on each', async () => {
    const docId = await seedDoc();
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
    await seedTask('TASK-GATED', { docId, status: 'in-progress', approvalRequired: true });

    const res = await verdict(docId, { review_status: 'approved' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    expect((await taskOf('TASK-GATED')).status).toBe('in-progress');
    expect(await transitionsOf('TASK-GATED')).toEqual([]);
    expect(res.body.tasks).toEqual({ completed: [], leftOpen: [{ taskId: 'TASK-GATED', why: 'signature-required' }] });
  }, T);

  it('a verdict with no review task is recorded exactly as before', async () => {
    const docId = await seedDoc();
    const res = await verdict(docId, { review_status: 'approved' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.review).toMatchObject({ doc_id: docId, reviewer_id: REVIEWER.id, review_status: 'approved' });
    expect(await rows(`SELECT 1 FROM c2c_ana_actions WHERE command = 'task.transition'
                         AND payload->>'docId' = $1`, [docId])).toEqual([]);
  }, T);

  it('the verdict and the task cannot disagree: when the task’s ledger row cannot be written, neither is recorded', async () => {
    const docId = await seedDoc();
    await seedTask('TASK-ATOMIC', { docId, status: 'in-progress' });
    await jdb.pglite.exec('ALTER TABLE c2c_ana_actions RENAME TO c2c_ana_actions_down');
    let res: request.Response;
    try {
      res = await verdict(docId, { review_status: 'changes_requested', review_comments: WHY });
    } finally {
      await jdb.pglite.exec('ALTER TABLE c2c_ana_actions_down RENAME TO c2c_ana_actions');
    }
    expect(res.status, JSON.stringify(res.body)).toBe(500);
    expect((await taskOf('TASK-ATOMIC')).status).toBe('in-progress');
    expect(await rows(`SELECT 1 FROM authoring_reviews WHERE doc_id = $1`, [docId])).toEqual([]);
    expect(await rows(`SELECT 1 FROM authoring_audit_trail WHERE doc_id = $1 AND operation_type = 'document_reviewed'`, [docId])).toEqual([]);
    expect(h.notified).toEqual([]);
  }, T);
});

describe('D — asking a reviewer again reopens their recorded verdict', () => {
  it('the row is pending again, with no verdict time and no comments', async () => {
    const docId = await seedDoc();
    expect((await ask(docId)).status).toBe(200);
    expect((await verdict(docId, { review_status: 'changes_requested', review_comments: WHY })).status).toBe(200);

    const again = await ask(docId);
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect(again.body.reviews).toEqual([expect.objectContaining({ reviewer_id: REVIEWER.id, review_status: 'pending', reviewed_at: null, review_comments: null })]);

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
      { reviewId: decided.body.review.id, reviewerId: REVIEWER.id, verdict: 'changes_requested', reviewedAt: expect.any(String) },
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
