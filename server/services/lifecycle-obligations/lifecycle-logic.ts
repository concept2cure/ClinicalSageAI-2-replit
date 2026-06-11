/**
 * Lifecycle Obligation deterministic logic (Capability C2C-11)
 *
 * Pure, DB-free, LLM-free: the variation/supplement classification catalog, the
 * periodic-report (PSUR) cadence engine that generates dated occurrences, and
 * obligation urgency. Grounded in EU Reg 1234/2008, 21 CFR 314.70, ICH E2C.
 *
 * @module server/services/lifecycle-obligations/lifecycle-logic
 */

function toDays(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000) : null;
}
function fromDays(days: number): string {
  const dt = new Date(days * 86_400_000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
function addMonths(iso: string, months: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const total = (Number(m[1]) * 12 + (Number(m[2]) - 1)) + months;
  const y = Math.floor(total / 12);
  const mo = (total % 12) + 1;
  // Clamp day to the month's last day.
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const d = Math.min(Number(m[3]), lastDay);
  return `${y.toString().padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Variation / supplement classifications with review pathway and citation. */
export const OBLIGATION_CLASSIFICATIONS: Array<{
  classification: string;
  region: 'eu' | 'fda';
  pathway: string;
  citation: string;
}> = [
  { classification: 'IA', region: 'eu', pathway: 'Do-and-tell: immediate notification (annual or within 12 months).', citation: 'EU Reg 1234/2008, Annex II (Type IA)' },
  { classification: 'IB', region: 'eu', pathway: 'Tell-wait-do: 30-day notification before implementation.', citation: 'EU Reg 1234/2008 (Type IB)' },
  { classification: 'II', region: 'eu', pathway: 'Major variation: prior approval required.', citation: 'EU Reg 1234/2008 (Type II)' },
  { classification: 'PAS', region: 'fda', pathway: 'Prior Approval Supplement: FDA approval before distribution.', citation: '21 CFR 314.70(b)' },
  { classification: 'CBE-30', region: 'fda', pathway: 'Changes Being Effected in 30 days: distribute after 30 days.', citation: '21 CFR 314.70(c)(3)' },
  { classification: 'CBE-0', region: 'fda', pathway: 'Changes Being Effected: distribute immediately.', citation: '21 CFR 314.70(c)(6)' },
  { classification: 'annual_report', region: 'fda', pathway: 'Annual Report: minor changes, no pre-approval.', citation: '21 CFR 314.70(d)' },
];

const CLASS_MAP = new Map(OBLIGATION_CLASSIFICATIONS.map((c) => [c.classification.toUpperCase(), c]));

/** Look up the review pathway for a classification (e.g. 'II', 'CBE-30'). Pure. */
export function classificationPathway(classification: string | null): { pathway: string; citation: string } | null {
  if (!classification) return null;
  return CLASS_MAP.get(classification.toUpperCase()) ?? null;
}

export interface Occurrence {
  periodStart: string;
  periodEnd: string;
  dueDate: string;
}

/**
 * Generate the next `count` periodic occurrences (e.g. PSURs) from an anchor
 * date and a cadence in months. The report is conventionally due ~70 days after
 * the data-lock point / period end (ICH E2C / GVP); we use 70 days. Pure.
 */
export function generateOccurrences(anchorDate: string, recurrenceMonths: number, count: number): Occurrence[] {
  const out: Occurrence[] = [];
  if (recurrenceMonths <= 0 || count <= 0) return out;
  let periodStart = anchorDate;
  for (let i = 0; i < count; i++) {
    const periodEnd = addMonths(periodStart, recurrenceMonths);
    const dueDays = toDays(periodEnd);
    const dueDate = dueDays != null ? fromDays(dueDays + 70) : periodEnd;
    out.push({ periodStart, periodEnd, dueDate });
    periodStart = periodEnd;
  }
  return out;
}

export type UrgencyBucket = 'overdue' | 'due_30' | 'due_90' | 'later' | 'undated' | 'closed';

export interface DeadlineItem {
  dueDate?: string | null;
  terminal: boolean;
}

/** Bucket a dated obligation/event by urgency. Pure. */
export function obligationUrgency(item: DeadlineItem, today: string): UrgencyBucket {
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

export interface CalendarSummary {
  total: number;
  overdue: number;
  due_30: number;
  due_90: number;
  later: number;
  undated: number;
  closed: number;
}

/** Summarize a lifecycle calendar by urgency. Pure. */
export function summarizeCalendar(items: DeadlineItem[], today: string): CalendarSummary {
  const s: CalendarSummary = { total: items.length, overdue: 0, due_30: 0, due_90: 0, later: 0, undated: 0, closed: 0 };
  for (const it of items) s[obligationUrgency(it, today)] += 1;
  return s;
}
