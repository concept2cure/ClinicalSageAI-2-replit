export type AuthorityChannelType = 'portal' | 'gateway' | 'email' | 'mixed';

export interface AuthorityProfile {
  id: string;
  authority: string;
  centerOrDivision: string;
  region: 'US' | 'EU' | 'CA' | 'AU' | 'JP' | 'GLOBAL';
  submissionTransport: string;
  acceptedFormats: string[];
  validationRequirements: string[];
  packageConstraints: string[];
  acknowledgmentModel: string;
  messageReceiptModel: string;
  metadataRequirements: string[];
  channelType: AuthorityChannelType;
}

export type AgencyEventSourceType =
  | 'agency_portal_event'
  | 'gateway_acknowledgment'
  | 'validation_result'
  | 'email_request_or_letter'
  | 'uploaded_official_correspondence'
  | 'meeting_minutes'
  | 'managed_service_operator_event'
  | 'manual_logged_event'
  | 'internal_discussion_linked';

export interface AgencyCommunicationEvent {
  id: string;
  sourceType: AgencyEventSourceType;
  communicationType: string;
  sourceChannel: string;
  linkedSubmissionId?: string;
  linkedPackageId?: string;
  linkedSectionCodes: string[];
  linkedArtifactIds: string[];
  receivedDate: string;
  dueDate?: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  responseRequired: boolean;
  extractedIssues: string[];
  humanReviewStatus: 'pending_review' | 'triaged' | 'actioned';
  closureStatus: 'open' | 'in_progress' | 'closed';
  auditMetadata: {
    capturedBy: string;
    capturedAt: string;
    visibilityTier:
      | 'client_internal'
      | 'c2c_internal'
      | 'shared_client_c2c'
      | 'publishops_only'
      | 'restricted_legal_sensitive';
  };
}

export type PublishOpsServiceState =
  | 'requested'
  | 'entitlement_review'
  | 'accepted'
  | 'awaiting_materials'
  | 'in_technical_publishing_review'
  | 'in_compile'
  | 'in_validation_remediation'
  | 'ready_for_dispatch'
  | 'dispatched_or_handed_off'
  | 'monitoring_acknowledgments'
  | 'response_support_active'
  | 'completed'
  | 'closed';

export type PublishOpsRole =
  | 'managed_submission_operator'
  | 'managed_submission_reviewer'
  | 'client_project_owner'
  | 'client_reviewer'
  | 'outside_consultant';

export const DEFAULT_AUTHORITY_PROFILES: AuthorityProfile[] = [
  {
    id: 'fda-cdrh-estar',
    authority: 'FDA',
    centerOrDivision: 'CDRH (Device)',
    region: 'US',
    submissionTransport: 'eSTAR + CDRH Customer Collaboration Portal',
    acceptedFormats: ['eSTAR package', 'ZIP artifacts'],
    validationRequirements: ['eSTAR completeness', 'attachment checks'],
    packageConstraints: ['Device-specific templates', 'governed export record required'],
    acknowledgmentModel: 'Portal status + receipt updates',
    messageReceiptModel: 'Portal events and manual correspondence',
    metadataRequirements: ['organization context', 'submission identifier'],
    channelType: 'portal',
  },
  {
    id: 'fda-esg-nextgen',
    authority: 'FDA',
    centerOrDivision: 'CDER/CBER (Drug/Biologic)',
    region: 'US',
    submissionTransport: 'ESG NextGen (USP/API/AS2)',
    acceptedFormats: ['eCTD sequence', 'gateway payload'],
    validationRequirements: ['gateway ack', 'eCTD technical validation'],
    packageConstraints: ['sequence lifecycle rules'],
    acknowledgmentModel: 'transport + technical acknowledgments',
    messageReceiptModel: 'Gateway acknowledgment feed',
    metadataRequirements: ['account routing metadata', 'sequence metadata'],
    channelType: 'gateway',
  },
  {
    id: 'ema-esubmission',
    authority: 'EMA',
    centerOrDivision: 'EMA eSubmission',
    region: 'EU',
    submissionTransport: 'eSubmission Gateway/Web Client',
    acceptedFormats: ['eCTD package', 'mandatory XML delivery file'],
    validationRequirements: ['XML delivery file checks', 'technical validation'],
    packageConstraints: ['region-specific dossier metadata'],
    acknowledgmentModel: 'gateway receipt and validation updates',
    messageReceiptModel: 'gateway + portal updates',
    metadataRequirements: ['delivery file metadata'],
    channelType: 'gateway',
  },
];

export const DEFAULT_AGENCY_EVENTS: AgencyCommunicationEvent[] = [
  {
    id: 'evt-ack-001',
    sourceType: 'gateway_acknowledgment',
    communicationType: 'technical_acknowledgment_received',
    sourceChannel: 'ESG NextGen',
    linkedSubmissionId: 'subm-2026-03',
    linkedPackageId: 'pkg-12',
    linkedSectionCodes: ['3.2.P'],
    linkedArtifactIds: ['artifact-55'],
    receivedDate: '2026-03-28T10:14:00Z',
    urgency: 'medium',
    responseRequired: false,
    extractedIssues: [],
    humanReviewStatus: 'triaged',
    closureStatus: 'closed',
    auditMetadata: {
      capturedBy: 'system',
      capturedAt: '2026-03-28T10:14:03Z',
      visibilityTier: 'shared_client_c2c',
    },
  },
  {
    id: 'evt-val-002',
    sourceType: 'validation_result',
    communicationType: 'validation_failed',
    sourceChannel: 'Package Preflight',
    linkedSubmissionId: 'subm-2026-03',
    linkedPackageId: 'pkg-12',
    linkedSectionCodes: ['1.2', '2.5'],
    linkedArtifactIds: ['artifact-22', 'artifact-41'],
    receivedDate: '2026-03-30T08:05:00Z',
    dueDate: '2026-04-03T17:00:00Z',
    urgency: 'high',
    responseRequired: true,
    extractedIssues: ['Missing regional metadata', 'Invalid naming convention in attachment set'],
    humanReviewStatus: 'actioned',
    closureStatus: 'in_progress',
    auditMetadata: {
      capturedBy: 'publishops.operator@concept2cure.ai',
      capturedAt: '2026-03-30T08:07:44Z',
      visibilityTier: 'shared_client_c2c',
    },
  },
];
