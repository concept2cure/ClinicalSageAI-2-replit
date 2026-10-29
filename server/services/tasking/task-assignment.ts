/** Existing task.assign: one current admission and atomic writer for named and automatic handoffs. */
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requestConnectable, requestPgClient, type RequestSqlClient } from '../../db/requestDb';
import { governedActorId, GOVERNED_WRITE_ROLES } from '../../middleware/orgMembership';
import { getSecureOrgId } from '../../utils/tenantContext';
import { CsrScopeError, readCsrProjectActor } from '../csr/project-scope';
import { canAccessReportProject, type ReportProjectActor } from '../report-os/project-access';
import { memberLabels } from '../../../shared/utils/member-labels';
import type { TaskAssignmentMeta, TaskAssignmentRoster, TaskAssignmentResult } from '../../../shared/task-assignment';
import { auditTaskActionInTx, TaskAuditNotRecordedError } from './task-audit';
import { getOptimalAssignee } from './task-planning';
import { notifyTaskEvent } from './task-side-effects';
import { auditWriteFailed, outcomeUnknown } from './governed-task-write';
import { isRouteTask, refuseRouteTaskWrite, RouteTaskWriteRefused, routeTaskRefusalBody } from './task-state-machine';

type Row = Record<string, unknown>;
type Account = { id: number; name: string | null; email: string | null; role: string };
type Admission = { task: Row; actor: ReportProjectActor; organizationId: number; project: Row | null; workspace: number | null; canAssign: boolean };
const LIVE = new Set(['pending', 'in-progress', 'review', 'blocked']);
const id = z.number().int().positive().max(2_147_483_647);
export const assignmentExpectedSchema = z.object({ expectedAssigneeId: id.nullable(), expectedVersion: z.string().regex(/^[a-f0-9]{64}$/) });
export const namedAssignmentSchema = assignmentExpectedSchema.extend({ action: z.literal('assign'), assigneeId: id, reason: z.string().trim().min(3).max(1000) }).strict();
export type AssignmentInput = { taskId: string; method: 'named' | 'workload-balanced'; assigneeId?: number; expectedAssigneeId?: number | null; expectedVersion?: string; reason?: string };
/** Set only by server/services/review/review-route.ts, on a transaction that holds the route-writer setting: a route member's handoff is the route's (RR3). No request schema admits it. */
export type AssignmentOptions = { routeOwned?: boolean };

export class TaskAssignmentError extends Error {
  constructor(readonly status: 400 | 401 | 403 | 404 | 409 | 503, readonly code: string, message: string) {
    super(message); this.name = 'TaskAssignmentError';
  }
}
export class TaskAssignmentUnknown extends Error {}
const unavailable = () => new TaskAssignmentError(503, 'TASK_ASSIGNMENT_UNAVAILABLE', 'Task assignment could not be verified. Reload before trying again.');
const denied = () => new TaskAssignmentError(403, 'TASK_ASSIGNMENT_DENIED', 'Current task and project permissions do not allow this assignment.');
const stale = () => new TaskAssignmentError(409, 'CONFLICT_STALE', 'This task changed. Reload its current assignment before trying again.');
const numberOrNull = (value: unknown): number | null => value == null ? null : id.parse(value);

function identity(req: Request) {
  const organizationId = Number(getSecureOrgId(req));
  const actorUserId = governedActorId(req);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0 || !actorUserId) throw new TaskAssignmentError(401, 'TASK_ACTOR_REQUIRED', 'Current organization and account context is required.');
  return { organizationId, actorUserId };
}
function version(task: Row): string {
  if (typeof task.row_version !== 'string' || typeof task.exact_updated_at !== 'string') throw unavailable();
  return createHash('sha256').update(JSON.stringify([task.id, task.task_id, task.organization_id, task.row_version, task.exact_updated_at])).digest('hex');
}
async function taskRow(q: RequestSqlClient, org: number, taskId: string, lock = false): Promise<Row> {
  const statement = lock
    ? `/* task-assignment:task */ SELECT t.*,t.xmin::text AS row_version,t.updated_at::text AS exact_updated_at FROM unified_tasks t WHERE t.organization_id=$1 AND t.task_id=$2 AND t.deleted_at IS NULL FOR UPDATE`
    : `/* task-assignment:task */ SELECT t.*,t.xmin::text AS row_version,t.updated_at::text AS exact_updated_at FROM unified_tasks t WHERE t.organization_id=$1 AND t.task_id=$2 AND t.deleted_at IS NULL`;
  const { rows } = await q.query(statement, [org, taskId]);
  if (!rows.length) throw new TaskAssignmentError(404, 'TASK_NOT_FOUND', 'Task not found.');
  if (rows.length !== 1) throw unavailable();
  return rows[0];
}
async function parent(q: RequestSqlClient, org: number, task: Row, lock: boolean): Promise<Row | null> {
  const projectId = numberOrNull(task.project_id);
  if (projectId === null) return null;
  const statement = lock
    ? `/* task-assignment:project */ SELECT id,client_workspace_id,status FROM projects WHERE id=$1 AND organization_id=$2 FOR UPDATE`
    : `/* task-assignment:project */ SELECT id,client_workspace_id,status FROM projects WHERE id=$1 AND organization_id=$2`;
  const { rows } = await q.query(statement, [projectId, org]);
  if (rows.length !== 1) throw new TaskAssignmentError(404, 'TASK_NOT_FOUND', 'Task not found.');
  return rows[0];
}
async function workspace(req: Request, q: RequestSqlClient, org: number, task: Row, project: Row | null): Promise<number | null> {
  const recorded = numberOrNull(task.client_workspace_id);
  const actual = project ? numberOrNull(project.client_workspace_id) : recorded;
  if (project && recorded !== null && recorded !== actual) throw new TaskAssignmentError(409, 'TASK_SCOPE_MISMATCH', 'The task project and client workspace need reconciliation.');
  const claimed = (req.tenantContext as Record<string, unknown> | undefined)?.clientWorkspaceId;
  if (actual !== null && claimed != null && Number(claimed) !== actual) throw denied();
  if (actual !== null) {
    const owned = await q.query('SELECT id FROM client_workspaces WHERE id=$1 AND organization_id=$2', [actual, org]);
    if (owned.rows.length !== 1) throw denied();
  }
  return actual;
}
function assignable(actor: ReportProjectActor, task: Row, project: Row | null, editable: boolean, opts: AssignmentOptions = {}): boolean {
  // A route member is reassigned only through its route (RR1a, B1), so the
  // generic roster offers no one for it.
  if (isRouteTask(task) && !opts.routeOwned) return false;
  return GOVERNED_WRITE_ROLES.has(String(actor.role)) && editable && LIVE.has(String(task.status)) && !['archived','deleted'].includes(String(project?.status));
}
function requireWritePermission(actor: ReportProjectActor, editable: boolean, canAssign: boolean): void {
  if (!GOVERNED_WRITE_ROLES.has(String(actor.role)) || !editable) throw denied();
  if (!canAssign) throw new TaskAssignmentError(409, 'TASK_NOT_ASSIGNABLE', 'Only unfinished tasks in an active project can be reassigned.');
}
async function admission(req: Request, q: RequestSqlClient, taskId: string, write = false, opts: AssignmentOptions = {}): Promise<Admission> {
  const { organizationId, actorUserId } = identity(req);
  const initialActor = await readCsrProjectActor(q, organizationId, actorUserId);
  if (write && !GOVERNED_WRITE_ROLES.has(String(initialActor.role))) throw denied();
  const initial = await taskRow(q, organizationId, taskId);
  const project = await parent(q, organizationId, initial, write);
  const task = write ? await taskRow(q, organizationId, taskId, true) : initial;
  if (write && !opts.routeOwned) refuseRouteTaskWrite(task, 'task.assign');
  if (task.project_id !== initial.project_id || task.client_workspace_id !== initial.client_workspace_id) throw stale();
  const actor = write ? await readCsrProjectActor(q, organizationId, actorUserId, { forShare: true }) : initialActor;
  const currentWorkspace = await workspace(req, q, organizationId, task, project);
  const projectId = numberOrNull(task.project_id);
  if (projectId !== null && !await canAccessReportProject(organizationId, actor, projectId, q)) throw denied();
  const editable = projectId === null || await canAccessReportProject(organizationId, actor, projectId, q, { forWrite: true });
  const canAssign = assignable(actor, task, project, editable, opts);
  if (write) requireWritePermission(actor, editable, canAssign);
  return { task, actor, organizationId, project, workspace: currentWorkspace, canAssign };
}

async function accounts(q: RequestSqlClient, org: number): Promise<Account[]> {
  const { rows } = await q.query(`/* task-assignment:roster */ SELECT u.id,u.name,u.email,ou.role FROM organization_users ou JOIN users u ON u.id=ou.user_id WHERE ou.organization_id=$1 AND u.status='active' ORDER BY u.id`, [org]);
  const seen = new Set<number>();
  return rows.flatMap(row => {
    const accountId = id.parse(row.id);
    if (seen.has(accountId) || typeof row.role !== 'string' || !row.role.trim()) throw unavailable();
    seen.add(accountId);
    const role = row.role.trim().toLowerCase();
    return GOVERNED_WRITE_ROLES.has(role) ? [{ id: accountId, name: typeof row.name === 'string' ? row.name : null, email: typeof row.email === 'string' ? row.email : null, role }] : [];
  });
}
async function eligible(q: RequestSqlClient, ctx: Admission): Promise<Account[]> {
  const choices: Account[] = [];
  for (const account of await accounts(q, ctx.organizationId)) {
    if (ctx.task.project_id == null || await canAccessReportProject(ctx.organizationId, { userId: account.id, role: account.role }, Number(ctx.task.project_id), q)) choices.push(account);
  }
  return choices;
}
function candidateRows(rows: Account[]) {
  const labels = memberLabels(rows);
  const values = [...labels.values()].map(label => label.toLowerCase());
  return rows.map(row => {
    const base = labels.get(String(row.id))!;
    const label = values.filter(value => value === base.toLowerCase()).length > 1 ? `${base} · Account #${row.id}` : base;
    return { id: String(row.id), name: row.name || (row.email ? row.email.split('@')[0] : `Account #${row.id}`), label };
  });
}
function meta(ctx: Admission): TaskAssignmentMeta {
  return { organizationId: ctx.organizationId, actorUserId: ctx.actor.userId, taskId: String(ctx.task.task_id), projectId: numberOrNull(ctx.task.project_id),
    clientWorkspaceId: ctx.workspace, status: String(ctx.task.status), canAssign: ctx.canAssign, assigneeId: numberOrNull(ctx.task.assignee_id), assignmentVersion: version(ctx.task) };
}
export async function readTaskAssignmentOptions(req: Request, taskId: string): Promise<TaskAssignmentRoster> {
  const q = requestPgClient(req);
  const before = await admission(req, q, taskId);
  const data = before.canAssign ? candidateRows(await eligible(q, before)) : [];
  const after = await admission(req, q, taskId);
  if (JSON.stringify(meta(before)) !== JSON.stringify(meta(after))) throw stale();
  return { success: true as const, data, total: data.length, meta: meta(after) };
}
export async function readAssignableAccounts(req: Request) {
  const q = requestPgClient(req);
  const { organizationId, actorUserId } = identity(req);
  await readCsrProjectActor(q, organizationId, actorUserId);
  return candidateRows(await accounts(q, organizationId));
}
async function recipient(q: RequestSqlClient, ctx: Admission, userId: number): Promise<Account> {
  let actor: ReportProjectActor;
  try { actor = await readCsrProjectActor(q, ctx.organizationId, userId, { forShare: true }); }
  catch (error) { if (error instanceof CsrScopeError) throw denied(); throw error; }
  if (!GOVERNED_WRITE_ROLES.has(String(actor.role))) throw denied();
  if (ctx.task.project_id != null) {
    await q.query('SELECT user_id FROM project_members WHERE organization_id=$1 AND project_id=$2 AND user_id=$3 FOR SHARE', [ctx.organizationId, ctx.task.project_id, userId]);
    await q.query('SELECT project_id FROM project_visibility_settings WHERE organization_id=$1 AND project_id=$2 FOR SHARE', [ctx.organizationId, ctx.task.project_id]);
    await q.query(`SELECT ra.artifact_id FROM concept2cure_review_assignments ra JOIN concept2cure_artifacts a ON a.id=ra.artifact_id WHERE ra.organization_id=$1 AND a.organization_id=$1 AND a.project_id=$2 AND ra.reviewer_id=$3 AND ra.status='pending' FOR SHARE OF ra,a`, [ctx.organizationId, ctx.task.project_id, userId]);
    if (!await canAccessReportProject(ctx.organizationId, actor, Number(ctx.task.project_id), q)) throw denied();
  }
  // tenant-isolation-safe: users is the global account table (no tenant column); this account's membership of ctx.organizationId was proved above by readCsrProjectActor (organization_users, FOR SHARE).
  const { rows } = await q.query('SELECT id,name,email FROM users WHERE id=$1 AND status=\'active\'', [userId]);
  if (rows.length !== 1) throw denied();
  return { id: userId, role: String(actor.role), name: typeof rows[0].name === 'string' ? rows[0].name : null, email: typeof rows[0].email === 'string' ? rows[0].email : null };
}
function expected(ctx: Admission, input: AssignmentInput) {
  if (input.expectedVersion !== undefined && (input.expectedVersion !== version(ctx.task) || input.expectedAssigneeId !== numberOrNull(ctx.task.assignee_id))) throw stale();
}
async function chosen(q: RequestSqlClient, ctx: Admission, input: AssignmentInput): Promise<Account | null> {
  expected(ctx, input);
  if (input.method === 'named') return recipient(q, ctx, id.parse(input.assigneeId));
  const choices = await eligible(q, ctx);
  if (!choices.length) return null;
  const optimal = await getOptimalAssignee(ctx.organizationId, ctx.task, { executor: q, eligibleUserIds: choices.map(row => row.id) });
  if (!optimal) return null;
  if (!choices.some(row => row.id === optimal.id)) throw unavailable();
  return recipient(q, ctx, optimal.id);
}
function saved(ctx: Admission, task: Row): TaskAssignmentResult {
  const assignedAt = task.assigned_at instanceof Date ? task.assigned_at.toISOString() : new Date(String(task.assigned_at)).toISOString();
  return { taskId: String(task.task_id), organizationId: ctx.organizationId, actorUserId: ctx.actor.userId,
    projectId: numberOrNull(task.project_id), clientWorkspaceId: ctx.workspace, status: String(task.status), assigneeId: id.parse(task.assignee_id),
    assigneeName: typeof task.assignee_name === 'string' ? task.assignee_name : null, assignedBy: id.parse(task.assigned_by), assignedAt, assignmentVersion: version(task) };
}
async function mutate(req: Request, q: RequestSqlClient, ctx: Admission, input: AssignmentInput) {
  const account = await chosen(q, ctx, input);
  if (!account) return null;
  if (ctx.task.assignee_id === account.id) {
    if (input.method === 'workload-balanced') return null;
    throw new TaskAssignmentError(409, 'ASSIGNMENT_UNCHANGED', 'The task is already assigned to this account. Nothing was changed.');
  }
  const result = await q.query(`/* task-assignment:update */ UPDATE unified_tasks SET assignee_id=$1,assignee_name=$2,assigned_by=$3,assigned_at=now(),last_modified_by=$3,updated_at=now(),metadata=CASE WHEN metadata IS NULL THEN NULL ELSE ((metadata::jsonb - 'dueSoonNotifiedAt') - 'overdueNotifiedAt')::json END WHERE id=$4 AND organization_id=$5 AND deleted_at IS NULL AND status IN ('pending','in-progress','review','blocked') RETURNING *,xmin::text AS row_version,updated_at::text AS exact_updated_at`, [account.id, account.name, ctx.actor.userId, ctx.task.id, ctx.organizationId]);
  if (result.rows.length !== 1) throw stale();
  const data = saved(ctx, result.rows[0]);
  await auditTaskActionInTx(q, { orgId: ctx.organizationId, userId: ctx.actor.userId, command: 'task.assign', taskId: input.taskId,
    payload: { previousAssigneeId: numberOrNull(ctx.task.assignee_id), assigneeId: account.id, method: input.method,
      previousAssignedBy: ctx.task.assigned_by ?? null, previousAssignedAt: ctx.task.assigned_at ?? null, assignedBy: data.assignedBy, assignedAt: data.assignedAt },
    reason: input.reason, summary: input.method === 'workload-balanced' ? 'Workload-balanced auto-assign' : 'Named task reassignment' });
  return data;
}
function canSkip(input: AssignmentInput, error: unknown): boolean {
  return input.method === 'workload-balanced' && error instanceof TaskAssignmentError && ['TASK_NOT_FOUND','TASK_NOT_ASSIGNABLE'].includes(error.code);
}
function notifyAssigned(data: TaskAssignmentResult | null, title: string): void {
  if (!data || data.assigneeId === data.actorUserId) return;
  try { notifyTaskEvent({ organizationId: data.organizationId, recipientUserId: data.assigneeId, category: 'task_assigned', title: `Task assigned: ${title}`, taskId: data.taskId }); }
  catch { console.warn('[tasking] Confirmed assignment notification could not be scheduled.'); }
}
/**
 * One assignment on the caller's transaction (`q` is inside it): the admission,
 * the compare-and-set UPDATE (which also clears the due-soon and overdue
 * markers, so the new assignee is reminded afresh) and the `task.assign` row.
 * `skipped` when a workload-balanced pick found nothing to do. The caller
 * commits, then sends `notifyAssignedAfterCommit`. assignTask below is this on
 * its own transaction; review-route.ts calls it with `routeOwned` (RR3).
 */
export async function assignTaskInTx(req: Request, q: RequestSqlClient, input: AssignmentInput, opts: AssignmentOptions = {}): Promise<{ skipped: true } | { skipped: false; result: TaskAssignmentResult | null; title: string }> {
  let ctx: Admission;
  try { ctx = await admission(req, q, input.taskId, true, opts); }
  catch (error) {
    if (!canSkip(input, error)) throw error;
    return { skipped: true };
  }
  return { skipped: false, result: await mutate(req, q, ctx, input), title: String(ctx.task.title) };
}
/** The new assignee's notice, sent only once the assignment committed. */
export function notifyAssignedAfterCommit(data: TaskAssignmentResult | null, title: string): void { notifyAssigned(data, title); }

export async function assignTask(req: Request, input: AssignmentInput): Promise<TaskAssignmentResult | null> {
  const q = requestPgClient(req);
  const client = await requestConnectable(req).connect();
  let began = false; let committing = false;
  let result: TaskAssignmentResult | null; let title: string;
  try {
    await client.query('BEGIN'); began = true;
    const done = await assignTaskInTx(req, q, input);
    if (done.skipped) { await client.query('ROLLBACK'); began = false; return null; }
    result = done.result; title = done.title;
    committing = true; await client.query('COMMIT'); committing = false; began = false;
  } catch (error) {
    let uncertain = !began || committing;
    if (began && !committing) { try { await client.query('ROLLBACK'); } catch { uncertain = true; } }
    if (uncertain) {
      try { await q.discard?.(error instanceof Error ? error : new Error('Task assignment unconfirmed')); } catch { /* Retain unknown outcome. */ }
      throw new TaskAssignmentUnknown();
    }
    throw error;
  } finally { client.release(); }
  notifyAssigned(result, title);
  return result;
}
export function assignmentFailure(res: Response, error: unknown) {
  if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: 'Invalid task assignment request', code: 'VALIDATION_ERROR' });
  if (error instanceof TaskAssignmentUnknown) return outcomeUnknown(res);
  if (error instanceof TaskAuditNotRecordedError) return auditWriteFailed(res, 'The assignment');
  if (error instanceof RouteTaskWriteRefused) return res.status(error.status).json(routeTaskRefusalBody(error));
  if (error instanceof CsrScopeError) return res.status(403).json({ success: false, error: 'Current active organization membership is required.', code: 'TASK_ASSIGNMENT_DENIED' });
  if (error instanceof TaskAssignmentError) return res.status(error.status).json({ success: false, error: error.message, code: error.code });
  return res.status(503).json({ success: false, error: unavailable().message, code: 'TASK_ASSIGNMENT_UNAVAILABLE' });
}
