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
import type { ApplicationFamily } from './document-taxonomy.js';
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


// ─── The response clock on an inbound agency letter ──────────────────────────
//
// Regulatory affairs runs on the date in the letter. A sponsor does not answer
// an FDA letter "in 14 days"; it answers by the date the agency stated, and
// where the agency stated none, by the window the regulation gives for that
// class of letter — which is 30 days for one class and a year for another.
//
// So there is no platform-wide number here, and there was never a defensible
// one. `mdx-proactive-signals.ts` carried `CORRESPONDENCE_NO_RESPONSE_DAYS = 14`
// for a signal that (for an unrelated reason) never fired; 14 days is not a
// deadline in any of these regimes. What follows is the governed table: one
// entry per inbound letter class, by application family where the class differs
// across families, each with the citation it comes from and what lapsing costs.
//
// RULE 2: the window, the due date and the verdict are computed here, from the
// record. The model narrates them and supplies none of them.

/** Where a response window comes from, which decides how far it can be trusted. */
export type ResponseWindowBasis =
  /** A deadline in the Code of Federal Regulations. */
  | 'statutory'
  /** An FDA guidance or user-fee (MDUFA/PDUFA) convention, not codified. */
  | 'guidance'
  /** No fixed window: the agency states the date in the letter, and only that date governs. */
  | 'stated_only'
  /** This class asks for no response at all. */
  | 'none';

export interface ResponseWindow {
  /** Calendar days from receipt. Null for 'stated_only' and 'none'. */
  days: number | null;
  basis: ResponseWindowBasis;
  /** The regulation or guidance this comes from. Null where there is none to cite. */
  citation: string | null;
  /** What lapsing costs — carried through as the deadline radar's consequence. */
  consequence: string | null;
  /**
   * The agency has stopped something until this is answered: the trial (a
   * clinical hold), the review (a refuse-to-file, a device Additional
   * Information hold) or the approval (a complete response letter). A drug
   * information request mid-review is not blocking — the review continues
   * while the sponsor answers. This is why an undated blocking letter is
   * reported as a warning and an undated non-blocking one as information:
   * severity follows the regulation, not the wording of the letter.
   */
  blocking: boolean;
}

const NO_RESPONSE: ResponseWindow = {
  days: null,
  basis: 'none',
  citation: null,
  consequence: null,
  blocking: false,
};

/**
 * The window for one inbound letter class, by application family where it
 * differs. `family` null means the submission type could not be resolved by
 * submission-type-bridge, so a family-specific window cannot be claimed.
 *
 * Confidence is explicit in `basis`: a CFR deadline is 'statutory', a user-fee
 * convention is 'guidance', and a class whose clock is only ever the date in
 * the letter is 'stated_only' with no days. Nothing here invents a number that
 * cannot be cited.
 */
export function responseWindowFor(
  letterClass: AgencyLetterClass,
  family: ApplicationFamily | null,
): ResponseWindow {
  switch (letterClass) {
    /* 21 CFR 314.110(c): within one year of a complete response letter the
       applicant resubmits, withdraws, or asks for a hearing. 21 CFR 601.3 is
       the biologics counterpart. Doing none of those is the one window on this
       list whose lapse can end the application by itself. */
    case 'complete_response_letter':
      return {
        days: 365,
        basis: 'statutory',
        citation: '21 CFR 314.110(c) (NDA/ANDA); 21 CFR 601.3 (BLA)',
        consequence:
          'FDA may treat a failure to resubmit, withdraw, or request a hearing within one year as a request to withdraw the application.',
        blocking: true,
      };

    /* 21 CFR 314.101(a)(3): the applicant may ask for an informal conference
       on a refuse-to-file decision within 30 days of the notice. The window is
       the right to be heard, not the right to refile. */
    case 'refuse_to_file_letter':
      return {
        days: 30,
        basis: 'statutory',
        citation: '21 CFR 314.101(a)(3)',
        consequence:
          'The right to request an informal conference on the refuse-to-file decision lapses after 30 days.',
        blocking: true,
      };

    /* A request for additional information. The clock is a DEVICE clock and
       does not exist on the drug side: a PMA is considered withdrawn if the
       applicant does not respond within 180 days (21 CFR 814.37(c)(1)), and a
       510(k) held for Additional Information is withdrawn on the same 180-day
       MDUFA convention. On a drug application an information request or a
       discipline review question carries the date FDA wrote in it and no
       codified window, so it is 'stated_only' — which is a fact about the
       regime, not a gap in this table. */
    case 'information_request':
    case 'discipline_review_question':
      if (family === 'device_approval') {
        return {
          days: 180,
          basis: 'statutory',
          citation: '21 CFR 814.37(c)(1)',
          consequence: 'FDA considers a PMA withdrawn if the applicant does not respond within 180 days.',
          blocking: true,
        };
      }
      if (family === 'device_clearance') {
        return {
          days: 180,
          basis: 'guidance',
          citation: 'MDUFA Additional Information hold (CDRH 510(k) interactive review)',
          consequence:
            'A 510(k) on Additional Information hold is withdrawn if a complete response is not received within 180 calendar days.',
          blocking: true,
        };
      }
      return {
        days: null,
        basis: 'stated_only',
        citation: null,
        consequence:
          'The review clock runs on the date the agency stated in the request; no regulation fixes a window for this class.',
        blocking: false,
      };

    /* A deficiency letter or a major objection. Same split: a device
       deficiency is the 180-day withdrawal clock; an FDA drug deficiency
       letter and an EMA major objection are answered on the date the agency
       set, which is why the stated date is the only clock claimed here. */
    case 'deficiency_letter':
    case 'major_objection':
      if (family === 'device_approval' || family === 'device_clearance') {
        return {
          days: 180,
          basis: family === 'device_approval' ? 'statutory' : 'guidance',
          citation:
            family === 'device_approval'
              ? '21 CFR 814.37(c)(1)'
              : 'MDUFA Additional Information hold (CDRH 510(k) interactive review)',
          consequence: 'The application is considered withdrawn if a complete response is not received within 180 days.',
          blocking: true,
        };
      }
      return {
        days: null,
        basis: 'stated_only',
        citation: null,
        consequence: 'The agency set the response date in the letter; no regulation fixes a window for this class.',
        blocking: false,
      };

    /* A clinical hold is the sharpest letter on this list and has NO sponsor
       window — a point worth stating rather than filling in. 21 CFR 312.42
       obliges FDA to respond within 30 days of a COMPLETE response to the
       hold; it sets no deadline on the sponsor. The study stays stopped until
       the hold is lifted, so the cost of delay is the trial, not a lapsed
       right. Giving this class an invented number would be the worst kind of
       wrong: urgent and unfounded. */
    case 'hold_letter':
      return {
        days: null,
        basis: 'stated_only',
        citation: '21 CFR 312.42',
        consequence:
          'The investigation stays on clinical hold until FDA lifts it. 21 CFR 312.42(e) obliges FDA to respond within 30 days of a complete response; it sets no deadline on the sponsor.',
        blocking: true,
      };

    /* Letters that ask for nothing: an acknowledgement, a filing
       communication, an approval, minutes, and a commitment letter whose
       obligations carry their own milestone dates rather than a reply date. */
    case 'acknowledgment_letter':
    case 'filing_communication':
    case 'approval_letter':
    case 'meeting_minutes':
    case 'postmarketing_commitment_letter':
      return NO_RESPONSE;
  }
}

/**
 * The inbound letter classes a response clock can apply to. Every other member
 * of the correspondence vocabulary is something the SPONSOR wrote (a response,
 * a cover letter, an amendment) or an internal work product (a triage memo, a
 * response plan), and an outbound document is not a letter we owe an answer to.
 * An invariant test holds this against the full vocabulary so a new letter type
 * cannot be added without deciding its clock.
 */
export const AGENCY_LETTER_CLASSES = [
  'acknowledgment_letter',
  'filing_communication',
  'refuse_to_file_letter',
  'information_request',
  'discipline_review_question',
  'hold_letter',
  'deficiency_letter',
  'major_objection',
  'complete_response_letter',
  'approval_letter',
  'postmarketing_commitment_letter',
  'meeting_minutes',
] as const;

export type AgencyLetterClass = (typeof AGENCY_LETTER_CLASSES)[number];

/** Is this correspondence class a letter FROM an agency (so a clock can apply)? */
export function isAgencyLetterClass(value: string): value is AgencyLetterClass {
  return (AGENCY_LETTER_CLASSES as readonly string[]).includes(value);
}

// ─── One deadline rule for the whole platform ────────────────────────────────

/** The buckets the deadline radar reports, and the only vocabulary for them. */
export type DeadlineBucket = 'overdue' | 'due_soon' | 'upcoming';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Days until a due date, and the bucket it falls in. The ONE implementation:
 * server/services/ana/deadline-radar.ts bucketObligations() computes its
 * obligations through this, and the correspondence response clock computes
 * through it too, so "overdue" cannot come to mean two things on one screen.
 *
 * Floor, not round: a deadline one hour past is overdue, and a deadline later
 * today is 0 days away and due_soon, never -1.
 */
export function deadlineBucketFor(
  dueDate: Date | string,
  now: Date,
  windowDays: number,
): { daysUntilDue: number; bucket: DeadlineBucket } {
  const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
  const daysUntilDue = Math.floor((due.getTime() - now.getTime()) / MS_PER_DAY);
  const bucket: DeadlineBucket =
    daysUntilDue < 0 ? 'overdue' : daysUntilDue <= windowDays ? 'due_soon' : 'upcoming';
  return { daysUntilDue, bucket };
}

export default {
  registrationStatusForDeficiency,
  registrationStatusForDecision,
  requiresResponse,
  COMMITMENT_TRANSITIONS,
  canAdvanceCommitment,
  isBindingCommitment,
  meetingsForSegment,
  responseWindowFor,
  isAgencyLetterClass,
  deadlineBucketFor,
  AGENCY_LETTER_CLASSES,
};
