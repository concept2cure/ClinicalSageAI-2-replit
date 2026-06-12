/**
 * Effort-certification metrics (add-on, 2 CFR 200.430) — in-memory counters
 * surfaced via the central /api/metrics endpoint. Mirrors the suite's metrics
 * convention (see etmf-metrics.ts).
 *
 * @module server/services/effort-metrics
 */

interface EffortMetricsState {
  statementsCreated: number;
  linesAdded: number;
  certified: number;
  recertificationsRequired: number;
}

const state: EffortMetricsState = { statementsCreated: 0, linesAdded: 0, certified: 0, recertificationsRequired: 0 };

export function recordEffortStatementCreated(): void { state.statementsCreated += 1; }
export function recordEffortLineAdded(): void { state.linesAdded += 1; }
export function recordEffortCertified(needsRecertification: boolean): void {
  state.certified += 1;
  if (needsRecertification) state.recertificationsRequired += 1;
}

export function renderEffortMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP effort_statements_created_total Effort certification statements opened');
  lines.push('# TYPE effort_statements_created_total counter');
  lines.push(`effort_statements_created_total ${state.statementsCreated}`);
  lines.push('# HELP effort_lines_added_total Effort lines added across statements');
  lines.push('# TYPE effort_lines_added_total counter');
  lines.push(`effort_lines_added_total ${state.linesAdded}`);
  lines.push('# HELP effort_certifications_signed_total Effort statements certified (e-signed)');
  lines.push('# TYPE effort_certifications_signed_total counter');
  lines.push(`effort_certifications_signed_total ${state.certified}`);
  lines.push('# HELP effort_recertifications_required_total Certifications flagged for recertification (material deviation)');
  lines.push('# TYPE effort_recertifications_required_total counter');
  lines.push(`effort_recertifications_required_total ${state.recertificationsRequired}`);
  return lines;
}

export function snapshotEffortMetrics(): EffortMetricsState { return JSON.parse(JSON.stringify(state)); }
export function resetEffortMetrics(): void { state.statementsCreated = 0; state.linesAdded = 0; state.certified = 0; state.recertificationsRequired = 0; }
