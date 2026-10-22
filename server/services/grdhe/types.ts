/**
 * GRDHE Type Definitions
 *
 * Type definitions for the Global Regulatory Data Harmonization Engine
 *
 * @version 1.0.0
 * @compliance 21 CFR Part 11, EU MDR 2017/745, GDPR Article 9, ISO 13485
 */

// =============================================================================
// DATA RESIDENCY TYPES
// =============================================================================

export type DataRegion =
  | 'US_EAST'
  | 'US_WEST'
  | 'EU_WEST'
  | 'EU_CENTRAL'
  | 'UK_SOUTH'
  | 'JP_EAST'
  | 'CA_CENTRAL'
  | 'AU_EAST'
  | 'GLOBAL';

export interface DataResidencyConfig {
  id: string;
  tenantId: string;
  primaryRegion: DataRegion;
  allowedProcessingRegions: DataRegion[];
  backupRegion?: DataRegion;

  // GDPR settings
  gdprSubject: boolean;
  gdprLawfulBasis?:
    | 'consent'
    | 'contract'
    | 'legal_obligation'
    | 'vital_interests'
    | 'public_task'
    | 'legitimate_interests'
    | 'research_exemption';
  gdprDpoContact?: string;
  gdprDataSubjectRightsUrl?: string;

  // Cross-border transfers
  crossBorderMechanism?:
    | 'adequacy_decision'
    | 'standard_contractual_clauses'
    | 'binding_corporate_rules'
    | 'derogation_explicit_consent'
    | 'none_required';
  crossBorderDocumentationUrl?: string;

  // Encryption
  encryptionAtRestRequired: boolean;
  encryptionInTransitRequired: boolean;
  fieldLevelEncryptionFields: string[];
  encryptionAlgorithm: string;
  keyRotationDays: number;

  // Retention (in days)
  clinicalTrialRetentionDays: number;
  postMarketRetentionDays: number;
  auditLogRetentionDays: number;
  adverseEventRetentionDays: number;

  // Audit
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

// =============================================================================
// TERMINOLOGY TYPES
// =============================================================================

export type TerminologySystem =
  | 'MEDDRA'
  | 'SNOMED_CT'
  | 'SNOMED_CT_US'
  | 'SNOMED_CT_INT'
  | 'ICD10'
  | 'ICD11'
  | 'LOINC'
  | 'RXNORM'
  | 'NDC'
  | 'GUDID'
  | 'EMDN'
  | 'GMDN'
  | 'NCI_THESAURUS'
  | 'UCUM'
  | 'HL7_FHIR_R4'
  | 'ICH_E2B_R3'
  | 'EDQM'
  | 'UNII'
  | 'ATC'
  | 'WHO_DRUG';

export interface TerminologyVersion {
  id: string;
  terminologySystem: TerminologySystem;
  versionCode: string;
  versionDate: Date;
  displayName: string;
  description?: string;
  releaseNotesUrl?: string;
  licenseUrl?: string;
  applicableJurisdictions: string[];
  effectiveFrom: Date;
  effectiveUntil?: Date;
  isCurrent: boolean;
  isDeprecated: boolean;
  deprecationReason?: string;
  successorVersionId?: string;
  sourceFileUrl?: string;
  sourceFileHash?: string;
  conceptCount?: number;
  termCount?: number;
  relationshipCount?: number;
  validationStatus?: 'valid' | 'invalid' | 'pending' | 'needs_review';
  createdAt: Date;
  updatedAt: Date;
}

export type TerminologyMappingType =
  | 'equivalent'
  | 'broader'
  | 'narrower'
  | 'related'
  | 'inexact'
  | 'unmapped'
  | 'deprecated_to';

export type TerminologyMappingSource =
  | 'manual'
  | 'automated'
  | 'vendor_provided'
  | 'who_art'
  | 'umls'
  | 'snomed_refset';

export interface TerminologyMapping {
  id: string;
  sourceSystem: TerminologySystem;
  sourceVersionId: string;
  sourceCode: string;
  sourceDisplay: string;
  sourceHierarchyPath?: string;
  targetSystem: TerminologySystem;
  targetVersionId: string;
  targetCode: string;
  targetDisplay: string;
  targetHierarchyPath?: string;
  mappingType: TerminologyMappingType;
  confidenceScore: number;
  requiresReview: boolean;
  reviewNotes?: string;
  mappingSource: TerminologyMappingSource;
  mappingAlgorithm?: string;
  validatedBy?: string;
  validatedAt?: Date;
  validationMethod?: string;
  createdAt: Date;
}

export interface TerminologyMappingResult {
  targetCode: string;
  targetDisplay: string;
  mappingType: TerminologyMappingType;
  /** The confidence recorded on the mapping row; null when none was recorded. */
  confidenceScore: number | null;
  requiresReview: boolean;
  fallbackUsed: boolean;
  sourceVersion?: string;
  targetVersion?: string;
}

export interface SubmissionTerminologyUsage {
  id: string;
  submissionId: string;
  submissionType: string;
  submissionSequence?: string;
  terminologyVersionId: string;
  targetJurisdiction: string;
  targetAgency?: string;
  lockedAt: Date;
  lockedBy: string;
  lockReason: string;
  validationStatus: 'pending' | 'validated' | 'failed' | 'warning' | 'waived';
  validationErrors: any[];
  validationWarnings: any[];
  validatedAt?: Date;
  validatedBy?: string;
  termsUsedCount: number;
  termsMappedCount: number;
  termsUnmappedCount: number;
  termsRequiringReviewCount: number;
}

// =============================================================================
// REGULATORY FORMAT TYPES
// =============================================================================

/**
 * regulatory_harmonization.regulatory_format as db/migrations/081 defines it:
 * the values export_jobs.target_format and mapping_rules.target_format hold.
 * 2026-10-22: this also listed FDA_AE_3500A, FDA_AE_3500B and EMA_AE_E2B_R3,
 * which the enum has no value for, so an export generator key typed as a
 * RegulatoryFormat compiled and then failed at the ::regulatory_format cast.
 * The generator keys are SupportedFormat (exportGenerators/index.ts), and
 * RECORDED_AS is the one place a key is mapped to a value here.
 */
export type RegulatoryFormat =
  // FDA formats
  | 'FDA_ECTD_4_0'
  | 'FDA_ECTD_3_2_2'
  | 'FDA_3500A'
  | 'FDA_3500B'
  | 'FDA_GUDID'
  | 'FDA_SPL'
  | 'FDA_ESG'
  | 'FDA_CDRH_ESTAR'
  // EMA formats
  | 'EMA_ECTD_4_0'
  | 'EMA_XEVMPD'
  | 'EMA_IDMP_SPOR'
  | 'EMA_E2B_R3'
  | 'EMA_EUDAMED'
  | 'EMA_PSUR'
  // Other jurisdictions
  | 'PMDA_ECTD'
  | 'PMDA_E2B_R3'
  | 'HC_ECTD'
  | 'TGA_ECTD'
  | 'MHRA_ECTD'
  | 'ANVISA_ECTD'
  | 'NMPA_ECTD'
  // Cross-jurisdiction
  | 'ICH_E2B_R3'
  | 'IMDRF_AERS'
  | 'ISO_IDMP'
  | 'FHIR_R4_PQ_CMC'
  | 'CDISC_SDTM'
  | 'CDISC_ADAM';

export type ExportStatus =
  | 'draft'
  | 'pending'
  | 'validating'
  | 'transforming'
  | 'generating'
  | 'review_required'
  | 'approved'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'archived';

export type SignatureMeaning =
  | 'authored'
  | 'reviewed'
  | 'verified'
  | 'approved'
  | 'rejected'
  | 'acknowledged'
  | 'witnessed'
  | 'responsible_for_content'
  | 'legal_responsibility';

export type GRDHERole =
  | 'admin'
  | 'qa_manager'
  | 'regulatory_affairs'
  | 'medical_writer'
  | 'data_manager'
  | 'reviewer'
  | 'viewer'
  | 'auditor'
  | 'system';

// =============================================================================
// MAPPING RULE TYPES
// =============================================================================

export interface TransformRule {
  source: string;
  target: string;
  type: 'date' | 'string' | 'integer' | 'decimal' | 'code' | 'terminology' | 'boolean' | 'array';
  format?: string;
  codeSystem?: string;
  system?: string;
  required?: boolean;
  maxLength?: number;
  itemType?: string;
  defaultValue?: any;
  transform?: string; // Custom transformation function name
}

export interface TransformationRules {
  version: string;
  transforms: TransformRule[];
  required_fields: string[];
  jurisdiction_specific: Record<string, any>;
  pre_transforms?: TransformRule[];
  post_transforms?: TransformRule[];
}

export interface MappingRule {
  id: string;
  ruleCode: string;
  ruleName: string;
  ruleDescription?: string;
  ruleVersion: string;
  ruleVersionDate: Date;
  targetFormat: RegulatoryFormat;
  targetJurisdiction: string;
  sourceEntityType: string;
  transformationRules: TransformationRules;
  validationSchema: Record<string, any>;
  preValidationRules: any[];
  postValidationRules: any[];
  fieldMappings: Record<string, string>;
  dateFormat: string;
  dateDisplayFormat?: string;
  timezoneHandling: 'UTC' | 'local' | 'preserve';
  requiredTerminologies: TerminologySystem[];
  terminologyValidationMode: 'strict' | 'warn' | 'lenient';
  applicabilityConditions: Record<string, any>;
  exclusionConditions: Record<string, any>;
  isActive: boolean;
  isDraft: boolean;
  isValidated: boolean;
  lastValidatedAt?: Date;
  validationStatus?: 'valid' | 'invalid' | 'pending' | 'needs_review';
  validationErrors: any[];
  testCoveragePercent: number;
  requiresApproval: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  approvalSignatureId?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface MappingRuleHistory {
  id: string;
  ruleId: string;
  versionNumber: number;
  versionLabel?: string;
  changeType:
    | 'CREATE'
    | 'UPDATE'
    | 'ACTIVATE'
    | 'DEACTIVATE'
    | 'APPROVE'
    | 'REJECT'
    | 'ARCHIVE'
    | 'RESTORE';
  changeSummary: string;
  changeDetails?: Record<string, any>;
  ruleSnapshot: Record<string, any>;
  previousVersionId?: string;
  changesFromPrevious?: Record<string, any>;
  changedBy: string;
  changedAt: Date;
  signatureId?: string;
  signatureMeaning?: SignatureMeaning;
  signatureTimestamp?: Date;
  signatureHash?: string;
}

// =============================================================================
// EXPORT JOB TYPES
// =============================================================================

export interface ExportJob {
  id: string;
  jobNumber: string;
  tenantId: string;
  organizationName?: string;
  projectId?: string;
  projectName?: string;
  sourceEntityType: string;
  sourceEntityIds: string[];
  sourceEntityCount: number;
  targetFormat: RegulatoryFormat;
  targetJurisdiction: string;
  targetAgency?: string;
  mappingRuleId?: string;
  mappingRuleVersion?: string;
  terminologyVersions: Record<string, TerminologyVersionLock>;
  exportOptions: Record<string, any>;
  includeAttachments: boolean;
  includeAuditTrail: boolean;
  status: ExportStatus;
  progressPercent: number;
  currentStep?: string;
  stepsCompleted: string[];
  validationPassed?: boolean;
  validationErrors: ValidationError[];
  validationWarnings: ValidationWarning[];
  validationStartedAt?: Date;
  validationCompletedAt?: Date;
  outputFilePath?: string;
  outputFileName?: string;
  outputFileHash?: string;
  outputFileSizeBytes?: number;
  outputMimeType?: string;
  outputFormatVersion?: string;
  archivePath?: string;
  archiveHash?: string;
  archiveCreatedAt?: Date;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  errorMessage?: string;
  errorDetails?: Record<string, any>;
  errorStack?: string;
  retryCount: number;
  maxRetries: number;
  lastRetryAt?: Date;
  requiresApproval: boolean;
  approvalStatus?: 'pending' | 'approved' | 'rejected' | 'waived';
  approvedBy?: string;
  approvedAt?: Date;
  approvalSignatureId?: string;
  approvalComments?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  completedBy?: string;
  completionSignatureId?: string;
  // completionSignatureHash was removed 2026-10-15: the only value ever written
  // was a hash over path|'system'|clock, signature-shaped and nobody's. Sign
  // through POST /api/esignature/sign.
}

export interface TerminologyVersionLock {
  version_id: string;
  version_code: string;
  display_name: string;
  locked_at: string;
}

export interface ValidationError {
  code: string;
  field: string;
  message: string;
  severity: 'error';
  details?: Record<string, any>;
}

export interface ValidationWarning {
  code: string;
  field: string;
  message: string;
  severity: 'warning';
  details?: Record<string, any>;
}

export interface ExportJobAuditEntry {
  id: string;
  jobId: string;
  action: string;
  actionCategory:
    | 'status_change'
    | 'validation'
    | 'transformation'
    | 'generation'
    | 'approval'
    | 'error'
    | 'system';
  previousState?: Record<string, any>;
  newState?: Record<string, any>;
  message: string;
  details?: Record<string, any>;
  userId: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
  occurredAt: Date;
  entryHash: string;
}

// =============================================================================
// ELECTRONIC SIGNATURE TYPES (21 CFR Part 11)
// =============================================================================

export type AuthenticationMethod =
  | 'password_and_meaning'
  | 'password_and_biometric'
  | 'hardware_token_and_pin'
  | 'certificate_and_pin'
  | 'sso_and_mfa';

export interface ElectronicSignature {
  id: string;
  signedObjectType: string;
  signedObjectId: string;
  signedObjectVersion?: number;
  contentHash: string;
  contentHashAlgorithm: string;
  signatureMeaning: SignatureMeaning;
  signatureReason: string;
  signerUserId: string;
  signerName: string;
  signerTitle?: string;
  signerOrganization?: string;
  signerEmail?: string;
  authenticationMethod: AuthenticationMethod;
  authenticationTimestamp: Date;
  authenticationSessionId?: string;
  signatureValue: string;
  signatureAlgorithm: string;
  certificateThumbprint?: string;
  certificateIssuer?: string;
  certificateSerialNumber?: string;
  timestampToken?: string;
  timestampAuthority?: string;
  timestampAuthorityUrl?: string;
  isValid: boolean;
  invalidatedAt?: Date;
  invalidationReason?: string;
  countersignedBy?: string;
  createdAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface SignatureRequest {
  objectType: string;
  objectId: string;
  objectVersion?: number;
  meaning: SignatureMeaning;
  reason: string;
  userId: string;
  password: string;
  authMethod?: AuthenticationMethod;
}

// =============================================================================
// CANONICAL DATA MODEL TYPES
// =============================================================================

export type CaseType = 'spontaneous' | 'clinical_trial' | 'literature' | 'solicited' | 'other';
export type ReportType = 'initial' | 'followup' | 'amendment' | 'nullification' | 'final';
export type DatePrecision = 'year' | 'month' | 'day';
export type CaseOutcome =
  | 'recovered'
  | 'recovering'
  | 'not_recovered'
  | 'recovered_with_sequelae'
  | 'fatal'
  | 'unknown';
export type CaseStatus =
  | 'draft'
  | 'pending_review'
  | 'under_review'
  | 'approved'
  | 'submitted'
  | 'closed'
  | 'archived';

export interface PatientInfo {
  age?: number;
  age_unit?: string;
  age_group?: string;
  sex?: 'M' | 'F' | 'U';
  weight?: number;
  weight_unit?: string;
  height?: number;
  height_unit?: string;
  ethnicity?: string;
  date_of_birth?: string;
  date_of_birth_precision?: DatePrecision;
  medical_record_number?: string;
  initials?: string;
}

export interface Reaction {
  id?: string;
  term: string;
  term_code?: string;
  term_system?: TerminologySystem;
  term_version?: string;
  onset_date?: string;
  onset_date_precision?: DatePrecision;
  end_date?: string;
  end_date_precision?: DatePrecision;
  duration?: number;
  duration_unit?: string;
  outcome?: CaseOutcome;
  is_serious?: boolean;
  seriousness_criteria?: string[];
}

export interface SuspectProduct {
  id?: string;
  name: string;
  generic_name?: string;
  substance_code?: string;
  substance_system?: TerminologySystem;
  manufacturer?: string;
  authorization_number?: string;
  authorization_country?: string;
  batch_number?: string;
  expiry_date?: string;
  dose?: string;
  dose_unit?: string;
  dose_form?: string;
  route?: string;
  frequency?: string;
  indication?: string;
  start_date?: string;
  end_date?: string;
  drug_role?: 'suspect' | 'concomitant' | 'interacting';
  action_taken?: string;
  rechallenge?: string;
  dechallenge?: string;
}

export interface Reporter {
  type?: 'healthcare_professional' | 'consumer' | 'other';
  qualification?: string;
  qualification_code?: string;
  name?: string;
  title?: string;
  organization?: string;
  department?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  country_code?: string;
  phone?: string;
  email?: string;
}

export interface MedicalHistory {
  conditions?: Array<{
    term: string;
    term_code?: string;
    term_system?: TerminologySystem;
    start_date?: string;
    end_date?: string;
    ongoing?: boolean;
    comments?: string;
  }>;
  allergies?: Array<{
    substance: string;
    reaction?: string;
  }>;
  family_history?: string;
  relevant_tests?: Array<{
    test_name: string;
    test_code?: string;
    result?: string;
    result_unit?: string;
    date?: string;
  }>;
}

export interface CausalityAssessment {
  method?: string;
  result?: string;
  assessor?: string;
  assessment_date?: string;
  comments?: string;
}

export interface CanonicalAdverseEvent {
  id: string;
  tenantId: string;
  organizationId?: string;
  caseNumber: string;
  caseVersion: number;
  worldwideCaseId?: string;
  caseType: CaseType;
  reportType: ReportType;
  eventDate: Date;
  eventDatePrecision: DatePrecision;
  receiveDate: Date;
  mostRecentInfoDate?: Date;
  isSerious: boolean;
  seriousnessDeath: boolean;
  seriousnessLifeThreatening: boolean;
  seriousnessHospitalization: boolean;
  seriousnessDisability: boolean;
  seriousnessCongenitalAnomaly: boolean;
  seriousnessOtherMedicallyImportant: boolean;
  seriousnessOtherDetails?: string;
  patient: PatientInfo;
  reactions: Reaction[];
  suspectProducts: SuspectProduct[];
  concomitantProducts?: SuspectProduct[];
  medicalHistory?: MedicalHistory;
  reporter: Reporter;
  sender?: Record<string, any>;
  receiver?: Record<string, any>;
  caseNarrative?: string;
  reporterComments?: string;
  senderComments?: string;
  causalityAssessment?: CausalityAssessment;
  caseOutcome?: CaseOutcome;
  submissions?: Array<{
    submission_id: string;
    format: RegulatoryFormat;
    jurisdiction: string;
    submitted_at: string;
    status: string;
  }>;
  contentHash: string;
  isCurrentVersion: boolean;
  previousVersionId?: string;
  versionReason?: string;
  status: CaseStatus;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy?: string;
}

export type ProductType =
  | 'drug'
  | 'biologic'
  | 'medical_device'
  | 'combination_product'
  | 'diagnostic'
  | 'samd';
import type { DeviceClass } from '../../../shared/regulatory/device-class.js';
export type { DeviceClass };

export interface ProductIdentifiers {
  ndc?: string;
  udi?: string;
  gtin?: string;
  gudid?: string;
  eudamed_id?: string;
  authorization_number?: string;
  catalog_number?: string;
  model_number?: string;
}

export interface Manufacturer {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  country_code?: string;
  phone?: string;
  email?: string;
  duns_number?: string;
  fei_number?: string;
}

export interface CanonicalProduct {
  id: string;
  tenantId: string;
  organizationId?: string;
  productCode: string;
  productVersion: number;
  productType: ProductType;
  deviceClass?: DeviceClass;
  riskClass?: string;
  proprietaryName?: string;
  establishedName?: string;
  genericName?: string;
  identifiers: ProductIdentifiers;
  manufacturer: Manufacturer;
  productDetails?: Record<string, any>;
  regulatoryStatus?: Record<string, any>;
  isCurrentVersion: boolean;
  previousVersionId?: string;
  contentHash: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

// =============================================================================
// GDPR TYPES
// =============================================================================

export interface GDPRProcessingRecord {
  id: string;
  tenantId: string;
  activityId: string;
  activityName: string;
  activityDescription: string;
  controllerName: string;
  controllerAddress?: string;
  controllerContact: string;
  controllerRepresentative?: string;
  controllerRepresentativeContact?: string;
  dpoName?: string;
  dpoContact?: string;
  jointControllerName?: string;
  jointControllerContact?: string;
  jointControllerAgreementUrl?: string;
  processorName?: string;
  processorContact?: string;
  processorAgreementUrl?: string;
  subProcessors?: Array<{ name: string; contact: string; purpose: string }>;
  dataSubjectCategories: string[];
  personalDataCategories: string[];
  specialCategoryData?: string[];
  recipientCategories: string[];
  thirdCountryRecipients?: string[];
  lawfulBasis:
    | 'consent'
    | 'contract'
    | 'legal_obligation'
    | 'vital_interests'
    | 'public_task'
    | 'legitimate_interests';
  lawfulBasisJustification?: string;
  specialCategoryBasis?: string;
  specialCategoryJustification?: string;
  thirdCountryTransfers?: string[];
  transferSafeguards?: string;
  transferMechanism?: string;
  adequacyDecisionReference?: string;
  retentionPeriod: string;
  retentionJustification?: string;
  deletionProcedure?: string;
  securityMeasuresTechnical: string[];
  securityMeasuresOrganizational: string[];
  rightsAccessProcedure?: string;
  rightsRectificationProcedure?: string;
  rightsErasureProcedure?: string;
  rightsPortabilityProcedure?: string;
  rightsObjectionProcedure?: string;
  dpiaRequired: boolean;
  dpiaReference?: string;
  dpiaCompletionDate?: Date;
  isActive: boolean;
  effectiveFrom: Date;
  effectiveUntil?: Date;
  lastReviewedAt?: Date;
  lastReviewedBy?: string;
  nextReviewDue?: Date;
  reviewNotes?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

// =============================================================================
// AUDIT TYPES
// =============================================================================

export interface AuditLogEntry {
  id: string;
  schemaName: string;
  tableName: string;
  recordId: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'SELECT' | 'EXPORT' | 'SIGN' | 'APPROVE' | 'REJECT';
  oldData?: Record<string, any>;
  newData?: Record<string, any>;
  changedFields?: string[];
  userId: string;
  userName?: string;
  userRole?: string;
  userOrganization?: string;
  sessionId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
  occurredAt: Date;
  previousHash?: string;
  entryHash: string;
}

// =============================================================================
// API REQUEST/RESPONSE TYPES
// =============================================================================

export interface CreateExportJobRequest {
  tenantId: string;
  sourceEntityType: string;
  sourceEntityIds: string[];
  targetFormat: RegulatoryFormat;
  targetJurisdiction: string;
  targetAgency?: string;
  exportOptions?: Record<string, any>;
  includeAttachments?: boolean;
  includeAuditTrail?: boolean;
  scheduledAt?: string;
}

export interface UpdateExportJobStatusRequest {
  status: ExportStatus;
  progressPercent?: number;
  currentStep?: string;
  errorMessage?: string;
  errorDetails?: Record<string, any>;
}

export interface ApproveExportJobRequest {
  approved: boolean;
  comments?: string;
  signatureRequest: SignatureRequest;
}

export interface CreateAdverseEventRequest {
  tenantId: string;
  organizationId?: string;
  caseNumber: string;
  // Required since 2026-10-15: intake defaulted them ('spontaneous', 'initial',
  // not serious), and the exports filed those defaults as recorded facts.
  caseType: CaseType;
  reportType: ReportType;
  eventDate: string;
  eventDatePrecision?: DatePrecision;
  receiveDate: string;
  isSerious: boolean;
  seriousnessCriteria?: {
    death?: boolean;
    life_threatening?: boolean;
    hospitalization?: boolean;
    disability?: boolean;
    congenital_anomaly?: boolean;
    other_medically_important?: boolean;
    other_details?: string;
  };
  patient: PatientInfo;
  reactions: Reaction[];
  suspectProducts: SuspectProduct[];
  concomitantProducts?: SuspectProduct[];
  medicalHistory?: MedicalHistory;
  reporter: Reporter;
  // Optional since 2026-10-15 (intake took neither, so every case it recorded
  // failed E2B validation on sender.sender_type); see casePartyProblems.
  sender?: CaseSender;
  receiver?: CaseReceiver;
  caseNarrative?: string;
  status?: CaseStatus;
}

export interface TransformDataRequest {
  sourceData: Record<string, any>;
  targetFormat: RegulatoryFormat;
  targetJurisdiction: string;
  terminologyVersions?: Record<string, string>;
}

export interface TransformDataResponse {
  transformedData: Record<string, any>;
  warnings: ValidationWarning[];
  terminologyVersionsUsed: Record<string, TerminologyVersionLock>;
  transformationTimestamp: string;
}

export interface ExportResult {
  success?: boolean;
  xml?: string;
  json?: string;
  content?: string;
  contentType?: string;
  fileName?: string;
  metadata?: Record<string, unknown>;
  warnings: ValidationWarning[];
  errors?: ValidationError[];
  terminologyVersionsUsed?: Record<string, TerminologyVersionLock>;
  exportTimestamp?: string;
  contentHash?: string;
}

// =============================================================================
// CODE SYSTEM MAPPINGS
// =============================================================================

export interface CodeSystemMapping {
  system: string;
  mappings: Record<string, string>;
}

export const CODE_SYSTEMS: Record<string, Record<string, string>> = {
  ICH_SEX: {
    M: '1',
    F: '2',
    U: '0',
  },
  ICH_AGE_UNIT: {
    years: '801',
    months: '802',
    weeks: '803',
    days: '804',
    hours: '805',
  },
  ICH_QUALIFIER: {
    physician: '1',
    pharmacist: '2',
    other_health_professional: '3',
    lawyer: '4',
    consumer: '5',
  },
  ICH_OUTCOME: {
    recovered: '1',
    recovering: '2',
    not_recovered: '3',
    recovered_with_sequelae: '4',
    fatal: '5',
    unknown: '6',
  },
  ICH_SERIOUS: {
    true: '1',
    false: '2',
  },
  FDA_ROUTE: {
    oral: 'C38288',
    intravenous: 'C38276',
    intramuscular: 'C38274',
    subcutaneous: 'C38299',
    topical: 'C38304',
    inhalation: 'C38216',
    transdermal: 'C38305',
    rectal: 'C38295',
    ophthalmic: 'C38287',
    otic: 'C38192',
  },
  ISO_3166_1: {
    US: 'US',
    CA: 'CA',
    GB: 'GB',
    DE: 'DE',
    FR: 'FR',
    IT: 'IT',
    ES: 'ES',
    JP: 'JP',
    AU: 'AU',
    NZ: 'NZ',
  },
};

// =============================================================================
// UNITS — coded from what the case records, or the export is refused
// =============================================================================
// 2026-10-15: the E2B generator looked dose units up in ICH_AGE_UNIT, which
// holds none, so every dose was coded 003 (mg) and a 5 g dose filed as 5 mg;
// the 3500A generator assumed mg, kg and days. Only codes this engine is sure
// of are listed. An unlisted unit is an error, never a guess.

/** Dose units: the ICH E2B(R2) unit code (mass and volume, 001-013) and the UCUM code of an HL7 v3 PQ. */
export const DOSE_UNITS = {
  kg: { e2bR2: '001', ucum: 'kg' },
  g: { e2bR2: '002', ucum: 'g' },
  mg: { e2bR2: '003', ucum: 'mg' },
  ug: { e2bR2: '004', ucum: 'ug' },
  ng: { e2bR2: '005', ucum: 'ng' },
  pg: { e2bR2: '006', ucum: 'pg' },
  'mg/kg': { e2bR2: '007', ucum: 'mg/kg' },
  'ug/kg': { e2bR2: '008', ucum: 'ug/kg' },
  'mg/m2': { e2bR2: '009', ucum: 'mg/m2' },
  'ug/m2': { e2bR2: '010', ucum: 'ug/m2' },
  l: { e2bR2: '011', ucum: 'L' },
  ml: { e2bR2: '012', ucum: 'mL' },
  ul: { e2bR2: '013', ucum: 'uL' },
} as const;
export type DoseUnit = keyof typeof DOSE_UNITS;

/** The DOSE_UNITS entry a recorded spelling names ('mg', 'mcg', 'µg/kg', 'mL', 'mg/m²'), or null. */
export function doseUnit(recorded: unknown): (typeof DOSE_UNITS)[DoseUnit] | null {
  if (typeof recorded !== 'string') return null;
  const key = recorded.trim().toLowerCase().replace(/[µμ]|mc(?=g)/g, 'u').replace(/²/g, '2');
  return Object.prototype.hasOwnProperty.call(DOSE_UNITS, key) ? DOSE_UNITS[key as DoseUnit] : null;
}

/** Time units, keyed as in CODE_SYSTEMS.ICH_AGE_UNIT (the E2B(R2) 801-805 codes), with their UCUM code. */
export const TIME_UNIT_UCUM = { years: 'a', months: 'mo', weeks: 'wk', days: 'd', hours: 'h' } as const;
export type TimeUnit = keyof typeof TIME_UNIT_UCUM;

const TIME_UNIT_SPELLINGS = new Map<string, TimeUnit>([
  ['a', 'years'], ['y', 'years'], ['yr', 'years'], ['year', 'years'], ['years', 'years'],
  ['mo', 'months'], ['month', 'months'], ['months', 'months'],
  ['wk', 'weeks'], ['week', 'weeks'], ['weeks', 'weeks'],
  ['d', 'days'], ['day', 'days'], ['days', 'days'],
  ['h', 'hours'], ['hr', 'hours'], ['hour', 'hours'], ['hours', 'hours'],
]);

/** The time unit a recorded spelling names ('d', 'day', 'days', 'h', 'wk', ...), or null. */
export function timeUnit(recorded: unknown): TimeUnit | null {
  if (typeof recorded !== 'string') return null;
  return TIME_UNIT_SPELLINGS.get(recorded.trim().toLowerCase()) ?? null;
}

// =============================================================================
// CANONICAL CASE READS — shared by the exports. 2026-10-15: the generators read
// product_name, dose_value, meddra_pt_code and other names no type above
// defines, so a case recorded through intake lost those facts silently.
// =============================================================================

/** A recorded dose (SuspectProduct.dose is text) as one plain decimal; null when none is recorded or the text is not one. */
export function doseNumber(recorded: unknown): string | null {
  if (typeof recorded === 'number') return Number.isFinite(recorded) && recorded >= 0 ? String(recorded) : null;
  const text = typeof recorded === 'string' ? recorded.trim() : '';
  return /^\d+(\.\d+)?$/.test(text) ? text : null;
}

/**
 * A recorded term code that is MedDRA's: term_system MEDDRA, or none recorded
 * (the seeded mapping rules read reaction terms as MedDRA). Null otherwise.
 */
export function meddraCode(coded: { term_code?: string; term_system?: string } | undefined): string | null {
  if (!coded?.term_code) return null;
  return !coded.term_system || coded.term_system === 'MEDDRA' ? coded.term_code : null;
}

/** A calendar date as recorded: its precision, and its digits to that precision (CCYY, CCYYMM or CCYYMMDD). */
export interface RecordedDate {
  precision: DatePrecision;
  digits: string;
}

const PRECISION_RANK: Record<DatePrecision, number> = { year: 0, month: 1, day: 2 };

/** [CCYY, MM?, DD?] of an ISO 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD' string (a time after it ignored); null if it is none or no such day. */
function isoDateParts(text: string): string[] | null {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?:T|$)/.exec(text.trim());
  if (!match) return null;
  const parts = match.slice(1).filter((part): part is string => part !== undefined);
  const [year, month, day] = parts.map(Number);
  if (month !== undefined && (month < 1 || month > 12)) return null;
  if (day !== undefined && new Date(Date.UTC(year, month - 1, day)).getUTCDate() !== day) return null;
  return parts;
}

/** [CCYY, MM, DD] of a Date's UTC day; null for an invalid Date. */
function utcDateParts(value: Date): string[] | null {
  if (Number.isNaN(value.getTime())) return null;
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  return [pad(value.getUTCFullYear(), 4), pad(value.getUTCMonth() + 1, 2), pad(value.getUTCDate(), 2)];
}

/**
 * The calendar date a case records, read without a time-zone conversion: an
 * ISO 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD' string (a time after the date is
 * ignored), or a Date the service built from a DATE column, which is UTC
 * midnight of that day, so its UTC fields are the day. A recorded precision
 * coarser than the value applies; a finer one cannot add digits. Null when no
 * readable date is recorded. 2026-10-15: the exports read dates through new
 * Date() and local getters, so west of UTC '2026-03-15' (UTC midnight) was
 * filed as 20260314, and a month or a year was filed as a day.
 */
export function recordedDate(value: unknown, precision?: unknown): RecordedDate | null {
  const parts = value instanceof Date ? utcDateParts(value) : typeof value === 'string' ? isoDateParts(value) : null;
  if (!parts) return null;
  const own: DatePrecision = parts.length === 3 ? 'day' : parts.length === 2 ? 'month' : 'year';
  const stated = precision === 'year' || precision === 'month' || precision === 'day' ? precision : own;
  const used = PRECISION_RANK[stated] < PRECISION_RANK[own] ? stated : own;
  return { precision: used, digits: parts.slice(0, PRECISION_RANK[used] + 1).join('') };
}

/**
 * The dates both exports write from a case, as [field, value, recorded
 * precision], recorded or not (the receive date apart: it is required).
 */
export function caseDateFields(event: CanonicalAdverseEvent): Array<[string, unknown, unknown]> {
  const loose = (entry: unknown) => (entry ?? {}) as Record<string, unknown>;
  const fields: Array<[string, unknown, unknown]> = [
    ['patient.date_of_birth', event.patient?.date_of_birth, event.patient?.date_of_birth_precision],
  ];
  (event.medicalHistory?.conditions ?? []).map(loose).forEach((c, i) => {
    fields.push([`medicalHistory.conditions[${i}].start_date`, c.start_date, c.start_date_precision]);
    fields.push([`medicalHistory.conditions[${i}].end_date`, c.end_date, c.end_date_precision]);
  });
  (event.reactions ?? []).map(loose).forEach((r, i) => {
    fields.push([`reactions[${i}].onset_date`, r.onset_date, r.onset_date_precision]);
    fields.push([`reactions[${i}].end_date`, r.end_date, r.end_date_precision]);
  });
  for (const [list, products] of Object.entries({ suspectProducts: event.suspectProducts, concomitantProducts: event.concomitantProducts })) {
    (products ?? []).map(loose).forEach((p, i) => {
      fields.push([`${list}[${i}].start_date`, p.start_date, p.start_date_precision]);
      fields.push([`${list}[${i}].end_date`, p.end_date, p.end_date_precision]);
    });
  }
  return fields;
}

/** Whether a field holds a recorded value (not undefined, null or empty text). */
export const isRecorded = (value: unknown): boolean => value !== undefined && value !== null && value !== '';

/**
 * The MedDRA-coded reactions recorded in a version other than the one the
 * export job locked (conflicts), and those that record no version (unchecked).
 * 2026-10-15: term_version was not read, so a reaction coded in MedDRA 25.0
 * was filed under a 26.1 lock as a 26.1 code.
 */
export function meddraVersionCheck(reactions: Reaction[] | undefined, locked: string): {
  conflicts: Array<{ index: number; term: string; recorded: string }>;
  unrecorded: Array<{ index: number; term: string }>;
} {
  const coded = (reactions ?? []).map((reaction, index) => ({ reaction, index })).filter(({ reaction }) => meddraCode(reaction));
  const recorded = (r: Reaction) => (typeof r.term_version === 'string' ? r.term_version.trim() : '');
  return {
    conflicts: coded
      .filter(({ reaction }) => recorded(reaction) && recorded(reaction) !== locked.trim())
      .map(({ reaction, index }) => ({ index, term: String(reaction.term ?? ''), recorded: recorded(reaction) })),
    unrecorded: coded.filter(({ reaction }) => !recorded(reaction)).map(({ reaction, index }) => ({ index, term: String(reaction.term ?? '') })),
  };
}

/** The sender block (C.3; M.1.5 sender_identifier) keyed as the exports read it. */
export const CASE_SENDER_FIELDS = [
  'sender_type', 'sender_identifier', 'sender_organization', 'sender_department', 'sender_title',
  'sender_given_name', 'sender_middle_name', 'sender_family_name', 'sender_street', 'sender_city',
  'sender_state', 'sender_postcode', 'sender_country', 'sender_telephone', 'sender_fax', 'sender_email',
] as const;
/** The receiver block (M.1.6 receiver_identifier) keyed as the E2B export reads it. */
export const CASE_RECEIVER_FIELDS = ['receiver_identifier', 'receiver_type', 'receiver_organization', 'receiver_country'] as const;
export type CaseSender = Partial<Record<(typeof CASE_SENDER_FIELDS)[number], string>>;
export type CaseReceiver = Partial<Record<(typeof CASE_RECEIVER_FIELDS)[number], string>>;

/**
 * What stops a recorded sender or receiver block from being exported as
 * recorded, each naming its field; empty when nothing does (or no block is
 * recorded). Intake refuses on these and the exports apply the same rules: each
 * value is written as text, so it is non-empty text; the type is an E2B code
 * (one digit, as sendertype and receivertype take it); and a key the exports do
 * not read would be stored and never exported, so it is refused.
 */
export function casePartyProblems(kind: 'sender' | 'receiver', block: unknown): Array<{ field: string; message: string }> {
  if (block === undefined || block === null) return [];
  if (typeof block !== 'object' || Array.isArray(block)) {
    return [{ field: kind, message: `${kind} must be an object of ${kind} fields` }];
  }
  const fields: readonly string[] = kind === 'sender' ? CASE_SENDER_FIELDS : CASE_RECEIVER_FIELDS;
  return Object.entries(block).flatMap(([key, value]) => {
    const field = `${kind}.${key}`;
    if (!fields.includes(key)) {
      return [{ field, message: `${field} is not a field the exports read (they read ${fields.join(', ')})` }];
    }
    if (typeof value !== 'string' || value.trim() === '') return [{ field, message: `${field} must be non-empty text` }];
    if (key === `${kind}_type` && !/^\d$/.test(value.trim())) {
      return [{ field, message: `${field} "${value}" is not an E2B ${kind}type code (one digit); text is not coded by guess` }];
    }
    return [];
  });
}

/** The ICH qualification code (CODE_SYSTEMS.ICH_QUALIFIER) a reporter records: qualification_code, else the qualification named; or null. */
export function qualificationCode(reporter: Pick<Reporter, 'qualification' | 'qualification_code'> | undefined): string | null {
  const code = reporter?.qualification_code?.trim() ?? '';
  if (Object.values(CODE_SYSTEMS.ICH_QUALIFIER).includes(code)) return code;
  const named = (reporter?.qualification ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return Object.prototype.hasOwnProperty.call(CODE_SYSTEMS.ICH_QUALIFIER, named) ? CODE_SYSTEMS.ICH_QUALIFIER[named] : null;
}
