/**
 * Protocol SoA metrics (C2C-21) — in-memory counters for /api/metrics.
 * @module server/services/protocol-soa-metrics
 */

import { createMetricsModule } from './shared/metrics-factory';

const m = createMetricsModule({
  assessmentsAdded: { kind: 'scalar', metric: 'protocol_soa_assessments_added_total', help: 'SoA assessments (rows) added' },
  cellsSet:         { kind: 'scalar', metric: 'protocol_soa_cells_set_total',         help: 'SoA assessment×visit cells set' },
  matrixViews:      { kind: 'scalar', metric: 'protocol_soa_matrix_views_total',      help: 'SoA matrix reads' },
} as const);

export function recordSoaAssessmentAdded(): void { m.inc('assessmentsAdded'); }
export function recordSoaCellSet(): void { m.inc('cellsSet'); }
export function recordSoaMatrixView(): void { m.inc('matrixViews'); }

export function renderProtocolSoaMetrics(): string[] { return m.render(); }
export function snapshotProtocolSoaMetrics() { return m.snapshot(); }
export function resetProtocolSoaMetrics(): void { m.reset(); }
