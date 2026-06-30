/**
 * Protocol Deviations & CAPA metrics (Capability C2C-18b) — in-memory counters
 * surfaced via the central /api/metrics endpoint.
 *
 * @module server/services/protocol-deviations-metrics
 */

import { createMetricsModule } from './shared/metrics-factory';

const m = createMetricsModule({
  deviations:  { kind: 'labeled', metric: 'protocol_deviations_total',       help: 'Protocol deviations reported, by severity', labelKey: 'severity' },
  capaActions: { kind: 'scalar',  metric: 'protocol_capa_actions_total',     help: 'Protocol CAPA actions added' },
  closed:      { kind: 'scalar',  metric: 'protocol_deviations_closed_total', help: 'Protocol deviations closed' },
} as const);

export function recordDeviationReported(severity: string): void { m.incLabeled('deviations', severity); }
export function recordCapaActionAdded(): void { m.inc('capaActions'); }
export function recordDeviationClosed(): void { m.inc('closed'); }

export function renderProtocolDeviationsMetrics(): string[] { return m.render(); }
export function snapshotProtocolDeviationsMetrics() { return m.snapshot(); }
export function resetProtocolDeviationsMetrics(): void { m.reset(); }
