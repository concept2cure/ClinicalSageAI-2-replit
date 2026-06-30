/**
 * Protocol Export metrics (C2C-20c) — in-memory counters for /api/metrics.
 * @module server/services/protocol-export-metrics
 */

import { createMetricsModule } from './shared/metrics-factory';

const m = createMetricsModule({
  exports:    { kind: 'scalar', metric: 'protocol_exports_total',    help: 'Protocol document exports assembled' },
  ctgovDrafts: { kind: 'scalar', metric: 'protocol_ctgov_drafts_total', help: 'ClinicalTrials.gov registration drafts generated' },
} as const);

export function recordProtocolExport(): void { m.inc('exports'); }
export function recordCtGovDraft(): void { m.inc('ctgovDrafts'); }

export function renderProtocolExportMetrics(): string[] { return m.render(); }
export function snapshotProtocolExportMetrics() { return m.snapshot(); }
export function resetProtocolExportMetrics(): void { m.reset(); }
