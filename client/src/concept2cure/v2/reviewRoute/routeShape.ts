/**
 * The shape a route form names, for any subject, Vault or QMS (RR2 of
 * docs/design/REVIEW_ROUTING_2026-10-23.md §2.6, §3; NEW-4). The server's
 * rule is server/services/review/review-route-rules.ts parseRouteRequest:
 *
 *   - reviewers at the same time share one review due date; reviewers one
 *     after another each have a step (their place in the list) and a due date
 *     of their own, the dates running forward;
 *   - one or more approvers, the step after the last reviewer, parallel among
 *     themselves; every one of them signs;
 *   - the approval is due on or after the last review.
 *
 * Both route forms (v2/surfaces/VaultReviewRoute.tsx, quality/QmsReviewRoute.tsx)
 * say what Send waits for and build what it sends from here.
 */
import { reviewReasonProblem } from '../editor/reviewFields';

export type RouteOrder = 'parallel' | 'sequential';

export interface RouteShapeInput {
  /** Account ids, in the order they review when one after another. */
  reviewers: string[];
  approvers: string[];
  order: RouteOrder;
  /** The reviews' date at the same time. */
  reviewDue: string;
  /** One after another: each step's date, step 1 first. */
  stepDue: string[];
  approvalDue: string;
}

/** The order that applies: one after another needs two reviewers to order. */
export const effectiveOrder = (f: Pick<RouteShapeInput, 'reviewers' | 'order'>): RouteOrder => (f.reviewers.length >= 2 ? f.order : 'parallel');

/** The steps' dates for these reviewers: each step keeps its date, a new step has none. */
export const withSteps = (reviewers: string[], stepDue: string[]): string[] => reviewers.map((_, i) => stepDue[i] ?? '');

/** Move the reviewer at `index` one place earlier (-1) or later (+1); at an end, nothing moves. */
export function moveReviewer(reviewers: string[], index: number, delta: -1 | 1): string[] {
  const to = index + delta;
  if (index < 0 || index >= reviewers.length || to < 0 || to >= reviewers.length) return reviewers;
  const next = [...reviewers];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** The last review's date, or '' when there is none yet. */
function lastReviewDate(f: RouteShapeInput): string {
  if (f.reviewers.length === 0) return '';
  return effectiveOrder(f) === 'sequential' ? withSteps(f.reviewers, f.stepDue)[f.reviewers.length - 1] : f.reviewDue;
}

/** What the review dates still need, in words. */
function reviewDateProblems(f: RouteShapeInput): string[] {
  if (f.reviewers.length === 0) return [];
  if (effectiveOrder(f) === 'parallel') return f.reviewDue ? [] : ['Give the date the reviews are due.'];
  const steps = withSteps(f.reviewers, f.stepDue);
  if (steps.some((d) => !d)) return ['Give each step’s due date.'];
  return steps.some((d, i) => i > 0 && d < steps[i - 1]) ? ['Each step is due on or after the step before it.'] : [];
}

/** What Send is waiting for, in words; empty when the route can be sent. */
export function routeShapeMissing(f: RouteShapeInput, rules: { reviewersOptional: boolean; approverMissing: string }): string[] {
  const missing: string[] = [];
  if (f.reviewers.length === 0 && !rules.reviewersOptional) missing.push('Choose at least one reviewer.');
  if (f.approvers.length === 0) missing.push(rules.approverMissing);
  missing.push(...reviewDateProblems(f));
  if (!f.approvalDue) missing.push('Give the date the approval is due.');
  const last = lastReviewDate(f);
  if (last && f.approvalDue && f.approvalDue < last) missing.push('The approval is due on or after the reviews.');
  return missing;
}

/** What the forms send as `route` (parseRouteRequest's input). */
export function routeShapeBody(f: RouteShapeInput): Record<string, unknown> {
  const order = effectiveOrder(f);
  const reviewDates = f.reviewers.length === 0 ? {}
    : order === 'sequential' ? { reviewStepDueDates: withSteps(f.reviewers, f.stepDue) } : { reviewDueDate: f.reviewDue };
  return { reviewers: f.reviewers.map(Number), approvers: f.approvers.map(Number), order, ...reviewDates, approvalDueDate: f.approvalDue };
}

/** The governed reason's problem, said with the rest. */
export const withReason = (missing: string[], reason: string): string[] => {
  const problem = reviewReasonProblem(reason);
  return problem ? [...missing, problem] : missing;
};
