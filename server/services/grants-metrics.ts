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
}

const state: GrantsMetricsState = { proposalsCreated: 0, awardsRecorded: {}, invoicesByStatus: {}, milestoneStatus: {}, closeoutsOpened: 0, closeoutsFinalized: 0 };

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
}
