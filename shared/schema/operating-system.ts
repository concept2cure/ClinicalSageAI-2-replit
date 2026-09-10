/**
 * Operating-System Foundation Schema
 *
 * Structured Assumptions, Auditable Decisions, Review Boundaries,
 * Contradiction-Readiness Linkage, and Regulator/Body Overlay Compatibility.
 *
 * This is a first-class operating layer beneath Concept2Cure intelligence.
 * It makes assumptions structured, decisions auditable, boundaries explicit,
 * and future contradiction/overlay engines possible.
 *
 * @module shared/schema/operating-system
 */

import { InferSelectModel, sql } from 'drizzle-orm';
import {
  integer,
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  uuid,
  json,
  real,
  index,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { organizations, users, projects, concept2cureArtifacts, concept2cureArtifactVersions } from '../schema';

// ═══════════════════════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// CANONICAL ENUMS — used by the governance boundary tables below
// ═══════════════════════════════════════════════════════════════════════════════
// These two survived the 2026-09-10 retirement described below because the
// GOVERNANCE BOUNDARY tables reference them. Note the deployed DDL
// (db/migrations/20260725_governance_boundary_tables.sql) stores these columns
// as TEXT with CHECK constraints, not as Postgres ENUM types; this module is not
// in the drizzle-kit push surface, so these pgEnum declarations are typed access
// only and create nothing. ADR-0007 point 5 records pgEnum-typing the TEXT CHECK
// columns as future work on the canonical shape.

export const governanceBoundaryEnum = pgEnum('governance_boundary', [
  'advisory',
  'governed_draft',
  'approved',
  'locked',
  'submission_ready',
]);

export const domainTrackEnum = pgEnum('domain_track', [
  'biotech',
  'device',
  'diagnostics',
  'combination',
  'biosimilar',
]);

// ═══════════════════════════════════════════════════════════════════════════════
// RETIRED 2026-09-10 (WO-1, ADR-0006 legacy retirement)
// ═══════════════════════════════════════════════════════════════════════════════
// The orphaned assumption/decision/contradiction definitions that stood here —
// assumptionRecords, assumptionHistory, decisionRecords, contradictionLinks and
// their ten enums — have been DELETED.
//
// They described a table shape that existed in no deployed environment. Their
// only DDL was migrations/0010_operating_system_foundation.sql, which had no
// execution path; that file is now
// tests/schema-contract/fixtures/drizzle-shaped-operating-system.sql, kept as a
// fixture solely so operating-system-collision.contract.test.ts can still apply
// the losing shape and demonstrate the order-dependence defect.
//
// The banner they carried said they were "retained solely so their removal is
// its own reviewed change under the ADR-0006 legacy retirement". This is that
// retirement: removing the file without removing these would leave the models
// declaring 28 and 27 columns that no migration creates, which is what
// ci:model-migration-agreement reported when the file was archived alone.
//
// The DEPLOYED shape is db/migrations/20260323_assumption_decision_contradiction.sql,
// served by the raw-SQL services (assumption-registry-service.ts,
// decision-record-service.ts) whose vocabularies are CANONICAL per the revised
// ADR-0007. Typed gate access goes through
// shared/constants/operating-system-vocab.ts.
//
// Zero importers at deletion, re-verified 2026-09-10: the only module importing
// from this file is server/services/governance-boundary-service.ts, and it takes
// governanceBoundaryRules / governanceBoundaryTransitions only.
//
// ADR-0007 point 6 records the one residual: contradiction_links, written by
// assumption-registry-service.ts:173,205 via raw SQL, had DDL only in the retired
// file and throws in production today. Porting or retiring that sub-feature is a
// scoped follow-up, unchanged by this deletion.
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// 3. GOVERNANCE BOUNDARY RULES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Explicit rules governing when content transitions between boundaries:
 * advisory → governed_draft → approved → locked → submission_ready.
 *
 * These rules are project-scoped and enforceable — not just metadata.
 */
// ═══════════════════════════════════════════════════════════════════════════════
// ✅ CANONICAL FROM HERE DOWN — governance boundary tables
// DDL: db/migrations/20260725_governance_boundary_tables.sql (C-8 fix).
// Live consumer: server/services/governance-boundary-service.ts.
// ═══════════════════════════════════════════════════════════════════════════════

export const governanceBoundaryRules = pgTable(
  'governance_boundary_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    projectId: integer('project_id')
      .references(() => projects.id, { onDelete: 'cascade' }),

    // Rule definition
    ruleName: text('rule_name').notNull(),
    ruleDescription: text('rule_description'),

    // Transition being governed
    fromBoundary: governanceBoundaryEnum('from_boundary').notNull(),
    toBoundary: governanceBoundaryEnum('to_boundary').notNull(),

    // Conditions
    requiresReview: boolean('requires_review').default(false).notNull(),
    requiresApproval: boolean('requires_approval').default(false).notNull(),
    requiresAllAssumptionsApproved: boolean('requires_all_assumptions_approved').default(false).notNull(),
    requiresAllDecisionsResolved: boolean('requires_all_decisions_resolved').default(false).notNull(),
    minimumConfidence: text('minimum_confidence'), // 'strong', 'moderate', etc.
    requiredRoles: json('required_roles').$type<string[]>().default([]),

    // Scope
    artifactTypes: json('artifact_types').$type<string[]>().default([]), // which artifact types
    domainTrack: domainTrackEnum('domain_track'),
    regulatorBody: text('regulator_body'),

    // State
    isActive: boolean('is_active').default(true).notNull(),

    // Audit
    createdById: integer('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('governance_rule_org_idx').on(table.organizationId),
    projectIdx: index('governance_rule_project_idx').on(table.projectId),
    transitionIdx: index('governance_rule_transition_idx').on(table.fromBoundary, table.toBoundary),
  })
);

/**
 * Governance boundary transitions log — tracks every boundary change.
 * Append-only for regulatory auditability.
 */
export const governanceBoundaryTransitions = pgTable(
  'governance_boundary_transitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),

    // What transitioned
    artifactId: integer('artifact_id')
      .references(() => concept2cureArtifacts.id),
    decisionId: uuid('decision_id'),
    assumptionId: uuid('assumption_id'),

    // Transition
    fromBoundary: governanceBoundaryEnum('from_boundary').notNull(),
    toBoundary: governanceBoundaryEnum('to_boundary').notNull(),
    ruleId: uuid('rule_id'), // which governance rule was evaluated

    // Outcome
    transitionAllowed: boolean('transition_allowed').notNull(),
    blockedReasons: json('blocked_reasons').$type<string[]>().default([]),

    // Actor
    actorId: integer('actor_id').references(() => users.id),
    actorRole: text('actor_role'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('governance_transition_org_idx').on(table.organizationId),
    projectIdx: index('governance_transition_project_idx').on(table.projectId),
    artifactIdx: index('governance_transition_artifact_idx').on(table.artifactId),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// 4. CONTRADICTION-READINESS LINKAGE
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & INSERT SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

// Governance types
export type GovernanceBoundaryRule = InferSelectModel<typeof governanceBoundaryRules>;
export type GovernanceBoundaryTransition = InferSelectModel<typeof governanceBoundaryTransitions>;
export const insertGovernanceBoundaryRuleSchema = createInsertSchema(governanceBoundaryRules);
export const insertGovernanceBoundaryTransitionSchema = createInsertSchema(governanceBoundaryTransitions);
