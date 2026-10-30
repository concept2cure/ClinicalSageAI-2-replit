/**
 * Training on a controlled document, as a task for each person assigned
 * (P-49 distribution, P-50 Q1; docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md
 * §3.6, §3.9). A sibling of periodic-review-task.ts, in the one task store
 * (unified_tasks, module Quality), keyed `qms-document:<id>:user:<userId>`.
 *
 * One open task per person per document, for the version they must train on
 * next: the version approved for a later day while it waits, otherwise the
 * version in force. It is due on the day that version takes effect; a person
 * covered after it took effect is due 14 days after they were covered (P-50
 * Q1). A person with a verified, unexpired receipt of that version has none.
 * The due-date sweep (jobs/taskDueSweep.ts) gives seven days' notice and one
 * overdue notice; a task is written with the markers its assignment notice
 * already covers, so a task born past due is never also told "overdue".
 *
 * Each governed act that changes who must train on what plans the tasks of the
 * documents it touched, after it commits and before it answers:
 *   - approval of a version, retirement, an assignment added or removed: the document;
 *   - a person added to or removed from a job role: that person, on each document the role is assigned;
 *   - an acknowledgement: that person, on that document.
 * The plan is read in its own read-only transaction with the tenant set. A plan
 * that could not be read applies nothing, so a failed read never closes a task.
 * Writing is best effort and never undoes the act. No scheduler: the effective
 * date arriving changes nothing, because the task was already due on it.
 *
 * Compliance is the receipts (training-compliance.ts), never the task: a task
 * closed by hand on the Tasks board is written again by the next act that plans
 * its document.
 *
 * @module server/services/qms/training-task
 */
import type { TrainingSqlClient } from './training';
import type { QmsDocumentRow } from './document-approval-signature';
import { readQmsTrainingReleaseContext } from './current-release-approval';
import { dayOrNull, isPendingEffective, readInForceReleases } from './in-force-release';
import { readQmsTrainingAssignees } from './training-assignment';
import { verifiedTrainingReceipt } from './training-content';
import { reconcileSourceTasks, type DesiredSourceTask } from '../tasking/source-task';
import { notifyTaskEvent } from '../tasking/task-side-effects';
import { setTenantContextTx } from '../tenant/governed-tenant-context';
import { QMS_TRAINABLE_DOCUMENT_TYPES } from '../../../shared/qms/training';
import { createScopedLogger } from '../../utils/logger';

const log = createScopedLogger('qms-training-task');
const DAY_MS = 24 * 60 * 60 * 1000;

export const TRAINING_TASK_SOURCE = 'qms_training';
/** The due-soon notice before the due day (taskDueSweep reads it). */
export const TRAINING_REMIND_DAYS = 7;
/** P-50 Q1: someone covered after the version took effect is due this many days after they were covered. */
export const TRAINING_LATE_ASSIGNMENT_GRACE_DAYS = 14;

export const trainingTaskSourceId = (documentId: number, userId: number) => `qms-document:${documentId}:user:${userId}`;
/** Ends in ':' so document 1 never matches document 10. */
const prefixOf = (documentId: number) => `qms-document:${documentId}:user:`;
const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * The version a person trains on next: its version, the day it takes or took
 * effect, the moment it did (00:00 UTC that day, or its approval when approved
 * later that day), and whether that day is still ahead.
 */
export interface TrainingTarget { version: string; effectiveDay: string | null; effectiveAt: string | null; pending: boolean }

export interface TrainingTaskState {
  status: 'acknowledged' | 'due' | 'overdue';
  dueDate: string;
  /** Covered after the version took effect: due the grace days after they were covered. */
  lateAssignment: boolean;
  /** A receipt of a version not yet in force counts from its effective day. */
  countsFrom: string | null;
}

/**
 * One person's training on one document, today (design §3.6). Pure. Someone
 * covered after the version was in force is late (P-50 Q1): moments are
 * compared, not days, so a person assigned an hour after a same-day approval
 * gets the grace and one assigned before it does not.
 */
export function trainingTaskOf(target: TrainingTarget, acknowledged: boolean, coveredSince: string, today: string): TrainingTaskState {
  const covered = dayOrNull(coveredSince) ?? today;
  const lateAssignment = !target.pending && (target.effectiveAt === null || target.effectiveDay === null
    || Date.parse(coveredSince) > Date.parse(target.effectiveAt));
  const dueDate = lateAssignment ? addDays(covered, TRAINING_LATE_ASSIGNMENT_GRACE_DAYS) : (target.effectiveDay as string);
  const countsFrom = acknowledged && target.pending ? target.effectiveDay : null;
  if (acknowledged) return { status: 'acknowledged', dueDate, lateAssignment, countsFrom };
  return { status: today >= dueDate ? 'overdue' : 'due', dueDate, lateAssignment, countsFrom };
}

/** Who a plan speaks for: whole documents, or only some people on them. */
export interface TrainingTaskScope { documentIds: readonly number[]; userIds?: readonly number[] }

interface PlannedTask extends DesiredSourceTask { userId: number; notice: { title: string; body: string } }

export interface TrainingTaskPlan {
  documentId: number;
  /** The keys this plan speaks for: every person on the document, or exactly the people asked about. */
  keys: { prefix: string } | { exact: string[] };
  desired: Map<string, PlannedTask>;
  /** Keys of people holding a receipt of the version they train on: their open task is done, not withdrawn. */
  acknowledged: Set<string>;
}

/** The version each live row trains on next, or none: retired, superseded, a first draft, deleted, or not a trainable type. */
async function targetsOf(client: TrainingSqlClient, orgId: number, documentIds: readonly number[]) {
  const { rows } = await client.query(
    `SELECT * FROM qms_documents WHERE organization_id = $1 AND id = ANY($2::int[]) AND deleted_at IS NULL AND doc_type = ANY($3::text[])`,
    [orgId, [...documentIds], QMS_TRAINABLE_DOCUMENT_TYPES],
  );
  const live = rows as unknown as QmsDocumentRow[];
  const inForce = await readInForceReleases(client, orgId, live);
  const targets = new Map<number, QmsDocumentRow>();
  for (const row of live) {
    const release = isPendingEffective(row) || row.status === 'effective' ? row : inForce.get(Number(row.id))?.release;
    if (release) targets.set(Number(row.id), release);
  }
  return targets;
}

function targetOf(doc: QmsDocumentRow, today: string): TrainingTarget {
  const approvedAt = doc.approved_at ? new Date(doc.approved_at).toISOString() : null;
  const effectiveDay = dayOrNull(doc.effective_date) ?? dayOrNull(approvedAt);
  const startOfDay = effectiveDay ? `${effectiveDay}T00:00:00.000Z` : null;
  const effectiveAt = [startOfDay, approvedAt].filter((at): at is string => at !== null).sort().at(-1) ?? null;
  return { version: String(doc.version), effectiveDay, effectiveAt, pending: isPendingEffective(doc, today) };
}

function descriptionOf(doc: QmsDocumentRow, state: TrainingTaskState, target: TrainingTarget): string {
  const where = 'Read it in Quality, Controlled documents (Read and acknowledge): the acknowledgement is a personal attestation, not a signature.';
  if (target.pending) return `${doc.doc_number} ${doc.title} v${doc.version} is approved and takes effect on ${target.effectiveDay}. ${where} Your acknowledgement counts from then.`;
  if (state.lateAssignment) return `You were assigned to train on ${doc.doc_number} ${doc.title} v${doc.version}, which is in force. It is due ${state.dueDate}, ${TRAINING_LATE_ASSIGNMENT_GRACE_DAYS} days after you were assigned. ${where}`;
  return `${doc.doc_number} ${doc.title} v${doc.version} is in force from ${target.effectiveDay}. ${where}`;
}

function noticeBodyOf(doc: QmsDocumentRow, state: TrainingTaskState, target: TrainingTarget, today: string): string {
  if (target.pending) return `Due ${state.dueDate}, the day it takes effect. Your acknowledgement counts from then.`;
  if (state.dueDate <= today) return `${doc.doc_number} v${doc.version} is in force; read and acknowledge it now.`;
  return state.lateAssignment ? `${doc.doc_number} v${doc.version} is in force; read and acknowledge it by ${state.dueDate}.` : `Due ${state.dueDate}.`;
}

/** The sweep markers the assignment notice already covers (taskDueSweep's alreadyNotified). */
function markersOf(dueDate: string, today: string, now: Date): Record<string, string> {
  const at = now.toISOString();
  if (dueDate <= today) return { dueSoonNotifiedAt: at, overdueNotifiedAt: at };
  return dueDate <= addDays(today, TRAINING_REMIND_DAYS) ? { dueSoonNotifiedAt: at } : {};
}

/** The document, the version it trains on, and when: what every person's task on it shares. */
interface PlanningOf { doc: QmsDocumentRow; target: TrainingTarget; today: string; now: Date }

function plannedTask({ doc, target, today, now }: PlanningOf, userId: number, state: TrainingTaskState): PlannedTask {
  const version = String(doc.version);
  return {
    userId,
    same: (meta) => meta.version === version && meta.dueDate === state.dueDate,
    notice: { title: `Training: read and acknowledge ${doc.doc_number} v${version}`, body: noticeBodyOf(doc, state, target, today) },
    next: {
      moduleType: 'Quality',
      title: `Read and acknowledge ${doc.doc_number} v${version}`,
      description: descriptionOf(doc, state, target),
      category: 'qms-training',
      taskType: 'action',
      assigneeId: userId,
      priority: 'medium',
      dueDate: new Date(`${state.dueDate}T00:00:00Z`),
      tags: ['qms', 'training'],
      metadata: { documentId: Number(doc.id), userId, version, dueDate: state.dueDate, lateAssignment: state.lateAssignment,
        effectiveDate: target.effectiveDay, remindDaysBefore: TRAINING_REMIND_DAYS, kind: 'acknowledge', ...markersOf(state.dueDate, today, now) },
    },
  };
}

/**
 * Read-only: for each document in scope, the task each person assigned should
 * have open now, and who has already acknowledged the version they train on.
 * Runs on a client inside a transaction with the tenant set.
 */
export async function planTrainingTasks(client: TrainingSqlClient, orgId: number, scope: TrainingTaskScope, now = new Date()): Promise<TrainingTaskPlan[]> {
  const documentIds = [...new Set(scope.documentIds)];
  if (documentIds.length === 0) return [];
  const today = now.toISOString().slice(0, 10);
  const targets = await targetsOf(client, orgId, documentIds);
  const assigned = await readQmsTrainingAssignees(client, orgId, documentIds, scope.userIds ? { userIds: scope.userIds } : {});
  const { rows } = await client.query(
    `SELECT t.* FROM qms_training_records t
      WHERE t.organization_id = $1 AND t.document_id = ANY($2::int[])
        AND t.acknowledgment_method = 'attestation' AND t.trainer_id IS NULL AND t.quiz_score IS NULL
        AND (t.expires_at IS NULL OR t.expires_at > $3::timestamptz)`,
    [orgId, [...targets.keys()], now.toISOString()],
  );
  const receipts = rows.map(row => verifiedTrainingReceipt(row, now)).filter(receipt => receipt !== null);
  const plans: TrainingTaskPlan[] = [];
  for (const documentId of documentIds) {
    const keys = scope.userIds ? { exact: scope.userIds.map(userId => trainingTaskSourceId(documentId, userId)) } : { prefix: prefixOf(documentId) };
    const plan: TrainingTaskPlan = { documentId, keys, desired: new Map(), acknowledged: new Set() };
    plans.push(plan);
    const doc = targets.get(documentId);
    if (!doc) continue;
    // A version nobody can read and acknowledge is not distributed: there would be a task no one can complete.
    const { context } = await readQmsTrainingReleaseContext(client, doc, now, { ahead: true });
    if (!context.eligible || !context.contentDigest) continue;
    const target = targetOf(doc, today);
    const planning: PlanningOf = { doc, target, today, now };
    const holders = new Set(receipts.filter(r => r.documentId === documentId && r.documentVersion === target.version
      && r.contentDigest === context.contentDigest).map(r => r.userId));
    for (const person of assigned.get(documentId)?.assignees ?? []) {
      const key = trainingTaskSourceId(documentId, person.userId);
      const state = trainingTaskOf(target, holders.has(person.userId), person.coveredSince, today);
      if (state.status === 'acknowledged') plan.acknowledged.add(key);
      else plan.desired.set(key, plannedTask(planning, person.userId, state));
    }
  }
  return plans;
}

/** Make each plan's open tasks exactly what it wants, then give each new task its one assignment notice. Never throws. */
export async function applyTrainingTasks(orgId: number, plans: readonly TrainingTaskPlan[], actorId: number): Promise<void> {
  for (const plan of plans) {
    const matches = 'prefix' in plan.keys ? [{ prefix: plan.keys.prefix }] : plan.keys.exact.map(exact => ({ exact }));
    for (const match of matches) {
      const result = await reconcileSourceTasks({
        organizationId: orgId, sourceEntityType: TRAINING_TASK_SOURCE, match, desired: plan.desired,
        closeAs: (key) => (plan.acknowledged.has(key) ? 'completed' : 'cancelled'), actorId,
      });
      for (const written of result.written) {
        const task = plan.desired.get(written.sourceEntityId);
        if (task) notifyTaskEvent({ organizationId: orgId, recipientUserId: task.userId, category: 'task_assigned', severity: 'info',
          title: task.notice.title, body: task.notice.body, taskId: written.taskId });
      }
    }
  }
}

/**
 * After a governed act commits, on the client still held for its request:
 * plan in a read-only transaction with the tenant set, then apply. Never
 * throws, so it cannot turn a committed act into a failure.
 */
export async function reconcileTrainingTasks(client: TrainingSqlClient, orgId: number, scope: TrainingTaskScope, actorId: number, now = new Date()): Promise<void> {
  let plans: TrainingTaskPlan[];
  try {
    await client.query('BEGIN READ ONLY');
    await setTenantContextTx(client, orgId);
    plans = await planTrainingTasks(client, orgId, scope, now);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    log.warn('Training tasks were not planned; nothing was changed and the governed act stands', {
      organizationId: orgId, documentIds: scope.documentIds, err: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  await applyTrainingTasks(orgId, plans, actorId);
}

/** The documents a job role is assigned to train on: a member's change plans only that person's tasks on them. */
export async function documentsAssignedToRole(client: TrainingSqlClient, orgId: number, roleId: number): Promise<number[]> {
  const { rows } = await client.query(
    `SELECT DISTINCT document_id FROM qms_training_assignments WHERE organization_id = $1 AND job_role_id = $2 AND removed_at IS NULL`,
    [orgId, roleId],
  );
  return rows.map(r => Number(r.document_id));
}
