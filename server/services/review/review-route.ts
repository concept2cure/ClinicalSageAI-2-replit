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
 * @module server/services/review/review-route
 */
import { createTaskInTx, type TaskInsertRunner } from '../tasking/create-task';
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
  /** Calendar dates (YYYY-MM-DD), each the end of that day in the sender's time zone. */
  reviewDueDate: string;
  approvalDueDate: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const positiveIds = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every((x) => Number.isSafeInteger(x) && (x as number) > 0 && (x as number) <= 2_147_483_647);

/** The route a request names, or the 400 that says what is wrong with it. Nothing is read. */
export function parseRouteRequest(raw: unknown): RouteRequest {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const reviewers = r.reviewers ?? [];
  const approvers = r.approvers ?? [];
  if (!positiveIds(reviewers) || !positiveIds(approvers)) {
    throw new ReviewRouteRefusal(400, 'ROUTE_INVALID', 'Reviewers and approvers are lists of account ids. Nothing was sent.');
  }
  if (reviewers.length === 0) {
    throw new ReviewRouteRefusal(400, 'ROUTE_REVIEWER_REQUIRED', 'Name at least one reviewer. Nothing was sent.');
  }
  if (approvers.length === 0) {
    throw new ReviewRouteRefusal(400, 'ROUTE_APPROVER_REQUIRED', 'Name at least one approver. Nothing was sent.');
  }
  const order = r.order ?? 'parallel';
  if (order !== 'parallel' && order !== 'sequential') {
    throw new ReviewRouteRefusal(400, 'ROUTE_INVALID', 'The review order is "parallel" or "sequential". Nothing was sent.');
  }
  // RR1a sends parallel reviewers and one approver; sequential steps and
  // several approvers arrive with their own refusals and tests (RR2).
  if (order !== 'parallel' || approvers.length > 1) {
    throw new ReviewRouteRefusal(409, 'ROUTE_SHAPE_NOT_AVAILABLE', 'Reviewers one after another, and more than one approver, are not available yet. Nothing was sent.');
  }
  if (typeof r.reviewDueDate !== 'string' || !DATE.test(r.reviewDueDate) || typeof r.approvalDueDate !== 'string' || !DATE.test(r.approvalDueDate)) {
    throw new ReviewRouteRefusal(400, 'ROUTE_DUE_DATES_REQUIRED', 'Give a review due date and an approval due date. Nothing was sent.');
  }
  return { reviewers, approvers, order, reviewDueDate: r.reviewDueDate, approvalDueDate: r.approvalDueDate };
}

/** End of each day in the sender's notification time zone (UTC when unset or unknown), as instants. */
async function dueInstants(q: RouteQueryable, senderId: number, req: RouteRequest): Promise<{ review: Date; approval: Date; timeZone: string }> {
  // tenant-isolation-safe: notification_preferences is keyed by user only (no tenant column); the sender is the session user.
  const pref = await q.query(`SELECT timezone FROM notification_preferences WHERE user_id = $1 ORDER BY id LIMIT 1`, [senderId]);
  const wanted = String(pref.rows[0]?.timezone ?? 'UTC') || 'UTC';
  const known = await q.query(`SELECT 1 FROM pg_timezone_names WHERE name = $1`, [wanted]);
  const timeZone = known.rows.length ? wanted : 'UTC';
  const { rows } = await q.query(
    `SELECT ((($1::date + 1)::timestamp AT TIME ZONE $3) - interval '1 millisecond') AS review,
            ((($2::date + 1)::timestamp AT TIME ZONE $3) - interval '1 millisecond') AS approval,
            now() AS now`,
    [req.reviewDueDate, req.approvalDueDate, timeZone],
  );
  const review = new Date(rows[0].review);
  const approval = new Date(rows[0].approval);
  if (review.getTime() <= new Date(rows[0].now).getTime()) {
    throw new ReviewRouteRefusal(400, 'ROUTE_DUE_IN_PAST', 'The review due date has passed. Nothing was sent.');
  }
  if (approval.getTime() < review.getTime()) {
    throw new ReviewRouteRefusal(400, 'ROUTE_DUE_ORDER', 'The approval is due on or after the review. Nothing was sent.');
  }
  return { review, approval, timeZone };
}

async function printedNameOf(q: RouteQueryable, organizationId: number, userId: number): Promise<string> {
  const { rows } = await q.query(
    `SELECT u.name, u.email FROM organization_users ou JOIN users u ON u.id = ou.user_id WHERE ou.organization_id = $1 AND ou.user_id = $2`,
    [organizationId, userId],
  );
  const r = rows[0];
  return String(r?.name || (r?.email ? String(r.email).split('@')[0] : `Account #${userId}`));
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
  const assignedAt = new Date();
  for (const m of members) {
    const reviewer = m.role === 'reviewer';
    const taskId = `ROUTE-${routeId.slice(0, 8)}-${m.userId}`;
    await createTaskInTx(tx, {
      organizationId: p.organizationId,
      actorUserId: p.senderId,
      taskId,
      values: {
        moduleType: 'Vault',
        title: `${reviewer ? 'Review' : 'Approve'}: ${p.subject.title}`,
        taskType: reviewer ? 'review' : 'approval',
        category: reviewer ? 'review' : 'approval',
        priority: 'medium',
        status: reviewer ? 'pending' : 'blocked',
        assigneeId: m.userId,
        assigneeName: m.printedName,
        assignedBy: p.senderId,
        assignedAt,
        dueDate: reviewer ? due.review : due.approval,
        projectId: anchor?.id ?? undefined,
        sourceEntityType: p.subject.type,
        sourceEntityId: p.subject.id,
        progress: 0,
        completionPercentage: 0,
      },
      route: { reviewRouteId: routeId, reviewRole: m.role, reviewStep: reviewer ? 1 : 2 },
      auditPayload: { routeId, role: m.role, step: reviewer ? 1 : 2, assigneeId: m.userId, sourceEntityType: p.subject.type, sourceEntityId: p.subject.id },
      reason: p.reason,
      summary: `Named ${reviewer ? 'reviewer' : 'approver'} on review route ${routeId}`,
    });
    if (reviewer) {
      notices.push({ organizationId: p.organizationId, recipientUserId: m.userId, category: 'task_assigned', title: `Review requested: ${p.subject.title}`, taskId });
    }
  }
  await recordGovernedAction(q, {
    orgId: p.organizationId,
    userId: p.senderId,
    command: 'review-route.send',
    target,
    reason: p.reason,
    payload: {
      routeId, order: p.request.order, contentDigest: p.subject.contentDigest,
      reviewDueAt: due.review.toISOString(), approvalDueAt: due.approval.toISOString(), timeZone: due.timeZone,
      senderName,
      members: members.map((m) => ({ userId: m.userId, role: m.role, step: m.role === 'reviewer' ? 1 : 2, printedName: m.printedName })),
    },
    domain: 'regulatory',
    surface: 'document-lifecycle',
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
    const gov = await recordGovernedAction(q, {
      orgId: p.organizationId,
      userId: p.actorUserId,
      command: p.status === 'returned' ? 'review-route.return' : 'review-route.withdraw',
      target,
      reason: p.reason,
      payload: { routeId: route.id, round: route.round, status: p.status, returnedBy: p.returner?.userId ?? null, cancelled: open.map((m) => m.taskId) },
      domain: 'regulatory',
      surface: 'document-lifecycle',
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
