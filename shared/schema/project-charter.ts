/**
 * Project Charter Schema
 *
 * Regulatory project charter with pathway-specific intelligence + commitment
 * tracking with a charter-scoped append-only audit trail (21 CFR 11.10(e)).
 *
 * Tables:
 * - projectCharters:      Charter document per project (pathway-specific intelligence)
 * - charterSections:      Hierarchical content blocks (rebuilt 2026-06-29, Task #20)
 * - timelinePhases:       Phase-based schedule (rebuilt 2026-06-29, Task #20)
 * - projectCommitments:   Regulatory obligations (rebuilt 2026-06-29, Task #20)
 * - charterAuditEvents:   Per-entity append-only audit trail for charter-scoped
 *                         writes, coupled to entity INSERTs in the same db.tx
 *                         (new 2026-06-29, Task #20; never previously migrated)
 *
 * History
 * -------
 *  - Created by migrations/0012_project_charter_timeline.sql (2026-03-27):
 *    project_charters, charter_sections, timeline_phases, project_commitments.
 *  - Three tables dropped by migrations/20260611_drop_charter_staging_tables.sql
 *    (decision register #727 item 10) on the basis that they were
 *    migrated-but-never-queried.
 *  - Rebuilt by migrations/20260629_charter_tables_rebuild.sql (Task #20,
 *    PATH_TO_GA §C.10) to support the commitments CRUD surface in
 *    server/routes/charters.ts. charter_audit_events is net-new and lets the
 *    commitment INSERT couple transactionally with its audit row — closing the
 *    AUDIT_BEST_EFFORT_DOCUMENTED_BUT_RISKY finding for the charter scope (the
 *    canonical audit_logs surface remains best-effort because auditService
 *    opens its own pool connection; we cannot enlist it in a caller-side tx).
 *
 * NOTE: regulatoryMeetings was named in earlier headers but no migration ever
 * shipped — it is intentionally NOT rebuilt here. If/when it is needed, it
 * should land in a separate, scoped change.
 *
 * MULTI-TENANT: All tables include organizationId (or are joined via charterId
 * which carries organizationId on projectCharters) for RLS isolation.
 * All timestamps use UTC (withTimezone: true) per 21 CFR 11.70(a).
 *
 * @module shared/schema/project-charter
 */

import { InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  json,
  index,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT CHARTERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Project Charter — the structured regulatory strategy document for a project.
 *
 * Each project has at most one charter. The charter defines the submission type,
 * regulatory region, product information, strategy, and quality targets.
 * It is the foundation for timeline generation and commitment tracking.
 *
 * Pathway-specific fields (JSON) carry structured intelligence per submission type:
 * - IND: pre-IND meeting, 30-day clock, clinical hold risk, serial numbers
 * - NDA: NDA type (505b1/b2/j), PDUFA date, rolling submission, REMS, pediatric
 * - BLA: biosimilar vs novel, comparability protocol, cell line management
 * - 510(k): predicate strategy, SE argument, eSTAR compliance, device panel
 * - PMA: IDE requirements, clinical trial design, panel track vs standard
 * - De Novo: risk-based classification, special controls, predicate search
 */
export const projectCharters = pgTable(
  'project_charters',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull(),
    projectId: integer('project_id').notNull(),

    // ── Submission Classification ──────────────────────────────────────────
    submissionType: text('submission_type').notNull(), // IND, NDA, BLA, 510K, PMA, MAA, DE_NOVO, EUA, IVDR
    regulatoryRegion: text('regulatory_region').notNull(), // FDA, EMA, PMDA, MHRA, HealthCanada, TGA, NMPA
    fdaDivision: text('fda_division'), // CDER, CBER, CDRH, CFSAN
    fdaBranch: text('fda_branch'), // e.g. "Gastroenterology and Inborn Errors Products"
    productName: text('product_name').notNull(),
    productType: text('product_type'), // drug, biologic, device, combination, ivd
    indication: text('indication'),
    targetPopulation: text('target_population'),
    therapeuticArea: text('therapeutic_area'), // oncology, rare_disease, neurology, cardiology, etc.

    // ── Development Stage ──────────────────────────────────────────────────
    developmentStage: text('development_stage'), // discovery, preclinical, ind_enabling, phase_1, phase_2, phase_3, nda_bla, post_market

    // ── Device-Specific Fields ─────────────────────────────────────────────
    predicateDevices: json('predicate_devices').$type<PredicateDeviceRef[]>(),
    deviceClass: text('device_class'), // I, II, III
    productCode: text('product_code'),
    secondaryProductCodes: json('secondary_product_codes').$type<string[]>(),

    // ── Pathway-Specific Intelligence (JSON per submission type) ──────────
    // IND-specific
    indConfig: json('ind_config').$type<INDConfig | null>(),
    // NDA-specific
    ndaConfig: json('nda_config').$type<NDAConfig | null>(),
    // BLA-specific
    blaConfig: json('bla_config').$type<BLAConfig | null>(),
    // 510(k)-specific
    k510Config: json('k510_config').$type<K510Config | null>(),
    // PMA-specific
    pmaConfig: json('pma_config').$type<PMAConfig | null>(),
    // De Novo-specific
    deNovoConfig: json('de_novo_config').$type<DeNovoConfig | null>(),

    // ── Strategy ───────────────────────────────────────────────────────────
    regulatoryStrategy: text('regulatory_strategy'),
    criticalSuccessFactors: json('critical_success_factors').$type<string[]>(),
    riskMitigationPlan: text('risk_mitigation_plan'),
    communicationPlan: text('communication_plan'),
    qualityTargets: json('quality_targets').$type<Record<string, number>>(),

    // ── Team Assignments ───────────────────────────────────────────────────
    teamAssignments: json('team_assignments').$type<TeamAssignment[]>(),

    // ── Dates ──────────────────────────────────────────────────────────────
    targetSubmissionDate: timestamp('target_submission_date', { withTimezone: true }),
    targetApprovalDate: timestamp('target_approval_date', { withTimezone: true }),

    // ── Custom Instructions (injected into AnA context) ────────────────────
    customInstructions: text('custom_instructions'),

    // ── Content Integrity (21 CFR 11.70(b)) ───────────────────────────────
    contentHash: text('content_hash'), // SHA-256 of charter content
    version: integer('version').default(1).notNull(),

    // ── Approval Workflow (21 CFR 11.10) ──────────────────────────────────
    approvalStatus: text('approval_status').default('draft'), // draft, pending_review, approved, locked
    reviewRequestedBy: integer('review_requested_by'),
    reviewRequestedAt: timestamp('review_requested_at', { withTimezone: true }),
    approvedBy: integer('approved_by'),
    approvedByRole: text('approved_by_role'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvalComment: text('approval_comment'),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: integer('locked_by'),
    lockedReason: text('locked_reason'), // submitted_to_fda, regulatory_milestone, change_control

    // ── Audit ──────────────────────────────────────────────────────────────
    createdBy: integer('created_by'),
    updatedBy: integer('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('proj_charter_org_idx').on(table.organizationId),
    projectIdx: index('proj_charter_project_idx').on(table.projectId),
    typeIdx: index('proj_charter_type_idx').on(table.submissionType),
    statusIdx: index('proj_charter_status_idx').on(table.approvalStatus),
    stageIdx: index('proj_charter_stage_idx').on(table.developmentStage),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// CHARTER SECTIONS — rebuilt 2026-06-29 (Task #20)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Charter Sections — hierarchical content blocks with version control.
 *
 * Each section has a key (e.g., 'objectives', 'regulatory_strategy',
 * 'cmc_readiness'), content, status, and version tracking. Content hashing
 * (SHA-256) provides immutability proof per 21 CFR Part 11.70(b).
 *
 * Status transitions are logged in statusTransitionLog for full audit trail.
 *
 * Shape recovered verbatim from pre-drop git HEAD (commit 3341dd1f) — the
 * column set, index set, and FK cascade behaviour match 1:1 with what
 * migration 0012 originally created. The rebuild migration 20260629 mirrors
 * this Drizzle definition.
 */
export const charterSections = pgTable(
  'charter_sections',
  {
    id: serial('id').primaryKey(),
    charterId: integer('charter_id')
      .notNull()
      .references(() => projectCharters.id, { onDelete: 'cascade' }),
    parentSectionId: integer('parent_section_id'),
    sectionKey: text('section_key').notNull(),
    sectionLabel: text('section_label').notNull(),
    content: text('content'),

    // Version control (21 CFR 11.10(b))
    version: integer('version').default(1).notNull(),
    contentHash: text('content_hash'), // SHA-256 of content
    previousVersionHash: text('previous_version_hash'), // chain of evidence

    // Status machine
    status: text('status').default('empty'), // empty, draft, review, approved, locked
    statusTransitionLog: json('status_transition_log').$type<StatusTransition[]>().default([]),

    // Approval (21 CFR 11.100)
    approvedBy: integer('approved_by'),
    approvedByRole: text('approved_by_role'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),

    // Lock state
    readOnly: boolean('read_only').default(false).notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),

    // Ownership
    sortOrder: integer('sort_order').default(0),
    ownerRole: text('owner_role'),

    // Audit
    createdBy: integer('created_by'),
    updatedBy: integer('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    charterIdx: index('charter_sections_charter_idx').on(table.charterId),
    parentIdx: index('charter_sections_parent_idx').on(table.parentSectionId),
    statusIdx: index('charter_sections_status_idx').on(table.status),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// TIMELINE PHASES — rebuilt 2026-06-29 (Task #20)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Timeline Phases — phase-based project schedule with cross-functional
 * dependencies.
 *
 * Each phase represents a major work period (e.g., "CMC Development",
 * "Clinical Protocol", "Submission & Review"). Phases have start/end dates,
 * progress tracking, deliverables, and predecessor dependencies.
 *
 * Cross-functional dependencies model real biotech parallelism: CMC,
 * nonclinical, clinical, and regulatory tracks run in parallel with blocking
 * gates between them.
 *
 * Shape recovered verbatim from pre-drop git HEAD (commit 3341dd1f).
 */
export const timelinePhases = pgTable(
  'timeline_phases',
  {
    id: serial('id').primaryKey(),
    charterId: integer('charter_id')
      .notNull()
      .references(() => projectCharters.id, { onDelete: 'cascade' }),
    phaseName: text('phase_name').notNull(),
    phaseNumber: integer('phase_number').notNull(),
    description: text('description'),

    // ── Functional Track ───────────────────────────────────────────────────
    functionalTeam: text('functional_team'), // cmc, nonclinical, clinical, regulatory, medical_writing, biostatistics, qa
    developmentStage: text('development_stage'),

    // ── Dates ──────────────────────────────────────────────────────────────
    startDate: timestamp('start_date', { withTimezone: true }),
    targetEndDate: timestamp('target_end_date', { withTimezone: true }),
    actualEndDate: timestamp('actual_end_date', { withTimezone: true }),

    // ── Progress ───────────────────────────────────────────────────────────
    status: text('status').default('not_started'), // not_started, in_progress, completed, at_risk, blocked
    progress: integer('progress').default(0), // 0-100

    // ── Dependencies (cross-functional) ────────────────────────────────────
    predecessors: json('predecessors').$type<number[]>(),
    blockedBy: json('blocked_by').$type<PhaseBlocker[]>(),
    isCriticalPath: boolean('is_critical_path').default(false),
    slackDays: integer('slack_days'),

    // ── Phase Gate (readiness requirements to enter this phase) ────────────
    gateRequirements: json('gate_requirements').$type<GateRequirement[]>(),

    // ── Deliverables ───────────────────────────────────────────────────────
    deliverables: json('deliverables').$type<PhaseDeliverable[]>(),
    ownerRole: text('owner_role'),

    // ── Duration estimates ─────────────────────────────────────────────────
    estimatedWeeks: integer('estimated_weeks'),
    actualWeeks: integer('actual_weeks'),
    benchmarkMinWeeks: integer('benchmark_min_weeks'),
    benchmarkMaxWeeks: integer('benchmark_max_weeks'),

    // ── Rendering ──────────────────────────────────────────────────────────
    color: text('color'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    charterIdx: index('timeline_phases_charter_idx').on(table.charterId),
    statusIdx: index('timeline_phases_status_idx').on(table.status),
    teamIdx: index('timeline_phases_team_idx').on(table.functionalTeam),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT COMMITMENTS — rebuilt 2026-06-29 (Task #20)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Project Commitments — regulatory obligations and deliverables to track.
 *
 * Commitments are created from:
 * - Charter generation (auto-generated from submission-type template)
 * - Document extraction (AI-powered obligation mining from uploads)
 * - Manual entry (user-defined commitments) — POST /api/charters/:id/commitments
 * - Proactive engine (readiness gaps → auto-generated commitments)
 * - Agency correspondence (FDA letters, meeting minutes → extracted obligations)
 *
 * 20+ regulatory-specific categories. Full 21 CFR Part 11 electronic signature
 * support with password challenge, intent, and audit trail.
 *
 * Shape recovered verbatim from pre-drop git HEAD (commit 3341dd1f).
 */
export const projectCommitments = pgTable(
  'project_commitments',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull(),
    projectId: integer('project_id').notNull(),
    charterId: integer('charter_id').references(() => projectCharters.id),
    phaseId: integer('phase_id').references(() => timelinePhases.id),

    // ── Commitment Details ─────────────────────────────────────────────────
    title: text('title').notNull(),
    description: text('description'),
    // 20+ regulatory-specific categories
    category: text('category').notNull(),
    // regulatory_submission, agency_engagement, agency_meeting,
    // regulatory_approval, clinical_hold_response, fda_deficiency_response,
    // document_delivery, quality_assurance, team_deliverable,
    // evidence_gathering, manufacturing_commitment, nonclinical_commitment,
    // clinical_commitment, data_integrity, ectd_assembly, safety_report,
    // pediatric_commitment, rems_commitment, post_market_commitment

    functionalTeam: text('functional_team'),

    // ── Source Tracking ────────────────────────────────────────────────────
    source: text('source').notNull(), // charter, extracted, manual, proactive, readiness_gap, agency_correspondence
    sourceDocumentId: integer('source_document_id'),
    extractionConfidence: real('extraction_confidence'),

    // ── Dependencies ───────────────────────────────────────────────────────
    blockedByCommitments: json('blocked_by_commitments').$type<number[]>(),
    isCriticalPath: boolean('is_critical_path').default(false),

    // ── Timeline ───────────────────────────────────────────────────────────
    dueDate: timestamp('due_date', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    // ── Status ─────────────────────────────────────────────────────────────
    status: text('status').default('pending'), // pending, in_progress, completed, overdue, at_risk, waived
    priority: text('priority').default('medium'), // critical, high, medium, low
    urgency: text('urgency'), // immediate, this_week, this_sprint, backlog

    // ── Assignment ─────────────────────────────────────────────────────────
    ownerUserId: integer('owner_user_id'),
    ownerRole: text('owner_role'),

    // ── Fulfillment (21 CFR 11.10(e)) ──────────────────────────────────────
    fulfillmentProof: text('fulfillment_proof'),
    fulfillmentArtifactId: integer('fulfillment_artifact_id'),
    fulfillmentArtifactHash: text('fulfillment_artifact_hash'), // SHA-256
    fulfillmentSubmittedBy: integer('fulfillment_submitted_by'),
    fulfillmentSubmittedAt: timestamp('fulfillment_submitted_at', { withTimezone: true }),
    fulfillmentApprovedBy: integer('fulfillment_approved_by'),
    fulfillmentApprovedAt: timestamp('fulfillment_approved_at', { withTimezone: true }),

    // ── Signature (21 CFR Part 11) ─────────────────────────────────────────
    requiresSignature: boolean('requires_signature').default(false),
    signedBy: integer('signed_by'),
    signedByUsername: text('signed_by_username'),
    signedByRole: text('signed_by_role'),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    signatureIntent: text('signature_intent'),
    signatureMeaning: text('signature_meaning'),
    passwordChallengeUsed: boolean('password_challenge_used'),

    // ── Waiver (if commitment waived) ──────────────────────────────────────
    waiverJustification: text('waiver_justification'),
    waiverApprovedBy: integer('waiver_approved_by'),
    waiverApprovedAt: timestamp('waiver_approved_at', { withTimezone: true }),

    // ── Extension (if due date extended) ───────────────────────────────────
    extensionReason: text('extension_reason'),
    extensionNewDueDate: timestamp('extension_new_due_date', { withTimezone: true }),
    extensionApprovedBy: integer('extension_approved_by'),

    // ── Audit ──────────────────────────────────────────────────────────────
    createdBy: integer('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('proj_commitments_org_idx').on(table.organizationId),
    projectIdx: index('proj_commitments_project_idx').on(table.projectId),
    charterIdx: index('proj_commitments_charter_idx').on(table.charterId),
    statusIdx: index('proj_commitments_status_idx').on(table.status),
    dueDateIdx: index('proj_commitments_due_idx').on(table.dueDate),
    categoryIdx: index('proj_commitments_category_idx').on(table.category),
    criticalIdx: index('proj_commitments_critical_idx').on(table.isCriticalPath),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// CHARTER AUDIT EVENTS — new 2026-06-29 (Task #20)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Charter Audit Events — append-only audit trail for charter-scoped writes
 * (21 CFR Part 11 §11.10(e)).
 *
 * Net-new in 2026-06-29 (never previously migrated). Purpose: let charter
 * entity INSERTs (commitments today, sections/phases next) couple a per-entity
 * audit row to the data write inside a single `db.transaction(...)` so a write
 * to the charter graph IS its audit row — failure of either rolls back both.
 *
 * Contrast with the canonical audit_logs surface (server/services/auditService):
 * auditService.logAction opens its OWN pool connection, so a caller cannot
 * enlist it in a Drizzle-managed transaction. That table is the cross-cutting
 * tamper-evident chain; this one is the charter-domain transactionally-coupled
 * companion. Both rows are written for each charter mutation — the cross-cutting
 * one provides SHA256-chain integrity across the whole system; the charter one
 * provides write-atomicity within the charter graph.
 *
 * Append-only-friendly constraints:
 *  - No UPDATE columns (no `updated_at`, no status fields). The row is written
 *    once and never modified.
 *  - `before_value` and `after_value` are JSON snapshots; field-level
 *    diffing is the caller's responsibility (the row carries enough to
 *    reproduce the change).
 *  - `event_hash` is a SHA-256 of (charterId | eventType | actorUserId |
 *    occurredAt | after_value) computed by the caller — provides per-row
 *    integrity even without a chain.
 *  - Trigger-level append-only enforcement (REVOKE UPDATE/DELETE on the
 *    rebuild migration) lives in the SQL — Drizzle has no construct for it.
 */
export const charterAuditEvents = pgTable(
  'charter_audit_events',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull(),
    charterId: integer('charter_id')
      .notNull()
      .references(() => projectCharters.id, { onDelete: 'restrict' }),

    // What entity inside the charter graph changed
    entityType: text('entity_type').notNull(), // 'charter' | 'section' | 'phase' | 'commitment'
    entityId: integer('entity_id').notNull(),

    // What happened
    eventType: text('event_type').notNull(), // 'created' | 'updated' | 'status_changed' | 'approved' | 'locked' | 'signed' | 'waived' | 'extended'

    // Who did it (21 CFR §11.10(e) attribution)
    actorUserId: integer('actor_user_id').notNull(),
    actorRole: text('actor_role'),

    // When (UTC per 11.70(a))
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),

    // Before / after snapshots (JSON; PHI-safe — caller responsible for redaction)
    beforeValue: json('before_value'),
    afterValue: json('after_value'),

    // Request context
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),

    // Optional reason / signature meaning for governed actions
    reason: text('reason'),
    signatureMeaning: text('signature_meaning'),

    // Per-row integrity digest (SHA-256). Computed by the caller from a
    // canonical projection so the row is verifiable in isolation.
    eventHash: text('event_hash').notNull(),
  },
  (table) => ({
    orgIdx: index('charter_audit_events_org_idx').on(table.organizationId),
    charterIdx: index('charter_audit_events_charter_idx').on(table.charterId),
    entityIdx: index('charter_audit_events_entity_idx').on(table.entityType, table.entityId),
    actorIdx: index('charter_audit_events_actor_idx').on(table.actorUserId),
    occurredAtIdx: index('charter_audit_events_occurred_at_idx').on(table.occurredAt),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// PATHWAY-SPECIFIC TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ── IND Configuration ─────────────────────────────────────────────────────────
export interface INDConfig {
  indSerialNumber?: string;
  preIndMeeting?: {
    meetingType: 'type_b' | 'type_c' | 'pre_ind_advice';
    plannedDate?: string;
    actualDate?: string;
    fdaFeedback?: string;
    keyQuestions?: string[];
    responseDeadline?: string;
  };
  thirtyDayClock?: {
    startDate?: string;
    dueDate?: string;
    status: 'not_started' | 'in_review' | 'cleared' | 'clinical_hold';
    clinicalHoldReason?: string;
    clinicalHoldStartDate?: string;
    clinicalHoldEndDate?: string;
  };
  clinicalHoldRisk?: {
    safetySignalsIdentified: boolean;
    previousHoldHistory: boolean;
    riskScore: number; // 1-10
    mitigation?: string;
  };
  annualReportDue?: string;
}

// ── NDA Configuration ─────────────────────────────────────────────────────────
export interface NDAConfig {
  ndaType: '505b1' | '505b2' | '505j_anda';
  referenceProductId?: string;
  rollingSubmission?: {
    enabled: boolean;
    moduleSubmissionDates?: Record<string, string>; // module → date
  };
  pdufa?: {
    reviewPriority: 'standard' | 'priority' | 'breakthrough' | 'accelerated';
    submissionDate?: string;
    pdufaDate?: string;
    expectedReviewMonths?: number;
  };
  pediatricPlan?: {
    required: boolean;
    planSubmitted?: string;
    fdaApproval?: string;
    deferralBasis?: string;
  };
  remsStrategy?: {
    required: boolean;
    elements?: {
      medicationGuide: boolean;
      restrictedDistribution: boolean;
      professionalTraining: boolean;
    };
  };
  advisoryCommittee?: {
    scheduledDate?: string;
    committee?: string;
    briefingDocumentDue?: string;
  };
}

// ── BLA Configuration ─────────────────────────────────────────────────────────
export interface BLAConfig {
  biologicType: 'novel_biologic' | 'biosimilar' | 'interchangeable';
  referenceProduct?: {
    tradeName: string;
    activeIngredient: string;
    blaNumber?: string;
  };
  comparabilityProtocol?: {
    submitted: boolean;
    analyticalComplete: boolean;
    animalStudiesComplete: boolean;
    clinicalPKComplete: boolean;
    immunogenicityComplete: boolean;
  };
  cellLineManagement?: {
    masterCellBankQualified?: string;
    workingCellBankQualified?: string;
    processChanges?: { description: string; comparabilityRequired: boolean }[];
  };
  interchangeability?: {
    sought: boolean;
    switchStudyPlanned: boolean;
  };
}

// ── 510(k) Configuration ──────────────────────────────────────────────────────
export interface K510Config {
  submissionSubtype: 'traditional' | 'special' | 'abbreviated';
  predicateStrategy?: {
    singlePredicate: boolean;
    predicateRationale?: string;
    adequacy: 'high' | 'moderate' | 'risky';
  };
  substantialEquivalence?: {
    designComparison?: string;
    materialComparison?: string;
    performanceComparison?: string;
    intendedUseComparison?: string;
    areasOfDifference?: string[];
  };
  estarCompliance?: {
    fileNamingFollowed: boolean;
    requiredModulesIncluded: boolean;
    validationStatus: 'not_checked' | 'passed' | 'failed';
  };
  devicePanel?: string;
  performanceStandards?: { standard: string; testingCompleted: boolean; passed: boolean }[];
}

// ── PMA Configuration ─────────────────────────────────────────────────────────
export interface PMAConfig {
  ideRequirements?: {
    ideNumber?: string;
    ideApprovalStatus: 'pending' | 'approved' | 'conditional' | 'denied';
    ideApprovalDate?: string;
    ideAmendments?: { type: string; submittedDate: string }[];
  };
  clinicalTrialDesign?: {
    designType: 'randomized' | 'single_arm' | 'comparative' | 'case_series';
    primaryEndpoint?: string;
    endpointType: 'superiority' | 'non_inferiority' | 'equivalence';
    statisticalPower?: number;
    sampleSize?: number;
    controlArm?: 'active_control' | 'placebo' | 'sham' | 'none';
    blinding?: 'open_label' | 'single_blind' | 'double_blind';
  };
  reviewTrack?: {
    panelTrack: boolean;
    expectedReviewMonths?: number;
  };
}

// ── De Novo Configuration ─────────────────────────────────────────────────────
export interface DeNovoConfig {
  proposedClassification: 'Class_I' | 'Class_II';
  riskBasisForClassification?: string;
  lackOfPredicateJustification?: string;
  predicateSearch?: {
    searchPerformed: boolean;
    searchDate?: string;
    devicesEvaluated?: { name: string; whyNotValid: string }[];
  };
  specialControls?: {
    performanceStandards?: string[];
    labelingRequirements?: string[];
    clinicalDataRequirements?: string;
    postMarketSurveillance?: { required: boolean; durationMonths?: number };
  };
}

// ── Shared Types ──────────────────────────────────────────────────────────────
export interface PredicateDeviceRef {
  name: string;
  kNumber?: string;
  manufacturer?: string;
  clearanceDate?: string;
  intendedUse?: string;
  equivalenceRationale?: string;
  status?: 'active' | 'withdrawn' | 'superseded';
}

export interface TeamAssignment {
  role: 'ra_lead' | 'medical_director' | 'cmc_lead' | 'nonclinical_lead' | 'biostatistician' | 'medical_writer' | 'qa_director' | 'project_manager';
  userId?: number;
  userName?: string;
  email?: string;
  startDate?: string;
}

// ── Phase / section supporting types (used by JSON columns above) ─────────────

export interface StatusTransition {
  from: string;
  to: string;
  at: string;
  by: string;
  byRole?: string;
  reason?: string;
}

export interface PhaseDeliverable {
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'not_applicable';
  owner?: string;
  artifactId?: number;
  completedAt?: string;
}

export interface PhaseBlocker {
  description: string;
  functionalTeam: string; // which team's deliverable blocks this phase
  deliverable: string; // what must be complete
  currentStatus: 'pending' | 'in_progress' | 'completed';
  estimatedCompletionDate?: string;
}

export interface GateRequirement {
  requirement: string;
  type: 'document' | 'study' | 'approval' | 'milestone' | 'data';
  completed: boolean;
  completedDate?: string;
  owner?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSERT SCHEMAS (Zod validation)
// ═══════════════════════════════════════════════════════════════════════════════

export const insertProjectCharterSchema = createInsertSchema(projectCharters).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCharterSectionSchema = createInsertSchema(charterSections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTimelinePhaseSchema = createInsertSchema(timelinePhases).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProjectCommitmentSchema = createInsertSchema(projectCommitments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCharterAuditEventSchema = createInsertSchema(charterAuditEvents).omit({
  id: true,
  occurredAt: true,
});

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export type ProjectCharter = InferSelectModel<typeof projectCharters>;
export type InsertProjectCharter = z.infer<typeof insertProjectCharterSchema>;

export type CharterSection = InferSelectModel<typeof charterSections>;
export type InsertCharterSection = z.infer<typeof insertCharterSectionSchema>;

export type TimelinePhase = InferSelectModel<typeof timelinePhases>;
export type InsertTimelinePhase = z.infer<typeof insertTimelinePhaseSchema>;

export type ProjectCommitment = InferSelectModel<typeof projectCommitments>;
export type InsertProjectCommitment = z.infer<typeof insertProjectCommitmentSchema>;

export type CharterAuditEvent = InferSelectModel<typeof charterAuditEvents>;
export type InsertCharterAuditEvent = z.infer<typeof insertCharterAuditEventSchema>;
