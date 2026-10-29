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

/** A Submission Center submission an agency communication concerns. */
export interface LinkedSubmission {
  id: number;
  title: string | null;
  applicationType: string | null;
  primaryRegion: string | null;
}

/**
 * What the inbox shows of a letter's response clock
 * (server/services/regulatory-correspondence/response-clock.ts):
 *   dated     the due date, and whether the agency stated it or it is derived from the class's codified window;
 *   undated   a response is owed and neither a stated date nor a codified window exists;
 *   untracked no clock: the letter needs no response, is closed, or its class asks for nothing or was not recorded.
 */
export type InboxResponseClock =
  | { state: 'dated'; dueDate: string; dueDateSource: 'agency_stated' | 'derived_from_window'; daysUntilDue: number;
      bucket: 'overdue' | 'due_soon' | 'upcoming'; windowDays: number | null; citation: string | null; consequence: string | null }
  | { state: 'undated'; daysSinceReceived: number; consequence: string | null }
  | { state: 'untracked'; reason: string };

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
  /**
   * The submission linkedSubmissionId names, as the inbox shows it: a live
   * submission of the project's program. Null when the stored value names none
   * (an older unchecked value, or a submission since removed).
   */
  linkedSubmission?: LinkedSubmission | null;
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
  /** The letter's class (AGENCY_LETTER_CLASSES), which its response clock reads; null when none was recorded. */
  letterClass?: string | null;
  /** The response clock on the letter, read by the server (P-39 step 3, S4). */
  responseClock?: InboxResponseClock;
  auditMetadata: {
    capturedBy: string;
    capturedAt: string;
    visibilityTier: CommunicationVisibilityTier;
    companyLegalDocuments?: import('../company-correspondence').CompanyLegalCommunicationLink[];
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

/**
 * Reference authority-profile templates surfaced by the
 * /authority-profiles/templates endpoint. These describe the canonical
 * channel/transport configuration per authority; project/organization scope
 * is layered on at request time.
 */
export type AuthorityProfileTemplate = Omit<
  AuthorityProfileRecord,
  'id' | 'organizationId' | 'projectId' | 'createdBy' | 'createdAt' | 'updatedAt'
>;

export const REGULATORY_AUTHORITY_PROFILE_TEMPLATES: AuthorityProfileTemplate[] = [
  {
    authority: 'FDA',
    centerOrDivision: 'CDER',
    channelType: 'gateway',
    submissionTransport: 'ESG_AS2',
    acceptedFormats: ['eCTD'],
    validationRequirements: ['eCTD_validation', 'technical_rejection_criteria'],
    packageConstraints: ['module_1_us_regional'],
    acknowledgmentModel: 'gateway_receipt_then_acknowledgment',
    messageReceiptModel: 'message_delivery_notification',
    metadataRequirements: ['application_number', 'sequence_number', 'submission_type'],
    isActive: true,
  },
  {
    authority: 'EMA',
    centerOrDivision: 'Human Medicines',
    channelType: 'gateway',
    submissionTransport: 'eSubmission_Gateway',
    acceptedFormats: ['eCTD'],
    validationRequirements: ['eu_ectd_validation'],
    packageConstraints: ['module_1_eu_regional'],
    acknowledgmentModel: 'gateway_receipt_then_acknowledgment',
    messageReceiptModel: 'delivery_notification',
    metadataRequirements: ['procedure_number', 'sequence_number'],
    isActive: true,
  },
];
