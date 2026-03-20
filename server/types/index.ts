/**
 * Central type exports for Concept2Cure.RI server types
 * Central type exports for Concept2Cure server types
 * Import from this file for all server-side type definitions
 */

// FDA Integration Types (exclude ApplicantInfo and SubmissionDocument - duplicated in medical-device)
export {
  FDACredentialsResult,
  CertificateExpiryInfo,
  ConnectivityTestResult,
  OpenFDADeviceResult,
  DeviceSearchResult,
  UDIData,
  UDILookupResult,
  SubmissionType,
  DeviceInfo,
  ECTDPackage,
  FHIRBundle,
  SignedPackage,
  SubmissionEnvelope,
  PackageResult,
  ESGSubmitResult,
  SubmissionStatusUpdate,
  SubmissionStatusResult,
  IntegrationAction,
  IntegrationStatus,
  IntegrationLogEntry,
  FDAIntegrationServiceConfig,
  SubmissionQueueEntry,
} from './fda-integration';

// Medical Device Service Types (canonical - includes ApplicantInfo, SubmissionDocument)
export * from './medical-device';

// Re-export common Express types from shared (declaration file)
export type {
  ApiSuccessResponse,
  ApiErrorResponse,
  PaginatedResult,
  AsyncRequestHandler,
  Middleware,
} from '../../shared/types/express.d';
