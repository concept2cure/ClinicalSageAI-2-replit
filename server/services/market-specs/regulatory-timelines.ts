/**
 * Regulatory timeline / milestone engine — the published review-clock goals and
 * key milestones per submission pathway, for planning.
 *
 * Given a pathway, returns the ordered milestones (day offsets from submission) and
 * the target decision horizon. Where a regulator publishes review GOALS (FDA MDUFA/
 * PDUFA) or statutory clocks (EU CTR/centralised), those are encoded; where review
 * is conformity-assessment-driven with no statutory clock (EU MDR/IVDR Notified
 * Body), that is stated honestly rather than inventing a number.
 *
 * HONESTY: these are TARGET/GOAL timelines subject to clock stops (the agency
 * "stops the clock" while awaiting an applicant response), review-cycle specifics,
 * and program changes. They are planning anchors, not commitments — confirm against
 * the current MDUFA/PDUFA commitment letters and the regulation.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/regulatory-timelines
 */

export type TimelinePathway =
  | '510k' | 'de_novo' | 'pma'        // FDA device
  | 'mdr_ce' | 'ivdr_ce' | 'eu_cta'   // EU
  | 'pmda_device'                     // Japan device
  | 'fda_nda' | 'eu_maa';             // drug (for completeness)

export type MilestoneKind = 'submission' | 'agency' | 'applicant' | 'decision';

export interface Milestone {
  id: string;
  label: string;
  /** Day offset from submission (review/agency days unless noted). Null when not clock-defined. */
  day: number | null;
  kind: MilestoneKind;
  note?: string;
}

export interface PathwayTimeline {
  pathway: TimelinePathway;
  authority: string;
  basis: string;
  /** Target decision horizon in days (agency/review days), or null when not clock-defined. */
  targetDecisionDays: number | null;
  /** Whether the clock stops while awaiting an applicant response. */
  clockStops: boolean;
  milestones: Milestone[];
  caveat: string;
}

const GOAL_CAVEAT =
  'Target/goal timeline subject to clock stops (time awaiting an applicant response is excluded) and program changes — confirm against the current MDUFA/PDUFA commitment letter or the regulation.';

const TIMELINES: Record<TimelinePathway, PathwayTimeline> = {
  '510k': {
    pathway: '510k', authority: 'FDA (CDRH)', basis: 'FD&C Act §510(k); MDUFA goals; FDA RTA policy',
    targetDecisionDays: 90, clockStops: true,
    milestones: [
      { id: 'submit', label: 'Submission received', day: 0, kind: 'submission' },
      { id: 'rta', label: 'Acceptance (RTA) review complete', day: 15, kind: 'agency', note: 'Refuse-to-Accept checklist within 15 calendar days.' },
      { id: 'substantive', label: 'Substantive interaction', day: 60, kind: 'agency', note: 'FDA aims to interact (e.g. AI request) by ~day 60.' },
      { id: 'ai_hold', label: 'Additional Information (AI) request — 180-day applicant hold', day: null, kind: 'applicant', note: 'Clock stops; applicant has up to 180 days to respond.' },
      { id: 'decision', label: 'MDUFA decision', day: 90, kind: 'decision', note: 'MDUFA decision goal ≈ 90 FDA days.' },
    ],
    caveat: GOAL_CAVEAT,
  },
  de_novo: {
    pathway: 'de_novo', authority: 'FDA (CDRH)', basis: 'FD&C Act §513(f)(2); MDUFA goals',
    targetDecisionDays: 150, clockStops: true,
    milestones: [
      { id: 'submit', label: 'De Novo request received', day: 0, kind: 'submission' },
      { id: 'acceptance', label: 'Acceptance review', day: 15, kind: 'agency' },
      { id: 'substantive', label: 'Substantive review / interaction', day: 90, kind: 'agency' },
      { id: 'decision', label: 'MDUFA decision', day: 150, kind: 'decision', note: 'MDUFA decision goal ≈ 150 FDA days.' },
    ],
    caveat: GOAL_CAVEAT,
  },
  pma: {
    pathway: 'pma', authority: 'FDA (CDRH)', basis: '21 CFR 814; MDUFA goals',
    targetDecisionDays: 180, clockStops: true,
    milestones: [
      { id: 'submit', label: 'PMA received', day: 0, kind: 'submission' },
      { id: 'filing', label: 'Filing review decision', day: 45, kind: 'agency', note: 'FDA decides whether to file the PMA within 45 days.' },
      { id: 'substantive', label: 'Substantive review (possible advisory panel)', day: 100, kind: 'agency' },
      { id: 'decision', label: 'MDUFA decision', day: 180, kind: 'decision', note: 'MDUFA decision goal ≈ 180 FDA days.' },
    ],
    caveat: GOAL_CAVEAT,
  },
  mdr_ce: {
    pathway: 'mdr_ce', authority: 'EU Notified Body', basis: 'Regulation (EU) 2017/745 (MDR)',
    targetDecisionDays: null, clockStops: false,
    milestones: [
      { id: 'submit', label: 'Technical documentation submitted to Notified Body', day: 0, kind: 'submission' },
      { id: 'completeness', label: 'NB completeness check', day: null, kind: 'agency' },
      { id: 'assessment', label: 'NB conformity assessment (audit + technical review)', day: null, kind: 'agency', note: 'No statutory clock; typically several months to over a year depending on class, NB capacity, and deficiencies.' },
      { id: 'certificate', label: 'CE certificate issued', day: null, kind: 'decision' },
    ],
    caveat: 'EU MDR conformity assessment has no statutory review clock; duration depends on device class, the Notified Body, and deficiency cycles.',
  },
  ivdr_ce: {
    pathway: 'ivdr_ce', authority: 'EU Notified Body', basis: 'Regulation (EU) 2017/746 (IVDR)',
    targetDecisionDays: null, clockStops: false,
    milestones: [
      { id: 'submit', label: 'Technical documentation submitted to Notified Body', day: 0, kind: 'submission' },
      { id: 'assessment', label: 'NB conformity assessment (class-dependent for B–D)', day: null, kind: 'agency', note: 'No statutory clock; Class A self-certified (except sterile).' },
      { id: 'certificate', label: 'CE certificate issued', day: null, kind: 'decision' },
    ],
    caveat: 'EU IVDR conformity assessment has no statutory review clock; Class A (non-sterile) is self-certified.',
  },
  eu_cta: {
    pathway: 'eu_cta', authority: 'EU CTIS / Member States', basis: 'Regulation (EU) 536/2014',
    targetDecisionDays: 60, clockStops: true,
    milestones: [
      { id: 'submit', label: 'CTA submitted via CTIS', day: 0, kind: 'submission' },
      { id: 'validation', label: 'Validation', day: 10, kind: 'agency', note: 'Validation within ~10 days.' },
      { id: 'assessment_part1', label: 'Part I assessment + RFI window', day: 45, kind: 'agency', note: 'Assessment ~45 days (+ RFI clock stops).' },
      { id: 'decision', label: 'Single decision per concerned Member State', day: 60, kind: 'decision', note: '≈ 60 days, longer with RFIs or Part II.' },
    ],
    caveat: GOAL_CAVEAT,
  },
  pmda_device: {
    pathway: 'pmda_device', authority: 'PMDA / MHLW', basis: 'Japan PMD Act',
    targetDecisionDays: 365, clockStops: true,
    milestones: [
      { id: 'submit', label: 'Shōnin application submitted', day: 0, kind: 'submission' },
      { id: 'review', label: 'PMDA review (with clinical/consultation as needed)', day: 180, kind: 'agency' },
      { id: 'decision', label: 'Approval (Shōnin)', day: 365, kind: 'decision', note: 'Standard total review target ≈ 12 months; varies by track (SAKIGAKE faster).' },
    ],
    caveat: GOAL_CAVEAT,
  },
  fda_nda: {
    pathway: 'fda_nda', authority: 'FDA (CDER/CBER)', basis: '21 CFR 314; PDUFA goals',
    targetDecisionDays: 304, clockStops: false,
    milestones: [
      { id: 'submit', label: 'NDA/BLA submitted', day: 0, kind: 'submission' },
      { id: 'filing', label: 'Filing decision', day: 60, kind: 'agency', note: 'FDA decides to file within 60 days.' },
      { id: 'midcycle', label: 'Mid-cycle communication', day: 165, kind: 'agency' },
      { id: 'decision', label: 'PDUFA action date', day: 304, kind: 'decision', note: 'Standard ≈ 10 months from filing (12 from submission); priority ≈ 6 months from filing.' },
    ],
    caveat: 'PDUFA goal dates; priority review shortens the review clock. Confirm against the PDUFA commitment letter.',
  },
  eu_maa: {
    pathway: 'eu_maa', authority: 'EMA (centralised)', basis: 'Regulation (EC) 726/2004',
    targetDecisionDays: 210, clockStops: true,
    milestones: [
      { id: 'submit', label: 'MAA submitted', day: 0, kind: 'submission' },
      { id: 'day120', label: 'Day 120 list of questions (clock stop)', day: 120, kind: 'agency', note: 'First clock stop for the applicant to respond.' },
      { id: 'day180', label: 'Day 180 list of outstanding issues (possible clock stop)', day: 180, kind: 'agency' },
      { id: 'opinion', label: 'CHMP opinion', day: 210, kind: 'decision', note: '210 active assessment days, excluding clock stops.' },
    ],
    caveat: GOAL_CAVEAT,
  },
};

export function getTimeline(pathway: string): PathwayTimeline | undefined {
  return TIMELINES[pathway as TimelinePathway];
}

export function timelinePathways(): TimelinePathway[] {
  return Object.keys(TIMELINES) as TimelinePathway[];
}

export default { getTimeline, timelinePathways };
