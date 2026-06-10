/**
 * IND regulatory timeline / milestone derivation.
 *
 * Projects the key regulatory dates for an IND from its anchor dates: the
 * 30-calendar-day safe-to-proceed date (21 CFR 312.40) and the annual-report
 * anniversaries with their 60-day due dates (21 CFR 312.33 — the annual report
 * is due within 60 days of the anniversary on which the IND went into effect).
 *
 * Pure / deterministic. Stateless — the caller supplies the anchor dates.
 */

export type MilestoneStatus = 'past' | 'due_soon' | 'upcoming';

export interface TimelineMilestone {
  key: string;
  label: string;
  /** ISO date the milestone falls due. */
  date: string;
  cfrRef: string;
  status: MilestoneStatus;
  /** Calendar days from `asOf` to the milestone (negative once past). */
  daysFromNow: number;
}

export interface IndTimelineInput {
  /** ISO date FDA received the original IND (drives the 30-day clock). */
  receiptDate: string;
  /** ISO date the IND went into effect (drives annual-report anniversaries). */
  effectiveDate?: string;
  /** Evaluate as of this ISO date (defaults to now). */
  asOf?: string;
  /** How far ahead to project annual reports, in days (default ~3 years). */
  horizonDays?: number;
  /** A milestone within this many days of `asOf` is flagged "due_soon" (default 30). */
  dueSoonDays?: number;
}

export interface IndTimeline {
  milestones: TimelineMilestone[];
  /** The next not-yet-past milestone, or null when none remain in the horizon. */
  next: TimelineMilestone | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

function statusFor(date: Date, asOf: Date, dueSoonDays: number): { status: MilestoneStatus; daysFromNow: number } {
  const daysFromNow = Math.round((date.getTime() - asOf.getTime()) / DAY_MS);
  if (daysFromNow < 0) return { status: 'past', daysFromNow };
  if (daysFromNow <= dueSoonDays) return { status: 'due_soon', daysFromNow };
  return { status: 'upcoming', daysFromNow };
}

/**
 * Build the IND regulatory timeline. Milestones are returned in chronological
 * order; `next` is the earliest milestone that is not yet past.
 */
export function buildIndTimeline(input: IndTimelineInput): IndTimeline {
  const asOf = input.asOf ? new Date(input.asOf) : new Date();
  const dueSoonDays = input.dueSoonDays ?? 30;
  const horizonDays = input.horizonDays ?? 730;
  const horizonEnd = addDays(asOf, horizonDays);

  const milestones: TimelineMilestone[] = [];

  // 30-day safe-to-proceed (312.40(b)).
  {
    const date = addDays(new Date(input.receiptDate), 30);
    const { status, daysFromNow } = statusFor(date, asOf, dueSoonDays);
    milestones.push({
      key: 'safe_to_proceed',
      label: '30-day safe-to-proceed date',
      date: date.toISOString(),
      cfrRef: '21 CFR 312.40(b)',
      status,
      daysFromNow,
    });
  }

  // Annual report anniversaries + 60-day due dates (312.33), projected to the horizon.
  if (input.effectiveDate) {
    const effective = new Date(input.effectiveDate);
    for (let year = 1; year <= Math.ceil(horizonDays / 365) + 1; year += 1) {
      const anniversary = addDays(effective, 365 * year);
      const due = addDays(anniversary, 60);
      // Stop once both the anniversary and its due date are beyond the horizon.
      if (anniversary.getTime() > horizonEnd.getTime() && due.getTime() > horizonEnd.getTime()) break;
      const { status, daysFromNow } = statusFor(due, asOf, dueSoonDays);
      milestones.push({
        key: `annual_report_${year}`,
        label: `Annual report ${year} due (60 days after anniversary ${anniversary.toISOString().slice(0, 10)})`,
        date: due.toISOString(),
        cfrRef: '21 CFR 312.33',
        status,
        daysFromNow,
      });
    }
  }

  milestones.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const next = milestones.find((m) => m.status !== 'past') ?? null;

  return { milestones, next };
}
