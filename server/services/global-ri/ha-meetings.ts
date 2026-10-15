/**
 * Health Authority meetings expert — formal interactions across major markets.
 *
 * Choosing the right HA meeting at the right milestone is core regulatory
 * strategy. This service encodes the formal meeting types per market and their
 * purpose + scheduling targets, and recommends the appropriate meeting(s) for a
 * given development milestone — the advice a regulatory strategist gives.
 *
 * Markets: FDA, EMA, PMDA, HEALTH_CANADA.
 *
 * Pure / deterministic — no DB, no IO.
 *
 * Reference: FDA "Formal Meetings Between the FDA and Sponsors or Applicants of
 * PDUFA Products" (Type A/B/B(EOP)/C/D + INTERACT); EMA scientific advice /
 * protocol assistance (Reg (EC) 726/2004; SAWP); PMDA consultation framework;
 * Health Canada pre-submission/pre-CTA consultations.
 *
 * PMDA rows are built from the consultation entries of the Japanese programmes
 * record, server/services/ind/ctd/jp-programs.ts: name, purpose and basis come
 * from there, and only the code and the milestones it serves are set here.
 * Until 2026-10-05 the catalogue had two generic PMDA rows with no basis; their
 * codes (`pmda_clinical_trial_consultation`, `pmda_pre_nda_consultation`) are
 * kept.
 *
 * @module server/services/global-ri/ha-meetings
 */

import type { RegulatoryBasis } from '../../../shared/regulatory/regulatory-basis';
import { JP_PROGRAMS, getJpProgram } from '../ind/ctd/jp-programs';

export type MeetingMarket = 'FDA' | 'EMA' | 'PMDA' | 'HEALTH_CANADA';

export type DevelopmentMilestone =
  | 'pre_ind'
  | 'end_of_phase_1'
  | 'end_of_phase_2'
  | 'pre_nda'
  | 'pre_bla'
  | 'clinical_hold'
  | 'post_submission'
  | 'general';

export interface MeetingType {
  /** Stable code (e.g. 'fda_type_b_eop'). */
  code: string;
  market: MeetingMarket;
  name: string;
  purpose: string;
  /** Agency scheduling/response target in calendar days (null when not fixed). */
  schedulingTargetDays: number | null;
  /** Milestones this meeting is the right vehicle for. */
  milestones: DevelopmentMilestone[];
  /** The jp-programs.ts entry a PMDA row is built from. */
  programId?: string;
  /** Where the row's content comes from (PMDA rows: the record entry's basis). */
  basis?: readonly RegulatoryBasis[];
}

/** PMDA row code and milestones, per jp-programs.ts consultation entry. */
const PMDA_CONSULTATION_ROWS: ReadonlyArray<{ programId: string; code: string; milestones: DevelopmentMilestone[] }> = [
  { programId: 'pmda-consultation-pre-meeting', code: 'pmda_pre_consultation_meeting', milestones: ['general'] },
  { programId: 'pmda-consultation-rs-strategy', code: 'pmda_rs_strategy_consultation', milestones: ['pre_ind'] },
  { programId: 'pmda-consultation-clinical-trial', code: 'pmda_clinical_trial_consultation', milestones: ['pre_ind', 'end_of_phase_1'] },
  { programId: 'pmda-consultation-end-of-phase-2', code: 'pmda_end_of_phase_2_consultation', milestones: ['end_of_phase_2'] },
  { programId: 'pmda-consultation-pediatric-plan', code: 'pmda_pediatric_plan_consultation', milestones: ['pre_nda', 'pre_bla'] },
  { programId: 'pmda-consultation-pre-application', code: 'pmda_pre_nda_consultation', milestones: ['pre_nda', 'pre_bla'] },
  { programId: 'pmda-consultation-electronic-data', code: 'pmda_electronic_data_consultation', milestones: ['pre_nda', 'pre_bla'] },
];

/** Every consultation the record holds has a row; a new record entry without one fails loudly here. */
function pmdaMeetingRows(): MeetingType[] {
  const mapped = new Set(PMDA_CONSULTATION_ROWS.map((r) => r.programId));
  const unmapped = JP_PROGRAMS.filter((p) => p.kind === 'consultation' && !mapped.has(p.id)).map((p) => p.id);
  if (unmapped.length > 0) throw new Error(`ha-meetings: PMDA consultation(s) with no catalogue row: ${unmapped.join(', ')}`);
  return PMDA_CONSULTATION_ROWS.map((r) => {
    const p = getJpProgram(r.programId);
    return {
      code: r.code,
      market: 'PMDA',
      name: `PMDA ${p.name} (${p.nameJa})`,
      purpose: p.description,
      schedulingTargetDays: null,
      milestones: r.milestones,
      programId: p.id,
      basis: p.basis,
    };
  });
}

/** The modeled formal HA meeting catalog. */
export const MEETING_CATALOG: MeetingType[] = [
  // ── FDA ──────────────────────────────────────────────────────────────────
  {
    code: 'fda_interact',
    market: 'FDA',
    name: 'INTERACT meeting',
    purpose: 'Early, non-binding advice on novel investigational products before the pre-IND stage (CMC, nonclinical).',
    schedulingTargetDays: 75,
    milestones: ['pre_ind'],
  },
  {
    code: 'fda_type_b_pre_ind',
    market: 'FDA',
    name: 'Type B (Pre-IND) meeting',
    purpose: 'Align on the nonclinical package, proposed first-in-human study, and CMC before submitting the IND.',
    schedulingTargetDays: 60,
    milestones: ['pre_ind'],
  },
  {
    code: 'fda_type_b_eop1',
    market: 'FDA',
    name: 'Type B End-of-Phase 1 meeting',
    purpose: 'For products in a serious-condition / expedited program, agree the Phase 2 approach after Phase 1.',
    schedulingTargetDays: 60,
    milestones: ['end_of_phase_1'],
  },
  {
    code: 'fda_type_b_eop2',
    market: 'FDA',
    name: 'Type B End-of-Phase 2 meeting',
    purpose: 'Agree the design and endpoints of the pivotal Phase 3 program and the path to registration.',
    schedulingTargetDays: 70,
    milestones: ['end_of_phase_2'],
  },
  {
    code: 'fda_type_b_pre_nda',
    market: 'FDA',
    name: 'Type B Pre-NDA meeting',
    purpose: 'Discuss the planned NDA content, format, and any outstanding issues before submission.',
    schedulingTargetDays: 60,
    milestones: ['pre_nda'],
  },
  {
    code: 'fda_type_b_pre_bla',
    market: 'FDA',
    name: 'Type B Pre-BLA meeting',
    purpose: 'Discuss the planned BLA content, format, and outstanding issues before submission.',
    schedulingTargetDays: 60,
    milestones: ['pre_bla'],
  },
  {
    code: 'fda_type_a',
    market: 'FDA',
    name: 'Type A meeting',
    purpose: 'Resolve a stalled program — clinical hold, dispute resolution, special protocol assessment, or post-Complete-Response.',
    schedulingTargetDays: 30,
    milestones: ['clinical_hold'],
  },
  {
    code: 'fda_type_c',
    market: 'FDA',
    name: 'Type C meeting',
    purpose: 'Any other meeting regarding development — a general or topic-specific discussion not covered by A/B/D.',
    schedulingTargetDays: 75,
    milestones: ['general', 'post_submission'],
  },
  {
    code: 'fda_type_d',
    market: 'FDA',
    name: 'Type D meeting',
    purpose: 'A narrowly focused meeting on a small number of issues (≤2 disciplines), needing a quick turn.',
    schedulingTargetDays: 50,
    milestones: ['general'],
  },
  // ── EMA ──────────────────────────────────────────────────────────────────
  {
    code: 'ema_scientific_advice',
    market: 'EMA',
    name: 'Scientific Advice / Protocol Assistance',
    purpose: 'CHMP/SAWP advice on the quality, nonclinical and clinical development program (Protocol Assistance for orphans).',
    schedulingTargetDays: 70,
    milestones: ['pre_ind', 'end_of_phase_1', 'end_of_phase_2', 'general'],
  },
  {
    code: 'ema_presubmission',
    market: 'EMA',
    name: 'Pre-submission meeting',
    purpose: 'Operational alignment with the (Co-)Rapporteurs and EMA 6–7 months before the MAA.',
    schedulingTargetDays: null,
    milestones: ['pre_nda', 'pre_bla'],
  },
  {
    code: 'ema_itf',
    market: 'EMA',
    name: 'Innovation Task Force (ITF) briefing meeting',
    purpose: 'Early dialogue on innovative/borderline methods and technologies.',
    schedulingTargetDays: null,
    milestones: ['pre_ind'],
  },
  // ── PMDA (from server/services/ind/ctd/jp-programs.ts) ───────────────────
  ...pmdaMeetingRows(),
  // ── Health Canada ─────────────────────────────────────────────────────────
  {
    code: 'hc_pre_cta',
    market: 'HEALTH_CANADA',
    name: 'Health Canada pre-CTA consultation',
    purpose: 'Discuss the clinical trial application and development plan.',
    schedulingTargetDays: null,
    milestones: ['pre_ind', 'end_of_phase_1'],
  },
  {
    code: 'hc_presubmission',
    market: 'HEALTH_CANADA',
    name: 'Health Canada pre-submission meeting',
    purpose: 'Discuss the planned NDS content and outstanding issues before filing.',
    schedulingTargetDays: null,
    milestones: ['pre_nda', 'pre_bla'],
  },
];

export interface MeetingRecommendationInput {
  market: MeetingMarket;
  milestone: DevelopmentMilestone;
}

export interface MeetingRecommendation {
  market: MeetingMarket;
  milestone: DevelopmentMilestone;
  /** Meetings appropriate for the milestone, best-fit first. */
  recommended: MeetingType[];
  notes: string[];
}

/**
 * Recommend the appropriate HA meeting(s) for a market + development milestone.
 * Returns the meetings whose milestone list includes the requested milestone,
 * ordered by the soonest scheduling target (fixed-target meetings first).
 * Pure / deterministic.
 */
export function recommendMeetings(input: MeetingRecommendationInput): MeetingRecommendation {
  const candidates = MEETING_CATALOG.filter((m) => m.market === input.market && m.milestones.includes(input.milestone));
  const recommended = [...candidates].sort((a, b) => {
    const da = a.schedulingTargetDays ?? Number.MAX_SAFE_INTEGER;
    const db = b.schedulingTargetDays ?? Number.MAX_SAFE_INTEGER;
    return da === db ? a.code.localeCompare(b.code) : da - db;
  });

  const notes: string[] = [];
  if (recommended.length === 0) {
    notes.push(`No specific ${input.market} meeting is modeled for milestone "${input.milestone}"; consider a general/Type C consultation.`);
  }
  return { market: input.market, milestone: input.milestone, recommended, notes };
}

/** List a market's full meeting catalog. */
export function meetingsForMarket(market: MeetingMarket): MeetingType[] {
  return MEETING_CATALOG.filter((m) => m.market === market);
}
