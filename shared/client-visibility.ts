/**
 * Client visibility — the shared domain for `unified_tasks.client_visibility`
 * (column added by db/migrations/20260727_unified_tasks_mdx_metadata.sql;
 * Drizzle: unifiedTasks.clientVisibility in shared/schema.ts).
 *
 * Work order MDX-CLIENT-01 (Client Review Room): a consultancy runs many
 * internal work items per filing that its paying client must never see
 * (pricing strategy, internal review loops, agency back-channel notes).
 * The `client_visibility` state on each task decides what crosses the wall:
 *
 *   internal                — default posture; never leaves the org's own view
 *   client_visible          — shared with the client for awareness/review
 *   client_action_required  — the client owes an input (signature, data, decision)
 *   authority_ready         — agreed final; queued for the health authority
 *
 * The column stays plain text in Postgres (additive migration, no enum), so
 * this module is the single app-enforced domain. Server routes and client
 * hooks must both import from here — the whitelist CLIENT_REVIEW_STATES is
 * what the client-review endpoint filters by in SQL, which is how `internal`
 * rows are structurally unable to reach a client-facing payload.
 *
 * This module is imported by client bundles — keep it dependency-free and
 * free of schema/server imports.
 */

/** Every valid `unified_tasks.client_visibility` value. */
export const CLIENT_VISIBILITY = [
  'internal',
  'client_visible',
  'client_action_required',
  'authority_ready',
] as const;

export type ClientVisibility = (typeof CLIENT_VISIBILITY)[number];

/**
 * The states a client is allowed to see, in display order (most actionable
 * first). `internal` is deliberately absent — a row that is NULL, `internal`,
 * or any unrecognized value must never appear in a client-facing view.
 * The client-review endpoint uses this list as a SQL `IN (...)` whitelist,
 * so exclusion is enforced at the query, not in post-processing.
 */
export const CLIENT_REVIEW_STATES = [
  'client_action_required',
  'client_visible',
  'authority_ready',
] as const;

export type ClientReviewState = (typeof CLIENT_REVIEW_STATES)[number];

const CLIENT_REVIEW_STATE_SET: ReadonlySet<string> = new Set(CLIENT_REVIEW_STATES);

/** True only for the three client-visible states; false for `internal`,
 *  null/undefined, and anything outside the domain. */
export function isClientReviewState(value: unknown): value is ClientReviewState {
  return typeof value === 'string' && CLIENT_REVIEW_STATE_SET.has(value);
}

/** Rows bucketed by client-review state — one array per visible state. */
export type ClientReviewGroups<T> = Record<ClientReviewState, T[]>;

/** A groups object with every visible state present and empty. */
export function emptyClientReviewGroups<T>(): ClientReviewGroups<T> {
  return {
    client_action_required: [],
    client_visible: [],
    authority_ready: [],
  };
}

/**
 * Pure grouper: bucket `rows` by their client-review state.
 *
 * Rows whose state is not one of CLIENT_REVIEW_STATES — including
 * `internal`, NULL (never classified), and unknown strings — are DROPPED,
 * never bucketed. This mirrors (and backstops) the SQL whitelist: even if a
 * caller feeds this function an unfiltered row set, internal work cannot
 * come out the other side. Input order is preserved within each bucket.
 *
 * @param rows      Rows to bucket (any shape).
 * @param getState  Extracts the row's raw client_visibility value.
 */
export function groupByClientReviewState<T>(
  rows: readonly T[],
  getState: (row: T) => string | null | undefined,
): ClientReviewGroups<T> {
  const groups = emptyClientReviewGroups<T>();
  for (const row of rows) {
    const state = getState(row);
    if (isClientReviewState(state)) groups[state].push(row);
  }
  return groups;
}

/** Per-state counts plus total, for summary strips and envelope meta. */
export function countClientReviewGroups(
  groups: ClientReviewGroups<unknown>,
): { counts: Record<ClientReviewState, number>; total: number } {
  const counts = {
    client_action_required: groups.client_action_required.length,
    client_visible: groups.client_visible.length,
    authority_ready: groups.authority_ready.length,
  };
  return {
    counts,
    total: counts.client_action_required + counts.client_visible + counts.authority_ready,
  };
}
