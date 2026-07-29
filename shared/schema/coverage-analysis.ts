/**
 * Medicare Coverage Analysis (MCA) & Clinical-Research Billing Compliance (Capability C2C-15)
 *
 * For a clinical trial, classify each protocol procedure / service / visit item
 * as a Medicare-billable "routine cost", a sponsor-paid (research) cost, or
 * standard-of-care — the coverage/billing grid every trial-running academic
 * medical center must produce to bill Medicare correctly and avoid False Claims
 * Act liability. An analysis links to a clinical study (and, optionally, the IRB
 * submission it sits under) and threads onto the provenance spine.
 *
 * Grounded in Medicare NCD 310.1 ("Routine Costs in Clinical Trials"), the
 * Medicare Clinical Trial Policy, and 42 CFR 405.211. The deterministic billing
 * designation is computed in coverage-logic.ts; the LLM is advisory only.
 * Conventions match the platform; status/type columns are CHECK-constrained.
 * Mutations are governed + audited.
 *
 * @module shared/schema/coverage-analysis
 */

import { boolean, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users, clinicalStudies } from '../schema';
import { irbSubmissions } from './irb';

export type CoverageAnalysisStatus = 'draft' | 'in_progress' | 'finalized' | 'archived';
export type QualifyingDetermination = 'pending' | 'qualifying' | 'non_qualifying';
export type ItemCategory = 'procedure' | 'lab' | 'imaging' | 'drug_administration' | 'visit' | 'device' | 'other';
export type ItemClassification = 'routine_cost' | 'research_paid' | 'standard_of_care' | 'unclear';
export type BillingDesignation = 'bill_medicare' | 'bill_sponsor' | 'bill_standard_of_care' | 'do_not_bill' | 'hold';
export type SuggestionSource = 'deterministic' | 'llm_suggested' | 'manual';

// ─── Coverage analyses ───────────────────────────────────────────────────────

export const coverageAnalyses = pgTable(
  'coverage_analyses',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    /** The clinical study this analysis covers (org-scoped CTMS-lite linkage). */
    studyId: integer('study_id').references(() => clinicalStudies.id),
    /** Optional provenance link to the IRB submission this trial sits under. */
    irbSubmissionId: integer('irb_submission_id').references(() => irbSubmissions.id),
    /** ClinicalTrials.gov identifier — seed source for trial metadata. */
    nctId: text('nct_id'),
    title: text('title').notNull(),
    sponsor: text('sponsor'),
    // ─ Qualifying clinical trial determination (NCD 310.1 / 42 CFR 405.211) ─
    qualifyingDetermination: text('qualifying_determination').$type<QualifyingDetermination>().notNull().default('pending'),
    /** Required criterion 1: evaluates a therapeutic/diagnostic intervention (not solely safety/dosing). */
    hasTherapeuticIntent: boolean('has_therapeutic_intent').notNull().default(false),
    /** Required criterion 2: enrolls patients with the diagnosis/condition under study (subject matter). */
    enrollsDiagnosisTreatment: boolean('enrolls_diagnosis_treatment').notNull().default(false),
    /** Required criterion 3: principal purpose falls within a Medicare benefit category. */
    hasMedicareBenefitCategory: boolean('has_medicare_benefit_category').notNull().default(false),
    /** "Deemed" qualifying (IND trial / IDE Category B / AHRQ- or federally-funded). */
    deemedQualifying: boolean('deemed_qualifying').notNull().default(false),
    /** Count of the 7 desirable characteristics met (0..7, advisory only). */
    desirableCharacteristicsCount: integer('desirable_characteristics_count').notNull().default(0),
    qualifyingRationale: text('qualifying_rationale'),
    status: text('status').$type<CoverageAnalysisStatus>().notNull().default('draft'),
    finalizedBy: integer('finalized_by').references(() => users.id),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_coverage_analyses_org').on(t.organizationId),
    studyIdx: index('idx_coverage_analyses_study').on(t.studyId),
  }),
);

export type CoverageAnalysis = typeof coverageAnalyses.$inferSelect;
export type NewCoverageAnalysis = typeof coverageAnalyses.$inferInsert;

// ─── Coverage analysis items (the billing grid rows) ─────────────────────────

export const coverageAnalysisItems = pgTable(
  'coverage_analysis_items',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    analysisId: integer('analysis_id').notNull().references(() => coverageAnalyses.id),
    itemDescription: text('item_description').notNull(),
    category: text('category').$type<ItemCategory>(),
    /** CPT/HCPCS are AMA-licensed — stored as optional free text only; never keyed on. */
    cptHcpcsCode: text('cpt_hcpcs_code'),
    /** ICD-10 indication (public domain); validated via the ICD-10 code service. */
    icd10Code: text('icd10_code'),
    icd10Validated: boolean('icd10_validated').notNull().default(false),
    /** Would this service be furnished as conventional care absent the trial? */
    isStandardOfCare: boolean('is_standard_of_care').notNull().default(false),
    /** Promised free / paid by the sponsor per the CTA or informed consent. */
    sponsorPaidInBudget: boolean('sponsor_paid_in_budget').notNull().default(false),
    classification: text('classification').$type<ItemClassification>().notNull().default('unclear'),
    billingDesignation: text('billing_designation').$type<BillingDesignation>().notNull().default('hold'),
    /** Applicable national coverage determination (e.g. "NCD 310.1"). */
    ncdCitation: text('ncd_citation'),
    /** Applicable local coverage determination number, when relevant. */
    lcdCitation: text('lcd_citation'),
    /** Citeable MCD viewer URL for the cited coverage document. */
    coverageDocUrl: text('coverage_doc_url'),
    rationale: text('rationale'),
    suggestionSource: text('suggestion_source').$type<SuggestionSource>().notNull().default('manual'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_coverage_items_org').on(t.organizationId),
    analysisIdx: index('idx_coverage_items_analysis').on(t.analysisId),
  }),
);

export type CoverageAnalysisItem = typeof coverageAnalysisItems.$inferSelect;
export type NewCoverageAnalysisItem = typeof coverageAnalysisItems.$inferInsert;
