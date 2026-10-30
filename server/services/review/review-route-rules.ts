/**
 * What a review route request may say, and the reads that answer for it, with
 * nothing written (docs/design/REVIEW_ROUTING_2026-10-23.md §2.6, §2.11, §3,
 * §4; RR1a, RR4, RR2). The one writer, review-route.ts, applies these rules;
 * they live here so it holds only writes. Moved out of review-route.ts
 * unchanged in RR2, when that file reached its length limit, and extended there:
 *
 *   - parseRouteRequest: who is named, in which order, with which due dates.
 *     Parallel reviewers share one review due date. Reviewers one after
 *     another (RR2, §3) each have a step of their own and a due date of their
 *     own, the dates running forward. Approvers are the step after the last
 *     reviewer, parallel among themselves, and every one of them signs (NEW-4).
 *   - dueInstants, endsOfDays: each date is the end of that day in the
 *     sender's notification time zone, stored as an instant (§2.11).
 *   - stepOf: a member's step (§3).
 *   - printedNameOf, senderTimeZone, isOrgAdmin, routeRemindRefusal,
 *     routeLedgerScope.
 *
 * @module server/services/review/review-route-rules
 */
import { ReviewRouteRefusal } from './review-route-member';
import type { RouteHeader, RouteQueryable, RouteSubjectType } from './review-route-standing';

const unchanged = (status: 400 | 409, code: string, message: string) => new ReviewRouteRefusal(status, code, `${message} Nothing was changed.`);

export interface RouteRequest {
  /** In the sender's order; one after another, the first is step 1 (RR2). */
  reviewers: number[];
  approvers: number[];
  order: 'parallel' | 'sequential';
  /**
   * Calendar dates (YYYY-MM-DD), each the end of that day in the sender's time
   * zone. The review date is null only on a route that names no reviewer (a
   * QMS route may name none, NEW-4). On a sequential route it is the last
   * step's date.
   */
  reviewDueDate: string | null;
  /** A sequential route's date for each step, in step order; null on a parallel route (RR2). */
  reviewStepDueDates: string[] | null;
  /** Null only on a route that names no approver (an Authoring route at RR5, whose approvers are RR6). */
  approvalDueDate: string | null;
}

/**
 * The floor a subject's route keeps (NEW-4, §4): a Vault version names at
 * least one reviewer and one approver; a QMS controlled document names at
 * least one approver, and reviewers are optional (RR4).
 */
export interface RouteRequestRules {
  reviewersOptional?: boolean;
  /**
   * RR5: an Authoring route names its reviewers only. Its approvers join the
   * route in RR6, so until then it names none and has no approval due date.
   * A route still names at least one person (a reviewer, then).
   */
  approversOptional?: boolean;
}

/** The ledger's domain and surface for a subject's naming history. */
export function routeLedgerScope(type: RouteSubjectType): { domain: string; surface: string } {
  if (type === 'authoring_document') return { domain: 'authoring', surface: 'authoring' };
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
  if (approvers.length === 0 && !rules.approversOptional) throw refusal(400, 'ROUTE_APPROVER_REQUIRED', 'Name at least one approver.');
  if (reviewers.length === 0 && approvers.length === 0) throw refusal(400, 'ROUTE_REVIEWER_REQUIRED', 'Name at least one reviewer.');
  return { reviewers, approvers };
}

/** The order: parallel (every reviewer at once) or sequential (one after another, RR2), which needs a reviewer to put in order. */
function routeOrder(r: Record<string, unknown>, reviewers: number[]): 'parallel' | 'sequential' {
  const order = r.order ?? 'parallel';
  if (order !== 'parallel' && order !== 'sequential') throw refusal(400, 'ROUTE_INVALID', 'The review order is "parallel" or "sequential".');
  if (order === 'sequential' && reviewers.length === 0) {
    throw refusal(400, 'ROUTE_INVALID', 'Reviewers one after another needs at least one reviewer.');
  }
  return order;
}

/** A calendar date as a route takes it (YYYY-MM-DD). */
export const isRouteDate = (v: unknown): v is string => typeof v === 'string' && DATE.test(v);
const isDate = isRouteDate;

/** A sequential route's step dates: one per reviewer, each a date, each on or after the one before. */
function stepDueDates(r: Record<string, unknown>, reviewers: number): string[] {
  const steps = r.reviewStepDueDates;
  if (!Array.isArray(steps) || steps.length !== reviewers || !steps.every(isDate)) {
    throw refusal(400, 'ROUTE_DUE_DATES_REQUIRED', 'Give a due date for each reviewer’s step, in order, and an approval due date.');
  }
  if (steps.some((d, i) => i > 0 && d < steps[i - 1])) {
    throw refusal(400, 'ROUTE_DUE_ORDER', 'Each reviewer’s step is due on or after the step before it.');
  }
  return steps;
}

/** The route a request names, or the refusal that says what is wrong with it. Nothing is read. */
export function parseRouteRequest(raw: unknown, rules: RouteRequestRules = {}): RouteRequest {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const { reviewers, approvers } = namedPeople(r, rules);
  const order = routeOrder(r, reviewers);
  const base = { reviewers, approvers, order };
  if (approvers.length === 0) return reviewOnly(r, base);
  if (reviewers.length === 0) {
    if (!isDate(r.approvalDueDate)) throw refusal(400, 'ROUTE_DUE_DATES_REQUIRED', 'Give an approval due date.');
    return { ...base, reviewDueDate: null, reviewStepDueDates: null, approvalDueDate: r.approvalDueDate };
  }
  if (order === 'sequential') {
    const steps = stepDueDates(r, reviewers.length);
    if (!isDate(r.approvalDueDate)) throw refusal(400, 'ROUTE_DUE_DATES_REQUIRED', 'Give an approval due date.');
    return { ...base, reviewDueDate: steps[steps.length - 1], reviewStepDueDates: steps, approvalDueDate: r.approvalDueDate };
  }
  if (!isDate(r.reviewDueDate) || !isDate(r.approvalDueDate)) {
    throw refusal(400, 'ROUTE_DUE_DATES_REQUIRED', 'Give a review due date and an approval due date.');
  }
  return { ...base, reviewDueDate: r.reviewDueDate, reviewStepDueDates: null, approvalDueDate: r.approvalDueDate };
}

/** A route that names reviewers and no approver (RR5, Authoring): the review's dates only. */
function reviewOnly(r: Record<string, unknown>, base: Pick<RouteRequest, 'reviewers' | 'approvers' | 'order'>): RouteRequest {
  if (base.order === 'sequential') {
    const steps = stepDueDates(r, base.reviewers.length);
    return { ...base, reviewDueDate: steps[steps.length - 1], reviewStepDueDates: steps, approvalDueDate: null };
  }
  if (!isDate(r.reviewDueDate)) throw refusal(400, 'ROUTE_DUE_DATES_REQUIRED', 'Give a review due date.');
  return { ...base, reviewDueDate: r.reviewDueDate, reviewStepDueDates: null, approvalDueDate: null };
}

/** The sender's notification time zone, the one every due date is the end of a day in (UTC when unset or unknown). */
export async function senderTimeZone(q: RouteQueryable, senderId: number): Promise<string> {
  // tenant-isolation-safe: notification_preferences is keyed by user only (no tenant column); the sender is the session user.
  const pref = await q.query(`SELECT timezone FROM notification_preferences WHERE user_id = $1 ORDER BY id LIMIT 1`, [senderId]);
  const wanted = String(pref.rows[0]?.timezone ?? 'UTC') || 'UTC';
  const known = await q.query(`SELECT 1 FROM pg_timezone_names WHERE name = $1`, [wanted]);
  return known.rows.length ? wanted : 'UTC';
}

/** The end of each day (YYYY-MM-DD) in a time zone, as instants in the order given, and the database's now. */
export async function endsOfDays(q: RouteQueryable, dates: string[], timeZone: string): Promise<{ instants: Date[]; now: Date }> {
  // One row per date, not an array: a timestamptz[] reaches the driver as text.
  const { rows } = await q.query(
    `SELECT ((u.d + 1)::timestamp AT TIME ZONE $2) - interval '1 millisecond' AS ends, now() AS now
       FROM unnest($1::date[]) WITH ORDINALITY AS u(d, ord) ORDER BY u.ord`,
    [dates, timeZone],
  );
  if (rows.length !== dates.length) throw new Error(`Expected ${dates.length} due instants, read ${rows.length}`);
  return { instants: rows.map((r) => new Date(r.ends)), now: new Date(rows[0]?.now ?? Date.now()) };
}

export interface RouteDue {
  /** The review's due instant (the last step's, one after another); null with no reviewer. */
  review: Date | null;
  /** A sequential route's instant for each step; null on a parallel route. */
  steps: Date[] | null;
  /** Null on a route that names no approver (RR5). */
  approval: Date | null;
  timeZone: string;
}

/** End of each day in the sender's notification time zone (UTC when unset or unknown), as instants; no review instant on a route with no reviewer. */
export async function dueInstants(q: RouteQueryable, senderId: number, req: RouteRequest): Promise<RouteDue> {
  const timeZone = await senderTimeZone(q, senderId);
  const reviewDates = req.reviewStepDueDates ?? (req.reviewDueDate ? [req.reviewDueDate] : []);
  const dates = req.approvalDueDate ? [...reviewDates, req.approvalDueDate] : reviewDates;
  const { instants, now } = await endsOfDays(q, dates, timeZone);
  const approval = req.approvalDueDate ? instants[instants.length - 1] : null;
  const reviewInstants = req.approvalDueDate ? instants.slice(0, -1) : instants;
  const review = reviewInstants.length ? reviewInstants[reviewInstants.length - 1] : null;
  const first = reviewInstants[0] ?? approval!;
  if (first.getTime() <= now.getTime()) {
    throw new ReviewRouteRefusal(400, 'ROUTE_DUE_IN_PAST', `The ${review ? 'review' : 'approval'} due date has passed. Nothing was sent.`);
  }
  if (review && approval && approval.getTime() < review.getTime()) {
    throw new ReviewRouteRefusal(400, 'ROUTE_DUE_ORDER', 'The approval is due on or after the review. Nothing was sent.');
  }
  return { review, steps: req.reviewStepDueDates ? reviewInstants : null, approval, timeZone };
}

/**
 * A member's step (§3). Parallel: every reviewer is step 1. Sequential: the
 * reviewers are steps 1…n in the sender's order. Approvers are the step after
 * the last reviewer (step 1 when nobody reviews), parallel among themselves.
 */
export function stepOf(role: 'reviewer' | 'approver', index: number, route: { order: 'parallel' | 'sequential'; reviewers: number }): number {
  const reviewerSteps = route.reviewers === 0 ? 0 : route.order === 'sequential' ? route.reviewers : 1;
  if (role === 'approver') return reviewerSteps + 1;
  return route.order === 'sequential' ? index + 1 : 1;
}

/** A member's printed name, as a route records it at naming (users.name, else the e-mail's local part). */
export async function printedNameOf(q: RouteQueryable, organizationId: number, userId: number): Promise<string> {
  const { rows } = await q.query(
    `SELECT u.name, u.email FROM organization_users ou JOIN users u ON u.id = ou.user_id WHERE ou.organization_id = $1 AND ou.user_id = $2`,
    [organizationId, userId],
  );
  const r = rows[0];
  return String(r?.name || (r?.email ? String(r.email).split('@')[0] : `Account #${userId}`));
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

// ── RR2: a reviewer added to an open route (§2.10) ──────────────────────────

/** Each member's step and due instant at a send: reviewers in the sender's order, then the approvers (§3). */
export function placed<M extends { role: 'reviewer' | 'approver' }>(members: M[], request: RouteRequest, due: { review: Date | null; steps: Date[] | null; approval: Date | null }) {
  const shape = { order: request.order, reviewers: request.reviewers.length };
  let index = 0;
  return members.map((m) => {
    const i = m.role === 'reviewer' ? index++ : 0;
    const step = stepOf(m.role, i, shape);
    // A reviewer always has a review date; an approver always has the approval's (a route without one names no approver).
    const dueDate = (m.role === 'approver' ? due.approval : due.steps?.[i] ?? due.review ?? due.approval) as Date;
    return { member: m, step, dueDate };
  });
}

/** The new reviewer's due instant: the end of that day in the sender's time zone, not past, by the approval, and (one after another) not before the last step. */
export async function addedReviewerDue(q: RouteQueryable, route: Pick<RouteHeader, 'senderId' | 'approvalDueAt' | 'reviewDueAt' | 'order'>, dueDate: unknown): Promise<Date> {
  if (!isRouteDate(dueDate)) throw unchanged(400, 'ROUTE_DUE_DATES_REQUIRED', 'Give the new reviewer’s due date (YYYY-MM-DD).');
  const { instants: [due], now } = await endsOfDays(q, [dueDate], await senderTimeZone(q, route.senderId));
  if (due.getTime() <= now.getTime()) throw unchanged(400, 'ROUTE_DUE_IN_PAST', 'The new reviewer’s due date has passed.');
  if (route.approvalDueAt && due.getTime() > new Date(route.approvalDueAt).getTime()) {
    throw unchanged(400, 'ROUTE_DUE_ORDER', 'The new reviewer is due on or before the approval.');
  }
  if (route.order === 'sequential' && route.reviewDueAt && due.getTime() < new Date(route.reviewDueAt).getTime()) {
    throw unchanged(400, 'ROUTE_DUE_ORDER', 'One after another, the new reviewer is due on or after the step before it.');
  }
  return due;
}

/** A task id for a member added to a route: the send's own form, unless reassignment already gave it to someone. */
export async function addedMemberTaskId(q: RouteQueryable, organizationId: number, routeId: string, userId: number): Promise<string> {
  const base = `ROUTE-${routeId.slice(0, 8)}-${userId}`;
  const { rows } = await q.query(`SELECT task_id FROM unified_tasks WHERE organization_id = $1 AND task_id LIKE $2 || '%'`, [organizationId, base]);
  return rows.length === 0 ? base : `${base}-${rows.length + 1}`;
}
