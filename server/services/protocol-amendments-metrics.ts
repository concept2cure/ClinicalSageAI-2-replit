/**
 * Protocol Amendments metrics (Capability C2C-18a) — in-memory counters surfaced
 * via the central /api/metrics endpoint.
 *
 * @module server/services/protocol-amendments-metrics
 */

import { createMetricsModule } from './shared/metrics-factory';

const m = createMetricsModule({
  created:           { kind: 'labeled', metric: 'protocol_amendments_created_total', help: 'Protocol amendments created, by type', labelKey: 'type' },
  changesAdded:      { kind: 'scalar',  metric: 'protocol_amendment_changes_total',  help: 'Protocol amendment change line items added' },
  statusTransitions: { kind: 'labeled', metric: 'protocol_amendments_status_total',  help: 'Protocol amendment status transitions, by status', labelKey: 'status' },
} as const);

export function recordAmendmentCreated(type: string): void { m.incLabeled('created', type); }
export function recordAmendmentChangeAdded(): void { m.inc('changesAdded'); }
export function recordAmendmentStatus(status: string): void { m.incLabeled('statusTransitions', status); }

export function renderProtocolAmendmentsMetrics(): string[] { return m.render(); }
export function snapshotProtocolAmendmentsMetrics() { return m.snapshot(); }
export function resetProtocolAmendmentsMetrics(): void { m.reset(); }
