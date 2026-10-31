/**
 * Training reaches the people assigned as tasks (P-49 distribution, P-50 Q1;
 * MR-12 Stage 4 slice 4; docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md §3.9).
 * Through the real routes, as the runtime role with RLS on:
 *   - approving a version writes one Quality task per person assigned, by role
 *     or by name, due the day it takes effect, with one assignment notice each,
 *     and none for anyone else; planning again writes nothing;
 *   - an acknowledgement completes only that person's task, and only when it is
 *     of the version they train on;
 *   - an assignment, or a role member, added or removed moves only the tasks of
 *     the people it covers; a person still named keeps theirs;
 *   - approving the next version withdraws the open tasks and writes new ones;
 *     retirement withdraws them all;
 *   - someone covered after a version is in force is due 14 days later (P-50
 *     Q1); someone it reached with no training period is due now, and the
 *     due-date sweep never also tells them "overdue";
 *   - a release nobody can read and acknowledge gets no task;
 *   - a task that cannot be written never undoes the act, and a plan that could
 *     not be read closes nothing;
 *   - each notice opens the training reader for its person (slice 4b).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const H = vi.hoisted(() => ({ failWrites: false, failPlan: false }));
vi.mock('../../server/services/unifiedTaskService', async (original) => {
  const mod = await original<typeof import('../../server/services/unifiedTaskService')>();
  const service = mod.default;
  const create = service.createUnifiedTask.bind(service);
  service.createUnifiedTask = ((...args: Parameters<typeof create>) =>
    (H.failWrites ? Promise.reject(new Error('forced task write failure')) : create(...args))) as typeof create;
  return mod;
});
vi.mock('../../server/services/qms/training-assignment', async (original) => {
  const mod = await original<typeof import('../../server/services/qms/training-assignment')>();
  return { ...mod, readQmsTrainingAssignees: (...args: Parameters<typeof mod.readQmsTrainingAssignees>) =>
    (H.failPlan ? Promise.reject(new Error('forced plan read failure')) : mod.readQmsTrainingAssignees(...args)) };
});

import {
  A, PASSWORD, REASON, app, assign, call, document, orgA, owner, programId, role, unassign,
  provisionTrainingAssignmentFixture, teardownTrainingAssignmentFixture, type Actor,
} from './qms-training-assignments-fixture';

type Task = { task_id: string; source_entity_id: string; assignee_id: number; status: string; due: string; metadata: Record<string, unknown> };
const DAY = 86_400_000;
const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
const LATER = inDays(20);

const tasks = async (documentId: number): Promise<Task[]> => (await owner.query(
  `SELECT task_id, source_entity_id, assignee_id, status, to_char(due_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS due, metadata::jsonb AS metadata
     FROM unified_tasks WHERE organization_id = $1 AND source_entity_type = 'qms_training' AND left(source_entity_id, length($2)) = $2
    ORDER BY assignee_id, created_at`, [orgA.id, `qms-document:${documentId}:user:`])).rows;
const open = async (documentId: number) => (await tasks(documentId)).filter(t => !['completed', 'cancelled'].includes(t.status));
const taskOf = async (documentId: number, who: Actor) => (await tasks(documentId)).filter(t => t.assignee_id === who.id);
/** Notices are sent after the response, fire and forget: wait for them to land. */
async function notices(taskIds: string[], expected: number) {
  let rows: Array<{ recipient_user_id: number; title: string; body: string; resource_id: string }> = [];
  for (let i = 0; i < 40; i += 1) {
    rows = (await owner.query(`SELECT recipient_user_id, title, body, resource_id FROM mdx_notifications
      WHERE organization_id = $1 AND category = 'task_assigned' AND resource_id = ANY($2::text[]) ORDER BY recipient_user_id`, [orgA.id, taskIds])).rows;
    if (rows.length >= expected) break;
    await new Promise(r => setTimeout(r, 50));
  }
  return rows;
}
const approve = (id: number, extra: Record<string, unknown> = {}) =>
  call(A.approver, 'post', `/documents/${id}/approve`, { password: PASSWORD, meaning: 'APPROVED', reason: 'Independent release of the invented procedure.', ...extra });
const trainingOf = async (id: number, by: Actor) => {
  const res = await call(by, 'get', `/documents/${id}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.meta.training as { documentVersion: string; contentDigest: string; successor?: { documentVersion: string; contentDigest: string } | null };
};
const acknowledge = (id: number, version: { documentVersion: string; contentDigest: string }, by: Actor) =>
  call(by, 'post', `/documents/${id}/training-ack`, { documentVersion: version.documentVersion, contentDigest: version.contentDigest, understood: true, method: 'attestation' });
const assignmentId = async (documentId: number, subject: { job_role_id?: number; user_id?: number }) => Number((await owner.query(
  `SELECT id FROM qms_training_assignments WHERE document_id = $1 AND removed_at IS NULL AND ${subject.job_role_id ? 'job_role_id' : 'user_id'} = $2`,
  [documentId, subject.job_role_id ?? subject.user_id])).rows[0].id);

let qa: number;
let pendingDoc: number;
/** The one notification door (GET /api/mdx/notifications/:id/target), behind the same authMiddleware. */
let door: import('express').Express;

beforeAll(async () => {
  await provisionTrainingAssignmentFixture();
  qa = await role(A.admin, 'Quality assurance', [A.qa1, A.both]);
  const express = (await import('express')).default;
  const { authMiddleware } = await import('../../server/auth');
  door = express(); door.use(express.json());
  door.use('/api/mdx', authMiddleware, (await import('../../server/routes/mdx-notifications')).default);
}, 180_000);
afterAll(teardownTrainingAssignmentFixture);

describe('a version approved for a later day', () => {
  it('reaches each person assigned with one task due the day it takes effect, and one notice', async () => {
    pendingDoc = await document(orgA, { status: 'in_review' });
    for (const subject of [{ jobRoleId: qa }, { userId: A.named.id }, { userId: A.both.id }]) {
      expect((await assign(A.admin, pendingDoc, subject)).status).toBe(201);
    }
    expect(await tasks(pendingDoc), 'nothing is in force or approved yet: there is nothing to read').toEqual([]);
    expect((await approve(pendingDoc, { effectiveDate: LATER })).status).toBe(200);
    const written = await tasks(pendingDoc);
    expect(written.map(t => t.assignee_id).sort()).toEqual([A.qa1.id, A.named.id, A.both.id].sort());
    for (const t of written) {
      expect(t).toMatchObject({ status: 'pending', due: `${LATER}T00:00:00Z`, source_entity_id: `qms-document:${pendingDoc}:user:${t.assignee_id}` });
      expect(t.metadata).toMatchObject({ version: '1.0', dueDate: LATER, remindDaysBefore: 7, lateAssignment: false, kind: 'acknowledge' });
      expect(t.metadata.dueSoonNotifiedAt, 'twenty days out: the sweep gives the seven days’ notice').toBeUndefined();
    }
    const sent = await notices(written.map(t => t.task_id), 3);
    expect(sent.map(n => n.recipient_user_id).sort()).toEqual(written.map(t => t.assignee_id).sort());
    for (const n of sent) expect(n.body).toBe(`Due ${LATER}, the day it takes effect. Your acknowledgement counts from then.`);
    expect(await taskOf(pendingDoc, A.unassigned)).toEqual([]);
  });

  it('opens each notice on the training reader for its person, through the one notification door (slice 4b)', async () => {
    const [task] = await taskOf(pendingDoc, A.named);
    const notice = (await owner.query(`SELECT id FROM mdx_notifications WHERE organization_id = $1 AND resource_id = $2`, [orgA.id, task.task_id])).rows[0];
    const target = (by: Actor) => request(door).get(`/api/mdx/notifications/${notice.id}/target`).set('Authorization', `Bearer ${by.token}`);
    const res = await target(A.named);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toEqual({ surface: 'quality', label: 'Read and acknowledge', params: { qmsDocumentId: String(pendingDoc), qmsIntent: 'read' }, programId: null });
    expect((await target(A.qa1)).status, 'a notice is its recipient\u2019s alone').toBe(404);
  });

  it('writes nothing when planned again', async () => {
    const before = await tasks(pendingDoc);
    const { getPool } = await import('../../server/db/runtime');
    const { runWithOrgJobScope } = await import('../../server/db/tenantStore');
    const { reconcileTrainingTasks } = await import('../../server/services/qms/training-task');
    await runWithOrgJobScope(orgA.id, 'qms-training-tasks-dbtest', async () => {
      const client = await getPool().connect();
      try { await reconcileTrainingTasks(client, orgA.id, { documentIds: [pendingDoc] }, A.admin.id); } finally { client.release(); }
    });
    expect(await tasks(pendingDoc)).toEqual(before);
  });

  it('completes only the task of the person who acknowledged the version', async () => {
    expect((await acknowledge(pendingDoc, await trainingOf(pendingDoc, A.qa1), A.qa1)).status).toBe(201);
    expect((await taskOf(pendingDoc, A.qa1)).map(t => t.status)).toEqual(['completed']);
    expect((await open(pendingDoc)).map(t => t.assignee_id).sort()).toEqual([A.named.id, A.both.id].sort());
  });

  it('writes a task only for the people an added assignment or role member newly covers', async () => {
    const before = (await open(pendingDoc)).map(t => t.task_id);
    expect((await assign(A.admin, pendingDoc, { userId: A.qa2.id })).status).toBe(201);
    // Present when the response arrives: planned after COMMIT, before the answer.
    expect((await taskOf(pendingDoc, A.qa2)).map(t => t.status)).toEqual(['pending']);
    const added = await call(A.admin, 'post', `/job-roles/${qa}/members`, { userId: A.oldRole.id, reason: REASON });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    expect((await taskOf(pendingDoc, A.oldRole)).map(t => t.status)).toEqual(['pending']);
    expect((await open(pendingDoc)).map(t => t.task_id)).toEqual(expect.arrayContaining(before));
    expect(await open(pendingDoc)).toHaveLength(before.length + 2);
  });

  it('withdraws a task when its person is no longer covered, and keeps the task of a person still named', async () => {
    const removed = await call(A.admin, 'delete', `/job-roles/${qa}/members/${A.oldRole.id}`, { reason: REASON });
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    expect((await taskOf(pendingDoc, A.oldRole)).map(t => t.status)).toEqual(['cancelled']);
    const both = (await taskOf(pendingDoc, A.both))[0].task_id;
    expect((await unassign(A.admin, pendingDoc, await assignmentId(pendingDoc, { job_role_id: qa }))).status).toBe(200);
    expect((await taskOf(pendingDoc, A.both)).map(t => [t.task_id, t.status])).toEqual([[both, 'pending']]);
    expect((await taskOf(pendingDoc, A.qa1)).map(t => t.status), 'a completed task is history, never reopened').toEqual(['completed']);
  });

  it('withdraws every open task when the document is retired', async () => {
    expect((await call(A.approver, 'post', `/documents/${pendingDoc}/retire`, { password: PASSWORD, meaning: 'retirement', reason: 'Withdrawn from use before it took effect.' })).status).toBe(200);
    expect(await open(pendingDoc)).toEqual([]);
    expect((await taskOf(pendingDoc, A.qa1)).map(t => t.status)).toEqual(['completed']);
  });
});

describe('a version in force', () => {
  let doc: number;
  it('is due now for someone it reached with no training period, and the sweep does not also say overdue', async () => {
    doc = await document(orgA, { status: 'in_review' });
    expect((await assign(A.admin, doc, { userId: A.named.id })).status).toBe(201);
    expect((await approve(doc)).status).toBe(200);
    const [task] = await taskOf(doc, A.named);
    expect(task).toMatchObject({ status: 'pending', due: `${today()}T00:00:00Z` });
    expect(task.metadata).toMatchObject({ lateAssignment: false, dueSoonNotifiedAt: expect.any(String), overdueNotifiedAt: expect.any(String) });
    const [notice] = await notices([task.task_id], 1);
    expect(notice.body).toMatch(/is in force; read and acknowledge it now\.$/);
    const { runTaskDueSweep } = await import('../../server/jobs/taskDueSweep');
    await runTaskDueSweep();
    expect((await owner.query(`SELECT count(*)::int AS n FROM mdx_notifications WHERE resource_id = $1`, [task.task_id])).rows[0].n).toBe(1);
  });

  it('is due 14 days after they were covered for someone assigned after it was in force (P-50 Q1)', async () => {
    expect((await assign(A.admin, doc, { userId: A.qa2.id })).status).toBe(201);
    const [task] = await taskOf(doc, A.qa2);
    expect(task).toMatchObject({ status: 'pending', due: `${inDays(14)}T00:00:00Z` });
    expect(task.metadata).toMatchObject({ lateAssignment: true });
    expect(task.metadata.overdueNotifiedAt).toBeUndefined();
    const [notice] = await notices([task.task_id], 1);
    expect(notice.body).toMatch(new RegExp(`is in force; read and acknowledge it by ${inDays(14)}\\.$`));
  });

  it('gives a task due in the future one due-soon notice and one overdue notice from the sweep', async () => {
    const [task] = await taskOf(doc, A.qa2);
    const { runTaskDueSweep } = await import('../../server/jobs/taskDueSweep');
    const count = async () => (await owner.query(`SELECT count(*)::int AS n FROM mdx_notifications WHERE resource_id = $1`, [task.task_id])).rows[0].n;
    await runTaskDueSweep();
    expect(await count(), 'fourteen days out: outside the seven days').toBe(1);
    await owner.query(`UPDATE unified_tasks SET due_date = now() + interval '3 days' WHERE task_id = $1`, [task.task_id]);
    await runTaskDueSweep(); await runTaskDueSweep();
    expect(await count()).toBe(2);
    await owner.query(`UPDATE unified_tasks SET due_date = now() - interval '1 hour' WHERE task_id = $1`, [task.task_id]);
    await runTaskDueSweep(); await runTaskDueSweep();
    expect(await count()).toBe(3);
  });

  it('distributes no release whose text no longer matches its signature: nobody could complete the task', async () => {
    const id = await document(orgA, { status: 'in_review' });
    expect((await approve(id)).status).toBe(200);
    await owner.query(`UPDATE qms_documents SET metadata = jsonb_set(metadata::jsonb, '{sections,0,body}', '"Changed after it was signed."') WHERE id = $1`, [id]);
    expect((await assign(A.admin, id, { userId: A.named.id })).status).toBe(201);
    expect((await trainingOf(id, A.named)).documentVersion).toBe('1.0');
    expect(await tasks(id)).toEqual([]);
  });

  it('never undoes an approval whose tasks could not be written', async () => {
    const id = await document(orgA, { status: 'in_review' });
    expect((await assign(A.admin, id, { userId: A.named.id })).status).toBe(201);
    H.failWrites = true;
    try {
      const res = await approve(id);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.meta.signature.id).toBeTruthy();
    } finally { H.failWrites = false; }
    expect((await owner.query(`SELECT status FROM qms_documents WHERE id = $1`, [id])).rows[0].status).toBe('effective');
    expect(await tasks(id)).toEqual([]);
  });

  it('closes nothing when the plan could not be read', async () => {
    const before = await open(doc);
    expect(before.length).toBeGreaterThan(0);
    H.failPlan = true;
    try {
      expect((await call(A.approver, 'post', `/documents/${doc}/retire`, { password: PASSWORD, meaning: 'retirement', reason: 'Withdrawn from use: replaced by another procedure.' })).status).toBe(200);
    } finally { H.failPlan = false; }
    expect(await open(doc), 'an unread plan is not an empty one').toEqual(before);
  });
});

describe('the next version approved for a later day', () => {
  it('withdraws the open tasks of the version in force, writes its own, and only its own receipt completes them', async () => {
    const id = await document(orgA, { status: 'in_review' });
    await owner.query('UPDATE qms_documents SET author_id = $2 WHERE id = $1', [id, A.author.id]);
    expect((await assign(A.admin, id, { userId: A.named.id })).status).toBe(201);
    expect((await assign(A.admin, id, { userId: A.qa2.id })).status).toBe(201);
    expect((await approve(id)).status).toBe(200);
    const v1 = await open(id);
    expect(v1.map(t => t.metadata.version)).toEqual(['1.0', '1.0']);
    const revised = await call(A.author, 'post', `/documents/${id}/revise`, { reason: 'Open the annual revision of the invented procedure', programId, templateKey: 'sop' });
    expect(revised.status, JSON.stringify(revised.body)).toBe(200);
    expect((await open(id)).map(t => t.task_id), 'a revision being drafted changes no one’s training').toEqual(v1.map(t => t.task_id));
    const authored = String((await owner.query('SELECT authoring_document_id FROM qms_documents WHERE id = $1', [id])).rows[0].authoring_document_id);
    await owner.query(`UPDATE authoring_sections SET content = '<p>Record each correction, its reason and its approver.</p>' WHERE doc_id = $1 AND code = 'qms-purpose'`, [authored]);
    const route = { reviewers: [], approvers: [A.approver.id], approvalDueDate: inDays(5) };
    const review = await request(app).patch(`/api/mdx/qms/documents/${id}`).set('Authorization', `Bearer ${A.author.token}`)
      .send({ status: 'in_review', reason: 'Saved v2.0 text ready for review', route });
    expect(review.status, JSON.stringify(review.body)).toBe(200);
    const approved = await approve(id, { effectiveDate: LATER });
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    const all = await tasks(id);
    expect(all.filter(t => t.metadata.version === '1.0').map(t => t.status)).toEqual(['cancelled', 'cancelled']);
    const v2 = all.filter(t => t.metadata.version === '2.0');
    expect(v2.map(t => [t.assignee_id, t.status, t.due])).toEqual([A.named.id, A.qa2.id].sort((a, b) => a - b).map(u => [u, 'pending', `${LATER}T00:00:00Z`]));
    // v1.0 is still in force and can be acknowledged; that leaves the v2.0 task open.
    const training = await trainingOf(id, A.named);
    expect((await acknowledge(id, training, A.named)).status).toBe(201);
    expect((await taskOf(id, A.named)).filter(t => t.metadata.version === '2.0').map(t => t.status)).toEqual(['pending']);
    expect((await acknowledge(id, training.successor!, A.named)).status).toBe(201);
    expect((await taskOf(id, A.named)).filter(t => t.metadata.version === '2.0').map(t => t.status)).toEqual(['completed']);
    expect((await taskOf(id, A.qa2)).filter(t => t.metadata.version === '2.0').map(t => t.status)).toEqual(['pending']);
  });
});
