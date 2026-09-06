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
