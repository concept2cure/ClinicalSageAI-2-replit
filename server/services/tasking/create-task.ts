/**
 * One task row and its `task.create` ledger row, on the caller's transaction.
 *
 * Extracted from POST /api/tasks/tasks (routes/taskManagement.routes.ts), which
 * now calls it, so the review route (server/services/review/review-route.ts)
 * writes its member rows through the same insert and the same lineage instead
 * of a second copy (docs/design/REVIEW_ROUTING_2026-10-23.md §2.3, RR1a).
 *
 * The route columns are not in `values`' type: a generic caller cannot name
 * them. Only `route` sets them, and only review-route.ts passes it. The row is
 * inserted without them, and then joins its route through the route writer's
 * door, public.review_route_enlist_member (migrations/20261023_review_routes.sql,
 * P-59): the database refuses a route column from any other writer
 * (unified_tasks_route_rows_guard), and admits this one only for a new member
 * task of an open route of the same organization.
 *
 * @module server/services/tasking/create-task
 */
import { unifiedTasks } from '../../../shared/schema';
import { auditTaskActionInTx } from './task-audit';
import { queryableFromDrizzle, type DrizzleRunner } from '../../db/drizzle-queryable';
import { getTenantScope } from '../../db/tenantStore';
import { writeChainedAuditRow } from '../auditService';
import { canAccessReportProject } from '../report-os/project-access';
import type { RequestSqlClient } from '../../db/requestDb';

type RouteColumn = 'reviewRouteId' | 'reviewRole' | 'reviewStep' | 'routeSignatureId' | 'routeActId' | 'routeAuthoringSignatureId';
type InsertTask = typeof unifiedTasks.$inferInsert;

/** The Drizzle handle a task write runs on: a transaction. */
export interface TaskInsertRunner extends DrizzleRunner {
  insert: (table: typeof unifiedTasks) => {
    values: (v: InsertTask) => { returning: () => Promise<Array<typeof unifiedTasks.$inferSelect>> };
  };
}

export interface CreateTaskInTxInput {
  organizationId: number;
  actorUserId: number;
  taskId: string;
  values: Omit<InsertTask, 'taskId' | 'organizationId' | 'createdById' | RouteColumn>;
  /** The `task.create` row's payload. */
  auditPayload: Record<string, unknown>;
  /** The reason the person stated, or none (recorded as null, never invented). */
  reason?: string;
  /** What happened, in the system's words. */
  summary?: string;
  /** Route membership. Passed only by server/services/review/review-route.ts. */
  route?: { reviewRouteId: string; reviewRole: 'reviewer' | 'approver'; reviewStep: number };
}

export async function createTaskInTx(
  tx: TaskInsertRunner,
  input: CreateTaskInTxInput,
): Promise<typeof unifiedTasks.$inferSelect> {
  const [row] = await tx
    .insert(unifiedTasks)
    .values({
      ...input.values,
      taskId: input.taskId,
      organizationId: input.organizationId,
      createdById: input.actorUserId,
    })
    .returning();
  if (input.route) {
    await queryableFromDrizzle(tx).query('SELECT public.review_route_enlist_member($1, $2::uuid, $3, $4, $5)', [
      input.organizationId, input.route.reviewRouteId, input.taskId, input.route.reviewRole, input.route.reviewStep,
    ]);
  }
  await auditTaskActionInTx(tx, {
    orgId: input.organizationId,
    userId: input.actorUserId,
    command: 'task.create',
    taskId: input.taskId,
    payload: input.auditPayload,
    reason: input.reason,
    ...(input.summary ? { summary: input.summary } : {}),
  });
  return row;
}

export interface SystemAlignmentTaskInput {
  organizationId: number; recipientUserId: number; projectId: number | null; taskKey: string;
  issueCode: 'conflict' | 'unverified_rule';
  ruleVersions?: Array<{ bundleId: string; version: number }>;
}

/** A dedicated scheduled review task, never a generic caller-selected system task or a regulated approval. */
export async function createSystemAlignmentTaskInTx(client: RequestSqlClient, input: SystemAlignmentTaskInput): Promise<{ taskId: string; created: boolean }> {
  assertAlignmentJob(input);
  const membership = await client.query(`SELECT ou.role FROM organization_users ou JOIN users u ON u.id=ou.user_id
    JOIN organizations o ON o.id=ou.organization_id WHERE ou.organization_id=$1 AND ou.user_id=$2
    AND u.status='active' AND o.status='active' FOR SHARE OF ou,u,o`, [input.organizationId, input.recipientUserId]);
  const role = String(membership.rows[0]?.role ?? '').toLowerCase();
  if (membership.rows.length !== 1 || !['admin','owner','super_admin'].includes(role)) throw new Error('Alignment review needs a current organization administrator.');
  await admitAlignmentTaskProject(client, input, role);
  const taskId = `TASK-ALIGN-${input.taskKey}`;
  const inserted = await client.query(`INSERT INTO unified_tasks (task_id,organization_id,project_id,module_type,title,description,
    task_type,category,priority,status,source_entity_type,source_entity_id,assignee_id,created_by_id,metadata)
    VALUES ($1,$2,$3,'Quality','Review standing-rule alignment',$4,'review','quality','high','pending',
    'rule_alignment',$5,$6,NULL,$7::json) ON CONFLICT (task_id) DO NOTHING RETURNING task_id`,
    [taskId,input.organizationId,input.projectId,alignmentIssueDescription(input.issueCode),input.taskKey,input.recipientUserId,
      JSON.stringify({ purpose: 'alignment_review', actorType: 'system', issueCode: input.issueCode, source: 'scheduled_rule_alignment', ruleVersions: input.ruleVersions ?? [] })]);
  if (!inserted.rows.length) {
    const existing = await client.query(`SELECT task_id FROM unified_tasks WHERE task_id=$1 AND organization_id=$2
      AND project_id IS NOT DISTINCT FROM $3::integer AND created_by_id IS NULL AND source_entity_type='rule_alignment'
      AND metadata->>'purpose'='alignment_review' AND EXISTS (SELECT 1 FROM audit_logs a
        WHERE a.tenant_id=unified_tasks.organization_id AND a.record_id=unified_tasks.task_id AND a.table_name='unified_tasks'
        AND a.action='task.create' AND a.user_id IS NULL AND a.new_values->>'actorType'='system'
        AND a.new_values->>'source'='scheduled_rule_alignment')`, [taskId,input.organizationId,input.projectId]);
    if (existing.rows.length !== 1) throw new Error('The existing alignment task identity could not be verified.');
    return { taskId, created: false };
  }
  await writeChainedAuditRow(client, { tenantId: input.organizationId, action: 'task.create', resourceType: 'unified_tasks', resourceId: taskId,
    details: { actorType: 'system', source: 'scheduled_rule_alignment', purpose: 'alignment_review', recipientUserId: input.recipientUserId,
      projectId: input.projectId, issueCode: input.issueCode, ruleVersions: input.ruleVersions ?? [], summary: alignmentIssueDescription(input.issueCode) } });
  return { taskId, created: true };
}

async function admitAlignmentTaskProject(client: RequestSqlClient, input: SystemAlignmentTaskInput, role: string): Promise<void> {
  if (input.projectId === null) return;
  const parent = await client.query(`SELECT id FROM projects WHERE organization_id=$1 AND id=$2
    AND status NOT IN ('archived','deleted') FOR SHARE`, [input.organizationId,input.projectId]);
  if (parent.rows.length !== 1 || !await canAccessReportProject(input.organizationId, { userId: input.recipientUserId, role }, input.projectId, client, { forWrite: true })) {
    throw new Error('Alignment review project access is unavailable.');
  }
}

function alignmentIssueDescription(code: SystemAlignmentTaskInput['issueCode']): string {
  return code === 'conflict' ? 'Active standing rules conflict. An authorized human must inspect their ledger and record an explicit resolution.'
    : 'A standing rule could not be matched to its recorded human decision or correction source. An authorized human must inspect and repair its ledger.';
}

function assertAlignmentJob(input: SystemAlignmentTaskInput): void {
  const scope = getTenantScope();
  const validIds = [input.organizationId,input.recipientUserId,...(input.projectId === null ? [] : [input.projectId])].every(id => Number.isSafeInteger(id) && id > 0);
  if (!validIds || !validAlignmentVersions(input.ruleVersions) || !/^[a-f0-9]{64}$/.test(input.taskKey) || !['conflict','unverified_rule'].includes(input.issueCode) ||
    scope?.source !== 'job' || scope.caller !== 'alignment-digest:rule_review' || scope.tenantId !== String(input.organizationId) || scope.accountId != null || scope.role) {
    throw new Error('A verified organization alignment job is required to create a system review task.');
  }
}

function validAlignmentVersions(refs: SystemAlignmentTaskInput['ruleVersions']): boolean {
  return refs === undefined || (Array.isArray(refs) && refs.length <= 1000 && refs.every(ref =>
    /^[A-Za-z0-9_-]{1,160}$/.test(ref.bundleId) && Number.isSafeInteger(ref.version) && ref.version > 0));
}
