import type {
  Correspondence,
  CorrespondenceIssue,
  ResponsePackage,
  Submission,
} from './regulatory-correspondence';

export interface CanonicalSubmissionRecord extends Submission {
  unresolvedCorrespondenceIssueCount: number;
  activeResponsePackageIds: string[];
  publishRiskState: 'clear' | 'at_risk' | 'blocked';
}

export interface CanonicalCorrespondenceRecord extends Correspondence {
  issueIds: string[];
  impactLinkageIds: string[];
}

export interface CanonicalActionTask {
  id: string;
  taskType:
    | 'correspondence_triage'
    | 'issue_review'
    | 'evidence_request'
    | 'section_revision'
    | 'response_package_drafting'
    | 'approval_review'
    | 'publish_gate_remediation'
    | 'regulator_follow_up'
    | 'mailbox_sync_exception'
    | 'digest_acknowledgment';
  sourceObjectType: 'correspondence' | 'correspondence_issue' | 'response_package' | 'submission_gate';
  sourceObjectId: string;
  projectId: number;
  packageId?: string;
  submissionId?: string;
  correspondenceId?: string;
  issueId?: string;
  ownerFunction: string;
  ownerPersonId?: number;
  dueAt?: string;
  escalationPolicy?: string;
  blockerImpact?: 'none' | 'degrades_readiness' | 'publish_block';
  linkedArtifactIds: string[];
  linkedSectionKeys: string[];
  reviewThreadId?: string;
  responsePackageId?: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  completionEvidence?: string[];
}

export interface CanonicalReviewAssignment {
  id: string;
  taskId: string;
  reviewerClass: string;
  reviewerId?: number;
  dueAt?: string;
  status: 'pending' | 'completed' | 'reassigned';
}

export interface CanonicalResponsePackage extends ResponsePackage {
  issueIds: string[];
  impactedSectionKeys: string[];
  evidenceChecklist: Array<{ item: string; status: 'missing' | 'satisfied' }>;
  unresolvedGaps: string[];
  reviewerAssignmentIds: string[];
  readinessState: 'draft' | 'evidence_gap' | 'review_ready' | 'approval_ready' | 'send_ready';
  provenance: {
    sourceCorrespondenceId: string;
    generatedBy: 'rule' | 'actor';
    generatedAt: string;
  };
}

export interface CanonicalOperatingLayer {
  submissions: CanonicalSubmissionRecord[];
  correspondence: CanonicalCorrespondenceRecord[];
  issues: CorrespondenceIssue[];
  tasks: CanonicalActionTask[];
  reviewAssignments: CanonicalReviewAssignment[];
  responsePackages: CanonicalResponsePackage[];
}
