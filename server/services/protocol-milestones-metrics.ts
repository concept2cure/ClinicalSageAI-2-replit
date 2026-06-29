/**
 * Protocol Milestones metrics (C2C-20b) — in-memory counters for /api/metrics.
 * @module server/services/protocol-milestones-metrics
 */

interface State { added: Record<string, number>; statusTransitions: Record<string, number>; timelineViews: number }
const state: State = { added: {}, statusTransitions: {}, timelineViews: 0 };

export function recordProtocolMilestoneAdded(type: string): void { state.added[type] = (state.added[type] ?? 0) + 1; }
export function recordProtocolMilestoneStatus(status: string): void { state.statusTransitions[status] = (state.statusTransitions[status] ?? 0) + 1; }
export function recordProtocolTimelineView(): void { state.timelineViews += 1; }

export function renderProtocolMilestonesMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP protocol_milestones_added_total Protocol milestones added, by type');
  lines.push('# TYPE protocol_milestones_added_total counter');
  for (const [t, n] of Object.entries(state.added)) lines.push(`protocol_milestones_added_total{type="${t}"} ${n}`);
  lines.push('# HELP protocol_milestone_status_total Protocol milestone status transitions, by status');
  lines.push('# TYPE protocol_milestone_status_total counter');
  for (const [s, n] of Object.entries(state.statusTransitions)) lines.push(`protocol_milestone_status_total{status="${s}"} ${n}`);
  lines.push('# HELP protocol_timeline_views_total Protocol timeline reads');
  lines.push('# TYPE protocol_timeline_views_total counter');
  lines.push(`protocol_timeline_views_total ${state.timelineViews}`);
  return lines;
}

export function snapshotProtocolMilestonesMetrics(): State { return JSON.parse(JSON.stringify(state)); }
export function resetProtocolMilestonesMetrics(): void { state.added = {}; state.statusTransitions = {}; state.timelineViews = 0; }
