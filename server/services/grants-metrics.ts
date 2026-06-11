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
}

const state: GrantsMetricsState = { proposalsCreated: 0, awardsRecorded: {}, invoicesByStatus: {} };

export function recordGrantProposalCreated(): void {
  state.proposalsCreated += 1;
}
export function recordGrantAwardRecorded(agency: string): void {
  state.awardsRecorded[agency] = (state.awardsRecorded[agency] ?? 0) + 1;
}
export function recordGrantInvoice(status: string): void {
  state.invoicesByStatus[status] = (state.invoicesByStatus[status] ?? 0) + 1;
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
  return lines;
}

export function snapshotGrantsMetrics(): GrantsMetricsState {
  return JSON.parse(JSON.stringify(state));
}
export function resetGrantsMetrics(): void {
  state.proposalsCreated = 0;
  state.awardsRecorded = {};
  state.invoicesByStatus = {};
}
