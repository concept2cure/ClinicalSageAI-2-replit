/**
 * Database Entity Types
 * Auto-generated type declarations that match the database schema
 */

// ============================================================================
// Core Entity Types
// ============================================================================

export interface Organization {
  id: number;
  name: string;
  slug: string;
  type?: string;
  settings?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: number;
  email: string;
  name?: string;
  role: string;
  organizationId: number;
  password?: string;
  avatar?: string;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: number;
  name: string;
  title?: string;
  description?: string;
  status: string;
  type?: string;
  organizationId: number;
  userId?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Document {
  id: number;
  title: string;
  name?: string;
  content?: string;
  type?: string;
  status: string;
  version: number;
  projectId?: number;
  organizationId?: number;
  folderId?: number;
  moduleId?: string;
  sectionId?: string;
  contentHash?: string;
  metadata?: Record<string, any>;
  createdBy?: string;
  lastModifiedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// CSR (Clinical Study Report) Types
// ============================================================================

export interface CSRReport {
  id: number;
  organizationId: number;
  clientWorkspaceId?: number;
  reportId: string;
  reportTitle: string;
  reportType?: string;
  studyId?: string;
  status: string;
  submissionDate?: Date;
  dueDate?: Date;
  uploadDate: Date;
  content?: Record<string, any>;
  metadata?: Record<string, any>;
  complianceStatus?: string;
  regulatoryAgency?: string;
  // Computed/virtual fields (may not exist in DB but used in code)
  title?: string;
  sponsor?: string;
  indication?: string;
  phase?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CSRDetails {
  id: number;
  csrReportId: number;
  studyDesign?: string;
  primaryEndpoint?: string;
  secondaryEndpoints?: string[];
  sampleSize?: number;
  duration?: string;
  results?: Record<string, any>;
  conclusions?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Study Session Types
// ============================================================================

export interface StudySession {
  id: number;
  sessionId: string;
  userId?: number;
  organizationId?: number;
  projectId?: number;
  studyType?: string;
  status: string;
  parameters?: Record<string, any>;
  results?: Record<string, any>;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Summary/Insight Types
// ============================================================================

export interface SummaryPacket {
  id: number;
  title: string;
  content?: string;
  type?: string;
  status: string;
  projectId?: number;
  organizationId?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsightMemory {
  id: number;
  insightId: string;
  content: string;
  type?: string;
  category?: string;
  relevanceScore?: number;
  projectId?: number;
  organizationId?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface WisdomTrace {
  id: number;
  traceId: string;
  insight: string;
  source?: string;
  confidence?: number;
  projectId?: number;
  organizationId?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Regulatory/Compliance Types
// ============================================================================

export interface RegulatorySubmission {
  id: number;
  submissionId: string;
  type: string;
  status: string;
  agency?: string;
  targetDate?: Date;
  submissionDate?: Date;
  projectId?: number;
  organizationId?: number;
  documents?: Record<string, any>;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ComplianceRecord {
  id: number;
  recordId: string;
  type: string;
  status: string;
  score?: number;
  findings?: Record<string, any>[];
  recommendations?: string[];
  projectId?: number;
  organizationId?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Task/Workflow Types
// ============================================================================

export interface Task {
  id: number;
  taskId: string;
  title: string;
  description?: string;
  type?: string;
  status: string;
  priority?: string;
  assigneeId?: number;
  projectId?: number;
  organizationId?: number;
  dueDate?: Date;
  completedAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowInstance {
  id: number;
  workflowId: string;
  name: string;
  status: string;
  currentStep?: number;
  totalSteps?: number;
  projectId?: number;
  organizationId?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// FDA/Device Types
// ============================================================================

export interface FDA510kSubmission {
  id: number;
  submissionNumber?: string;
  deviceName: string;
  deviceClass?: string;
  productCode?: string;
  regulatoryClass?: string;
  predicateDevice?: string;
  status: string;
  applicantName?: string;
  decisionDate?: Date;
  projectId?: number;
  organizationId?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceProfile {
  id: number;
  deviceId: string;
  name: string;
  description?: string;
  category?: string;
  manufacturer?: string;
  modelNumber?: string;
  specifications?: Record<string, any>;
  projectId?: number;
  organizationId?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Audit/Logging Types
// ============================================================================

export interface AuditLog {
  id: number;
  action: string;
  entityType: string;
  entityId?: string;
  userId?: number;
  organizationId?: number;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface EventLog {
  id: number;
  eventType: string;
  payload: Record<string, any>;
  processed: boolean;
  processedAt?: Date;
  createdAt: Date;
}

// ============================================================================
// Client/Tenant Types
// ============================================================================

export interface ClientWorkspace {
  id: number;
  name: string;
  slug: string;
  organizationId: number;
  settings?: Record<string, any>;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantConfig {
  id: number;
  tenantId: number;
  key: string;
  value: any;
  category?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Analytics/Statistics Types
// ============================================================================

export interface AnalyticsMetric {
  id: number;
  metricName: string;
  metricValue: number;
  metricType: string;
  dimensions?: Record<string, any>;
  projectId?: number;
  organizationId?: number;
  timestamp: Date;
  createdAt: Date;
}

export interface HistoricalData {
  durationMedian?: number;
  durationMean?: number;
  successRate?: number;
  sampleSize?: number;
  confidenceInterval?: [number, number];
}

// ============================================================================
// Protocol Types
// ============================================================================

export interface Protocol {
  id: number;
  protocolId: string;
  title: string;
  version?: string;
  status: string;
  phase?: string;
  indication?: string;
  sponsor?: string;
  principalInvestigator?: string;
  synopsis?: string;
  objectives?: Record<string, any>;
  endpoints?: Record<string, any>;
  studyDesign?: Record<string, any>;
  projectId?: number;
  organizationId?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Section/Module Types
// ============================================================================

export interface Section {
  id: number;
  sectionId: string;
  title: string;
  content?: string;
  status: string;
  version: number;
  parentId?: number;
  moduleId?: string;
  order?: number;
  projectId?: number;
  organizationId?: number;
  metadata?: Record<string, any>;
  canonical?: boolean;
  regionScope?: string;
  slug?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModuleConfig {
  id: number;
  moduleId: string;
  name: string;
  description?: string;
  type?: string;
  enabled: boolean;
  settings?: Record<string, any>;
  organizationId?: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Evidence/Literature Types
// ============================================================================

export interface Evidence {
  id: number;
  evidenceId: string;
  title: string;
  type: string;
  source?: string;
  content?: string;
  citation?: string;
  url?: string;
  relevanceScore?: number;
  projectId?: number;
  organizationId?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface LiteratureEntry {
  id: number;
  entryId: string;
  title: string;
  authors?: string[];
  journal?: string;
  publicationDate?: Date;
  abstract?: string;
  doi?: string;
  pmid?: string;
  relevanceScore?: number;
  projectId?: number;
  organizationId?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Helper/Utility Types
// ============================================================================

export type InsertEntity<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateEntity<T> = Partial<Omit<T, 'id' | 'createdAt'>>;
export type EntityWithTimestamps = { createdAt: Date; updatedAt: Date };

// Database query result types
export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

// Drizzle-compatible types
export type DrizzleEntity<T> = T & EntityWithTimestamps;

// ============================================================================
// CSR Knowledge Database Types (Layer 1: CSR Data Harvest)
// ============================================================================

export interface CsrStudy {
  id: number;
  organizationId: number;
  clientWorkspaceId?: number;
  csrId: string;
  nctId?: string;
  eudractNumber?: string;
  protocolNumber?: string;
  studyTitle: string;
  studyAcronym?: string;
  sponsor?: string;
  molecule?: string;
  moleculeType?: string;
  brandName?: string;
  inn?: string;
  mechanismOfAction?: string;
  therapeuticArea?: string;
  indication?: string;
  indicationMedDRA?: string;
  phase?: string;
  studyDesign?: string;
  blinding?: string;
  randomization?: string;
  controlType?: string;
  numberOfArms?: number;
  adaptiveDesignDetails?: string;
  studyStartDate?: string;
  studyEndDate?: string;
  primaryCompletionDate?: string;
  durationWeeks?: number;
  reportDate?: string;
  regulatoryAgency?: string;
  submissionType?: string;
  applicationNumber?: string;
  designRationale?: string;
  regulatoryClassification?: string;
  studyTypeDescription?: string;
  sourceDocumentId?: number;
  sourceReportId?: number;
  extractionVersion?: string;
  extractionConfidence?: number;
  extractedAt?: Date;
  verifiedBy?: number;
  verifiedAt?: Date;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CsrTreatmentArm {
  id: number;
  studyId: number;
  armName: string;
  armType: string;
  armDescription?: string;
  drugName?: string;
  dose?: string;
  doseUnit?: string;
  frequency?: string;
  routeOfAdministration?: string;
  durationWeeks?: number;
  dosingSchedule?: string;
  formulation?: string;
  plannedSubjects?: number;
  enrolledSubjects?: number;
  completedSubjects?: number;
  discontinuedSubjects?: number;
  sortOrder?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CsrPopulation {
  id: number;
  studyId: number;
  populationName: string;
  populationDescription?: string;
  totalScreened?: number;
  screenFailures?: number;
  totalRandomized?: number;
  totalEnrolled?: number;
  totalCompleted?: number;
  totalDiscontinued?: number;
  discontinuationReasons?: Record<string, any>;
  meanAge?: number;
  medianAge?: number;
  ageRange?: string;
  percentFemale?: number;
  percentMale?: number;
  raceDistribution?: Record<string, any>;
  ethnicityDistribution?: Record<string, any>;
  regionDistribution?: Record<string, any>;
  baselineCharacteristics?: Record<string, any>;
  medicalHistory?: Record<string, any>;
  priorTherapies?: Record<string, any>;
  concomitantMedications?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CsrEndpoint {
  id: number;
  studyId: number;
  endpointCategory: string;
  endpointName: string;
  endpointDescription?: string;
  measurementMethod?: string;
  assessmentTimepoint?: string;
  assessmentTool?: string;
  statisticalMethod?: string;
  statisticalModel?: string;
  primaryAnalysisPopulation?: string;
  multiplicityAdjustment?: string;
  missingDataMethod?: string;
  sensitivityAnalyses?: Record<string, any>;
  prespecifiedSubgroups?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CsrEndpointResult {
  id: number;
  endpointId: number;
  armId?: number;
  nSubjects?: number;
  resultValue?: number;
  resultUnit?: string;
  standardDeviation?: number;
  standardError?: number;
  medianValue?: number;
  ciLower?: number;
  ciUpper?: number;
  ciLevel?: number;
  comparisonArmId?: number;
  treatmentDifference?: number;
  pValue?: number;
  pValueAdjusted?: number;
  oddsRatio?: number;
  hazardRatio?: number;
  relativeRisk?: number;
  nnt?: number;
  responseRate?: number;
  responderDefinition?: string;
  isStatisticallySignificant?: boolean;
  isClinicallyMeaningful?: boolean;
  clinicalMeaningfulThreshold?: number;
  subgroupName?: string;
  isSubgroupAnalysis?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CsrAdverseEvent {
  id: number;
  studyId: number;
  armId?: number;
  preferredTerm: string;
  systemOrganClass?: string;
  meddraCode?: string;
  highLevelGroupTerm?: string;
  seriousness: string;
  severityGrade?: number;
  severityScale?: string;
  causality?: string;
  outcome?: string;
  subjectsAffected?: number;
  subjectsAtRisk?: number;
  incidenceRate?: number;
  eventsTotal?: number;
  medianOnsetDays?: number;
  medianDurationDays?: number;
  doseModification?: boolean;
  drugDiscontinued?: boolean;
  treatmentRequired?: boolean;
  hospitalizationRequired?: boolean;
  isAESI?: boolean;
  isDoseRelated?: boolean;
  isExpected?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CsrSafetySummary {
  id: number;
  studyId: number;
  armId?: number;
  anyTEAE?: number;
  anyTreatmentRelatedTEAE?: number;
  anySeriousAE?: number;
  anyTreatmentRelatedSAE?: number;
  deathsDuringStudy?: number;
  treatmentRelatedDeaths?: number;
  discontinuationDueToAE?: number;
  doseReductionDueToAE?: number;
  doseInterruptionDueToAE?: number;
  safetyPopulationN?: number;
  labAbnormalities?: Record<string, any>;
  vitalSignAbnormalities?: Record<string, any>;
  ecgFindings?: Record<string, any>;
  teaeSummaryText?: string;
  saeSummaryText?: string;
  deathNarratives?: string;
  safetyConclusion?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CsrPharmacokinetic {
  id: number;
  studyId: number;
  armId?: number;
  parameterName: string;
  parameterUnit?: string;
  analyteOrMatrix?: string;
  meanValue?: number;
  geometricMean?: number;
  medianValue?: number;
  cvPercent?: number;
  ciLower?: number;
  ciUpper?: number;
  nSubjects?: number;
  dosingCondition?: string;
  samplingTimepoint?: string;
  isSteadyState?: boolean;
  foodEffect?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CsrSafetySignal {
  id: number;
  organizationId: number;
  signalName: string;
  signalDescription?: string;
  status: string;
  preferredTerm?: string;
  systemOrganClass?: string;
  meddraCode?: string;
  molecule?: string;
  moleculeClass?: string;
  sourceStudyIds?: number[];
  evidenceStrength?: string;
  disproportionalityScore?: number;
  reportingOddsRatio?: number;
  informationComponent?: number;
  backgroundIncidence?: number;
  comparatorIncidence?: number;
  isClassEffect?: boolean;
  isDoseDependent?: boolean;
  actionTaken?: string;
  riskMitigation?: string;
  regulatoryNotification?: boolean;
  detectedAt?: Date;
  evaluatedAt?: Date;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CsrRegulatoryIntelligenceRecord {
  id: number;
  organizationId: number;
  agency: string;
  therapeuticArea?: string;
  indication?: string;
  moleculeType?: string;
  phase?: string;
  intelligenceType: string;
  title: string;
  description?: string;
  sourceStudyId?: number;
  deficiencyCategory?: string;
  agencyQuestion?: string;
  sponsorResponse?: string;
  resolution?: string;
  impactOnTimeline?: string;
  isPrecedentSetting?: boolean;
  precedentSummary?: string;
  applicableGuidances?: Record<string, any>;
  tags?: Record<string, any>;
  confidence?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CtdProgram {
  id: number;
  organizationId: number;
  clientWorkspaceId?: number;
  programName: string;
  programCode?: string;
  molecule?: string;
  moleculeType?: string;
  therapeuticArea?: string;
  indication?: string;
  targetAgency?: string;
  status?: string;
  leadProjectManager?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CtdSubmission {
  id: number;
  programId: number;
  submissionTitle: string;
  submissionType: string;
  sequenceNumber?: number;
  applicationNumber?: string;
  targetAgency: string;
  submissionDate?: string;
  targetDate?: string;
  acceptanceDate?: string;
  approvalDate?: string;
  status?: string;
  ectdVersion?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CsrKnowledgeNode {
  id: number;
  organizationId: number;
  nodeType: string;
  nodeName: string;
  normalizedName?: string;
  description?: string;
  externalId?: string;
  ontologySource?: string;
  properties?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CsrKnowledgeEdge {
  id: number;
  sourceNodeId: number;
  targetNodeId: number;
  relationshipType: string;
  weight?: number;
  confidence?: number;
  sourceStudyId?: number;
  evidenceText?: string;
  evidenceSectionId?: number;
  properties?: Record<string, any>;
  createdAt: Date;
}

// ============================================================================
// Submission Core + Evidence Graph (Phase 1) — see shared/schema/submissions.ts,
// shared/schema/evidence.ts. Canonical select shapes are inferred there via
// $inferSelect/$inferInsert; these hand-authored mirrors match the SQL columns.
// ============================================================================

export interface Submission {
  id: number;
  title: string;
  productName?: string | null;
  applicationType: string; // ind|nda|bla|anda|maa|510k|de_novo|pma|cta
  clientType: string; // pharma|biotech|mdx|ivd
  primaryRegion: string; // fda|eu|jp
  status: string; // planning|active|submitted|archived
  lifecycleStage: string; // planning|original|amendment|response|variation|annual|withdrawal
  organizationId: number;
  createdBy: number;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  deletedAt?: Date | null;
}
export type NewSubmission = Omit<Submission, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export interface SubmissionRegion {
  id: number;
  submissionId: number;
  region: string; // fda|eu|jp
  pathway: string; // ectd_v322|ectd_v40|estar|mdr|ivdr|ctis
  moduleProfileVersion?: string | null;
  validationProfileVersion?: string | null;
  organizationId: number;
  createdBy: number;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  deletedAt?: Date | null;
}
export type NewSubmissionRegion = Omit<SubmissionRegion, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export interface EctdSequence {
  id: number;
  submissionId: number;
  region: string;
  sequenceNumber: string; // '0000', '0001', ...
  type: string; // original|amendment|response|variation|annual|withdrawal
  status: string; // draft|assembling|validated|frozen|dispatched
  validationStatus?: string | null;
  dispatchStatus?: string | null;
  frozenAt?: Date | null;
  organizationId: number;
  createdBy: number;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  deletedAt?: Date | null;
}
export type NewEctdSequence = Omit<EctdSequence, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export interface SubmissionLeaf {
  id: number;
  sequenceId: number;
  sectionCode: string; // "2.5", "3.2.S.4.2", "m1.us.cover"
  title: string;
  granularity?: string | null;
  lifecycleOp: string; // new|replace|append|delete
  documentTable?: string | null; // polymorphic — coauthor_documents|ctd_onboarding_documents|unified_documents|vault_documents
  documentId?: number | null; // polymorphic id within documentTable
  documentType?: string | null; // classifier hint for pathway leaf→slot matching
  leafGuid?: string | null;
  parentLeafId?: number | null;
  checksum?: string | null;
  organizationId: number;
  createdBy: number;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  deletedAt?: Date | null;
}
export type NewSubmissionLeaf = Omit<SubmissionLeaf, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

// Named SubmissionEvidenceLink (not EvidenceLink) — `evidence_links` already
// exists in shared/schema/programs.ts. See RECONCILE.md §2.
export interface SubmissionEvidenceLink {
  id: number;
  submissionId: number;
  targetSectionCode: string; // "2.7.3"
  sourceDocumentTable: string; // polymorphic
  sourceDocumentId: number; // polymorphic id within sourceDocumentTable
  sourceLocator?: string | null;
  direction: string; // derives_from|cited_by|supports|contradicts
  confidence?: number | null; // 0..1
  organizationId: number;
  createdBy: number;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  deletedAt?: Date | null;
}
export type NewSubmissionEvidenceLink = Omit<
  SubmissionEvidenceLink,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;

export interface ConsistencyFinding {
  id: number;
  submissionId: number;
  dimension: string; // subject-counts | spec-vs-qos | label-vs-safety
  leftRef: string;
  rightRef: string;
  status: string; // match | conflict
  detail?: string | null;
  organizationId: number;
  createdBy: number;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  deletedAt?: Date | null;
}
export type NewConsistencyFinding = Omit<ConsistencyFinding, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

// ============================================================================
// Global exports
// ============================================================================

declare global {
  namespace Database {
    type Organization = Organization;
    type User = User;
    type Project = Project;
    type Document = Document;
    type CSRReport = CSRReport;
    type StudySession = StudySession;
    type Task = Task;
    type Protocol = Protocol;
    type Section = Section;
    type Evidence = Evidence;
    type AuditLog = AuditLog;
  }
}
