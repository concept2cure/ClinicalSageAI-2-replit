/**
 * Global regulatory review-timeline projector.
 *
 * Given a target region, a submission/procedure type, and a start (clock-zero)
 * date, this module projects the well-established review-clock milestones and
 * the expected decision date. It is PURE / DETERMINISTIC — no DB, no IO, no
 * wall-clock reads. Every date is derived by adding a fixed `dayOffset` of
 * CALENDAR days to the supplied start date, so the same input always yields the
 * same output.
 *
 * Clock bases (genuine, well-documented review timelines):
 *
 *   FDA (US)
 *     - IND: 21 CFR 312.40 — sponsor may proceed 30 calendar days after FDA
 *       receipt (Day 0) unless placed on clinical hold (Day 30 "safe to proceed").
 *     - NDA/BLA standard review: PDUFA VII goal — file/refuse-to-file decision by
 *       Day 60; review goal of 10 months FROM THE 60-DAY FILING DATE, i.e.
 *       ~Day 364 from submission receipt.
 *     - NDA/BLA priority review: 6 months from the 60-day filing date, i.e.
 *       ~Day 243 from submission receipt.
 *
 *   EMA (EU centralised) — Regulation (EC) 726/2004, CHMP procedural timetable.
 *     - 210-day active assessment clock: Day 120 list of questions (clock stops),
 *       Day 180 list of outstanding issues, Day 210 CHMP opinion. The European
 *       Commission decision follows ~67 days after the opinion. Clock-stops while
 *       the applicant answers questions are NOT modelled (active-clock days only).
 *
 *   PMDA (Japan) — total review-period targets under the PMDA review framework.
 *     - Standard review: ~12 months (~365 calendar days).
 *     - Priority review: ~9 months (~270 calendar days).
 *
 *   Health Canada — Food and Drug Regulations / Management of Drug Submissions.
 *     - NDS standard review: 300-day performance target.
 *     - NDS priority review: 215-day performance target.
 *
 *   MHRA (UK) — national procedure performance target.
 *     - 150-day assessment: Day 0 validation, Day 150 determination. Clock-stops
 *       for applicant responses to questions are NOT modelled (active-clock days).
 *
 *   TGA (Australia) — prescription medicines registration process.
 *     - Statutory target of ~255 WORKING days. Working days are approximated here
 *       as calendar days using a 5/7 business-week factor:
 *       255 working days ≈ 255 / 5 * 7 = 357 calendar days. This is an
 *       approximation only (it ignores public holidays and clock-stops).
 *
 * @module server/services/global-ri/global-review-timeline
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Region = 'FDA' | 'EMA' | 'PMDA' | 'HEALTH_CANADA' | 'MHRA' | 'TGA';

export interface ReviewMilestone {
  name: string;
  /** Calendar-day offset from the start (clock-zero) date. */
  dayOffset: number;
  /** ISO date (YYYY-MM-DD) = startDate + dayOffset calendar days. */
  date: string;
  description: string;
}

export interface ReviewTimelineInput {
  region: Region;
  procedure: string;
  startDate: Date | string;
}

export interface ReviewTimeline {
  region: Region;
  procedure: string;
  /** ISO date (YYYY-MM-DD) of clock-zero. */
  startDate: string;
  /** Milestones sorted ascending by dayOffset. */
  milestones: ReviewMilestone[];
  /** ISO date (YYYY-MM-DD) of the expected decision / opinion. */
  targetDecisionDate: string;
}

// ---------------------------------------------------------------------------
// Date helpers (pure)
// ---------------------------------------------------------------------------

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Add `days` calendar days to `d` (UTC) and return a new Date. */
function addCalendarDays(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

// ---------------------------------------------------------------------------
// Clock definitions
// ---------------------------------------------------------------------------

/** A milestone template expressed independently of the start date. */
interface MilestoneTemplate {
  name: string;
  dayOffset: number;
  description: string;
}

interface ProcedureClock {
  milestones: MilestoneTemplate[];
  /** dayOffset of the milestone that represents the target decision. */
  targetDecisionOffset: number;
}

/**
 * Registry of region -> procedure -> clock. Day offsets are CALENDAR days from
 * clock-zero. See the module header for the regulatory basis of each value.
 */
const CLOCKS: Record<Region, Record<string, ProcedureClock>> = {
  FDA: {
    IND: {
      milestones: [
        { name: 'IND Received', dayOffset: 0, description: 'FDA receipt of the IND; the 30-day review clock starts (21 CFR 312.40).' },
        { name: 'Safe to Proceed', dayOffset: 30, description: 'Sponsor may initiate the study 30 days after receipt unless placed on clinical hold.' },
      ],
      targetDecisionOffset: 30,
    },
    NDA_STANDARD: {
      milestones: [
        { name: 'Submission Received', dayOffset: 0, description: 'FDA receipt of the NDA; PDUFA clock starts.' },
        { name: 'Filing Decision', dayOffset: 60, description: 'Day 60 file / refuse-to-file decision (PDUFA VII).' },
        { name: 'Mid-Cycle Communication', dayOffset: 150, description: 'Mid-cycle review communication to the applicant.' },
        { name: 'Late-Cycle Meeting', dayOffset: 274, description: 'Late-cycle meeting in advance of the PDUFA goal date.' },
        { name: 'PDUFA Goal Date', dayOffset: 364, description: 'Standard review goal: 10 months from the 60-day filing date (~Day 364 from receipt).' },
      ],
      targetDecisionOffset: 364,
    },
    BLA_STANDARD: {
      milestones: [
        { name: 'Submission Received', dayOffset: 0, description: 'FDA receipt of the BLA; PDUFA clock starts.' },
        { name: 'Filing Decision', dayOffset: 60, description: 'Day 60 file / refuse-to-file decision (PDUFA VII).' },
        { name: 'Mid-Cycle Communication', dayOffset: 150, description: 'Mid-cycle review communication to the applicant.' },
        { name: 'Late-Cycle Meeting', dayOffset: 274, description: 'Late-cycle meeting in advance of the PDUFA goal date.' },
        { name: 'PDUFA Goal Date', dayOffset: 364, description: 'Standard review goal: 10 months from the 60-day filing date (~Day 364 from receipt).' },
      ],
      targetDecisionOffset: 364,
    },
    NDA_PRIORITY: {
      milestones: [
        { name: 'Submission Received', dayOffset: 0, description: 'FDA receipt of the NDA; PDUFA clock starts.' },
        { name: 'Filing Decision', dayOffset: 60, description: 'Day 60 file / refuse-to-file decision (PDUFA VII).' },
        { name: 'PDUFA Goal Date', dayOffset: 243, description: 'Priority review goal: 6 months from the 60-day filing date (~Day 243 from receipt).' },
      ],
      targetDecisionOffset: 243,
    },
    BLA_PRIORITY: {
      milestones: [
        { name: 'Submission Received', dayOffset: 0, description: 'FDA receipt of the BLA; PDUFA clock starts.' },
        { name: 'Filing Decision', dayOffset: 60, description: 'Day 60 file / refuse-to-file decision (PDUFA VII).' },
        { name: 'PDUFA Goal Date', dayOffset: 243, description: 'Priority review goal: 6 months from the 60-day filing date (~Day 243 from receipt).' },
      ],
      targetDecisionOffset: 243,
    },
  },
  EMA: {
    CENTRALISED: {
      milestones: [
        { name: 'Procedure Start', dayOffset: 0, description: 'Start of the 210-day active assessment clock (Day 0).' },
        { name: 'Day 120 List of Questions', dayOffset: 120, description: 'CHMP adopts the list of questions; the clock stops pending applicant responses.' },
        { name: 'Day 180 List of Outstanding Issues', dayOffset: 180, description: 'CHMP adopts the list of outstanding issues after responses.' },
        { name: 'Day 210 CHMP Opinion', dayOffset: 210, description: 'CHMP adopts its opinion at the end of the 210-day active clock.' },
        { name: 'European Commission Decision', dayOffset: 277, description: 'Commission decision ~67 days after the CHMP opinion.' },
      ],
      targetDecisionOffset: 277,
    },
  },
  PMDA: {
    STANDARD: {
      milestones: [
        { name: 'Application Received', dayOffset: 0, description: 'PMDA receipt of the application; total review-period clock starts.' },
        { name: 'Approval', dayOffset: 365, description: 'Standard review target: ~12 months (~365 calendar days).' },
      ],
      targetDecisionOffset: 365,
    },
    PRIORITY: {
      milestones: [
        { name: 'Application Received', dayOffset: 0, description: 'PMDA receipt of the application; total review-period clock starts.' },
        { name: 'Approval', dayOffset: 270, description: 'Priority review target: ~9 months (~270 calendar days).' },
      ],
      targetDecisionOffset: 270,
    },
  },
  HEALTH_CANADA: {
    NDS_STANDARD: {
      milestones: [
        { name: 'Submission Filed', dayOffset: 0, description: 'Health Canada filing of the New Drug Submission; review clock starts.' },
        { name: 'Decision', dayOffset: 300, description: 'Standard NDS review performance target: 300 days.' },
      ],
      targetDecisionOffset: 300,
    },
    NDS_PRIORITY: {
      milestones: [
        { name: 'Submission Filed', dayOffset: 0, description: 'Health Canada filing of the priority New Drug Submission; review clock starts.' },
        { name: 'Decision', dayOffset: 215, description: 'Priority NDS review performance target: 215 days.' },
      ],
      targetDecisionOffset: 215,
    },
  },
  MHRA: {
    NATIONAL: {
      milestones: [
        { name: 'Validation', dayOffset: 0, description: 'MHRA validation of the application; Day 0 of the 150-day assessment.' },
        { name: 'Determination', dayOffset: 150, description: 'National 150-day assessment target (active days; clock-stops for questions not modelled).' },
      ],
      targetDecisionOffset: 150,
    },
  },
  TGA: {
    PRESCRIPTION_MEDICINE: {
      milestones: [
        { name: 'Submission Accepted', dayOffset: 0, description: 'TGA acceptance of the prescription-medicine application; evaluation clock starts.' },
        { name: 'Registration Decision', dayOffset: 357, description: '~255 working days approximated as 357 calendar days (255 / 5 * 7); excludes holidays and clock-stops.' },
      ],
      targetDecisionOffset: 357,
    },
  },
};

// ---------------------------------------------------------------------------
// Projector (pure)
// ---------------------------------------------------------------------------

/**
 * Project the review-clock milestones and target decision date for a region +
 * procedure. Pure / deterministic. Throws if the region+procedure is unknown.
 */
export function projectReviewTimeline(input: ReviewTimelineInput): ReviewTimeline {
  const { region, procedure } = input;

  const regionClocks = CLOCKS[region];
  if (!regionClocks) {
    throw new Error(`Unknown region "${region}". Supported regions: ${Object.keys(CLOCKS).join(', ')}.`);
  }

  const clock = regionClocks[procedure];
  if (!clock) {
    throw new Error(
      `Unknown procedure "${procedure}" for region "${region}". Supported procedures: ${Object.keys(regionClocks).join(', ')}.`,
    );
  }

  const start = toDate(input.startDate);
  if (Number.isNaN(start.getTime())) {
    throw new Error(`Invalid startDate: ${String(input.startDate)}`);
  }

  const milestones: ReviewMilestone[] = clock.milestones
    .map((m) => ({
      name: m.name,
      dayOffset: m.dayOffset,
      date: isoDate(addCalendarDays(start, m.dayOffset)),
      description: m.description,
    }))
    .sort((a, b) => (a.dayOffset === b.dayOffset ? a.name.localeCompare(b.name) : a.dayOffset - b.dayOffset));

  return {
    region,
    procedure,
    startDate: isoDate(start),
    milestones,
    targetDecisionDate: isoDate(addCalendarDays(start, clock.targetDecisionOffset)),
  };
}

/** List the supported procedures for a region (helper; pure). */
export function listProcedures(region: Region): string[] {
  return Object.keys(CLOCKS[region] ?? {});
}
