/**
 * Agency interaction & commitment spine — the dialogue.
 *
 * A submission is not one-shot. Regulatory affairs is a multi-round negotiation:
 * pre-submission meetings → the filing → information requests → deficiency
 * letters → responses → a decision → binding post-approval commitments. The
 * argument is defended across rounds, and approval creates obligations that
 * outlive it.
 *
 * This models that dialogue as data that attaches to a product's registration in
 * a market: the interactions (meetings, deficiencies, responses, decisions) that
 * move a registration, and the commitments (PMR/PMC/REMS/specific obligations)
 * approval leaves behind. Pure contract (no DB), grounded in real FDA/EMA practice.
 *
 * @module shared/regulatory/agency-interaction
 */

import type { RegistrationStatus } from './product-registration.js';
import type { ClientSegmentId } from './client-segments.js';
import type { CanonicalRegion } from './region-identity.js';

// ─── Interaction taxonomy ────────────────────────────────────────────────────

export type InteractionType =
  | 'meeting'              // pre-submission meeting with the agency
  | 'submission'           // a filing transmitted
  | 'information_request'  // agency asks for more during review
  | 'deficiency'           // a deficiency letter (CRL / RTF / AI / NSE / …)
  | 'response'             // the sponsor's response to a deficiency / request
  | 'decision'             // the agency's action (approve / clear / refuse)
  | 'commitment';          // a post-approval obligation is recorded

/** Formal agency meeting types (FDA drug/biologic + device + EU equivalent). */
export type MeetingType =
  | 'pre_ind'           // FDA pre-IND
  | 'end_of_phase_2'    // FDA EOP2
  | 'pre_nda_bla'       // FDA pre-NDA / pre-BLA
  | 'type_a'            // FDA Type A (problem-resolution)
  | 'type_b'            // FDA Type B (milestone)
  | 'type_c'            // FDA Type C (other)
  | 'q_submission'      // FDA CDRH Q-Sub (device)
  | 'pre_submission'    // FDA CDRH pre-submission (device)
  | 'scientific_advice';// EMA scientific advice (EU)

/** Deficiency letter types. */
export type DeficiencyType =
  | 'complete_response'            // CRL (NDA/BLA)
  | 'refuse_to_file'              // RTF
  | 'information_request'         // AI / additional information request
  | 'not_substantially_equivalent' // NSE (510(k))
  | 'major_deficiency'           // device major deficiency letter
  | 'clinical_hold';             // IND clinical hold (investigational, not marketing)

/** Post-approval commitment / obligation types. */
export type CommitmentType =
  | 'pmr'                 // FDA Post-Marketing Requirement (statutory — FDAAA 505(o))
  | 'pmc'                 // FDA Post-Marketing Commitment (agreed, non-statutory)
  | 'rems'                // Risk Evaluation and Mitigation Strategy
  | 'post_approval_study' // committed post-approval study
  | 'specific_obligation' // EU conditional MA specific obligation (legally binding)
  | 'annual_reportable';  // change/obligation reportable in the annual report

export type CommitmentStatus = 'open' | 'in_progress' | 'fulfilled' | 'overdue' | 'released';

// ─── Entities (attach to a product's registration in a market) ───────────────

export interface Interaction {
  id: string;
  productId: string;
  market: CanonicalRegion;
  type: InteractionType;
  /** When type === 'meeting'. */
  meetingType?: MeetingType;
  /** When type === 'deficiency'. */
  deficiencyType?: DeficiencyType;
  /** ISO date the interaction occurred / is due (stamped by the caller). */
  date?: string;
  note?: string;
}

export interface Commitment {
  id: string;
  productId: string;
  market: CanonicalRegion;
  type: CommitmentType;
  status: CommitmentStatus;
  /** ISO due date (stamped by the caller). */
  dueDate?: string;
  description?: string;
}

// ─── Interaction → registration effect ───────────────────────────────────────

/**
 * The registration status a deficiency drives. Marketing deficiencies put the
 * registration into 'deficiency' (a response is required). A clinical hold acts
 * on an IND (investigational), not a marketing registration → null.
 */
export function registrationStatusForDeficiency(d: DeficiencyType): RegistrationStatus | null {
  if (d === 'clinical_hold') return null;
  return 'deficiency';
}

/** The registration status an agency decision drives. */
export function registrationStatusForDecision(
  outcome: 'approved' | 'refused' | 'withdrawn',
): RegistrationStatus {
  return outcome === 'approved' ? 'approved' : 'withdrawn';
}

/** True when a deficiency requires a sponsor response to proceed. */
export function requiresResponse(d: DeficiencyType): boolean {
  // Every deficiency type requires a response before review can resume.
  return true;
}

// ─── Commitment lifecycle ────────────────────────────────────────────────────

export const COMMITMENT_TRANSITIONS: Record<CommitmentStatus, CommitmentStatus[]> = {
  open: ['in_progress', 'released'],
  in_progress: ['fulfilled', 'overdue', 'released'],
  overdue: ['in_progress', 'fulfilled', 'released'],
  fulfilled: [],
  released: [],
};

export function canAdvanceCommitment(from: CommitmentStatus, to: CommitmentStatus): boolean {
  return COMMITMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Whether a commitment is legally binding (vs an agreed, non-statutory one).
 * PMRs are statutory (FDAAA 505(o)); REMS is enforceable; EU specific obligations
 * on a conditional MA are legally binding. PMCs and annual-reportables are not.
 */
export function isBindingCommitment(type: CommitmentType): boolean {
  return type === 'pmr' || type === 'rems' || type === 'specific_obligation';
}

// ─── Meetings applicable to a program ────────────────────────────────────────

const DRUG_MEETINGS: MeetingType[] = [
  'pre_ind', 'end_of_phase_2', 'pre_nda_bla', 'type_a', 'type_b', 'type_c', 'scientific_advice',
];
const DEVICE_MEETINGS: MeetingType[] = ['q_submission', 'pre_submission', 'scientific_advice'];

/** The formal meeting types available to a segment's programs. */
export function meetingsForSegment(segment: ClientSegmentId): MeetingType[] {
  return segment === 'device' || segment === 'ivd' ? DEVICE_MEETINGS : DRUG_MEETINGS;
}

export default {
  registrationStatusForDeficiency,
  registrationStatusForDecision,
  requiresResponse,
  COMMITMENT_TRANSITIONS,
  canAdvanceCommitment,
  isBindingCommitment,
  meetingsForSegment,
};
