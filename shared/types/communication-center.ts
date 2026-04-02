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
