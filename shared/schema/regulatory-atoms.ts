/**
 * Regulatory Intelligence Atom Schemas
 *
 * Missing atom tables identified by system audit as critical gaps
 * in the regulatory intelligence data model.
 *
 * Tables defined:
 * - cmc_comparability_assessments (CMC_COMPARABILITY_ATOM)
 * - cmc_batch_records (CMC_BATCH_ATOM expanded)
 * - cmc_process_steps (CMC_PROCESS_STEP_ATOM)
 * - pv_signal_assessments (PV_SIGNAL_ATOM expanded)
 * - document_atom_provenance (DOCUMENT_ATOM enhanced)
 * - meddra_term_reference (MEDDRA_TERM_REFERENCE)
 * - biomarker_ontology (BIOMARKER_ONTOLOGY)
 */
import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  uuid,
  decimal,
  serial,
  date,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { organizations } from '../schema';
import { cmcProjects, manufacturingProcesses, stabilityStudies } from '../cmc-schema';

// ============================================================
// 1. CMC_COMPARABILITY_ATOM — cmc_comparability_assessments
// ============================================================

export const cmcComparabilityAssessments = pgTable('cmc_comparability_assessments', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id),
  projectId: uuid('project_id').notNull().references(() => cmcProjects.id, { onDelete: 'cascade' }),
  assessmentName: text('assessment_name').notNull(),
  changeType: text('change_type'), // site_transfer, scale_up, process_change, raw_material_change, equipment_change, method_change
  preChangeState: jsonb('pre_change_state'), // {process, site, scale, equipment, materials}
  postChangeState: jsonb('post_change_state'), // {process, site, scale, equipment, materials}
  changedElement: text('changed_element'),
  affectedCQAs: jsonb('affected_cqas'), // array of quality attributes impacted
  affectedProcessParameters: jsonb('affected_process_parameters'), // CPPs impacted
  analyticalComparabilityEvidence: jsonb('analytical_comparability_evidence'), // test results, statistical comparison
  clinicalBridgingRelevance: text('clinical_bridging_relevance'), // none, nonclinical_only, clinical_required
  regulatoryRiskLevel: text('regulatory_risk_level'), // low, moderate, high, critical
  regulatoryClassification: text('regulatory_classification'), // minor, moderate, major per ICH Q5E / regional guidance
  justification: text('justification'),
  impactedSections: jsonb('impacted_sections'), // array of eCTD sections affected (e.g., "3.2.S.2.2", "3.2.P.3.3")
  status: text('status').default('draft'), // draft, in_review, approved, rejected
  reviewedBy: text('reviewed_by'),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================================
// 2. CMC_BATCH_ATOM expanded — cmc_batch_records
// ============================================================

export const cmcBatchRecords = pgTable('cmc_batch_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id),
  projectId: uuid('project_id').notNull().references(() => cmcProjects.id, { onDelete: 'cascade' }),
  batchNumber: text('batch_number').notNull(),
  batchType: text('batch_type'), // development, engineering, registration, commercial, stability, validation
  materialType: text('material_type'), // drug_substance, drug_product, intermediate
  scale: text('scale'), // lab, pilot, commercial
  site: text('site'),
  manufacturingDate: date('manufacturing_date'),
  expiryDate: date('expiry_date'),
  batchSize: text('batch_size'),
  batchSizeUnit: text('batch_size_unit'),
  yield: decimal('yield'),
  yieldUnit: text('yield_unit'),
  purpose: text('purpose'),
  processVersion: text('process_version'), // links to which version of the process was used
  deviations: jsonb('deviations'), // array of deviation records
  disposition: text('disposition'), // quarantine, released, rejected, pending, expired
  linkedAnalyses: jsonb('linked_analyses'), // array of analytical test result summaries
  linkedStabilityStudyId: integer('linked_stability_study_id').references(() => stabilityStudies.id),
  specificationCompliance: jsonb('specification_compliance'), // pass/fail per spec test
  oosEvents: jsonb('oos_events'), // out-of-specification events
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================================
// 3. CMC_PROCESS_STEP_ATOM — cmc_process_steps
// ============================================================

export const cmcProcessSteps = pgTable('cmc_process_steps', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id),
  processId: uuid('process_id').notNull().references(() => manufacturingProcesses.id, { onDelete: 'cascade' }),
  stepOrder: integer('step_order').notNull(),
  stepName: text('step_name').notNull(),
  unitOperation: text('unit_operation').notNull(),
  description: text('description'),
  inputs: jsonb('inputs'), // materials, intermediates
  outputs: jsonb('outputs'), // products, waste streams
  criticalProcessParameters: jsonb('critical_process_parameters'), // [{name, target, range_low, range_high, unit, criticality}]
  inProcessControls: jsonb('in_process_controls'), // [{test, acceptance_criteria, sampling_point, frequency}]
  equipmentContext: jsonb('equipment_context'), // equipment type, model, qualification status
  holdTimeLimit: text('hold_time_limit'),
  holdTimeCondition: text('hold_time_condition'),
  environmentalControls: jsonb('environmental_controls'),
  scaleDependencies: jsonb('scale_dependencies'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================================
// 4. PV_SIGNAL_ATOM expanded — pv_signal_assessments
// ============================================================

export const pvSignalAssessments = pgTable('pv_signal_assessments', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id),
  signalName: text('signal_name').notNull(),
  signalSource: text('signal_source'), // spontaneous, clinical_trial, literature, registry, faers, eudravigilance
  preferredTerm: text('preferred_term'),
  meddraSOC: text('meddra_soc'), // System Organ Class
  meddraPT: text('meddra_pt'), // Preferred Term
  meddraCode: text('meddra_code'),
  disproportionalityMetric: text('disproportionality_metric'), // ROR, PRR, IC, EBGM
  disproportionalityValue: decimal('disproportionality_value'),
  disproportionalityCI: jsonb('disproportionality_ci'), // {lower, upper}
  observedCount: integer('observed_count'),
  expectedCount: decimal('expected_count'),
  backgroundIncidenceRate: decimal('background_incidence_rate'),
  trend: text('trend'), // increasing, stable, decreasing, insufficient_data
  seriousnessDistribution: jsonb('seriousness_distribution'), // {fatal: n, life_threatening: n, hospitalization: n, disability: n, other: n}
  affectedPopulation: text('affected_population'),
  labelRelevance: text('label_relevance'), // listed, unlisted, partially_listed
  mitigationAction: text('mitigation_action'),
  monitoringImplication: text('monitoring_implication'),
  evaluationStatus: text('evaluation_status'), // new, under_evaluation, confirmed, refuted, closed
  benefitRiskImpact: text('benefit_risk_impact'), // favorable, neutral, unfavorable, requires_reassessment
  sourceStudyIds: jsonb('source_study_ids'), // array of study IDs
  evidenceNarrative: text('evidence_narrative'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================================
// 5. DOCUMENT_ATOM enhanced — document_atom_provenance
// ============================================================

export const documentAtomProvenance = pgTable('document_atom_provenance', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id),
  documentId: uuid('document_id').notNull(), // references the document in any document table
  documentTable: text('document_table').notNull(), // which table the document lives in (unified_documents, vault_documents, ctd_documents, etc.)
  submissionType: text('submission_type'), // IND, NDA, BLA, 510k, CER, MAA, etc.
  ectdSection: text('ectd_section'), // e.g., "2.7.4", "3.2.S.4.3"
  documentPurpose: text('document_purpose'), // primary_submission, amendment, supplement, response, annual_report
  linkedEvidenceIds: jsonb('linked_evidence_ids'), // array of evidence object UUIDs used
  linkedAtomIds: jsonb('linked_atom_ids'), // array of atom UUIDs (study, endpoint, safety, CMC) used as inputs
  generatedBy: text('generated_by'), // ai, human, hybrid
  aiModelUsed: text('ai_model_used'), // which AI model generated content if applicable
  aiConfidenceScore: decimal('ai_confidence_score'),
  reviewerStatus: text('reviewer_status'), // pending, in_review, approved, rejected, revision_requested
  approvalStatus: text('approval_status'), // draft, submitted, approved, withdrawn
  jurisdiction: text('jurisdiction'), // US, EU, JP, CN, CA, AU, global
  modalityContext: text('modality_context'), // small_molecule, biologic, cell_therapy, gene_therapy, device, combination
  safetyRelevanceFlag: boolean('safety_relevance_flag').default(false),
  biostatRelevanceFlag: boolean('biostat_relevance_flag').default(false),
  cmcRelevanceFlag: boolean('cmc_relevance_flag').default(false),
  sourceOfTruthDependencies: jsonb('source_of_truth_dependencies'), // what upstream data this document depends on
  provenanceChain: jsonb('provenance_chain'), // ordered list of transformations/edits that produced this document
  contentHash: text('content_hash'), // SHA-256 of the document content for integrity
  versionNumber: integer('version_number').default(1),
  previousVersionId: uuid('previous_version_id'), // self-reference for version chain
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================================
// 6. MEDDRA_TERM_REFERENCE — meddra_term_reference
// ============================================================

export const meddraTermReference = pgTable('meddra_term_reference', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id),
  meddraVersion: text('meddra_version').notNull(),
  socCode: text('soc_code'), // System Organ Class code
  socName: text('soc_name').notNull(), // System Organ Class name
  hlgtCode: text('hlgt_code'), // High Level Group Term code
  hlgtName: text('hlgt_name'),
  hltCode: text('hlt_code'), // High Level Term code
  hltName: text('hlt_name'),
  ptCode: text('pt_code').notNull(), // Preferred Term code
  ptName: text('pt_name').notNull(), // Preferred Term name
  lltCode: text('llt_code'), // Lowest Level Term code
  lltName: text('llt_name'),
  isPrimaryPath: boolean('is_primary_path').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================================
// 7. BIOMARKER_ONTOLOGY — biomarker_ontology
// ============================================================

export const biomarkerOntology = pgTable('biomarker_ontology', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id),
  biomarkerName: text('biomarker_name').notNull(),
  biomarkerType: text('biomarker_type').notNull(), // protein, gene, metabolite, cell_marker, cytokine, receptor, enzyme, antibody, nucleic_acid, lipid, carbohydrate
  geneSymbol: text('gene_symbol'),
  uniprotId: text('uniprot_id'),
  ncbiGeneId: text('ncbi_gene_id'),
  targetPathway: text('target_pathway'), // e.g., "PI3K/AKT/mTOR", "JAK/STAT"
  diseaseRelevance: jsonb('disease_relevance'), // [{disease, relevance_score, evidence_level}]
  assayMethods: jsonb('assay_methods'), // [{method, platform, specimen}]
  regulatoryQualification: text('regulatory_qualification'), // qualified, exploratory, validated, none
  fdaQualificationContext: text('fda_qualification_context'),
  clinicalUtility: text('clinical_utility'), // predictive, prognostic, pharmacodynamic, safety, surrogate, diagnostic, monitoring
  referenceRange: jsonb('reference_range'), // {lower, upper, unit, population}
  synonyms: jsonb('synonyms'), // array of alternative names
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================================
// Zod Insert/Select Schemas and Types
// ============================================================

// CMC Comparability Assessments
export const insertCmcComparabilityAssessmentSchema = createInsertSchema(cmcComparabilityAssessments);
export const selectCmcComparabilityAssessmentSchema = createSelectSchema(cmcComparabilityAssessments);
export type InsertCmcComparabilityAssessment = z.infer<typeof insertCmcComparabilityAssessmentSchema>;
export type SelectCmcComparabilityAssessment = z.infer<typeof selectCmcComparabilityAssessmentSchema>;

// CMC Batch Records
export const insertCmcBatchRecordSchema = createInsertSchema(cmcBatchRecords);
export const selectCmcBatchRecordSchema = createSelectSchema(cmcBatchRecords);
export type InsertCmcBatchRecord = z.infer<typeof insertCmcBatchRecordSchema>;
export type SelectCmcBatchRecord = z.infer<typeof selectCmcBatchRecordSchema>;

// CMC Process Steps
export const insertCmcProcessStepSchema = createInsertSchema(cmcProcessSteps);
export const selectCmcProcessStepSchema = createSelectSchema(cmcProcessSteps);
export type InsertCmcProcessStep = z.infer<typeof insertCmcProcessStepSchema>;
export type SelectCmcProcessStep = z.infer<typeof selectCmcProcessStepSchema>;

// PV Signal Assessments
export const insertPvSignalAssessmentSchema = createInsertSchema(pvSignalAssessments);
export const selectPvSignalAssessmentSchema = createSelectSchema(pvSignalAssessments);
export type InsertPvSignalAssessment = z.infer<typeof insertPvSignalAssessmentSchema>;
export type SelectPvSignalAssessment = z.infer<typeof selectPvSignalAssessmentSchema>;

// Document Atom Provenance
export const insertDocumentAtomProvenanceSchema = createInsertSchema(documentAtomProvenance);
export const selectDocumentAtomProvenanceSchema = createSelectSchema(documentAtomProvenance);
export type InsertDocumentAtomProvenance = z.infer<typeof insertDocumentAtomProvenanceSchema>;
export type SelectDocumentAtomProvenance = z.infer<typeof selectDocumentAtomProvenanceSchema>;

// MedDRA Term Reference
export const insertMeddraTermReferenceSchema = createInsertSchema(meddraTermReference);
export const selectMeddraTermReferenceSchema = createSelectSchema(meddraTermReference);
export type InsertMeddraTermReference = z.infer<typeof insertMeddraTermReferenceSchema>;
export type SelectMeddraTermReference = z.infer<typeof selectMeddraTermReferenceSchema>;

// Biomarker Ontology
export const insertBiomarkerOntologySchema = createInsertSchema(biomarkerOntology);
export const selectBiomarkerOntologySchema = createSelectSchema(biomarkerOntology);
export type InsertBiomarkerOntology = z.infer<typeof insertBiomarkerOntologySchema>;
export type SelectBiomarkerOntology = z.infer<typeof selectBiomarkerOntologySchema>;
