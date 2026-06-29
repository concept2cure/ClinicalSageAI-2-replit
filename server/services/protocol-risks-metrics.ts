/**
 * Protocol Risk Register metrics (Capability C2C-19) — in-memory counters
 * surfaced via the central /api/metrics endpoint.
 *
 * @module server/services/protocol-risks-metrics
 */

interface RiskMetricsState {
  risksAdded: Record<string, number>; // by level
  risksUpdated: number;
  registerViews: number;
}

const state: RiskMetricsState = { risksAdded: {}, risksUpdated: 0, registerViews: 0 };

export function recordProtocolRiskAdded(level: string): void { state.risksAdded[level] = (state.risksAdded[level] ?? 0) + 1; }
export function recordProtocolRiskUpdated(): void { state.risksUpdated += 1; }
export function recordProtocolRiskRegisterView(): void { state.registerViews += 1; }

export function renderProtocolRiskMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP protocol_risks_added_total Protocol risks added, by risk level');
  lines.push('# TYPE protocol_risks_added_total counter');
  for (const [l, n] of Object.entries(state.risksAdded)) lines.push(`protocol_risks_added_total{level="${l}"} ${n}`);
  lines.push('# HELP protocol_risks_updated_total Protocol risk updates (mitigation/status)');
  lines.push('# TYPE protocol_risks_updated_total counter');
  lines.push(`protocol_risks_updated_total ${state.risksUpdated}`);
  lines.push('# HELP protocol_risk_register_views_total Protocol risk register reads');
  lines.push('# TYPE protocol_risk_register_views_total counter');
  lines.push(`protocol_risk_register_views_total ${state.registerViews}`);
  return lines;
}

export function snapshotProtocolRiskMetrics(): RiskMetricsState { return JSON.parse(JSON.stringify(state)); }
export function resetProtocolRiskMetrics(): void { state.risksAdded = {}; state.risksUpdated = 0; state.registerViews = 0; }
