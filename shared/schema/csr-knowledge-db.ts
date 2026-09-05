/**
 * CSR & CTD Knowledge Database Schema
 *
 * Comprehensive, normalized schema for storing ALL structured data extracted
 * from Clinical Study Reports (CSR/ICH E3) and Common Technical Documents (CTD/eCTD).
 *
 * PURPOSE:
 * - Replace unstructured JSON blobs with queryable, indexed columns
 * - Enable cross-study analytics, trend detection, and meta-analysis
 * - Feed proprietary learning/intelligence engines with structured training data
 * - Build a competitive moat: the Concept2Cure.RI proprietary CSR+CTD database
 *
 * ARCHITECTURE:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Layer 1: CSR Data Harvest (normalized from ICH E3 sections)          │
 * │  ─ Studies, Arms, Endpoints, Safety, Population, PK, Biomarkers      │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  Layer 2: CTD Module Repository (M1–M5 structured storage)            │
 * │  ─ Programs, Modules, Sections, Documents, Cross-references           │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  Layer 3: Intelligence & Learning (cross-study analytics)             │
 * │  ─ Comparisons, Signals, Precedents, Knowledge Graph, Training Data   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * MULTI-TENANT: All tables include organizationId for RLS isolation.
 * AUDIT: All tables include createdAt/updatedAt; critical tables include createdBy.
 *
 * @module shared/schema/csr-knowledge-db
 */

import {
  integer,
  pgTable,
  pgEnum,
  serial,
  text,
  timestamp,
  boolean,
  uuid,
  json,
  unique,
  primaryKey,
  varchar,
  real,
  index,
  uniqueIndex,
  decimal,
  date,
  customType,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Reference parent tables from main schema
import { organizations, clientWorkspaces, users } from '../schema';

// ============================================================================
// CUSTOM TYPES
// ============================================================================

const vector1536 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
    return JSON.stringify(value);
  },
  fromDriver(value: string): number[] {
    if (typeof value === 'string') return JSON.parse(value);
    return value as any;
  },
});

// ============================================================================
// ENUMS
// ============================================================================

export const studyPhaseEnum = pgEnum('csr_study_phase', [
  'preclinical',
  'phase_1',
  'phase_1a',
  'phase_1b',
  'phase_1_2',
  'phase_2',
  'phase_2a',
  'phase_2b',
  'phase_2_3',
  'phase_3',
  'phase_3a',
  'phase_3b',
  'phase_4',
  'not_applicable',
]);

export const studyDesignEnum = pgEnum('csr_study_design', [
  'parallel',
  'crossover',
  'factorial',
  'single_arm',
  'adaptive',
  'basket',
  'umbrella',
  'platform',
  'enrichment',
  'sequential',
  'dose_escalation',
  'other',
]);

export const blindingTypeEnum = pgEnum('csr_blinding_type', [
  'open_label',
  'single_blind',
  'double_blind',
  'triple_blind',
  'observer_blind',
]);

export const armTypeEnum = pgEnum('csr_arm_type', [
  'experimental',
  'active_comparator',
  'placebo_comparator',
  'sham_comparator',
  'no_intervention',
  'dose_group',
  'combination',
  'crossover_sequence',
]);

export const endpointCategoryEnum = pgEnum('csr_endpoint_category', [
  'primary',
  'secondary',
  'exploratory',
  'safety',
  'pharmacokinetic',
  'biomarker',
  'patient_reported',
  'composite',
]);

export const aeSerousnessEnum = pgEnum('csr_ae_seriousness', [
  'non_serious',
  'serious',
  'life_threatening',
  'fatal',
]);

export const aeCausalityEnum = pgEnum('csr_ae_causality', [
  'unrelated',
  'unlikely',
  'possible',
  'probable',
  'definite',
  'not_assessed',
]);

export const aeOutcomeEnum = pgEnum('csr_ae_outcome', [
  'recovered',
  'recovering',
  'not_recovered',
  'recovered_with_sequelae',
  'fatal',
  'unknown',
]);

export const ctdModuleEnum = pgEnum('ctd_module', [
  'm1_administrative',
  'm2_summaries',
  'm3_quality',
  'm4_nonclinical',
  'm5_clinical',
]);

export const regulatoryAgencyEnum = pgEnum('csr_regulatory_agency', [
  'fda',
  'ema',
  'pmda',
  'nmpa',
  'health_canada',
  'tga',
  'mhra',
  'anvisa',
  'swissmedic',
  'who',
  'other',
]);

export const signalStatusEnum = pgEnum('csr_signal_status', [
  'detected',
  'under_evaluation',
  'confirmed',
  'refuted',
  'monitoring',
  'closed',
]);

export const moleculeTypeEnum = pgEnum('csr_molecule_type', [
  'small_molecule',
  'monoclonal_antibody',
  'bispecific_antibody',
  'adc',
  'peptide',
  'oligonucleotide',
  'gene_therapy',
  'cell_therapy',
  'vaccine',
  'biosimilar',
  'radiopharmaceutical',
  'combination',
  'other',
]);

export const therapeuticAreaEnum = pgEnum('csr_therapeutic_area', [
  'oncology',
  'cardiology',
  'neurology',
  'immunology',
  'infectious_disease',
  'endocrinology',
  'respiratory',
  'gastroenterology',
  'nephrology',
  'hematology',
  'dermatology',
  'ophthalmology',
  'musculoskeletal',
  'psychiatry',
  'rare_disease',
  'pediatrics',
  'womens_health',
  'pain',
  'other',
]);

// ============================================================================
// LAYER 1: CSR DATA HARVEST — Normalized ICH E3 Sections
// ============================================================================

// ---------------------------------------------------------------------------
// 1.1 Study Master Record — The central fact table for every harvested study
// ---------------------------------------------------------------------------
export const csrStudies = pgTable(
  'csr_studies',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id')
      .references(() => clientWorkspaces.id),

    // Identity
    csrId: varchar('csr_id', { length: 100 }).notNull(),
    nctId: varchar('nct_id', { length: 30 }),
    eudractNumber: varchar('eudract_number', { length: 30 }),
    protocolNumber: varchar('protocol_number', { length: 100 }),
    studyTitle: text('study_title').notNull(),
    studyAcronym: varchar('study_acronym', { length: 50 }),

    // Sponsor & Drug
    sponsor: text('sponsor'),
    molecule: text('molecule'),
    moleculeType: moleculeTypeEnum('molecule_type'),
    brandName: varchar('brand_name', { length: 200 }),
    inn: varchar('inn', { length: 200 }),
    mechanismOfAction: text('mechanism_of_action'),
    therapeuticArea: therapeuticAreaEnum('therapeutic_area'),
    indication: text('indication'),
    indicationMedDRA: varchar('indication_meddra', { length: 50 }),

    // Study Design
    phase: studyPhaseEnum('phase'),
    studyDesign: studyDesignEnum('study_design'),
    blinding: blindingTypeEnum('blinding'),
    randomization: text('randomization'),
    controlType: varchar('control_type', { length: 50 }),
    numberOfArms: integer('number_of_arms'),
    adaptiveDesignDetails: text('adaptive_design_details'),

    // Timeline
    studyStartDate: date('study_start_date'),
    studyEndDate: date('study_end_date'),
    primaryCompletionDate: date('primary_completion_date'),
    durationWeeks: integer('duration_weeks'),
    reportDate: date('report_date'),

    // Regulatory
    regulatoryAgency: regulatoryAgencyEnum('regulatory_agency'),
    submissionType: varchar('submission_type', { length: 50 }),
    applicationNumber: varchar('application_number', { length: 50 }),

    // Design Rationale (semantic layer)
    designRationale: text('design_rationale'),
    regulatoryClassification: text('regulatory_classification'),
    studyTypeDescription: text('study_type_description'),

    // Source Tracking
    sourceDocumentId: integer('source_document_id'),
    sourceReportId: integer('source_report_id'),
    extractionVersion: varchar('extraction_version', { length: 20 }),
    extractionConfidence: real('extraction_confidence'),
    extractedAt: timestamp('extracted_at'),
    verifiedBy: integer('verified_by').references(() => users.id),
    verifiedAt: timestamp('verified_at'),

    // Vector embedding for semantic search across studies
    embedding: vector1536('embedding'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('csr_studies_org_idx').on(table.organizationId),
    csrIdIdx: uniqueIndex('csr_studies_csr_id_idx').on(table.organizationId, table.csrId),
    nctIdx: index('csr_studies_nct_idx').on(table.nctId),
    indicationIdx: index('csr_studies_indication_idx').on(table.indication),
    phaseIdx: index('csr_studies_phase_idx').on(table.phase),
    moleculeIdx: index('csr_studies_molecule_idx').on(table.molecule),
    sponsorIdx: index('csr_studies_sponsor_idx').on(table.sponsor),
    taIdx: index('csr_studies_ta_idx').on(table.therapeuticArea),
  })
);

// ---------------------------------------------------------------------------
// 1.2 Treatment Arms — Arm-level detail for every study
// ---------------------------------------------------------------------------
export const csrTreatmentArms = pgTable(
  'csr_treatment_arms',
  {
    id: serial('id').primaryKey(),
    studyId: integer('study_id')
      .notNull()
      .references(() => csrStudies.id, { onDelete: 'cascade' }),

    armName: text('arm_name').notNull(),
    armType: armTypeEnum('arm_type').notNull(),
    armDescription: text('arm_description'),

    // Dosing
    drugName: text('drug_name'),
    dose: varchar('dose', { length: 100 }),
    doseUnit: varchar('dose_unit', { length: 30 }),
    frequency: varchar('frequency', { length: 50 }),
    routeOfAdministration: varchar('route_of_administration', { length: 50 }),
    durationWeeks: integer('duration_weeks'),
    dosingSchedule: text('dosing_schedule'),
    formulation: text('formulation'),

    // Enrollment
    plannedSubjects: integer('planned_subjects'),
    enrolledSubjects: integer('enrolled_subjects'),
    completedSubjects: integer('completed_subjects'),
    discontinuedSubjects: integer('discontinued_subjects'),

    // Arm ordering
    sortOrder: integer('sort_order'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studyIdx: index('csr_arms_study_idx').on(table.studyId),
    armTypeIdx: index('csr_arms_type_idx').on(table.armType),
  })
);

// ---------------------------------------------------------------------------
// 1.3 Study Populations — Enrollment, disposition, demographics
// ---------------------------------------------------------------------------
export const csrPopulations = pgTable(
  'csr_populations',
  {
    id: serial('id').primaryKey(),
    studyId: integer('study_id')
      .notNull()
      .references(() => csrStudies.id, { onDelete: 'cascade' }),

    // Analysis set
    populationName: varchar('population_name', { length: 100 }).notNull(),
    populationDescription: text('population_description'),

    // Disposition counts
    totalScreened: integer('total_screened'),
    screenFailures: integer('screen_failures'),
    totalRandomized: integer('total_randomized'),
    totalEnrolled: integer('total_enrolled'),
    totalCompleted: integer('total_completed'),
    totalDiscontinued: integer('total_discontinued'),
    discontinuationReasons: json('discontinuation_reasons'),

    // Demographics (aggregate)
    meanAge: real('mean_age'),
    medianAge: real('median_age'),
    ageRange: varchar('age_range', { length: 30 }),
    percentFemale: real('percent_female'),
    percentMale: real('percent_male'),
    raceDistribution: json('race_distribution'),
    ethnicityDistribution: json('ethnicity_distribution'),
    regionDistribution: json('region_distribution'),

    // Baseline characteristics
    baselineCharacteristics: json('baseline_characteristics'),
    medicalHistory: json('medical_history'),
    priorTherapies: json('prior_therapies'),
    concomitantMedications: json('concomitant_medications'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studyIdx: index('csr_pop_study_idx').on(table.studyId),
  })
);

// ---------------------------------------------------------------------------
// 1.4 Inclusion/Exclusion Criteria — Individual criteria for cross-study search
// ---------------------------------------------------------------------------
export const csrEligibilityCriteria = pgTable(
  'csr_eligibility_criteria',
  {
    id: serial('id').primaryKey(),
    studyId: integer('study_id')
      .notNull()
      .references(() => csrStudies.id, { onDelete: 'cascade' }),

    criteriaType: varchar('criteria_type', { length: 20 }).notNull(), // 'inclusion' | 'exclusion'
    criterionNumber: integer('criterion_number'),
    criterionText: text('criterion_text').notNull(),
    category: varchar('category', { length: 50 }),
    meddraTerm: varchar('meddra_term', { length: 200 }),
    snomedCode: varchar('snomed_code', { length: 50 }),

    // Semantic embedding for similarity search across trial criteria
    embedding: vector1536('embedding'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    studyIdx: index('csr_elig_study_idx').on(table.studyId),
    typeIdx: index('csr_elig_type_idx').on(table.criteriaType),
  })
);

// ---------------------------------------------------------------------------
// 1.5 Endpoints — Full endpoint definitions with statistical context
// ---------------------------------------------------------------------------
export const csrEndpoints = pgTable(
  'csr_endpoints',
  {
    id: serial('id').primaryKey(),
    studyId: integer('study_id')
      .notNull()
      .references(() => csrStudies.id, { onDelete: 'cascade' }),

    endpointCategory: endpointCategoryEnum('endpoint_category').notNull(),
    endpointName: text('endpoint_name').notNull(),
    endpointDescription: text('endpoint_description'),
    measurementMethod: text('measurement_method'),
    assessmentTimepoint: varchar('assessment_timepoint', { length: 100 }),
    assessmentTool: varchar('assessment_tool', { length: 200 }),

    // Statistical plan for this endpoint
    statisticalMethod: text('statistical_method'),
    statisticalModel: text('statistical_model'),
    primaryAnalysisPopulation: varchar('primary_analysis_population', { length: 50 }),
    multiplicityAdjustment: text('multiplicity_adjustment'),
    missingDataMethod: text('missing_data_method'),
    sensitivityAnalyses: json('sensitivity_analyses'),
    prespecifiedSubgroups: json('prespecified_subgroups'),

    // Semantic embedding
    embedding: vector1536('embedding'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studyIdx: index('csr_ep_study_idx').on(table.studyId),
    categoryIdx: index('csr_ep_category_idx').on(table.endpointCategory),
  })
);

// ---------------------------------------------------------------------------
// 1.6 Endpoint Results — Arm-level results for each endpoint
// ---------------------------------------------------------------------------
export const csrEndpointResults = pgTable(
  'csr_endpoint_results',
  {
    id: serial('id').primaryKey(),
    endpointId: integer('endpoint_id')
      .notNull()
      .references(() => csrEndpoints.id, { onDelete: 'cascade' }),
    armId: integer('arm_id')
      .references(() => csrTreatmentArms.id, { onDelete: 'set null' }),

    // Result values
    nSubjects: integer('n_subjects'),
    resultValue: real('result_value'),
    resultUnit: varchar('result_unit', { length: 50 }),
    standardDeviation: real('standard_deviation'),
    standardError: real('standard_error'),
    medianValue: real('median_value'),
    confidenceIntervalLower: real('ci_lower'),
    confidenceIntervalUpper: real('ci_upper'),
    confidenceLevel: real('ci_level'),

    // Comparison (vs reference arm)
    comparisonArmId: integer('comparison_arm_id')
      .references(() => csrTreatmentArms.id),
    treatmentDifference: real('treatment_difference'),
    pValue: real('p_value'),
    pValueAdjusted: real('p_value_adjusted'),
    oddsRatio: real('odds_ratio'),
    hazardRatio: real('hazard_ratio'),
    relativeRisk: real('relative_risk'),
    numberNeededToTreat: real('nnt'),

    // Responder analysis
    responseRate: real('response_rate'),
    responderDefinition: text('responder_definition'),

    // Statistical significance
    isStatisticallySignificant: boolean('is_statistically_significant'),
    isClinicallyMeaningful: boolean('is_clinically_meaningful'),
    clinicalMeaningfulThreshold: real('clinical_meaningful_threshold'),

    // Subgroup context
    subgroupName: varchar('subgroup_name', { length: 200 }),
    isSubgroupAnalysis: boolean('is_subgroup_analysis').default(false),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    endpointIdx: index('csr_epres_endpoint_idx').on(table.endpointId),
    armIdx: index('csr_epres_arm_idx').on(table.armId),
    pvalIdx: index('csr_epres_pval_idx').on(table.pValue),
  })
);

// ---------------------------------------------------------------------------
// 1.7 Adverse Events — Individual AE/SAE records
// ---------------------------------------------------------------------------
export const csrAdverseEvents = pgTable(
  'csr_adverse_events',
  {
    id: serial('id').primaryKey(),
    studyId: integer('study_id')
      .notNull()
      .references(() => csrStudies.id, { onDelete: 'cascade' }),
    armId: integer('arm_id')
      .references(() => csrTreatmentArms.id),

    // Event identification
    preferredTerm: text('preferred_term').notNull(),
    systemOrganClass: text('system_organ_class'),
    meddraCode: varchar('meddra_code', { length: 20 }),
    highLevelGroupTerm: text('high_level_group_term'),

    // Severity/Seriousness
    seriousness: aeSerousnessEnum('seriousness').notNull(),
    severityGrade: integer('severity_grade'),
    severityScale: varchar('severity_scale', { length: 50 }),
    causality: aeCausalityEnum('causality'),
    outcome: aeOutcomeEnum('outcome'),

    // Incidence (aggregate per arm per event)
    subjectsAffected: integer('subjects_affected'),
    subjectsAtRisk: integer('subjects_at_risk'),
    incidenceRate: real('incidence_rate'),
    eventsTotal: integer('events_total'),

    // Timing
    medianOnsetDays: real('median_onset_days'),
    medianDurationDays: real('median_duration_days'),

    // Actions
    doseModification: boolean('dose_modification').default(false),
    drugDiscontinued: boolean('drug_discontinued').default(false),
    treatmentRequired: boolean('treatment_required').default(false),
    hospitalizationRequired: boolean('hospitalization_required').default(false),

    // Flags
    isAESI: boolean('is_aesi').default(false),
    isDoseRelated: boolean('is_dose_related'),
    isExpected: boolean('is_expected'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studyIdx: index('csr_ae_study_idx').on(table.studyId),
    armIdx: index('csr_ae_arm_idx').on(table.armId),
    ptIdx: index('csr_ae_pt_idx').on(table.preferredTerm),
    socIdx: index('csr_ae_soc_idx').on(table.systemOrganClass),
    seriousnessIdx: index('csr_ae_seriousness_idx').on(table.seriousness),
    meddraIdx: index('csr_ae_meddra_idx').on(table.meddraCode),
  })
);

// ---------------------------------------------------------------------------
// 1.8–1.12 Quantitative results tables — extracted to a sibling module
// ---------------------------------------------------------------------------
// Safety summaries, pharmacokinetics, dose-response, biomarkers, and
// statistical-analysis records live in csr-knowledge-db-results.ts. The
// `export *` keeps the aggregate surface of this module (and of
// shared/schema.ts, which star-exports it) identical, and lets
// scripts/db/install-fresh.mjs's declaredTableNames() walker — which follows
// literal `export * from` re-exports — still count those tables as push
// inputs for the drizzle entrypoints.
export * from './csr-knowledge-db-results';

// ---------------------------------------------------------------------------
// 1.13 CSR Sections — Raw section text with embeddings for RAG
// ---------------------------------------------------------------------------
export const csrSections = pgTable(
  'csr_sections',
  {
    id: serial('id').primaryKey(),
    studyId: integer('study_id')
      .notNull()
      .references(() => csrStudies.id, { onDelete: 'cascade' }),

    sectionNumber: varchar('section_number', { length: 20 }),
    sectionTitle: text('section_title').notNull(),
    ichE3Section: varchar('ich_e3_section', { length: 20 }),
    sectionText: text('section_text'),
    wordCount: integer('word_count'),
    pageStart: integer('page_start'),
    pageEnd: integer('page_end'),

    // Extraction quality
    extractionConfidence: real('extraction_confidence'),
    hasTablesOrFigures: boolean('has_tables_or_figures').default(false),

    // Vector embedding for semantic search within sections
    embedding: vector1536('embedding'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    studyIdx: index('csr_sec_study_idx').on(table.studyId),
    ichIdx: index('csr_sec_ich_idx').on(table.ichE3Section),
  })
);

// ---------------------------------------------------------------------------
// 1.14 CSR Tables/Figures/Listings (TFL) — Extracted data tables
// ---------------------------------------------------------------------------
export const csrTablesAndFigures = pgTable(
  'csr_tables_and_figures',
  {
    id: serial('id').primaryKey(),
    studyId: integer('study_id')
      .notNull()
      .references(() => csrStudies.id, { onDelete: 'cascade' }),
    sectionId: integer('section_id')
      .references(() => csrSections.id),

    tflType: varchar('tfl_type', { length: 20 }).notNull(),
    tflNumber: varchar('tfl_number', { length: 30 }),
    title: text('title').notNull(),
    caption: text('caption'),

    // Structured data extracted from the table
    structuredData: json('structured_data'),
    columnHeaders: json('column_headers'),
    rowCount: integer('row_count'),
    footnotes: text('footnotes'),

    // Source info
    pageNumber: integer('page_number'),
    sourceFile: text('source_file'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    studyIdx: index('csr_tfl_study_idx').on(table.studyId),
    typeIdx: index('csr_tfl_type_idx').on(table.tflType),
  })
);

// ---------------------------------------------------------------------------
// 1.15 CSR References — Protocol, SAP, CRF, literature references
// ---------------------------------------------------------------------------
export const csrReferences = pgTable(
  'csr_references',
  {
    id: serial('id').primaryKey(),
    studyId: integer('study_id')
      .notNull()
      .references(() => csrStudies.id, { onDelete: 'cascade' }),

    referenceType: varchar('reference_type', { length: 50 }).notNull(),
    title: text('title'),
    authors: text('authors'),
    source: text('source'),
    year: integer('year'),
    doi: varchar('doi', { length: 200 }),
    pmid: varchar('pmid', { length: 20 }),
    documentVersion: varchar('document_version', { length: 20 }),
    url: text('url'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    studyIdx: index('csr_ref_study_idx').on(table.studyId),
    typeIdx: index('csr_ref_type_idx').on(table.referenceType),
  })
);

// ============================================================================
// LAYER 2: CTD MODULE REPOSITORY — Structured M1-M5 Document Storage
// ============================================================================

// ---------------------------------------------------------------------------
// 2.1 CTD Programs — Drug development program (spans multiple submissions)
// ---------------------------------------------------------------------------
export const ctdPrograms = pgTable(
  'ctd_programs',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id')
      .references(() => clientWorkspaces.id),

    programName: text('program_name').notNull(),
    programCode: varchar('program_code', { length: 50 }),
    molecule: text('molecule'),
    moleculeType: moleculeTypeEnum('molecule_type'),
    therapeuticArea: therapeuticAreaEnum('therapeutic_area'),
    indication: text('indication'),
    targetAgency: regulatoryAgencyEnum('target_agency'),

    status: varchar('status', { length: 30 }).default('active'),
    leadProjectManager: integer('lead_project_manager').references(() => users.id),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('ctd_prog_org_idx').on(table.organizationId),
    moleculeIdx: index('ctd_prog_molecule_idx').on(table.molecule),
  })
);

// ---------------------------------------------------------------------------
// 2.2 CTD Submissions — Individual regulatory submission
// ---------------------------------------------------------------------------
export const ctdSubmissions = pgTable(
  'ctd_submissions',
  {
    id: serial('id').primaryKey(),
    programId: integer('program_id')
      .notNull()
      .references(() => ctdPrograms.id, { onDelete: 'cascade' }),

    submissionTitle: text('submission_title').notNull(),
    submissionType: varchar('submission_type', { length: 50 }).notNull(),
    sequenceNumber: integer('sequence_number'),
    applicationNumber: varchar('application_number', { length: 50 }),

    // Regulatory
    targetAgency: regulatoryAgencyEnum('target_agency').notNull(),
    submissionDate: date('submission_date'),
    targetDate: date('target_date'),
    acceptanceDate: date('acceptance_date'),
    approvalDate: date('approval_date'),

    status: varchar('status', { length: 30 }).default('draft'),
    ectdVersion: varchar('ectd_version', { length: 10 }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    programIdx: index('ctd_sub_program_idx').on(table.programId),
    agencyIdx: index('ctd_sub_agency_idx').on(table.targetAgency),
    statusIdx: index('ctd_sub_status_idx').on(table.status),
  })
);

// ---------------------------------------------------------------------------
// 2.3 CTD Module Sections — Normalized M1–M5 section tree
// ---------------------------------------------------------------------------
export const ctdModuleSections = pgTable(
  'ctd_module_sections',
  {
    id: serial('id').primaryKey(),
    submissionId: integer('submission_id')
      .notNull()
      .references(() => ctdSubmissions.id, { onDelete: 'cascade' }),

    module: ctdModuleEnum('module').notNull(),
    sectionCode: varchar('section_code', { length: 30 }).notNull(),
    sectionTitle: text('section_title').notNull(),
    parentSectionId: integer('parent_section_id'),

    // Content
    sectionStatus: varchar('section_status', { length: 30 }).default('not_started'),
    completionPercent: integer('completion_percent').default(0),
    assignedTo: integer('assigned_to').references(() => users.id),
    dueDate: date('due_date'),

    // Document lifecycle
    lifecycleOperation: varchar('lifecycle_operation', { length: 20 }),
    previousVersionId: integer('previous_version_id'),

    // Regional specifics
    regionSpecificPath: text('region_specific_path'),
    isRegionSpecific: boolean('is_region_specific').default(false),

    sortOrder: integer('sort_order'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    submissionIdx: index('ctd_sec_submission_idx').on(table.submissionId),
    moduleIdx: index('ctd_sec_module_idx').on(table.module),
    codeIdx: index('ctd_sec_code_idx').on(table.sectionCode),
  })
);

// ---------------------------------------------------------------------------
// 2.4 CTD Documents — Individual documents within sections
// ---------------------------------------------------------------------------
export const ctdDocuments = pgTable(
  'ctd_documents',
  {
    id: serial('id').primaryKey(),
    sectionId: integer('section_id')
      .notNull()
      .references(() => ctdModuleSections.id, { onDelete: 'cascade' }),

    documentTitle: text('document_title').notNull(),
    documentType: varchar('document_type', { length: 50 }).notNull(),
    fileName: text('file_name'),
    fileSize: integer('file_size'),
    mimeType: varchar('mime_type', { length: 100 }),
    checksum: varchar('checksum', { length: 128 }),

    // Lifecycle
    version: varchar('version', { length: 20 }).default('1.0'),
    lifecycleOperation: varchar('lifecycle_operation', { length: 20 }).default('new'),
    effectiveDate: date('effective_date'),

    // Content extraction
    extractedText: text('extracted_text'),
    pageCount: integer('page_count'),
    wordCount: integer('word_count'),

    // Storage
    storagePath: text('storage_path'),
    storageProvider: varchar('storage_provider', { length: 20 }),

    // Authoring
    createdBy: integer('created_by').references(() => users.id),
    reviewedBy: integer('reviewed_by').references(() => users.id),
    approvedBy: integer('approved_by').references(() => users.id),
    status: varchar('status', { length: 30 }).default('draft'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    sectionIdx: index('ctd_doc_section_idx').on(table.sectionId),
    typeIdx: index('ctd_doc_type_idx').on(table.documentType),
    statusIdx: index('ctd_doc_status_idx').on(table.status),
  })
);

// ---------------------------------------------------------------------------
// 2.5 CTD Cross-References — Links between CTD sections and CSR studies
// ---------------------------------------------------------------------------
export const ctdCrossReferences = pgTable(
  'ctd_cross_references',
  {
    id: serial('id').primaryKey(),
    sourceSectionId: integer('source_section_id')
      .references(() => ctdModuleSections.id),
    sourceDocumentId: integer('source_document_id')
      .references(() => ctdDocuments.id),
    targetSectionId: integer('target_section_id')
      .references(() => ctdModuleSections.id),
    targetDocumentId: integer('target_document_id')
      .references(() => ctdDocuments.id),
    targetStudyId: integer('target_study_id')
      .references(() => csrStudies.id),

    referenceType: varchar('reference_type', { length: 50 }).notNull(),
    description: text('description'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    sourceSecIdx: index('ctd_xref_source_sec_idx').on(table.sourceSectionId),
    targetSecIdx: index('ctd_xref_target_sec_idx').on(table.targetSectionId),
    studyIdx: index('ctd_xref_study_idx').on(table.targetStudyId),
  })
);

// ---------------------------------------------------------------------------
// 2.6 CTD Quality Data (Module 3) — Drug substance/product specifications
// ---------------------------------------------------------------------------
export const ctdQualityData = pgTable(
  'ctd_quality_data',
  {
    id: serial('id').primaryKey(),
    programId: integer('program_id')
      .notNull()
      .references(() => ctdPrograms.id, { onDelete: 'cascade' }),

    qualitySection: varchar('quality_section', { length: 30 }).notNull(),
    attribute: text('attribute').notNull(),
    specification: text('specification'),
    testMethod: text('test_method'),
    acceptanceCriteria: text('acceptance_criteria'),
    resultValue: text('result_value'),
    resultStatus: varchar('result_status', { length: 20 }),

    // Drug substance vs product
    isDrugSubstance: boolean('is_drug_substance').default(true),
    batchNumber: varchar('batch_number', { length: 50 }),
    batchScale: varchar('batch_scale', { length: 30 }),
    manufacturer: text('manufacturer'),
    manufacturingSite: text('manufacturing_site'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    programIdx: index('ctd_qual_program_idx').on(table.programId),
    sectionIdx: index('ctd_qual_section_idx').on(table.qualitySection),
  })
);

// ---------------------------------------------------------------------------
// 2.7 CTD Nonclinical Data (Module 4) — Tox/pharm study summaries
// ---------------------------------------------------------------------------
export const ctdNonclinicalStudies = pgTable(
  'ctd_nonclinical_studies',
  {
    id: serial('id').primaryKey(),
    programId: integer('program_id')
      .notNull()
      .references(() => ctdPrograms.id, { onDelete: 'cascade' }),

    studyType: varchar('study_type', { length: 50 }).notNull(),
    studyTitle: text('study_title').notNull(),
    species: varchar('species', { length: 50 }),
    strain: varchar('strain', { length: 50 }),
    routeOfAdministration: varchar('route_of_administration', { length: 50 }),
    durationWeeks: integer('duration_weeks'),
    glpCompliant: boolean('glp_compliant'),

    // Results
    noael: text('noael'),
    loael: text('loael'),
    mtd: text('mtd'),
    keyFindings: text('key_findings'),
    targetOrganToxicity: json('target_organ_toxicity'),
    carcinogenicityFindings: text('carcinogenicity_findings'),
    genotoxicityResults: text('genotoxicity_results'),
    reproductiveToxicity: text('reproductive_toxicity'),
    safetyMargins: json('safety_margins'),

    // Source document
    studyReportNumber: varchar('study_report_number', { length: 50 }),
    testingFacility: text('testing_facility'),
    studyCompletionDate: date('study_completion_date'),

    // Ingestion provenance — populated by the preclinical extractor when a
    // study row is created from a parsed PDF. Nullable so legacy/manual rows
    // remain valid.
    sourcePdfId: varchar('source_pdf_id', { length: 64 }),
    extractionModel: varchar('extraction_model', { length: 64 }),
    extractionConfidence: real('extraction_confidence'),
    extractedAt: timestamp('extracted_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    programIdx: index('ctd_nonclin_program_idx').on(table.programId),
    typeIdx: index('ctd_nonclin_type_idx').on(table.studyType),
    sourcePdfIdx: index('ctd_nonclin_source_pdf_idx').on(table.sourcePdfId),
  })
);

// ============================================================================
// LAYER 3: INTELLIGENCE & LEARNING ENGINE
// ============================================================================

// ---------------------------------------------------------------------------
// 3.1 Cross-Study Comparisons — Structured comparison records
// ---------------------------------------------------------------------------
export const csrCrossStudyComparisons = pgTable(
  'csr_cross_study_comparisons',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    comparisonTitle: text('comparison_title').notNull(),
    comparisonType: varchar('comparison_type', { length: 50 }).notNull(),

    // Studies being compared
    studyIds: json('study_ids').notNull(),
    studyCount: integer('study_count').notNull(),

    // Comparison context
    indication: text('indication'),
    therapeuticArea: therapeuticAreaEnum('therapeutic_area'),
    comparisonEndpoint: text('comparison_endpoint'),

    // Results
    summaryFindings: text('summary_findings'),
    structuredResults: json('structured_results'),
    forestPlotData: json('forest_plot_data'),
    pooledEffectSize: real('pooled_effect_size'),
    heterogeneityI2: real('heterogeneity_i2'),

    // Metadata
    methodology: text('methodology'),
    limitations: text('limitations'),
    generatedBy: varchar('generated_by', { length: 30 }),
    isAutomated: boolean('is_automated').default(true),

    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('csr_compare_org_idx').on(table.organizationId),
    taIdx: index('csr_compare_ta_idx').on(table.therapeuticArea),
  })
);

// ---------------------------------------------------------------------------
// 3.2 Safety Signals — Cross-study signal detection and tracking
// ---------------------------------------------------------------------------
export const csrSafetySignals = pgTable(
  'csr_safety_signals',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    signalName: text('signal_name').notNull(),
    signalDescription: text('signal_description'),
    status: signalStatusEnum('status').notNull(),

    // Signal identification
    preferredTerm: text('preferred_term'),
    systemOrganClass: text('system_organ_class'),
    meddraCode: varchar('meddra_code', { length: 20 }),
    molecule: text('molecule'),
    moleculeClass: text('molecule_class'),

    // Evidence
    sourceStudyIds: json('source_study_ids'),
    evidenceStrength: varchar('evidence_strength', { length: 20 }),
    disproportionalityScore: real('disproportionality_score'),
    reportingOddsRatio: real('reporting_odds_ratio'),
    informationComponent: real('information_component'),

    // Context
    backgroundIncidence: real('background_incidence'),
    comparatorIncidence: real('comparator_incidence'),
    isClassEffect: boolean('is_class_effect'),
    isDoseDependent: boolean('is_dose_dependent'),

    // Actions
    actionTaken: text('action_taken'),
    riskMitigation: text('risk_mitigation'),
    regulatoryNotification: boolean('regulatory_notification').default(false),

    detectedAt: timestamp('detected_at'),
    evaluatedAt: timestamp('evaluated_at'),
    closedAt: timestamp('closed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('csr_signal_org_idx').on(table.organizationId),
    statusIdx: index('csr_signal_status_idx').on(table.status),
    ptIdx: index('csr_signal_pt_idx').on(table.preferredTerm),
    moleculeIdx: index('csr_signal_molecule_idx').on(table.molecule),
  })
);

// ---------------------------------------------------------------------------
// 3.3 Regulatory Intelligence — Agency feedback and precedent tracking
// ---------------------------------------------------------------------------
export const csrRegulatoryIntelligence = pgTable(
  'csr_regulatory_intelligence',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Context
    agency: regulatoryAgencyEnum('agency').notNull(),
    therapeuticArea: therapeuticAreaEnum('therapeutic_area'),
    indication: text('indication'),
    moleculeType: moleculeTypeEnum('molecule_type'),
    phase: studyPhaseEnum('phase'),

    // Intelligence record
    intelligenceType: varchar('intelligence_type', { length: 50 }).notNull(),
    title: text('title').notNull(),
    description: text('description'),
    sourceStudyId: integer('source_study_id')
      .references(() => csrStudies.id),

    // Regulatory specifics
    deficiencyCategory: varchar('deficiency_category', { length: 100 }),
    agencyQuestion: text('agency_question'),
    sponsorResponse: text('sponsor_response'),
    resolution: text('resolution'),
    impactOnTimeline: varchar('impact_on_timeline', { length: 30 }),

    // Precedent value
    isPrecedentSetting: boolean('is_precedent_setting').default(false),
    precedentSummary: text('precedent_summary'),
    applicableGuidances: json('applicable_guidances'),

    // For learning engine: tags and classification
    tags: json('tags'),
    confidence: real('confidence'),

    // Vector embedding for precedent search
    embedding: vector1536('embedding'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('csr_regintel_org_idx').on(table.organizationId),
    agencyIdx: index('csr_regintel_agency_idx').on(table.agency),
    taIdx: index('csr_regintel_ta_idx').on(table.therapeuticArea),
    typeIdx: index('csr_regintel_type_idx').on(table.intelligenceType),
  })
);

// ---------------------------------------------------------------------------
// 3.4 Knowledge Graph Nodes — Entities extracted for relationship mapping
// ---------------------------------------------------------------------------
export const csrKnowledgeNodes = pgTable(
  'csr_knowledge_nodes',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    nodeType: varchar('node_type', { length: 50 }).notNull(),
    nodeName: text('node_name').notNull(),
    normalizedName: text('normalized_name'),
    description: text('description'),
    externalId: varchar('external_id', { length: 200 }),
    ontologySource: varchar('ontology_source', { length: 50 }),

    // Metadata
    properties: json('properties'),

    // Vector embedding for entity resolution
    embedding: vector1536('embedding'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('csr_kn_org_idx').on(table.organizationId),
    typeIdx: index('csr_kn_type_idx').on(table.nodeType),
    nameIdx: index('csr_kn_name_idx').on(table.normalizedName),
  })
);

// ---------------------------------------------------------------------------
// 3.5 Knowledge Graph Edges — Relationships between entities
// ---------------------------------------------------------------------------
export const csrKnowledgeEdges = pgTable(
  'csr_knowledge_edges',
  {
    id: serial('id').primaryKey(),
    sourceNodeId: integer('source_node_id')
      .notNull()
      .references(() => csrKnowledgeNodes.id, { onDelete: 'cascade' }),
    targetNodeId: integer('target_node_id')
      .notNull()
      .references(() => csrKnowledgeNodes.id, { onDelete: 'cascade' }),

    relationshipType: varchar('relationship_type', { length: 50 }).notNull(),
    weight: real('weight'),
    confidence: real('confidence'),

    // Provenance
    sourceStudyId: integer('source_study_id')
      .references(() => csrStudies.id),
    evidenceText: text('evidence_text'),
    evidenceSectionId: integer('evidence_section_id')
      .references(() => csrSections.id),

    properties: json('properties'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    sourceIdx: index('csr_ke_source_idx').on(table.sourceNodeId),
    targetIdx: index('csr_ke_target_idx').on(table.targetNodeId),
    relIdx: index('csr_ke_rel_idx').on(table.relationshipType),
    studyIdx: index('csr_ke_study_idx').on(table.sourceStudyId),
  })
);

// ---------------------------------------------------------------------------
// 3.6 AI Training Data — Curated Q&A pairs for fine-tuning intelligence engines
// ---------------------------------------------------------------------------
export const csrTrainingData = pgTable(
  'csr_training_data',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    datasetName: varchar('dataset_name', { length: 100 }).notNull(),
    dataType: varchar('data_type', { length: 50 }).notNull(),

    // Training pair
    inputText: text('input_text').notNull(),
    expectedOutput: text('expected_output').notNull(),
    context: text('context'),

    // Source provenance
    sourceStudyId: integer('source_study_id')
      .references(() => csrStudies.id),
    sourceSectionId: integer('source_section_id')
      .references(() => csrSections.id),

    // Quality control
    isVerified: boolean('is_verified').default(false),
    verifiedBy: integer('verified_by').references(() => users.id),
    qualityScore: real('quality_score'),
    tags: json('tags'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('csr_td_org_idx').on(table.organizationId),
    datasetIdx: index('csr_td_dataset_idx').on(table.datasetName),
    typeIdx: index('csr_td_type_idx').on(table.dataType),
  })
);

// ---------------------------------------------------------------------------
// 3.7 AI Model Performance — Track intelligence engine accuracy over time
// ---------------------------------------------------------------------------
export const csrModelPerformance = pgTable(
  'csr_model_performance',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    modelName: varchar('model_name', { length: 100 }).notNull(),
    modelVersion: varchar('model_version', { length: 30 }).notNull(),
    taskType: varchar('task_type', { length: 50 }).notNull(),

    // Performance metrics
    accuracy: real('accuracy'),
    precision: real('precision'),
    recall: real('recall'),
    f1Score: real('f1_score'),
    areaUnderCurve: real('auc'),
    meanSquaredError: real('mse'),

    // Dataset info
    trainingDataSize: integer('training_data_size'),
    validationDataSize: integer('validation_data_size'),
    testDataSize: integer('test_data_size'),

    // Config
    hyperparameters: json('hyperparameters'),
    evaluationDetails: json('evaluation_details'),

    evaluatedAt: timestamp('evaluated_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('csr_model_org_idx').on(table.organizationId),
    modelIdx: index('csr_model_name_idx').on(table.modelName, table.modelVersion),
    taskIdx: index('csr_model_task_idx').on(table.taskType),
  })
);

// ============================================================================
// EXPORT SUMMARY — All tables in this module
// ============================================================================

export const CSR_KNOWLEDGE_DB_TABLES = [
  // Layer 1: CSR Data Harvest
  'csrStudies',
  'csrTreatmentArms',
  'csrPopulations',
  'csrEligibilityCriteria',
  'csrEndpoints',
  'csrEndpointResults',
  'csrAdverseEvents',
  'csrSafetySummaries',
  'csrPharmacokinetics',
  'csrDoseResponse',
  'csrBiomarkers',
  'csrStatisticalAnalyses',
  'csrSections',
  'csrTablesAndFigures',
  'csrReferences',
  // Layer 2: CTD Module Repository
  'ctdPrograms',
  'ctdSubmissions',
  'ctdModuleSections',
  'ctdDocuments',
  'ctdCrossReferences',
  'ctdQualityData',
  'ctdNonclinicalStudies',
  // Layer 3: Intelligence & Learning
  'csrCrossStudyComparisons',
  'csrSafetySignals',
  'csrRegulatoryIntelligence',
  'csrKnowledgeNodes',
  'csrKnowledgeEdges',
  'csrTrainingData',
  'csrModelPerformance',
] as const;

export type CsrKnowledgeDbTableName = typeof CSR_KNOWLEDGE_DB_TABLES[number];
