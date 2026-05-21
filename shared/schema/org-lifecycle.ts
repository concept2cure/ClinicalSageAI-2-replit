/**
 * Organization Lifecycle State — beta self-serve trial state machine
 *
 * Tracks where every organization is in the signup → trial → checkout →
 * activation → suspension lifecycle. The `organizations` table already
 * carries Stripe-derived fields (`paymentStatus`, `trialEndsAt`,
 * `status`) but those reflect billing reality, not user-facing onboarding
 * progress. The lifecycle table layers the platform's canonical state
 * on top, with a tamper-evident transition history.
 *
 * Tenant isolation is by `organization_id` (the FK target) — only the
 * org itself, admins of that org, and platform super-admins can read or
 * write rows for that org. RLS enforces this once `RLS_ENFORCE=on` (see
 * migrations/0021_enable_rls_everywhere.sql).
 *
 * Closed-enum states / transitions live in this file. The service that
 * enforces transition legality is in
 * `server/services/lifecycle/org-lifecycle.ts`.
 *
 * @module shared/schema/org-lifecycle
 */

import { relations, InferSelectModel } from 'drizzle-orm';
import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { organizations } from '../schema';

// ─────────────────────────────────────────────────────────────────────────────
// Closed-enum states
// ─────────────────────────────────────────────────────────────────────────────

export const ORG_LIFECYCLE_STATES = [
  /** Signup completed; trial not yet started (rare; usually skipped). */
  'account_created',
  /** Trial in progress; AnA RI accessible. Trial ends at `organizations.trialEndsAt`. */
  'trial_active',
  /** Trial period elapsed; AnA RI blocked until checkout completes. */
  'trial_expired',
  /** Checkout initiated, Stripe session pending. AnA RI still gated. */
  'billing_pending',
  /** Stripe webhook confirmed paid subscription. AnA RI fully open. */
  'billing_active',
  /** Payment failure or manual override; product locked. */
  'suspended',
] as const;

export type OrgLifecycleState = (typeof ORG_LIFECYCLE_STATES)[number];

/**
 * Legal transitions. Reads as: from-state → set of allowed to-states.
 * Anything not in the set requires the `force` audit-override path.
 */
export const ORG_LIFECYCLE_TRANSITIONS: Record<OrgLifecycleState, readonly OrgLifecycleState[]> = {
  account_created: ['trial_active', 'billing_pending', 'suspended'],
  trial_active: ['trial_expired', 'billing_pending', 'billing_active', 'suspended'],
  trial_expired: ['billing_pending', 'suspended'],
  billing_pending: ['billing_active', 'trial_expired', 'suspended'],
  billing_active: ['billing_pending', 'suspended'],
  suspended: ['billing_active', 'trial_active'],
};

/** States in which AnA RI / governed write paths are accessible. */
export const ORG_LIFECYCLE_PRODUCTIVE_STATES: ReadonlySet<OrgLifecycleState> = new Set([
  'trial_active',
  'billing_active',
]);

/** Triggers — kept open-ended for future event sources. */
export const ORG_LIFECYCLE_TRIGGERS = [
  'signup',
  'trial_start',
  'trial_expiry_job',
  'checkout_started',
  'stripe_webhook',
  'manual_admin',
  'payment_failure',
  'subscription_change',
] as const;

export type OrgLifecycleTrigger = (typeof ORG_LIFECYCLE_TRIGGERS)[number];

/**
 * Pure-logic predicate over the closed-enum transition map.
 *
 * - First transition (no prior row): accepts `account_created` or
 *   `trial_active` only — every other state must be reached through a
 *   transition.
 * - Self-loops are always rejected.
 * - Otherwise consults `ORG_LIFECYCLE_TRANSITIONS`.
 *
 * Lives in the schema file because it has no runtime dependencies and is
 * exercised by pure unit tests. The DB-backed `transition()` in
 * `server/services/lifecycle/org-lifecycle.ts` defers to it.
 */
export function canTransition(
  fromState: OrgLifecycleState | null,
  toState: OrgLifecycleState
): boolean {
  if (fromState === null) {
    return toState === 'account_created' || toState === 'trial_active';
  }
  if (fromState === toState) return false;
  const legal = ORG_LIFECYCLE_TRANSITIONS[fromState];
  return legal?.includes(toState) ?? false;
}

// ─────────────────────────────────────────────────────────────────────────────
// org_lifecycle_state — one row per organization, holds the current state
// ─────────────────────────────────────────────────────────────────────────────

export const orgLifecycleState = pgTable(
  'org_lifecycle_state',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** FK → organizations.id. Carries tenant. */
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** Current state — one of ORG_LIFECYCLE_STATES. */
    state: varchar('state', { length: 32 }).notNull(),

    /** When the org entered the current state. */
    enteredAt: timestamp('entered_at', { withTimezone: true }).defaultNow().notNull(),

    /** Optional ISO-8601 timestamp when this state should auto-evaluate
     *  (e.g. trial_expires_at for trial_active). The trial-expiry job
     *  reads this. */
    evaluateAt: timestamp('evaluate_at', { withTimezone: true }),

    /** Free-form metadata (current quote id, Stripe session id, etc.). */
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => ({
    // One row per organization. Insertion is on first transition.
    orgIdx: uniqueIndex('org_lifecycle_state_org_idx').on(table.organizationId),
    stateIdx: index('org_lifecycle_state_state_idx').on(table.state),
    evaluateAtIdx: index('org_lifecycle_state_evaluate_at_idx').on(table.evaluateAt),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// org_lifecycle_state_history — immutable transition log
// ─────────────────────────────────────────────────────────────────────────────

export const orgLifecycleStateHistory = pgTable(
  'org_lifecycle_state_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** State prior to this transition (null for the very first row). */
    fromState: varchar('from_state', { length: 32 }),

    /** State after this transition — one of ORG_LIFECYCLE_STATES. */
    toState: varchar('to_state', { length: 32 }).notNull(),

    /** Trigger source — one of ORG_LIFECYCLE_TRIGGERS, or free-form for
     *  future extension. Kept varchar rather than enum to avoid migration
     *  churn when new triggers are added. */
    trigger: varchar('trigger', { length: 32 }).notNull(),

    /** Human or system explanation. Required for governed transitions. */
    reason: text('reason'),

    /** Whether this transition skipped the legal-transition check.
     *  Recorded so auditors can find every governance override. */
    forced: jsonb('forced').$type<boolean>().default(false),

    /** Actor user id (null when system-driven, e.g. trial expiry job). */
    actorUserId: integer('actor_user_id'),

    /** Optional payload — Stripe event id, quote id, prior session id. */
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('org_lifecycle_history_org_idx').on(table.organizationId),
    orgCreatedIdx: index('org_lifecycle_history_org_created_idx').on(
      table.organizationId,
      table.createdAt
    ),
    triggerIdx: index('org_lifecycle_history_trigger_idx').on(table.trigger),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Types + insert schemas
// ─────────────────────────────────────────────────────────────────────────────

export type OrgLifecycleStateRow = InferSelectModel<typeof orgLifecycleState>;
export type OrgLifecycleStateHistoryRow = InferSelectModel<typeof orgLifecycleStateHistory>;

export const insertOrgLifecycleStateSchema = createInsertSchema(orgLifecycleState).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOrgLifecycleStateHistorySchema = createInsertSchema(
  orgLifecycleStateHistory
).omit({
  id: true,
  createdAt: true,
});

export type InsertOrgLifecycleState = z.infer<typeof insertOrgLifecycleStateSchema>;
export type InsertOrgLifecycleStateHistory = z.infer<typeof insertOrgLifecycleStateHistorySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────────────────────

export const orgLifecycleStateRelations = relations(orgLifecycleState, ({ one }) => ({
  organization: one(organizations, {
    fields: [orgLifecycleState.organizationId],
    references: [organizations.id],
  }),
}));

export const orgLifecycleStateHistoryRelations = relations(
  orgLifecycleStateHistory,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [orgLifecycleStateHistory.organizationId],
      references: [organizations.id],
    }),
  })
);
