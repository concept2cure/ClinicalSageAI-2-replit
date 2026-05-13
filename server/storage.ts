/**
 * Storage Interface for Concept2Cure
 *
 * Provides a unified storage interface with both in-memory and database implementations.
 * The system automatically falls back to in-memory storage if no database is available.
 */
import { createScopedLogger } from './utils/logger';
import { pool, query, transaction, db } from './db';
import { eq, desc, and, or, like, isNull, not, gte } from 'drizzle-orm';
import * as schema from '../shared/schema';
import * as qcSchema from '../shared/schema/qc-schemas';
import { generateUUID } from './utils/id-generator';

const logger = createScopedLogger('storage');

// Basic User type
export interface User {
  id: number;
  username: string;
  password: string;
  email: string;
  role: string;
  name: string;
  subscribed: boolean;
}

// Mock users for development
export const mockUsers: User[] = [
  {
    id: 1,
    username: 'admin',
    // Mock fixture only — not an auth credential. Real logins go through
    // the Drizzle `users` table with bcrypt-hashed password_hash.
    password: '',
    email: 'admin@trialsage.ai',
    role: 'admin',
    name: 'Admin User',
    subscribed: true,
  },
  {
    id: 2,
    username: 'demo',
    password: '',
    email: 'demo@trialsage.ai',
    role: 'user',
    name: 'Demo User',
    subscribed: true,
  },
];

// Storage interface
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: Omit<User, 'id'>): Promise<User>;
  updateUser(id: number, userData: Partial<User>): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;

  // Trial methods
  getTrial(id: number): Promise<any | undefined>;
  getTrials(options?: { limit?: number; offset?: number }): Promise<any[]>;
  createTrial(trial: any): Promise<any>;
  updateTrial(id: number, trialData: any): Promise<any | undefined>;
  deleteTrial(id: number): Promise<boolean>;

  // Document methods.
  //
  // SECURITY: getDocument requires an organizationId. Pre-fix this
  // method took only the id, and the DB implementation queried
  // `WHERE id = ?` without a tenant filter — meaning any caller that
  // forgot to verify org membership separately could leak a document
  // across tenants. Making the parameter mandatory forces every
  // caller to source the org id from the JWT (req.user.organizationId)
  // rather than letting it default away silently.
  getDocument(id: string, organizationId: number | string): Promise<schema.Document | undefined>;
  getDocumentByName(name: string): Promise<schema.Document | undefined>;
  getDocuments(options?: {
    limit?: number;
    offset?: number;
    folderId?: string;
    status?: string;
    type?: string;
    search?: string;
  }): Promise<schema.Document[]>;
  createDocument(document: schema.InsertDocument): Promise<schema.Document>;
  updateDocument(
    id: string,
    documentData: Partial<schema.InsertDocument>
  ): Promise<schema.Document | undefined>;
  deleteDocument(id: string): Promise<boolean>;

  // Document folder methods
  // Document folder methods.
  //
  // SECURITY: getFolder requires organizationId. Same shape as
  // getDocument's hardening — pre-fix the DB impl queried by id alone
  // and would silently leak folder metadata cross-tenant if any caller
  // forgot to verify scope. No live callers exist today (verified via
  // grep), but making this mandatory means a future code path can't
  // silently regress.
  getFolder(id: string, organizationId: number | string): Promise<schema.DocumentFolder | undefined>;
  getFolders(options?: { parentId?: string | null }): Promise<schema.DocumentFolder[]>;
  createFolder(folder: schema.InsertDocumentFolder): Promise<schema.DocumentFolder>;
  updateFolder(
    id: string,
    folderData: Partial<schema.InsertDocumentFolder>
  ): Promise<schema.DocumentFolder | undefined>;
  deleteFolder(id: string): Promise<boolean>;

  // CER Report methods
  // SECURITY: CER reports are regulated tenant-scoped content (Clinical
  // Evaluation Reports under MDR / IVDR). getCerReport requires
  // organizationId for the same reason as getDocument — silent cross-
  // tenant leakage of a CER is a contract-breaking event for paying
  // pharma clients.
  getCerReport(id: string, organizationId: number | string): Promise<schema.CerReport | undefined>;
  getCerReports(options?: {
    limit?: number;
    offset?: number;
    status?: string;
    deviceName?: string;
    search?: string;
  }): Promise<schema.CerReport[]>;
  createCerReport(cerReport: schema.InsertCerReport): Promise<schema.CerReport>;
  updateCerReport(
    id: string,
    reportData: Partial<schema.InsertCerReport>
  ): Promise<schema.CerReport | undefined>;
  deleteCerReport(id: string): Promise<boolean>;

  // CER Section methods
  getCerSection(id: string): Promise<schema.CerSection | undefined>;
  getCerSections(reportId: string, options?: { orderBy?: string }): Promise<schema.CerSection[]>;
  createCerSection(section: schema.InsertCerSection): Promise<schema.CerSection>;
  updateCerSection(
    id: string,
    sectionData: Partial<schema.InsertCerSection>
  ): Promise<schema.CerSection | undefined>;
  deleteCerSection(id: string): Promise<boolean>;

  // CER FAERS Data methods
  getCerFaersData(id: string): Promise<schema.CerFaersData | undefined>;
  getCerFaersDataByReportId(reportId: string): Promise<schema.CerFaersData[]>;
  createCerFaersData(faersData: schema.InsertCerFaersData): Promise<schema.CerFaersData>;
  updateCerFaersData(
    id: string,
    faersData: Partial<schema.InsertCerFaersData>
  ): Promise<schema.CerFaersData | undefined>;

  // CER Literature methods
  getCerLiterature(id: string): Promise<schema.CerLiterature | undefined>;
  getCerLiteratureByReportId(
    reportId: string,
    options?: {
      limit?: number;
      offset?: number;
      relevanceThreshold?: number;
      includedOnly?: boolean;
    }
  ): Promise<schema.CerLiterature[]>;
  createCerLiterature(literature: schema.InsertCerLiterature): Promise<schema.CerLiterature>;
  updateCerLiterature(
    id: string,
    literature: Partial<schema.InsertCerLiterature>
  ): Promise<schema.CerLiterature | undefined>;

  // CER Compliance methods
  getCerComplianceCheck(id: string): Promise<schema.CerComplianceCheck | undefined>;
  getCerComplianceChecksByReportId(reportId: string): Promise<schema.CerComplianceCheck[]>;
  createCerComplianceCheck(
    check: schema.InsertCerComplianceCheck
  ): Promise<schema.CerComplianceCheck>;
  updateCerComplianceCheck(
    id: string,
    check: Partial<schema.InsertCerComplianceCheck>
  ): Promise<schema.CerComplianceCheck | undefined>;

  // CER Workflow methods
  getCerWorkflow(id: string): Promise<schema.CerWorkflow | undefined>;
  getCerWorkflowByReportId(reportId: string): Promise<schema.CerWorkflow | undefined>;
  createCerWorkflow(workflow: schema.InsertCerWorkflow): Promise<schema.CerWorkflow>;
  updateCerWorkflow(
    id: string,
    workflow: Partial<schema.InsertCerWorkflow>
  ): Promise<schema.CerWorkflow | undefined>;

  // CER Export methods
  getCerExport(id: string): Promise<schema.CerExport | undefined>;
  getCerExportsByReportId(reportId: string): Promise<schema.CerExport[]>;
  createCerExport(export_: schema.InsertCerExport): Promise<schema.CerExport>;

  // Project Management methods
  // SECURITY: getProject requires organizationId. The interface
  // method has no implementation and no callers today, but routes
  // accessing projects (which contain regulatory submissions, CMC
  // data, study designs) are tenant-scoped. Documenting the contract
  // ensures any future implementer can't expose the bug.
  getProject(id: number, organizationId: number | string): Promise<schema.Project | undefined>;
  getProjects(options?: {
    limit?: number;
    offset?: number;
    organizationId?: number;
    clientWorkspaceId?: number;
    status?: string;
    type?: string;
    search?: string;
    withModules?: boolean;
  }): Promise<schema.Project[]>;
  createProject(project: schema.InsertProject): Promise<schema.Project>;
  updateProject(
    id: number,
    projectData: Partial<schema.InsertProject>
  ): Promise<schema.Project | undefined>;
  deleteProject(id: number): Promise<boolean>;

  // Project Module methods
  getProjectModule(id: number): Promise<schema.ProjectModule | undefined>;
  getProjectModules(projectId: number): Promise<schema.ProjectModule[]>;
  createProjectModule(module: schema.InsertProjectModule): Promise<schema.ProjectModule>;
  updateProjectModule(
    id: number,
    moduleData: Partial<schema.InsertProjectModule>
  ): Promise<schema.ProjectModule | undefined>;
  deleteProjectModule(id: number): Promise<boolean>;

  // Project Workflow methods
  getProjectWorkflowStage(id: number): Promise<schema.ProjectWorkflowStage | undefined>;
  getProjectWorkflowStages(
    projectId: number,
    options?: {
      includeWithTasks?: boolean;
      orderBy?: string;
    }
  ): Promise<schema.ProjectWorkflowStage[]>;
  createProjectWorkflowStage(
    stage: schema.InsertProjectWorkflowStage
  ): Promise<schema.ProjectWorkflowStage>;
  updateProjectWorkflowStage(
    id: number,
    stageData: Partial<schema.InsertProjectWorkflowStage>
  ): Promise<schema.ProjectWorkflowStage | undefined>;
  deleteProjectWorkflowStage(id: number): Promise<boolean>;

  // Module Subscription methods
  getAvailableModules(): Promise<schema.AvailableModule[]>;
  getAvailableModule(moduleId: string): Promise<schema.AvailableModule | undefined>;
  createAvailableModule(module: schema.InsertAvailableModule): Promise<schema.AvailableModule>;
  updateAvailableModule(
    moduleId: string,
    moduleData: Partial<schema.InsertAvailableModule>
  ): Promise<schema.AvailableModule | undefined>;
  deleteAvailableModule(moduleId: string): Promise<boolean>;

  getModuleSubscriptions(organizationId: number): Promise<schema.ModuleSubscription[]>;
  getModuleSubscription(
    organizationId: number,
    moduleId: string
  ): Promise<schema.ModuleSubscription | undefined>;
  createModuleSubscription(
    subscription: schema.InsertModuleSubscription
  ): Promise<schema.ModuleSubscription>;
  updateModuleSubscription(
    organizationId: number,
    moduleId: string,
    subscriptionData: Partial<schema.InsertModuleSubscription>
  ): Promise<schema.ModuleSubscription | undefined>;
  deleteModuleSubscription(organizationId: number, moduleId: string): Promise<boolean>;
  bulkUpdateModuleSubscriptions(
    organizationId: number,
    modules: { moduleId: string; enabled: boolean }[]
  ): Promise<schema.ModuleSubscription[]>;

  // Project Task methods
  getProjectTask(id: number): Promise<schema.ProjectTask | undefined>;
  getProjectTasks(options?: {
    projectId?: number;
    workflowStageId?: number;
    assigneeId?: number;
    status?: string;
    priority?: string;
    criticalToQuality?: boolean;
    includeSubtasks?: boolean;
    parentTaskId?: number | null;
  }): Promise<schema.ProjectTask[]>;
  createProjectTask(task: schema.InsertProjectTask): Promise<schema.ProjectTask>;
  updateProjectTask(
    id: number,
    taskData: Partial<schema.InsertProjectTask>
  ): Promise<schema.ProjectTask | undefined>;
  deleteProjectTask(id: number): Promise<boolean>;

  // Project Template methods
  getProjectTemplate(id: number): Promise<schema.ProjectTemplate | undefined>;
  getProjectTemplates(options?: {
    organizationId?: number;
    projectType?: string;
    status?: string;
    moduleTypes?: string[];
    industryFocus?: string[];
  }): Promise<schema.ProjectTemplate[]>;
  createProjectTemplate(template: schema.InsertProjectTemplate): Promise<schema.ProjectTemplate>;
  updateProjectTemplate(
    id: number,
    templateData: Partial<schema.InsertProjectTemplate>
  ): Promise<schema.ProjectTemplate | undefined>;
  deleteProjectTemplate(id: number): Promise<boolean>;
  createProjectFromTemplate(
    templateId: number,
    projectData: Partial<schema.InsertProject>
  ): Promise<schema.Project>;

  // QC Specification methods
  getQcSpecifications(params: {
    organizationId: number;
    clientWorkspaceId: number;
  }): Promise<any[]>;
  getQcSpecification(id: number): Promise<any | undefined>;
  createQcSpecification(spec: any): Promise<any>;
  updateQcSpecification(id: number, spec: any): Promise<any>;
  createSpecificationVersion(
    id: number,
    changeReason: string,
    changeDescription: string
  ): Promise<any>;
  getSpecificationVersions(id: number): Promise<any[]>;

  // OOS Investigation methods
  getOosInvestigations(params: {
    organizationId: number;
    clientWorkspaceId: number;
    status?: string;
    priority?: string;
  }): Promise<any[]>;
  getOosInvestigation(id: number): Promise<any | undefined>;
  createOosInvestigation(investigation: any): Promise<any>;
  updateOosInvestigation(id: number, investigation: any): Promise<any>;
  addOosTimelineEvent(id: number, event: any): Promise<any>;
  performRootCauseAnalysis(id: number, analysis: any): Promise<any>;
  linkCapaToOos(id: number, capa: any): Promise<any>;

  // Batch Release methods
  getBatchReleases(params: {
    organizationId: number;
    clientWorkspaceId: number;
    releaseStatus?: string;
  }): Promise<any[]>;
  getBatchRelease(id: number): Promise<any | undefined>;
  createBatchRelease(release: any): Promise<any>;
  updateBatchRelease(id: number, release: any): Promise<any>;
  reviewBatchRecord(id: number, review: any): Promise<any>;
  generateCertificateOfAnalysis(id: number): Promise<any>;
  getBatchGenealogy(id: number): Promise<any>;
  validateReleaseCriteria(id: number): Promise<any>;
  releaseBatch(id: number, params: any): Promise<any>;

  // QC Deviation methods
  getQcDeviations(params: {
    organizationId: number;
    clientWorkspaceId: number;
    deviationType?: string;
    severity?: string;
  }): Promise<any[]>;
  getQcDeviation(id: number): Promise<any | undefined>;
  createQcDeviation(deviation: any): Promise<any>;
  updateQcDeviation(id: number, deviation: any): Promise<any>;
  performImpactAssessment(id: number, assessment: any): Promise<any>;
  linkCapaToDeviation(id: number, capa: any): Promise<any>;
  getDeviationTrending(params: any): Promise<any>;

  // Microbiological Test methods
  getMicrobiologicalTests(params: {
    organizationId: number;
    clientWorkspaceId: number;
    testType?: string;
    sampleType?: string;
  }): Promise<any[]>;
  getMicrobiologicalTest(id: number): Promise<any | undefined>;
  createMicrobiologicalTest(test: any): Promise<any>;
  updateMicrobiologicalTest(id: number, test: any): Promise<any>;
  getEnvironmentalMonitoringSchedule(params: any): Promise<any>;
  createEnvironmentalMonitoringSchedule(schedule: any): Promise<any>;
  recordMicrobiologicalResults(id: number, results: any): Promise<any>;

  // Reference Standard methods
  getReferenceStandards(params: {
    organizationId: number;
    clientWorkspaceId: number;
    standardType?: string;
    status?: string;
  }): Promise<any[]>;
  getReferenceStandard(id: number): Promise<any | undefined>;
  createReferenceStandard(standard: any): Promise<any>;
  updateReferenceStandard(id: number, standard: any): Promise<any>;
  recordStandardUsage(id: number, usage: any): Promise<any>;
  getExpiringStandards(params: any): Promise<any[]>;
  qualifyReferenceStandard(id: number, qualification: any): Promise<any>;
  disposeReferenceStandard(id: number, disposal: any): Promise<any>;
  getStandardUsageLogs(id: number): Promise<any[]>;

  // Section Graph methods
  // SECURITY: getSection / getSectionLeaf require organizationId. The
  // section graph is the hierarchical structure of regulatory content
  // for a tenant; leaking a single section's metadata across tenants
  // can expose another customer's regulatory roadmap.
  getSection(
    id: number,
    organizationId: number | string,
  ): Promise<schema.Section | undefined>;
  getSections(options?: {
    organizationId?: number;
    clientWorkspaceId?: number;
    canonical?: boolean;
    regionScope?: string;
    search?: string;
  }): Promise<schema.Section[]>;
  createSection(section: schema.InsertSection): Promise<schema.Section>;
  updateSection(
    id: number,
    sectionData: Partial<schema.InsertSection>
  ): Promise<schema.Section | undefined>;
  deleteSection(id: number): Promise<boolean>;

  // Document Section methods
  getDocumentSection(id: number): Promise<schema.DocumentSection | undefined>;
  getDocumentSections(documentId: number): Promise<schema.DocumentSection[]>;
  createDocumentSection(docSection: schema.InsertDocumentSection): Promise<schema.DocumentSection>;
  updateDocumentSection(
    id: number,
    data: Partial<schema.InsertDocumentSection>
  ): Promise<schema.DocumentSection | undefined>;
  deleteDocumentSection(id: number): Promise<boolean>;
  reorderDocumentSections(documentId: number, sectionIds: number[]): Promise<boolean>;

  // Section Leaf methods
  getSectionLeaf(
    id: number,
    organizationId: number | string,
  ): Promise<schema.SectionLeaf | undefined>;
  getSectionLeaves(options?: {
    organizationId?: number;
    clientWorkspaceId?: number;
    status?: string;
  }): Promise<schema.SectionLeaf[]>;
  createSectionLeaf(leaf: schema.InsertSectionLeaf): Promise<schema.SectionLeaf>;
  updateSectionLeaf(
    id: number,
    leafData: Partial<schema.InsertSectionLeaf>
  ): Promise<schema.SectionLeaf | undefined>;
  deleteSectionLeaf(id: number): Promise<boolean>;

  // Patch methods
  getPatch(id: number): Promise<schema.Patch | undefined>;
  getPatches(leafId: number, options?: { limit?: number }): Promise<schema.Patch[]>;
  createPatch(patch: schema.InsertPatch): Promise<schema.Patch>;
  applyPatch(patchId: number): Promise<boolean>;
  revertPatch(patchId: number): Promise<boolean>;

  // Link Edge methods
  getLinkEdge(id: number): Promise<schema.LinkEdge | undefined>;
  getLinkEdges(
    sectionId: number,
    direction?: 'source' | 'target' | 'both'
  ): Promise<schema.LinkEdge[]>;
  createLinkEdge(edge: schema.InsertLinkEdge): Promise<schema.LinkEdge>;
  updateLinkEdge(
    id: number,
    edgeData: Partial<schema.InsertLinkEdge>
  ): Promise<schema.LinkEdge | undefined>;
  deleteLinkEdge(id: number): Promise<boolean>;
  getSectionGraph(sectionId: number, depth?: number): Promise<any>; // Returns graph structure

  // Sync Status methods
  getSyncStatus(entityType: string, entityId: number): Promise<schema.SyncStatus | undefined>;
  getSyncStatuses(options?: {
    status?: string;
    entityType?: string;
    organizationId?: number;
  }): Promise<schema.SyncStatus[]>;
  createSyncStatus(status: schema.InsertSyncStatus): Promise<schema.SyncStatus>;
  updateSyncStatus(
    id: number,
    statusData: Partial<schema.InsertSyncStatus>
  ): Promise<schema.SyncStatus | undefined>;
  clearSyncStatus(entityType: string, entityId: number): Promise<boolean>;

  // Staff Assignment methods
  getStaffAssignment(id: number): Promise<schema.StaffAssignment | undefined>;
  getStaffAssignments(options?: {
    entityType?: string;
    entityId?: number;
    userId?: number;
    role?: string;
    isActive?: boolean;
  }): Promise<schema.StaffAssignment[]>;
  createStaffAssignment(assignment: schema.InsertStaffAssignment): Promise<schema.StaffAssignment>;
  updateStaffAssignment(
    id: number,
    data: Partial<schema.InsertStaffAssignment>
  ): Promise<schema.StaffAssignment | undefined>;
  deleteStaffAssignment(id: number): Promise<boolean>;
  getEntityPermissions(entityType: string, entityId: number, userId: number): Promise<any>;

  // Transaction support for atomic updates
  runInTransaction<T>(callback: () => Promise<T>): Promise<T>;

  // Health check
  healthCheck(): Promise<boolean>;

  // IND Project methods
  getIndProject(projectId: string): Promise<schema.IndProject | undefined>;
  getIndProjectsByOrg(organizationId: number): Promise<schema.IndProject[]>;
  getIndProjects(options?: {
    limit?: number;
    offset?: number;
    organizationId?: number;
    clientWorkspaceId?: number;
    status?: string;
    phase?: string;
    search?: string;
  }): Promise<schema.IndProject[]>;
  createIndProject(project: schema.InsertIndProject): Promise<schema.IndProject>;
  updateIndProject(
    projectId: string,
    projectData: Partial<schema.InsertIndProject>
  ): Promise<schema.IndProject | undefined>;
  deleteIndProject(projectId: string): Promise<boolean>;

  // IND Template methods
  getIndTemplate(templateId: string): Promise<schema.IndTemplate | undefined>;
  getIndTemplates(options?: {
    organizationId?: number;
    category?: string;
    type?: string;
    region?: string;
    status?: string;
    isPublic?: boolean;
  }): Promise<schema.IndTemplate[]>;
  createIndTemplate(template: schema.InsertIndTemplate): Promise<schema.IndTemplate>;
  updateIndTemplate(
    templateId: string,
    templateData: Partial<schema.InsertIndTemplate>
  ): Promise<schema.IndTemplate | undefined>;
  deleteIndTemplate(templateId: string): Promise<boolean>;
  incrementTemplateUsage(templateId: string): Promise<void>;

  // Workflow Progress methods
  getWorkflowProgress(workflowId: string): Promise<schema.WorkflowProgress | undefined>;
  getWorkflowProgressByEntity(
    entityType: string,
    entityId: string
  ): Promise<schema.WorkflowProgress | undefined>;
  getWorkflowProgressByUser(userId: number): Promise<schema.WorkflowProgress[]>;
  createWorkflowProgress(workflow: schema.InsertWorkflowProgress): Promise<schema.WorkflowProgress>;
  updateWorkflowProgress(
    workflowId: string,
    workflowData: Partial<schema.InsertWorkflowProgress>
  ): Promise<schema.WorkflowProgress | undefined>;
  completeWorkflow(workflowId: string): Promise<boolean>;
  abandonWorkflow(workflowId: string): Promise<boolean>;

  // IND Submission methods
  getIndSubmission(submissionId: string): Promise<schema.IndSubmission | undefined>;
  getIndSubmissionBySession(sessionId: string): Promise<schema.IndSubmission | undefined>;
  getActiveIndSubmission(
    organizationId: number,
    userId: number
  ): Promise<schema.IndSubmission | undefined>;
  getIndSubmissions(options?: {
    organizationId?: number;
    clientWorkspaceId?: number;
    isActive?: boolean;
    currentPhase?: string;
    limit?: number;
    offset?: number;
  }): Promise<schema.IndSubmission[]>;
  createIndSubmission(submission: schema.InsertIndSubmission): Promise<schema.IndSubmission>;
  updateIndSubmission(
    submissionId: string,
    submissionData: Partial<schema.InsertIndSubmission>
  ): Promise<schema.IndSubmission | undefined>;
  deleteIndSubmission(submissionId: string): Promise<boolean>;

  // ============================================================================
  // CDISC Integration Methods
  // ============================================================================

  // CDISC PRM (Protocol Representation Model) methods
  getCdiscPrmStudy(studyId: string): Promise<schema.CdiscPrmStudy | undefined>;
  getCdiscPrmStudies(options?: {
    tenantId: number;
    studyPhase?: string;
    protocolStatus?: string;
    limit?: number;
    offset?: number;
  }): Promise<schema.CdiscPrmStudy[]>;
  createCdiscPrmStudy(study: schema.InsertCdiscPrmStudy): Promise<schema.CdiscPrmStudy>;
  updateCdiscPrmStudy(
    studyId: string,
    studyData: Partial<schema.InsertCdiscPrmStudy>
  ): Promise<schema.CdiscPrmStudy | undefined>;
  deleteCdiscPrmStudy(studyId: string): Promise<boolean>;

  // CDISC CDASH (Clinical Data Acquisition Standards Harmonization) methods
  getCdiscCdashForm(formId: string): Promise<schema.CdiscCdashForm | undefined>;
  getCdiscCdashForms(options?: {
    tenantId: number;
    domain?: string;
    formType?: string;
    isStandard?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<schema.CdiscCdashForm[]>;
  createCdiscCdashForm(form: schema.InsertCdiscCdashForm): Promise<schema.CdiscCdashForm>;
  updateCdiscCdashForm(
    formId: string,
    formData: Partial<schema.InsertCdiscCdashForm>
  ): Promise<schema.CdiscCdashForm | undefined>;
  deleteCdiscCdashForm(formId: string): Promise<boolean>;

  // CDISC CSR (Clinical Study Report) methods
  getCdiscCsrTemplate(templateId: string): Promise<schema.CdiscCsrTemplate | undefined>;
  getCdiscCsrTemplates(options?: {
    tenantId: number;
    templateType?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<schema.CdiscCsrTemplate[]>;
  createCdiscCsrTemplate(template: schema.InsertCdiscCsrTemplate): Promise<schema.CdiscCsrTemplate>;
  updateCdiscCsrTemplate(
    templateId: string,
    templateData: Partial<schema.InsertCdiscCsrTemplate>
  ): Promise<schema.CdiscCsrTemplate | undefined>;
  deleteCdiscCsrTemplate(templateId: string): Promise<boolean>;

  // CDISC ADaM (Analysis Data Model) methods
  getCdiscAdamSpec(datasetName: string, studyId: string): Promise<schema.CdiscAdamSpec | undefined>;
  getCdiscAdamSpecs(options?: {
    tenantId: number;
    studyId?: string;
    datasetClass?: string;
    limit?: number;
    offset?: number;
  }): Promise<schema.CdiscAdamSpec[]>;
  createCdiscAdamSpec(spec: schema.InsertCdiscAdamSpec): Promise<schema.CdiscAdamSpec>;
  updateCdiscAdamSpec(
    id: number,
    specData: Partial<schema.InsertCdiscAdamSpec>
  ): Promise<schema.CdiscAdamSpec | undefined>;
  deleteCdiscAdamSpec(id: number): Promise<boolean>;

  // ============================================================================
  // 510(k) Workflow Methods
  // ============================================================================

  // FDA 510(k) Submission methods
  getFda510kSubmission(id: number): Promise<any | undefined>;
  getFda510kSubmissions(options?: {
    organizationId: number;
    deviceId?: number;
    submissionStatus?: string;
    limit?: number;
    offset?: number;
  }): Promise<any[]>;
  createFda510kSubmission(submission: any): Promise<any>;
  updateFda510kSubmission(id: number, submissionData: any): Promise<any | undefined>;
  deleteFda510kSubmission(id: number): Promise<boolean>;

  // Device Submission Workflow methods
  getDeviceSubmissionWorkflow(id: number): Promise<any | undefined>;
  getDeviceSubmissionWorkflows(options?: {
    organizationId: number;
    submissionType?: string;
    submissionId?: number;
    workflowStatus?: string;
    limit?: number;
    offset?: number;
  }): Promise<any[]>;
  createDeviceSubmissionWorkflow(workflow: any): Promise<any>;
  updateDeviceSubmissionWorkflow(id: number, workflowData: any): Promise<any | undefined>;
  deleteDeviceSubmissionWorkflow(id: number): Promise<boolean>;

  // CERV2 510(k) Section methods
  getCerv2510kSection(id: number): Promise<any | undefined>;
  getCerv2510kSections(options?: {
    organizationId: number;
    submissionId?: number;
    parentSectionId?: number;
    limit?: number;
    offset?: number;
  }): Promise<any[]>;
  createCerv2510kSection(section: any): Promise<any>;
  updateCerv2510kSection(id: number, sectionData: any): Promise<any | undefined>;
  deleteCerv2510kSection(id: number): Promise<boolean>;
}

/**
 * In-memory storage implementation
 */
export class MemStorage {
  private users: User[] = [...mockUsers];
  private trials: any[] = [];
  private documents: any[] = [];
  private folders: schema.DocumentFolder[] = [];
  private cerReports: schema.CerReport[] = [];
  private cerSections: schema.CerSection[] = [];
  private cerFaersData: schema.CerFaersData[] = [];
  private cerLiterature: schema.CerLiterature[] = [];
  private cerComplianceChecks: schema.CerComplianceCheck[] = [];
  private cerWorkflows: schema.CerWorkflow[] = [];
  private cerExports: schema.CerExport[] = [];

  // Project Management arrays
  private projects: schema.Project[] = [];
  private projectModules: schema.ProjectModule[] = [];
  private projectWorkflowStages: schema.ProjectWorkflowStage[] = [];
  private projectTasks: schema.ProjectTask[] = [];
  private projectTemplates: schema.ProjectTemplate[] = [];

  // Section Graph arrays
  private sections: schema.Section[] = [];
  private documentSections: schema.DocumentSection[] = [];
  private sectionLeaves: schema.SectionLeaf[] = [];
  private patches: schema.Patch[] = [];
  private linkEdges: schema.LinkEdge[] = [];
  private syncStatuses: schema.SyncStatus[] = [];
  private staffAssignments: schema.StaffAssignment[] = [];

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.find(u => u.id === id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.users.find(u => u.username === username);
  }

  async createUser(userData: Omit<User, 'id'>): Promise<User> {
    const id = this.users.length > 0 ? Math.max(...this.users.map(u => u.id)) + 1 : 1;

    const newUser = { id, ...userData };
    this.users.push(newUser);
    return newUser;
  }

  async updateUser(id: number, userData: Partial<User>): Promise<User | undefined> {
    const index = this.users.findIndex(u => u.id === id);
    if (index === -1) return undefined;

    this.users[index] = { ...this.users[index], ...userData };
    return this.users[index];
  }

  async deleteUser(id: number): Promise<boolean> {
    const initialLength = this.users.length;
    this.users = this.users.filter(u => u.id !== id);
    return initialLength > this.users.length;
  }

  // Trial methods
  async getTrial(id: number): Promise<any | undefined> {
    return this.trials.find(t => t.id === id);
  }

  async getTrials(options: { limit?: number; offset?: number } = {}): Promise<any[]> {
    const { limit = 10, offset = 0 } = options;
    return this.trials.slice(offset, offset + limit);
  }

  async createTrial(trial: any): Promise<any> {
    const id = this.trials.length > 0 ? Math.max(...this.trials.map(t => t.id)) + 1 : 1;

    const newTrial = { id, ...trial };
    this.trials.push(newTrial);
    return newTrial;
  }

  async updateTrial(id: number, trialData: any): Promise<any | undefined> {
    const index = this.trials.findIndex(t => t.id === id);
    if (index === -1) return undefined;

    this.trials[index] = { ...this.trials[index], ...trialData };
    return this.trials[index];
  }

  async deleteTrial(id: number): Promise<boolean> {
    const initialLength = this.trials.length;
    this.trials = this.trials.filter(t => t.id !== id);
    return initialLength > this.trials.length;
  }

  // Document methods
  async getDocument(id: string, organizationId: number | string): Promise<schema.Document | undefined> {
    const orgId = Number(organizationId);
    return this.documents.find(
      d => d.id === id && Number((d as any).organizationId) === orgId,
    ) as schema.Document | undefined;
  }

  async getDocumentByName(name: string): Promise<schema.Document | undefined> {
    return this.documents.find(d => d.title === name) as schema.Document | undefined;
  }

  async getDocuments(
    options: {
      limit?: number;
      offset?: number;
      folderId?: string;
      status?: string;
      type?: string;
      search?: string;
    } = {}
  ): Promise<schema.Document[]> {
    const { limit = 20, offset = 0, folderId, status, type, search } = options;

    // Filter documents based on provided criteria
    let result = this.documents as schema.Document[];

    if (folderId) {
      // Note: Document schema doesn't have folderId, filtering by metadata if available
      result = result.filter(d => (d.metadata as any)?.folderId === folderId);
    }

    if (status) {
      result = result.filter(d => d.status === status);
    }

    if (type) {
      result = result.filter(d => d.documentType === type);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        d =>
          d.title.toLowerCase().includes(searchLower) ||
          (d.description && d.description.toLowerCase().includes(searchLower))
      );
    }

    // Sort by updated date (descending)
    result = result.sort((a, b) => {
      const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return dateB - dateA;
    });

    return result.slice(offset, offset + limit);
  }

  async createDocument(document: schema.InsertDocument): Promise<schema.Document> {
    // Generate UUID for document
    const id = generateUUID();

    // Set timestamps if not provided
    const now = new Date();
    const newDocument = {
      ...document,
      id: 0, // Documents use serial ID, will be auto-generated by DB
      createdAt: now,
      updatedAt: now,
    } as schema.Document;

    this.documents.push(newDocument);
    return newDocument;
  }

  async updateDocument(
    id: string,
    documentData: Partial<schema.InsertDocument>
  ): Promise<schema.Document | undefined> {
    const index = this.documents.findIndex(d => d.id === id);
    if (index === -1) return undefined;

    // Update modified timestamp
    const now = new Date();
    this.documents[index] = {
      ...this.documents[index],
      ...documentData,
      updatedAt: now,
    };

    return this.documents[index] as schema.Document;
  }

  async deleteDocument(id: string): Promise<boolean> {
    const initialLength = this.documents.length;
    this.documents = this.documents.filter(d => d.id !== id);
    return initialLength > this.documents.length;
  }

  // Document folder methods
  async getFolder(
    id: string,
    organizationId: number | string,
  ): Promise<schema.DocumentFolder | undefined> {
    const orgId = Number(organizationId);
    return this.folders.find(
      f => f.id === id && Number((f as any).organizationId) === orgId,
    );
  }

  async getFolders(options: { parentId?: string | null } = {}): Promise<schema.DocumentFolder[]> {
    // If parentId is explicitly null, return root folders
    if (options.parentId === null) {
      return this.folders.filter(f => f.parentId === null);
    }

    // If parentId is specified, return child folders
    if (options.parentId) {
      return this.folders.filter(f => f.parentId === options.parentId);
    }

    // Return all folders if no filter specified
    return this.folders;
  }

  async createFolder(folderData: schema.InsertDocumentFolder): Promise<schema.DocumentFolder> {
    // Generate UUID for folder
    const id = generateUUID();

    // Set timestamps if not provided
    const now = new Date();
    const input = folderData as any;
    const newFolder = {
      ...folderData,
      id,
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now,
    } as schema.DocumentFolder;

    this.folders.push(newFolder);
    return newFolder;
  }

  async updateFolder(
    id: string,
    folderData: Partial<schema.InsertDocumentFolder>
  ): Promise<schema.DocumentFolder | undefined> {
    const index = this.folders.findIndex(f => f.id === id);
    if (index === -1) return undefined;

    // Update timestamp
    const now = new Date();
    this.folders[index] = {
      ...this.folders[index],
      ...folderData,
      updatedAt: now,
    };

    return this.folders[index];
  }

  async deleteFolder(id: string): Promise<boolean> {
    const initialLength = this.folders.length;
    this.folders = this.folders.filter(f => f.id !== id);
    return initialLength > this.folders.length;
  }

  // CER Report methods
  async getCerReport(
    id: string,
    organizationId: number | string,
  ): Promise<schema.CerReport | undefined> {
    // CerReport has numeric id, but reportId is string
    const orgId = Number(organizationId);
    return this.cerReports.find(
      r => r.reportId === id && Number((r as any).organizationId) === orgId,
    );
  }

  async getCerReports(
    options: {
      limit?: number;
      offset?: number;
      status?: string;
      deviceName?: string;
      search?: string;
    } = {}
  ): Promise<schema.CerReport[]> {
    const { limit = 20, offset = 0, status, deviceName, search } = options;

    // Filter reports based on provided criteria
    let result = [...this.cerReports];

    if (status) {
      result = result.filter(r => r.status === status);
    }

    if (deviceName) {
      result = result.filter(r => r.deviceName.toLowerCase().includes(deviceName.toLowerCase()));
    }

    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        r =>
          r.deviceName.toLowerCase().includes(searchLower) ||
          r.reportId.toLowerCase().includes(searchLower) ||
          (r.deviceManufacturer && r.deviceManufacturer.toLowerCase().includes(searchLower))
      );
    }

    // Sort by updatedAt date (descending)
    result = result.sort((a, b) => {
      const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return dateB - dateA;
    });

    return result.slice(offset, offset + limit);
  }

  async createCerReport(cerReport: schema.InsertCerReport): Promise<schema.CerReport> {
    // Generate numeric id for report
    const id = this.cerReports.length > 0 ? Math.max(...this.cerReports.map(r => r.id)) + 1 : 1;

    // Set timestamps if not provided
    const now = new Date();
    const input = cerReport as any;
    const newReport = {
      ...cerReport,
      id,
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now,
    } as schema.CerReport;

    this.cerReports.push(newReport);
    return newReport;
  }

  async updateCerReport(
    id: string,
    reportData: Partial<schema.InsertCerReport>
  ): Promise<schema.CerReport | undefined> {
    const index = this.cerReports.findIndex(r => r.reportId === id);
    if (index === -1) return undefined;

    // Update timestamp
    const now = new Date();
    this.cerReports[index] = {
      ...this.cerReports[index],
      ...reportData,
      updatedAt: now,
    };

    return this.cerReports[index];
  }

  async deleteCerReport(id: string): Promise<boolean> {
    const initialLength = this.cerReports.length;
    this.cerReports = this.cerReports.filter(r => r.reportId !== id);
    return initialLength > this.cerReports.length;
  }

  // CER Section methods
  async getCerSection(id: string): Promise<schema.CerSection | undefined> {
    return this.cerSections.find(s => s.sectionId === id);
  }

  async getCerSections(
    reportId: string,
    options: { orderBy?: string } = {}
  ): Promise<schema.CerSection[]> {
    // Get sections for the specified report
    let sections = this.cerSections.filter(s => s.reportId === reportId);

    // Sort by order if no other sort is specified
    if (!options.orderBy || options.orderBy === 'order') {
      sections = sections.sort((a, b) => a.order - b.order);
    } else if (options.orderBy === 'title') {
      sections = sections.sort((a, b) => a.title.localeCompare(b.title));
    } else if (options.orderBy === 'updatedAt') {
      sections = sections.sort((a, b) => {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return dateB - dateA;
      });
    }

    return sections;
  }

  async createCerSection(section: schema.InsertCerSection): Promise<schema.CerSection> {
    // Generate numeric id for section
    const id = this.cerSections.length > 0 ? Math.max(...this.cerSections.map(s => s.id)) + 1 : 1;

    // Set timestamps if not provided
    const now = new Date();
    const input = section as any;
    const newSection = {
      ...section,
      id,
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now,
    } as schema.CerSection;

    this.cerSections.push(newSection);
    return newSection;
  }

  async updateCerSection(
    id: string,
    sectionData: Partial<schema.InsertCerSection>
  ): Promise<schema.CerSection | undefined> {
    const index = this.cerSections.findIndex(s => s.sectionId === id);
    if (index === -1) return undefined;

    // Update timestamp
    const now = new Date();
    this.cerSections[index] = {
      ...this.cerSections[index],
      ...sectionData,
      updatedAt: now,
    };

    return this.cerSections[index];
  }

  async deleteCerSection(id: string): Promise<boolean> {
    const initialLength = this.cerSections.length;
    this.cerSections = this.cerSections.filter(s => s.sectionId !== id);
    return initialLength > this.cerSections.length;
  }

  // CER FAERS Data methods
  async getCerFaersData(id: string): Promise<schema.CerFaersData | undefined> {
    return this.cerFaersData.find(f => f.faersId === id);
  }

  async getCerFaersDataByReportId(reportId: string): Promise<schema.CerFaersData[]> {
    return this.cerFaersData.filter(f => f.reportId === reportId);
  }

  async createCerFaersData(faersData: schema.InsertCerFaersData): Promise<schema.CerFaersData> {
    // Generate numeric id for FAERS data
    const id = this.cerFaersData.length > 0 ? Math.max(...this.cerFaersData.map(f => f.id)) + 1 : 1;

    // Set timestamps if not provided
    const now = new Date();
    const input = faersData as any;
    const newFaersData = {
      ...faersData,
      id,
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now,
    } as schema.CerFaersData;

    this.cerFaersData.push(newFaersData);
    return newFaersData;
  }

  async updateCerFaersData(
    id: string,
    faersData: Partial<schema.InsertCerFaersData>
  ): Promise<schema.CerFaersData | undefined> {
    const index = this.cerFaersData.findIndex(f => f.faersId === id);
    if (index === -1) return undefined;

    // Update timestamp
    const now = new Date();
    this.cerFaersData[index] = {
      ...this.cerFaersData[index],
      ...faersData,
      updatedAt: now,
    };

    return this.cerFaersData[index];
  }

  // CER Literature methods
  async getCerLiterature(id: string): Promise<schema.CerLiterature | undefined> {
    return this.cerLiterature.find(l => l.literatureId === id);
  }

  async getCerLiteratureByReportId(
    reportId: string,
    options: {
      limit?: number;
      offset?: number;
      relevanceThreshold?: number;
      includedOnly?: boolean;
    } = {}
  ): Promise<schema.CerLiterature[]> {
    const { limit = 50, offset = 0, relevanceThreshold = 0, includedOnly = false } = options;

    // Filter literature entries
    let result = this.cerLiterature.filter(l => l.reportId === reportId);

    if (relevanceThreshold > 0) {
      result = result.filter(l => (l.relevanceScore || 0) >= relevanceThreshold);
    }

    if (includedOnly) {
      result = result.filter(l => l.included);
    }

    // Sort by relevance score (descending)
    result = result.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    return result.slice(offset, offset + limit);
  }

  async createCerLiterature(literature: schema.InsertCerLiterature): Promise<schema.CerLiterature> {
    // Generate numeric id for literature
    const id =
      this.cerLiterature.length > 0 ? Math.max(...this.cerLiterature.map(l => l.id)) + 1 : 1;

    // Set timestamps if not provided
    const now = new Date();
    const input = literature as any;
    const newLiterature = {
      ...literature,
      id,
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now,
    } as schema.CerLiterature;

    this.cerLiterature.push(newLiterature);
    return newLiterature;
  }

  async updateCerLiterature(
    id: string,
    literature: Partial<schema.InsertCerLiterature>
  ): Promise<schema.CerLiterature | undefined> {
    const index = this.cerLiterature.findIndex(l => l.literatureId === id);
    if (index === -1) return undefined;

    // Update timestamp
    const now = new Date();
    this.cerLiterature[index] = {
      ...this.cerLiterature[index],
      ...literature,
      updatedAt: now,
    };

    return this.cerLiterature[index];
  }

  // CER Compliance methods
  async getCerComplianceCheck(id: string): Promise<schema.CerComplianceCheck | undefined> {
    return this.cerComplianceChecks.find(c => c.checkId === id);
  }

  async getCerComplianceChecksByReportId(reportId: string): Promise<schema.CerComplianceCheck[]> {
    // Get compliance checks for the specified report, sorted by date (newest first)
    return this.cerComplianceChecks
      .filter(c => c.reportId === reportId)
      .sort((a, b) => {
        const dateA = a.checkedAt ? new Date(a.checkedAt).getTime() : 0;
        const dateB = b.checkedAt ? new Date(b.checkedAt).getTime() : 0;
        return dateB - dateA;
      });
  }

  async createCerComplianceCheck(
    check: schema.InsertCerComplianceCheck
  ): Promise<schema.CerComplianceCheck> {
    // Generate numeric id for compliance check
    const id =
      this.cerComplianceChecks.length > 0
        ? Math.max(...this.cerComplianceChecks.map(c => c.id)) + 1
        : 1;

    // Set timestamps if not provided
    const now = new Date();
    const checkPayload = check as Partial<schema.CerComplianceCheck>;
    const newCheck = {
      ...check,
      id,
      checkedAt: checkPayload.checkedAt || now,
      createdAt: checkPayload.createdAt || now,
      updatedAt: checkPayload.updatedAt || now,
    } as schema.CerComplianceCheck;

    this.cerComplianceChecks.push(newCheck);
    return newCheck;
  }

  async updateCerComplianceCheck(
    id: string,
    check: Partial<schema.InsertCerComplianceCheck>
  ): Promise<schema.CerComplianceCheck | undefined> {
    const index = this.cerComplianceChecks.findIndex(c => c.checkId === id);
    if (index === -1) return undefined;

    // Update timestamp
    const now = new Date();
    this.cerComplianceChecks[index] = {
      ...this.cerComplianceChecks[index],
      ...check,
      updatedAt: now,
    };

    return this.cerComplianceChecks[index];
  }

  // CER Workflow methods
  async getCerWorkflow(id: string): Promise<schema.CerWorkflow | undefined> {
    return this.cerWorkflows.find(w => w.workflowId === id);
  }

  async getCerWorkflowByReportId(reportId: string): Promise<schema.CerWorkflow | undefined> {
    return this.cerWorkflows.find(w => w.reportId === reportId);
  }

  async createCerWorkflow(workflow: schema.InsertCerWorkflow): Promise<schema.CerWorkflow> {
    // Generate numeric id for workflow
    const id = this.cerWorkflows.length > 0 ? Math.max(...this.cerWorkflows.map(w => w.id)) + 1 : 1;

    // Set timestamps if not provided
    const now = new Date();
    const input = workflow as any;
    const newWorkflow = {
      ...workflow,
      id,
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now,
    } as schema.CerWorkflow;

    this.cerWorkflows.push(newWorkflow);
    return newWorkflow;
  }

  async updateCerWorkflow(
    id: string,
    workflow: Partial<schema.InsertCerWorkflow>
  ): Promise<schema.CerWorkflow | undefined> {
    const index = this.cerWorkflows.findIndex(w => w.workflowId === id);
    if (index === -1) return undefined;

    // Update timestamp
    const now = new Date();
    this.cerWorkflows[index] = {
      ...this.cerWorkflows[index],
      ...workflow,
      updatedAt: now,
    };

    return this.cerWorkflows[index];
  }

  // CER Export methods
  async getCerExport(id: string): Promise<schema.CerExport | undefined> {
    return this.cerExports.find(e => e.exportId === id);
  }

  async getCerExportsByReportId(reportId: string): Promise<schema.CerExport[]> {
    // Get exports for the specified report, sorted by date (newest first)
    return this.cerExports
      .filter(e => e.reportId === reportId)
      .sort((a, b) => {
        const dateA = a.exportedAt ? new Date(a.exportedAt).getTime() : 0;
        const dateB = b.exportedAt ? new Date(b.exportedAt).getTime() : 0;
        return dateB - dateA;
      });
  }

  async createCerExport(export_: schema.InsertCerExport): Promise<schema.CerExport> {
    // Generate numeric id for export
    const id = this.cerExports.length > 0 ? Math.max(...this.cerExports.map(e => e.id)) + 1 : 1;

    // Set export date if not provided
    const now = new Date();
    const input = export_ as any;
    const newExport = {
      ...export_,
      id,
      createdAt: input.createdAt || now,
    } as schema.CerExport;

    this.cerExports.push(newExport);
    return newExport;
  }

  // QC Specification methods
  async getQcSpecifications(params: {
    organizationId: number;
    clientWorkspaceId: number;
  }): Promise<any[]> {
    return [];
  }

  async getQcSpecification(id: number): Promise<any | undefined> {
    return undefined;
  }

  async createQcSpecification(spec: any): Promise<any> {
    return spec;
  }

  async updateQcSpecification(id: number, spec: any): Promise<any> {
    return spec;
  }

  async createSpecificationVersion(
    id: number,
    changeReason: string,
    changeDescription: string
  ): Promise<any> {
    return {};
  }

  async getSpecificationVersions(id: number): Promise<any[]> {
    return [];
  }

  // OOS Investigation methods
  async getOosInvestigations(params: {
    organizationId: number;
    clientWorkspaceId: number;
    status?: string;
    priority?: string;
  }): Promise<any[]> {
    return [];
  }

  async getOosInvestigation(id: number): Promise<any | undefined> {
    return undefined;
  }

  async createOosInvestigation(investigation: any): Promise<any> {
    return investigation;
  }

  async updateOosInvestigation(id: number, investigation: any): Promise<any> {
    return investigation;
  }

  async addOosTimelineEvent(id: number, event: any): Promise<any> {
    return event;
  }

  async performRootCauseAnalysis(id: number, analysis: any): Promise<any> {
    return analysis;
  }

  async linkCapaToOos(id: number, capa: any): Promise<any> {
    return capa;
  }

  // Batch Release methods
  async getBatchReleases(params: {
    organizationId: number;
    clientWorkspaceId: number;
    releaseStatus?: string;
  }): Promise<any[]> {
    return [];
  }

  async getBatchRelease(id: number): Promise<any | undefined> {
    return undefined;
  }

  async createBatchRelease(release: any): Promise<any> {
    return release;
  }

  async updateBatchRelease(id: number, release: any): Promise<any> {
    return release;
  }

  async reviewBatchRecord(id: number, review: any): Promise<any> {
    return review;
  }

  async generateCertificateOfAnalysis(id: number): Promise<any> {
    return {};
  }

  async getBatchGenealogy(id: number): Promise<any> {
    return {};
  }

  async validateReleaseCriteria(id: number): Promise<any> {
    return { valid: true };
  }

  async releaseBatch(id: number, params: any): Promise<any> {
    return { released: true };
  }

  // QC Deviation methods
  async getQcDeviations(params: {
    organizationId: number;
    clientWorkspaceId: number;
    deviationType?: string;
    severity?: string;
  }): Promise<any[]> {
    return [];
  }

  async getQcDeviation(id: number): Promise<any | undefined> {
    return undefined;
  }

  async createQcDeviation(deviation: any): Promise<any> {
    return deviation;
  }

  async updateQcDeviation(id: number, deviation: any): Promise<any> {
    return deviation;
  }

  async performImpactAssessment(id: number, assessment: any): Promise<any> {
    return assessment;
  }

  async linkCapaToDeviation(id: number, capa: any): Promise<any> {
    return capa;
  }

  async getDeviationTrending(params: any): Promise<any> {
    return { trends: [] };
  }

  // Microbiological Test methods
  async getMicrobiologicalTests(params: {
    organizationId: number;
    clientWorkspaceId: number;
    testType?: string;
    sampleType?: string;
  }): Promise<any[]> {
    return [];
  }

  async getMicrobiologicalTest(id: number): Promise<any | undefined> {
    return undefined;
  }

  async createMicrobiologicalTest(test: any): Promise<any> {
    return test;
  }

  async updateMicrobiologicalTest(id: number, test: any): Promise<any> {
    return test;
  }

  async getEnvironmentalMonitoringSchedule(params: any): Promise<any> {
    return { schedule: [] };
  }

  async createEnvironmentalMonitoringSchedule(schedule: any): Promise<any> {
    return schedule;
  }

  async recordMicrobiologicalResults(id: number, results: any): Promise<any> {
    return results;
  }

  // Reference Standard methods
  async getReferenceStandards(params: {
    organizationId: number;
    clientWorkspaceId: number;
    standardType?: string;
    status?: string;
  }): Promise<any[]> {
    return [];
  }

  async getReferenceStandard(id: number): Promise<any | undefined> {
    return undefined;
  }

  async createReferenceStandard(standard: any): Promise<any> {
    return standard;
  }

  async updateReferenceStandard(id: number, standard: any): Promise<any> {
    return standard;
  }

  async recordStandardUsage(id: number, usage: any): Promise<any> {
    return usage;
  }

  async getExpiringStandards(params: any): Promise<any[]> {
    return [];
  }

  async qualifyReferenceStandard(id: number, qualification: any): Promise<any> {
    return qualification;
  }

  async disposeReferenceStandard(id: number, disposal: any): Promise<any> {
    return disposal;
  }

  async getStandardUsageLogs(id: number): Promise<any[]> {
    return [];
  }

  // Section Graph methods - in-memory implementation
  async getSection(
    id: number,
    organizationId: number | string,
  ): Promise<schema.Section | undefined> {
    const orgId = Number(organizationId);
    return this.sections.find(
      s => s.id === id && Number((s as any).organizationId) === orgId,
    );
  }

  async getSections(
    options: {
      organizationId?: number;
      clientWorkspaceId?: number;
      canonical?: boolean;
      regionScope?: string;
      search?: string;
    } = {}
  ): Promise<schema.Section[]> {
    let result = this.sections;

    if (options.organizationId) {
      result = result.filter(s => s.organizationId === options.organizationId);
    }
    if (options.canonical !== undefined) {
      result = result.filter(s => (s as any).canonical === options.canonical);
    }
    if (options.regionScope) {
      result = result.filter(s => (s as any).regionScope === options.regionScope);
    }
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      result = result.filter(s => {
        const title = (s.title ?? '').toLowerCase();
        const slug = String((s as any).slug ?? '').toLowerCase();
        return title.includes(searchLower) || slug.includes(searchLower);
      });
    }

    return result;
  }

  async createSection(section: schema.InsertSection): Promise<schema.Section> {
    const id = this.sections.length > 0 ? Math.max(...this.sections.map(s => s.id)) + 1 : 1;
    const newSection = {
      ...section,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as schema.Section;
    this.sections.push(newSection);
    return newSection;
  }

  async updateSection(
    id: number,
    sectionData: Partial<schema.InsertSection>
  ): Promise<schema.Section | undefined> {
    const index = this.sections.findIndex(s => s.id === id);
    if (index === -1) return undefined;

    this.sections[index] = {
      ...this.sections[index],
      ...sectionData,
      updatedAt: new Date(),
    };
    return this.sections[index];
  }

  async deleteSection(id: number): Promise<boolean> {
    const initialLength = this.sections.length;
    this.sections = this.sections.filter(s => s.id !== id);
    return initialLength > this.sections.length;
  }

  // Document Section methods
  async getDocumentSection(id: number): Promise<schema.DocumentSection | undefined> {
    return this.documentSections.find(ds => ds.id === id);
  }

  async getDocumentSections(documentId: number): Promise<schema.DocumentSection[]> {
    return this.documentSections
      .filter(ds => ds.documentId === documentId)
      .sort((a, b) => a.position - b.position);
  }

  async createDocumentSection(
    docSection: schema.InsertDocumentSection
  ): Promise<schema.DocumentSection> {
    const id =
      this.documentSections.length > 0
        ? Math.max(...this.documentSections.map(ds => ds.id)) + 1
        : 1;
    const newDocSection = {
      ...docSection,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as schema.DocumentSection;
    this.documentSections.push(newDocSection);
    return newDocSection;
  }

  async updateDocumentSection(
    id: number,
    data: Partial<schema.InsertDocumentSection>
  ): Promise<schema.DocumentSection | undefined> {
    const index = this.documentSections.findIndex(ds => ds.id === id);
    if (index === -1) return undefined;

    this.documentSections[index] = {
      ...this.documentSections[index],
      ...data,
      updatedAt: new Date(),
    };
    return this.documentSections[index];
  }

  async deleteDocumentSection(id: number): Promise<boolean> {
    const initialLength = this.documentSections.length;
    this.documentSections = this.documentSections.filter(ds => ds.id !== id);
    return initialLength > this.documentSections.length;
  }

  async reorderDocumentSections(documentId: number, sectionIds: number[]): Promise<boolean> {
    const docSections = this.documentSections.filter(ds => ds.documentId === documentId);
    sectionIds.forEach((sectionId, index) => {
      const section = docSections.find(ds => ds.sectionId === sectionId);
      if (section) {
        section.position = index;
      }
    });
    return true;
  }

  // Section Leaf methods
  async getSectionLeaf(
    id: number,
    organizationId: number | string,
  ): Promise<schema.SectionLeaf | undefined> {
    const orgId = Number(organizationId);
    return this.sectionLeaves.find(
      sl => sl.id === id && Number((sl as any).organizationId) === orgId,
    );
  }

  async getSectionLeaves(
    options: {
      organizationId?: number;
      clientWorkspaceId?: number;
      status?: string;
    } = {}
  ): Promise<schema.SectionLeaf[]> {
    let result = this.sectionLeaves;

    if (options.organizationId) {
      result = result.filter(sl => sl.organizationId === options.organizationId);
    }
    if (options.status) {
      result = result.filter(sl => sl.status === options.status);
    }

    return result;
  }

  async createSectionLeaf(leaf: schema.InsertSectionLeaf): Promise<schema.SectionLeaf> {
    const id =
      this.sectionLeaves.length > 0 ? Math.max(...this.sectionLeaves.map(sl => sl.id)) + 1 : 1;
    const newLeaf = {
      ...leaf,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as schema.SectionLeaf;
    this.sectionLeaves.push(newLeaf);
    return newLeaf;
  }

  async updateSectionLeaf(
    id: number,
    leafData: Partial<schema.InsertSectionLeaf>
  ): Promise<schema.SectionLeaf | undefined> {
    const index = this.sectionLeaves.findIndex(sl => sl.id === id);
    if (index === -1) return undefined;

    this.sectionLeaves[index] = {
      ...this.sectionLeaves[index],
      ...leafData,
      updatedAt: new Date(),
    };
    return this.sectionLeaves[index];
  }

  async deleteSectionLeaf(id: number): Promise<boolean> {
    const initialLength = this.sectionLeaves.length;
    this.sectionLeaves = this.sectionLeaves.filter(sl => sl.id !== id);
    return initialLength > this.sectionLeaves.length;
  }

  // Patch methods
  async getPatch(id: number): Promise<schema.Patch | undefined> {
    return this.patches.find(p => p.id === id);
  }

  async getPatches(leafId: number, options: { limit?: number } = {}): Promise<schema.Patch[]> {
    const patches = this.patches
      .filter(p => p.leafId === leafId)
      .sort((a, b) => b.version - a.version);

    if (options.limit) {
      return patches.slice(0, options.limit);
    }
    return patches;
  }

  async createPatch(patch: schema.InsertPatch): Promise<schema.Patch> {
    const id = this.patches.length > 0 ? Math.max(...this.patches.map(p => p.id)) + 1 : 1;
    const newPatch = {
      ...patch,
      id,
      createdAt: new Date(),
    } as schema.Patch;
    this.patches.push(newPatch);
    return newPatch;
  }

  async applyPatch(patchId: number): Promise<boolean> {
    const patch = this.patches.find(p => p.id === patchId);
    if (!patch) return false;

    const leaf = this.sectionLeaves.find(sl => sl.id === patch.leafId);
    if (!leaf) return false;

    leaf.latestPatchId = patchId;
    leaf.updatedAt = new Date();
    return true;
  }

  async revertPatch(patchId: number): Promise<boolean> {
    const patch = this.patches.find(p => p.id === patchId);
    if (!patch) return false;

    // Find the previous patch
    const previousPatch = this.patches
      .filter(p => p.leafId === patch.leafId && p.version < patch.version)
      .sort((a, b) => b.version - a.version)[0];

    if (!previousPatch) return false;

    const leaf = this.sectionLeaves.find(sl => sl.id === patch.leafId);
    if (!leaf) return false;

    leaf.latestPatchId = previousPatch.id;
    leaf.updatedAt = new Date();
    return true;
  }

  // Link Edge methods
  async getLinkEdge(id: number): Promise<schema.LinkEdge | undefined> {
    return this.linkEdges.find(le => le.id === id);
  }

  async getLinkEdges(
    sectionId: number,
    direction: 'source' | 'target' | 'both' = 'both'
  ): Promise<schema.LinkEdge[]> {
    if (direction === 'source') {
      return this.linkEdges.filter(le => le.sourceSectionId === sectionId);
    }
    if (direction === 'target') {
      return this.linkEdges.filter(le => le.targetSectionId === sectionId);
    }
    return this.linkEdges.filter(
      le => le.sourceSectionId === sectionId || le.targetSectionId === sectionId
    );
  }

  async createLinkEdge(edge: schema.InsertLinkEdge): Promise<schema.LinkEdge> {
    const id = this.linkEdges.length > 0 ? Math.max(...this.linkEdges.map(le => le.id)) + 1 : 1;
    const newEdge = {
      ...edge,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as schema.LinkEdge;
    this.linkEdges.push(newEdge);
    return newEdge;
  }

  async updateLinkEdge(
    id: number,
    edgeData: Partial<schema.InsertLinkEdge>
  ): Promise<schema.LinkEdge | undefined> {
    const index = this.linkEdges.findIndex(le => le.id === id);
    if (index === -1) return undefined;

    this.linkEdges[index] = {
      ...this.linkEdges[index],
      ...edgeData,
      updatedAt: new Date(),
    };
    return this.linkEdges[index];
  }

  async deleteLinkEdge(id: number): Promise<boolean> {
    const initialLength = this.linkEdges.length;
    this.linkEdges = this.linkEdges.filter(le => le.id !== id);
    return initialLength > this.linkEdges.length;
  }

  async getSectionGraph(sectionId: number, depth: number = 2): Promise<any> {
    const visited = new Set<number>();
    const buildGraph = (id: number, currentDepth: number): any => {
      if (currentDepth === 0 || visited.has(id)) return null;
      visited.add(id);

      const section = this.sections.find(s => s.id === id);
      if (!section) return null;

      const edges = this.linkEdges.filter(le => le.sourceSectionId === id);
      const connections = edges
        .map(edge => {
          const target = buildGraph(edge.targetSectionId, currentDepth - 1);
          return { edge, target };
        })
        .filter(c => c.target !== null);

      return { section, connections };
    };

    return buildGraph(sectionId, depth);
  }

  // Sync Status methods
  async getSyncStatus(
    entityType: string,
    entityId: number
  ): Promise<schema.SyncStatus | undefined> {
    return this.syncStatuses.find(ss => ss.entityType === entityType && ss.entityId === entityId);
  }

  async getSyncStatuses(
    options: {
      status?: string;
      entityType?: string;
      organizationId?: number;
    } = {}
  ): Promise<schema.SyncStatus[]> {
    let result = this.syncStatuses;

    if (options.status) {
      result = result.filter(ss => ss.status === options.status);
    }
    if (options.entityType) {
      result = result.filter(ss => ss.entityType === options.entityType);
    }
    if (options.organizationId) {
      result = result.filter(ss => ss.organizationId === options.organizationId);
    }

    return result;
  }

  async createSyncStatus(status: schema.InsertSyncStatus): Promise<schema.SyncStatus> {
    const id =
      this.syncStatuses.length > 0 ? Math.max(...this.syncStatuses.map(ss => ss.id)) + 1 : 1;
    const newStatus = {
      ...status,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as schema.SyncStatus;
    this.syncStatuses.push(newStatus);
    return newStatus;
  }

  async updateSyncStatus(
    id: number,
    statusData: Partial<schema.InsertSyncStatus>
  ): Promise<schema.SyncStatus | undefined> {
    const index = this.syncStatuses.findIndex(ss => ss.id === id);
    if (index === -1) return undefined;

    this.syncStatuses[index] = {
      ...this.syncStatuses[index],
      ...statusData,
      updatedAt: new Date(),
    };
    return this.syncStatuses[index];
  }

  async clearSyncStatus(entityType: string, entityId: number): Promise<boolean> {
    const initialLength = this.syncStatuses.length;
    this.syncStatuses = this.syncStatuses.filter(
      ss => !(ss.entityType === entityType && ss.entityId === entityId)
    );
    return initialLength > this.syncStatuses.length;
  }

  // Staff Assignment methods
  async getStaffAssignment(id: number): Promise<schema.StaffAssignment | undefined> {
    return this.staffAssignments.find(sa => sa.id === id);
  }

  async getStaffAssignments(
    options: {
      entityType?: string;
      entityId?: number;
      userId?: number;
      role?: string;
      isActive?: boolean;
    } = {}
  ): Promise<schema.StaffAssignment[]> {
    let result = this.staffAssignments;

    if (options.entityType) {
      result = result.filter(sa => sa.entityType === options.entityType);
    }
    if (options.entityId !== undefined) {
      result = result.filter(sa => sa.entityId === options.entityId);
    }
    if (options.userId !== undefined) {
      result = result.filter(sa => sa.userId === options.userId);
    }
    if (options.role) {
      result = result.filter(sa => sa.role === options.role);
    }
    if (options.isActive !== undefined) {
      result = result.filter(sa => sa.isActive === options.isActive);
    }

    return result;
  }

  async createStaffAssignment(
    assignment: schema.InsertStaffAssignment
  ): Promise<schema.StaffAssignment> {
    const id =
      this.staffAssignments.length > 0
        ? Math.max(...this.staffAssignments.map(sa => sa.id)) + 1
        : 1;
    const newAssignment = {
      ...assignment,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as schema.StaffAssignment;
    this.staffAssignments.push(newAssignment);
    return newAssignment;
  }

  async updateStaffAssignment(
    id: number,
    data: Partial<schema.InsertStaffAssignment>
  ): Promise<schema.StaffAssignment | undefined> {
    const index = this.staffAssignments.findIndex(sa => sa.id === id);
    if (index === -1) return undefined;

    this.staffAssignments[index] = {
      ...this.staffAssignments[index],
      ...data,
      updatedAt: new Date(),
    };
    return this.staffAssignments[index];
  }

  async deleteStaffAssignment(id: number): Promise<boolean> {
    const initialLength = this.staffAssignments.length;
    this.staffAssignments = this.staffAssignments.filter(sa => sa.id !== id);
    return initialLength > this.staffAssignments.length;
  }

  async getEntityPermissions(entityType: string, entityId: number, userId: number): Promise<any> {
    const assignments = this.staffAssignments.filter(
      sa =>
        sa.entityType === entityType &&
        sa.entityId === entityId &&
        sa.userId === userId &&
        sa.isActive
    );

    const permissions = new Set<string>();
    assignments.forEach(a => {
      // Add role-based permissions
      switch (a.role) {
        case 'owner':
          permissions.add('read');
          permissions.add('write');
          permissions.add('delete');
          permissions.add('approve');
          break;
        case 'editor':
          permissions.add('read');
          permissions.add('write');
          break;
        case 'reviewer':
          permissions.add('read');
          permissions.add('comment');
          break;
        case 'approver':
          permissions.add('read');
          permissions.add('approve');
          break;
        case 'viewer':
          permissions.add('read');
          break;
      }

      // Add custom permissions
      if (a.permissions) {
        Object.entries(a.permissions as any).forEach(([key, value]) => {
          if (value === true) {
            permissions.add(key);
          }
        });
      }
    });

    return {
      entityType,
      entityId,
      userId,
      permissions: Array.from(permissions),
      roles: assignments.map(a => a.role),
    };
  }

  // Transaction support for atomic updates
  async runInTransaction<T>(callback: () => Promise<T>): Promise<T> {
    // In-memory storage doesn't need real transactions
    return await callback();
  }

  async healthCheck(): Promise<boolean> {
    return true; // In-memory storage is always healthy
  }
}

/**
 * Database storage implementation
 */
export class DatabaseStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    if (!pool) return undefined;

    try {
      const result = await query('SELECT * FROM users WHERE id = $1', [id]);
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get user', { id, error });
      return undefined;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    if (!pool) return undefined;

    try {
      const result = await query('SELECT * FROM users WHERE username = $1', [username]);
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get user by username', { username, error });
      return undefined;
    }
  }

  async createUser(userData: Omit<User, 'id'>): Promise<User> {
    if (!pool) {
      throw new Error('Database connection not available');
    }

    try {
      const { username, password, email, role, name, subscribed } = userData;
      const result = await query(
        'INSERT INTO users (username, password, email, role, name, subscribed) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [username, password, email, role, name, subscribed]
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create user', { userData, error });
      throw error;
    }
  }

  async updateUser(id: number, userData: Partial<User>): Promise<User | undefined> {
    if (!pool) return undefined;

    try {
      // Build SET clause and values array
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      Object.entries(userData).forEach(([key, value]) => {
        if (key !== 'id') {
          setClauses.push(`${key} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      });

      if (setClauses.length === 0) {
        return this.getUser(id);
      }

      values.push(id); // Add ID as the last parameter

      const result = await query(
        `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update user', { id, userData, error });
      return undefined;
    }
  }

  async deleteUser(id: number): Promise<boolean> {
    if (!pool) return false;

    try {
      const result = await query('DELETE FROM users WHERE id = $1', [id]);
      return result.rowCount > 0;
    } catch (error) {
      logger.error('Failed to delete user', { id, error });
      return false;
    }
  }

  // Trial methods
  async getTrial(id: number): Promise<any | undefined> {
    if (!pool) return undefined;

    try {
      const result = await query('SELECT * FROM trials WHERE id = $1', [id]);
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get trial', { id, error });
      return undefined;
    }
  }

  async getTrials(options: { limit?: number; offset?: number } = {}): Promise<any[]> {
    if (!pool) return [];

    const { limit = 10, offset = 0 } = options;

    try {
      const result = await query('SELECT * FROM trials ORDER BY id DESC LIMIT $1 OFFSET $2', [
        limit,
        offset,
      ]);

      return result.rows;
    } catch (error) {
      logger.error('Failed to get trials', { options, error });
      return [];
    }
  }

  async createTrial(trial: any): Promise<any> {
    if (!pool) {
      throw new Error('Database connection not available');
    }

    try {
      // Dynamically create INSERT statement based on trial object
      const columns = Object.keys(trial).filter(k => k !== 'id');
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      const values = columns.map(col => trial[col]);

      const result = await query(
        `INSERT INTO trials (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        values
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create trial', { trial, error });
      throw error;
    }
  }

  async updateTrial(id: number, trialData: any): Promise<any | undefined> {
    if (!pool) return undefined;

    try {
      // Build SET clause and values array
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      Object.entries(trialData).forEach(([key, value]) => {
        if (key !== 'id') {
          setClauses.push(`${key} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      });

      if (setClauses.length === 0) {
        return this.getTrial(id);
      }

      values.push(id); // Add ID as the last parameter

      const result = await query(
        `UPDATE trials SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update trial', { id, trialData, error });
      return undefined;
    }
  }

  async deleteTrial(id: number): Promise<boolean> {
    if (!pool) return false;

    try {
      const result = await query('DELETE FROM trials WHERE id = $1', [id]);
      return result.rowCount > 0;
    } catch (error) {
      logger.error('Failed to delete trial', { id, error });
      return false;
    }
  }

  // Document methods
  async getDocument(
    id: string,
    organizationId: number | string,
  ): Promise<schema.Document | undefined> {
    if (!db) return undefined;

    try {
      const numericId = Number(id);
      const orgId = Number(organizationId);
      // Tenant-scoped lookup. The org filter is mandatory — a missing
      // or non-finite orgId returns no rows, which is the safe default
      // (better to surface "not found" than to silently widen the
      // query).
      if (!Number.isFinite(orgId)) return undefined;
      const documents = await db
        .select()
        .from(schema.documents)
        .where(
          and(
            eq(schema.documents.id, numericId),
            eq(schema.documents.organizationId, orgId),
          ),
        );
      return documents[0];
    } catch (error) {
      logger.error('Failed to get document', { id, error });
      return undefined;
    }
  }

  async getDocumentByName(name: string): Promise<schema.Document | undefined> {
    if (!db) return undefined;

    try {
      const documents = await db
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.title, name));
      return documents[0];
    } catch (error) {
      logger.error('Failed to get document by name', { name, error });
      return undefined;
    }
  }

  async getDocuments(
    options: {
      limit?: number;
      offset?: number;
      folderId?: string;
      status?: string;
      type?: string;
      search?: string;
    } = {}
  ): Promise<schema.Document[]> {
    if (!db) return [];

    const { limit = 20, offset = 0, status, type, search } = options;

    try {
      const conditions = [] as any[];

      if (status) {
        conditions.push(eq(schema.documents.status, status));
      }

      if (type) {
        conditions.push(eq(schema.documents.documentType, type));
      }

      if (search) {
        conditions.push(
          or(
            like(schema.documents.title, `%${search}%`),
            like(schema.documents.description, `%${search}%`),
            like(schema.documents.documentCode, `%${search}%`)
          )
        );
      }

      const documents = await db
        .select()
        .from(schema.documents)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.documents.updatedAt))
        .limit(limit)
        .offset(offset);
      return documents;
    } catch (error) {
      logger.error('Failed to get documents', { options, error });
      return [];
    }
  }

  async createDocument(documentData: schema.InsertDocument): Promise<schema.Document> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    try {
      const input = documentData as any;
      // Add creation timestamp if not provided
      if (!input.createdAt) {
        input.createdAt = new Date();
      }

      // Add updated timestamp if not provided
      if (!input.updatedAt) {
        input.updatedAt = new Date();
      }

      const results = (await db
        .insert(schema.documents)
        .values(input as any)
        .returning()) as any[];
      return results[0];
    } catch (error) {
      logger.error('Failed to create document', { documentData, error });
      throw error;
    }
  }

  async updateDocument(
    id: string,
    documentData: Partial<schema.InsertDocument>
  ): Promise<schema.Document | undefined> {
    if (!db) return undefined;

    try {
      const numericId = Number(id);
      const data = { ...(documentData as any), updatedAt: new Date() } as any;

      const results = await db
        .update(schema.documents)
        .set(data)
        .where(eq(schema.documents.id, numericId))
        .returning();

      return results[0];
    } catch (error) {
      logger.error('Failed to update document', { id, documentData, error });
      return undefined;
    }
  }

  async deleteDocument(id: string): Promise<boolean> {
    if (!db) return false;

    try {
      const numericId = Number(id);
      const results = await db
        .delete(schema.documents)
        .where(eq(schema.documents.id, numericId))
        .returning({ id: schema.documents.id });

      return results.length > 0;
    } catch (error) {
      logger.error('Failed to delete document', { id, error });
      return false;
    }
  }

  // Document folders methods
  async getFolders(options: { parentId?: string | null } = {}): Promise<schema.DocumentFolder[]> {
    if (!db) return [];

    try {
      const conditions = [] as any[];

      if (options.parentId === null) {
        conditions.push(isNull(schema.documentFolders.parentId));
      } else if (options.parentId) {
        conditions.push(eq(schema.documentFolders.parentId, options.parentId));
      }

      return await db
        .select()
        .from(schema.documentFolders)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(schema.documentFolders.name);
    } catch (error) {
      logger.error('Failed to get folders', { options, error });
      return [];
    }
  }

  async getFolder(
    id: string,
    organizationId: number | string,
  ): Promise<schema.DocumentFolder | undefined> {
    if (!db) return undefined;

    try {
      const numericId = Number(id);
      const orgId = Number(organizationId);
      if (!Number.isFinite(orgId)) return undefined;
      const folders = await db
        .select()
        .from(schema.documentFolders)
        .where(
          and(
            eq(schema.documentFolders.id, numericId),
            eq(schema.documentFolders.organizationId, orgId),
          ),
        );

      return folders[0];
    } catch (error) {
      logger.error('Failed to get folder', { id, error });
      return undefined;
    }
  }

  async createFolder(folderData: schema.InsertDocumentFolder): Promise<schema.DocumentFolder> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    try {
      const data = { ...(folderData as any) } as any;
      // Add timestamps if not provided
      if (!data.createdAt) {
        data.createdAt = new Date();
      }

      if (!data.updatedAt) {
        data.updatedAt = new Date();
      }

      const results = (await db
        .insert(schema.documentFolders)
        .values(data as any)
        .returning()) as any[];

      return results[0];
    } catch (error) {
      logger.error('Failed to create folder', { folderData, error });
      throw error;
    }
  }

  async updateFolder(
    id: string,
    folderData: Partial<schema.InsertDocumentFolder>
  ): Promise<schema.DocumentFolder | undefined> {
    if (!db) return undefined;

    try {
      // Always update the updatedAt timestamp
      const data = { ...(folderData as any), updatedAt: new Date() } as any;
      const numericId = Number(id);

      const [updated] = await db
        .update(schema.documentFolders)
        .set(data)
        .where(eq(schema.documentFolders.id, numericId))
        .returning();

      return updated;
    } catch (error) {
      logger.error('Failed to update folder', { id, folderData, error });
      return undefined;
    }
  }

  async deleteFolder(id: string): Promise<boolean> {
    if (!db) return false;

    try {
      // Delete the folder
      const numericId = Number(id);
      const results = await db
        .delete(schema.documentFolders)
        .where(eq(schema.documentFolders.id, numericId))
        .returning({ id: schema.documentFolders.id });

      return results.length > 0;
    } catch (error) {
      logger.error('Failed to delete folder', { id, error });
      return false;
    }
  }

  // CER Report methods
  async getCerReport(
    id: string,
    organizationId: number | string,
  ): Promise<schema.CerReport | undefined> {
    if (!db) return undefined;

    try {
      const numericId = Number(id);
      const orgId = Number(organizationId);
      if (!Number.isFinite(orgId)) return undefined;
      const reports = await db
        .select()
        .from(schema.cerReports)
        .where(
          and(
            eq(schema.cerReports.id, numericId),
            eq(schema.cerReports.organizationId, orgId),
          ),
        );
      return reports[0];
    } catch (error) {
      logger.error('Failed to get CER report', { id, error });
      return undefined;
    }
  }

  async getCerReports(
    options: {
      limit?: number;
      offset?: number;
      status?: string;
      deviceName?: string;
      search?: string;
    } = {}
  ): Promise<schema.CerReport[]> {
    if (!db) return [];

    const { limit = 20, offset = 0, status, deviceName, search } = options;

    try {
      const conditions = [] as any[];

      if (status) {
        conditions.push(eq(schema.cerReports.status, status));
      }

      if (deviceName) {
        conditions.push(like(schema.cerReports.deviceName, `%${deviceName}%`));
      }

      if (search) {
        conditions.push(
          or(
            like(schema.cerReports.deviceName, `%${search}%`),
            like(schema.cerReports.deviceManufacturer, `%${search}%`),
            like(schema.cerReports.cerNumber, `%${search}%`)
          )
        );
      }

      const reports = await db
        .select()
        .from(schema.cerReports)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.cerReports.updatedAt))
        .limit(limit)
        .offset(offset);

      return reports;
    } catch (error) {
      logger.error('Failed to get CER reports', { options, error });
      return [];
    }
  }

  async createCerReport(cerReport: schema.InsertCerReport): Promise<schema.CerReport> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    try {
      // Set timestamps if not provided
      const now = new Date();
      const input = cerReport as any;
      const reportData = {
        ...cerReport,
        createdAt: input.createdAt || now,
        updatedAt: input.updatedAt || now,
      };

      const [newReport] = await db
        .insert(schema.cerReports)
        .values(reportData as any)
        .returning();
      return newReport;
    } catch (error) {
      logger.error('Failed to create CER report', { cerReport, error });
      throw error;
    }
  }

  async updateCerReport(
    id: string,
    reportData: Partial<schema.InsertCerReport>
  ): Promise<schema.CerReport | undefined> {
    if (!db) return undefined;

    try {
      const numericId = Number(id);
      // Update timestamp
      const now = new Date();
      const updatedData = {
        ...reportData,
        updatedAt: now,
      };

      const [updatedReport] = await db
        .update(schema.cerReports)
        .set(updatedData)
        .where(eq(schema.cerReports.id, numericId))
        .returning();

      return updatedReport;
    } catch (error) {
      logger.error('Failed to update CER report', { id, reportData, error });
      return undefined;
    }
  }

  async deleteCerReport(id: string): Promise<boolean> {
    if (!db) return false;

    try {
      const numericId = Number(id);
      await db.delete(schema.cerReports).where(eq(schema.cerReports.id, numericId));

      return true;
    } catch (error) {
      logger.error('Failed to delete CER report', { id, error });
      return false;
    }
  }

  // CER Section methods
  async getCerSection(id: string): Promise<schema.CerSection | undefined> {
    if (!db) return undefined;

    try {
      const numericId = Number(id);
      const sections = await db
        .select()
        .from(schema.cerSections)
        .where(eq(schema.cerSections.id, numericId));
      return sections[0];
    } catch (error) {
      logger.error('Failed to get CER section', { id, error });
      return undefined;
    }
  }

  async getCerSections(
    reportId: string,
    options: { orderBy?: string } = {}
  ): Promise<schema.CerSection[]> {
    if (!db) return [];

    try {
      const orderByClause =
        !options.orderBy || options.orderBy === 'order'
          ? schema.cerSections.order
          : options.orderBy === 'title'
            ? schema.cerSections.title
            : desc(schema.cerSections.updatedAt);

      const sections = await db
        .select()
        .from(schema.cerSections)
        .where(eq(schema.cerSections.reportId, reportId))
        .orderBy(orderByClause);
      return sections;
    } catch (error) {
      logger.error('Failed to get CER sections', { reportId, options, error });
      return [];
    }
  }

  async createCerSection(section: schema.InsertCerSection): Promise<schema.CerSection> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    try {
      // Set timestamps if not provided
      const now = new Date();
      const input = section as any;
      const sectionData = {
        ...section,
        createdAt: input.createdAt || now,
        updatedAt: input.updatedAt || now,
      };

      const [newSection] = await db
        .insert(schema.cerSections)
        .values(sectionData as any)
        .returning();
      return newSection;
    } catch (error) {
      logger.error('Failed to create CER section', { section, error });
      throw error;
    }
  }

  async updateCerSection(
    id: string,
    sectionData: Partial<schema.InsertCerSection>
  ): Promise<schema.CerSection | undefined> {
    if (!db) return undefined;

    try {
      const numericId = Number(id);
      // Update timestamp
      const now = new Date();
      const updatedData = {
        ...sectionData,
        updatedAt: now,
      };

      const [updatedSection] = await db
        .update(schema.cerSections)
        .set(updatedData)
        .where(eq(schema.cerSections.id, numericId))
        .returning();

      return updatedSection;
    } catch (error) {
      logger.error('Failed to update CER section', { id, sectionData, error });
      return undefined;
    }
  }

  async deleteCerSection(id: string): Promise<boolean> {
    if (!db) return false;

    try {
      const numericId = Number(id);
      await db.delete(schema.cerSections).where(eq(schema.cerSections.id, numericId));

      return true;
    } catch (error) {
      logger.error('Failed to delete CER section', { id, error });
      return false;
    }
  }

  // CER FAERS Data methods
  async getCerFaersData(id: string): Promise<schema.CerFaersData | undefined> {
    if (!db) return undefined;

    try {
      const numericId = Number(id);
      const data = await db
        .select()
        .from(schema.cerFaersData)
        .where(eq(schema.cerFaersData.id, numericId));
      return data[0];
    } catch (error) {
      logger.error('Failed to get CER FAERS data', { id, error });
      return undefined;
    }
  }

  async getCerFaersDataByReportId(reportId: string): Promise<schema.CerFaersData[]> {
    if (!db) return [];

    try {
      const data = await db
        .select()
        .from(schema.cerFaersData)
        .where(eq(schema.cerFaersData.reportId, reportId));

      return data;
    } catch (error) {
      logger.error('Failed to get CER FAERS data by report ID', { reportId, error });
      return [];
    }
  }

  async createCerFaersData(faersData: schema.InsertCerFaersData): Promise<schema.CerFaersData> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    try {
      // Set timestamps if not provided
      const now = new Date();
      const input = faersData as any;
      const data = {
        ...faersData,
        createdAt: input.createdAt || now,
        updatedAt: input.updatedAt || now,
      };

      const [newData] = await db
        .insert(schema.cerFaersData)
        .values(data as any)
        .returning();
      return newData;
    } catch (error) {
      logger.error('Failed to create CER FAERS data', { faersData, error });
      throw error;
    }
  }

  async updateCerFaersData(
    id: string,
    faersData: Partial<schema.InsertCerFaersData>
  ): Promise<schema.CerFaersData | undefined> {
    if (!db) return undefined;

    try {
      const numericId = Number(id);
      // Update timestamp
      const now = new Date();
      const updatedData = {
        ...faersData,
        updatedAt: now,
      };

      const [updated] = await db
        .update(schema.cerFaersData)
        .set(updatedData)
        .where(eq(schema.cerFaersData.id, numericId))
        .returning();

      return updated;
    } catch (error) {
      logger.error('Failed to update CER FAERS data', { id, faersData, error });
      return undefined;
    }
  }

  // CER Literature methods
  async getCerLiterature(id: string): Promise<schema.CerLiterature | undefined> {
    if (!db) return undefined;

    try {
      const numericId = Number(id);
      const literature = await db
        .select()
        .from(schema.cerLiterature)
        .where(eq(schema.cerLiterature.id, numericId));
      return literature[0];
    } catch (error) {
      logger.error('Failed to get CER literature', { id, error });
      return undefined;
    }
  }

  async getCerLiteratureByReportId(
    reportId: string,
    options: {
      limit?: number;
      offset?: number;
      relevanceThreshold?: number;
      includedOnly?: boolean;
    } = {}
  ): Promise<schema.CerLiterature[]> {
    if (!db) return [];

    const { limit = 50, offset = 0, relevanceThreshold = 0, includedOnly = false } = options;

    try {
      const conditions = [eq(schema.cerLiterature.reportId, reportId)];

      if (relevanceThreshold > 0) {
        conditions.push(
          or(
            isNull(schema.cerLiterature.relevanceScore),
            gte(schema.cerLiterature.relevanceScore, relevanceThreshold)
          ) as any
        );
      }

      if (includedOnly) {
        conditions.push(eq(schema.cerLiterature.included, true));
      }

      const literature = await db
        .select()
        .from(schema.cerLiterature)
        .where(and(...conditions))
        .orderBy(desc(schema.cerLiterature.relevanceScore))
        .limit(limit)
        .offset(offset);

      return literature;
    } catch (error) {
      logger.error('Failed to get CER literature by report ID', { reportId, options, error });
      return [];
    }
  }

  async createCerLiterature(literature: schema.InsertCerLiterature): Promise<schema.CerLiterature> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    try {
      // Set timestamps if not provided
      const now = new Date();
      const input = literature as any;
      const data = {
        ...literature,
        createdAt: input.createdAt || now,
        updatedAt: input.updatedAt || now,
      };

      const [newLiterature] = await db
        .insert(schema.cerLiterature)
        .values(data as any)
        .returning();
      return newLiterature;
    } catch (error) {
      logger.error('Failed to create CER literature', { literature, error });
      throw error;
    }
  }

  async updateCerLiterature(
    id: string,
    literature: Partial<schema.InsertCerLiterature>
  ): Promise<schema.CerLiterature | undefined> {
    if (!db) return undefined;

    try {
      const numericId = Number(id);
      // Update timestamp
      const now = new Date();
      const updatedData = {
        ...literature,
        updatedAt: now,
      };

      const [updated] = await db
        .update(schema.cerLiterature)
        .set(updatedData)
        .where(eq(schema.cerLiterature.id, numericId))
        .returning();

      return updated;
    } catch (error) {
      logger.error('Failed to update CER literature', { id, literature, error });
      return undefined;
    }
  }

  // CER Compliance methods
  async getCerComplianceCheck(id: string): Promise<schema.CerComplianceCheck | undefined> {
    if (!db) return undefined;

    try {
      const numericId = Number(id);
      const checks = await db
        .select()
        .from(schema.cerComplianceChecks)
        .where(eq(schema.cerComplianceChecks.id, numericId));
      return checks[0];
    } catch (error) {
      logger.error('Failed to get CER compliance check', { id, error });
      return undefined;
    }
  }

  async getCerComplianceChecksByReportId(reportId: string): Promise<schema.CerComplianceCheck[]> {
    if (!db) return [];

    try {
      const checks = await db
        .select()
        .from(schema.cerComplianceChecks)
        .where(eq(schema.cerComplianceChecks.reportId, reportId))
        .orderBy(desc(schema.cerComplianceChecks.checkedAt));

      return checks;
    } catch (error) {
      logger.error('Failed to get CER compliance checks by report ID', { reportId, error });
      return [];
    }
  }

  async createCerComplianceCheck(
    check: schema.InsertCerComplianceCheck
  ): Promise<schema.CerComplianceCheck> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    try {
      // Set timestamps if not provided
      const now = new Date();
      const input = check as any;
      const data = {
        ...check,
        checkedAt: input.checkedAt || now,
        createdAt: input.createdAt || now,
        updatedAt: input.updatedAt || now,
      };

      const [newCheck] = await db
        .insert(schema.cerComplianceChecks)
        .values(data as any)
        .returning();
      return newCheck;
    } catch (error) {
      logger.error('Failed to create CER compliance check', { check, error });
      throw error;
    }
  }

  async updateCerComplianceCheck(
    id: string,
    check: Partial<schema.InsertCerComplianceCheck>
  ): Promise<schema.CerComplianceCheck | undefined> {
    if (!db) return undefined;

    try {
      // Update timestamp
      const now = new Date();
      const updatedData = {
        ...check,
        updatedAt: now,
      };

      const numericId = Number(id);
      const [updated] = await db
        .update(schema.cerComplianceChecks)
        .set(updatedData)
        .where(eq(schema.cerComplianceChecks.id, numericId))
        .returning();

      return updated;
    } catch (error) {
      logger.error('Failed to update CER compliance check', { id, check, error });
      return undefined;
    }
  }

  // CER Workflow methods
  async getCerWorkflow(id: string): Promise<schema.CerWorkflow | undefined> {
    if (!db) return undefined;

    try {
      const numericId = Number(id);
      const workflows = await db
        .select()
        .from(schema.cerWorkflows)
        .where(eq(schema.cerWorkflows.id, numericId));
      return workflows[0];
    } catch (error) {
      logger.error('Failed to get CER workflow', { id, error });
      return undefined;
    }
  }

  async getCerWorkflowByReportId(reportId: string): Promise<schema.CerWorkflow | undefined> {
    if (!db) return undefined;

    try {
      const workflows = await db
        .select()
        .from(schema.cerWorkflows)
        .where(eq(schema.cerWorkflows.reportId, reportId));

      return workflows[0]; // There should only be one workflow per report
    } catch (error) {
      logger.error('Failed to get CER workflow by report ID', { reportId, error });
      return undefined;
    }
  }

  async createCerWorkflow(workflow: schema.InsertCerWorkflow): Promise<schema.CerWorkflow> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    try {
      // Set timestamps if not provided
      const data = {
        ...workflow,
      };

      const [newWorkflow] = await db
        .insert(schema.cerWorkflows)
        .values(data as any)
        .returning();
      return newWorkflow;
    } catch (error) {
      logger.error('Failed to create CER workflow', { workflow, error });
      throw error;
    }
  }

  async updateCerWorkflow(
    id: string,
    workflow: Partial<schema.InsertCerWorkflow>
  ): Promise<schema.CerWorkflow | undefined> {
    if (!db) return undefined;

    try {
      // Update timestamp
      const updatedData = {
        ...workflow,
        updatedAt: new Date(),
      };

      const numericId = Number(id);
      const [updated] = await db
        .update(schema.cerWorkflows)
        .set(updatedData)
        .where(eq(schema.cerWorkflows.id, numericId))
        .returning();

      return updated;
    } catch (error) {
      logger.error('Failed to update CER workflow', { id, workflow, error });
      return undefined;
    }
  }

  // CER Export methods
  async getCerExport(id: string): Promise<schema.CerExport | undefined> {
    if (!db) return undefined;

    try {
      const numericId = Number(id);
      const exports = await db
        .select()
        .from(schema.cerExports)
        .where(eq(schema.cerExports.id, numericId));
      return exports[0];
    } catch (error) {
      logger.error('Failed to get CER export', { id, error });
      return undefined;
    }
  }

  async getCerExportsByReportId(reportId: string): Promise<schema.CerExport[]> {
    if (!db) return [];

    try {
      const exports = await db
        .select()
        .from(schema.cerExports)
        .where(eq(schema.cerExports.reportId, reportId))
        .orderBy(desc(schema.cerExports.exportedAt));

      return exports;
    } catch (error) {
      logger.error('Failed to get CER exports by report ID', { reportId, error });
      return [];
    }
  }

  async createCerExport(export_: schema.InsertCerExport): Promise<schema.CerExport> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    try {
      // Set export date if not provided
      const now = new Date();
      const input = export_ as any;
      const data = {
        ...export_,
        exportedAt: input.exportedAt || now,
      };

      const [newExport] = await db
        .insert(schema.cerExports)
        .values(data as any)
        .returning();
      return newExport;
    } catch (error) {
      logger.error('Failed to create CER export', { export_, error });
      throw error;
    }
  }

  // Module Subscription methods
  async getAvailableModules(): Promise<schema.AvailableModule[]> {
    if (!db) return [];

    try {
      const modules = await db
        .select()
        .from(schema.availableModules)
        .orderBy(schema.availableModules.sortOrder, schema.availableModules.name);
      return modules;
    } catch (error) {
      logger.error('Failed to get available modules', { error });
      return [];
    }
  }

  async getAvailableModule(moduleId: string): Promise<schema.AvailableModule | undefined> {
    if (!db) return undefined;

    try {
      const modules = await db
        .select()
        .from(schema.availableModules)
        .where(eq(schema.availableModules.moduleId, moduleId));
      return modules[0];
    } catch (error) {
      logger.error('Failed to get available module', { moduleId, error });
      return undefined;
    }
  }

  async createAvailableModule(
    module: schema.InsertAvailableModule
  ): Promise<schema.AvailableModule> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    try {
      const [newModule] = await db
        .insert(schema.availableModules)
        .values(module as any)
        .returning();
      return newModule;
    } catch (error) {
      logger.error('Failed to create available module', { module, error });
      throw error;
    }
  }

  async updateAvailableModule(
    moduleId: string,
    moduleData: Partial<schema.InsertAvailableModule>
  ): Promise<schema.AvailableModule | undefined> {
    if (!db) return undefined;

    try {
      const [updated] = await db
        .update(schema.availableModules)
        .set({ ...moduleData, updatedAt: new Date() })
        .where(eq(schema.availableModules.moduleId, moduleId))
        .returning();
      return updated;
    } catch (error) {
      logger.error('Failed to update available module', { moduleId, moduleData, error });
      return undefined;
    }
  }

  async deleteAvailableModule(moduleId: string): Promise<boolean> {
    if (!db) return false;

    try {
      await db
        .delete(schema.availableModules)
        .where(eq(schema.availableModules.moduleId, moduleId));
      return true;
    } catch (error) {
      logger.error('Failed to delete available module', { moduleId, error });
      return false;
    }
  }

  async getModuleSubscriptions(organizationId: number): Promise<schema.ModuleSubscription[]> {
    if (!db) return [];

    try {
      const subscriptions = await db
        .select()
        .from(schema.moduleSubscriptions)
        .where(eq(schema.moduleSubscriptions.organizationId, organizationId));
      return subscriptions;
    } catch (error) {
      logger.error('Failed to get module subscriptions', { organizationId, error });
      return [];
    }
  }

  async getModuleSubscription(
    organizationId: number,
    moduleId: string
  ): Promise<schema.ModuleSubscription | undefined> {
    if (!db) return undefined;

    try {
      const subscriptions = await db
        .select()
        .from(schema.moduleSubscriptions)
        .where(
          and(
            eq(schema.moduleSubscriptions.organizationId, organizationId),
            eq(schema.moduleSubscriptions.moduleId, moduleId)
          )
        );
      return subscriptions[0];
    } catch (error) {
      logger.error('Failed to get module subscription', { organizationId, moduleId, error });
      return undefined;
    }
  }

  async createModuleSubscription(
    subscription: schema.InsertModuleSubscription
  ): Promise<schema.ModuleSubscription> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    try {
      const [newSubscription] = await db
        .insert(schema.moduleSubscriptions)
        .values(subscription as any)
        .returning();
      return newSubscription;
    } catch (error) {
      logger.error('Failed to create module subscription', { subscription, error });
      throw error;
    }
  }

  async updateModuleSubscription(
    organizationId: number,
    moduleId: string,
    subscriptionData: Partial<schema.InsertModuleSubscription>
  ): Promise<schema.ModuleSubscription | undefined> {
    if (!db) return undefined;

    try {
      const [updated] = await db
        .update(schema.moduleSubscriptions)
        .set({ ...subscriptionData, updatedAt: new Date() })
        .where(
          and(
            eq(schema.moduleSubscriptions.organizationId, organizationId),
            eq(schema.moduleSubscriptions.moduleId, moduleId)
          )
        )
        .returning();
      return updated;
    } catch (error) {
      logger.error('Failed to update module subscription', {
        organizationId,
        moduleId,
        subscriptionData,
        error,
      });
      return undefined;
    }
  }

  async deleteModuleSubscription(organizationId: number, moduleId: string): Promise<boolean> {
    if (!db) return false;

    try {
      await db
        .delete(schema.moduleSubscriptions)
        .where(
          and(
            eq(schema.moduleSubscriptions.organizationId, organizationId),
            eq(schema.moduleSubscriptions.moduleId, moduleId)
          )
        );
      return true;
    } catch (error) {
      logger.error('Failed to delete module subscription', { organizationId, moduleId, error });
      return false;
    }
  }

  async bulkUpdateModuleSubscriptions(
    organizationId: number,
    modules: { moduleId: string; enabled: boolean }[]
  ): Promise<schema.ModuleSubscription[]> {
    if (!db) return [];

    try {
      const results: schema.ModuleSubscription[] = [];
      const now = new Date();

      for (const module of modules) {
        // Check if subscription exists
        const existing = await this.getModuleSubscription(organizationId, module.moduleId);

        if (existing) {
          // Update existing subscription
          const updated = await this.updateModuleSubscription(organizationId, module.moduleId, {
            enabled: module.enabled,
            enabledAt: module.enabled ? now : existing.enabledAt,
            disabledAt: !module.enabled ? now : existing.disabledAt,
          });
          if (updated) results.push(updated);
        } else {
          // Create new subscription
          const created = await this.createModuleSubscription({
            organizationId,
            moduleId: module.moduleId,
            enabled: module.enabled,
            enabledAt: module.enabled ? now : null,
            disabledAt: !module.enabled ? now : null,
          });
          results.push(created);
        }
      }

      return results;
    } catch (error) {
      logger.error('Failed to bulk update module subscriptions', {
        organizationId,
        modules,
        error,
      });
      return [];
    }
  }

  // QC Specification methods
  async getQcSpecifications(params: {
    organizationId: number;
    clientWorkspaceId: number;
  }): Promise<any[]> {
    return [];
  }

  async getQcSpecification(id: number): Promise<any | undefined> {
    return undefined;
  }

  async createQcSpecification(spec: any): Promise<any> {
    return spec;
  }

  async updateQcSpecification(id: number, spec: any): Promise<any> {
    return spec;
  }

  async createSpecificationVersion(
    id: number,
    changeReason: string,
    changeDescription: string
  ): Promise<any> {
    return {};
  }

  async getSpecificationVersions(id: number): Promise<any[]> {
    return [];
  }

  // OOS Investigation methods
  async getOosInvestigations(params: {
    organizationId: number;
    clientWorkspaceId: number;
    status?: string;
    priority?: string;
  }): Promise<any[]> {
    return [];
  }

  async getOosInvestigation(id: number): Promise<any | undefined> {
    return undefined;
  }

  async createOosInvestigation(investigation: any): Promise<any> {
    return investigation;
  }

  async updateOosInvestigation(id: number, investigation: any): Promise<any> {
    return investigation;
  }

  async addOosTimelineEvent(id: number, event: any): Promise<any> {
    return event;
  }

  async performRootCauseAnalysis(id: number, analysis: any): Promise<any> {
    return analysis;
  }

  async linkCapaToOos(id: number, capa: any): Promise<any> {
    return capa;
  }

  // Batch Release methods
  async getBatchReleases(params: {
    organizationId: number;
    clientWorkspaceId: number;
    releaseStatus?: string;
  }): Promise<any[]> {
    return [];
  }

  async getBatchRelease(id: number): Promise<any | undefined> {
    return undefined;
  }

  async createBatchRelease(release: any): Promise<any> {
    return release;
  }

  async updateBatchRelease(id: number, release: any): Promise<any> {
    return release;
  }

  async reviewBatchRecord(id: number, review: any): Promise<any> {
    return review;
  }

  async generateCertificateOfAnalysis(id: number): Promise<any> {
    return {};
  }

  async getBatchGenealogy(id: number): Promise<any> {
    return {};
  }

  async validateReleaseCriteria(id: number): Promise<any> {
    return { valid: true };
  }

  async releaseBatch(id: number, params: any): Promise<any> {
    return { released: true };
  }

  // QC Deviation methods
  async getQcDeviations(params: {
    organizationId: number;
    clientWorkspaceId: number;
    deviationType?: string;
    severity?: string;
  }): Promise<any[]> {
    return [];
  }

  async getQcDeviation(id: number): Promise<any | undefined> {
    return undefined;
  }

  async createQcDeviation(deviation: any): Promise<any> {
    return deviation;
  }

  async updateQcDeviation(id: number, deviation: any): Promise<any> {
    return deviation;
  }

  async performImpactAssessment(id: number, assessment: any): Promise<any> {
    return assessment;
  }

  async linkCapaToDeviation(id: number, capa: any): Promise<any> {
    return capa;
  }

  async getDeviationTrending(params: any): Promise<any> {
    return { trends: [] };
  }

  // Microbiological Test methods
  async getMicrobiologicalTests(params: {
    organizationId: number;
    clientWorkspaceId: number;
    testType?: string;
    sampleType?: string;
  }): Promise<any[]> {
    return [];
  }

  async getMicrobiologicalTest(id: number): Promise<any | undefined> {
    return undefined;
  }

  async createMicrobiologicalTest(test: any): Promise<any> {
    return test;
  }

  async updateMicrobiologicalTest(id: number, test: any): Promise<any> {
    return test;
  }

  async getEnvironmentalMonitoringSchedule(params: any): Promise<any> {
    return { schedule: [] };
  }

  async createEnvironmentalMonitoringSchedule(schedule: any): Promise<any> {
    return schedule;
  }

  async recordMicrobiologicalResults(id: number, results: any): Promise<any> {
    return results;
  }

  // Reference Standard methods
  async getReferenceStandards(params: {
    organizationId: number;
    clientWorkspaceId: number;
    standardType?: string;
    status?: string;
  }): Promise<any[]> {
    return [];
  }

  async getReferenceStandard(id: number): Promise<any | undefined> {
    return undefined;
  }

  async createReferenceStandard(standard: any): Promise<any> {
    return standard;
  }

  async updateReferenceStandard(id: number, standard: any): Promise<any> {
    return standard;
  }

  async recordStandardUsage(id: number, usage: any): Promise<any> {
    return usage;
  }

  async getExpiringStandards(params: any): Promise<any[]> {
    return [];
  }

  async qualifyReferenceStandard(id: number, qualification: any): Promise<any> {
    return qualification;
  }

  async disposeReferenceStandard(id: number, disposal: any): Promise<any> {
    return disposal;
  }

  async getStandardUsageLogs(id: number): Promise<any[]> {
    return [];
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    if (!pool) return false;

    try {
      const result = await query('SELECT 1');
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Database health check failed', { error });
      return false;
    }
  }

  // ============================================================================
  // 510(k) Workflow Methods - Using in-memory storage until database tables exist
  // ============================================================================

  private workflowStorage = new Map<number, any>();
  private submissionStorage = new Map<number, any>();
  private sectionStorage = new Map<number, any>();

  // FDA 510(k) Submission methods
  async getFda510kSubmission(id: number): Promise<any | undefined> {
    return this.submissionStorage.get(id);
  }

  async getFda510kSubmissions(options?: {
    organizationId: number;
    deviceId?: number;
    submissionStatus?: string;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    const submissions = Array.from(this.submissionStorage.values());
    let filtered = submissions;

    if (options?.organizationId) {
      filtered = filtered.filter(s => s.organizationId === options.organizationId);
    }
    if (options?.deviceId) {
      filtered = filtered.filter(s => s.deviceId === options.deviceId);
    }
    if (options?.submissionStatus) {
      filtered = filtered.filter(s => s.submissionStatus === options.submissionStatus);
    }

    const offset = options?.offset || 0;
    const limit = options?.limit || filtered.length;
    return filtered.slice(offset, offset + limit);
  }

  async createFda510kSubmission(submission: any): Promise<any> {
    const id = this.submissionStorage.size + 1;
    const newSubmission = { ...submission, id, createdAt: new Date(), updatedAt: new Date() };
    this.submissionStorage.set(id, newSubmission);
    return newSubmission;
  }

  async updateFda510kSubmission(id: number, submissionData: any): Promise<any | undefined> {
    const existing = this.submissionStorage.get(id);
    if (!existing) return undefined;

    const updated = { ...existing, ...submissionData, updatedAt: new Date() };
    this.submissionStorage.set(id, updated);
    return updated;
  }

  async deleteFda510kSubmission(id: number): Promise<boolean> {
    return this.submissionStorage.delete(id);
  }

  // Device Submission Workflow methods
  async getDeviceSubmissionWorkflow(id: number): Promise<any | undefined> {
    return this.workflowStorage.get(id);
  }

  async getDeviceSubmissionWorkflows(options?: {
    organizationId: number;
    submissionType?: string;
    submissionId?: number;
    workflowStatus?: string;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    const workflows = Array.from(this.workflowStorage.values());
    let filtered = workflows;

    if (options?.organizationId) {
      filtered = filtered.filter(w => w.organizationId === options.organizationId);
    }
    if (options?.submissionType) {
      filtered = filtered.filter(w => w.submissionType === options.submissionType);
    }
    if (options?.submissionId) {
      filtered = filtered.filter(w => w.submissionId === options.submissionId);
    }
    if (options?.workflowStatus) {
      filtered = filtered.filter(w => w.workflowStatus === options.workflowStatus);
    }

    const offset = options?.offset || 0;
    const limit = options?.limit || filtered.length;
    return filtered.slice(offset, offset + limit);
  }

  async createDeviceSubmissionWorkflow(workflow: any): Promise<any> {
    const id = this.workflowStorage.size + 1;
    const newWorkflow = { ...workflow, id, createdAt: new Date(), updatedAt: new Date() };
    this.workflowStorage.set(id, newWorkflow);
    logger.info('Created workflow', { id, workflowType: workflow.workflowType });
    return newWorkflow;
  }

  async updateDeviceSubmissionWorkflow(id: number, workflowData: any): Promise<any | undefined> {
    const existing = this.workflowStorage.get(id);
    if (!existing) return undefined;

    const updated = { ...existing, ...workflowData, updatedAt: new Date() };
    this.workflowStorage.set(id, updated);
    logger.info('Updated workflow', { id });
    return updated;
  }

  async deleteDeviceSubmissionWorkflow(id: number): Promise<boolean> {
    return this.workflowStorage.delete(id);
  }

  // CERV2 510(k) Section methods
  async getCerv2510kSection(id: number): Promise<any | undefined> {
    return this.sectionStorage.get(id);
  }

  async getCerv2510kSections(options?: {
    organizationId: number;
    submissionId?: number;
    parentSectionId?: number;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    const sections = Array.from(this.sectionStorage.values());
    let filtered = sections;

    if (options?.organizationId) {
      filtered = filtered.filter(s => s.organizationId === options.organizationId);
    }
    if (options?.submissionId) {
      filtered = filtered.filter(s => s.submissionId === options.submissionId);
    }
    if (options?.parentSectionId) {
      filtered = filtered.filter(s => s.parentSectionId === options.parentSectionId);
    }

    const offset = options?.offset || 0;
    const limit = options?.limit || filtered.length;
    return filtered.slice(offset, offset + limit);
  }

  async createCerv2510kSection(section: any): Promise<any> {
    const id = this.sectionStorage.size + 1;
    const newSection = { ...section, id, createdAt: new Date(), updatedAt: new Date() };
    this.sectionStorage.set(id, newSection);
    return newSection;
  }

  async updateCerv2510kSection(id: number, sectionData: any): Promise<any | undefined> {
    const existing = this.sectionStorage.get(id);
    if (!existing) return undefined;

    const updated = { ...existing, ...sectionData, updatedAt: new Date() };
    this.sectionStorage.set(id, updated);
    return updated;
  }

  async deleteCerv2510kSection(id: number): Promise<boolean> {
    return this.sectionStorage.delete(id);
  }
}

// Determine which storage implementation to use based on database availability
let storage: IStorage;

if (pool) {
  logger.info('Using database storage implementation');
  storage = new DatabaseStorage() as unknown as IStorage;
} else {
  logger.warn('Database not available, using in-memory storage');
  storage = new MemStorage() as unknown as IStorage;
}

export { storage };

// Alias for backward compatibility
export { DatabaseStorage as DbStorage };
