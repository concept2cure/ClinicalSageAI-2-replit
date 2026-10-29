/**
 * The review route: the ONE writer of a route header and its member rows
 * (docs/design/REVIEW_ROUTING_2026-10-23.md §2, RR1a).
 *
 * A route names reviewers and an approver on one subject, with due dates, on
 * the transaction that sends the subject for review. Its members are
 * unified_tasks rows carrying review_route_id — each person's inbox entry,
 * written here and nowhere else: every generic task writer refuses them
 * (refuseRouteTaskWrite) and the database refuses any other writer
 * (unified_tasks_route_rows_guard), unless the transaction set the
 * route-writer setting, which only enterRouteWriter below sets.
 *
 * Authority is the route and verified signatures (review-route-standing.ts),
 * never a task's status. The status written here keeps the inbox in step:
 * a reviewer's row is pending, an approver's blocked until the review is
 * complete, a signed member's completed, and every other member's cancelled
 * when the route closes.
 *
 * Lock order, on every path: the subject's row (the caller holds it), then the
 * route's rows (routeStanding forUpdate), then the audit chain (the first
 * ledger row). Notices are returned for the caller to send after COMMIT.
 *
 * RR3 adds the two acts that change who is named on an open route:
 * reassignMember (the sender or an administrator hands an unsigned member's
 * assignment to another person, through assignTaskInTx, with the send's
 * validator) and handBackMember (a member returns their own assignment to the
 * sender, with a reason; they stay named until the sender reassigns).
 *
 * @module server/services/review/review-route
 */
import type { Request } from 'express';
import { createTaskInTx, type TaskInsertRunner } from '../tasking/create-task';
import { assignTaskInTx, TaskAssignmentError } from '../tasking/task-assignment';
import type { RequestSqlClient } from '../../db/requestDb';
import { auditTaskActionInTx } from '../tasking/task-audit';
import type { TaskEventNotice } from '../tasking/task-side-effects';
import { recordGovernedAction } from '../../routes/c2c/actions';
import { readProgramAnchorRow } from '../c2c/program-project-anchor';
import { queryableFromDrizzle } from '../../db/drizzle-queryable';
import { ReviewRouteRefusal, validateRouteMember, type ValidatedMember } from './review-route-member';
import {
  routeSubjectTarget,
  type RouteMember,
  type RouteQueryable,
  type RouteStanding,
  type RouteSubjectType,
} from './review-route-standing';

export { ReviewRouteRefusal } from './review-route-member';

/** A Drizzle transaction: the member rows are inserted through createTaskInTx. */
export type RouteTx = TaskInsertRunner;

/** The one place the route-writer setting is set: transaction-local. */
export async function enterRouteWriter(q: RouteQueryable): Promise<void> {
  await q.query(`SELECT set_config('c2c.review_route_writer', 'on', true)`);
}

export interface RouteSubject {
  type: RouteSubjectType;
  id: string;
  title: string;
  /** The regulatory program whose project anchors the subject (projects.regulatory_program_id). */
  programId: string | null;
  /** The digest the route is about: the version's content hash. */
  contentDigest: string;
}

export interface RouteRequest {
  reviewers: number[];
  approvers: number[];
  order: 'parallel' | 'sequential';
  /**
   * Calendar dates (YYYY-MM-DD), each the end of that day in the sender's time
   * zone. The review date is null only on a route that names no reviewer (a
   * QMS route may name none, NEW-4).
   */
  reviewDueDate: string | null;
  approvalDueDate: string;
}

/**
 * The floor a subject's route keeps (NEW-4, §4): a Vault version names at
 * least one reviewer and one approver; a QMS controlled document names at
 * least one approver, and reviewers are optional (RR4).
 */
export interface RouteRequestRules {
  reviewersOptional?: boolean;
}

/** The ledger's domain and surface for a subject's naming history. */
export function routeLedgerScope(type: RouteSubjectType): { domain: string; surface: string } {
  return type === 'qms_document' ? { domain: 'qms', surface: 'quality' } : { domain: 'regulatory', surface: 'document-lifecycle' };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const positiveIds = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every((x) => Number.isSafeInteger(x) && (x as number) > 0 && (x as number) <= 2_147_483_647);

const refusal = (status: 400 | 409, code: string, message: string) => new ReviewRouteRefusal(status, code, `${message} Nothing was sent.`);

/** The people a request names, each list of account ids; approvers non-empty, and reviewers too unless the subject's rules make them optional. */
function namedPeople(r: Record<string, unknown>, rules: RouteRequestRules): { reviewers: number[]; approvers: number[] } {
  const reviewers = r.reviewers ?? [];
  const approvers = r.approvers ?? [];
  if (!positiveIds(reviewers) || !positiveIds(approvers)) throw refusal(400, 'ROUTE_INVALID', 'Reviewers and approvers are lists of account ids.');
  if (reviewers.length === 0 && !rules.reviewersOptional) throw refusal(400, 'ROUTE_REVIEWER_REQUIRED', 'Name at least one reviewer.');
  if (approvers.length === 0) throw refusal(400, 'ROUTE_APPROVER_REQUIRED', 'Name at least one approver.');
  return { reviewers, approvers };
}

/** The order, which RR1a sends parallel with one approver; sequential steps and several approvers arrive with their own refusals and tests (RR2). */
function routeOrder(r: Record<string, unknown>, approvers: number[]): 'parallel' {
  const order = r.order ?? 'parallel';
  if (order !== 'parallel' && order !== 'sequential') throw refusal(400, 'ROUTE_INVALID', 'The review order is "parallel" or "sequential".');
  if (order !== 'parallel' || approvers.length > 1) {
    throw refusal(409, 'ROUTE_SHAPE_NOT_AVAILABLE', 'Reviewers one after another, and more than one approver, are not available yet.');
  }
  return order;
}

const isDate = (v: unknown): v is string => typeof v === 'string' && DATE.test(v);

/** The route a request names, or the refusal that says what is wrong with it. Nothing is read. */
export function parseRouteRequest(raw: unknown, rules: RouteRequestRules = {}): RouteRequest {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const { reviewers, approvers } = namedPeople(r, rules);
  const order = routeOrder(r, approvers);
  if (reviewers.length === 0) {
    if (!isDate(r.approvalDueDate)) throw refusal(400, 'ROUTE_DUE_DATES_REQUIRED', 'Give an approval due date.');
    return { reviewers, approvers, order, reviewDueDate: null, approvalDueDate: r.approvalDueDate };
  }
  if (!isDate(r.reviewDueDate) || !isDate(r.approvalDueDate)) {
    throw refusal(400, 'ROUTE_DUE_DATES_REQUIRED', 'Give a review due date and an approval due date.');
  }
  return { reviewers, approvers, order, reviewDueDate: r.reviewDueDate, approvalDueDate: r.approvalDueDate };
}

/** The sender's notification time zone, the one every due date is the end of a day in (UTC when unset or unknown). */
export async function senderTimeZone(q: RouteQueryable, senderId: number): Promise<string> {
  // tenant-isolation-safe: notification_preferences is keyed by user only (no tenant column); the sender is the session user.
  const pref = await q.query(`SELECT timezone FROM notification_preferences WHERE user_id = $1 ORDER BY id LIMIT 1`, [senderId]);
  const wanted = String(pref.rows[0]?.timezone ?? 'UTC') || 'UTC';
  const known = await q.query(`SELECT 1 FROM pg_timezone_names WHERE name = $1`, [wanted]);
  return known.rows.length ? wanted : 'UTC';
}

/** End of each day in the sender's notification time zone (UTC when unset or unknown), as instants; no review instant on a route with no reviewer. */
async function dueInstants(q: RouteQueryable, senderId: number, req: RouteRequest): Promise<{ review: Date | null; approval: Date; timeZone: string }> {
  const timeZone = await senderTimeZone(q, senderId);
  const { rows } = await q.query(
    `SELECT CASE WHEN $1::date IS NULL THEN NULL ELSE ((($1::date + 1)::timestamp AT TIME ZONE $3) - interval '1 millisecond') END AS review,
            ((($2::date + 1)::timestamp AT TIME ZONE $3) - interval '1 millisecond') AS approval,
            now() AS now`,
    [req.reviewDueDate, req.approvalDueDate, timeZone],
  );
  const review = rows[0].review == null ? null : new Date(rows[0].review);
  const approval = new Date(rows[0].approval);
  const first = review ?? approval;
  if (first.getTime() <= new Date(rows[0].now).getTime()) {
    throw new ReviewRouteRefusal(400, 'ROUTE_DUE_IN_PAST', `The ${review ? 'review' : 'approval'} due date has passed. Nothing was sent.`);
  }
  if (review && approval.getTime() < review.getTime()) {
    throw new ReviewRouteRefusal(400, 'ROUTE_DUE_ORDER', 'The approval is due on or after the review. Nothing was sent.');
  }
  return { review, approval, timeZone };
}

/** A member's step: reviewers are step 1; approvers the step after the last reviewer, step 1 when nobody reviews (§3). */
const stepOf = (role: 'reviewer' | 'approver', reviewers: number) => (role === 'reviewer' || reviewers === 0 ? 1 : 2);

/** A member's printed name, as a route records it at naming (users.name, else the e-mail's local part). */
export async function printedNameOf(q: RouteQueryable, organizationId: number, userId: number): Promise<string> {
  const { rows } = await q.query(
    `SELECT u.name, u.email FROM organization_users ou JOIN users u ON u.id = ou.user_id WHERE ou.organization_id = $1 AND ou.user_id = $2`,
    [organizationId, userId],
  );
  const r = rows[0];
  return String(r?.name || (r?.email ? String(r.email).split('@')[0] : `Account #${userId}`));
}

/** Every person named, validated in order (reviewers, then approvers), before anything is written. */
async function validateMembers(
  q: RouteQueryable,
  p: { organizationId: number; senderId: number; subject: RouteSubject; request: RouteRequest },
  target: string,
): Promise<ValidatedMember[]> {
  const named = new Set<number>();
  const members: ValidatedMember[] = [];
  for (const [role, ids] of [['reviewer', p.request.reviewers], ['approver', p.request.approvers]] as const) {
    for (const candidateId of ids) {
      members.push(await validateRouteMember(q, {
        organizationId: p.organizationId, subjectTarget: target, programId: p.subject.programId, contentDigest: p.subject.contentDigest,
        role, candidateId, senderId: p.senderId, actorId: p.senderId, named,
      }));
      named.add(candidateId);
    }
  }
  return members;
}

/** One member row and its task.create row; a member whose step is open gets a task_assigned notice. */
async function writeMemberRow(
  tx: RouteTx,
  p: { organizationId: number; senderId: number; reason: string; subject: RouteSubject; routeId: string; member: ValidatedMember;
    due: { review: Date | null; approval: Date }; projectId: number | undefined; reviewers: number },
): Promise<TaskEventNotice | null> {
  const { member: m, subject, routeId } = p;
  const reviewer = m.role === 'reviewer';
  const step = stepOf(m.role, p.reviewers);
  const open = step === 1;
  const taskId = `ROUTE-${routeId.slice(0, 8)}-${m.userId}`;
  await createTaskInTx(tx, {
    organizationId: p.organizationId,
    actorUserId: p.senderId,
    taskId,
    values: {
      moduleType: subject.type === 'qms_document' ? 'QMS' : 'Vault',
      title: `${reviewer ? 'Review' : 'Approve'}: ${subject.title}`,
      taskType: reviewer ? 'review' : 'approval',
      category: reviewer ? 'review' : 'approval',
      priority: 'medium',
      status: open ? 'pending' : 'blocked',
      assigneeId: m.userId,
      assigneeName: m.printedName,
      assignedBy: p.senderId,
      assignedAt: new Date(),
      dueDate: reviewer ? p.due.review ?? p.due.approval : p.due.approval,
      projectId: p.projectId,
      sourceEntityType: subject.type,
      sourceEntityId: subject.id,
      progress: 0,
      completionPercentage: 0,
    },
    route: { reviewRouteId: routeId, reviewRole: m.role, reviewStep: step },
    auditPayload: { routeId, role: m.role, step, assigneeId: m.userId, sourceEntityType: subject.type, sourceEntityId: subject.id },
    reason: p.reason,
    summary: `Named ${m.role} on review route ${routeId}`,
  });
  if (!open) return null;
  return { organizationId: p.organizationId, recipientUserId: m.userId, category: 'task_assigned', title: `${reviewer ? 'Review' : 'Approval'} requested: ${subject.title}`, taskId };
}

/**
 * Send a route on the caller's transaction, which holds the subject's row lock
 * and has just moved it into review. Validates every person before writing
 * anything; a refusal throws ReviewRouteRefusal, and the caller's rollback
 * takes the stage change with it. Returns the route id and the notices to send
 * after COMMIT (the open step's members: task_assigned).
 */
export async function sendReviewRoute(
  tx: RouteTx,
  p: { organizationId: number; senderId: number; reason: string; subject: RouteSubject; request: RouteRequest },
): Promise<{ routeId: string; notices: TaskEventNotice[]; timeZone: string }> {
  const q = queryableFromDrizzle(tx);
  const target = routeSubjectTarget(p.subject.type, p.subject.id);
  const open = await q.query(
    `SELECT id FROM review_routes WHERE organization_id = $1 AND subject_type = $2 AND subject_id = $3 AND status = 'open' FOR UPDATE`,
    [p.organizationId, p.subject.type, p.subject.id],
  );
  if (open.rows.length) {
    throw new ReviewRouteRefusal(409, 'ROUTE_ALREADY_OPEN', 'This document already has an open review route. Withdraw it first. Nothing was sent.');
  }
  const members = await validateMembers(q, p, target);
  const due = await dueInstants(q, p.senderId, p.request);
  const senderName = await printedNameOf(q, p.organizationId, p.senderId);
  const prior = await q.query(
    `SELECT count(*)::int AS n FROM review_routes WHERE organization_id = $1 AND subject_type = $2 AND subject_id = $3`,
    [p.organizationId, p.subject.type, p.subject.id],
  );
  await enterRouteWriter(q);
  const inserted = await q.query(
    `INSERT INTO review_routes (organization_id, subject_type, subject_id, round, sender_id, sender_name, review_order,
       review_due_at, approval_due_at, content_digest)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [p.organizationId, p.subject.type, p.subject.id, Number(prior.rows[0].n) + 1, p.senderId, senderName, p.request.order,
      due.review, due.approval, p.subject.contentDigest],
  );
  const routeId = String(inserted.rows[0].id);
  const anchor = p.subject.programId
    ? await readProgramAnchorRow(q, { programId: p.subject.programId, orgId: p.organizationId, context: 'review-route-send' })
    : null;
  const notices: TaskEventNotice[] = [];
  for (const m of members) {
    const notice = await writeMemberRow(tx, { ...p, routeId, member: m, due, projectId: anchor?.id ?? undefined, reviewers: p.request.reviewers.length });
    if (notice) notices.push(notice);
  }
  await recordGovernedAction(q, {
    orgId: p.organizationId,
    userId: p.senderId,
    command: 'review-route.send',
    target,
    reason: p.reason,
    payload: {
      routeId, order: p.request.order, contentDigest: p.subject.contentDigest,
      reviewDueAt: due.review?.toISOString() ?? null, approvalDueAt: due.approval.toISOString(), timeZone: due.timeZone,
      senderName,
      members: members.map((m) => ({ userId: m.userId, role: m.role, step: stepOf(m.role, p.request.reviewers.length), printedName: m.printedName })),
    },
    ...routeLedgerScope(p.subject.type),
  });
  return { routeId, notices, timeZone: due.timeZone };
}

/**
 * A member's verified signature closes their inbox entry: the signature's id
 * is stamped on the member row, the task moves to completed, and its
 * `task.transition` row cites `esig:<id>`. Returns the sender's notice.
 */
export async function closeRouteTaskOnSignature(
  tx: RouteTx,
  p: { organizationId: number; standing: RouteStanding; member: RouteMember; signatureId: number; actorUserId: number; reason: string; subjectTitle: string },
): Promise<TaskEventNotice[]> {
  const q = queryableFromDrizzle(tx);
  await enterRouteWriter(q);
  const { rows } = await q.query(
    `UPDATE unified_tasks SET route_signature_id = $1, status = 'completed', progress = 100, completion_percentage = 100,
            completed_at = now(), last_modified_by = $2, updated_at = now()
      WHERE organization_id = $3 AND task_id = $4 AND review_route_id = $5::uuid AND route_signature_id IS NULL
      RETURNING status`,
    [p.signatureId, p.actorUserId, p.organizationId, p.member.taskId, p.standing.route!.id],
  );
  if (rows.length !== 1) throw new Error(`Route member ${p.member.taskId} could not be closed on its signature`);
  await auditTaskActionInTx(q, {
    orgId: p.organizationId,
    userId: p.actorUserId,
    command: 'task.transition',
    taskId: p.member.taskId,
    payload: { from: 'pending', to: 'completed', signatureRef: `esig:${p.signatureId}`, routeId: p.standing.route!.id },
    reason: p.reason,
    summary: `Closed by the ${p.member.role === 'reviewer' ? 'review' : 'approval'} signature esig:${p.signatureId}`,
  });
  const sender = p.standing.route!.senderId;
  return sender === p.actorUserId
    ? []
    : [{ organizationId: p.organizationId, recipientUserId: sender, category: 'task_completed', title: `${p.member.printedName ?? 'A member'} signed: ${p.subjectTitle}`, taskId: p.member.taskId }];
}

/** The review is complete: the approvers' rows move from blocked to pending, and each is told it is their turn. */
export async function openApproverStep(
  tx: RouteTx,
  p: { organizationId: number; standing: RouteStanding; actorUserId: number; subjectTitle: string },
): Promise<TaskEventNotice[]> {
  const q = queryableFromDrizzle(tx);
  await enterRouteWriter(q);
  const notices: TaskEventNotice[] = [];
  for (const m of p.standing.members.filter((x) => x.role === 'approver' && x.outcome === 'pending')) {
    const { rows } = await q.query(
      `UPDATE unified_tasks SET status = 'pending', updated_at = now()
        WHERE organization_id = $1 AND task_id = $2 AND review_route_id = $3::uuid AND status = 'blocked' RETURNING task_id`,
      [p.organizationId, m.taskId, p.standing.route!.id],
    );
    if (!rows.length) continue;
    await auditTaskActionInTx(q, {
      orgId: p.organizationId, userId: p.actorUserId, command: 'task.transition', taskId: m.taskId,
      payload: { from: 'blocked', to: 'pending', routeId: p.standing.route!.id, cause: 'review-complete' },
      summary: 'The review is complete: the approval step is open',
    });
    notices.push({ organizationId: p.organizationId, recipientUserId: m.userId, category: 'task_update', title: `It is your turn: approve ${p.subjectTitle}`, taskId: m.taskId });
  }
  return notices;
}

/**
 * Close a route on the transaction of the exit that ends it (§2.9): the header
 * takes its status, actor, time and reason; every member who has not signed is
 * cancelled (a returner's row also carries the act's id); and the naming
 * history gets its governed row on the subject (none for `complete`, whose
 * record is the approval signature). Returns the affected members' notices.
 */
export async function closeReviewRoute(
  tx: RouteTx,
  p: {
    organizationId: number;
    standing: RouteStanding;
    status: 'withdrawn' | 'returned' | 'complete';
    reason: string | null;
    actorUserId: number;
    subjectType: RouteSubjectType;
    subjectId: string;
    subjectTitle: string;
    /** For a return: the member who returned it (null when the sender did). */
    returner?: RouteMember | null;
  },
): Promise<{ notices: TaskEventNotice[]; actId: string | null }> {
  const q = queryableFromDrizzle(tx);
  const route = p.standing.route!;
  await enterRouteWriter(q);
  const closed = await q.query(
    `UPDATE review_routes SET status = $1, status_reason = $2, status_by = $3, status_at = now()
      WHERE organization_id = $4 AND id = $5::uuid AND status = 'open' RETURNING id`,
    [p.status, p.reason, p.actorUserId, p.organizationId, route.id],
  );
  if (!closed.rows.length) throw new Error(`Review route ${route.id} was no longer open`);
  const target = routeSubjectTarget(p.subjectType, p.subjectId);
  const open = p.standing.members.filter((m) => m.outcome !== 'signed');
  for (const m of open) {
    await q.query(
      `UPDATE unified_tasks SET status = 'cancelled', updated_at = now(), last_modified_by = $1
        WHERE organization_id = $2 AND task_id = $3 AND review_route_id = $4::uuid AND status <> 'cancelled'`,
      [p.actorUserId, p.organizationId, m.taskId, route.id],
    );
  }
  let actId: string | null = null;
  if (p.status !== 'complete') {
    const actorName = await printedNameOf(q, p.organizationId, p.actorUserId);
    const gov = await recordGovernedAction(q, {
      orgId: p.organizationId,
      userId: p.actorUserId,
      command: p.status === 'returned' ? 'review-route.return' : 'review-route.withdraw',
      target,
      reason: p.reason,
      payload: { routeId: route.id, round: route.round, status: p.status, actorName, returnedBy: p.returner?.userId ?? null, cancelled: open.map((m) => m.taskId) },
      ...routeLedgerScope(p.subjectType),
    });
    actId = gov.actionId;
    if (p.returner) {
      await q.query(
        `UPDATE unified_tasks SET route_act_id = $1 WHERE organization_id = $2 AND task_id = $3 AND review_route_id = $4::uuid`,
        [actId, p.organizationId, p.returner.taskId, route.id],
      );
    }
  }
  for (const m of open) {
    await auditTaskActionInTx(q, {
      orgId: p.organizationId, userId: p.actorUserId, command: 'task.transition', taskId: m.taskId,
      payload: { to: 'cancelled', routeId: route.id, cause: `route-${p.status}`, ...(actId ? { actId } : {}) },
      reason: p.reason,
      summary: `Review route ${p.status}`,
    });
  }
  const notices: TaskEventNotice[] = open
    .filter((m) => m.userId !== p.actorUserId)
    .map((m) => ({ organizationId: p.organizationId, recipientUserId: m.userId, category: 'task_update' as const, title: `Review route ${p.status}: ${p.subjectTitle}`, body: p.reason, taskId: m.taskId }));
  if (p.status === 'returned' && route.senderId !== p.actorUserId) {
    notices.push({ organizationId: p.organizationId, recipientUserId: route.senderId, category: 'task_update', title: `Returned for revision: ${p.subjectTitle}`, body: p.reason });
  }
  return { notices, actId };
}

/** The sender or an organization admin may withdraw; the sender or a named member whose step is open may return. */
export async function isOrgAdmin(q: RouteQueryable, organizationId: number, userId: number): Promise<boolean> {
  const { rows } = await q.query(`SELECT role FROM organization_users WHERE organization_id = $1 AND user_id = $2`, [organizationId, userId]);
  return String(rows[0]?.role ?? '').trim().toLowerCase() === 'admin';
}

/**
 * Remind (RR1b, §2.3, §2.11): POST /api/tasks/tasks/:taskId/notify on a route
 * member writes nothing on the row, and is the route sender's or an
 * administrator's, for a member whose step is open on an open route. The
 * refusal to answer, or null when the reminder may go.
 */
export async function routeRemindRefusal(
  q: RouteQueryable,
  p: { organizationId: number; actorUserId: number; reviewRouteId: string; taskStatus: string },
): Promise<{ status: 403 | 409; code: string; message: string } | null> {
  const { rows } = await q.query(
    `SELECT sender_id, status FROM review_routes WHERE organization_id = $1 AND id = $2::uuid`,
    [p.organizationId, p.reviewRouteId],
  );
  const route = rows[0];
  if (!route || route.status !== 'open') {
    return { status: 409, code: 'ROUTE_NOT_OPEN', message: 'This review route is no longer open, so nobody on it is reminded. Nothing was sent.' };
  }
  if (p.taskStatus !== 'pending' && p.taskStatus !== 'in-progress') {
    return { status: 409, code: 'ROUTE_TASK_NOT_OPEN', message: 'It is not this person’s turn on the route, or they have finished, so they are not reminded. Nothing was sent.' };
  }
  if (Number(route.sender_id) === p.actorUserId || (await isOrgAdmin(q, p.organizationId, p.actorUserId))) return null;
  return { status: 403, code: 'ROUTE_REMIND_NOT_PERMITTED', message: 'Only the person who sent this review route, or an administrator, reminds its members. Nothing was sent.' };
}

// ── RR3: reassign and hand back (§2.10, B9, B11, M2, M3, M6) ────────────────

/** The subject a reassignment or hand-back is on, as the route's caller read it under its row lock. */
export interface RouteActSubject {
  type: RouteSubjectType;
  id: string;
  title: string;
  /** The regulatory program whose project anchors the subject. */
  programId: string | null;
}

const changed = (status: 400 | 403 | 404 | 409, code: string, message: string) =>
  new ReviewRouteRefusal(status, code, `${message} Nothing was changed.`);

/** A member's assignment that can still change hands: named on this route, and neither signed nor returned. */
function reassignableMember(standing: RouteStanding, taskId: string): RouteMember {
  const member = standing.members.find((m) => m.taskId === taskId);
  if (!member) throw changed(404, 'ROUTE_MEMBER_NOT_FOUND', 'That assignment is not on this document’s open review route.');
  if (member.outcome === 'signed') {
    throw changed(409, 'ROUTE_MEMBER_SIGNED', `${member.printedName ?? 'This member'} has signed, so their assignment stays theirs.`);
  }
  if (member.outcome === 'returned') {
    throw changed(409, 'ROUTE_MEMBER_RETURNED', `${member.printedName ?? 'This member'} returned the document for revision, so their assignment is not reassigned.`);
  }
  return member;
}

/** The validator's refusal, said as a reassignment's ("Nothing was changed", not "sent"). */
function asReassignRefusal(err: unknown): never {
  if (err instanceof ReviewRouteRefusal) {
    throw new ReviewRouteRefusal(err.status, err.code, err.message.replace(/ Nothing was sent\.$/, ' Nothing was changed.'));
  }
  if (err instanceof TaskAssignmentError && (err.status === 400 || err.status === 403 || err.status === 404 || err.status === 409)) {
    throw changed(err.status, err.code, err.message.replace(/ Nothing was changed\.$/, ''));
  }
  throw err;
}

/** A member's status on an open route: their step open, pending; otherwise waiting (blocked). */
const routeStatusOf = (m: RouteMember): 'pending' | 'blocked' => (m.stepOpen ? 'pending' : 'blocked');

/** The new member's notice: a reviewer is asked to review; an approver is told it is their turn, or that it will be. */
function assignedNotice(organizationId: number, m: RouteMember, userId: number, title: string): TaskEventNotice {
  if (m.role === 'reviewer') return { organizationId, recipientUserId: userId, category: 'task_assigned', title: `Review requested: ${title}`, taskId: m.taskId };
  return m.stepOpen
    ? { organizationId, recipientUserId: userId, category: 'task_assigned', title: `It is your turn: approve ${title}`, taskId: m.taskId }
    : { organizationId, recipientUserId: userId, category: 'task_assigned', title: `Approval requested: ${title}`, body: 'Your approval opens once every named reviewer has signed.', taskId: m.taskId };
}

/**
 * Reassign a named member's assignment on an open route (§2.10). The caller
 * holds the subject's row lock (which every route writer takes first, so the
 * standing it read is current) and has checked the reason. In order, each
 * refusal with nothing written:
 *
 *   1. the actor is the sender or an organization administrator;
 *   2. the assignment is on this route, unsigned and not returned;
 *   3. validateRouteMember, exactly as at send: the route's sender is the
 *      sender, the actor is the actor (who cannot name themselves), and
 *      everyone on the route is already named;
 *
 * then assignTaskInTx, route-owned: the same task id, role and step, the
 * reminder markers cleared, a task.assign row with the reason. The member row
 * takes the printed name at naming, and a handed-back assignment is open
 * again (its act cleared from the row, kept in the ledger). One
 * review-route.reassign row on the subject records the route, from, to, role,
 * reason and both printed names. Returns the notices to send after COMMIT:
 * the new member's, and the old member's.
 */
export async function reassignMember(
  tx: RouteTx,
  req: Request,
  p: { organizationId: number; actorUserId: number; reason: string; subject: RouteActSubject; standing: RouteStanding; taskId: string; assigneeId: number },
): Promise<{ notices: TaskEventNotice[]; actId: string; member: RouteMember; to: ValidatedMember }> {
  const q = queryableFromDrizzle(tx);
  const route = p.standing.route!;
  if (route.senderId !== p.actorUserId && !(await isOrgAdmin(q, p.organizationId, p.actorUserId))) {
    throw changed(403, 'ROUTE_REASSIGN_NOT_PERMITTED', 'Only the person who sent this review route, or an administrator, reassigns its members.');
  }
  const member = reassignableMember(p.standing, p.taskId);
  const to = await validateRouteMember(q, {
    organizationId: p.organizationId, subjectTarget: routeSubjectTarget(p.subject.type, p.subject.id), programId: p.subject.programId,
    contentDigest: route.contentDigest, role: member.role, candidateId: p.assigneeId, senderId: route.senderId, actorId: p.actorUserId,
    named: new Set(p.standing.members.map((m) => m.userId)),
  }).catch(asReassignRefusal);
  await enterRouteWriter(q);
  await assignTaskInTx(req, q as unknown as RequestSqlClient, { taskId: member.taskId, method: 'named', assigneeId: to.userId, reason: p.reason }, { routeOwned: true })
    .catch(asReassignRefusal);
  const status = routeStatusOf(member);
  const reopened = await q.query(
    `UPDATE unified_tasks SET assignee_name = $1, route_act_id = NULL, status = $2, updated_at = now()
      WHERE organization_id = $3 AND task_id = $4 AND review_route_id = $5::uuid AND assignee_id = $6
      RETURNING task_id`,
    [to.printedName, status, p.organizationId, member.taskId, route.id, to.userId],
  );
  if (reopened.rows.length !== 1) throw new Error(`Route member ${member.taskId} was not reassigned to ${to.userId}`);
  const actorName = await printedNameOf(q, p.organizationId, p.actorUserId);
  const gov = await recordGovernedAction(q, {
    orgId: p.organizationId,
    userId: p.actorUserId,
    command: 'review-route.reassign',
    target: routeSubjectTarget(p.subject.type, p.subject.id),
    reason: p.reason,
    payload: {
      routeId: route.id, taskId: member.taskId, role: member.role, step: member.step, actorName,
      from: { userId: member.userId, printedName: member.printedName }, to: { userId: to.userId, printedName: to.printedName },
      handedBackActId: member.outcome === 'handed back' ? member.actId : null,
    },
    ...routeLedgerScope(p.subject.type),
  });
  if (member.outcome === 'handed back') {
    await auditTaskActionInTx(q, {
      orgId: p.organizationId, userId: p.actorUserId, command: 'task.transition', taskId: member.taskId,
      payload: { from: 'blocked', to: status, routeId: route.id, cause: 'reassigned-after-hand-back', actId: gov.actionId },
      reason: p.reason,
      summary: `Reassigned after ${member.printedName ?? 'the member'} handed it back`,
    });
  }
  const notices: TaskEventNotice[] = [assignedNotice(p.organizationId, member, to.userId, p.subject.title)];
  if (member.userId !== p.actorUserId) {
    notices.push({
      organizationId: p.organizationId, recipientUserId: member.userId, category: 'task_update',
      title: `${member.role === 'reviewer' ? 'Review' : 'Approval'} reassigned: ${p.subject.title}`,
      body: `${actorName} gave your ${member.role === 'reviewer' ? 'review' : 'approval'} to ${to.printedName}: ${p.reason}`,
    });
  }
  return { notices, actId: gov.actionId, member, to };
}

/**
 * Hand back (§2.10, M6): a named member who cannot do their assignment
 * returns it to the sender, with a reason. Nobody signs on their behalf: the
 * act is stamped on their row (route_act_id), their task waits (blocked) on
 * the sender, they stay named until the sender reassigns, and they neither
 * sign nor complete their step meanwhile. The caller holds the subject's row
 * lock and has checked the reason. Returns the sender's notice.
 */
export async function handBackMember(
  tx: RouteTx,
  p: { organizationId: number; actorUserId: number; reason: string; subject: RouteActSubject; standing: RouteStanding },
): Promise<{ notices: TaskEventNotice[]; actId: string; member: RouteMember }> {
  const q = queryableFromDrizzle(tx);
  const route = p.standing.route!;
  const member = p.standing.members.find((m) => m.userId === p.actorUserId);
  if (!member) throw changed(403, 'ROUTE_NOT_NAMED', 'You are not named on this document’s review route, so there is nothing to hand back.');
  if (member.outcome === 'signed') throw changed(409, 'ROUTE_MEMBER_SIGNED', 'You have signed, so your assignment is done and is not handed back.');
  if (member.outcome === 'handed back') throw changed(409, 'ROUTE_HANDED_BACK', 'You have already handed this back; the sender reassigns it.');
  if (member.outcome === 'returned') throw changed(409, 'ROUTE_MEMBER_RETURNED', 'You returned this document for revision.');
  const printedName = member.printedName ?? (await printedNameOf(q, p.organizationId, member.userId));
  await enterRouteWriter(q);
  const gov = await recordGovernedAction(q, {
    orgId: p.organizationId,
    userId: p.actorUserId,
    command: 'review-route.hand-back',
    target: routeSubjectTarget(p.subject.type, p.subject.id),
    reason: p.reason,
    payload: { routeId: route.id, taskId: member.taskId, role: member.role, step: member.step, userId: member.userId, printedName, actorName: printedName },
    ...routeLedgerScope(p.subject.type),
  });
  const stamped = await q.query(
    `UPDATE unified_tasks SET route_act_id = $1, status = 'blocked', updated_at = now(), last_modified_by = $2
      WHERE organization_id = $3 AND task_id = $4 AND review_route_id = $5::uuid AND assignee_id = $2
        AND route_act_id IS NULL AND route_signature_id IS NULL
      RETURNING status`,
    [gov.actionId, p.actorUserId, p.organizationId, member.taskId, route.id],
  );
  if (stamped.rows.length !== 1) throw new Error(`Route member ${member.taskId} could not record its hand-back`);
  await auditTaskActionInTx(q, {
    orgId: p.organizationId, userId: p.actorUserId, command: 'task.transition', taskId: member.taskId,
    payload: { from: routeStatusOf(member), to: 'blocked', routeId: route.id, cause: 'hand-back', actId: gov.actionId },
    reason: p.reason,
    summary: 'Handed back to the sender, who reassigns it',
  });
  const notices: TaskEventNotice[] = [{
    organizationId: p.organizationId, recipientUserId: route.senderId, category: 'task_update',
    title: `Handed back by ${printedName}: ${p.subject.title}`,
    body: `${printedName} cannot do their ${member.role === 'reviewer' ? 'review' : 'approval'} and handed it back to you to reassign: ${p.reason}`,
    taskId: member.taskId,
  }];
  return { notices, actId: gov.actionId, member };
}
