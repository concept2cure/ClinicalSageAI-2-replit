/**
 * Protocol SoA metrics (C2C-21) — in-memory counters for /api/metrics.
 * @module server/services/protocol-soa-metrics
 */

interface State { assessmentsAdded: number; cellsSet: number; matrixViews: number }
const state: State = { assessmentsAdded: 0, cellsSet: 0, matrixViews: 0 };

export function recordSoaAssessmentAdded(): void { state.assessmentsAdded += 1; }
export function recordSoaCellSet(): void { state.cellsSet += 1; }
export function recordSoaMatrixView(): void { state.matrixViews += 1; }

export function renderProtocolSoaMetrics(): string[] {
  return [
    '# HELP protocol_soa_assessments_added_total SoA assessments (rows) added',
    '# TYPE protocol_soa_assessments_added_total counter',
    `protocol_soa_assessments_added_total ${state.assessmentsAdded}`,
    '# HELP protocol_soa_cells_set_total SoA assessment×visit cells set',
    '# TYPE protocol_soa_cells_set_total counter',
    `protocol_soa_cells_set_total ${state.cellsSet}`,
    '# HELP protocol_soa_matrix_views_total SoA matrix reads',
    '# TYPE protocol_soa_matrix_views_total counter',
    `protocol_soa_matrix_views_total ${state.matrixViews}`,
  ];
}

export function snapshotProtocolSoaMetrics(): State { return JSON.parse(JSON.stringify(state)); }
export function resetProtocolSoaMetrics(): void { state.assessmentsAdded = 0; state.cellsSet = 0; state.matrixViews = 0; }
