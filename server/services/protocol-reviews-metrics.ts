/**
 * Protocol Review & Comment metrics (Capability C2C-18c) — in-memory counters
 * surfaced via the central /api/metrics endpoint.
 *
 * @module server/services/protocol-reviews-metrics
 */

import { createMetricsModule } from './shared/metrics-factory';

const m = createMetricsModule({
  reviewersAssigned: { kind: 'labeled', metric: 'protocol_reviewers_assigned_total',  help: 'Protocol reviewers assigned, by role', labelKey: 'role' },
  commentsAdded:     { kind: 'labeled', metric: 'protocol_review_comments_total',     help: 'Protocol review comments added, by severity', labelKey: 'severity' },
  dispositions:      { kind: 'labeled', metric: 'protocol_review_dispositions_total', help: 'Protocol review dispositions recorded, by disposition', labelKey: 'disposition' },
} as const);

export function recordReviewerAssigned(role: string): void { m.incLabeled('reviewersAssigned', role); }
export function recordReviewComment(severity: string): void { m.incLabeled('commentsAdded', severity); }
export function recordReviewDisposition(disposition: string): void { m.incLabeled('dispositions', disposition); }

export function renderProtocolReviewMetrics(): string[] { return m.render(); }
export function snapshotProtocolReviewMetrics() { return m.snapshot(); }
export function resetProtocolReviewMetrics(): void { m.reset(); }
