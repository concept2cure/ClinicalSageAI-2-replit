/**
 * Protocol Deviations & CAPA metrics (Capability C2C-18b) — in-memory counters
 * surfaced via the central /api/metrics endpoint.
 *
 * @module server/services/protocol-deviations-metrics
 */

interface ProtocolDeviationsMetricsState {
  deviations: Record<string, number>; // by severity
  capaActions: number;
  closed: number;
}

const state: ProtocolDeviationsMetricsState = { deviations: {}, capaActions: 0, closed: 0 };

export function recordDeviationReported(severity: string): void { state.deviations[severity] = (state.deviations[severity] ?? 0) + 1; }
export function recordCapaActionAdded(): void { state.capaActions += 1; }
export function recordDeviationClosed(): void { state.closed += 1; }

export function renderProtocolDeviationsMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP protocol_deviations_total Protocol deviations reported, by severity');
  lines.push('# TYPE protocol_deviations_total counter');
  for (const [s, n] of Object.entries(state.deviations)) lines.push(`protocol_deviations_total{severity="${s}"} ${n}`);
  lines.push('# HELP protocol_capa_actions_total Protocol CAPA actions added');
  lines.push('# TYPE protocol_capa_actions_total counter');
  lines.push(`protocol_capa_actions_total ${state.capaActions}`);
  lines.push('# HELP protocol_deviations_closed_total Protocol deviations closed');
  lines.push('# TYPE protocol_deviations_closed_total counter');
  lines.push(`protocol_deviations_closed_total ${state.closed}`);
  return lines;
}

export function snapshotProtocolDeviationsMetrics(): ProtocolDeviationsMetricsState { return JSON.parse(JSON.stringify(state)); }
export function resetProtocolDeviationsMetrics(): void {
  state.deviations = {};
  state.capaActions = 0;
  state.closed = 0;
}
