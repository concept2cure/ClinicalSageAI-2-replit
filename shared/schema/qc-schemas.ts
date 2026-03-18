/**
 * Quality Control Database Schemas
 *
 * STATUS: INACTIVE — These 6 tables are fully defined with insert schemas
 * but have NO routes, services, or queries referencing them anywhere in the codebase.
 * Migrations exist but no data flows through these tables.
 *
 * Tables: qcSpecifications, qcOosInvestigations, qcBatchReleases,
 *         qcDeviations, qcMicrobiologicalTests, qcReferenceStandards
 *
 * Comprehensive QC management system for pharmaceutical operations.
 * Includes specifications, OOS investigations, batch releases, deviations,
 * microbiological testing, and reference standards management.
 *
 * TODO: Either build QC routes/services or remove these tables to reduce schema bloat.
 */
import { relations, InferSelectModel } from 'drizzle-orm';
import {
  integer,
  pgTable,
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
  foreignKey,
  decimal,
  date,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { organizations, clientWorkspaces, users } from '../schema';

// ============================================================================
// SPECIFICATION MANAGEMENT
// ============================================================================

export const qcSpecifications = pgTable('qc_specifications', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  clientWorkspaceId: integer('client_workspace_id')
    .notNull()
    .references(() => clientWorkspaces.id),
  
  // Specification Identification
  specNumber: varchar('spec_number', { length: 100 }).notNull(),
  version: varchar('version', { length: 20 }).notNull().default('1.0'),
  versionStatus: varchar('version_status', { length: 50 }).default('draft'), // draft, under_review, approved, superseded, obsolete
  effectiveDate: date('effective_date'),
  expiryDate: date('expiry_date'),
  
  // Product/Material Information
  productId: integer('product_id'),
  productName: text('product_name').notNull(),
  productType: varchar('product_type', { length: 50 }).notNull(), // API, Intermediate, FinishedProduct, RawMaterial, Excipient, Packaging
  dosageForm: varchar('dosage_form', { length: 100 }),
  strength: text('strength'),
  
  // Test Parameters
  testParameters: json('test_parameters'), // Array of test parameter objects with limits
  /*
   * Structure:
   * [{
   *   parameterName: string,
   *   testMethod: string,
   *   specification: string,
   *   lowerLimit: number,
   *   upperLimit: number,
   *   targetValue: number,
   *   units: string,
   *   criticalParameter: boolean,
   *   testFrequency: string,
   *   retestingRequired: boolean
   * }]
   */
  
  // Acceptance Criteria
  acceptanceCriteria: json('acceptance_criteria'),
  samplingPlan: json('sampling_plan'),
  storageConditions: text('storage_conditions'),
  shelfLife: integer('shelf_life'), // in months
  
  // Multi-Product Support
  applicableProducts: json('applicable_products'), // Array of product IDs
  applicableMarkets: json('applicable_markets'), // Array of market/region codes
  
  // Regulatory Information
  regulatoryReference: text('regulatory_reference'),
  compendialStatus: varchar('compendial_status', { length: 50 }), // USP, EP, JP, BP, In-house
  
  // Version Control
  previousVersionId: integer('previous_version_id'),
  changeReason: text('change_reason'),
  changeDescription: text('change_description'),
  
  // Approval Workflow
  status: varchar('status', { length: 50 }).default('draft'), // draft, pending_review, approved, rejected
  createdBy: text('created_by'),
  reviewedBy: text('reviewed_by'),
  reviewedDate: timestamp('reviewed_date'),
  approvedBy: text('approved_by'),
  approvedDate: timestamp('approved_date'),
  
  // Metadata
  attachments: json('attachments'),
  notes: text('notes'),
  metadata: json('metadata'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  specNumberVersionIdx: uniqueIndex('spec_number_version_idx').on(table.specNumber, table.version, table.organizationId),
  productSpecIdx: index('product_spec_idx').on(table.productId),
  statusSpecIdx: index('spec_status_idx').on(table.status),
  versionStatusIdx: index('spec_version_status_idx').on(table.versionStatus),
}));

// ============================================================================
// OOS INVESTIGATION MANAGEMENT
// ============================================================================

export const qcOosInvestigations = pgTable('qc_oos_investigations', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  clientWorkspaceId: integer('client_workspace_id')
    .notNull()
    .references(() => clientWorkspaces.id),
  
  // Investigation Identification
  oosNumber: varchar('oos_number', { length: 100 }).notNull(),
  investigationType: varchar('investigation_type', { length: 50 }).notNull(), // OOS, OOT, OOE (Out of Expectation)
  
  // Related Information
  batchId: integer('batch_id'),
  batchNumber: varchar('batch_number', { length: 100 }),
  productName: text('product_name'),
  testName: text('test_name'),
  specificationId: integer('specification_id'),
  
  // OOS Details
  originalResult: text('original_result'),
  specificationLimit: text('specification_limit'),
  deviationPercentage: decimal('deviation_percentage', { precision: 10, scale: 2 }),
  occurrenceDate: timestamp('occurrence_date'),
  detectedBy: text('detected_by'),
  
  // Phase 1: Laboratory Investigation
  phase1Status: varchar('phase1_status', { length: 50 }).default('pending'), // pending, in_progress, completed, lab_error_found, no_lab_error
  labErrorIdentified: boolean('lab_error_identified').default(false),
  labInvestigationDetails: json('lab_investigation_details'),
  /*
   * Structure: {
   *   analyticalCheck: text,
   *   instrumentCheck: text,
   *   reagentCheck: text,
   *   standardsCheck: text,
   *   calculationCheck: text,
   *   retestPerformed: boolean,
   *   retestResults: array
   * }
   */
  retestResults: json('retest_results'),
  
  // Phase 2: Manufacturing Investigation
  phase2Required: boolean('phase2_required').default(false),
  phase2Status: varchar('phase2_status', { length: 50 }), // pending, in_progress, completed
  manufacturingInvestigation: json('manufacturing_investigation'),
  /*
   * Structure: {
   *   batchRecordReview: text,
   *   processDeviations: array,
   *   equipmentIssues: array,
   *   environmentalFactors: text,
   *   personnelFactors: text
   * }
   */
  
  // Root Cause Analysis
  rootCauseIdentified: boolean('root_cause_identified').default(false),
  rootCauseCategory: varchar('root_cause_category', { length: 100 }), // Human Error, Equipment, Method, Material, Environment
  rootCauseDescription: text('root_cause_description'),
  rootCauseAnalysisMethod: varchar('rca_method', { length: 50 }), // Fishbone, 5-Why, FMEA
  rootCauseDetails: json('root_cause_details'),
  
  // Investigation Timeline
  timeline: json('timeline'), // Array of timeline events
  /*
   * Structure: [{
   *   date: timestamp,
   *   event: string,
   *   performedBy: string,
   *   description: text,
   *   attachments: array
   * }]
   */
  
  // CAPA Linkage
  capaRequired: boolean('capa_required').default(false),
  capaId: integer('capa_id'),
  capaNumber: varchar('capa_number', { length: 100 }),
  correctiveActions: json('corrective_actions'),
  preventiveActions: json('preventive_actions'),
  
  // Impact Assessment
  impactAssessment: json('impact_assessment'),
  /*
   * Structure: {
   *   productImpact: text,
   *   otherBatchesAffected: boolean,
   *   affectedBatches: array,
   *   marketImpact: text,
   *   regulatoryImpact: text,
   *   patientSafetyImpact: text
   * }
   */
  
  // Regulatory Reporting
  regulatoryReportingRequired: boolean('regulatory_reporting_required').default(false),
  regulatoryBodies: json('regulatory_bodies'), // Array of regulatory bodies to report to
  reportingDeadline: date('reporting_deadline'),
  reportingStatus: varchar('reporting_status', { length: 50 }), // pending, submitted, acknowledged, closed
  regulatoryReference: text('regulatory_reference'),
  
  // Investigation Status
  investigationStatus: varchar('investigation_status', { length: 50 }).default('open'), // open, in_progress, pending_approval, closed, cancelled
  priority: varchar('priority', { length: 20 }).default('medium'), // low, medium, high, critical
  assignedTo: text('assigned_to'),
  investigationLead: text('investigation_lead'),
  targetClosureDate: date('target_closure_date'),
  actualClosureDate: date('actual_closure_date'),
  
  // Final Disposition
  finalDisposition: varchar('final_disposition', { length: 50 }), // use_as_is, reject, rework, reprocess
  justification: text('justification'),
  
  // Approvals
  reviewedBy: text('reviewed_by'),
  reviewedDate: timestamp('reviewed_date'),
  approvedBy: text('approved_by'),
  approvedDate: timestamp('approved_date'),
  qaApprovedBy: text('qa_approved_by'),
  qaApprovedDate: timestamp('qa_approved_date'),
  
  // Metadata
  attachments: json('attachments'),
  notes: text('notes'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  oosNumberIdx: uniqueIndex('oos_number_idx').on(table.oosNumber, table.organizationId),
  batchOosIdx: index('batch_oos_idx').on(table.batchId),
  statusOosIdx: index('oos_status_idx').on(table.investigationStatus),
  priorityOosIdx: index('oos_priority_idx').on(table.priority),
}));

// ============================================================================
// BATCH RELEASE SYSTEM
// ============================================================================

export const qcBatchReleases = pgTable('qc_batch_releases', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  clientWorkspaceId: integer('client_workspace_id')
    .notNull()
    .references(() => clientWorkspaces.id),
  
  // Batch Information
  batchId: integer('batch_id'),
  batchNumber: varchar('batch_number', { length: 100 }).notNull(),
  productName: text('product_name').notNull(),
  productCode: varchar('product_code', { length: 100 }),
  manufacturingDate: date('manufacturing_date'),
  expiryDate: date('expiry_date'),
  
  // Electronic Batch Record Review
  batchRecordStatus: varchar('batch_record_status', { length: 50 }).default('pending'), // pending, under_review, reviewed, approved, rejected
  batchRecordReview: json('batch_record_review'),
  /*
   * Structure: {
   *   manufacturingSteps: array,
   *   inProcessControls: array,
   *   criticalProcessParameters: array,
   *   equipmentUsed: array,
   *   personnelInvolved: array,
   *   deviationsFound: array,
   *   yieldsAndReconciliation: object
   * }
   */
  
  // QA Approval Workflow
  releaseStatus: varchar('release_status', { length: 50 }).default('pending'), // pending, under_review, approved, rejected, released, recalled
  qaReviewStartDate: timestamp('qa_review_start_date'),
  qaReviewCompletionDate: timestamp('qa_review_completion_date'),
  qaReviewer: text('qa_reviewer'),
  qaReviewComments: text('qa_review_comments'),
  qaChecklist: json('qa_checklist'),
  
  // Certificate of Analysis
  coaNumber: varchar('coa_number', { length: 100 }),
  coaGeneratedDate: timestamp('coa_generated_date'),
  coaTestResults: json('coa_test_results'),
  /*
   * Structure: [{
   *   testName: string,
   *   method: string,
   *   specification: string,
   *   result: string,
   *   units: string,
   *   status: string (pass/fail),
   *   testedBy: string,
   *   testDate: date
   * }]
   */
  coaConclusion: text('coa_conclusion'),
  coaApprovedBy: text('coa_approved_by'),
  coaApprovedDate: timestamp('coa_approved_date'),
  
  // Batch Genealogy
  genealogyData: json('genealogy_data'),
  /*
   * Structure: {
   *   rawMaterials: array,
   *   intermediates: array,
   *   packagingMaterials: array,
   *   parentBatches: array,
   *   childBatches: array,
   *   relatedBatches: array
   * }
   */
  
  // Release Criteria Validation
  releaseCriteria: json('release_criteria'),
  /*
   * Structure: [{
   *   criterion: string,
   *   requirement: string,
   *   status: string (met/not_met),
   *   evidence: string,
   *   verifiedBy: string,
   *   verificationDate: date
   * }]
   */
  allCriteriaMet: boolean('all_criteria_met').default(false),
  
  // Compliance Checks
  gmpCompliance: boolean('gmp_compliance').default(false),
  stabilityDataReviewed: boolean('stability_data_reviewed').default(false),
  microbiologyApproved: boolean('microbiology_approved').default(false),
  packagingApproved: boolean('packaging_approved').default(false),
  labelsApproved: boolean('labels_approved').default(false),
  
  // Final Release
  releasedBy: text('released_by'),
  releasedDate: timestamp('released_date'),
  releaseDecision: varchar('release_decision', { length: 50 }), // release, reject, conditional_release, quarantine
  releaseConditions: text('release_conditions'),
  distributionRestrictions: json('distribution_restrictions'),
  
  // Metadata
  attachments: json('attachments'),
  notes: text('notes'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  batchNumberReleaseIdx: uniqueIndex('batch_number_release_idx').on(table.batchNumber, table.organizationId),
  releaseStatusIdx: index('release_status_idx').on(table.releaseStatus),
  coaNumberIdx: index('coa_number_idx').on(table.coaNumber),
}));

// ============================================================================
// DEVIATION MANAGEMENT
// ============================================================================

export const qcDeviations = pgTable('qc_deviations', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  clientWorkspaceId: integer('client_workspace_id')
    .notNull()
    .references(() => clientWorkspaces.id),
  
  // Deviation Identification
  deviationNumber: varchar('deviation_number', { length: 100 }).notNull(),
  deviationType: varchar('deviation_type', { length: 50 }).notNull(), // Planned, Unplanned, Incident, Non-conformance
  
  // Classification
  classification: varchar('classification', { length: 20 }).notNull(), // Critical, Major, Minor
  category: varchar('category', { length: 100 }), // Process, Equipment, Documentation, Material, Environmental, Human Error
  
  // Description
  title: text('title').notNull(),
  description: text('description').notNull(),
  detectedDate: timestamp('detected_date').notNull(),
  detectedBy: text('detected_by'),
  location: text('location'),
  department: varchar('department', { length: 100 }),
  
  // Related Information
  batchId: integer('batch_id'),
  batchNumber: varchar('batch_number', { length: 100 }),
  productName: text('product_name'),
  equipmentId: integer('equipment_id'),
  processStep: text('process_step'),
  
  // Impact Assessment
  impactAssessment: json('impact_assessment'),
  /*
   * Structure: {
   *   qualityImpact: text,
   *   safetyImpact: text,
   *   regulatoryImpact: text,
   *   productImpact: text,
   *   otherBatchesAffected: boolean,
   *   affectedBatches: array,
   *   customerImpact: text,
   *   financialImpact: decimal,
   *   riskScore: number
   * }
   */
  impactLevel: varchar('impact_level', { length: 20 }), // Low, Medium, High, Critical
  
  // Investigation
  investigationRequired: boolean('investigation_required').default(true),
  investigationStatus: varchar('investigation_status', { length: 50 }).default('pending'), // pending, in_progress, completed
  investigationDetails: json('investigation_details'),
  rootCauseIdentified: boolean('root_cause_identified').default(false),
  rootCause: text('root_cause'),
  contributingFactors: json('contributing_factors'),
  
  // CAPA Integration
  capaRequired: boolean('capa_required').default(false),
  capaId: integer('capa_id'),
  capaNumber: varchar('capa_number', { length: 100 }),
  correctiveActions: json('corrective_actions'),
  preventiveActions: json('preventive_actions'),
  
  // Resolution
  immediateActions: json('immediate_actions'),
  resolutionDescription: text('resolution_description'),
  effectivenessCheck: json('effectiveness_check'),
  /*
   * Structure: {
   *   checkRequired: boolean,
   *   checkMethod: text,
   *   checkDate: date,
   *   checkResult: text,
   *   effective: boolean
   * }
   */
  
  // Trending Analysis
  trendingData: json('trending_data'),
  /*
   * Structure: {
   *   recurring: boolean,
   *   frequency: number,
   *   pattern: string,
   *   similarDeviations: array,
   *   trendCategory: string
   * }
   */
  
  // Status and Timeline
  status: varchar('status', { length: 50 }).default('open'), // open, under_investigation, pending_approval, closed, cancelled
  priority: varchar('priority', { length: 20 }).default('medium'), // low, medium, high, critical
  assignedTo: text('assigned_to'),
  targetClosureDate: date('target_closure_date'),
  actualClosureDate: date('actual_closure_date'),
  
  // Approvals
  reviewedBy: text('reviewed_by'),
  reviewedDate: timestamp('reviewed_date'),
  approvedBy: text('approved_by'),
  approvedDate: timestamp('approved_date'),
  qaApprovedBy: text('qa_approved_by'),
  qaApprovedDate: timestamp('qa_approved_date'),
  
  // Metadata
  attachments: json('attachments'),
  notes: text('notes'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  deviationNumberIdx: uniqueIndex('deviation_number_qc_idx').on(table.deviationNumber, table.organizationId),
  classificationIdx: index('deviation_classification_idx').on(table.classification),
  statusDeviationIdx: index('deviation_status_qc_idx').on(table.status),
  batchDeviationIdx: index('deviation_batch_qc_idx').on(table.batchId),
}));

// ============================================================================
// MICROBIOLOGICAL TESTING
// ============================================================================

export const qcMicrobiologicalTests = pgTable('qc_microbiological_tests', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  clientWorkspaceId: integer('client_workspace_id')
    .notNull()
    .references(() => clientWorkspaces.id),
  
  // Test Identification
  testNumber: varchar('test_number', { length: 100 }).notNull(),
  testType: varchar('test_type', { length: 100 }).notNull(), 
  // Environmental_Monitoring, Microbial_Limits, Endotoxin, Bioburden, Sterility, Water_Testing
  
  // Sample Information
  sampleId: varchar('sample_id', { length: 100 }),
  sampleType: varchar('sample_type', { length: 100 }), // Product, RawMaterial, Water, Air, Surface
  sampleLocation: text('sample_location'),
  sampleDescription: text('sample_description'),
  samplingDate: timestamp('sampling_date'),
  sampledBy: text('sampled_by'),
  
  // Related Information
  batchId: integer('batch_id'),
  batchNumber: varchar('batch_number', { length: 100 }),
  productName: text('product_name'),
  
  // Environmental Monitoring
  environmentalMonitoring: json('environmental_monitoring'),
  /*
   * Structure: {
   *   monitoringType: string (viable/non-viable),
   *   location: string,
   *   roomClassification: string (ISO Class),
   *   samplingMethod: string,
   *   mediaUsed: string,
   *   incubationConditions: object,
   *   alertLimit: number,
   *   actionLimit: number
   * }
   */
  
  // Microbial Limits Testing
  microbialLimits: json('microbial_limits'),
  /*
   * Structure: {
   *   tamc: number (Total Aerobic Microbial Count),
   *   tymc: number (Total Yeast and Mold Count),
   *   specifiedOrganisms: array,
   *   pathogenTest: object,
   *   limits: object (USP/EP/JP limits),
   *   method: string
   * }
   */
  
  // Endotoxin Testing
  endotoxinTest: json('endotoxin_test'),
  /*
   * Structure: {
   *   method: string (LAL/Recombinant),
   *   endotoxinLimit: number,
   *   result: number,
   *   units: string (EU/ml or EU/mg),
   *   mva: number (Maximum Valid Dilution),
   *   sensitivity: number
   * }
   */
  
  // Bioburden Assessment
  bioburdenAssessment: json('bioburden_assessment'),
  /*
   * Structure: {
   *   preSterilization: number,
   *   postSterilization: number,
   *   recoveryMethod: string,
   *   neutralizationMethod: string,
   *   acceptanceCriteria: object
   * }
   */
  
  // Sterility Testing
  sterilityTest: json('sterility_test'),
  /*
   * Structure: {
   *   method: string (Direct Inoculation/Membrane Filtration),
   *   mediaUsed: array,
   *   incubationTime: number,
   *   incubationTemp: string,
   *   growthPromotionTest: object,
   *   bacteriostasisTest: object,
   *   result: string (Sterile/Non-sterile)
   * }
   */
  
  // Test Results
  testStatus: varchar('test_status', { length: 50 }).default('pending'), // pending, in_progress, completed, invalid
  testStartDate: timestamp('test_start_date'),
  testEndDate: timestamp('test_end_date'),
  result: varchar('result', { length: 50 }), // Pass, Fail, Invalid, Retest
  rawData: json('raw_data'),
  calculatedResults: json('calculated_results'),
  
  // Out of Specification
  oosDetected: boolean('oos_detected').default(false),
  oosInvestigationId: integer('oos_investigation_id'),
  retestRequired: boolean('retest_required').default(false),
  retestResults: json('retest_results'),
  
  // Schedule Management (for Environmental Monitoring)
  scheduledTest: boolean('scheduled_test').default(false),
  scheduleFrequency: varchar('schedule_frequency', { length: 50 }), // Daily, Weekly, Monthly, Quarterly
  nextScheduledDate: date('next_scheduled_date'),
  
  // Review and Approval
  performedBy: text('performed_by'),
  reviewedBy: text('reviewed_by'),
  reviewedDate: timestamp('reviewed_date'),
  approvedBy: text('approved_by'),
  approvedDate: timestamp('approved_date'),
  
  // Metadata
  attachments: json('attachments'),
  notes: text('notes'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  testNumberIdx: uniqueIndex('micro_test_number_idx').on(table.testNumber, table.organizationId),
  testTypeIdx: index('micro_test_type_idx').on(table.testType),
  batchMicroIdx: index('micro_batch_idx').on(table.batchId),
  statusMicroIdx: index('micro_status_idx').on(table.testStatus),
}));

// ============================================================================
// REFERENCE STANDARDS MANAGEMENT
// ============================================================================

export const qcReferenceStandards = pgTable('qc_reference_standards', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  clientWorkspaceId: integer('client_workspace_id')
    .notNull()
    .references(() => clientWorkspaces.id),
  
  // Standard Identification
  standardNumber: varchar('standard_number', { length: 100 }).notNull(),
  standardName: text('standard_name').notNull(),
  standardType: varchar('standard_type', { length: 50 }).notNull(), // Primary, Secondary, Working, Impurity
  chemicalName: text('chemical_name'),
  casNumber: varchar('cas_number', { length: 50 }),
  molecularFormula: text('molecular_formula'),
  molecularWeight: decimal('molecular_weight', { precision: 10, scale: 4 }),
  
  // Source and Qualification
  source: varchar('source', { length: 100 }).notNull(), // USP, EP, BP, In-house, Vendor
  supplierId: integer('supplier_id'),
  supplierName: text('supplier_name'),
  catalogNumber: varchar('catalog_number', { length: 100 }),
  lotNumber: varchar('lot_number', { length: 100 }),
  
  // Inventory Tracking
  quantityReceived: decimal('quantity_received', { precision: 10, scale: 3 }),
  quantityUnit: varchar('quantity_unit', { length: 20 }).default('g'),
  currentQuantity: decimal('current_quantity', { precision: 10, scale: 3 }),
  minimumQuantity: decimal('minimum_quantity', { precision: 10, scale: 3 }),
  location: text('location'),
  storageConditions: text('storage_conditions'),
  containerType: varchar('container_type', { length: 100 }),
  
  // Expiry Monitoring
  receivedDate: date('received_date'),
  expiryDate: date('expiry_date'),
  retestDate: date('retest_date'),
  openedDate: date('opened_date'),
  useByDate: date('use_by_date'),
  expiryAlert: boolean('expiry_alert').default(false),
  daysUntilExpiry: integer('days_until_expiry'),
  
  // Qualification Records
  qualificationStatus: varchar('qualification_status', { length: 50 }).default('pending'), // pending, qualified, expired, disqualified
  qualificationDate: date('qualification_date'),
  qualificationData: json('qualification_data'),
  /*
   * Structure: {
   *   purity: number,
   *   waterContent: number,
   *   identityTest: object,
   *   impurityProfile: array,
   *   certificates: array,
   *   complianceCheck: object
   * }
   */
  coaAvailable: boolean('coa_available').default(false),
  coaReference: text('coa_reference'),
  
  // Usage Logs
  usageLogs: json('usage_logs'),
  /*
   * Structure: [{
   *   date: timestamp,
   *   usedBy: string,
   *   quantity: number,
   *   purpose: string,
   *   testReference: string,
   *   remainingQuantity: number
   * }]
   */
  totalUsage: decimal('total_usage', { precision: 10, scale: 3 }).default('0'),
  usageCount: integer('usage_count').default(0),
  lastUsedDate: timestamp('last_used_date'),
  
  // Preparation (for Working Standards)
  preparationData: json('preparation_data'),
  /*
   * Structure: {
   *   preparedFrom: string (parent standard),
   *   preparationDate: date,
   *   preparedBy: string,
   *   concentration: number,
   *   solvent: string,
   *   volume: number,
   *   stabilityPeriod: number
   * }
   */
  
  // Requalification
  requalificationRequired: boolean('requalification_required').default(false),
  requalificationFrequency: integer('requalification_frequency'), // in months
  lastQualificationDate: date('last_qualification_date'),
  nextQualificationDate: date('next_qualification_date'),
  
  // Disposal
  disposalRequired: boolean('disposal_required').default(false),
  disposalDate: date('disposal_date'),
  disposalMethod: varchar('disposal_method', { length: 100 }),
  disposedBy: text('disposed_by'),
  disposalReason: text('disposal_reason'),
  
  // Status
  status: varchar('status', { length: 50 }).default('active'), // active, expired, quarantine, disposed, consumed
  
  // Metadata
  attachments: json('attachments'),
  notes: text('notes'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  standardNumberIdx: uniqueIndex('standard_number_idx').on(table.standardNumber, table.organizationId),
  standardTypeIdx: index('standard_type_idx').on(table.standardType),
  statusStandardIdx: index('standard_status_idx').on(table.status),
  expiryDateIdx: index('standard_expiry_idx').on(table.expiryDate),
}));

// ============================================================================
// EXPORT TYPES AND SCHEMAS
// ============================================================================

// Specification Management
export const insertQcSpecificationSchema = createInsertSchema(qcSpecifications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type QcSpecification = InferSelectModel<typeof qcSpecifications>;
export type InsertQcSpecification = z.infer<typeof insertQcSpecificationSchema>;

// OOS Investigation
export const insertQcOosInvestigationSchema = createInsertSchema(qcOosInvestigations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type QcOosInvestigation = InferSelectModel<typeof qcOosInvestigations>;
export type InsertQcOosInvestigation = z.infer<typeof insertQcOosInvestigationSchema>;

// Batch Release
export const insertQcBatchReleaseSchema = createInsertSchema(qcBatchReleases).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type QcBatchRelease = InferSelectModel<typeof qcBatchReleases>;
export type InsertQcBatchRelease = z.infer<typeof insertQcBatchReleaseSchema>;

// Deviation Management
export const insertQcDeviationSchema = createInsertSchema(qcDeviations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type QcDeviation = InferSelectModel<typeof qcDeviations>;
export type InsertQcDeviation = z.infer<typeof insertQcDeviationSchema>;

// Microbiological Testing
export const insertQcMicrobiologicalTestSchema = createInsertSchema(qcMicrobiologicalTests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type QcMicrobiologicalTest = InferSelectModel<typeof qcMicrobiologicalTests>;
export type InsertQcMicrobiologicalTest = z.infer<typeof insertQcMicrobiologicalTestSchema>;

// Reference Standards
export const insertQcReferenceStandardSchema = createInsertSchema(qcReferenceStandards).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type QcReferenceStandard = InferSelectModel<typeof qcReferenceStandards>;
export type InsertQcReferenceStandard = z.infer<typeof insertQcReferenceStandardSchema>;