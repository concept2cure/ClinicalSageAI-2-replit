/**
 * Type definitions for FDA Integration Service
 * Covers FDA ESG, openFDA API, and UDI database types
 */

// ============================================================================
// Validation and Configuration Types
// ============================================================================

export interface FDACredentialsResult {
  valid: boolean;
  message: string;
  certExpiry?: string;
  error?: string;
}

export interface CertificateExpiryInfo {
  expired: boolean;
  expiryDate?: string;
  daysRemaining?: number;
}

export interface ConnectivityTestResult {
  success: boolean;
  error?: string;
  latencyMs?: number;
}

// ============================================================================
// openFDA Device Search Types
// ============================================================================

export interface OpenFDADeviceResult {
  kNumber?: string;
  deviceName: string;
  applicant: string;
  decisionDate?: string;
  decisionCode?: string;
  productCode?: string;
  regulationNumber?: string;
  statementText?: string;
  predicates: string[];
}

export interface DeviceSearchResult {
  success: boolean;
  count?: number;
  devices: OpenFDADeviceResult[];
  error?: string;
}

// ============================================================================
// UDI (Unique Device Identifier) Types
// ============================================================================

export interface UDIData {
  deviceIdentifier: string;
  brandName?: string;
  versionModelNumber?: string;
  companyName?: string;
  catalogNumber?: string;
  deviceDescription?: string;
  gmdnTerms?: string[];
  productCodes?: string[];
  fdaProductCode?: string;
  deviceClass?: string;
  isDirectMarkingExempt?: boolean;
  isSingleUse?: boolean;
  hasNaturalRubberLatex?: boolean;
  mriSafetyStatus?: string;
  sterilization?: {
    sterilizationPriorToUse?: boolean;
    sterilizationMethod?: string;
  };
}

export interface UDILookupResult {
  success: boolean;
  udi?: UDIData;
  message?: string;
  error?: string;
}

// ============================================================================
// Submission Types
// ============================================================================

export type SubmissionType = '510k' | 'pma' | 'denovo' | 'ide';

export interface ApplicantInfo {
  name?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  contact?: {
    name?: string;
    phone?: string;
    email?: string;
    fax?: string;
  };
  dunsNumber?: string;
  feiNumber?: string;
}

export interface DeviceInfo {
  deviceName?: string;
  classification?: string;
  productCode?: string;
  regulationNumber?: string;
  indications?: string[];
  clinicalData?: Record<string, unknown>;
  predicateDevices?: string[];
}

export interface SubmissionDocument {
  id: number;
  submissionId: number;
  submissionType: string;
  filename?: string;
  documentType?: string;
  s3Key?: string;
  uploadedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface ECTDPackage {
  submissionType: SubmissionType;
  submissionNumber?: string;
  applicant?: ApplicantInfo;
  device?: DeviceInfo;
  documents?: SubmissionDocument[];
  xml?: string;
}

export interface FHIRBundle {
  resourceType: 'Bundle';
  type: 'collection';
  entry: Array<{
    resource: Record<string, unknown>;
  }>;
}

export interface SignedPackage {
  signature: string;
  payload: string;
  algorithm: string;
  certificateFingerprint: string;
}

export interface SubmissionEnvelope {
  submissionType: string;
  submissionId?: string;
  timestamp: string;
  signature?: string;
  payload?: string;
}

export interface PackageResult {
  success: boolean;
  package?: SubmissionEnvelope;
  checksum?: string;
  error?: string;
}

// ============================================================================
// FDA ESG (Electronic Submission Gateway) Types
// ============================================================================

export interface ESGSubmitResult {
  success: boolean;
  trackingNumber?: string;
  message?: string;
  acknowledgmentId?: string;
  estimatedReviewDate?: string;
  error?: string;
}

export interface SubmissionStatusUpdate {
  status:
    | 'submitted'
    | 'received'
    | 'acknowledged'
    | 'in_review'
    | 'complete'
    | 'rejected'
    | 'error';
  statusDate: string;
  details?: string;
  actionRequired?: string;
  nextReviewDate?: string;
}

export interface SubmissionStatusResult {
  success: boolean;
  status?: SubmissionStatusUpdate;
  history?: SubmissionStatusUpdate[];
  error?: string;
}

// ============================================================================
// Integration Logging Types
// ============================================================================

export type IntegrationAction =
  | 'CREDENTIAL_CHECK'
  | 'CERTIFICATE_CHECK'
  | 'CONNECTIVITY_TEST'
  | 'CREDENTIAL_VALIDATION'
  | 'DEVICE_SEARCH'
  | 'UDI_LOOKUP'
  | 'PMA_PACKAGING'
  | '510K_PACKAGING'
  | 'DENOVO_PACKAGING'
  | 'ESG_SUBMISSION'
  | 'STATUS_CHECK'
  | 'ACKNOWLEDGE_RECEIPT'
  | 'FHIR_BUNDLE_CREATE'
  | 'ECTD_PACKAGE_CREATE'
  | 'DIGITAL_SIGNATURE';

export type IntegrationStatus = 'success' | 'error' | 'warning' | 'info';

export interface IntegrationLogEntry {
  organizationId: number;
  action: IntegrationAction;
  status: IntegrationStatus;
  details?: Record<string, unknown>;
  timestamp?: Date;
}

// ============================================================================
// Service Class Types
// ============================================================================

export interface FDAIntegrationServiceConfig {
  fdaApiBase?: string;
  openFDABase?: string;
  esgEndpoint?: string;
  fdaApiKey?: string;
  fdaCertificate?: string;
  fdaPrivateKey?: string;
  statusPollingInterval?: number;
}

export interface SubmissionQueueEntry {
  submissionId: number;
  organizationId: number;
  trackingNumber: string;
  status: string;
  lastChecked: Date;
  createdAt: Date;
}
