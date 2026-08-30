/**
 * CSR Knowledge Database — Layer 1 Quantitative Results Tables
 *
 * Companion module to `csr-knowledge-db.ts`, carrying the Layer 1 study-result
 * tables (ICH E3 sections 1.8–1.12): aggregate safety summaries,
 * pharmacokinetic parameters, dose-response relationships, biomarker
 * measurements, and statistical-analysis (SAP) records.
 *
 * These tables hang off the CSR harvest spine (`csrStudies`,
 * `csrTreatmentArms`, `csrEndpoints`) defined in `csr-knowledge-db.ts`, which
 * re-exports this module via `export *` so the aggregate schema surface —
 * `shared/schema.ts` and drizzle-kit's configured entrypoints — is unchanged.
 * The parent-table imports below are referenced ONLY inside `references(() =>
 * …)` callbacks, which drizzle resolves lazily, so the module cycle with
 * `csr-knowledge-db.ts` is safe (the same pattern that file already uses for
 * `organizations`/`users` from `../schema`).
 *
 * @module shared/schema/csr-knowledge-db-results
 */

import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  json,
  varchar,
  real,
  index,
} from 'drizzle-orm/pg-core';

// Parent tables from the CSR harvest spine — lazy references only (see header).
import { csrStudies, csrTreatmentArms, csrEndpoints } from './csr-knowledge-db';

// ---------------------------------------------------------------------------
// 1.8 Safety Summaries — Aggregate safety data per study
// ---------------------------------------------------------------------------
export const csrSafetySummaries = pgTable(
  'csr_safety_summaries',
  {
    id: serial('id').primaryKey(),
    studyId: integer('study_id')
      .notNull()
      .references(() => csrStudies.id, { onDelete: 'cascade' }),
    armId: integer('arm_id')
      .references(() => csrTreatmentArms.id),

    // TEAE summary
    anyTEAE: integer('any_teae'),
    anyTreatmentRelatedTEAE: integer('any_treatment_related_teae'),
    anySeriousAE: integer('any_serious_ae'),
    anyTreatmentRelatedSAE: integer('any_treatment_related_sae'),
    deathsDuringStudy: integer('deaths_during_study'),
    treatmentRelatedDeaths: integer('treatment_related_deaths'),
    discontinuationDueToAE: integer('discontinuation_due_to_ae'),
    doseReductionDueToAE: integer('dose_reduction_due_to_ae'),
    doseInterruptionDueToAE: integer('dose_interruption_due_to_ae'),

    // Safety population
    safetyPopulationN: integer('safety_population_n'),

    // Lab safety
    labAbnormalities: json('lab_abnormalities'),
    vitalSignAbnormalities: json('vital_sign_abnormalities'),
    ecgFindings: json('ecg_findings'),

    // Narratives
    teaeSummaryText: text('teae_summary_text'),
    saeSummaryText: text('sae_summary_text'),
    deathNarratives: text('death_narratives'),
    safetyConclusion: text('safety_conclusion'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studyIdx: index('csr_safety_study_idx').on(table.studyId),
  })
);

// ---------------------------------------------------------------------------
// 1.9 Pharmacokinetic Data — PK parameters per arm
// ---------------------------------------------------------------------------
export const csrPharmacokinetics = pgTable(
  'csr_pharmacokinetics',
  {
    id: serial('id').primaryKey(),
    studyId: integer('study_id')
      .notNull()
      .references(() => csrStudies.id, { onDelete: 'cascade' }),
    armId: integer('arm_id')
      .references(() => csrTreatmentArms.id),

    // PK Parameter
    parameterName: varchar('parameter_name', { length: 50 }).notNull(),
    parameterUnit: varchar('parameter_unit', { length: 30 }),
    analyteOrMatrix: varchar('analyte_or_matrix', { length: 100 }),

    // Values (geometric mean unless noted)
    meanValue: real('mean_value'),
    geometricMean: real('geometric_mean'),
    medianValue: real('median_value'),
    coefficientOfVariation: real('cv_percent'),
    ciLower: real('ci_lower'),
    ciUpper: real('ci_upper'),
    nSubjects: integer('n_subjects'),

    // Context
    dosingCondition: varchar('dosing_condition', { length: 100 }),
    samplingTimepoint: varchar('sampling_timepoint', { length: 100 }),
    isSteadyState: boolean('is_steady_state').default(false),
    foodEffect: varchar('food_effect', { length: 30 }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studyIdx: index('csr_pk_study_idx').on(table.studyId),
    paramIdx: index('csr_pk_param_idx').on(table.parameterName),
  })
);

// ---------------------------------------------------------------------------
// 1.10 Dose Response — Dose-efficacy and dose-safety relationships
// ---------------------------------------------------------------------------
export const csrDoseResponse = pgTable(
  'csr_dose_response',
  {
    id: serial('id').primaryKey(),
    studyId: integer('study_id')
      .notNull()
      .references(() => csrStudies.id, { onDelete: 'cascade' }),
    endpointId: integer('endpoint_id')
      .references(() => csrEndpoints.id),

    dose: real('dose').notNull(),
    doseUnit: varchar('dose_unit', { length: 30 }).notNull(),
    responseType: varchar('response_type', { length: 50 }).notNull(),
    responseValue: real('response_value'),
    responseUnit: varchar('response_unit', { length: 50 }),
    nSubjects: integer('n_subjects'),
    standardError: real('standard_error'),
    pValueVsPlacebo: real('p_value_vs_placebo'),

    // Model fit
    modelType: varchar('model_type', { length: 50 }),
    ed50: real('ed50'),
    emax: real('emax'),
    hillCoefficient: real('hill_coefficient'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    studyIdx: index('csr_dr_study_idx').on(table.studyId),
  })
);

// ---------------------------------------------------------------------------
// 1.11 Biomarker Data — Biomarker measurements and correlations
// ---------------------------------------------------------------------------
export const csrBiomarkers = pgTable(
  'csr_biomarkers',
  {
    id: serial('id').primaryKey(),
    studyId: integer('study_id')
      .notNull()
      .references(() => csrStudies.id, { onDelete: 'cascade' }),
    armId: integer('arm_id')
      .references(() => csrTreatmentArms.id),

    biomarkerName: text('biomarker_name').notNull(),
    biomarkerType: varchar('biomarker_type', { length: 50 }),
    assayMethod: text('assay_method'),
    specimen: varchar('specimen', { length: 50 }),

    // Values
    baselineValue: real('baseline_value'),
    endpointValue: real('endpoint_value'),
    changeFromBaseline: real('change_from_baseline'),
    percentChange: real('percent_change'),
    unit: varchar('unit', { length: 50 }),
    nSubjects: integer('n_subjects'),

    // Correlation with clinical endpoint
    correlatedEndpointId: integer('correlated_endpoint_id')
      .references(() => csrEndpoints.id),
    correlationCoefficient: real('correlation_coefficient'),
    correlationPValue: real('correlation_p_value'),

    // Classification
    isPredictive: boolean('is_predictive'),
    isPrognostic: boolean('is_prognostic'),
    isPharmacodynamic: boolean('is_pharmacodynamic'),
    qualificationStatus: varchar('qualification_status', { length: 50 }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studyIdx: index('csr_bio_study_idx').on(table.studyId),
    nameIdx: index('csr_bio_name_idx').on(table.biomarkerName),
    typeIdx: index('csr_bio_type_idx').on(table.biomarkerType),
  })
);

// ---------------------------------------------------------------------------
// 1.12 Statistical Analysis Records — Full SAP traceability
// ---------------------------------------------------------------------------
export const csrStatisticalAnalyses = pgTable(
  'csr_statistical_analyses',
  {
    id: serial('id').primaryKey(),
    studyId: integer('study_id')
      .notNull()
      .references(() => csrStudies.id, { onDelete: 'cascade' }),
    endpointId: integer('endpoint_id')
      .references(() => csrEndpoints.id),

    analysisName: text('analysis_name').notNull(),
    analysisType: varchar('analysis_type', { length: 50 }).notNull(),
    analysisPopulation: varchar('analysis_population', { length: 50 }),

    // Methods
    primaryModel: text('primary_model'),
    covariates: json('covariates'),
    stratificationFactors: json('stratification_factors'),
    multiplicityAdjustmentMethod: text('multiplicity_adjustment_method'),
    missingDataHandling: text('missing_data_handling'),
    sensitivityAnalysisDescription: text('sensitivity_analysis_description'),

    // Sample size
    sampleSizeJustification: text('sample_size_justification'),
    powerCalculation: text('power_calculation'),
    assumedEffectSize: real('assumed_effect_size'),
    plannedPower: real('planned_power'),
    alphaLevel: real('alpha_level'),

    // Interim analysis
    hasInterimAnalysis: boolean('has_interim_analysis').default(false),
    interimAnalysisDetails: text('interim_analysis_details'),
    stoppingRules: text('stopping_rules'),

    // DMC
    dataSources: json('data_sources'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studyIdx: index('csr_stat_study_idx').on(table.studyId),
    typeIdx: index('csr_stat_type_idx').on(table.analysisType),
  })
);
