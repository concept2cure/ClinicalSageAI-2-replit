/**
 * eGrants deterministic logic (Capability C2C-14)
 *
 * Pure, DB-free, LLM-free: deadline urgency for proposals / milestones / invoices,
 * federal post-award reporting cadence, and award-period status. Grounded in
 * 2 CFR 200 (Uniform Guidance) and NIH RPPR reporting; cited where it matters.
 *
 * @module server/services/grants/grants-logic
 */

/** ISO date (YYYY-MM-DD) → epoch days, or null. Pure, timezone-free. */
function toDays(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

export type UrgencyBucket = 'overdue' | 'due_30' | 'due_90' | 'later' | 'undated' | 'closed';

export interface DeadlineItem {
  dueDate?: string | null;
  /** True once the item is in a terminal/done state (submitted/met/paid/awarded). */
  terminal: boolean;
}

/** Bucket a deadline-bearing item (proposal, milestone, invoice) by urgency. Pure. */
export function deadlineUrgency(item: DeadlineItem, today: string): UrgencyBucket {
  if (item.terminal) return 'closed';
  const due = toDays(item.dueDate);
  const now = toDays(today);
  if (due == null || now == null) return 'undated';
  if (due < now) return 'overdue';
  const days = due - now;
  if (days <= 30) return 'due_30';
  if (days <= 90) return 'due_90';
  return 'later';
}

export interface PortfolioSummary {
  total: number;
  overdue: number;
  due_30: number;
  due_90: number;
  later: number;
  undated: number;
  closed: number;
}

/** Summarize a set of deadline-bearing items by urgency. Pure. */
export function summarizeDeadlines(items: DeadlineItem[], today: string): PortfolioSummary {
  const s: PortfolioSummary = { total: items.length, overdue: 0, due_30: 0, due_90: 0, later: 0, undated: 0, closed: 0 };
  for (const it of items) s[deadlineUrgency(it, today)] += 1;
  return s;
}

/** Add N days to an ISO date. Pure. */
function addDays(iso: string, days: number): string {
  const d = toDays(iso);
  if (d == null) return iso;
  const t = (d + days) * 86_400_000;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Add N years to an ISO date. Pure. */
function addYears(iso: string, years: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${(Number(m[1]) + years).toString().padStart(4, '0')}-${m[2]}-${m[3]}`;
}

export interface ReportingObligation {
  type: 'annual_rppr' | 'final_rppr' | 'final_financial';
  dueDate: string;
  basis: string;
}

/**
 * Derive the standard federal post-award reporting obligations for an award
 * period. Annual RPPR ~60 days before each budget anniversary; final RPPR and
 * final financial (FFR) reports due within 120 days after the period of
 * performance ends (2 CFR 200.344). Pure.
 */
export function reportingObligations(periodStart: string | null, periodEnd: string | null): ReportingObligation[] {
  const out: ReportingObligation[] = [];
  if (periodStart && periodEnd) {
    // Annual RPPR for each full year inside the period (anniversary minus 60 days).
    const startDays = toDays(periodStart)!;
    const endDays = toDays(periodEnd)!;
    for (let y = 1; ; y++) {
      const anniversary = addYears(periodStart, y);
      if (toDays(anniversary)! >= endDays) break;
      if (toDays(anniversary)! <= startDays) continue;
      out.push({ type: 'annual_rppr', dueDate: addDays(anniversary, -60), basis: 'NIH RPPR — annual progress report' });
    }
  }
  if (periodEnd) {
    out.push({ type: 'final_rppr', dueDate: addDays(periodEnd, 120), basis: '2 CFR 200.344 — final performance report (120 days)' });
    out.push({ type: 'final_financial', dueDate: addDays(periodEnd, 120), basis: '2 CFR 200.344 — final FFR (120 days)' });
  }
  return out;
}

export type AwardPeriodState = 'pre_start' | 'active' | 'closeout_window' | 'lapsed';

/**
 * Where an award sits relative to its period of performance. `closeout_window`
 * is the 120 days after the end date in which final reports are due. Pure.
 */
export function awardPeriodState(periodStart: string | null, periodEnd: string | null, today: string): AwardPeriodState {
  const now = toDays(today);
  const start = toDays(periodStart);
  const end = toDays(periodEnd);
  if (now == null) return 'active';
  if (start != null && now < start) return 'pre_start';
  if (end != null && now > end) {
    return now <= toDays(addDays(periodEnd!, 120))! ? 'closeout_window' : 'lapsed';
  }
  return 'active';
}
