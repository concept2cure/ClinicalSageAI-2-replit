/**
 * Medicare Coverage Analysis metrics (Capability C2C-15) — in-memory counters
 * surfaced via the central /api/metrics endpoint. Mirrors the other domain
 * metrics modules.
 *
 * @module server/services/coverage-metrics
 */

interface CoverageMetricsState {
  analysesCreated: number;
  qualifyingDeterminations: Record<string, number>; // by determination
  itemsAdded: Record<string, number>; // by category
  itemsClassified: Record<string, number>; // by classification
  analysesFinalized: number;
}

const state: CoverageMetricsState = { analysesCreated: 0, qualifyingDeterminations: {}, itemsAdded: {}, itemsClassified: {}, analysesFinalized: 0 };

export function recordCoverageAnalysisCreated(): void {
  state.analysesCreated += 1;
}
export function recordCoverageQualifyingDetermination(determination: string): void {
  state.qualifyingDeterminations[determination] = (state.qualifyingDeterminations[determination] ?? 0) + 1;
}
export function recordCoverageItemAdded(category: string): void {
  state.itemsAdded[category] = (state.itemsAdded[category] ?? 0) + 1;
}
export function recordCoverageItemClassified(classification: string): void {
  state.itemsClassified[classification] = (state.itemsClassified[classification] ?? 0) + 1;
}
export function recordCoverageFinalized(): void {
  state.analysesFinalized += 1;
}

export function renderCoverageMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP coverage_analyses_created_total Medicare coverage analyses created');
  lines.push('# TYPE coverage_analyses_created_total counter');
  lines.push(`coverage_analyses_created_total ${state.analysesCreated}`);
  lines.push('# HELP coverage_qualifying_determinations_total Qualifying clinical trial determinations, by outcome (NCD 310.1)');
  lines.push('# TYPE coverage_qualifying_determinations_total counter');
  for (const [d, n] of Object.entries(state.qualifyingDeterminations)) lines.push(`coverage_qualifying_determinations_total{determination="${d}"} ${n}`);
  lines.push('# HELP coverage_items_added_total Coverage analysis items added, by category');
  lines.push('# TYPE coverage_items_added_total counter');
  for (const [c, n] of Object.entries(state.itemsAdded)) lines.push(`coverage_items_added_total{category="${c}"} ${n}`);
  lines.push('# HELP coverage_items_classified_total Coverage analysis items classified, by classification');
  lines.push('# TYPE coverage_items_classified_total counter');
  for (const [c, n] of Object.entries(state.itemsClassified)) lines.push(`coverage_items_classified_total{classification="${c}"} ${n}`);
  lines.push('# HELP coverage_analyses_finalized_total Coverage analyses finalized (all items classified)');
  lines.push('# TYPE coverage_analyses_finalized_total counter');
  lines.push(`coverage_analyses_finalized_total ${state.analysesFinalized}`);
  return lines;
}

export function snapshotCoverageMetrics(): CoverageMetricsState {
  return JSON.parse(JSON.stringify(state));
}
export function resetCoverageMetrics(): void {
  state.analysesCreated = 0;
  state.qualifyingDeterminations = {};
  state.itemsAdded = {};
  state.itemsClassified = {};
  state.analysesFinalized = 0;
}
