/**
 * IACUC metrics (Capability C2C-05) — in-memory counters surfaced via the
 * central /api/metrics endpoint. Mirrors fcoi-metrics / ha-metrics.
 *
 * @module server/services/iacuc-metrics
 */

interface IacucMetricsState {
  protocolsCreated: Record<string, number>; // by pain category
  approvals: number;
  reviews: Record<string, number>; // by outcome
}

const state: IacucMetricsState = { protocolsCreated: {}, approvals: 0, reviews: {} };

export function recordIacucProtocolCreated(painCategory: string): void {
  state.protocolsCreated[painCategory] = (state.protocolsCreated[painCategory] ?? 0) + 1;
}
export function recordIacucApproval(): void {
  state.approvals += 1;
}
export function recordIacucReview(outcome: string): void {
  state.reviews[outcome] = (state.reviews[outcome] ?? 0) + 1;
}

export function renderIacucMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP iacuc_protocols_created_total IACUC protocols created, by USDA pain category');
  lines.push('# TYPE iacuc_protocols_created_total counter');
  for (const [cat, n] of Object.entries(state.protocolsCreated)) {
    lines.push(`iacuc_protocols_created_total{pain_category="${cat}"} ${n}`);
  }
  lines.push('# HELP iacuc_approvals_total IACUC protocol approvals');
  lines.push('# TYPE iacuc_approvals_total counter');
  lines.push(`iacuc_approvals_total ${state.approvals}`);
  lines.push('# HELP iacuc_reviews_total IACUC committee determinations, by outcome');
  lines.push('# TYPE iacuc_reviews_total counter');
  for (const [outcome, n] of Object.entries(state.reviews)) {
    lines.push(`iacuc_reviews_total{outcome="${outcome}"} ${n}`);
  }
  return lines;
}

export function snapshotIacucMetrics(): IacucMetricsState {
  return JSON.parse(JSON.stringify(state));
}
export function resetIacucMetrics(): void {
  state.protocolsCreated = {};
  state.approvals = 0;
  state.reviews = {};
}
