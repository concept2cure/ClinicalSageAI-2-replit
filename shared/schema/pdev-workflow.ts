/**
 * PDEV → IND Workflow Schema
 *
 * Per-program state for the canonical PDEV activity registry defined in
 * `server/services/pdev/pdev-activity-registry.ts`. The registry is a
 * closed enum (TypeScript); this file holds the *runtime* per-program
 * state plus point-in-time readiness snapshots.
 *
 * Tenant isolation is enforced at the service layer by joining
 * `regulatoryPrograms` (which carries `organization_id`) before every
 * read or write. PDEV tables themselves carry only `program_id`,
 * mirroring the q-sub and evidence-sufficiency precedent.
 *
 * See PDEV_IND_WORKFLOW_AUDIT.md (repo root) for the architecture
 * finding that justifies these tables existing alongside the existing
 * IND / regulatory primitives rather than replacing them.
 *
 * @module shared/schema/pdev-workflow
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
  decimal,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { regulatoryPrograms } from './programs';

// ─────────────────────────────────────────────────────────────────────────────
// pdev_program_activities — per-program state of each registry activity
// ─────────────────────────────────────────────────────────────────────────────

export const pdevProgramActivities = pgTable(
  'pdev_program_activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** FK → regulatoryPrograms.id. Carries the tenant via the join. */
    programId: uuid('program_id')
      .notNull()
      .references(() => regulatoryPrograms.id, { onDelete: 'cascade' }),

    /** Stable activity key from the registry (e.g. 'cmc.formulation_development'). */
    activityKey: varchar('activity_key', { length: 96 }).notNull(),

    /** Denormalized for fast filtering: workstream + stage from the registry. */
    workstream: varchar('workstream', { length: 16 }).notNull(),
    stage: varchar('stage', { length: 24 }).notNull(),

    /** Current lifecycle state — value drawn from PDEV_ACTIVITY_STATES. */
    state: varchar('state', { length: 32 }).notNull().default('not_started'),

    /** Owner user id (regulatoryPrograms.team_members shape — int for now). */
    ownerUserId: integer('owner_user_id'),

    /** Reviewer user id (for human-review states). */
    reviewerUserId: integer('reviewer_user_id'),

    /** Free-text notes from the latest state change. */
    notes: text('notes'),

    /** Document codes (from the registry's requiredDocuments) attached
     *  to this activity instance. Mirrors the registry but allows
     *  per-program overrides / additions. */
    attachedDocumentCodes: jsonb('attached_document_codes').$type<string[]>().default([]),

    /** Evidence object ids (from evidenceObjects table) linked to this
     *  activity. Read-side; the canonical link lives in evidenceLinks. */
    evidenceObjectIds: jsonb('evidence_object_ids').$type<string[]>().default([]),

    /** Contradiction registry ids (from contradiction engine) currently
     *  open against this activity. Read-side cache. */
    openContradictionIds: jsonb('open_contradiction_ids').$type<string[]>().default([]),

    /** Owner-set due date for this activity. */
    dueDate: timestamp('due_date', { withTimezone: true }),

    /** Latest state transition timestamp. */
    stateChangedAt: timestamp('state_changed_at', { withTimezone: true }).defaultNow().notNull(),

    /** Most recent actor (user id) on the activity. */
    stateChangedBy: integer('state_changed_by'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => ({
    // One row per (program, activity) — registry is closed, so uniqueness holds.
    programActivityIdx: uniqueIndex('pdev_program_activity_idx').on(
      table.programId,
      table.activityKey
    ),
    programWorkstreamIdx: index('pdev_program_workstream_idx').on(
      table.programId,
      table.workstream
    ),
    programStageIdx: index('pdev_program_stage_idx').on(table.programId, table.stage),
    stateIdx: index('pdev_activity_state_idx').on(table.state),
    ownerIdx: index('pdev_activity_owner_idx').on(table.ownerUserId),
    dueDateIdx: index('pdev_activity_due_date_idx').on(table.dueDate),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// pdev_readiness_snapshots — point-in-time workstream readiness rollups
// ─────────────────────────────────────────────────────────────────────────────

export const pdevReadinessSnapshots = pgTable(
  'pdev_readiness_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    programId: uuid('program_id')
      .notNull()
      .references(() => regulatoryPrograms.id, { onDelete: 'cascade' }),

    /** 'cmc' | 'nonclinical' | 'clinical' | 'regulatory' | 'overall'. */
    workstream: varchar('workstream', { length: 16 }).notNull(),

    /** Readiness score, 0.00 – 100.00. */
    readinessScore: decimal('readiness_score', { precision: 5, scale: 2 }).notNull(),

    /** Counts driving the score. */
    totalActivities: integer('total_activities').notNull(),
    completedActivities: integer('completed_activities').notNull(),
    inFlightActivities: integer('in_flight_activities').notNull(),
    blockedActivities: integer('blocked_activities').notNull(),

    /** Activities that block IND assembly readiness specifically. */
    blockingActivities: integer('blocking_activities').notNull(),
    blockingResolved: integer('blocking_resolved').notNull(),

    /** Free-form rollup metadata (broken dependencies, top blockers,
     *  next recommended action). */
    findings: jsonb('findings').$type<PdevReadinessFinding[]>().default([]),

    /** Actor that triggered the snapshot. */
    snapshotByUserId: integer('snapshot_by_user_id'),
    /** Trigger source — 'manual', 'state_change', 'scheduled'. */
    trigger: varchar('trigger', { length: 24 }).notNull().default('manual'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => ({
    programWorkstreamIdx: index('pdev_snapshot_program_workstream_idx').on(
      table.programId,
      table.workstream
    ),
    createdAtIdx: index('pdev_snapshot_created_at_idx').on(table.createdAt),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PdevReadinessFinding {
  kind: 'blocker' | 'missing_evidence' | 'contradiction' | 'overdue_review' | 'next_action';
  activityKey?: string;
  message: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  // Optional links to the underlying record id (contradiction id, etc.).
  ref?: string;
}

export type PdevProgramActivity = InferSelectModel<typeof pdevProgramActivities>;
export type PdevReadinessSnapshot = InferSelectModel<typeof pdevReadinessSnapshots>;

// ─────────────────────────────────────────────────────────────────────────────
// Insert schemas (drizzle-zod)
// ─────────────────────────────────────────────────────────────────────────────

export const insertPdevProgramActivitySchema = createInsertSchema(pdevProgramActivities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  stateChangedAt: true,
});

export const insertPdevReadinessSnapshotSchema = createInsertSchema(pdevReadinessSnapshots).omit({
  id: true,
  createdAt: true,
});

export type InsertPdevProgramActivity = z.infer<typeof insertPdevProgramActivitySchema>;
export type InsertPdevReadinessSnapshot = z.infer<typeof insertPdevReadinessSnapshotSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────────────────────

export const pdevProgramActivitiesRelations = relations(pdevProgramActivities, ({ one }) => ({
  program: one(regulatoryPrograms, {
    fields: [pdevProgramActivities.programId],
    references: [regulatoryPrograms.id],
  }),
}));

export const pdevReadinessSnapshotsRelations = relations(pdevReadinessSnapshots, ({ one }) => ({
  program: one(regulatoryPrograms, {
    fields: [pdevReadinessSnapshots.programId],
    references: [regulatoryPrograms.id],
  }),
}));
