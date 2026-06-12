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

// ─── Closeout (2 CFR 200.344) ────────────────────────────────────────────────

/** Federal closeout deadline: 120 days after the period of performance ends. Pure. */
export function closeoutDueDate(periodEnd: string | null): string | null {
  return periodEnd ? addDays(periodEnd, 120) : null;
}

/** The four required closeout deliverables under 2 CFR 200.344 / 200.313. */
export interface CloseoutRecordState {
  finalRpprSubmitted: boolean;
  finalFfrSubmitted: boolean;
  equipmentInventoryReturned: boolean;
  finalInvoicesReconciled: boolean;
  status?: string | null;
}

export interface CloseoutChecklistItem { key: string; label: string; complete: boolean; basis: string }

export interface CloseoutState {
  dueDate: string | null;
  daysRemaining: number | null;
  overdue: boolean;
  items: CloseoutChecklistItem[];
  outstanding: string[];
  readyToFinalize: boolean;
  status: 'not_due' | 'open' | 'overdue' | 'complete';
}

/**
 * Evaluate a recipient's closeout posture against the federal requirements:
 * final performance report, final FFR (SF-425), final property inventory, and
 * liquidation/reconciliation of final invoices — all due within 120 days of the
 * period end (2 CFR 200.344; property per 2 CFR 200.313). Pure; the deterministic
 * gate for finalize (a closeout cannot be finalized with outstanding items).
 */
export function evaluateCloseout(record: CloseoutRecordState, periodEnd: string | null, today: string): CloseoutState {
  const items: CloseoutChecklistItem[] = [
    { key: 'final_rppr', label: 'Final performance / progress report submitted', complete: record.finalRpprSubmitted, basis: '2 CFR 200.344(a) — final performance report' },
    { key: 'final_ffr', label: 'Final Federal Financial Report (SF-425) submitted', complete: record.finalFfrSubmitted, basis: '2 CFR 200.344(a) — final financial report' },
    { key: 'equipment_inventory', label: 'Final property / equipment inventory returned', complete: record.equipmentInventoryReturned, basis: '2 CFR 200.313 — equipment inventory & disposition' },
    { key: 'invoices_reconciled', label: 'Final invoices reconciled / obligations liquidated', complete: record.finalInvoicesReconciled, basis: '2 CFR 200.344(b) — liquidation of obligations' },
  ];
  const outstanding = items.filter((i) => !i.complete).map((i) => i.key);
  const readyToFinalize = outstanding.length === 0;
  const dueDate = closeoutDueDate(periodEnd);
  const due = toDays(dueDate);
  const now = toDays(today);
  const daysRemaining = due != null && now != null ? due - now : null;

  let status: CloseoutState['status'];
  if (record.status === 'completed' || readyToFinalize && record.status === 'completed') status = 'complete';
  else if (due != null && now != null && now > due) status = 'overdue';
  else if (due == null) status = 'not_due';
  else status = 'open';
  const overdue = status === 'overdue';

  return { dueDate, daysRemaining, overdue, items, outstanding, readyToFinalize, status };
}

// ─── Subaward eligibility (2 CFR 200.214 / 200.331 / 200.332) ─────────────────

export type SubawardScreenStatus = 'not_screened' | 'cleared' | 'excluded';
export type SubawardRiskLevel = 'low' | 'medium' | 'high';

export interface SubawardEligibilityInput {
  screenStatus: SubawardScreenStatus;
  riskLevel: SubawardRiskLevel | null;
}

export interface SubawardEligibility {
  eligible: boolean;
  blockers: string[];
}

/**
 * Whether a subaward may be executed. A pass-through entity must not subaward to a
 * debarred/suspended party (2 CFR 200.214) and must assess subrecipient risk before
 * issuing the subaward (2 CFR 200.332(b)). Pure; the deterministic gate for execute.
 */
export function evaluateSubawardEligibility(input: SubawardEligibilityInput): SubawardEligibility {
  const blockers: string[] = [];
  if (input.screenStatus === 'excluded') blockers.push('Subrecipient is on the SAM.gov exclusions list — subaward prohibited (2 CFR 200.214).');
  if (input.screenStatus === 'not_screened') blockers.push('Restricted-party screening not performed (2 CFR 200.214 — verify not suspended/debarred).');
  if (input.riskLevel == null) blockers.push('Subrecipient risk assessment not recorded (2 CFR 200.332(b)).');
  return { eligible: blockers.length === 0, blockers };
}

// ─── Budget vs actual (2 CFR 200.308 / 200.403 / 200.414) ────────────────────

export type BudgetCategory =
  | 'personnel' | 'fringe' | 'equipment' | 'travel' | 'supplies'
  | 'contractual' | 'construction' | 'other_direct' | 'indirect';

/** Federal de minimis indirect (F&A) rate for recipients without a negotiated rate (2 CFR 200.414(f)). */
export const DE_MINIMIS_INDIRECT_RATE = 15;
/** Over-budget tolerance before a category variance is flagged high-risk (rebudgeting headroom, 2 CFR 200.308). */
export const BUDGET_VARIANCE_TOLERANCE_PCT = 10;

export interface BudgetLineView { category: BudgetCategory; budgetedAmount: number }
export interface ExpenditureView { category: BudgetCategory; amount: number }

export interface CategoryBudget {
  category: BudgetCategory;
  budgeted: number;
  actual: number;
  remaining: number;
  variancePct: number; // (actual - budgeted) / budgeted * 100; 0 when nothing budgeted
  overBudget: boolean;
}

export interface BudgetFinding { severity: 'info' | 'warning' | 'critical'; message: string }

export interface BudgetSummary {
  categories: CategoryBudget[];
  totalBudgeted: number;
  totalActual: number;
  totalRemaining: number;
  overAllocated: boolean; // total budgeted exceeds the award amount
  riskLevel: 'low' | 'medium' | 'high';
  findings: BudgetFinding[];
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

/**
 * Compute the indirect (F&A) cost on a modified total direct cost base at a given
 * rate (2 CFR 200.414). Pure. `ratePct` defaults to the 10% de minimis is NOT
 * assumed — callers pass the negotiated or de minimis rate explicitly.
 */
export function computeIndirectCost(modifiedTotalDirect: number, ratePct: number): number {
  if (!(modifiedTotalDirect > 0) || !(ratePct > 0)) return 0;
  return round2(modifiedTotalDirect * (ratePct / 100));
}

/**
 * Budget-vs-actual posture for an award: per-category budgeted/actual/remaining,
 * over-budget flags, and an over-allocation check against the award total. Pure;
 * the deterministic gate for budgeting (a budget may not over-allocate the award)
 * lives in the service, which calls this. Findings cite 2 CFR 200.308/200.403.
 */
export function budgetVsActual(lines: BudgetLineView[], expenditures: ExpenditureView[], awardTotal: number | null): BudgetSummary {
  const cats = new Map<BudgetCategory, { budgeted: number; actual: number }>();
  for (const l of lines) {
    const c = cats.get(l.category) ?? { budgeted: 0, actual: 0 };
    c.budgeted += l.budgetedAmount;
    cats.set(l.category, c);
  }
  for (const e of expenditures) {
    const c = cats.get(e.category) ?? { budgeted: 0, actual: 0 };
    c.actual += e.amount;
    cats.set(e.category, c);
  }

  const findings: BudgetFinding[] = [];
  const categories: CategoryBudget[] = [];
  let totalBudgeted = 0, totalActual = 0;
  for (const [category, v] of cats) {
    const budgeted = round2(v.budgeted), actual = round2(v.actual);
    const remaining = round2(budgeted - actual);
    const variancePct = budgeted > 0 ? round2(((actual - budgeted) / budgeted) * 100) : 0;
    const overBudget = actual > budgeted && budgeted > 0;
    if (overBudget && variancePct > BUDGET_VARIANCE_TOLERANCE_PCT) {
      findings.push({ severity: 'critical', message: `${category} is ${variancePct}% over budget (>${BUDGET_VARIANCE_TOLERANCE_PCT}% — prior approval may be required, 2 CFR 200.308).` });
    } else if (overBudget) {
      findings.push({ severity: 'warning', message: `${category} is over budget by ${round2(actual - budgeted)} (2 CFR 200.403 — costs must be allowable & reasonable).` });
    }
    categories.push({ category, budgeted, actual, remaining, variancePct, overBudget });
    totalBudgeted += budgeted;
    totalActual += actual;
  }
  totalBudgeted = round2(totalBudgeted);
  totalActual = round2(totalActual);

  const overAllocated = awardTotal != null && totalBudgeted > awardTotal;
  if (overAllocated) findings.push({ severity: 'critical', message: `Total budgeted (${totalBudgeted}) exceeds the award amount (${awardTotal}).` });
  if (awardTotal != null && totalActual > awardTotal) findings.push({ severity: 'critical', message: `Total expenditures (${totalActual}) exceed the award amount (${awardTotal}).` });

  const hasCritical = findings.some((f) => f.severity === 'critical');
  const riskLevel: BudgetSummary['riskLevel'] = hasCritical ? 'high' : findings.length > 0 || totalActual > totalBudgeted ? 'medium' : 'low';

  return { categories, totalBudgeted, totalActual, totalRemaining: round2(totalBudgeted - totalActual), overAllocated, riskLevel, findings };
}

// ─── Cost share (2 CFR 200.306) ──────────────────────────────────────────────

export interface CostShareContributionView { amount: number }

export interface CostShareStatus {
  committed: number;
  contributed: number;
  remaining: number;
  metPct: number; // contributed / committed * 100 (0 when nothing committed)
  met: boolean;
  shortfall: number; // committed - contributed, floored at 0
}

/**
 * Cost-share / matching posture for an award: committed vs actually contributed,
 * the percentage met, and any shortfall. A recipient must meet its committed cost
 * share (2 CFR 200.306); a shortfall is a closeout risk. Pure.
 */
export function costShareStatus(committed: number | null, contributions: CostShareContributionView[]): CostShareStatus {
  const c = committed && committed > 0 ? round2(committed) : 0;
  const contributed = round2(contributions.reduce((s, x) => s + x.amount, 0));
  const remaining = round2(Math.max(0, c - contributed));
  const metPct = c > 0 ? round2((contributed / c) * 100) : 0;
  return { committed: c, contributed, remaining, metPct, met: c === 0 || contributed >= c, shortfall: remaining };
}

// ─── No-cost extension (2 CFR 200.308) ───────────────────────────────────────

export type NceAuthority = 'grantee' | 'sponsor';

/** Whole months between two ISO dates (floor). Pure. */
function monthsBetween(fromIso: string, toIso: string): number {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(fromIso);
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(toIso);
  if (!a || !b) return 0;
  let months = (Number(b[1]) - Number(a[1])) * 12 + (Number(b[2]) - Number(a[2]));
  if (Number(b[3]) < Number(a[3])) months -= 1;
  return months;
}

/** Maximum months a first, grantee-authorized no-cost extension may run (2 CFR 200.308(d)(2)). */
export const GRANTEE_NCE_MAX_MONTHS = 12;

export interface NceEvaluation {
  months: number;
  withinGranteeAuthority: boolean;
  requiresSponsorApproval: boolean;
  reason: string;
}

/**
 * Evaluate a proposed no-cost extension. Under 2 CFR 200.308(d)(2) a recipient may
 * make a one-time extension of up to 12 months without sponsor prior approval;
 * a second extension, any extension over 12 months, or a shortened/invalid end
 * date requires the sponsor (200.308(d)(3)/(e)). Pure; the gate for grantee approval.
 */
export function evaluateNce(originalEnd: string, newEnd: string, priorNceCount: number): NceEvaluation {
  const months = monthsBetween(originalEnd, newEnd);
  if (months <= 0) {
    return { months, withinGranteeAuthority: false, requiresSponsorApproval: true, reason: 'New end date is not after the current end date.' };
  }
  const firstExtension = priorNceCount === 0;
  const withinGranteeAuthority = firstExtension && months <= GRANTEE_NCE_MAX_MONTHS;
  return {
    months,
    withinGranteeAuthority,
    requiresSponsorApproval: !withinGranteeAuthority,
    reason: withinGranteeAuthority
      ? `First extension of ${months} month(s) — within grantee authority (2 CFR 200.308(d)(2)).`
      : !firstExtension
        ? 'A prior no-cost extension exists — sponsor prior approval required (2 CFR 200.308(d)(3)).'
        : `Extension of ${months} months exceeds the 12-month grantee limit — sponsor prior approval required.`,
  };
}
