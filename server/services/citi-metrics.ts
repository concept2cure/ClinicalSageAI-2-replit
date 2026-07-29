/**
 * CITI training metrics (Capability C2C-01/02) — in-memory counters surfaced via
 * the central /api/metrics endpoint. Mirrors the other domain metrics modules.
 *
 * @module server/services/citi-metrics
 */

interface CitiMetricsState {
  recordsImported: Record<string, number>; // by training type
  matrixViews: number;
  expiringReports: number;
}

const state: CitiMetricsState = { recordsImported: {}, matrixViews: 0, expiringReports: 0 };

export function recordCitiImported(byType: Record<string, number>): void {
  for (const [t, n] of Object.entries(byType)) state.recordsImported[t] = (state.recordsImported[t] ?? 0) + n;
}
export function recordCitiMatrixView(): void { state.matrixViews += 1; }
export function recordCitiExpiringReport(): void { state.expiringReports += 1; }

export function renderCitiMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP citi_records_imported_total CITI training completion records imported, by training type');
  lines.push('# TYPE citi_records_imported_total counter');
  for (const [t, n] of Object.entries(state.recordsImported)) lines.push(`citi_records_imported_total{training_type="${t}"} ${n}`);
  lines.push('# HELP citi_matrix_views_total CITI training-matrix reads');
  lines.push('# TYPE citi_matrix_views_total counter');
  lines.push(`citi_matrix_views_total ${state.matrixViews}`);
  lines.push('# HELP citi_expiring_reports_total CITI expiring-soon reports run');
  lines.push('# TYPE citi_expiring_reports_total counter');
  lines.push(`citi_expiring_reports_total ${state.expiringReports}`);
  return lines;
}

export function snapshotCitiMetrics(): CitiMetricsState { return JSON.parse(JSON.stringify(state)); }
export function resetCitiMetrics(): void {
  state.recordsImported = {};
  state.matrixViews = 0;
  state.expiringReports = 0;
}
