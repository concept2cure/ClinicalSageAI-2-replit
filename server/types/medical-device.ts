/**
 * Type definitions for Medical Device Service
 * Covers 510(k), PMA, CER, and device management types
 */

// ============================================================================
// Device Types
// ============================================================================

export interface DeviceData {
  deviceName: string;
  deviceClass?: '1' | '2' | '3' | 'I' | 'II' | 'III';
  productCode?: string;
  regulationNumber?: string;
  description?: string;
  indications?: string;
  intendedUse?: string;
  manufacturer?: string;
  model?: string;
  version?: string;
  status?: 'active' | 'inactive' | 'retired' | 'draft';
  metadata?: Record<string, unknown>;
}

export interface MedicalDevice extends DeviceData {
  id: number;
  organizationId: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: number;
  updatedBy: number;
}

// ============================================================================
// 510(k) Submission Types
// ============================================================================

export interface Submission510kData {
  deviceId?: number;
  submissionTitle: string;
  predicateDevices?: PredicateDevice[];
  substantialEquivalence?: SubstantialEquivalenceData;
  deviceDescription?: string;
  intendedUse?: string;
  status?: SubmissionStatus;
  workflowStatus?: WorkflowStatus;
  metadata?: Record<string, unknown>;
}

export interface PredicateDevice {
  kNumber: string;
  deviceName: string;
  manufacturer?: string;
  decisionDate?: string;
  comparisonNotes?: string;
}

export interface SubstantialEquivalenceData {
  predicateKNumber: string;
  similarities?: string[];
  differences?: string[];
  reasoning?: string;
  technologicalCharacteristics?: string;
  performanceData?: string;
}

export interface Submission510k extends Submission510kData {
  id: number;
  organizationId: number;
  kNumber?: string;
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;
  decidedAt?: Date;
  createdBy: number;
  updatedBy: number;
}

// ============================================================================
// PMA Submission Types
// ============================================================================

export interface PMASubmissionData {
  deviceId?: number;
  submissionTitle: string;
  applicantInfo?: ApplicantInfo;
  deviceInfo?: DeviceDetailedInfo;
  clinicalData?: ClinicalDataSummary;
  manufacturingInfo?: ManufacturingInfo;
  status?: SubmissionStatus;
  workflowStatus?: WorkflowStatus;
  metadata?: Record<string, unknown>;
}

export interface ApplicantInfo {
  name?: string;
  address?: AddressInfo;
  contact?: ContactInfo;
  dunsNumber?: string;
  feiNumber?: string;
  establishmentType?: string;
}

export interface AddressInfo {
  street?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface ContactInfo {
  name?: string;
  title?: string;
  phone?: string;
  email?: string;
  fax?: string;
}

export interface DeviceDetailedInfo {
  deviceName?: string;
  classification?: string;
  productCode?: string;
  regulationNumber?: string;
  indications?: string[];
  contraindications?: string[];
  warnings?: string[];
  precautions?: string[];
  clinicalData?: Record<string, unknown>;
}

export interface ClinicalDataSummary {
  studyType?: string;
  numberOfSubjects?: number;
  studyDuration?: string;
  primaryEndpoints?: string[];
  secondaryEndpoints?: string[];
  safetyData?: SafetyDataSummary;
  efficacyData?: EfficacyDataSummary;
}

export interface SafetyDataSummary {
  adverseEvents?: number;
  seriousAdverseEvents?: number;
  deviceRelatedEvents?: number;
  summary?: string;
}

export interface EfficacyDataSummary {
  primaryEndpointMet?: boolean;
  successRate?: number;
  summary?: string;
}

export interface ManufacturingInfo {
  facilityName?: string;
  facilityAddress?: AddressInfo;
  qmsStandard?: string;
  sterilizationMethod?: string;
  shelfLife?: string;
  packagingInfo?: string;
}

export interface PMASubmission extends PMASubmissionData {
  id: number;
  organizationId: number;
  pmaNumber?: string;
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;
  approvedAt?: Date;
  createdBy: number;
  updatedBy: number;
}

// ============================================================================
// CER (Clinical Evaluation Report) Types
// ============================================================================

export interface CERProjectData {
  deviceId?: number;
  title: string;
  deviceDescription?: string;
  intendedPurpose?: string;
  clinicalBackground?: string;
  equivalentDevices?: EquivalentDevice[];
  literatureSearch?: LiteratureSearchData;
  clinicalData?: ClinicalEvaluationData;
  riskAnalysis?: RiskAnalysisData;
  status?: 'draft' | 'in_progress' | 'review' | 'approved' | 'published';
  metadata?: Record<string, unknown>;
}

export interface EquivalentDevice {
  deviceName: string;
  manufacturer?: string;
  notifiedBody?: string;
  technicalEquivalence?: string;
  biologicalEquivalence?: string;
  clinicalEquivalence?: string;
}

export interface LiteratureSearchData {
  databases?: string[];
  searchTerms?: string[];
  dateRange?: { start: string; end: string };
  resultsCount?: number;
  includedStudies?: number;
  excludedStudies?: number;
  searchStrategy?: string;
}

export interface ClinicalEvaluationData {
  clinicalInvestigations?: ClinicalInvestigation[];
  postMarketData?: PostMarketDataSummary;
  benefitRiskAnalysis?: string;
  conclusions?: string;
}

export interface ClinicalInvestigation {
  studyId?: string;
  studyTitle?: string;
  studyType?: string;
  subjects?: number;
  results?: string;
  conclusions?: string;
}

export interface PostMarketDataSummary {
  vigilanceReports?: number;
  customerComplaints?: number;
  pmcfStudies?: ClinicalInvestigation[];
  registryData?: string;
}

export interface RiskAnalysisData {
  riskManagementFile?: string;
  identifiedRisks?: IdentifiedRisk[];
  residualRisks?: string;
  overallRiskAcceptability?: string;
}

export interface IdentifiedRisk {
  hazard: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  probability: 'rare' | 'unlikely' | 'possible' | 'likely' | 'certain';
  mitigation?: string;
  residualRisk?: string;
}

export interface CERProject extends CERProjectData {
  id: number;
  organizationId: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  createdBy: number;
  updatedBy: number;
}

// ============================================================================
// Document Types
// ============================================================================

export interface SubmissionDocumentData {
  submissionId: number;
  submissionType: '510k' | 'pma' | 'cer' | 'ide' | 'other';
  documentType: DocumentType;
  filename: string;
  originalFilename?: string;
  s3Key?: string;
  mimeType?: string;
  fileSize?: number;
  checksum?: string;
  version?: number;
  status?: 'draft' | 'review' | 'approved' | 'rejected';
  metadata?: Record<string, unknown>;
}

export type DocumentType =
  | 'cover_letter'
  | 'device_description'
  | 'predicate_comparison'
  | 'substantial_equivalence'
  | 'performance_data'
  | 'biocompatibility'
  | 'sterilization'
  | 'software_documentation'
  | 'labeling'
  | 'clinical_data'
  | 'risk_analysis'
  | 'manufacturing'
  | 'quality_system'
  | 'other';

export interface SubmissionDocument extends SubmissionDocumentData {
  id: number;
  organizationId: number;
  createdAt: Date;
  updatedAt: Date;
  uploadedBy: number;
}

// ============================================================================
// Workflow Types
// ============================================================================

export type SubmissionStatus =
  | 'draft'
  | 'in_preparation'
  | 'ready_for_review'
  | 'under_review'
  | 'revision_required'
  | 'approved'
  | 'submitted_to_fda'
  | 'fda_review'
  | 'additional_info_requested'
  | 'accepted'
  | 'rejected'
  | 'withdrawn';

export type WorkflowStatus =
  | 'not_started'
  | 'device_description'
  | 'predicate_identification'
  | 'performance_testing'
  | 'clinical_evaluation'
  | 'labeling_review'
  | 'final_review'
  | 'submission_preparation'
  | 'submitted'
  | 'complete';

export interface WorkflowStep {
  stepId: string;
  stepName: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  assignedTo?: number;
  startedAt?: Date;
  completedAt?: Date;
  notes?: string;
}

export interface SubmissionWorkflow {
  id: number;
  submissionId: number;
  submissionType: string;
  organizationId: number;
  currentStep: string;
  steps: WorkflowStep[];
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Audit Trail Types
// ============================================================================

export type AuditAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'status_changed'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'document_uploaded'
  | 'document_deleted'
  | 'workflow_advanced'
  | 'assigned'
  | 'commented';

export interface AuditTrailEntry {
  id: number;
  organizationId: number;
  entityType: 'device' | '510k' | 'pma' | 'cer' | 'document' | 'workflow';
  entityId: number;
  action: AuditAction;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  userId: number;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Service Response Types
// ============================================================================

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface QueryOptions {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: Record<string, unknown>;
}
