/**
 * Protocol Risk Register metrics (Capability C2C-19) — in-memory counters
 * surfaced via the central /api/metrics endpoint.
 *
 * @module server/services/protocol-risks-metrics
 */

import { createMetricsModule } from './shared/metrics-factory';

const m = createMetricsModule({
  risksAdded:    { kind: 'labeled', metric: 'protocol_risks_added_total',          help: 'Protocol risks added, by risk level', labelKey: 'level' },
  risksUpdated:  { kind: 'scalar',  metric: 'protocol_risks_updated_total',        help: 'Protocol risk updates (mitigation/status)' },
  registerViews: { kind: 'scalar',  metric: 'protocol_risk_register_views_total',  help: 'Protocol risk register reads' },
} as const);

export function recordProtocolRiskAdded(level: string): void { m.incLabeled('risksAdded', level); }
export function recordProtocolRiskUpdated(): void { m.inc('risksUpdated'); }
export function recordProtocolRiskRegisterView(): void { m.inc('registerViews'); }

export function renderProtocolRiskMetrics(): string[] { return m.render(); }
export function snapshotProtocolRiskMetrics() { return m.snapshot(); }
export function resetProtocolRiskMetrics(): void { m.reset(); }
