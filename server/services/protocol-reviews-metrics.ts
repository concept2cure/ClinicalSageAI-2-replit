/**
 * Protocol Review & Comment metrics (Capability C2C-18c) — in-memory counters
 * surfaced via the central /api/metrics endpoint.
 *
 * @module server/services/protocol-reviews-metrics
 */

interface ProtocolReviewMetricsState {
  reviewersAssigned: Record<string, number>; // by role
  commentsAdded: Record<string, number>; // by severity
  dispositions: Record<string, number>; // by disposition
}

const state: ProtocolReviewMetricsState = { reviewersAssigned: {}, commentsAdded: {}, dispositions: {} };

export function recordReviewerAssigned(role: string): void { state.reviewersAssigned[role] = (state.reviewersAssigned[role] ?? 0) + 1; }
export function recordReviewComment(severity: string): void { state.commentsAdded[severity] = (state.commentsAdded[severity] ?? 0) + 1; }
export function recordReviewDisposition(disposition: string): void { state.dispositions[disposition] = (state.dispositions[disposition] ?? 0) + 1; }

export function renderProtocolReviewMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP protocol_reviewers_assigned_total Protocol reviewers assigned, by role');
  lines.push('# TYPE protocol_reviewers_assigned_total counter');
  for (const [k, n] of Object.entries(state.reviewersAssigned)) lines.push(`protocol_reviewers_assigned_total{role="${k}"} ${n}`);
  lines.push('# HELP protocol_review_comments_total Protocol review comments added, by severity');
  lines.push('# TYPE protocol_review_comments_total counter');
  for (const [k, n] of Object.entries(state.commentsAdded)) lines.push(`protocol_review_comments_total{severity="${k}"} ${n}`);
  lines.push('# HELP protocol_review_dispositions_total Protocol review dispositions recorded, by disposition');
  lines.push('# TYPE protocol_review_dispositions_total counter');
  for (const [k, n] of Object.entries(state.dispositions)) lines.push(`protocol_review_dispositions_total{disposition="${k}"} ${n}`);
  return lines;
}

export function snapshotProtocolReviewMetrics(): ProtocolReviewMetricsState { return JSON.parse(JSON.stringify(state)); }
export function resetProtocolReviewMetrics(): void {
  state.reviewersAssigned = {};
  state.commentsAdded = {};
  state.dispositions = {};
}
