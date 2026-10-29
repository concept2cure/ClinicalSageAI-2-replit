/**
 * Task status state machine.
 *
 * `unified_tasks.status` was free text: any string was accepted, statuses the
 * board has no column for could be minted, and completed → pending was one
 * PATCH away with no record of intent (assessment D4/D5/D23). The domain and
 * its legal transitions are explicit here and shared by every mutation path.
 * Same-status writes (progress-only updates) always pass; completed →
 * in-progress/review is a deliberate, audited reopen.
 *
 * @module server/services/tasking/task-state-machine
 */

export const TASK_STATUSES = [
  'pending',
  'in-progress',
  'review',
  'completed',
  'blocked',
  'cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['in-progress', 'review', 'blocked', 'cancelled'],
  'in-progress': ['pending', 'review', 'completed', 'blocked', 'cancelled'],
  review: ['in-progress', 'completed', 'blocked', 'cancelled'],
  completed: ['review', 'in-progress'], // audited reopen only
  blocked: ['pending', 'in-progress', 'review', 'cancelled'],
  cancelled: ['pending'],
};

/**
 * Statuses a task may be CREATED in. Terminal statuses are excluded: creating
 * a task directly as `completed` skipped the approval sign-off ceremony
 * entirely (the gate only runs on transitions), so an API client could mint an
 * already-completed approval-gated task with no PIN, meaning or reason.
 * Work must be created as live work and then transitioned.
 */
export const CREATABLE_TASK_STATUSES = [
  'pending',
  'in-progress',
  'review',
  'blocked',
] as const satisfies readonly TaskStatus[];

export function isLegalTransition(from: string, to: string): boolean {
  if (from === to) return true;
  const allowed = TASK_TRANSITIONS[from as TaskStatus];
  // An unknown stored status (legacy row) may move to any known status so old
  // rows can be repaired through the UI rather than being stuck forever.
  if (!allowed) return (TASK_STATUSES as readonly string[]).includes(to);
  return allowed.includes(to as TaskStatus);
}

// ── Route tasks (finding B1, docs/design/REVIEW_ROUTING_2026-10-23.md §2.3) ──
//
// A unified_tasks row carrying review_route_id is a member of a review route:
// the person's inbox entry for a named review or approval. It is a projection
// of the route header and of the member's signature or act, and it is written
// only by server/services/review/review-route.ts. Every generic writer of a
// task row calls refuseRouteTaskWrite after it reads the row and before it
// writes, and every create path refuses input that names a route column. The
// database refuses the same writes (unified_tasks_route_rows_guard,
// migrations/20261023_review_routes.sql) unless the transaction set the
// route-writer setting, which only review-route.ts sets.

/** The route columns, as a request or a stored row may spell them. */
export const ROUTE_COLUMN_KEYS = [
  'reviewRouteId',
  'review_route_id',
  'reviewRole',
  'review_role',
  'reviewStep',
  'review_step',
  'routeSignatureId',
  'route_signature_id',
  'routeActId',
  'route_act_id',
] as const;

export const ROUTE_TASK_REFUSAL_MESSAGE =
  'This task belongs to a review route. Use the route’s actions on the document. Nothing was changed.';

export const ROUTE_COLUMNS_REFUSAL_MESSAGE =
  'Review route fields are set only by sending a document for review. Nothing was created.';

/** A generic writer met a route task, or a create named a route column. */
export class RouteTaskWriteRefused extends Error {
  readonly status: 409 | 400;
  constructor(
    readonly code: 'ROUTE_TASK_OWNED_BY_ROUTE' | 'ROUTE_COLUMNS_NOT_ADMITTED',
    readonly writer: string,
    message: string,
  ) {
    super(message);
    this.name = 'RouteTaskWriteRefused';
    this.status = code === 'ROUTE_TASK_OWNED_BY_ROUTE' ? 409 : 400;
  }
  /** The HTTP body, in the task routers' envelope. */
  get body() {
    return routeTaskRefusalBody(this);
  }
}

/** True when the row is a review route member (either spelling of the key). */
export function isRouteTask(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  return (r.reviewRouteId ?? r.review_route_id ?? null) !== null;
}

/** Throws RouteTaskWriteRefused (409) when `row` belongs to a review route. */
export function refuseRouteTaskWrite(row: unknown, writer: string): void {
  if (isRouteTask(row)) {
    throw new RouteTaskWriteRefused('ROUTE_TASK_OWNED_BY_ROUTE', writer, ROUTE_TASK_REFUSAL_MESSAGE);
  }
}

/**
 * Throws RouteTaskWriteRefused (400) when a create's input names any route
 * column, at any value. A create path's own schema already leaves them out;
 * this refuses rather than silently dropping them, so a caller that tried is
 * told nothing was created. Returns the input, so it can wrap a parse.
 */
export function refuseRouteColumnsInInput<T>(input: T, writer: string): T {
  if (!input || typeof input !== 'object') return input;
  const keys = Object.keys(input as Record<string, unknown>);
  if (keys.some((k) => (ROUTE_COLUMN_KEYS as readonly string[]).includes(k))) {
    throw new RouteTaskWriteRefused('ROUTE_COLUMNS_NOT_ADMITTED', writer, ROUTE_COLUMNS_REFUSAL_MESSAGE);
  }
  return input;
}

/** The HTTP body for a refusal, in the routers' envelope. */
export function routeTaskRefusalBody(err: RouteTaskWriteRefused) {
  return { success: false as const, code: err.code, error: err.message };
}
