/**
 * Protocol Milestones metrics (C2C-20b) — in-memory counters for /api/metrics.
 * @module server/services/protocol-milestones-metrics
 */

import { createMetricsModule } from './shared/metrics-factory';

const m = createMetricsModule({
  added:             { kind: 'labeled', metric: 'protocol_milestones_added_total',  help: 'Protocol milestones added, by type', labelKey: 'type' },
  statusTransitions: { kind: 'labeled', metric: 'protocol_milestone_status_total',  help: 'Protocol milestone status transitions, by status', labelKey: 'status' },
  timelineViews:     { kind: 'scalar',  metric: 'protocol_timeline_views_total',    help: 'Protocol timeline reads' },
} as const);

export function recordProtocolMilestoneAdded(type: string): void { m.incLabeled('added', type); }
export function recordProtocolMilestoneStatus(status: string): void { m.incLabeled('statusTransitions', status); }
export function recordProtocolTimelineView(): void { m.inc('timelineViews'); }

export function renderProtocolMilestonesMetrics(): string[] { return m.render(); }
export function snapshotProtocolMilestonesMetrics() { return m.snapshot(); }
export function resetProtocolMilestonesMetrics(): void { m.reset(); }
