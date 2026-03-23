/**
 * Resolution Orchestration Schema — Sprint 4
 *
 * Implements the Resolution Orchestration Layer:
 *  1. Resolution Plans — structured resolution planning from triggers
 *  2. Resolution Bundles — governed collections of coordinated fixes
 *  3. Resolution Bundle Items — individual items within bundles
 *  4. Supersession Records — formal lineage for replaced objects
 *
 * Builds on top of existing orchestration, workflow, and artifact infrastructure.
 *
 * @module shared/schema/resolution
 */

import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  json,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  uniqueIndex,
  varchar,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════════════════════

export const resolutionTriggerTypeEnum = pgEnum('resolution_trigger_type', [
  'contradiction',
  'assumption_change',
  'decision_update',
  'impact_propagation',
  'validation_failure',
  'stale_dependency',
  'manual',
]);

export const resolutionPathEnum = pgEnum('resolution_path', [
  'harmonize',
  'supersede',
  'rewrite',
  'review_only',
  'escalate',
  'mixed',
]);

export const resolutionConfidenceEnum = pgEnum('resolution_confidence', [
  'strong',
  'moderate',
  'provisional',
  'uncertain',
]);

export const resolutionStateEnum = pgEnum('resolution_state', [
  'unresolved',
  'proposed_resolution',
  'in_resolution',
  'resolved_pending_review',
  'resolved_approved',
  'superseded',
  'cancelled',
]);

export const bundleStateEnum = pgEnum('bundle_state', [
  'draft',
  'proposed',
  'in_progress',
  'pending_review',
  'approved',
  'applied',
  'rejected',
  'cancelled',
]);

export const supersessionStateEnum = pgEnum('supersession_state', [
  'proposed',
  'confirmed',
  'reverted',
]);

// ═══════════════════════════════════════════════════════════════════════════════
// RESOLUTION PLANS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolution Plans Table
 *
 * When a contradiction, stale dependency, or impacted decision appears,
 * the platform creates a structured resolution plan that determines:
 * - what needs to change
 * - what objects are affected
 * - what resolution paths exist
 * - which path is safest / fastest / most defensible
 * - what must be reviewed or reapproved
 */
export const resolutionPlans = pgTable(
  'resolution_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),
    projectId: integer('project_id').notNull(),

    // Trigger source
    triggerType: resolutionTriggerTypeEnum('trigger_type').notNull(),
    triggerId: text('trigger_id').notNull(),
    triggerDescription: text('trigger_description').notNull(),

    // Resolution state
    state: resolutionStateEnum('state').notNull().default('unresolved'),

    // Affected objects (structured JSON)
    affectedObjects: json('affected_objects').$type<AffectedObject[]>().notNull().default([]),

    // Resolution path
    recommendedPath: resolutionPathEnum('recommended_path').notNull(),
    alternativePaths: json('alternative_paths').$type<string[]>().default([]),

    // Confidence & authority
    confidence: resolutionConfidenceEnum('confidence').notNull(),
    requiresReview: boolean('requires_review').notNull().default(true),
    requiresReapproval: boolean('requires_reapproval').notNull().default(false),
    requiresEscalation: boolean('requires_escalation').notNull().default(false),

    // Rationale
    rationale: text('rationale').notNull(),

    // Resolution tracking
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedById: integer('resolved_by_id'),
    resolutionSummary: text('resolution_summary'),

    // Linked bundle (if one was created)
    bundleId: uuid('bundle_id'),

    // Audit
    createdById: integer('created_by_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('resolution_plans_org_project_idx').on(table.organizationId, table.projectId),
    index('resolution_plans_state_idx').on(table.state),
    index('resolution_plans_trigger_idx').on(table.triggerType, table.triggerId),
    index('resolution_plans_bundle_idx').on(table.bundleId),
  ]
);

// ═══════════════════════════════════════════════════════════════════════════════
// RESOLUTION BUNDLES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolution Bundles Table
 *
 * A governed collection of coordinated fixes. Bundles group:
 * - updated assumptions
 * - affected decisions
 * - rewrite targets
 * - review thread(s)
 * - contradiction memo or resolution memo
 * - reapproval requirements
 */
export const resolutionBundles = pgTable(
  'resolution_bundles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),
    projectId: integer('project_id').notNull(),

    // Bundle metadata
    title: text('title').notNull(),
    description: text('description'),
    state: bundleStateEnum('state').notNull().default('draft'),

    // Linked resolution plan
    planId: uuid('plan_id'),

    // Resolution memo (the authoritative record of what was decided)
    resolutionMemo: text('resolution_memo'),

    // Review & approval
    requiresReview: boolean('requires_review').notNull().default(true),
    requiresReapproval: boolean('requires_reapproval').notNull().default(false),
    reviewThreadId: text('review_thread_id'),
    approvedById: integer('approved_by_id'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),

    // Confidence
    confidence: resolutionConfidenceEnum('confidence').notNull().default('moderate'),

    // Audit
    createdById: integer('created_by_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('resolution_bundles_org_project_idx').on(table.organizationId, table.projectId),
    index('resolution_bundles_state_idx').on(table.state),
    index('resolution_bundles_plan_idx').on(table.planId),
  ]
);

// ═══════════════════════════════════════════════════════════════════════════════
// RESOLUTION BUNDLE ITEMS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolution Bundle Items Table
 *
 * Individual items within a bundle. Each item represents a specific
 * action that needs to be taken as part of the resolution.
 */
export const resolutionBundleItems = pgTable(
  'resolution_bundle_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bundleId: uuid('bundle_id').notNull(),

    // What this item targets
    objectType: varchar('object_type', { length: 100 }).notNull(), // 'artifact', 'assumption', 'decision', 'document', 'section'
    objectId: text('object_id').notNull(),
    objectTitle: text('object_title'),

    // What action is needed
    actionType: varchar('action_type', { length: 50 }).notNull(), // 'rewrite', 'review', 'supersede', 'reapprove', 'harmonize', 'escalate'
    actionDescription: text('action_description').notNull(),

    // Prepared rewrite content (if applicable)
    preparedContent: text('prepared_content'),
    preparedContentConfidence: resolutionConfidenceEnum('prepared_content_confidence'),

    // Impact details
    sectionCode: text('section_code'),
    impactRationale: text('impact_rationale'),

    // Status
    status: varchar('status', { length: 30 }).notNull().default('pending'), // 'pending', 'in_progress', 'completed', 'skipped', 'failed'
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedById: integer('completed_by_id'),

    // Order within bundle
    sortOrder: integer('sort_order').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('resolution_bundle_items_bundle_idx').on(table.bundleId),
    index('resolution_bundle_items_object_idx').on(table.objectType, table.objectId),
  ]
);

// ═══════════════════════════════════════════════════════════════════════════════
// SUPERSESSION RECORDS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Supersession Records Table
 *
 * When assumptions, decisions, or artifacts are replaced as part of a
 * resolution, this table preserves explicit lineage.
 */
export const supersessionRecords = pgTable(
  'supersession_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),
    projectId: integer('project_id').notNull(),

    // The object being superseded
    supersededObjectType: varchar('superseded_object_type', { length: 100 }).notNull(),
    supersededObjectId: text('superseded_object_id').notNull(),
    supersededObjectTitle: text('superseded_object_title'),

    // The new successor object
    successorObjectType: varchar('successor_object_type', { length: 100 }).notNull(),
    successorObjectId: text('successor_object_id').notNull(),
    successorObjectTitle: text('successor_object_title'),

    // Supersession metadata
    state: supersessionStateEnum('state').notNull().default('proposed'),
    rationale: text('rationale').notNull(),
    resolutionPlanId: uuid('resolution_plan_id'),
    bundleId: uuid('bundle_id'),

    // Who and when
    createdById: integer('created_by_id').notNull(),
    confirmedById: integer('confirmed_by_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  },
  (table) => [
    index('supersession_org_project_idx').on(table.organizationId, table.projectId),
    index('supersession_superseded_idx').on(table.supersededObjectType, table.supersededObjectId),
    index('supersession_successor_idx').on(table.successorObjectType, table.successorObjectId),
    index('supersession_plan_idx').on(table.resolutionPlanId),
  ]
);

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES (used by JSON columns)
// ═══════════════════════════════════════════════════════════════════════════════

export interface AffectedObject {
  objectType: string;
  objectId: string;
  objectTitle?: string;
  sectionCode?: string;
  impactState?: 'direct' | 'indirect' | 'potential';
  impactRationale?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RELATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const resolutionPlansRelations = relations(resolutionPlans, ({ one, many }) => ({
  bundle: one(resolutionBundles, {
    fields: [resolutionPlans.bundleId],
    references: [resolutionBundles.id],
  }),
  supersessions: many(supersessionRecords),
}));

export const resolutionBundlesRelations = relations(resolutionBundles, ({ one, many }) => ({
  plan: one(resolutionPlans, {
    fields: [resolutionBundles.planId],
    references: [resolutionPlans.id],
  }),
  items: many(resolutionBundleItems),
  supersessions: many(supersessionRecords),
}));

export const resolutionBundleItemsRelations = relations(resolutionBundleItems, ({ one }) => ({
  bundle: one(resolutionBundles, {
    fields: [resolutionBundleItems.bundleId],
    references: [resolutionBundles.id],
  }),
}));

export const supersessionRecordsRelations = relations(supersessionRecords, ({ one }) => ({
  plan: one(resolutionPlans, {
    fields: [supersessionRecords.resolutionPlanId],
    references: [resolutionPlans.id],
  }),
  bundle: one(resolutionBundles, {
    fields: [supersessionRecords.bundleId],
    references: [resolutionBundles.id],
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// INSERT SCHEMAS (for Zod validation)
// ═══════════════════════════════════════════════════════════════════════════════

export const insertResolutionPlanSchema = createInsertSchema(resolutionPlans);
export const insertResolutionBundleSchema = createInsertSchema(resolutionBundles);
export const insertResolutionBundleItemSchema = createInsertSchema(resolutionBundleItems);
export const insertSupersessionRecordSchema = createInsertSchema(supersessionRecords);

// ═══════════════════════════════════════════════════════════════════════════════
// SELECT TYPES (for queries)
// ═══════════════════════════════════════════════════════════════════════════════

export type ResolutionPlan = typeof resolutionPlans.$inferSelect;
export type NewResolutionPlan = typeof resolutionPlans.$inferInsert;
export type ResolutionBundle = typeof resolutionBundles.$inferSelect;
export type NewResolutionBundle = typeof resolutionBundles.$inferInsert;
export type ResolutionBundleItem = typeof resolutionBundleItems.$inferSelect;
export type NewResolutionBundleItem = typeof resolutionBundleItems.$inferInsert;
export type SupersessionRecord = typeof supersessionRecords.$inferSelect;
export type NewSupersessionRecord = typeof supersessionRecords.$inferInsert;
