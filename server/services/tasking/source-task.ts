/**
 * One open task per source record, in the one task store (unified_tasks).
 *
 * A governed act says which task its record should have open now. This closes
 * the record's open task and writes that one, or leaves the open task when it
 * already records the same thing. The due-date sweep (jobs/taskDueSweep.ts)
 * reminds the assignee, with the notice `metadata.remindDaysBefore` asks for,
 * and once more when it is overdue. No scheduler of its own.
 *
 * Written best effort after the governed act commits: a task that did not land
 * is logged, and never undoes the act. Used by a controlled document's periodic
 * review (services/qms/periodic-review-task.ts), a CAPA's target close and its
 * action items' due dates (services/capa-mdr/capa-tasks.ts), and training on a
 * controlled document, one task per person (services/qms/training-task.ts),
 * which reconciles every key under one prefix at once.
 *
 * @module server/services/tasking/source-task
 */
import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { db } from '../../db';
import { withTenantConnection } from '../../db/withTenantConnection';
import type { RequestSqlClient } from '../../db/requestDb';
import * as schema from '../../../shared/schema';
import { stableStringify } from '../../../shared/canonical-json';
import { ACTION_TRANSITIONS, CAPA_TRANSITIONS } from '../../../shared/constants/capa-lifecycle';
import { DEVIATION_CLASSIFICATIONS, DEVIATION_STATUSES } from '../../../shared/constants/deviation-lifecycle';
import unifiedTaskService, { type UnifiedTaskInput, type TaskWriteRunner } from '../unifiedTaskService';
import { readProgramAnchorRow } from '../c2c/program-project-anchor';
import { readCurrentProgramActor } from '../c2c/current-program-access';
import { canAccessReportProject } from '../report-os/project-access';
import { GOVERNED_WRITE_ROLES } from '../../middleware/orgMembership';
import { admitTaskCreationProject } from './task-project';
import { auditTaskActionInTx } from './task-audit';
import { authorizeQmsContentRead } from '../qms/controlled-document-content';
import { authorizeQmsTrainingRead, isQmsTrainingAssignee, readTrainingDocument } from '../qms/training-assignment';
import { readQmsTrainingReleaseContext } from '../qms/current-release-approval';
import { isPendingEffective, resolveInForceRelease } from '../qms/in-force-release';
import { createScopedLogger } from '../../utils/logger';

const log = createScopedLogger('source-task');
const CLOSED = ['completed', 'cancelled'];

export type SourceTaskOutcome = 'scheduled' | 'unchanged' | 'closed' | 'failed';

/** The task a record should have open now, without the keys the record supplies. */
export type SourceTaskNext = Omit<UnifiedTaskInput, 'organizationId' | 'sourceEntityType' | 'sourceEntityId'>;

export interface ReplaceSourceTask {
  organizationId: number;
  sourceEntityType: string;
  sourceEntityId: string;
  /** Null closes the open task and writes none. */
  next: SourceTaskNext | null;
  /** True when an open task's metadata already records what `next` would. */
  same: (metadata: Record<string, unknown>) => boolean;
  /** How the open task ends: done by this act, or withdrawn with its record. */
  closeAs: 'completed' | 'cancelled';
  /** Who did the act: closes the open task, and is the new task's creator unless `next` names one. */
  actorId: number;
}

/** The task one key should have open now, and how to tell an open task already records it. */
export interface DesiredSourceTask {
  next: SourceTaskNext;
  same: (metadata: Record<string, unknown>) => boolean;
}

export interface ReconcileSourceTasks {
  organizationId: number;
  sourceEntityType: string;
  /** The keys this act speaks for: one, or every key that starts with the prefix (matched literally, no wildcards). */
  match: { exact: string } | { prefix: string };
  /** Every key in `match` that should have a task open; an open task under any other key is closed. */
  desired: ReadonlyMap<string, DesiredSourceTask>;
  /** How an open task that is no longer desired ends. */
  closeAs: (sourceEntityId: string) => 'completed' | 'cancelled';
  actorId: number;
}

export interface ReconcileSourceTasksResult {
  kept: number;
  closed: number;
  written: Array<{ sourceEntityId: string; taskId: string }>;
  /** True when a read or write failed part way: what is counted above happened, the rest did not. */
  failed: boolean;
}

type OpenSourceTask = {
  taskId: string; status: unknown; metadata: unknown; sourceEntityId: string | null;
  projectId?: number | null; clientWorkspaceId?: number | null; assigneeId?: number | null;
  title?: string; description?: string | null; priority?: string | null;
};

const NATIVE_PROJECT_SOURCES = new Set(['capa_record', 'capa_action', 'qms_periodic_review', 'qms_training']);
const ORGANIZATION_RECORD_KEYS = new Map([
  ['qms_internal_audit', /^qms-internal-audit:([1-9]\d{0,9})$/],
  ['qms_deviation', /^qms-deviation:([1-9]\d{0,9})$/],
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isCapaSource = (source: string) => ['capa_record', 'capa_action'].includes(source);
const dueDay = (value: unknown): string | null => {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
};

async function readCapaTaskRecord(q: RequestSqlClient, input: ReconcileSourceTasks, key: string) {
  const record = input.sourceEntityType === 'capa_record';
  const prefix = record ? 'capa:' : 'capa-action:';
  const id = key.startsWith(prefix) ? key.slice(prefix.length) : '';
  if (!UUID.test(id)) throw new Error('Invalid CAPA task source');
  const statement = record
    ? `SELECT c.program_id,c.assigned_to,c.created_by,c.target_close_date AS due_at,c.state FROM capa_records c
        JOIN regulatory_programs p ON p.id::text=c.program_id AND p.organization_id=$2 AND p.deleted_at IS NULL
        WHERE c.id=$1::uuid FOR SHARE OF c,p`
    : `SELECT c.program_id,a.owner,a.due_date AS due_at,a.state FROM capa_actions a JOIN capa_records c ON c.id=a.capa_id
        JOIN regulatory_programs p ON p.id::text=c.program_id AND p.organization_id=$2 AND p.deleted_at IS NULL
        WHERE a.id=$1::uuid FOR SHARE OF a,c,p`;
  const { rows } = await q.query(statement, [id, input.organizationId]);
  if (rows.length !== 1) throw new Error('The native Quality task owner could not be verified');
  return rows[0];
}

/** Null means the current native record still owes a dated task. */
function currentCapaClosure(source: string, row: Record<string, unknown>): 'completed' | 'cancelled' | null {
  const record = source === 'capa_record';
  const states = record ? CAPA_TRANSITIONS : ACTION_TRANSITIONS;
  if (typeof row.state !== 'string' || !Object.prototype.hasOwnProperty.call(states, row.state)
    || row.due_at !== null && !dueDay(row.due_at)) throw new Error('The current native CAPA lifecycle could not be verified');
  const completed = record ? ['closed_effective', 'closed_not_effective'].includes(row.state) : row.state === 'done';
  if (completed) return 'completed';
  return row.state === 'cancelled' || row.due_at === null ? 'cancelled' : null;
}

function verifyCurrentCapaPlan(input: ReconcileSourceTasks, key: string, row: Record<string, unknown>) {
  const closure = currentCapaClosure(input.sourceEntityType, row);
  const wanted = input.desired.get(key);
  const assignee = capaAssignee(row, input.sourceEntityType === 'capa_record');
  if (wanted && assignee !== null && wanted.next.assigneeId !== assignee) {
    throw new Error('The task plan no longer matches the current native CAPA assignee; the previous task was preserved');
  }
  const closeAs = input.closeAs(key);
  const valid = wanted
    ? closure === null && dueDay(row.due_at) === dueDay(wanted.next.dueDate) && closeAs === 'cancelled'
    : closure !== null && closure === closeAs;
  if (!valid) throw new Error('The task plan no longer matches the current native CAPA lifecycle or date; the previous task was preserved');
}

async function controlledDocumentTaskProgram(q: RequestSqlClient, organizationId: number, id: string, actorId: number) {
  const { rows } = await q.query(`SELECT authoring_document_id::text AS authoring_document_id FROM qms_documents
    WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL FOR SHARE`, [id, organizationId]);
  if (rows.length !== 1) throw new Error('The native Quality task owner could not be verified');
  const authored = rows[0].authoring_document_id;
  if (authored === null) return null;
  if (typeof authored !== 'string' || !UUID.test(authored)) throw new Error('The controlled document binding could not be verified');
  await authorizeQmsContentRead(q, organizationId, actorId, { id: Number(id), organization_id: organizationId, authoring_document_id: authored });
  const binding = await q.query(`SELECT a.client_program_id::text AS program_id FROM authoring_documents a
    JOIN regulatory_programs p ON p.id=a.client_program_id AND p.organization_id=a.tenant_id AND p.deleted_at IS NULL
    WHERE a.id=$1::uuid AND a.tenant_id=$2 FOR SHARE OF a,p`, [authored, organizationId]);
  const programId = binding.rows.length === 1 ? binding.rows[0].program_id : null;
  if (typeof programId !== 'string' || !UUID.test(programId)) throw new Error('The controlled document project could not be verified');
  return programId;
}

/** Native keys identify the authority to re-read; claimed project ids and metadata never do. */
async function nativeTaskPlacement(q: RequestSqlClient, input: ReconcileSourceTasks, key: string) {
  let programId: unknown;
  if (input.sourceEntityType === 'qms_periodic_review') {
    const match = /^qms-document:([1-9]\d{0,9})$/.exec(key);
    if (!match || Number(match[1]) > 2_147_483_647) throw new Error('Invalid controlled-document task source');
    programId = await controlledDocumentTaskProgram(q, input.organizationId, match[1], input.actorId);
    if (programId === null) return null;
  } else {
    const row = await readCapaTaskRecord(q, input, key);
    verifyCurrentCapaPlan(input, key, row);
    programId = row.program_id;
  }
  if (typeof programId !== 'string' || !UUID.test(programId)) throw new Error('The native Quality task project could not be verified');
  const anchor = await readProgramAnchorRow(q, { programId, orgId: input.organizationId,
    context: 'quality-source-task', requireUnique: true });
  if (!anchor) throw new Error('The native Quality task needs one verified project anchor');
  // A QMS signer may approve this document with project read access; placing its reminder grants no project write.
  if (input.sourceEntityType === 'qms_periodic_review') return { projectId: anchor.id, clientWorkspaceId: anchor.clientWorkspaceId };
  return admitTaskCreationProject(q, { organizationId: input.organizationId, actorUserId: input.actorId, projectId: anchor.id });
}

async function currentTrainingRelease(q: RequestSqlClient, organizationId: number, documentId: number) {
  const live = await readTrainingDocument(q, organizationId, documentId, true);
  if (!live) throw new Error('The training document could not be verified');
  const release = isPendingEffective(live) || live.status === 'effective'
    ? live : (await resolveInForceRelease(q, live))?.release;
  if (!release) throw new Error('The current training release could not be verified');
  return release;
}

/** Assignment grants reading the released text only. Project placement adds no permission. */
async function trainingTaskPlacement(q: RequestSqlClient, input: ReconcileSourceTasks, key: string, task: DesiredSourceTask) {
  const match = /^qms-document:([1-9]\d{0,9}):user:([1-9]\d{0,9})$/.exec(key);
  if (!match || Number(match[1]) > 2_147_483_647 || Number(match[2]) > 2_147_483_647 || task.next.assigneeId !== Number(match[2])) {
    throw new Error('The training task does not name its assigned reader');
  }
  const documentId = Number(match[1]), readerId = Number(match[2]);
  const release = await currentTrainingRelease(q, input.organizationId, documentId);
  if (!await isQmsTrainingAssignee(q, input.organizationId, documentId, readerId)) throw new Error('The training assignment is no longer current');
  await authorizeQmsTrainingRead(q, input.organizationId, readerId, release);
  const { context } = await readQmsTrainingReleaseContext(q, release, new Date(), { lock: true, ahead: true });
  if (!context.eligible || !context.contentDigest || task.next.metadata?.version !== String(release.version)) {
    throw new Error('The task does not name the current verified training release');
  }
  if (!release.authoring_document_id) return null;
  const { rows } = await q.query(`SELECT a.client_program_id FROM authoring_documents a JOIN regulatory_programs p
    ON p.id=a.client_program_id AND p.organization_id=a.tenant_id AND p.deleted_at IS NULL
    WHERE a.id=$1::uuid AND a.tenant_id=$2 FOR SHARE OF a,p`, [release.authoring_document_id, input.organizationId]);
  const programId = rows.length === 1 ? rows[0].client_program_id : null;
  if (typeof programId !== 'string' || !UUID.test(programId)) throw new Error('The training document project could not be verified');
  const anchor = await readProgramAnchorRow(q, { programId, orgId: input.organizationId, context: 'assigned-training-task', requireUnique: true });
  if (!anchor) throw new Error('The training document needs one verified project anchor');
  // The existing QMS producer authorized its act; an assigned reader is not required to be a project writer.
  return { projectId: anchor.id, clientWorkspaceId: anchor.clientWorkspaceId };
}

function validInternalAuditRow(row: Record<string, unknown> | null): row is Record<string, unknown> {
  return row !== null && ['planned', 'in_progress', 'closed', 'cancelled'].includes(String(row.status))
    && typeof row.audit_number === 'string' && row.audit_number.length > 0 && typeof row.scope === 'string' && row.scope.length > 0
    && (row.planned_date === null || !!dueDay(row.planned_date))
    && (row.auditor_lead_id === null || Number.isSafeInteger(row.auditor_lead_id) && Number(row.auditor_lead_id) > 0);
}

function validDeviationRow(row: Record<string, unknown> | null): row is Record<string, unknown> {
  return row !== null && DEVIATION_STATUSES.some(status => status === row.status)
    && DEVIATION_CLASSIFICATIONS.some(classification => classification === row.classification)
    && typeof row.deviation_number === 'string' && row.deviation_number.length > 0 && typeof row.title === 'string' && row.title.length > 0
    && (row.target_closure_date === null || !!dueDay(row.target_closure_date));
}

async function readOrganizationTaskPlan(q: RequestSqlClient, input: ReconcileSourceTasks, id: number) {
  const audit = input.sourceEntityType === 'qms_internal_audit';
  const statement = audit
    ? `SELECT id,audit_number,scope,status,planned_date,auditor_lead_id FROM qms_internal_audits WHERE id=$1 AND organization_id=$2 FOR SHARE`
    : `SELECT id,deviation_number,title,classification,status,target_closure_date FROM qc_deviations WHERE id=$1 AND organization_id=$2 FOR SHARE`;
  const { rows } = await q.query(statement, [id, input.organizationId]);
  const row = rows.length === 1 ? rows[0] : null;
  if (!(audit ? validInternalAuditRow(row) : validDeviationRow(row))) throw new Error('The current native Quality record could not be verified');
  // Both pure planners import this writer; load them after initialization and reuse their one policy.
  const { internalAuditTaskPlan, deviationTaskPlan } = await import('../qms/qms-record-tasks');
  return audit ? internalAuditTaskPlan(row as unknown as Parameters<typeof internalAuditTaskPlan>[0], input.actorId)
    : deviationTaskPlan(row as unknown as Parameters<typeof deviationTaskPlan>[0], input.actorId);
}

/** These organization records grant no project placement; native status/date/classification own the plan. */
async function currentOrganizationRecordInput(q: RequestSqlClient, input: ReconcileSourceTasks): Promise<ReconcileSourceTasks> {
  const key = 'exact' in input.match ? input.match.exact : '';
  const match = ORGANIZATION_RECORD_KEYS.get(input.sourceEntityType)?.exec(key);
  if (!match || Number(match[1]) > 2_147_483_647 || [...input.desired.keys()].some(id => id !== key)) {
    throw new Error('Invalid native Quality task source');
  }
  const actor = await readCurrentProgramActor(q, { organizationId: input.organizationId, userId: input.actorId, forShare: true });
  if (!GOVERNED_WRITE_ROLES.has(actor.role)) throw new Error('Current Quality write authority is required');
  const plan = await readOrganizationTaskPlan(q, input, Number(match[1]));
  const wanted = input.desired.get(key);
  if (Boolean(wanted) !== Boolean(plan.next) || stableStringify(wanted?.next ?? null) !== stableStringify(plan.next)
    || input.closeAs(key) !== plan.closeAs) {
    throw new Error('The task plan no longer matches the current native Quality record; the previous task was preserved');
  }
  const desired = new Map<string, DesiredSourceTask>();
  if (plan.next) desired.set(key, { next: plan.next, same: plan.same });
  return { ...input, desired, closeAs: () => plan.closeAs };
}

async function desiredQualityTaskPlacement(q: RequestSqlClient, input: ReconcileSourceTasks, id: string, task: DesiredSourceTask) {
  if (ORGANIZATION_RECORD_KEYS.has(input.sourceEntityType)) return null;
  return input.sourceEntityType === 'qms_training'
    ? trainingTaskPlacement(q, input, id, task) : nativeTaskPlacement(q, input, id);
}

/** The open tasks under `match`, by key: one SELECT, the prefix matched literally and checked again on each row read. */
async function readOpenTasks(input: ReconcileSourceTasks, inScope: (id: string) => boolean, runner: TaskWriteRunner = db): Promise<Map<string, OpenSourceTask[]>> {
  const { match } = input;
  const key = 'exact' in match
    ? eq(schema.unifiedTasks.sourceEntityId, match.exact)
    : sql`left(${schema.unifiedTasks.sourceEntityId}, ${match.prefix.length}) = ${match.prefix}`;
  const openTasks: OpenSourceTask[] = await runner
    .select({ taskId: schema.unifiedTasks.taskId, status: schema.unifiedTasks.status, metadata: schema.unifiedTasks.metadata,
      sourceEntityId: schema.unifiedTasks.sourceEntityId, projectId: schema.unifiedTasks.projectId,
      clientWorkspaceId: schema.unifiedTasks.clientWorkspaceId, assigneeId: schema.unifiedTasks.assigneeId,
      title: schema.unifiedTasks.title, description: schema.unifiedTasks.description, priority: schema.unifiedTasks.priority })
    .from(schema.unifiedTasks)
    .where(and(
      eq(schema.unifiedTasks.organizationId, input.organizationId),
      eq(schema.unifiedTasks.sourceEntityType, input.sourceEntityType),
      key,
      notInArray(schema.unifiedTasks.status, CLOSED),
      isNull(schema.unifiedTasks.deletedAt),
    ));
  const byKey = new Map<string, OpenSourceTask[]>();
  for (const task of openTasks) {
    const id = 'exact' in match ? match.exact : String(task.sourceEntityId);
    if (inScope(id)) byKey.set(id, [...(byKey.get(id) ?? []), task]);
  }
  return byKey;
}

interface SourceTaskTransaction { runner: TaskWriteRunner; client: RequestSqlClient }

const nativeUserId = (value: unknown): number | null => {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const id = /^[1-9]\d*$/.test(text) ? Number(text) : NaN;
  return Number.isSafeInteger(id) && id <= 2_147_483_647 ? id : null;
};
const capaAssignee = (owner: Record<string, unknown>, record: boolean) => record
  ? nativeUserId(owner.assigned_to) ?? nativeUserId(owner.created_by) : nativeUserId(owner.owner);
const capaAssigneeChanged = (source: string, open: OpenSourceTask[], next?: SourceTaskNext) => !!next
  && isCapaSource(source) && open.some(task => (task.assigneeId ?? null) !== (next.assigneeId ?? null));

/** A delayed producer must not restore an old owner over the current native record. */
async function verifyCapaAssigneeChange(input: ReconcileSourceTasks, key: string, wanted: DesiredSourceTask,
  { client: q }: SourceTaskTransaction): Promise<void> {
  const record = input.sourceEntityType === 'capa_record';
  const owner = await readCapaTaskRecord(q, input, key);
  const assignee = capaAssignee(owner, record);
  if (!assignee || assignee !== wanted.next.assigneeId) {
    throw new Error('The current native CAPA assignment could not be verified; the previous task was preserved');
  }
  // Retain the existing named-task assignment policy, not a new permission or assignment writer.
  const actor = await readCurrentProgramActor(q, { organizationId: input.organizationId, userId: assignee, forShare: true });
  if (!GOVERNED_WRITE_ROLES.has(actor.role)) throw new Error('The CAPA assignee is not eligible for this task');
  const projectId = wanted.next.projectId!;
  await q.query('SELECT user_id FROM project_members WHERE organization_id=$1 AND project_id=$2 AND user_id=$3 FOR SHARE', [input.organizationId, projectId, assignee]);
  await q.query(`SELECT ra.artifact_id FROM concept2cure_review_assignments ra JOIN concept2cure_artifacts a ON a.id=ra.artifact_id
    WHERE ra.organization_id=$1 AND a.organization_id=$1 AND a.project_id=$2 AND ra.reviewer_id=$3 AND ra.status='pending' FOR SHARE OF ra,a`, [input.organizationId, projectId, assignee]);
  if (!await canAccessReportProject(input.organizationId, actor, projectId, q)) throw new Error('The CAPA assignee cannot access this project');
}

/** Correct placement without claiming the work completed or replacing its task identity. */
async function repairTaskPlacement(input: ReconcileSourceTasks, id: string, task: OpenSourceTask, wanted: DesiredSourceTask,
  tx: SourceTaskTransaction): Promise<void> {
  const { organizationId, sourceEntityType } = input;
  const before = { projectId: task.projectId ?? null, clientWorkspaceId: task.clientWorkspaceId ?? null };
  const after = { projectId: wanted.next.projectId ?? null, clientWorkspaceId: wanted.next.clientWorkspaceId ?? null };
  if (before.projectId === after.projectId && before.clientWorkspaceId === after.clientWorkspaceId) return;
  const changed = await tx.runner.update(schema.unifiedTasks).set({ ...after, updatedAt: new Date(), lastModifiedBy: input.actorId })
    .where(and(eq(schema.unifiedTasks.taskId, task.taskId), eq(schema.unifiedTasks.organizationId, organizationId),
      eq(schema.unifiedTasks.sourceEntityType, sourceEntityType), eq(schema.unifiedTasks.sourceEntityId, id),
      eq(schema.unifiedTasks.status, String(task.status)), isNull(schema.unifiedTasks.deletedAt)))
    .returning({ taskId: schema.unifiedTasks.taskId });
  if (changed.length !== 1) throw new Error('The source task changed before its project could be reconciled');
  await auditTaskActionInTx(tx.client, { orgId: organizationId, userId: input.actorId, command: 'task.link', taskId: task.taskId,
    payload: { sourceEntityType, sourceEntityId: id, before, after }, summary: 'Reconciled the task with its recorded Quality project' });
}

function managedQualityTaskFields(source: string, task: Pick<OpenSourceTask, 'title' | 'description' | 'priority'>): {
  title: string | null; description: string | null; priority?: string | null;
} {
  const text = { title: task.title ?? null, description: task.description ?? null };
  return source === 'qms_deviation' ? { ...text, priority: task.priority ?? null } : text;
}

/** Current native fields are refreshed without replacing the person's other task work. */
async function refreshOrganizationTaskFields(input: ReconcileSourceTasks, id: string, task: OpenSourceTask, wanted: DesiredSourceTask,
  tx: SourceTaskTransaction): Promise<void> {
  if (!ORGANIZATION_RECORD_KEYS.has(input.sourceEntityType)) return;
  const deviation = input.sourceEntityType === 'qms_deviation';
  const before = managedQualityTaskFields(input.sourceEntityType, task), after = managedQualityTaskFields(input.sourceEntityType, wanted.next);
  if (stableStringify(before) === stableStringify(after)) return;
  const values: unknown[] = [after.title,after.description,input.actorId,task.taskId,input.organizationId,input.sourceEntityType,id,String(task.status),before.title,before.description];
  const statement = deviation ? `UPDATE unified_tasks SET title=$1,description=$2,priority=$11,updated_at=NOW(),last_modified_by=$3
    WHERE task_id=$4 AND organization_id=$5 AND source_entity_type=$6 AND source_entity_id=$7 AND status=$8
      AND title IS NOT DISTINCT FROM $9 AND description IS NOT DISTINCT FROM $10 AND priority IS NOT DISTINCT FROM $12
      AND deleted_at IS NULL RETURNING task_id`
    : `UPDATE unified_tasks SET title=$1,description=$2,updated_at=NOW(),last_modified_by=$3
    WHERE task_id=$4 AND organization_id=$5 AND source_entity_type=$6 AND source_entity_id=$7 AND status=$8
      AND title IS NOT DISTINCT FROM $9 AND description IS NOT DISTINCT FROM $10 AND deleted_at IS NULL RETURNING task_id`;
  if (deviation) values.push(after.priority, before.priority);
  const changed = await tx.client.query(statement, values);
  if (changed.rows.length !== 1) throw new Error('The source task changed before its fields could be reconciled');
  await auditTaskActionInTx(tx.client, { orgId: input.organizationId, userId: input.actorId, command: 'task.transition', taskId: task.taskId,
    payload: { sourceEntityType: input.sourceEntityType, sourceEntityId: id, before: task.status, after: task.status,
      ...(deviation ? { fields: { before, after } } : { text: { before, after } }) },
    summary: deviation ? 'Updated task fields from its current Quality deviation record' : 'Updated task text from its current Quality audit record' });
}

async function closeSourceTask(input: ReconcileSourceTasks, id: string, task: OpenSourceTask, tx?: SourceTaskTransaction) {
  const { organizationId, sourceEntityType } = input;
  const options = { organizationId, expectedStatus: String(task.status) };
  const status = input.closeAs(id);
  if (!tx) return unifiedTaskService.updateTaskStatus(task.taskId, status, input.actorId, options);
  const changed = await unifiedTaskService.updateTaskStatus(task.taskId, status, input.actorId, options, tx.runner);
  if (!changed) throw new Error('The source task changed before its status could be reconciled');
  await auditTaskActionInTx(tx.client, { orgId: organizationId, userId: input.actorId, command: 'task.transition', taskId: task.taskId,
    payload: { sourceEntityType, sourceEntityId: id, before: task.status, after: status } });
}

function sourceTaskUnchanged(open: OpenSourceTask[], wanted: DesiredSourceTask): boolean {
  return open.length === 1 && wanted.same((open[0].metadata ?? {}) as Record<string, unknown>);
}

/** One key: keep its open task when it records the same thing; otherwise close what is open and write what is wanted. */
async function reconcileKey(input: ReconcileSourceTasks, id: string, open: OpenSourceTask[], result: ReconcileSourceTasksResult,
  tx?: SourceTaskTransaction): Promise<void> {
  const { organizationId, sourceEntityType } = input;
  const wanted = input.desired.get(id);
  const assigneeChanged = capaAssigneeChanged(sourceEntityType, open, wanted?.next);
  if (assigneeChanged && tx) await verifyCapaAssigneeChange(input, id, wanted!, tx);
  if (wanted && !assigneeChanged && sourceTaskUnchanged(open, wanted)) {
    if (tx) {
      await refreshOrganizationTaskFields(input, id, open[0], wanted, tx);
      await repairTaskPlacement(input, id, open[0], wanted, tx);
    }
    result.kept += 1; return;
  }
  for (const task of open) {
    await closeSourceTask(input, id, task, tx);
    result.closed += 1;
  }
  if (!wanted) return;
  const next = { createdById: input.actorId, ...wanted.next, organizationId, sourceEntityType, sourceEntityId: id };
  const task = tx ? await unifiedTaskService.createUnifiedTask(next, tx.runner) : await unifiedTaskService.createUnifiedTask(next);
  if (tx) await auditTaskActionInTx(tx.client, { orgId: organizationId, userId: input.actorId, command: 'task.create', taskId: task.taskId,
    payload: { sourceEntityType, sourceEntityId: id, projectId: wanted.next.projectId ?? null } });
  result.written.push({ sourceEntityId: id, taskId: String(task.taskId) });
}

/**
 * Make the open tasks under `match` exactly `desired`: an open task that records
 * the same thing is kept, any other is closed, and a missing one is written.
 * One SELECT of the open tasks. Never throws.
 */
export async function reconcileSourceTasks(input: ReconcileSourceTasks): Promise<ReconcileSourceTasksResult> {
  const { organizationId, sourceEntityType, match } = input;
  const result: ReconcileSourceTasksResult = { kept: 0, closed: 0, written: [], failed: false };
  try {
    if (NATIVE_PROJECT_SOURCES.has(sourceEntityType) || ORGANIZATION_RECORD_KEYS.has(sourceEntityType)) return await reconcileQualityTasks(input);
    const inScope = (id: string) => ('exact' in match ? id === match.exact : id.startsWith(match.prefix));
    const byKey = await readOpenTasks(input, inScope);
    for (const id of new Set([...byKey.keys(), ...[...input.desired.keys()].filter(inScope)])) {
      await reconcileKey(input, id, byKey.get(id) ?? [], result);
    }
  } catch (err) {
    result.failed = true;
    log.warn('The tasks could not all be written; the governed act stands', {
      organizationId, sourceEntityType, match, err: err instanceof Error ? err.message : String(err),
    });
  }
  return result;
}

function sourceTaskLockKey(input: ReconcileSourceTasks): string {
  const key = 'exact' in input.match ? input.match.exact : input.match.prefix;
  if (input.sourceEntityType !== 'qms_training') return `${input.sourceEntityType}:${key}`;
  const match = ('exact' in input.match
    ? /^qms-document:([1-9]\d{0,9}):user:([1-9]\d{0,9})$/
    : /^qms-document:([1-9]\d{0,9}):user:$/).exec(key);
  if (!match || Number(match[1]) > 2_147_483_647 || match[2] && Number(match[2]) > 2_147_483_647) throw new Error('Invalid training task scope');
  // Whole-document and personal plans overlap; both must serialize on their document.
  return `qms_training:qms-document:${match[1]}`;
}

function qualityTaskKeys(input: ReconcileSourceTasks, open: Map<string, OpenSourceTask[]>, desired: Map<string, DesiredSourceTask>) {
  const keys = new Set([...open.keys(), ...desired.keys()]);
  if (isCapaSource(input.sourceEntityType) && 'exact' in input.match) keys.add(input.match.exact);
  return keys;
}

/** The governed act has committed; native task placement owns a fresh scoped transaction. */
async function reconcileQualityTasks(input: ReconcileSourceTasks): Promise<ReconcileSourceTasksResult> {
  return withTenantConnection({ tenantId: input.organizationId, source: 'job', caller: 'quality-source-task' }, async q => {
    await q.query('BEGIN');
    try {
      if (input.sourceEntityType === 'qms_training' || input.sourceEntityType === 'qms_periodic_review') await readCurrentProgramActor(q, {
        organizationId: input.organizationId, userId: input.actorId, forShare: true,
      });
      await q.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [String(input.organizationId), sourceTaskLockKey(input)]);
      const currentInput = ORGANIZATION_RECORD_KEYS.has(input.sourceEntityType) ? await currentOrganizationRecordInput(q, input) : input;
      const inScope = (id: string) => 'exact' in input.match ? id === input.match.exact : id.startsWith(input.match.prefix);
      const desired = new Map<string, DesiredSourceTask>();
      for (const [id, task] of currentInput.desired) {
        if (!inScope(id)) continue;
        const place = await desiredQualityTaskPlacement(q, input, id, task);
        desired.set(id, { ...task, next: { ...task.next, projectId: place?.projectId, clientWorkspaceId: place?.clientWorkspaceId ?? undefined } });
      }
      const scoped = { ...currentInput, desired };
      const runner = drizzle(q, { schema });
      const result: ReconcileSourceTasksResult = { kept: 0, closed: 0, written: [], failed: false };
      const byKey = await readOpenTasks(scoped, inScope, runner);
      for (const id of qualityTaskKeys(input, byKey, desired)) {
        if (isCapaSource(input.sourceEntityType) && !desired.has(id)) await nativeTaskPlacement(q, scoped, id);
        await reconcileKey(scoped, id, byKey.get(id) ?? [], result, { runner, client: q });
      }
      await q.query('COMMIT');
      return result;
    } catch (error) {
      await q.query('ROLLBACK');
      throw error;
    }
  });
}

/** Close the record's open task and, when `next` is given, write it. Never throws. */
export async function replaceSourceTask(input: ReplaceSourceTask): Promise<SourceTaskOutcome> {
  const { sourceEntityId, next } = input;
  const result = await reconcileSourceTasks({
    organizationId: input.organizationId,
    sourceEntityType: input.sourceEntityType,
    match: { exact: sourceEntityId },
    desired: new Map(next ? [[sourceEntityId, { next, same: input.same }]] : []),
    closeAs: () => input.closeAs,
    actorId: input.actorId,
  });
  if (result.failed) return 'failed';
  if (!next) return 'closed';
  return result.written.length ? 'scheduled' : 'unchanged';
}
