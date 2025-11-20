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

// CMC Projects - Core project management
export const cmcProjects = pgTable('cmc_projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: text('organization_id').notNull(),
  name: text('name').notNull(),
  drugName: text('drug_name').notNull(),
  drugType: text('drug_type').notNull(), // Small Molecule, mAb, etc.
  dosageForm: text('dosage_form').notNull(),
  indication: text('indication').notNull(),
  developmentStage: text('development_stage').notNull(),
  regulatoryRegion: text('regulatory_region').notNull(),
  manufacturingSite: text('manufacturing_site'),
  targetSubmissionDate: timestamp('target_submission_date'),
  projectManager: text('project_manager'),
  status: text('status').notNull().default('active'), // active, on-hold, completed, cancelled
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Drug Substance Information (3.2.S)
export const drugSubstances = pgTable('drug_substances', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => cmcProjects.id, { onDelete: 'cascade' }),
  substanceName: text('substance_name').notNull(),
  cas: text('cas_number'),
  molecularFormula: text('molecular_formula'),
  molecularWeight: decimal('molecular_weight', { precision: 10, scale: 2 }),
  structure: text('structure'), // SMILES or other
  manufacturingRoute: text('manufacturing_route'),
  specifications: jsonb('specifications'),
  stability: jsonb('stability_data'),
  characterization: jsonb('characterization_data'),
  impurities: jsonb('impurities'),
  referenceMaterials: jsonb('reference_materials'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Analytical Methods
export const analyticalMethods = pgTable('analytical_methods', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => cmcProjects.id, { onDelete: 'cascade' }),
  methodName: text('method_name').notNull(),
  methodType: text('method_type').notNull(), // HPLC, LC-MS, etc.
  purpose: text('purpose').notNull(), // Assay, Impurities, etc.
  principle: text('principle'),
  procedure: text('procedure'),
  validationStatus: text('validation_status').default('not-started'),
  validationData: jsonb('validation_data'),
  specificityData: jsonb('specificity_data'),
  linearityData: jsonb('linearity_data'),
  accuracyData: jsonb('accuracy_data'),
  precisionData: jsonb('precision_data'),
  robustnessData: jsonb('robustness_data'),
  systemSuitability: jsonb('system_suitability'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Stability Studies
export const stabilityStudies = pgTable('stability_studies', {
  id: serial('id').primaryKey(),
  projectId: uuid('project_id').references(() => cmcProjects.id, { onDelete: 'cascade' }),
  studyName: text('study_name').notNull(),
  studyType: text('study_type'), // Long-term, Accelerated, Stress
  storageCondition: text('storage_condition'),
  duration: text('duration'),
  timePoints: text('time_points'),
  containerClosure: text('container_closure'),
  testParameters: text('test_parameters'),
  status: text('status'),
  startedDate: date('started_date'),
  completedDate: date('completed_date'),
  results: jsonb('results'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Manufacturing Information
export const manufacturingProcesses = pgTable('manufacturing_processes', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => cmcProjects.id, { onDelete: 'cascade' }),
  processName: text('process_name').notNull(),
  processType: text('process_type').notNull(), // Drug Substance, Drug Product
  processDescription: text('process_description'),
  processSteps: jsonb('process_steps'),
  criticalProcessParameters: jsonb('critical_process_parameters'),
  processControls: jsonb('process_controls'),
  equipmentList: jsonb('equipment_list'),
  facilityInfo: jsonb('facility_info'),
  batchSize: text('batch_size'),
  yieldData: jsonb('yield_data'),
  scaleUpData: jsonb('scale_up_data'),
  validationStatus: text('validation_status').default('not-started'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Quality Control Specifications
export const qualitySpecifications = pgTable('quality_specifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => cmcProjects.id, { onDelete: 'cascade' }),
  materialType: text('material_type').notNull(), // Drug Substance, Drug Product, Excipient
  materialName: text('material_name').notNull(),
  testParameters: jsonb('test_parameters'),
  acceptanceCriteria: jsonb('acceptance_criteria'),
  testMethods: jsonb('test_methods'),
  justification: text('justification'),
  regulatoryBasis: jsonb('regulatory_basis'),
  approvalStatus: text('approval_status').default('draft'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Regulatory Documents
export const regulatoryDocuments = pgTable('regulatory_documents', {
  id: serial('id').primaryKey(),
  projectId: uuid('project_id').references(() => cmcProjects.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id').notNull(),
  documentType: text('document_type').notNull(), // CTD Module, Protocol, Report, etc.
  title: text('title').notNull(),
  content: text('content'),
  status: text('status').notNull(),
  version: text('version'),
  filePath: text('file_path'),
  createdById: integer('created_by_id'),
  lastModifiedById: integer('last_modified_by_id'),
  metadata: jsonb('metadata'),
  complianceMetrics: jsonb('compliance_metrics'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Compliance Tracking
export const complianceTracking = pgTable('compliance_tracking', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => cmcProjects.id, { onDelete: 'cascade' }),
  guideline: text('guideline').notNull(), // ICH Q2, ICH Q1A, etc.
  requirement: text('requirement').notNull(),
  status: text('status').notNull(), // compliant, non-compliant, pending
  evidence: jsonb('evidence'),
  justification: text('justification'),
  riskLevel: text('risk_level'), // low, medium, high
  mitigation: text('mitigation'),
  dueDate: timestamp('due_date'),
  completedDate: timestamp('completed_date'),
  assignedTo: text('assigned_to'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Workflow Templates
export const workflowTemplates = pgTable('workflow_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: text('organization_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category').notNull(), // Development, Manufacturing, Submission
  drugType: text('drug_type'), // Small Molecule, mAb, etc.
  developmentStage: text('development_stage'),
  templateData: jsonb('template_data').notNull(),
  isPublic: boolean('is_public').default(false),
  usageCount: integer('usage_count').default(0),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Drug Products
export const drugProducts = pgTable('drug_products', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => cmcProjects.id, { onDelete: 'cascade' }),
  productName: text('product_name').notNull(),
  dosageForm: text('dosage_form'),
  strength: text('strength'),
  routeOfAdministration: text('route_of_administration'),
  formulation: jsonb('formulation'),
  excipients: jsonb('excipients'),
  containerClosure: text('container_closure'),
  manufacturingProcess: jsonb('manufacturing_process'),
  batchSize: text('batch_size'),
  specifications: jsonb('specifications'),
  stabilityData: jsonb('stability_data'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Project Workflows
export const projectWorkflows = pgTable('project_workflows', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => cmcProjects.id, { onDelete: 'cascade' }),
  templateId: uuid('template_id').references(() => workflowTemplates.id),
  workflowName: text('workflow_name').notNull(),
  workflowData: jsonb('workflow_data').notNull(),
  status: text('status').default('active'), // active, paused, completed
  progress: integer('progress').default(0), // 0-100
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  assignedTo: text('assigned_to'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Workflow Tasks
export const workflowTasks = pgTable('workflow_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => projectWorkflows.id, { onDelete: 'cascade' }),
  taskName: text('task_name').notNull(),
  description: text('description'),
  taskType: text('task_type'), // document, analysis, review, approval
  priority: text('priority').default('medium'), // low, medium, high
  status: text('status').default('pending'), // pending, in-progress, completed, blocked
  assignedTo: text('assigned_to'),
  dependencies: jsonb('dependencies'), // Array of task IDs
  estimatedHours: integer('estimated_hours'),
  actualHours: integer('actual_hours'),
  dueDate: timestamp('due_date'),
  completedDate: timestamp('completed_date'),
  deliverables: jsonb('deliverables'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Risk Assessments
export const riskAssessments = pgTable('risk_assessments', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => cmcProjects.id, { onDelete: 'cascade' }),
  riskType: text('risk_type').notNull(), // Quality, Regulatory, Manufacturing
  riskDescription: text('risk_description').notNull(),
  likelihood: text('likelihood'), // low, medium, high
  impact: text('impact'), // low, medium, high
  riskScore: integer('risk_score'), // 1-25
  mitigation: text('mitigation'),
  contingency: text('contingency'),
  owner: text('owner'),
  status: text('status').default('open'), // open, mitigated, closed
  reviewDate: timestamp('review_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Insert/Select Schemas for Zod validation
export const insertCmcProjectSchema = createInsertSchema(cmcProjects);
export const selectCmcProjectSchema = createSelectSchema(cmcProjects);
export type InsertCmcProject = z.infer<typeof insertCmcProjectSchema>;
export type SelectCmcProject = z.infer<typeof selectCmcProjectSchema>;

export const insertDrugSubstanceSchema = createInsertSchema(drugSubstances);
export const selectDrugSubstanceSchema = createSelectSchema(drugSubstances);
export type InsertDrugSubstance = z.infer<typeof insertDrugSubstanceSchema>;
export type SelectDrugSubstance = z.infer<typeof selectDrugSubstanceSchema>;

export const insertAnalyticalMethodSchema = createInsertSchema(analyticalMethods);
export const selectAnalyticalMethodSchema = createSelectSchema(analyticalMethods);
export type InsertAnalyticalMethod = z.infer<typeof insertAnalyticalMethodSchema>;
export type SelectAnalyticalMethod = z.infer<typeof selectAnalyticalMethodSchema>;

export const insertStabilityStudySchema = createInsertSchema(stabilityStudies);
export const selectStabilityStudySchema = createSelectSchema(stabilityStudies);
export type InsertStabilityStudy = z.infer<typeof insertStabilityStudySchema>;
export type SelectStabilityStudy = z.infer<typeof selectStabilityStudySchema>;

export const insertManufacturingProcessSchema = createInsertSchema(manufacturingProcesses);
export const selectManufacturingProcessSchema = createSelectSchema(manufacturingProcesses);
export type InsertManufacturingProcess = z.infer<typeof insertManufacturingProcessSchema>;
export type SelectManufacturingProcess = z.infer<typeof selectManufacturingProcessSchema>;

export const insertQualitySpecificationSchema = createInsertSchema(qualitySpecifications);
export const selectQualitySpecificationSchema = createSelectSchema(qualitySpecifications);
export type InsertQualitySpecification = z.infer<typeof insertQualitySpecificationSchema>;
export type SelectQualitySpecification = z.infer<typeof selectQualitySpecificationSchema>;

export const insertRegulatoryDocumentSchema = createInsertSchema(regulatoryDocuments);
export const selectRegulatoryDocumentSchema = createSelectSchema(regulatoryDocuments);
export type InsertRegulatoryDocument = z.infer<typeof insertRegulatoryDocumentSchema>;
export type SelectRegulatoryDocument = z.infer<typeof selectRegulatoryDocumentSchema>;

export const insertComplianceTrackingSchema = createInsertSchema(complianceTracking);
export const selectComplianceTrackingSchema = createSelectSchema(complianceTracking);
export type InsertComplianceTracking = z.infer<typeof insertComplianceTrackingSchema>;
export type SelectComplianceTracking = z.infer<typeof selectComplianceTrackingSchema>;

export const insertWorkflowTemplateSchema = createInsertSchema(workflowTemplates);
export const selectWorkflowTemplateSchema = createSelectSchema(workflowTemplates);
export type InsertWorkflowTemplate = z.infer<typeof insertWorkflowTemplateSchema>;
export type SelectWorkflowTemplate = z.infer<typeof selectWorkflowTemplateSchema>;

export const insertProjectWorkflowSchema = createInsertSchema(projectWorkflows);
export const selectProjectWorkflowSchema = createSelectSchema(projectWorkflows);
export type InsertProjectWorkflow = z.infer<typeof insertProjectWorkflowSchema>;
export type SelectProjectWorkflow = z.infer<typeof selectProjectWorkflowSchema>;

export const insertWorkflowTaskSchema = createInsertSchema(workflowTasks);
export const selectWorkflowTaskSchema = createSelectSchema(workflowTasks);
export type InsertWorkflowTask = z.infer<typeof insertWorkflowTaskSchema>;
export type SelectWorkflowTask = z.infer<typeof selectWorkflowTaskSchema>;

export const insertRiskAssessmentSchema = createInsertSchema(riskAssessments);
export const selectRiskAssessmentSchema = createSelectSchema(riskAssessments);
export type InsertRiskAssessment = z.infer<typeof insertRiskAssessmentSchema>;
export type SelectRiskAssessment = z.infer<typeof selectRiskAssessmentSchema>;
