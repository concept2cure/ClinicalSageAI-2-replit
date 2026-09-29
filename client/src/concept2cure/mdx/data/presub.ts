/**
 * Pre-Sub / Q-Sub manager — data
 *
 * Ported verbatim from ui_kits/mdx/data-presub.jsx. Mirrors the
 * conversation-with-FDA before a 510(k) gets filed: Pre-Sub, Submission Issue
 * Request, Study Risk Determination, Agreement, and Informational meetings.
 *
 * Per CDRH guidance "Requests for Feedback…" Sep 2023 rev.
 */

// ─── KPI strip ─────────────────────────────────────────────────────────────

export type Tone = '' | 'ok' | 'warn' | 'err';

export interface PresubKpi {
  label: string;
  metric: string;
  unit: string;
  meta: string;
  tone: Tone;
}

// ─── Type taxonomy + lifecycle stages ──────────────────────────────────────

export type PresubTypeId = 'presub' | 'sir' | 'srd' | 'agree' | 'info';

export interface PresubType {
  id: PresubTypeId;
  label: string;
  desc: string;
}

export const PRESUB_TYPES: PresubType[] = [
  { id: 'presub', label: 'Pre-Sub',          desc: 'Written/meeting feedback before filing' },
  { id: 'sir',    label: 'Submission Issue', desc: 'Mid-review issue resolution' },
  { id: 'srd',    label: 'Study Risk Det.',  desc: 'IDE applicability question' },
  { id: 'agree',  label: 'Agreement',        desc: '21 CFR 814.42 PMA agreement' },
  { id: 'info',   label: 'Informational',    desc: 'Briefing only, no FDA response' },
];

export type PresubStageId = 'plan' | 'package' | 'submit' | 'await' | 'feedback' | 'integrate';

export interface PresubStage {
  id: PresubStageId;
  label: string;
  desc: string;
}

export const PRESUB_STAGES: PresubStage[] = [
  { id: 'plan',      label: 'Planning',     desc: 'Question list draft' },
  { id: 'package',   label: 'Package',      desc: 'Cover · device desc · questions' },
  { id: 'submit',    label: 'Filed',        desc: 'ESG transmit · Q-Sub number' },
  { id: 'await',     label: 'Awaiting FDA', desc: 'Acknowledgement · 75d clock' },
  { id: 'feedback',  label: 'Feedback',     desc: 'Written response or meeting' },
  { id: 'integrate', label: 'Integrate',    desc: 'Roll commitments to dossier' },
];

// ─── List row ──────────────────────────────────────────────────────────────

export interface PresubMeeting {
  date: string;
  kind: string;
  team: string;
  confirmed: boolean;
}

export interface PresubListRow {
  id: string;
  qNumber: string;
  type: PresubTypeId;
  prog: string;
  progTitle: string;
  title: string;
  stage: PresubStageId;
  daysIn: number;
  filed: string | null;
  targetDate: string | null;
  meeting: PresubMeeting | null;
  questions: number;
  answered: number;
  commitments: number;
  rolledIn: number;
  fdaTeam: string;
  tone: Tone;
}

// ─── Per-Q-Sub detail ──────────────────────────────────────────────────────

export type QuestionStatus = 'answered' | 'awaiting';

export interface DossierLink {
  kind: 'k510-section' | 'pma-section' | 'cer-section';
  label: string;
  sectionId: number;
}

export interface Commitment {
  id: string;
  text: string;
  dossierLink: DossierLink;
  rolledIn: boolean;
  /** When true, this commitment is gating the next dossier transmit. */
  blocker?: boolean;
}

export interface PresubQuestion {
  n: number;
  q: string;
  ourPosition: string;
  fdaResponse: string | null;
  status: QuestionStatus;
  commitment: Commitment | null;
}

export interface PresubTimelineEntry {
  when: string;
  who: string;
  what: string;
}

export interface PresubDetail {
  summary: string;
  questions: PresubQuestion[];
  timeline: PresubTimelineEntry[];
}

/*
 * PRESUB_KPIS, PRESUB_LIST and PRESUB_DETAIL — removed.
 *
 * They invented an interaction with FDA. PRESUB_LIST carried Q-numbers in the
 * agency's own format (Q251142, Q250987), a named FDA reviewer, a confirmed
 * teleconference date, and counts of questions FDA had answered and
 * commitments it had made. PRESUB_DETAIL went further and put words in the
 * agency's mouth: "FDA agrees K212284 is appropriate as the primary
 * predicate." PRESUB_KPIS was derived from the list. PreSubManager rendered
 * the first two with no sample banner; nothing consumed the third.
 *
 * A fabricated agency communication is the same class of claim as a
 * fabricated signature, and the one a sponsor would most reasonably act on.
 * PreSubManager reads /api/q-sub or nothing. PRESUB_TYPES and PRESUB_STAGES
 * stay: they are the structure of FDA's Q-Submission program, not a record of
 * anyone's progress through it.
 */
