/**
 * eGrants metrics (Capability C2C-14) — in-memory counters surfaced via the
 * central /api/metrics endpoint. Mirrors the other domain metrics modules.
 *
 * @module server/services/grants-metrics
 */

interface GrantsMetricsState {
  proposalsCreated: number;
  awardsRecorded: Record<string, number>; // by funding agency
  invoicesByStatus: Record<string, number>;
  milestoneStatus: Record<string, number>; // by milestone status transition
  closeoutsOpened: number;
  closeoutsFinalized: number;
  subawardsByType: Record<string, number>; // by institution type
  subawardsExecuted: number;
  budgetLinesByCategory: Record<string, number>;
  expendituresByCategory: Record<string, number>;
}

const state: GrantsMetricsState = { proposalsCreated: 0, awardsRecorded: {}, invoicesByStatus: {}, milestoneStatus: {}, closeoutsOpened: 0, closeoutsFinalized: 0, subawardsByType: {}, subawardsExecuted: 0, budgetLinesByCategory: {}, expendituresByCategory: {} };

export function recordGrantProposalCreated(): void {
  state.proposalsCreated += 1;
}
export function recordGrantAwardRecorded(agency: string): void {
  state.awardsRecorded[agency] = (state.awardsRecorded[agency] ?? 0) + 1;
}
export function recordGrantInvoice(status: string): void {
  state.invoicesByStatus[status] = (state.invoicesByStatus[status] ?? 0) + 1;
}
export function recordGrantMilestoneStatus(status: string): void {
  state.milestoneStatus[status] = (state.milestoneStatus[status] ?? 0) + 1;
}
export function recordGrantCloseoutOpened(): void { state.closeoutsOpened += 1; }
export function recordGrantCloseoutFinalized(): void { state.closeoutsFinalized += 1; }
export function recordGrantSubaward(institutionType: string): void {
  state.subawardsByType[institutionType] = (state.subawardsByType[institutionType] ?? 0) + 1;
}
export function recordGrantSubawardExecuted(): void { state.subawardsExecuted += 1; }
export function recordGrantBudgetLine(category: string): void {
  state.budgetLinesByCategory[category] = (state.budgetLinesByCategory[category] ?? 0) + 1;
}
export function recordGrantExpenditure(category: string): void {
  state.expendituresByCategory[category] = (state.expendituresByCategory[category] ?? 0) + 1;
}

export function renderGrantsMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP grants_proposals_created_total Grant proposals created');
  lines.push('# TYPE grants_proposals_created_total counter');
  lines.push(`grants_proposals_created_total ${state.proposalsCreated}`);
  lines.push('# HELP grants_awards_recorded_total Grant awards recorded, by funding agency');
  lines.push('# TYPE grants_awards_recorded_total counter');
  for (const [a, n] of Object.entries(state.awardsRecorded)) lines.push(`grants_awards_recorded_total{agency="${a}"} ${n}`);
  lines.push('# HELP grants_invoices_total Sponsor invoices, by status');
  lines.push('# TYPE grants_invoices_total counter');
  for (const [s, n] of Object.entries(state.invoicesByStatus)) lines.push(`grants_invoices_total{status="${s}"} ${n}`);
  lines.push('# HELP grants_milestone_status_total Grant milestone status transitions, by status');
  lines.push('# TYPE grants_milestone_status_total counter');
  for (const [s, n] of Object.entries(state.milestoneStatus)) lines.push(`grants_milestone_status_total{status="${s}"} ${n}`);
  lines.push('# HELP grants_closeouts_opened_total Grant closeout records opened (2 CFR 200.344)');
  lines.push('# TYPE grants_closeouts_opened_total counter');
  lines.push(`grants_closeouts_opened_total ${state.closeoutsOpened}`);
  lines.push('# HELP grants_closeouts_finalized_total Grant closeouts finalized (all required items complete)');
  lines.push('# TYPE grants_closeouts_finalized_total counter');
  lines.push(`grants_closeouts_finalized_total ${state.closeoutsFinalized}`);
  lines.push('# HELP grants_subawards_total Subawards created, by subrecipient institution type');
  lines.push('# TYPE grants_subawards_total counter');
  for (const [t, n] of Object.entries(state.subawardsByType)) lines.push(`grants_subawards_total{institution_type="${t}"} ${n}`);
  lines.push('# HELP grants_subawards_executed_total Subawards executed (cleared screen + risk assessment)');
  lines.push('# TYPE grants_subawards_executed_total counter');
  lines.push(`grants_subawards_executed_total ${state.subawardsExecuted}`);
  lines.push('# HELP grants_budget_lines_total Budget lines added, by cost category');
  lines.push('# TYPE grants_budget_lines_total counter');
  for (const [c, n] of Object.entries(state.budgetLinesByCategory)) lines.push(`grants_budget_lines_total{category="${c}"} ${n}`);
  lines.push('# HELP grants_expenditures_total Expenditures recorded, by cost category');
  lines.push('# TYPE grants_expenditures_total counter');
  for (const [c, n] of Object.entries(state.expendituresByCategory)) lines.push(`grants_expenditures_total{category="${c}"} ${n}`);
  return lines;
}

export function snapshotGrantsMetrics(): GrantsMetricsState {
  return JSON.parse(JSON.stringify(state));
}
export function resetGrantsMetrics(): void {
  state.proposalsCreated = 0;
  state.awardsRecorded = {};
  state.invoicesByStatus = {};
  state.milestoneStatus = {};
  state.closeoutsOpened = 0;
  state.closeoutsFinalized = 0;
  state.subawardsByType = {};
  state.subawardsExecuted = 0;
  state.budgetLinesByCategory = {};
  state.expendituresByCategory = {};
}
