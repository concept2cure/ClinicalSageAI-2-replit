/**
 * Organization lifecycle state machine.
 *
 * Reads/writes `org_lifecycle_state` (current state, one row per org) and
 * appends every transition to `org_lifecycle_state_history` (immutable log).
 * Enforces the legal-transition map from the closed-enum schema unless the
 * caller explicitly passes `force: true` — forced transitions land in the
 * history with the override flag set so they're discoverable in audit.
 *
 * The model mirrors the PDEV state-guard pattern in
 * `server/services/pdev/pdev-state-guard.ts` — single source for transition
 * legality, single audit row per transition, no parallel state stores.
 *
 * Tenant isolation:
 *   - Every read/write filters by `organizationId`. Callers must have
 *     already validated the actor's membership in that organization (the
 *     `requireTenantContext` middleware sets `req.organizationId` from
 *     the JWT).
 *   - Once RLS_ENFORCE=on, the policies on `org_lifecycle_state` and
 *     `org_lifecycle_state_history` enforce isolation at the DB layer.
 *
 * Consumers (to be added in follow-up PRs):
 *   - `server/routes/auth.ts` signup → initial transition to `trial_active`.
 *   - `server/routes/billing.ts` Stripe webhook → `billing_active`.
 *   - `server/routes/onboarding/*.ts` quote/checkout flow.
 *   - `server/middleware/lifecycleGate.ts` AnA RI access gate.
 *   - A Bull repeatable job for trial expiry (Track E).
 *
 * @module server/services/lifecycle/org-lifecycle
 */

import { desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import {
  orgLifecycleState,
  orgLifecycleStateHistory,
  ORG_LIFECYCLE_TRANSITIONS,
  ORG_LIFECYCLE_PRODUCTIVE_STATES,
  canTransition,
  type OrgLifecycleState,
  type OrgLifecycleStateRow,
  type OrgLifecycleStateHistoryRow,
  type OrgLifecycleTrigger,
} from '../../../shared/schema/org-lifecycle';

// Re-export the pure predicate so callers of this service can reach it
// without depending on the schema module directly.
export { canTransition };

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TransitionInput {
  organizationId: number;
  /** Desired new state. Must be reachable from the current state per
   *  ORG_LIFECYCLE_TRANSITIONS, unless `force: true`. */
  toState: OrgLifecycleState;
  /** Event source — see ORG_LIFECYCLE_TRIGGERS in schema for canonical list. */
  trigger: OrgLifecycleTrigger | string;
  /** Free-form explanation. Required when `force: true`. */
  reason?: string;
  /** Override the legal-transition gate. Recorded in history. */
  force?: boolean;
  /** Actor user id (null for system-driven transitions). */
  actorUserId?: number | null;
  /** Optional structured payload (Stripe event id, quote id, etc.). */
  metadata?: Record<string, unknown>;
  /** Optional auto-evaluation timestamp (e.g. trial expiry). */
  evaluateAt?: Date | null;
}

export type TransitionResult =
  | {
      ok: true;
      fromState: OrgLifecycleState | null;
      toState: OrgLifecycleState;
      historyId: string;
    }
  | {
      ok: false;
      reason: 'illegal_transition' | 'missing_reason_for_force' | 'same_state';
      fromState: OrgLifecycleState | null;
      toState: OrgLifecycleState;
      allowed?: readonly OrgLifecycleState[];
    };

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

export async function getCurrentState(
  organizationId: number
): Promise<OrgLifecycleStateRow | null> {
  const rows = await db
    .select()
    .from(orgLifecycleState)
    .where(eq(orgLifecycleState.organizationId, organizationId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getHistory(
  organizationId: number,
  limit = 50
): Promise<OrgLifecycleStateHistoryRow[]> {
  return db
    .select()
    .from(orgLifecycleStateHistory)
    .where(eq(orgLifecycleStateHistory.organizationId, organizationId))
    .orderBy(desc(orgLifecycleStateHistory.createdAt))
    .limit(limit);
}

/**
 * Cheap predicate — does the org currently sit in a state where AnA RI
 * and other governed write paths should be accessible?
 *
 * Returns `true` for `trial_active` and `billing_active`, `false` for
 * every other state, including the absence of a row (defaults to closed).
 *
 * Note: this does NOT check `organizations.trialEndsAt`. The trial-expiry
 * job is responsible for transitioning expired trials to `trial_expired`.
 * Until that job runs, an over-due trial is still considered productive
 * by this function — that's the deliberate trade-off for keeping the
 * gate cheap (one indexed PK lookup, no clock-time arithmetic).
 */
export async function isProductiveState(organizationId: number): Promise<boolean> {
  const row = await getCurrentState(organizationId);
  if (!row) return false;
  return ORG_LIFECYCLE_PRODUCTIVE_STATES.has(row.state as OrgLifecycleState);
}

// ─────────────────────────────────────────────────────────────────────────────
// Transition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply a transition. Atomic — the current-state upsert and the history
 * append happen in a single transaction.
 *
 * Returns `{ ok: true, ... }` on success, `{ ok: false, reason: ... }`
 * when the transition is rejected (no-op on the DB).
 */
export async function transition(input: TransitionInput): Promise<TransitionResult> {
  const {
    organizationId,
    toState,
    trigger,
    reason,
    force = false,
    actorUserId = null,
    metadata = {},
    evaluateAt = null,
  } = input;

  if (force && (!reason || reason.trim().length === 0)) {
    return {
      ok: false,
      reason: 'missing_reason_for_force',
      fromState: null,
      toState,
    };
  }

  return db.transaction(async tx => {
    const existing = await tx
      .select()
      .from(orgLifecycleState)
      .where(eq(orgLifecycleState.organizationId, organizationId))
      .limit(1);

    const currentRow = existing[0] ?? null;
    const fromState = (currentRow?.state ?? null) as OrgLifecycleState | null;

    if (fromState === toState) {
      return {
        ok: false,
        reason: 'same_state' as const,
        fromState,
        toState,
      };
    }

    if (!force && !canTransition(fromState, toState)) {
      return {
        ok: false,
        reason: 'illegal_transition' as const,
        fromState,
        toState,
        allowed: fromState === null ? (['account_created', 'trial_active'] as const) : ORG_LIFECYCLE_TRANSITIONS[fromState],
      };
    }

    if (currentRow) {
      await tx
        .update(orgLifecycleState)
        .set({
          state: toState,
          enteredAt: new Date(),
          evaluateAt,
          metadata,
          updatedAt: new Date(),
        })
        .where(eq(orgLifecycleState.organizationId, organizationId));
    } else {
      await tx.insert(orgLifecycleState).values({
        organizationId,
        state: toState,
        enteredAt: new Date(),
        evaluateAt,
        metadata,
      });
    }

    const inserted = await tx
      .insert(orgLifecycleStateHistory)
      .values({
        organizationId,
        fromState,
        toState,
        trigger,
        reason: reason ?? null,
        forced: force,
        actorUserId,
        metadata,
      })
      .returning({ id: orgLifecycleStateHistory.id });

    return {
      ok: true as const,
      fromState,
      toState,
      historyId: inserted[0].id,
    };
  });
}

/**
 * Convenience: idempotent "ensure this org has a lifecycle row" used by
 * the signup path. Inserts `account_created` (or `trial_active` if a
 * trial is supplied) on first call, no-op on subsequent calls.
 */
export async function ensureInitialState(
  organizationId: number,
  options: {
    initial?: Extract<OrgLifecycleState, 'account_created' | 'trial_active'>;
    trialExpiresAt?: Date | null;
    actorUserId?: number | null;
  } = {}
): Promise<TransitionResult | { ok: true; existing: true; fromState: OrgLifecycleState }> {
  const existing = await getCurrentState(organizationId);
  if (existing) {
    return { ok: true, existing: true, fromState: existing.state as OrgLifecycleState };
  }
  const initial = options.initial ?? 'trial_active';
  return transition({
    organizationId,
    toState: initial,
    trigger: initial === 'trial_active' ? 'trial_start' : 'signup',
    reason: initial === 'trial_active' ? 'Initial trial provisioning on signup.' : 'Account created.',
    actorUserId: options.actorUserId ?? null,
    evaluateAt: options.trialExpiresAt ?? null,
  });
}
