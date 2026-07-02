/**
 * Regulatory Meeting Types — canonical domain vocabulary.
 *
 * Defines the full set of formal regulatory meeting types across agencies:
 * FDA (CDER/CBER Type A-D + CDRH Q-Submission), EMA (Scientific Advice,
 * Protocol Assistance), Health Canada (Pre-Submission Meeting), and PMDA
 * (Regulatory Consultation). Used by briefing-book flows, project planning,
 * meeting-request generation, and regulatory-strategy intelligence.
 *
 * FDA meeting types are governed by the FDA Guidance for Industry: "Formal
 * Meetings Between the FDA and Sponsors or Applicants of PDUFA Products"
 * (current revision) and 21 CFR 312.47 / 312.82 / 312.85. CDRH Pre-
 * Submissions (Q-Subs) are governed by FDA Guidance: "Requests for Feedback
 * and Meetings for Medical Device Submissions: The Q-Submission Program."
 *
 * @module shared/constants/domain/regulatory-meeting-types
 */

import type { QuestionOption } from '../../types/intelligence-questions.js';
import type { DomainEntry } from './index.js';

export type RegulatoryMeetingType =
  | 'pre_ind'
  | 'end_of_phase_1'
  | 'end_of_phase_2'
  | 'pre_nda_bla'
  | 'type_a'
  | 'type_b'
  | 'type_c'
  | 'type_d'
  | 'q_submission'
  | 'scientific_advice'
  | 'protocol_assistance'
  | 'pre_submission_meeting'
  | 'consultation'
  | 'other';

export const REGULATORY_MEETING_TYPES: DomainEntry<RegulatoryMeetingType>[] = [
  /* ─── FDA — named milestone meetings (all classified as Type B) ──────── */
  {
    value: 'pre_ind',
    label: 'Pre-IND Meeting',
    description: 'FDA Type B meeting held before IND submission to discuss development plans, nonclinical strategy, and proposed clinical trial design. Typically requested under 21 CFR 312.82.',
    regulatoryRefs: ['21 CFR 312.82', 'FDA PDUFA Meeting Guidance'],
  },
  {
    value: 'end_of_phase_1',
    label: 'End-of-Phase 1 Meeting',
    description: 'FDA Type B meeting held at the conclusion of Phase 1 to review safety data and discuss Phase 2 trial design. Most common for novel oncology and CNS programs.',
    regulatoryRefs: ['21 CFR 312.82', 'FDA PDUFA Meeting Guidance'],
  },
  {
    value: 'end_of_phase_2',
    label: 'End-of-Phase 2 Meeting',
    description: 'FDA Type B meeting held at the conclusion of Phase 2 to discuss Phase 3 pivotal trial design, endpoints, statistical analysis plans, and adequacy of the development program for registration.',
    regulatoryRefs: ['21 CFR 312.47', 'FDA PDUFA Meeting Guidance'],
  },
  {
    value: 'pre_nda_bla',
    label: 'Pre-NDA/BLA Meeting',
    description: 'FDA Type B meeting held before NDA or BLA submission to discuss the planned content and format of the application, CMC readiness, and any outstanding data requirements.',
    regulatoryRefs: ['21 CFR 312.47', 'FDA PDUFA Meeting Guidance'],
  },

  /* ─── FDA — generic meeting types (by urgency/format classification) ─── */
  {
    value: 'type_a',
    label: 'Type A Meeting',
    description: 'FDA meeting for immediately needed issues such as clinical holds, dispute resolution, or Special Protocol Assessments. FDA schedules within 30 days of request.',
    regulatoryRefs: ['FDA PDUFA Meeting Guidance'],
  },
  {
    value: 'type_b',
    label: 'Type B Meeting',
    description: 'FDA milestone meeting (Pre-IND, End-of-Phase 1, End-of-Phase 2, Pre-NDA/BLA, or similar). FDA schedules within 60 days of request. The most common formal meeting type.',
    regulatoryRefs: ['FDA PDUFA Meeting Guidance'],
  },
  {
    value: 'type_c',
    label: 'Type C Meeting',
    description: 'FDA meeting for all other questions not covered by Type A or B — such as post-approval matters, labeling discussions, or manufacturing changes. FDA schedules within 75 days of request.',
    regulatoryRefs: ['FDA PDUFA Meeting Guidance'],
  },
  {
    value: 'type_d',
    label: 'Type D Meeting',
    description: 'FDA written-response-only meeting (no face-to-face). The sponsor submits questions and FDA provides a formal written response. Used when interactive discussion is not required.',
    regulatoryRefs: ['FDA PDUFA Meeting Guidance'],
  },

  /* ─── FDA CDRH — device-specific pre-submission ─────────────────────── */
  {
    value: 'q_submission',
    label: 'Q-Submission / Pre-Submission',
    description: 'FDA CDRH Q-Submission (Pre-Sub) program for medical devices. Provides sponsor feedback on planned device submissions (510(k), PMA, De Novo), testing protocols, clinical study designs, and regulatory pathway questions.',
    regulatoryRefs: ['FDA Q-Submission Guidance', '21 CFR 807', '21 CFR 814'],
  },

  /* ─── EMA ────────────────────────────────────────────────────────────── */
  {
    value: 'scientific_advice',
    label: 'Scientific Advice',
    description: 'EMA Scientific Advice procedure providing recommendations on study design, choice of comparator, endpoints, and statistical methodology. Available at any stage of development. Requested via CHMP/SAWP.',
    regulatoryRefs: ['Regulation (EC) No 726/2004 Art. 57', 'EMA Scientific Advice Guidance'],
  },
  {
    value: 'protocol_assistance',
    label: 'Protocol Assistance',
    description: 'EMA Protocol Assistance — a form of Scientific Advice available specifically for designated orphan medicinal products. Covers the same scope as Scientific Advice with reduced fees for orphan sponsors.',
    regulatoryRefs: ['Regulation (EC) No 141/2000', 'EMA Protocol Assistance Guidance'],
  },

  /* ─── Health Canada ──────────────────────────────────────────────────── */
  {
    value: 'pre_submission_meeting',
    label: 'Pre-Submission Meeting',
    description: 'Health Canada pre-submission meeting to discuss planned drug or device submissions, regulatory strategy, and data requirements. Requested through the Health Products and Food Branch (HPFB).',
    regulatoryRefs: ['Health Canada Pre-Submission Meeting Guidance'],
  },

  /* ─── PMDA ───────────────────────────────────────────────────────────── */
  {
    value: 'consultation',
    label: 'Regulatory Consultation',
    description: 'PMDA regulatory consultation (面談) covering development strategy, clinical trial design, and submission planning for the Japanese market. Available as RS Soudankai (regulatory science consultation) or individual consultations.',
    regulatoryRefs: ['PMDA Consultation Guidance'],
  },

  /* ─── Catch-all ──────────────────────────────────────────────────────── */
  {
    value: 'other',
    label: 'Other',
    description: 'Meeting type not covered by the standard categories. May include informal interactions, advisory committee presentations, or agency-specific procedures not listed above.',
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/** The agency associated with a meeting type. */
export function meetingAgency(type: RegulatoryMeetingType): string {
  switch (type) {
    case 'pre_ind':
    case 'end_of_phase_1':
    case 'end_of_phase_2':
    case 'pre_nda_bla':
    case 'type_a':
    case 'type_b':
    case 'type_c':
    case 'type_d':
      return 'FDA';
    case 'q_submission':
      return 'FDA CDRH';
    case 'scientific_advice':
    case 'protocol_assistance':
      return 'EMA';
    case 'pre_submission_meeting':
      return 'Health Canada';
    case 'consultation':
      return 'PMDA';
    case 'other':
      return 'Unspecified';
  }
}

/**
 * The FDA meeting-type classification for a given meeting type.
 * Returns undefined for non-FDA meeting types.
 */
export function fdaMeetingClassification(type: RegulatoryMeetingType): 'A' | 'B' | 'C' | 'D' | undefined {
  switch (type) {
    case 'type_a':          return 'A';
    case 'pre_ind':
    case 'end_of_phase_1':
    case 'end_of_phase_2':
    case 'pre_nda_bla':
    case 'type_b':          return 'B';
    case 'type_c':          return 'C';
    case 'type_d':          return 'D';
    default:                return undefined;
  }
}

/** FDA scheduling target in calendar days from receipt of meeting request. */
export function fdaSchedulingTarget(type: RegulatoryMeetingType): number | undefined {
  const classification = fdaMeetingClassification(type);
  switch (classification) {
    case 'A': return 30;
    case 'B': return 60;
    case 'C': return 75;
    case 'D': return 75; // Written response timeline aligns with Type C
    default:  return undefined;
  }
}

/** True when the meeting type is an FDA meeting. */
export function isFdaMeeting(type: RegulatoryMeetingType): boolean {
  return fdaMeetingClassification(type) !== undefined || type === 'q_submission';
}

/** True when a string is a valid RegulatoryMeetingType. */
export function isRegulatoryMeetingType(value: string): value is RegulatoryMeetingType {
  return REGULATORY_MEETING_TYPES.some((e) => e.value === value);
}

/** All meeting type values, in registry order. */
export function listRegulatoryMeetingTypes(): RegulatoryMeetingType[] {
  return REGULATORY_MEETING_TYPES.map((e) => e.value);
}

/** Only FDA meeting types. */
export function listFdaMeetingTypes(): RegulatoryMeetingType[] {
  return REGULATORY_MEETING_TYPES.filter((e) => isFdaMeeting(e.value)).map((e) => e.value);
}

// ─── Question-option converter ──────────────────────────────────────────────

/** Convert REGULATORY_MEETING_TYPES to QuestionOption[] for use in intelligence question flows. */
export function toQuestionOptions(): QuestionOption[] {
  return REGULATORY_MEETING_TYPES.map((e) => ({
    value: e.value,
    label: e.label,
    description: e.description,
  }));
}

export default {
  REGULATORY_MEETING_TYPES,
  meetingAgency,
  fdaMeetingClassification,
  fdaSchedulingTarget,
  isFdaMeeting,
  isRegulatoryMeetingType,
  listRegulatoryMeetingTypes,
  listFdaMeetingTypes,
  toQuestionOptions,
};
