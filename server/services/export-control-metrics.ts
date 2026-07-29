/**
 * Export Control metrics (Capability C2C-26) — in-memory counters surfaced via the
 * central /api/metrics endpoint.
 *
 * @module server/services/export-control-metrics
 */

interface ExportMetricsState { created: number; updated: number; determined: number }

const state: ExportMetricsState = { created: 0, updated: 0, determined: 0 };

export function recordExportReviewCreated(): void { state.created += 1; }
export function recordExportReviewUpdated(): void { state.updated += 1; }
export function recordExportReviewDetermined(): void { state.determined += 1; }

export function renderExportControlMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP export_control_reviews_created_total Export-control reviews created');
  lines.push('# TYPE export_control_reviews_created_total counter');
  lines.push(`export_control_reviews_created_total ${state.created}`);
  lines.push('# HELP export_control_reviews_updated_total Export-control reviews updated');
  lines.push('# TYPE export_control_reviews_updated_total counter');
  lines.push(`export_control_reviews_updated_total ${state.updated}`);
  lines.push('# HELP export_control_determinations_total Export-control determinations finalized');
  lines.push('# TYPE export_control_determinations_total counter');
  lines.push(`export_control_determinations_total ${state.determined}`);
  return lines;
}

export function snapshotExportControlMetrics(): ExportMetricsState { return JSON.parse(JSON.stringify(state)); }
export function resetExportControlMetrics(): void { state.created = 0; state.updated = 0; state.determined = 0; }
