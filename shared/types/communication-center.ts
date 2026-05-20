export const COMMUNICATION_VISIBILITY_TIERS = [
  'client_internal',
  'c2c_internal',
  'shared_client_c2c',
  'publishops_only',
  'restricted_legal_sensitive',
] as const;

export type CommunicationVisibilityTier = (typeof COMMUNICATION_VISIBILITY_TIERS)[number];

export const PUBLISHOPS_SERVICE_STATES = [
  'requested',
  'entitlement_review',
  'accepted',
  'awaiting_materials',
  'in_technical_publishing_review',
  'in_compile',
  'in_validation_remediation',
  'ready_for_dispatch',
  'dispatched_or_handed_off',
  'monitoring_acknowledgments',
  'response_support_active',
  'completed',
  'closed',
] as const;

export type PublishOpsServiceState = (typeof PUBLISHOPS_SERVICE_STATES)[number];

export const SUBMISSION_CENTER_ITEM_STATES = [
  'draft',
  'preparing',
  'ready_for_publish',
  'published',
  'submitted_to_gateway',
  'acknowledged_by_gateway',
  'accepted_by_authority',
  'rejected_or_remediation',
] as const;

export type SubmissionCenterItemState = (typeof SUBMISSION_CENTER_ITEM_STATES)[number];

export interface SubmissionCenterItemRecord {
  id: string;
  organizationId: number;
  projectId: number;
  itemId?: string;
  itemType?: string;
  state?: SubmissionCenterItemState;
  status?: string;
  title?: string;
  description?: string;
  authority?: string;
  submissionType?: string;
  sequenceNumber?: string;
  gatewayProfile?: string;
  ectdPath?: string;
  dispatchReady?: boolean;
  packageRef?: string;
  submissionRef?: string;
  gatewayRef?: string;
  acknowledgmentRef?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string | number;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export const REGULATORY_AUTHORITY_PROFILE_TEMPLATES = [
  {
    authority: 'FDA',
    centerOrDivision: 'CDRH',
    channelType: 'gateway' as const,
    submissionTransport: 'FDA ESG',
    acceptedFormats: ['eCTD', 'eSTAR'],
    validationRequirements: ['eCTD validator', 'PDF Q&A'],
    packageConstraints: ['10GB max'],
    acknowledgmentModel: 'three-stage',
    messageReceiptModel: 'gateway_email',
    metadataRequirements: ['Submission Type', 'Submission Number'],
  },
  {
    authority: 'FDA',
    centerOrDivision: 'CDER',
    channelType: 'gateway' as const,
    submissionTransport: 'FDA ESG',
    acceptedFormats: ['eCTD'],
    validationRequirements: ['eCTD validator'],
    packageConstraints: ['Standard eCTD'],
    acknowledgmentModel: 'three-stage',
    messageReceiptModel: 'gateway_email',
    metadataRequirements: ['Submission Type', 'Application Number'],
  },
  {
    authority: 'EMA',
    centerOrDivision: 'CHMP',
    channelType: 'gateway' as const,
    submissionTransport: 'EMA Gateway',
    acceptedFormats: ['eCTD'],
    validationRequirements: ['EU eCTD validator'],
    packageConstraints: ['EU eCTD'],
    acknowledgmentModel: 'two-stage',
    messageReceiptModel: 'gateway_portal',
    metadataRequirements: ['Procedure Number'],
  },
] as const;

export interface AuthorityProfileRecord {
  id: string;
  organizationId: number;
  projectId: number;
  authority: string;
  centerOrDivision: string;
  channelType: 'portal' | 'gateway' | 'email' | 'mixed';
  submissionTransport: string;
  acceptedFormats: string[];
  validationRequirements: string[];
  packageConstraints: string[];
  acknowledgmentModel: string;
  messageReceiptModel: string;
  metadataRequirements: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgencyCommunicationEventRecord {
  id: string;
  organizationId: number;
  projectId: number;
  sourceType:
    | 'agency_portal_event'
    | 'gateway_acknowledgment'
    | 'validation_result'
    | 'email_request_or_letter'
    | 'uploaded_official_correspondence'
    | 'meeting_minutes'
    | 'managed_service_operator_event'
    | 'manual_logged_event'
    | 'internal_discussion_linked';
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
    visibilityTier: CommunicationVisibilityTier;
  };
}

export interface PublishOpsServiceRecord {
  id: string;
  organizationId: number;
  projectId: number;
  status: PublishOpsServiceState;
  serviceRequestTitle: string;
  entitlementLevel:
    | 'core_self_serve'
    | 'advanced_publishing_tooling'
    | 'managed_publishops_service';
  requestedByRole:
    | 'managed_submission_operator'
    | 'managed_submission_reviewer'
    | 'client_project_owner'
    | 'client_reviewer'
    | 'outside_consultant';
  requestedBy: string;
  operatorAssignee?: string;
  blockedReason?: string;
  createdAt: string;
  updatedAt: string;
}
