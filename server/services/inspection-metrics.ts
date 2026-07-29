/**
 * Inspection metrics (Capability C2C-13) — in-memory counters surfaced via the
 * central /api/metrics endpoint. Mirrors the other domain metrics modules.
 *
 * @module server/services/inspection-metrics
 */

interface InspectionMetricsState {
  inspectionsByType: Record<string, number>;
  findingsByClass: Record<string, number>;
  outcomes: Record<string, number>;
}

const state: InspectionMetricsState = { inspectionsByType: {}, findingsByClass: {}, outcomes: {} };

export function recordInspectionCreated(type: string): void {
  state.inspectionsByType[type] = (state.inspectionsByType[type] ?? 0) + 1;
}
export function recordInspectionFinding(classification: string): void {
  state.findingsByClass[classification] = (state.findingsByClass[classification] ?? 0) + 1;
}
export function recordInspectionOutcome(outcome: string): void {
  state.outcomes[outcome] = (state.outcomes[outcome] ?? 0) + 1;
}

export function renderInspectionMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP inspections_created_total Inspections created, by type');
  lines.push('# TYPE inspections_created_total counter');
  for (const [t, n] of Object.entries(state.inspectionsByType)) lines.push(`inspections_created_total{type="${t}"} ${n}`);
  lines.push('# HELP inspection_findings_total Inspection findings, by classification');
  lines.push('# TYPE inspection_findings_total counter');
  for (const [c, n] of Object.entries(state.findingsByClass)) lines.push(`inspection_findings_total{classification="${c}"} ${n}`);
  lines.push('# HELP inspection_outcomes_total Inspection outcomes recorded, by outcome');
  lines.push('# TYPE inspection_outcomes_total counter');
  for (const [o, n] of Object.entries(state.outcomes)) lines.push(`inspection_outcomes_total{outcome="${o}"} ${n}`);
  return lines;
}

export function snapshotInspectionMetrics(): InspectionMetricsState {
  return JSON.parse(JSON.stringify(state));
}
export function resetInspectionMetrics(): void {
  state.inspectionsByType = {};
  state.findingsByClass = {};
  state.outcomes = {};
}
