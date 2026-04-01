export type SubmissionLifecycleState =
  | 'drafting'
  | 'internal_review'
  | 'submission_assembly'
  | 'gateway_ready'
  | 'submitted'
  | 'acknowledged'
  | 'filing_review'
  | 'under_review'
  | 'information_request_open'
  | 'major_amendment_pending'
  | 'discipline_review_active'
  | 'advisory_committee'
  | 'action_pending'
  | 'approved'
  | 'complete_response_outcome'
  | 'refuse_to_file_or_reject'
  | 'clinical_hold_or_partial_hold'
  | 'post_action_commitments'
  | 'closed_or_archived';

export type CorrespondenceDirection = 'inbound' | 'outbound' | 'internal';

export type CorrespondenceType =
  | 'acknowledgment_letter'
  | 'filing_communication'
  | 'refuse_to_file_letter'
  | 'information_request'
  | 'discipline_review_question'
  | 'hold_letter'
  | 'deficiency_letter'
  | 'major_objection'
  | 'complete_response_letter'
  | 'approval_letter'
  | 'postmarketing_commitment_letter'
  | 'meeting_minutes'
  | 'cover_letter'
  | 'response_letter'
  | 'amendment_letter'
  | 'clarification_response'
  | 'meeting_materials'
  | 'follow_up_correspondence'
  | 'triage_memo'
  | 'deficiency_summary'
  | 'response_plan'
  | 'issue_tracker'
  | 'remediation_memo'
  | 'executive_briefing';

export type CorrespondenceIssueCategory =
  | 'administrative_completeness'
  | 'ectd_technical_formatting'
  | 'filing_acceptance_issue'
  | 'cmc_quality_issue'
  | 'nonclinical_issue'
  | 'clinical_efficacy_issue'
  | 'clinical_safety_issue'
  | 'biostatistics_analysis_issue'
  | 'comparator_study_design_issue'
  | 'endpoint_labeling_issue'
  | 'device_evidence_equivalence_issue'
  | 'risk_benefit_issue'
  | 'missing_information_clarification'
  | 'postmarketing_commitment_issue'
  | 'inspection_compliance_issue'
  | 'other_unclassified';

export interface Submission {
  id: string;
  projectId: number;
  organizationId: number;
  submissionType: string;
  regulator: string;
  center?: string;
  division?: string;
  applicationNumber?: string;
  sequenceNumber?: string;
  lifecycleState: SubmissionLifecycleState;
  clockMetadata?: Record<string, unknown>;
  linkedArtifactIds: string[];
  linkedCommunicationIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Correspondence {
  id: string;
  projectId: number;
  submissionId: string;
  direction: CorrespondenceDirection;
  sourceChannel: 'manual_upload' | 'mailbox_sync' | 'api_import';
  communicationType: CorrespondenceType;
  subject: string;
  sender?: string;
  recipients: string[];
  receivedAt?: string;
  sentAt?: string;
  dueDate?: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  responseRequired: boolean;
  status: 'new' | 'triaged' | 'in_progress' | 'responded' | 'closed';
  sourceMessageId?: string;
  sourceThreadId?: string;
  sourceMailboxId?: string;
  parserMetadata?: Record<string, unknown>;
  attachmentIds: string[];
  parsedText?: string;
  summary?: string;
}

export interface CorrespondenceIssue {
  id: string;
  correspondenceId: string;
  category: CorrespondenceIssueCategory;
  subcategory?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  blocker: boolean;
  responseRequired: boolean;
  sourceExcerpt?: string;
  confidence: number;
  humanReviewStatus: 'pending' | 'confirmed' | 'edited' | 'rejected';
  dueDate?: string;
  mappedCtdSections: string[];
  mappedArtifactIds: string[];
  owner?: string;
  resolutionStatus: 'open' | 'in_progress' | 'resolved' | 'waived';
  structuredExtraction?: {
    regulatorAskType: string;
    impactedSubmissionComponent: string;
    sectionCandidates: string[];
    recommendedOwnerFunction: string;
    recommendedResponsePackageType: string;
    evidenceNeeds: string[];
    confidenceTrace: Array<{ signal: string; score: number; deterministic: boolean }>;
    humanReviewRequired: boolean;
    responseDeadlineSignal?: string;
  };
}

export interface ResponsePackage {
  id: string;
  sourceCorrespondenceId: string;
  title: string;
  status: 'draft' | 'review' | 'approval' | 'assembled' | 'sent';
  issueMatrixArtifactId?: string;
  coverLetterArtifactId?: string;
  revisedArtifactIds: string[];
  assembledSequenceId?: string;
}

export interface MailboxConnection {
  id: string;
  provider: 'microsoft365' | 'gmail' | 'imap' | 'other';
  mailboxIdentifier: string;
  authState: 'connected' | 'expired' | 'error' | 'revoked';
  tokenReference?: string;
  scopes: string[];
  syncStatus: 'idle' | 'syncing' | 'error';
  cursor?: string;
  lastSyncAt?: string;
  errorState?: string;
}
