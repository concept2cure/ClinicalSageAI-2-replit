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

export const assumptionCategoryEnum = pgEnum('assumption_category', [
  'effect_size',
  'variance',
  'event_rate',
  'attrition',
  'endpoint',
  'analysis_population',
  'comparator',
  'scenario',
  'regulator_overlay',
  'missing_data',
  'multiplicity',
  'other',
]);

export const assumptionValueTypeEnum = pgEnum('assumption_value_type', [
  'numeric',
  'text',
  'enum',
  'range',
  'json',
]);

export const assumptionSourceTypeEnum = pgEnum('assumption_source_type', [
  'artifact',
  'manual',
  'ana_generated',
  'imported',
  'historical_comparator',
]);

export const assumptionConfidenceEnum = pgEnum('assumption_confidence', [
  'strong',
  'moderate',
  'provisional',
  'uncertain',
]);

export const assumptionStatusEnum = pgEnum('assumption_status', [
  'draft',
  'review',
  'approved',
  'superseded',
  'rejected',
]);

export const decisionContextTypeEnum = pgEnum('decision_context_type', [
  'regulatory_analysis',
  'biostatistics_analysis',
  'artifact_review',
  'scenario_comparison',
  'risk_assessment',
  'document_generation',
  'submission_readiness',
  'other',
]);

export const decisionActionStateEnum = pgEnum('decision_action_state', [
  'recommended_only',
  'prepared',
  'executed',
  'rejected',
  'superseded',
]);

export const decisionApprovalStateEnum = pgEnum('decision_approval_state', [
  'not_required',
  'pending_review',
  'approved',
  'rejected',
]);

export const decisionEscalationStateEnum = pgEnum('decision_escalation_state', [
  'none',
  'recommended',
  'opened',
  'resolved',
]);

export const decisionConfidenceEnum = pgEnum('decision_confidence', [
  'strong',
  'moderate',
  'provisional',
  'uncertain',
]);

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
// 1. ASSUMPTION REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Structured, project-bound, reusable, reviewable, version-aware assumptions.
 *
 * Every critical assumption (effect size, dropout rate, event rate, etc.)
 * becomes a first-class operating object — queryable, linkable, auditable.
 */
export const assumptionRecords = pgTable(
  'assumption_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),

    // Classification
    category: assumptionCategoryEnum('category').notNull(),
    name: text('name').notNull(),
    description: text('description'),

    // Value
    valueType: assumptionValueTypeEnum('value_type').notNull().default('text'),
    numericValue: real('numeric_value'),
    textValue: text('text_value'),
    jsonValue: json('json_value').$type<Record<string, unknown>>(),
    unit: text('unit'), // e.g., '%', 'events/year', 'mmHg'

    // Rationale
    rationale: text('rationale'),

    // Source attribution
    sourceType: assumptionSourceTypeEnum('source_type').default('manual'),
    sourceArtifactId: integer('source_artifact_id')
      .references(() => concept2cureArtifacts.id),
    sourceArtifactVersionId: integer('source_artifact_version_id')
      .references(() => concept2cureArtifactVersions.id),
    sourceRunId: uuid('source_run_id'), // workflow run that produced this
    sourceDescription: text('source_description'), // human-readable provenance

    // Domain & regulatory context
    domainTrack: domainTrackEnum('domain_track'),
    regulatorBody: text('regulator_body'), // FDA, EMA, PMDA, etc.
    jurisdiction: text('jurisdiction'), // US, EU, JP, etc.
    regulatoryReference: text('regulatory_reference'), // ICH E9, FDA guidance, etc.

    // Confidence & lifecycle
    confidence: assumptionConfidenceEnum('confidence').default('provisional'),
    status: assumptionStatusEnum('status').default('draft').notNull(),

    // Version & supersession
    version: integer('version').default(1).notNull(),
    supersededById: uuid('superseded_by_id'), // self-referencing for version chain
    supersessionReason: text('supersession_reason'),

    // Contradiction-readiness linkage
    linkedArtifactIds: json('linked_artifact_ids').$type<number[]>().default([]),
    linkedArtifactVersionIds: json('linked_artifact_version_ids').$type<number[]>().default([]),
    linkedSectionCodes: json('linked_section_codes').$type<string[]>().default([]),
    linkedDecisionIds: json('linked_decision_ids').$type<string[]>().default([]),

    // Review/approval
    reviewedById: integer('reviewed_by_id').references(() => users.id),
    reviewedAt: timestamp('reviewed_at'),
    approvedById: integer('approved_by_id').references(() => users.id),
    approvedAt: timestamp('approved_at'),
    rejectedById: integer('rejected_by_id').references(() => users.id),
    rejectedAt: timestamp('rejected_at'),
    rejectionReason: text('rejection_reason'),

    // Audit
    createdById: integer('created_by_id').references(() => users.id),
    updatedById: integer('updated_by_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index('assumption_project_idx').on(table.projectId),
    orgIdx: index('assumption_org_idx').on(table.organizationId),
    categoryIdx: index('assumption_category_idx').on(table.category),
    statusIdx: index('assumption_status_idx').on(table.status),
    confidenceIdx: index('assumption_confidence_idx').on(table.confidence),
    regulatorBodyIdx: index('assumption_regulator_body_idx').on(table.regulatorBody),
    sourceArtifactIdx: index('assumption_source_artifact_idx').on(table.sourceArtifactId),
    supersededByIdx: index('assumption_superseded_by_idx').on(table.supersededById),
  })
);

/**
 * Assumption version history — append-only audit trail.
 * Created whenever an assumption is updated or superseded.
 */
export const assumptionHistory = pgTable(
  'assumption_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assumptionId: uuid('assumption_id').notNull(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Snapshot of the assumption at this point in time
    version: integer('version').notNull(),
    category: text('category').notNull(),
    name: text('name').notNull(),
    valueType: text('value_type').notNull(),
    numericValue: real('numeric_value'),
    textValue: text('text_value'),
    jsonValue: json('json_value').$type<Record<string, unknown>>(),
    unit: text('unit'),
    rationale: text('rationale'),
    confidence: text('confidence'),
    status: text('status').notNull(),
    regulatorBody: text('regulator_body'),
    jurisdiction: text('jurisdiction'),

    // Change metadata
    changeAction: text('change_action').notNull(), // 'created', 'updated', 'superseded', 'approved', 'rejected'
    changeReason: text('change_reason'),
    changedById: integer('changed_by_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    assumptionIdx: index('assumption_history_assumption_idx').on(table.assumptionId),
    orgIdx: index('assumption_history_org_idx').on(table.organizationId),
  })
);


// ═══════════════════════════════════════════════════════════════════════════════
// 2. DECISION RECORDS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Formal decision records that trace:
 * analysis → judgment → recommendation → confidence → action → approval.
 *
 * Every material decision (accept assumption, generate artifact, escalate risk)
 * becomes a queryable, auditable record tied to projects and artifacts.
 */
export const decisionRecords = pgTable(
  'decision_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),

    // Context
    contextType: decisionContextTypeEnum('context_type').notNull(),
    contextDescription: text('context_description'), // human-readable: "Sample size rationale for Phase 3"

    // Related objects
    relatedArtifactId: integer('related_artifact_id')
      .references(() => concept2cureArtifacts.id),
    relatedArtifactVersionId: integer('related_artifact_version_id')
      .references(() => concept2cureArtifactVersions.id),
    relatedRunId: uuid('related_run_id'), // workflow run
    relatedAssumptionIds: json('related_assumption_ids').$type<string[]>().default([]),

    // Recommendation
    recommendationType: text('recommendation_type'), // e.g., 'sample_size_increase', 'endpoint_change', 'risk_mitigation'
    recommendationSummary: text('recommendation_summary').notNull(),
    recommendationDetail: text('recommendation_detail'), // full reasoning

    // Confidence
    confidence: decisionConfidenceEnum('confidence').notNull().default('provisional'),
    evidenceSources: json('evidence_sources').$type<string[]>().default([]),

    // Action state
    actionState: decisionActionStateEnum('action_state').notNull().default('recommended_only'),
    actionDescription: text('action_description'), // what action was actually taken

    // Approval state
    approvalState: decisionApprovalStateEnum('approval_state').default('not_required'),

    // Escalation
    escalationState: decisionEscalationStateEnum('escalation_state').default('none'),
    escalationReason: text('escalation_reason'),
    escalationResolvedAt: timestamp('escalation_resolved_at'),

    // Executed artifact linkage
    executedArtifactId: integer('executed_artifact_id')
      .references(() => concept2cureArtifacts.id),
    executedArtifactVersionId: integer('executed_artifact_version_id')
      .references(() => concept2cureArtifactVersions.id),

    // Domain & regulatory context (body-aware)
    domainTrack: domainTrackEnum('domain_track'),
    regulatorBody: text('regulator_body'),
    jurisdiction: text('jurisdiction'),
    regulatoryReference: text('regulatory_reference'),

    // Governance boundary
    governanceBoundary: governanceBoundaryEnum('governance_boundary').default('advisory'),

    // Supersession
    supersededById: uuid('superseded_by_id'),
    supersessionReason: text('supersession_reason'),

    // Contradiction-readiness linkage
    linkedSectionCodes: json('linked_section_codes').$type<string[]>().default([]),
    linkedAssumptionIds: json('linked_assumption_ids').$type<string[]>().default([]),

    // Notes / provenance
    notes: text('notes'),
    provenance: json('provenance').$type<Record<string, unknown>>(),

    // Approval tracking
    approvedById: integer('approved_by_id').references(() => users.id),
    approvedAt: timestamp('approved_at'),
    rejectedById: integer('rejected_by_id').references(() => users.id),
    rejectedAt: timestamp('rejected_at'),
    rejectionReason: text('rejection_reason'),

    // Audit
    createdById: integer('created_by_id').references(() => users.id),
    updatedById: integer('updated_by_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index('decision_project_idx').on(table.projectId),
    orgIdx: index('decision_org_idx').on(table.organizationId),
    contextTypeIdx: index('decision_context_type_idx').on(table.contextType),
    actionStateIdx: index('decision_action_state_idx').on(table.actionState),
    approvalStateIdx: index('decision_approval_state_idx').on(table.approvalState),
    confidenceIdx: index('decision_confidence_idx').on(table.confidence),
    regulatorBodyIdx: index('decision_regulator_body_idx').on(table.regulatorBody),
    relatedArtifactIdx: index('decision_related_artifact_idx').on(table.relatedArtifactId),
    executedArtifactIdx: index('decision_executed_artifact_idx').on(table.executedArtifactId),
    governanceBoundaryIdx: index('decision_governance_boundary_idx').on(table.governanceBoundary),
    supersededByIdx: index('decision_superseded_by_idx').on(table.supersededById),
  })
);


// ═══════════════════════════════════════════════════════════════════════════════
// 3. GOVERNANCE BOUNDARY RULES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Explicit rules governing when content transitions between boundaries:
 * advisory → governed_draft → approved → locked → submission_ready.
 *
 * These rules are project-scoped and enforceable — not just metadata.
 */
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

/**
 * Cross-object comparison links for future contradiction detection.
 *
 * Links assumptions/decisions/artifacts so a future contradiction engine
 * can compare protocol vs SAP, SAP vs CSR, summary vs body, etc.
 */
export const contradictionLinks = pgTable(
  'contradiction_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),

    // Link endpoints (at least one pair must be populated)
    sourceType: text('source_type').notNull(), // 'assumption', 'decision', 'artifact', 'artifact_section'
    sourceId: text('source_id').notNull(), // UUID or integer as string
    sourceLabel: text('source_label'), // human-readable: "Protocol dropout assumption"

    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    targetLabel: text('target_label'),

    // Comparison metadata
    comparisonType: text('comparison_type').notNull(), // 'protocol_vs_sap', 'sap_vs_csr', 'assumption_vs_result', etc.
    fieldPath: text('field_path'), // specific field being compared, e.g., 'dropout_rate'

    // Domain & body context
    domainTrack: domainTrackEnum('domain_track'),
    regulatorBody: text('regulator_body'),
    sectionCodes: json('section_codes').$type<string[]>().default([]),

    // Status
    isActive: boolean('is_active').default(true).notNull(),
    lastCheckedAt: timestamp('last_checked_at'),
    inconsistencyDetected: boolean('inconsistency_detected').default(false),
    inconsistencyDetail: text('inconsistency_detail'),

    // Audit
    createdById: integer('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('contradiction_link_org_idx').on(table.organizationId),
    projectIdx: index('contradiction_link_project_idx').on(table.projectId),
    sourceIdx: index('contradiction_link_source_idx').on(table.sourceType, table.sourceId),
    targetIdx: index('contradiction_link_target_idx').on(table.targetType, table.targetId),
    comparisonTypeIdx: index('contradiction_link_comparison_idx').on(table.comparisonType),
  })
);


// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & INSERT SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

// Assumption types
export type AssumptionRecord = InferSelectModel<typeof assumptionRecords>;
export type AssumptionHistoryRecord = InferSelectModel<typeof assumptionHistory>;
export const insertAssumptionSchema = createInsertSchema(assumptionRecords);
export const insertAssumptionHistorySchema = createInsertSchema(assumptionHistory);

// Decision types
export type DecisionRecord = InferSelectModel<typeof decisionRecords>;
export const insertDecisionSchema = createInsertSchema(decisionRecords);

// Governance types
export type GovernanceBoundaryRule = InferSelectModel<typeof governanceBoundaryRules>;
export type GovernanceBoundaryTransition = InferSelectModel<typeof governanceBoundaryTransitions>;
export const insertGovernanceBoundaryRuleSchema = createInsertSchema(governanceBoundaryRules);
export const insertGovernanceBoundaryTransitionSchema = createInsertSchema(governanceBoundaryTransitions);

// Contradiction types
export type ContradictionLink = InferSelectModel<typeof contradictionLinks>;
export const insertContradictionLinkSchema = createInsertSchema(contradictionLinks);
