/**
 * A controlled document's next periodic review reaches its owner as a task
 * (gap 5.2, second half; docs/design/QMS_PERIODIC_REVIEW_REMINDERS_2026-10-29.md).
 *
 * The register knew when each version in force was next due, and nothing told
 * anyone. Here, on PostgreSQL as the runtime role with RLS on, through the real
 * routes and the real sweep:
 *   - approval writes one Quality task to the document's author, due on its
 *     next review, carrying a 30-day lead; approving again writes nothing more;
 *   - a signed review that finds it current completes that task and writes the
 *     next; "revision required" makes it "Revise …";
 *   - retirement cancels it; a new version's approval completes the old one;
 *   - the due-date sweep notifies a task carrying the lead 30 days ahead, once,
 *     and not a task without one.
 */
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { databaseUrl } from '../setup.db';
import { seedNativeCatalogProject } from './catalog-native-fixture';

vi.mock('../../server/middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const TAG = `qms-remind-${randomUUID().slice(0, 8)}`;
const PASSWORD = 'test-qms-review-reminder-fixture';
const originalRbacFlag = process.env.GOVERNANCE_RBAC_ENFORCE;
type Actor = { id: number; token: string };
let owner: Pool;
let orgId: number;
let orgUuid: string;
let programId: string;
let app: express.Express;
let author: Actor;
let signer: Actor;

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function account(key: string, role: string): Promise<Actor> {
  const user = (await owner.query(`INSERT INTO users(email,name,password_hash,status) VALUES($1,$2,$3,'active') RETURNING id`,
    [`${TAG}-${key}@example.invalid`, `${TAG} invented ${key}`, await bcrypt.hash(PASSWORD, 4)])).rows[0];
  const id = Number(user.id);
  await owner.query('INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,$3)', [orgId, id, role]);
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  return { id, token: jwt.sign({ type: 'access', id: String(id), userId: String(id), organizationId: String(orgId), role },
    activeJwtSecret(), { expiresIn: '1h' }) };
}

const post = (by: Actor, path: string, body: Record<string, unknown>) =>
  request(app).post(path).set('Authorization', `Bearer ${by.token}`).send(body);
const approve = (id: number) =>
  post(signer, `/api/mdx/qms/documents/${id}/approve`, { password: PASSWORD, meaning: 'APPROVED', reason: 'Independent approval of the invented procedure.' });
const review = (id: number, body: Record<string, unknown>) =>
  post(signer, `/api/mdx/qms/documents/${id}/periodic-review`, { password: PASSWORD, meaning: 'review', reason: 'Annual periodic review of the invented procedure.', ...body });

/** A document in review, due on `due`, approved through the real signed route. */
async function effectiveDocument(key: string, due: string): Promise<number> {
  const row = (await owner.query(`INSERT INTO qms_documents (organization_id,doc_number,title,doc_type,version,status,author_id,next_review_date,metadata)
    VALUES($1,$2,$3,'sop','1.0','in_review',$4,$5::date,$6::jsonb) RETURNING id`,
  [orgId, `${TAG}-${key}`, `Invented procedure ${key}`, author.id, due,
    JSON.stringify({ sections: [{ key: 'procedure', label: 'Procedure', body: `Record each ${key} correction with its reason.` }] })])).rows[0];
  const approved = await approve(Number(row.id));
  expect(approved.status, JSON.stringify(approved.body)).toBe(200);
  return Number(row.id);
}

type TaskRow = { task_id: string; module_type: string; title: string; assignee_id: number; status: string; due: string;
  metadata: Record<string, unknown>; source_entity_type: string; source_entity_id: string };
const tasks = async (id: number): Promise<TaskRow[]> => (await owner.query(
  `SELECT task_id, module_type, title, assignee_id, status, to_char(due_date, 'YYYY-MM-DD') AS due, metadata::jsonb AS metadata,
          source_entity_type, source_entity_id
     FROM unified_tasks WHERE organization_id = $1 AND source_entity_type = 'qms_periodic_review' AND source_entity_id = $2
     ORDER BY id`, [orgId, `qms-document:${id}`])).rows;
const open = async (id: number) => (await tasks(id)).filter((t) => !['completed', 'cancelled'].includes(t.status));

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL must use the provisioned non-owner runtime role.');
  process.env.GOVERNANCE_RBAC_ENFORCE = 'false';
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const org = (await owner.query("INSERT INTO organizations(name,slug,status,payment_status) VALUES($1,$1,'active','active') RETURNING id,uuid", [TAG])).rows[0];
  orgId = Number(org.id); orgUuid = String(org.uuid);
  author = await account('author', 'member');
  signer = await account('signer', 'approver');
  const program = await owner.query(`INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
    VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', 'Invented product') RETURNING id`, [`${TAG} program`, TAG.toUpperCase(), orgId]);
  programId = String(program.rows[0].id);
  const { projectId } = await seedNativeCatalogProject(owner, { organizationId: orgId, userId: author.id, programId, namespace: TAG });
  await owner.query('INSERT INTO project_visibility_settings (organization_id, project_id, visibility) VALUES ($1, $2, $3)', [orgId, projectId, 'org_public']);
  const { authMiddleware } = await import('../../server/auth');
  app = express(); app.use(express.json());
  app.use('/api/mdx', authMiddleware, (await import('../../server/routes/mdx-qms')).default);
}, 120_000);

afterAll(async () => {
  if (originalRbacFlag == null) delete process.env.GOVERNANCE_RBAC_ENFORCE;
  else process.env.GOVERNANCE_RBAC_ENFORCE = originalRbacFlag;
  if (owner && orgId) await owner.query("UPDATE organizations SET status='inactive' WHERE id=$1", [orgId]);
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end(); await owner?.end();
});

describe('approval puts the next periodic review on the owner’s task list', () => {
  it('writes one Quality task to the author, due on the next review, 30 days’ notice; approving the same date again writes nothing', async () => {
    const id = await effectiveDocument('APR', day(200));
    const [task, ...rest] = await tasks(id);
    expect(rest).toHaveLength(0);
    expect(task).toMatchObject({ module_type: 'Quality', assignee_id: author.id, status: 'pending', due: day(200),
      source_entity_type: 'qms_periodic_review', source_entity_id: `qms-document:${id}`,
      metadata: { documentId: id, version: '1.0', nextReviewDue: day(200), remindDaysBefore: 30, kind: 'review' } });
    expect(task.title).toBe(`Periodic review: ${TAG}-APR v1.0`);
    const { schedulePeriodicReviewTask } = await import('../../server/services/qms/periodic-review-task');
    const { runWithTenantScope } = await import('../../server/db/tenantStore');
    const row = (await owner.query('SELECT * FROM qms_documents WHERE id = $1', [id])).rows[0];
    const again = await runWithTenantScope({ tenantId: String(orgId), orgUuid, role: 'admin', source: 'request', caller: 'qms-remind-repeat' },
      () => schedulePeriodicReviewTask({ organizationId: orgId, document: row, due: day(200), kind: 'review', closeAs: 'completed', createdById: signer.id }));
    expect(again).toBe('unchanged');
    expect(await tasks(id)).toHaveLength(1);
  });
});

describe('a signed periodic review moves the task on', () => {
  it('"remains current" completes the task and writes the next one, for the date the reviewer set', async () => {
    const id = await effectiveDocument('CUR', day(15));
    const res = await review(id, { outcome: 'current', nextReviewDate: day(380) });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const all = await tasks(id);
    expect(all.map((t) => [t.status, t.due])).toEqual([['completed', day(15)], ['pending', day(380)]]);
    expect(all[1]).toMatchObject({ assignee_id: author.id, metadata: { kind: 'review', nextReviewDue: day(380) } });
  });

  it('"revision required" makes it a task to revise, due when the document is due', async () => {
    const id = await effectiveDocument('REV', day(60));
    const res = await review(id, { outcome: 'revision-required' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const [task] = await open(id);
    expect(task).toMatchObject({ due: day(60), metadata: { kind: 'revise', version: '1.0' } });
    expect(task.title).toBe(`Revise ${TAG}-REV v1.0: its periodic review found a revision required`);
    expect((await tasks(id)).filter((t) => t.status === 'completed')).toHaveLength(1);
  });
});

describe('the task ends with the version it was for', () => {
  it('retirement cancels the open task', async () => {
    const id = await effectiveDocument('RET', day(90));
    const res = await post(signer, `/api/mdx/qms/documents/${id}/retire`, { password: PASSWORD, meaning: 'APPROVED', reason: 'The invented procedure is withdrawn from use.' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await open(id)).toHaveLength(0);
    expect((await tasks(id)).map((t) => t.status)).toEqual(['cancelled']);
  });

  it('a new version’s approval completes the old task and writes one for the new version', { timeout: 60_000 }, async () => {
    const id = await effectiveDocument('NEW', day(45));
    const revised = await post(author, `/api/mdx/qms/documents/${id}/revise`, { reason: 'Open the next revision of the invented procedure', programId, templateKey: 'sop' });
    expect(revised.status, JSON.stringify(revised.body)).toBe(200);
    const docId = String((await owner.query('SELECT authoring_document_id FROM qms_documents WHERE id = $1', [id])).rows[0].authoring_document_id);
    await owner.query(`UPDATE authoring_sections SET content = '<p>Revised procedure text.</p>' WHERE doc_id = $1 AND code = 'qms-purpose'`, [docId]);
    const { withNativeCatalogClient } = await import('./catalog-native-fixture');
    const { grantAuthoringPermission } = await import('../../server/services/authoring/authoring-permissions');
    await withNativeCatalogClient({ organizationId: orgId, organizationUuid: orgUuid, userId: author.id, role: 'member', caller: 'qms-remind-share' },
      (sqlClient) => grantAuthoringPermission({ pool: sqlClient, tenantId: orgId, docId, principalId: String(signer.id),
        role: 'APPROVER', grantedBy: String(author.id), reason: 'Independent approver of v2.0' }));
    const sent = await request(app).patch(`/api/mdx/qms/documents/${id}`).set('Authorization', `Bearer ${author.token}`)
      // RR4 (docs/design/REVIEW_ROUTING_2026-10-23.md §2.7): sending for review names its route, the QMS approver (here the Approver-role signer, who stands in while the organization has designated none).
      .send({ status: 'in_review', nextReviewDate: day(300), reason: 'Saved v2.0 text ready for review', route: { reviewers: [], approvers: [signer.id], approvalDueDate: day(5) } });
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    // While v2.0 is drafted, v1.0 is in force and its task stands.
    expect((await open(id)).map((t) => t.metadata.version)).toEqual(['1.0']);
    const v2 = await approve(id);
    expect(v2.status, JSON.stringify(v2.body)).toBe(200);
    const all = await tasks(id);
    expect(all.map((t) => [t.status, t.metadata.version, t.due])).toEqual([['completed', '1.0', day(45)], ['pending', '2.0', day(300)]]);
  });
});

describe('the due-date sweep reads the lead the task carries', () => {
  it('notifies a review task due in 20 days once, and not a task without a lead', async () => {
    const id = await effectiveDocument('SWP', day(20));
    const [task] = await open(id);
    const plain = (await owner.query(
      `INSERT INTO unified_tasks (task_id, organization_id, module_type, title, task_type, assignee_id, priority, due_date, status, metadata)
       VALUES ($1, $2, 'Quality', 'An invented task with no lead', 'action', $3, 'medium', $4::date, 'pending', '{}'::json) RETURNING task_id`,
      [`${TAG}-plain`, orgId, author.id, day(20)])).rows[0].task_id;
    const { runTaskDueSweep } = await import('../../server/jobs/taskDueSweep');
    await runTaskDueSweep();
    const stamped = async (taskId: string) => (await owner.query(`SELECT metadata::jsonb AS m FROM unified_tasks WHERE task_id = $1`, [taskId])).rows[0].m;
    const first = await stamped(task.task_id);
    expect(first.dueSoonNotifiedAt, 'the review task is due within its 30-day lead').toBeTruthy();
    expect((await stamped(plain)).dueSoonNotifiedAt, 'without a lead, 20 days out is not due soon').toBeUndefined();
    await runTaskDueSweep();
    expect((await stamped(task.task_id)).dueSoonNotifiedAt, 'notified once').toBe(first.dueSoonNotifiedAt);
  });
});
