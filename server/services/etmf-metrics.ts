/**
 * eTMF metrics (Capability C2C-08) — in-memory counters surfaced via the central
 * /api/metrics endpoint.
 *
 * @module server/services/etmf-metrics
 */

interface EtmfMetricsState {
  tmfFilesCreated: number;
  artifactsAdded: Record<string, number>; // by zone
  autoClassified: number;
}

const state: EtmfMetricsState = { tmfFilesCreated: 0, artifactsAdded: {}, autoClassified: 0 };

export function recordTmfFileCreated(): void {
  state.tmfFilesCreated += 1;
}
export function recordTmfArtifact(zone: number, autoClassified: boolean): void {
  const key = String(zone);
  state.artifactsAdded[key] = (state.artifactsAdded[key] ?? 0) + 1;
  if (autoClassified) state.autoClassified += 1;
}

export function renderEtmfMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP etmf_files_created_total TMF files created');
  lines.push('# TYPE etmf_files_created_total counter');
  lines.push(`etmf_files_created_total ${state.tmfFilesCreated}`);
  lines.push('# HELP etmf_artifacts_added_total TMF artifacts added, by DIA RM zone');
  lines.push('# TYPE etmf_artifacts_added_total counter');
  for (const [z, n] of Object.entries(state.artifactsAdded)) lines.push(`etmf_artifacts_added_total{zone="${z}"} ${n}`);
  lines.push('# HELP etmf_artifacts_auto_classified_total TMF artifacts auto-classified by the deterministic classifier');
  lines.push('# TYPE etmf_artifacts_auto_classified_total counter');
  lines.push(`etmf_artifacts_auto_classified_total ${state.autoClassified}`);
  return lines;
}

export function snapshotEtmfMetrics(): EtmfMetricsState {
  return JSON.parse(JSON.stringify(state));
}
export function resetEtmfMetrics(): void {
  state.tmfFilesCreated = 0;
  state.artifactsAdded = {};
  state.autoClassified = 0;
}
