/**
 * Protocol Amendments metrics (Capability C2C-18a) — in-memory counters surfaced
 * via the central /api/metrics endpoint.
 *
 * @module server/services/protocol-amendments-metrics
 */

interface ProtocolAmendmentsMetricsState {
  created: Record<string, number>; // by amendment type
  changesAdded: number;
  statusTransitions: Record<string, number>; // by target status
}

const state: ProtocolAmendmentsMetricsState = { created: {}, changesAdded: 0, statusTransitions: {} };

export function recordAmendmentCreated(type: string): void { state.created[type] = (state.created[type] ?? 0) + 1; }
export function recordAmendmentChangeAdded(): void { state.changesAdded += 1; }
export function recordAmendmentStatus(status: string): void { state.statusTransitions[status] = (state.statusTransitions[status] ?? 0) + 1; }

export function renderProtocolAmendmentsMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP protocol_amendments_created_total Protocol amendments created, by type');
  lines.push('# TYPE protocol_amendments_created_total counter');
  for (const [t, n] of Object.entries(state.created)) lines.push(`protocol_amendments_created_total{type="${t}"} ${n}`);
  lines.push('# HELP protocol_amendment_changes_total Protocol amendment change line items added');
  lines.push('# TYPE protocol_amendment_changes_total counter');
  lines.push(`protocol_amendment_changes_total ${state.changesAdded}`);
  lines.push('# HELP protocol_amendments_status_total Protocol amendment status transitions, by status');
  lines.push('# TYPE protocol_amendments_status_total counter');
  for (const [s, n] of Object.entries(state.statusTransitions)) lines.push(`protocol_amendments_status_total{status="${s}"} ${n}`);
  return lines;
}

export function snapshotProtocolAmendmentsMetrics(): ProtocolAmendmentsMetricsState { return JSON.parse(JSON.stringify(state)); }
export function resetProtocolAmendmentsMetrics(): void {
  state.created = {};
  state.changesAdded = 0;
  state.statusTransitions = {};
}
