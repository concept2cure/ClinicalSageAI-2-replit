/**
 * Communication Center fixtures — typed port of kit window.CC_* globals.
 *
 * Grounded in the record shapes at:
 *   shared/types/communication-center.ts
 *   server/routes/concept2cure-communication-center.ts
 *   server/routes/ha-interactions.ts
 */

/* ── Submission lifecycle states ── */

export const CC_SUB_STATES = [
  'draft',
  'preparing',
  'ready_for_publish',
  'published',
  'submitted_to_gateway',
  'acknowledged_by_gateway',
  'accepted_by_authority',
  'rejected_or_remediation',
] as const;

export type CcSubState = (typeof CC_SUB_STATES)[number];

export const CC_SUB_STATE_LABEL: Record<CcSubState, string> = {
  draft: 'Draft',
  preparing: 'Preparing',
  ready_for_publish: 'Ready for publish',
  published: 'Published',
  submitted_to_gateway: 'Submitted to gateway',
  acknowledged_by_gateway: 'Acknowledged',
  accepted_by_authority: 'Accepted',
  rejected_or_remediation: 'Rejected / remediation',
};

/* ── Source & interaction type vocabularies ── */

export const CC_SOURCE_TYPES: Record<string, string> = {
  agency_portal_event: 'Agency portal event',
  gateway_acknowledgment: 'Gateway acknowledgment',
  validation_result: 'Validation result',
  email_request_or_letter: 'Email request / letter',
  uploaded_official_correspondence: 'Official correspondence',
  meeting_minutes: 'Meeting minutes',
  managed_service_operator_event: 'PublishOps operator event',
  manual_logged_event: 'Manually logged',
  internal_discussion_linked: 'Internal discussion',
};

export const CC_INTERACTION_TYPES: Record<string, string> = {
  pre_ind: 'Pre-IND',
  eop1: 'End-of-Phase 1',
  eop2: 'End-of-Phase 2',
  pre_nda: 'Pre-NDA',
  pre_bla: 'Pre-BLA',
  type_a: 'Type A',
  type_b: 'Type B',
  type_c: 'Type C',
  scientific_advice: 'Scientific advice',
  other: 'Other',
};

/* ── Record types ── */

export interface CcFiling {
  id: string;
  title: string;
  authority: string;
  center: string;
  submissionType: string;
  sequenceNumber: string;
  gatewayProfile: string;
  status: CcSubState;
  dispatchReady: boolean;
  transport: string;
  formats: string[];
  crlReceived: string;
  crlDue: string;
  crlLetter: string;
}

export interface CcDeficiency {
  id: string;
  discipline: string;
  section: string;
  severity: 'major' | 'minor';
  issue: string;
  rationale: string;
  owner: string;
  ownerRole: string;
  status: string;
  effort: string;
  task: string;
}

export interface CcComm {
  id: string;
  sourceType: string;
  communicationType: string;
  sourceChannel: string;
  linkedSubmissionId: string;
  linkedSectionCodes: string[];
  receivedDate: string;
  dueDate?: string | null;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  responseRequired: boolean;
  extractedIssues: string[];
  humanReviewStatus: string;
  closureStatus: string;
  visibilityTier: string;
  taskId: string | null;
  _new?: boolean;
}

export interface CcInteraction {
  id: number;
  interactionType: string;
  agency: string;
  title: string;
  status: string;
  scheduledDate: string;
  questions: number;
  agreed: number;
}

export interface CcCommitment {
  id: number;
  commitmentType: string;
  description: string;
  dueDate: string;
  effectiveStatus: string;
  basis: string;
}

export interface CcAuthProfile {
  authority: string;
  center: string;
  channelType: string;
  transport: string;
  formats: string[];
  validation: string[];
  ack: string;
}

/* ── Fixture data ── */

export const CC_FILING: CcFiling = {
  id: 'sci_bx204',
  title: 'BX-204 · NDA 212345',
  authority: 'FDA',
  center: 'CDER',
  submissionType: 'NDA',
  sequenceNumber: '0000',
  gatewayProfile: 'ESG · AS2',
  status: 'rejected_or_remediation',
  dispatchReady: false,
  transport: 'ESG_AS2',
  formats: ['eCTD'],
  crlReceived: '2026-06-15',
  crlDue: '2026-12-14',
  crlLetter: 'Complete Response Letter',
};

export const CC_DEFICIENCIES: CcDeficiency[] = [
  {
    id: 'DEF-01',
    discipline: 'CMC',
    section: '3.2.P.8',
    severity: 'major',
    issue:
      'Additional 12-month long-term stability data required for the drug product to support the proposed 24-month shelf life.',
    rationale:
      'Submitted data covered 18 months; the agency cannot grant the requested expiry without the full long-term timepoint.',
    owner: 'A. Rivera',
    ownerRole: 'CMC lead',
    status: 'in_progress',
    effort: 'Major · new data (6 mo)',
    task: 'T-4471',
  },
  {
    id: 'DEF-02',
    discipline: 'Clinical',
    section: '2.7.4',
    severity: 'minor',
    issue:
      'Clarify the imputation method used for missing data in the pivotal ITT efficacy analysis.',
    rationale:
      'The SAP and the CSR describe different handling of dropouts; the agency needs the reconciled method.',
    owner: 'B. Koenig',
    ownerRole: 'Biostatistics',
    status: 'drafting',
    effort: 'Minor · clarification',
    task: 'T-4472',
  },
  {
    id: 'DEF-03',
    discipline: 'Clinical',
    section: '2.7.4',
    severity: 'major',
    issue:
      'Reconcile the safety-database exposure denominator with the Module 5 integrated summary of safety.',
    rationale:
      'Patient-year exposure differs between §2.7.4 and the ISS, affecting adverse-event rates.',
    owner: 'B. Koenig',
    ownerRole: 'Biostatistics',
    status: 'not_started',
    effort: 'Major · re-analysis',
    task: 'T-4473',
  },
  {
    id: 'DEF-04',
    discipline: 'Labeling',
    section: '1.14.1',
    severity: 'minor',
    issue:
      'Provide updated draft carton/container labeling reflecting the revised dosing statement.',
    rationale:
      'Labeling must match the final approved dosing before the agency can complete its review.',
    owner: 'T. Park',
    ownerRole: 'Regulatory',
    status: 'not_started',
    effort: 'Minor · document',
    task: 'T-4489',
  },
];

export const CC_COMMS: CcComm[] = [
  {
    id: 'ace_01',
    sourceType: 'uploaded_official_correspondence',
    communicationType: 'Complete Response Letter (CRL)',
    sourceChannel: 'FDA CDER · official letter',
    linkedSubmissionId: 'sci_bx204',
    linkedSectionCodes: ['2.7.4', '3.2.P.8'],
    receivedDate: '2026-06-15',
    dueDate: '2026-12-14',
    urgency: 'critical',
    responseRequired: true,
    extractedIssues: [
      'Additional 12-month stability data required for the drug product (§3.2.P.8).',
      'Clarify the imputation method for the pivotal ITT analysis (§2.7.4).',
      'Reconcile the safety database exposure denominator with Module 5.',
    ],
    humanReviewStatus: 'triaged',
    closureStatus: 'in_progress',
    visibilityTier: 'shared_client_c2c',
    taskId: 'T-4471',
  },
  {
    id: 'ace_02',
    sourceType: 'agency_portal_event',
    communicationType: 'Information Request (IR)',
    sourceChannel: 'FDA CDER portal',
    linkedSubmissionId: 'sci_bx204',
    linkedSectionCodes: ['1.14.1'],
    receivedDate: '2026-06-26',
    dueDate: '2026-07-17',
    urgency: 'high',
    responseRequired: true,
    extractedIssues: [
      'Provide the updated draft carton/container labeling reflecting the revised dosing.',
    ],
    humanReviewStatus: 'pending_review',
    closureStatus: 'open',
    visibilityTier: 'shared_client_c2c',
    taskId: 'T-4489',
  },
  {
    id: 'ace_03',
    sourceType: 'gateway_acknowledgment',
    communicationType: 'ESG receipt + ACK1/ACK2/ACK3',
    sourceChannel: 'FDA ESG · AS2',
    linkedSubmissionId: 'sci_bx204',
    linkedSectionCodes: [],
    receivedDate: '2025-11-04',
    urgency: 'low',
    responseRequired: false,
    extractedIssues: [],
    humanReviewStatus: 'actioned',
    closureStatus: 'closed',
    visibilityTier: 'c2c_internal',
    taskId: null,
  },
  {
    id: 'ace_04',
    sourceType: 'meeting_minutes',
    communicationType: 'Type A (post-CRL) meeting minutes',
    sourceChannel: 'FDA · official minutes',
    linkedSubmissionId: 'sci_bx204',
    linkedSectionCodes: [],
    receivedDate: '2026-06-29',
    urgency: 'medium',
    responseRequired: false,
    extractedIssues: [
      'FDA aligned on the stability bridging approach; a 12-month update at resubmission is acceptable.',
    ],
    humanReviewStatus: 'triaged',
    closureStatus: 'in_progress',
    visibilityTier: 'shared_client_c2c',
    taskId: null,
  },
];

export const CC_INTERACTIONS: CcInteraction[] = [
  {
    id: 1,
    interactionType: 'pre_ind',
    agency: 'fda',
    title: 'Pre-IND meeting · BX-204',
    status: 'closed',
    scheduledDate: '2024-03-12',
    questions: 6,
    agreed: 6,
  },
  {
    id: 2,
    interactionType: 'eop2',
    agency: 'fda',
    title: 'End-of-Phase 2 · BX-204',
    status: 'minutes_received',
    scheduledDate: '2025-09-08',
    questions: 8,
    agreed: 7,
  },
  {
    id: 3,
    interactionType: 'type_a',
    agency: 'fda',
    title: 'Type A (post-CRL) · resubmission alignment',
    status: 'held',
    scheduledDate: '2026-06-24',
    questions: 4,
    agreed: 3,
  },
];

export const CC_COMMITMENTS: CcCommitment[] = [
  {
    id: 1,
    commitmentType: 'pmr',
    description:
      'Confirmatory OS analysis at 24-month data maturity (accelerated-approval condition).',
    dueDate: '2028-12-31',
    effectiveStatus: 'on_track',
    basis: '21 CFR 314.510',
  },
  {
    id: 2,
    commitmentType: 'pmc',
    description: 'Pediatric formulation dose-finding study per iPSP.',
    dueDate: '2028-06-30',
    effectiveStatus: 'on_track',
    basis: 'PREA',
  },
  {
    id: 3,
    commitmentType: 'rems',
    description: 'Communication plan for hepatotoxicity risk; annual assessment.',
    dueDate: '2026-09-30',
    effectiveStatus: 'due_soon',
    basis: 'FDAAA 505-1',
  },
];

export const CC_AUTH_PROFILES: CcAuthProfile[] = [
  {
    authority: 'FDA',
    center: 'CDER',
    channelType: 'gateway',
    transport: 'ESG_AS2',
    formats: ['eCTD'],
    validation: ['eCTD_validation', 'technical_rejection_criteria'],
    ack: 'gateway_receipt_then_acknowledgment',
  },
  {
    authority: 'EMA',
    center: 'Human Medicines',
    channelType: 'gateway',
    transport: 'eSubmission_Gateway',
    formats: ['eCTD'],
    validation: ['eu_ectd_validation'],
    ack: 'gateway_receipt_then_acknowledgment',
  },
];

/* ── Tone maps ── */

export const CC_TONE: Record<string, string> = {
  critical: 'err',
  high: 'warn',
  medium: 'ai',
  low: 'idle',
};

export const CC_CLOSURE: Record<string, string> = {
  open: 'err',
  in_progress: 'warn',
  closed: 'ok',
};

/* ── Deficiency status ordering ── */

export const CC_DEF_ORDER = [
  'not_started',
  'drafting',
  'in_progress',
  'drafted',
  'resolved',
] as const;
