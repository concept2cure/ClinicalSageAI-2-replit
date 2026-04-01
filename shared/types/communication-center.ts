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

export interface SubmissionCenterItemRecord {
  id: string;
  organizationId: number;
  projectId: number;
  title: string;
  authority: string;
  submissionType: 'IND' | 'NDA' | 'BLA' | '510k' | 'PMA' | 'MAA' | 'ANDA' | 'Other';
  sequenceNumber?: string;
  gatewayProfile?: string;
  status: SubmissionCenterItemState;
  ectdPath?: string;
  dispatchReady: boolean;
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const REGULATORY_AUTHORITY_PROFILE_TEMPLATES: Array<
  Pick<
    AuthorityProfileRecord,
    | 'authority'
    | 'centerOrDivision'
    | 'channelType'
    | 'submissionTransport'
    | 'acceptedFormats'
    | 'validationRequirements'
    | 'packageConstraints'
    | 'acknowledgmentModel'
    | 'messageReceiptModel'
    | 'metadataRequirements'
    | 'isActive'
  >
> = [
  {
    authority: 'FDA',
    centerOrDivision: 'CDRH (Device)',
    channelType: 'portal',
    submissionTransport: 'eSTAR via CDRH Customer Collaboration Portal',
    acceptedFormats: ['eSTAR package', 'ZIP'],
    validationRequirements: ['eSTAR completeness checks', 'device attachment checks'],
    packageConstraints: ['governed export consequence required'],
    acknowledgmentModel: 'portal receipt and review status updates',
    messageReceiptModel: 'portal messages + formal correspondence letters',
    metadataRequirements: ['submission identifier', 'organization context'],
    isActive: true,
  },
  {
    authority: 'FDA',
    centerOrDivision: 'CDER/CBER',
    channelType: 'gateway',
    submissionTransport: 'ESG NextGen (USP/API/AS2)',
    acceptedFormats: ['eCTD sequence'],
    validationRequirements: ['gateway ack sequence', 'technical validation'],
    packageConstraints: ['sequence lifecycle management'],
    acknowledgmentModel: 'transport ACK + technical ACK',
    messageReceiptModel: 'gateway receipt and status polling',
    metadataRequirements: ['gateway account metadata', 'sequence number'],
    isActive: true,
  },
  {
    authority: 'EMA',
    centerOrDivision: 'eSubmission Gateway/Web Client',
    channelType: 'gateway',
    submissionTransport: 'eSubmission Gateway/Web Client',
    acceptedFormats: ['eCTD package', 'delivery XML'],
    validationRequirements: ['XML delivery file required', 'gateway ack validation'],
    packageConstraints: ['EU regional metadata'],
    acknowledgmentModel: 'gateway ACK lifecycle',
    messageReceiptModel: 'gateway + official correspondence',
    metadataRequirements: ['delivery XML metadata'],
    isActive: true,
  },
  {
    authority: 'Health Canada',
    centerOrDivision: 'CESG / REP',
    channelType: 'mixed',
    submissionTransport: 'CESG + REP pathways',
    acceptedFormats: ['eCTD sequence', 'regional package'],
    validationRequirements: ['commercial eCTD validator recommended'],
    packageConstraints: ['regional filing profile constraints'],
    acknowledgmentModel: 'gateway receipt + regulatory correspondence',
    messageReceiptModel: 'mixed portal/gateway communications',
    metadataRequirements: ['regional delivery metadata'],
    isActive: true,
  },
  {
    authority: 'TGA',
    centerOrDivision: 'TGA Business Services',
    channelType: 'portal',
    submissionTransport: 'TBS account + e-ID pathway',
    acceptedFormats: ['eCTD package'],
    validationRequirements: ['prescription medicine eCTD requirement'],
    packageConstraints: ['TGA account/e-ID operational dependency'],
    acknowledgmentModel: 'portal acknowledgment and lifecycle updates',
    messageReceiptModel: 'portal + official correspondence',
    metadataRequirements: ['TBS account metadata'],
    isActive: true,
  },
  {
    authority: 'PMDA',
    centerOrDivision: 'PMDA eCTD',
    channelType: 'mixed',
    submissionTransport: 'PMDA eCTD v4 aligned pathway',
    acceptedFormats: ['eCTD v4 package'],
    validationRequirements: ['PMDA validator tooling alignment'],
    packageConstraints: ['PMDA implementation material constraints'],
    acknowledgmentModel: 'receipt + technical review acknowledgment',
    messageReceiptModel: 'mixed technical + correspondence events',
    metadataRequirements: ['regional metadata package'],
    isActive: true,
  },
];
