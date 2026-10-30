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
 * RR2 adds reviewers one after another and more than one approver (§3, NEW-4).
 * Each step opens (openReadySteps) only when every member of the steps before
 * it has a verified signature, and only then is its member told. Each step has
 * its own due date, and every named approver signs. It also adds
 * addRouteReviewer: the sender or an administrator names one more reviewer on
 * an open route, with a reason and a due date and through the send's
 * validator. The approvers are then blocked again and told, and this is refused
 * once any approval is signed. What a request may say, and the reads behind it,
 * moved to review-route-rules.ts, so this file holds the writes.
 *
 * @module server/services/review/review-route
 */
import type { Request } from 'express';
import { drizzle } from 'drizzle-orm/node-postgres';
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
import {
  addedMemberTaskId, addedReviewerDue, dueInstants, isOrgAdmin, placed, printedNameOf, routeLedgerScope, type RouteRequest,
} from './review-route-rules';

export { ReviewRouteRefusal } from './review-route-member';
export {
  isOrgAdmin, parseRouteRequest, printedNameOf, routeLedgerScope, routeRemindRefusal, senderTimeZone,
  type RouteRequest, type RouteRequestRules,
} from './review-route-rules';

/** A Drizzle transaction: the member rows are inserted through createTaskInTx. */
export type RouteTx = TaskInsertRunner;

/** The route writers take a Drizzle transaction; an act that holds a pg client inside its BEGIN passes it through this. */
export const routeTxOf = (client: RouteQueryable): RouteTx => drizzle(client as never) as unknown as RouteTx;

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
  /** The digest the route is about: the version's content hash (an Authoring document's sections digest, RR5). */
  contentDigest: string;
  /** What each member's task carries beyond the route (RR5: Authoring's instructions to the reviewers, and a priority). */
  taskDetails?: { description?: string; priority?: string };
}

/** The Tasks module a subject's member rows are listed under. */
const MODULE_OF: Record<RouteSubjectType, string> = { canonical_document: 'Vault', qms_document: 'QMS', authoring_document: 'Authoring' };

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
  p: { organizationId: number; senderId: number; reason: string; subject: RouteSubject | RouteActSubject; routeId: string; member: ValidatedMember;
    step: number; open: boolean; dueDate: Date; projectId: number | undefined; taskId?: string },
): Promise<TaskEventNotice | null> {
  const { member: m, subject, routeId, step, open } = p;
  const reviewer = m.role === 'reviewer';
  const taskId = p.taskId ?? `ROUTE-${routeId.slice(0, 8)}-${m.userId}`;
  await createTaskInTx(tx, {
    organizationId: p.organizationId,
    actorUserId: p.senderId,
    taskId,
    values: {
      moduleType: MODULE_OF[subject.type],
      title: `${reviewer ? 'Review' : 'Approve'}: ${subject.title}`,
      taskType: reviewer ? 'review' : 'approval',
      category: reviewer ? 'review' : 'approval',
      priority: ('taskDetails' in subject && subject.taskDetails?.priority) || 'medium',
      ...('taskDetails' in subject && subject.taskDetails?.description ? { description: subject.taskDetails.description } : {}),
      status: open ? 'pending' : 'blocked',
      assigneeId: m.userId,
      assigneeName: m.printedName,
      assignedBy: p.senderId,
      assignedAt: new Date(),
      dueDate: p.dueDate,
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
       review_due_at, reviewer_step_due_at, approval_due_at, content_digest)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [p.organizationId, p.subject.type, p.subject.id, Number(prior.rows[0].n) + 1, p.senderId, senderName, p.request.order,
      due.review, due.steps, due.approval, p.subject.contentDigest],
  );
  const routeId = String(inserted.rows[0].id);
  const anchor = p.subject.programId
    ? await readProgramAnchorRow(q, { programId: p.subject.programId, orgId: p.organizationId, context: 'review-route-send' })
    : null;
  const notices: TaskEventNotice[] = [];
  const steps = placed(members, p.request, due);
  for (const { member, step, dueDate } of steps) {
    const notice = await writeMemberRow(tx, { ...p, routeId, member, step, open: step === 1, dueDate, projectId: anchor?.id ?? undefined });
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
      reviewDueAt: due.review?.toISOString() ?? null, approvalDueAt: due.approval?.toISOString() ?? null, timeZone: due.timeZone,
      reviewStepDueAt: due.steps?.map((d) => d.toISOString()) ?? null,
      senderName,
      members: steps.map(({ member: m, step, dueDate }) => ({ userId: m.userId, role: m.role, step, dueAt: dueDate.toISOString(), printedName: m.printedName })),
    },
    ...routeLedgerScope(p.subject.type),
  });
  return { routeId, notices, timeZone: due.timeZone };
}

const STAMP_TAIL = `status = 'completed', progress = 100, completion_percentage = 100, completed_at = now(), last_modified_by = $2, updated_at = now()
  WHERE organization_id = $3 AND task_id = $4 AND review_route_id = $5::uuid AND route_signature_id IS NULL AND route_authoring_signature_id IS NULL
  RETURNING status`;
const STAMP_SIGNATURE = `UPDATE unified_tasks SET route_signature_id = $1, ${STAMP_TAIL}`;
const STAMP_AUTHORING_SIGNATURE = `UPDATE unified_tasks SET route_authoring_signature_id = $1::uuid, ${STAMP_TAIL}`;

/**
 * A member's verified signature closes their inbox entry: the signature's id
 * is stamped on the member row, the task moves to completed, and its
 * `task.transition` row cites `esig:<id>`. An Authoring member's signature
 * (RR5) is an authoring_signatures uuid: it is stamped as
 * route_authoring_signature_id and cited as `authoring-sig:<id>`, the
 * reference the FD5(c) carry-over uses. Returns the sender's notice.
 */
export async function closeRouteTaskOnSignature(
  tx: RouteTx,
  p: { organizationId: number; standing: RouteStanding; member: RouteMember; signatureId: number | string; actorUserId: number; reason: string; subjectTitle: string },
): Promise<TaskEventNotice[]> {
  const q = queryableFromDrizzle(tx);
  const authoring = typeof p.signatureId === 'string';
  await enterRouteWriter(q);
  const { rows } = await q.query(authoring ? STAMP_AUTHORING_SIGNATURE : STAMP_SIGNATURE,
    [p.signatureId, p.actorUserId, p.organizationId, p.member.taskId, p.standing.route!.id]);
  const ref = authoring ? `authoring-sig:${p.signatureId}` : `esig:${p.signatureId}`;
  if (rows.length !== 1) throw new Error(`Route member ${p.member.taskId} could not be closed on its signature`);
  await auditTaskActionInTx(q, {
    orgId: p.organizationId,
    userId: p.actorUserId,
    command: 'task.transition',
    taskId: p.member.taskId,
    payload: { from: 'pending', to: 'completed', signatureRef: ref, routeId: p.standing.route!.id },
    reason: p.reason,
    summary: `Closed by the ${p.member.role === 'reviewer' ? 'review' : 'approval'} signature ${ref}`,
  });
  const sender = p.standing.route!.senderId;
  return sender === p.actorUserId
    ? []
    : [{ organizationId: p.organizationId, recipientUserId: sender, category: 'task_completed', title: `${p.member.printedName ?? 'A member'} signed: ${p.subjectTitle}`, taskId: p.member.taskId }];
}

/**
 * The steps whose turn has come (§3): every member who has not signed or acted,
 * whose step is now open (every member of every earlier step has a verified
 * signature), moves from blocked to pending, and each is told it is their
 * turn: the next reviewer one after another, or the approvers once the review
 * is complete. A member already pending is left alone, so this is called after
 * every signature. `standing` is read after the signature, under the lock.
 */
export async function openReadySteps(
  tx: RouteTx,
  p: { organizationId: number; standing: RouteStanding; actorUserId: number; subjectTitle: string },
): Promise<TaskEventNotice[]> {
  const q = queryableFromDrizzle(tx);
  await enterRouteWriter(q);
  const notices: TaskEventNotice[] = [];
  for (const m of p.standing.members.filter((x) => x.outcome === 'pending' && x.stepOpen)) {
    const { rows } = await q.query(
      `UPDATE unified_tasks SET status = 'pending', updated_at = now()
        WHERE organization_id = $1 AND task_id = $2 AND review_route_id = $3::uuid AND status = 'blocked' RETURNING task_id`,
      [p.organizationId, m.taskId, p.standing.route!.id],
    );
    if (!rows.length) continue;
    const approver = m.role === 'approver';
    await auditTaskActionInTx(q, {
      orgId: p.organizationId, userId: p.actorUserId, command: 'task.transition', taskId: m.taskId,
      payload: { from: 'blocked', to: 'pending', routeId: p.standing.route!.id, step: m.step, cause: approver ? 'review-complete' : 'previous-step-signed' },
      summary: approver ? 'The review is complete: the approval step is open' : `Step ${m.step - 1} has signed: step ${m.step} is open`,
    });
    notices.push({ organizationId: p.organizationId, recipientUserId: m.userId, category: 'task_update', title: `It is your turn: ${approver ? 'approve' : 'review'} ${p.subjectTitle}`, taskId: m.taskId });
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

/** The validator's refusal, said as a change to an open route's ("Nothing was changed", not "sent"): a reassignment's or an addition's. */
function asChangeRefusal(err: unknown): never {
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
  if (m.role === 'reviewer') {
    return m.stepOpen
      ? { organizationId, recipientUserId: userId, category: 'task_assigned', title: `Review requested: ${title}`, taskId: m.taskId }
      : { organizationId, recipientUserId: userId, category: 'task_assigned', title: `Review requested: ${title}`, body: 'Your review opens once the reviewer before you has signed.', taskId: m.taskId };
  }
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
  }).catch(asChangeRefusal);
  await enterRouteWriter(q);
  await assignTaskInTx(req, q as unknown as RequestSqlClient, { taskId: member.taskId, method: 'named', assigneeId: to.userId, reason: p.reason }, { routeOwned: true })
    .catch(asChangeRefusal);
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

// ── RR2: add a reviewer to an open route (§2.10, M6) ────────────────────────

/**
 * The approvers move after the new reviewer's step; any whose turn had come
 * waits again (blocked), and is told. A handed-back approver keeps waiting on
 * the sender. Returns the task ids blocked again and their notices.
 */
async function reblockApprovers(
  q: RouteQueryable,
  p: { organizationId: number; actorUserId: number; reason: string; standing: RouteStanding; approverStep: number; subjectTitle: string; notice: string },
): Promise<{ reblocked: string[]; notices: TaskEventNotice[] }> {
  const route = p.standing.route!;
  const reblocked: string[] = [];
  const notices: TaskEventNotice[] = [];
  for (const m of p.standing.members.filter((x) => x.role === 'approver')) {
    const turnHadCome = m.outcome === 'pending' && m.stepOpen;
    await q.query(
      `UPDATE unified_tasks SET review_step = $1, status = CASE WHEN $2::boolean THEN 'blocked' ELSE status END, updated_at = now(), last_modified_by = $3
        WHERE organization_id = $4 AND task_id = $5 AND review_route_id = $6::uuid`,
      [p.approverStep, turnHadCome, p.actorUserId, p.organizationId, m.taskId, route.id],
    );
    if (!turnHadCome) continue;
    reblocked.push(m.taskId);
    await auditTaskActionInTx(q, {
      orgId: p.organizationId, userId: p.actorUserId, command: 'task.transition', taskId: m.taskId,
      payload: { from: 'pending', to: 'blocked', routeId: route.id, step: p.approverStep, cause: 'reviewer-added' },
      reason: p.reason,
      summary: 'A reviewer was added: the approval waits for their review',
    });
    notices.push({
      organizationId: p.organizationId, recipientUserId: m.userId, category: 'task_update',
      title: `Waiting on a new reviewer: ${p.subjectTitle}`, body: p.notice, taskId: m.taskId,
    });
  }
  return { reblocked, notices };
}

/**
 * Add a reviewer to an open route (§2.10). The caller holds the subject's row
 * lock, has read the standing FOR UPDATE and checked the reason. In order,
 * each refusal with nothing written:
 *
 *   1. the actor is the sender or an organization administrator;
 *   2. no approver has signed (ROUTE_APPROVAL_STARTED): an approval is given
 *      on a complete review, so the review closes once one is signed;
 *   3. validateRouteMember, as at a reassignment: the route's sender is the
 *      sender, the actor the actor, and everyone on the route already named;
 *   4. the due date: the end of that day in the sender's time zone, not past,
 *      by the approval, and (one after another) not before the last step.
 *
 * Then the new member row: step 1 on a parallel route, the next step on a
 * sequential one, pending (and told) when every earlier step has signed. The
 * approvers move to the step after it, and any whose turn had come are blocked
 * again and told. The header's review due date (and a sequential route's
 * step dates) take the new step, and a review-route.add row on the subject
 * records it by printed name. Returns the notices to send after COMMIT.
 */
export async function addRouteReviewer(
  tx: RouteTx,
  p: { organizationId: number; actorUserId: number; reason: string; subject: RouteActSubject; standing: RouteStanding; assigneeId: number; dueDate: unknown },
): Promise<{ notices: TaskEventNotice[]; actId: string; taskId: string; step: number; to: ValidatedMember }> {
  const q = queryableFromDrizzle(tx);
  const route = p.standing.route!;
  if (route.senderId !== p.actorUserId && !(await isOrgAdmin(q, p.organizationId, p.actorUserId))) {
    throw changed(403, 'ROUTE_ADD_NOT_PERMITTED', 'Only the person who sent this review route, or an administrator, adds a reviewer to it.');
  }
  if (p.standing.members.some((m) => m.role === 'approver' && m.outcome === 'signed')) {
    throw changed(409, 'ROUTE_APPROVAL_STARTED', 'An approver has signed, so no reviewer is added to this route. Withdraw it and send a new one to add a reviewer.');
  }
  const target = routeSubjectTarget(p.subject.type, p.subject.id);
  const to = await validateRouteMember(q, {
    organizationId: p.organizationId, subjectTarget: target, programId: p.subject.programId, contentDigest: route.contentDigest,
    role: 'reviewer', candidateId: p.assigneeId, senderId: route.senderId, actorId: p.actorUserId, named: new Set(p.standing.members.map((m) => m.userId)),
  }).catch(asChangeRefusal);
  const due = await addedReviewerDue(q, route, p.dueDate);
  const reviewers = p.standing.members.filter((m) => m.role === 'reviewer');
  const step = route.order === 'sequential' ? Math.max(0, ...reviewers.map((m) => m.step)) + 1 : 1;
  const open = reviewers.filter((m) => m.step < step).every((m) => m.outcome === 'signed');
  const actorName = await printedNameOf(q, p.organizationId, p.actorUserId);
  const anchor = p.subject.programId ? await readProgramAnchorRow(q, { programId: p.subject.programId, orgId: p.organizationId, context: 'review-route-add' }) : null;
  await enterRouteWriter(q);
  const { reblocked, notices } = await reblockApprovers(q, {
    organizationId: p.organizationId, actorUserId: p.actorUserId, reason: p.reason, standing: p.standing, approverStep: step + 1, subjectTitle: p.subject.title,
    notice: `${actorName} added ${to.printedName} as a reviewer, so the approval waits for their review: ${p.reason}`,
  });
  const taskId = await addedMemberTaskId(q, p.organizationId, route.id, to.userId);
  const assigned = await writeMemberRow(tx, {
    organizationId: p.organizationId, senderId: p.actorUserId, reason: p.reason, subject: p.subject, routeId: route.id, member: to,
    step, open, dueDate: due, projectId: anchor?.id ?? undefined, taskId,
  });
  await q.query(
    `UPDATE review_routes SET review_due_at = GREATEST(COALESCE(review_due_at, $1::timestamptz), $1::timestamptz),
            reviewer_step_due_at = CASE WHEN review_order = 'sequential' THEN array_append(COALESCE(reviewer_step_due_at, '{}'::timestamptz[]), $1::timestamptz) ELSE reviewer_step_due_at END
      WHERE organization_id = $2 AND id = $3::uuid AND status = 'open'`,
    [due, p.organizationId, route.id],
  );
  const gov = await recordGovernedAction(q, {
    orgId: p.organizationId,
    userId: p.actorUserId,
    command: 'review-route.add',
    target,
    reason: p.reason,
    payload: {
      routeId: route.id, taskId, role: 'reviewer', step, dueAt: due.toISOString(), actorName,
      member: { userId: to.userId, printedName: to.printedName }, approverStep: step + 1, reblocked,
    },
    ...routeLedgerScope(p.subject.type),
  });
  return { notices: assigned ? [assigned, ...notices] : notices, actId: gov.actionId, taskId, step, to };
}
