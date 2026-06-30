/**
 * NIH Biosketch metrics (Capability C2C-24B) — in-memory counters surfaced via the
 * central /api/metrics endpoint.
 *
 * @module server/services/biosketch-metrics
 */

interface BiosketchMetricsState {
  created: number;
  sectionsUpdated: number;
  finalized: number;
}

const state: BiosketchMetricsState = { created: 0, sectionsUpdated: 0, finalized: 0 };

export function recordBiosketchCreated(): void { state.created += 1; }
export function recordBiosketchSectionUpdated(): void { state.sectionsUpdated += 1; }
export function recordBiosketchFinalized(): void { state.finalized += 1; }

export function renderBiosketchMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP biosketches_created_total NIH biosketches created');
  lines.push('# TYPE biosketches_created_total counter');
  lines.push(`biosketches_created_total ${state.created}`);
  lines.push('# HELP biosketch_sections_updated_total Biosketch sections updated');
  lines.push('# TYPE biosketch_sections_updated_total counter');
  lines.push(`biosketch_sections_updated_total ${state.sectionsUpdated}`);
  lines.push('# HELP biosketches_finalized_total NIH biosketches finalized');
  lines.push('# TYPE biosketches_finalized_total counter');
  lines.push(`biosketches_finalized_total ${state.finalized}`);
  return lines;
}

export function snapshotBiosketchMetrics(): BiosketchMetricsState { return JSON.parse(JSON.stringify(state)); }
export function resetBiosketchMetrics(): void {
  state.created = 0;
  state.sectionsUpdated = 0;
  state.finalized = 0;
}
