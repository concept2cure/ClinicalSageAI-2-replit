/**
 * Industry Tailoring Configuration for Stages 11-13
 *
 * Provides industry-specific labels, options, and workflow guidance for:
 *   Stage 11: Governed Workflow (status transitions, attestation)
 *   Stage 12: Multi-User Review (reviewer roles, decision labels)
 *   Stage 13: Review Threads, Tasks & Notifications
 *
 * Supported industries: biotech, pharma, cro, medtech
 */

import type { IndustryMode } from '../types/workspace';

// ── Stage 11: Governed Workflow Tailoring ─────────────────────────────────────

export interface GovWorkflowTailoring {
  /** Panel header title */
  panelTitle: string;
  /** Status labels per status key */
  statusLabels: Record<string, string>;
  /** Transition button labels */
  transitionLabels: Record<string, string>;
  /** Attestation meaning options for approval */
  approvalMeanings: string[];
  /** Attestation meaning options for lock/publish */
  publishMeanings: string[];
  /** Placeholder text for attestation textarea */
  attestationPlaceholder: string;
  /** Label for the "lock" state */
  lockActionLabel: string;
  /** Regulatory reference shown in attestation footer */
  regulatoryRef: string;
}

const GOV_WORKFLOW: Record<string, GovWorkflowTailoring> = {
  biotech: {
    panelTitle: 'IND/BLA Document Governance',
    statusLabels: {
      draft: 'Draft',
      review: 'Scientific Review',
      approved: 'QA Approved',
      locked: 'Submission-Ready',
    },
    transitionLabels: {
      'draft→review': 'Submit for Scientific Review',
      'review→approved': 'QA Approve',
      'review→draft': 'Return to Author',
      'approved→locked': 'Finalize for Submission',
      'approved→review': 'Return for Re-Review',
      'locked→draft': 'Unlock for Amendment',
    },
    approvalMeanings: ['QA Approved', 'Scientifically Reviewed', 'Verified for Accuracy'],
    publishMeanings: ['Submission-Ready', 'Finalized', 'Released for Filing'],
    attestationPlaceholder:
      'I confirm this document meets IND/BLA quality standards and is complete for regulatory submission...',
    lockActionLabel: 'Finalize for Submission',
    regulatoryRef: '21 CFR Part 11 · ICH M4/E3',
  },
  pharma: {
    panelTitle: 'Regulatory Document Governance',
    statusLabels: {
      draft: 'Author Draft',
      review: 'Regulatory Review',
      approved: 'RA Approved',
      locked: 'Locked for Filing',
    },
    transitionLabels: {
      'draft→review': 'Route for Regulatory Review',
      'review→approved': 'RA Approve',
      'review→draft': 'Return to Medical Writing',
      'approved→locked': 'Lock for Filing',
      'approved→review': 'Request Re-Review',
      'locked→draft': 'Unlock (Amendment)',
    },
    approvalMeanings: ['RA Approved', 'GxP Reviewed', 'Verified', 'Compliant'],
    publishMeanings: ['Locked for Filing', 'Published', 'Released to Submissions'],
    attestationPlaceholder:
      'I confirm this document has been reviewed per SOPs and is ready for regulatory submission...',
    lockActionLabel: 'Lock for Filing',
    regulatoryRef: '21 CFR Part 11 · ICH CTD/eCTD',
  },
  cro: {
    panelTitle: 'Deliverable Governance',
    statusLabels: {
      draft: 'Work in Progress',
      review: 'Sponsor Review',
      approved: 'Sponsor Approved',
      locked: 'Delivered',
    },
    transitionLabels: {
      'draft→review': 'Submit to Sponsor',
      'review→approved': 'Sponsor Approve',
      'review→draft': 'Revisions Requested',
      'approved→locked': 'Mark as Delivered',
      'approved→review': 'Re-submit to Sponsor',
      'locked→draft': 'Reopen for Revision',
    },
    approvalMeanings: ['Sponsor Approved', 'QC Reviewed', 'Accepted'],
    publishMeanings: ['Delivered', 'Final Deliverable', 'Released to Sponsor'],
    attestationPlaceholder:
      'I confirm this deliverable meets sponsor specifications and is complete per the scope of work...',
    lockActionLabel: 'Mark as Delivered',
    regulatoryRef: '21 CFR Part 11 · SOW Compliance',
  },
  medtech: {
    panelTitle: 'Design Control Document Governance',
    statusLabels: {
      draft: 'Draft',
      review: 'Design Review',
      approved: 'DCO Approved',
      locked: 'Released to DHF',
    },
    transitionLabels: {
      'draft→review': 'Submit for Design Review',
      'review→approved': 'Approve (DCO)',
      'review→draft': 'Return for Rework',
      'approved→locked': 'Release to DHF',
      'approved→review': 'Recall for Review',
      'locked→draft': 'Issue ECO',
    },
    approvalMeanings: ['Design Approved', 'V&V Verified', 'Design Reviewed'],
    publishMeanings: ['Released to DHF', 'Published', 'Controlled Copy'],
    attestationPlaceholder:
      'I confirm this document meets design control requirements per 21 CFR 820 / ISO 13485...',
    lockActionLabel: 'Release to DHF',
    regulatoryRef: '21 CFR 820 · ISO 13485 · MDR 2017/745',
  },
};

// ── Stage 12: Multi-User Review Tailoring ────────────────────────────────────

export interface ReviewWorkflowTailoring {
  /** Label for the review round process */
  reviewRoundLabel: string;
  /** Decision option labels */
  decisionLabels: Record<string, string>;
  /** Role labels for reviewer types */
  reviewerRoleLabels: string[];
  /** Quorum description text */
  quorumDescription: string;
}

const REVIEW_WORKFLOW: Record<string, ReviewWorkflowTailoring> = {
  biotech: {
    reviewRoundLabel: 'Review Cycle',
    decisionLabels: {
      approve: 'Approve for Submission',
      request_changes: 'Request Scientific Edits',
      reject: 'Reject — Major Deficiencies',
    },
    reviewerRoleLabels: [
      'Scientific Lead',
      'Medical Writer',
      'QA Reviewer',
      'Regulatory Affairs',
      'CMC Lead',
      'Biostatistician',
    ],
    quorumDescription: 'All designated reviewers must approve before QA sign-off',
  },
  pharma: {
    reviewRoundLabel: 'Review Round',
    decisionLabels: {
      approve: 'Approve',
      request_changes: 'Request Revisions (GxP)',
      reject: 'Reject — Non-Compliant',
    },
    reviewerRoleLabels: [
      'Regulatory Affairs',
      'Medical Director',
      'QA/GxP Reviewer',
      'Labeling Specialist',
      'Pharmacovigilance',
      'Legal/IP',
      'Medical Writer',
      'Biostatistician',
    ],
    quorumDescription: 'Requires RA + QA/GxP approval per SOP before filing',
  },
  cro: {
    reviewRoundLabel: 'QC / Sponsor Review Cycle',
    decisionLabels: {
      approve: 'Accept Deliverable',
      request_changes: 'Request Corrections',
      reject: 'Reject — Does Not Meet SOW',
    },
    reviewerRoleLabels: [
      'CRO Project Lead',
      'Internal QC',
      'Sponsor Medical Monitor',
      'Sponsor Regulatory',
      'CRO Medical Writer',
      'Data Management',
    ],
    quorumDescription: 'Internal QC pass required before sponsor review',
  },
  medtech: {
    reviewRoundLabel: 'Design Review Cycle',
    decisionLabels: {
      approve: 'Approve (Design Review)',
      request_changes: 'Request Design Changes (ECO)',
      reject: 'Reject — Design Non-Conformance',
    },
    reviewerRoleLabels: [
      'Design Engineer',
      'Quality Engineer',
      'Regulatory Specialist',
      'Clinical Affairs',
      'Manufacturing/Process',
      'Risk Management',
      'Human Factors/UE',
    ],
    quorumDescription: 'Cross-functional design review per ISO 13485 §7.3.5',
  },
};

// ── Stage 13: Threads, Tasks & Notifications Tailoring ───────────────────────

export interface ThreadTaskTailoring {
  /** Thread anchor type options */
  anchorTypes: { value: string; label: string }[];
  /** Priority option labels */
  priorityLabels: Record<string, string>;
  /** Task type options for creating tasks */
  taskTypes: { value: string; label: string }[];
  /** Default task type */
  defaultTaskType: string;
  /** Thread creation placeholder */
  threadPlaceholder: string;
  /** Notification severity labels */
  severityLabels: Record<string, string>;
  /** Escalation label */
  escalationLabel: string;
}

const THREAD_TASK: Record<string, ThreadTaskTailoring> = {
  biotech: {
    anchorTypes: [
      { value: 'general', label: 'General' },
      { value: 'section', label: 'CTD Section' },
      { value: 'heading', label: 'Heading' },
      { value: 'range', label: 'Text Range' },
      { value: 'safety', label: 'Safety Finding' },
      { value: 'efficacy', label: 'Efficacy Data' },
      { value: 'cmc', label: 'CMC / Manufacturing' },
    ],
    priorityLabels: {
      low: 'Low',
      medium: 'Medium',
      high: 'Critical — Submission Blocker',
    },
    taskTypes: [
      { value: 'follow_up', label: 'Follow-up' },
      { value: 'change_request', label: 'Scientific Edit' },
      { value: 'approval_task', label: 'QA Sign-off' },
      { value: 'safety_review', label: 'Safety Data Review' },
      { value: 'data_query', label: 'Data Query / Clarification' },
    ],
    defaultTaskType: 'follow_up',
    threadPlaceholder: 'Describe the scientific or regulatory issue...',
    severityLabels: { info: 'Info', warning: 'Attention', critical: 'Submission Blocker' },
    escalationLabel: 'Escalate to Program Lead',
  },
  pharma: {
    anchorTypes: [
      { value: 'general', label: 'General' },
      { value: 'section', label: 'CTD Module/Section' },
      { value: 'heading', label: 'Heading' },
      { value: 'range', label: 'Text Range' },
      { value: 'labeling', label: 'Labeling / SmPC' },
      { value: 'clinical', label: 'Clinical Narrative' },
      { value: 'safety', label: 'Safety / PV Issue' },
      { value: 'cmc', label: 'CMC / Quality' },
    ],
    priorityLabels: {
      low: 'Minor',
      medium: 'Standard',
      high: 'Critical — Filing Blocker',
    },
    taskTypes: [
      { value: 'follow_up', label: 'Follow-up' },
      { value: 'change_request', label: 'Revision Request' },
      { value: 'approval_task', label: 'RA/GxP Approval' },
      { value: 'labeling_review', label: 'Labeling Review' },
      { value: 'safety_update', label: 'Safety Narrative Update' },
      { value: 'compliance_check', label: 'GxP Compliance Check' },
    ],
    defaultTaskType: 'follow_up',
    threadPlaceholder: 'Describe the regulatory or quality concern...',
    severityLabels: {
      info: 'Informational',
      warning: 'Action Required',
      critical: 'Filing Blocker',
    },
    escalationLabel: 'Escalate to RA Director',
  },
  cro: {
    anchorTypes: [
      { value: 'general', label: 'General' },
      { value: 'section', label: 'Section' },
      { value: 'heading', label: 'Heading' },
      { value: 'range', label: 'Text Range' },
      { value: 'protocol', label: 'Protocol Deviation' },
      { value: 'data', label: 'Data Discrepancy' },
      { value: 'sow', label: 'SOW / Contractual' },
    ],
    priorityLabels: {
      low: 'Minor',
      medium: 'Moderate',
      high: 'Critical — Deliverable Blocker',
    },
    taskTypes: [
      { value: 'follow_up', label: 'Follow-up' },
      { value: 'change_request', label: 'Correction Request' },
      { value: 'approval_task', label: 'Sponsor Approval' },
      { value: 'qc_finding', label: 'QC Finding' },
      { value: 'query_response', label: 'Query Response Required' },
    ],
    defaultTaskType: 'follow_up',
    threadPlaceholder: 'Describe the finding or required correction...',
    severityLabels: { info: 'Note', warning: 'QC Finding', critical: 'Deliverable Hold' },
    escalationLabel: 'Escalate to Project Director',
  },
  medtech: {
    anchorTypes: [
      { value: 'general', label: 'General' },
      { value: 'section', label: 'Section' },
      { value: 'heading', label: 'Heading' },
      { value: 'range', label: 'Text Range' },
      { value: 'design_input', label: 'Design Input' },
      { value: 'design_output', label: 'Design Output' },
      { value: 'risk', label: 'Risk / FMEA' },
      { value: 'vv', label: 'V&V Requirement' },
    ],
    priorityLabels: {
      low: 'Minor',
      medium: 'Moderate',
      high: 'Critical — Design Non-Conformance',
    },
    taskTypes: [
      { value: 'follow_up', label: 'Follow-up' },
      { value: 'change_request', label: 'Engineering Change (ECO)' },
      { value: 'approval_task', label: 'Design Approval' },
      { value: 'design_review', label: 'Design Review Action' },
      { value: 'capa', label: 'CAPA Item' },
      { value: 'risk_update', label: 'Risk File Update' },
    ],
    defaultTaskType: 'follow_up',
    threadPlaceholder: 'Describe the design control issue or finding...',
    severityLabels: { info: 'Observation', warning: 'Finding', critical: 'Non-Conformance' },
    escalationLabel: 'Escalate to Quality Director',
  },
};

// ── Accessor functions ───────────────────────────────────────────────────────

/** Canonical industry key (maps academic/regulatory/medical_writing to pharma) */
function resolveIndustry(mode?: string): string {
  if (!mode) return 'biotech';
  const m = mode.toLowerCase();
  if (m === 'medtech' || m === 'medical_device') return 'medtech';
  if (m === 'cro') return 'cro';
  if (m === 'pharma') return 'pharma';
  if (m === 'biotech') return 'biotech';
  // academic, regulatory, medical_writing → pharma defaults
  return 'pharma';
}

export function getGovWorkflowTailoring(industryMode?: string): GovWorkflowTailoring {
  return GOV_WORKFLOW[resolveIndustry(industryMode)] || GOV_WORKFLOW.biotech;
}

export function getReviewWorkflowTailoring(industryMode?: string): ReviewWorkflowTailoring {
  return REVIEW_WORKFLOW[resolveIndustry(industryMode)] || REVIEW_WORKFLOW.biotech;
}

export function getThreadTaskTailoring(industryMode?: string): ThreadTaskTailoring {
  return THREAD_TASK[resolveIndustry(industryMode)] || THREAD_TASK.biotech;
}
