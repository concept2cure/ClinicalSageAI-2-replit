/**
 * Project Charter Schema
 *
 * Regulatory project charter with pathway-specific intelligence.
 *
 * Tables:
 * - projectCharters: Charter document per project with pathway-specific intelligence
 *
 * Formally dropped (decision register issue #727, item 10 — staged
 * migrated-but-never-queried tables; created by
 * migrations/0012_project_charter_timeline.sql, dropped by
 * migrations/20260611_drop_charter_staging_tables.sql):
 * - charterSections ('charter_sections')
 * - timelinePhases ('timeline_phases')
 * - projectCommitments ('project_commitments')
 * Previously removed (no migration ever existed): regulatoryMeetings,
 * charterAuditEvents. All re-creatable from git history if the charter
 * feature is ever scheduled.
 *
 * MULTI-TENANT: All tables include organizationId for RLS isolation.
 * All timestamps use UTC (withTimezone: true) per 21 CFR 11.70(a).
 *
 * @module shared/schema/project-charter
 */

import { InferSelectModel } from 'drizzle-orm';
import {
  integer,
  pgTable,
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

// ═══════════════════════════════════════════════════════════════════════════════
// INSERT SCHEMAS (Zod validation)
// ═══════════════════════════════════════════════════════════════════════════════

export const insertProjectCharterSchema = createInsertSchema(projectCharters).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export type ProjectCharter = InferSelectModel<typeof projectCharters>;
export type InsertProjectCharter = z.infer<typeof insertProjectCharterSchema>;
