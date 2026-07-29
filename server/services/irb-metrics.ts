/**
 * IRB metrics (Capability C2C-06) — in-memory counters surfaced via the central
 * /api/metrics endpoint. Mirrors fcoi-metrics / ha-metrics / iacuc-metrics.
 *
 * @module server/services/irb-metrics
 */

interface IrbMetricsState {
  submissionsCreated: Record<string, number>; // by risk level
  approvals: Record<string, number>; // by review type
  reportableEvents: Record<string, number>; // by event type
}

const state: IrbMetricsState = { submissionsCreated: {}, approvals: {}, reportableEvents: {} };

export function recordIrbSubmissionCreated(riskLevel: string): void {
  state.submissionsCreated[riskLevel] = (state.submissionsCreated[riskLevel] ?? 0) + 1;
}
export function recordIrbApproval(reviewType: string): void {
  state.approvals[reviewType] = (state.approvals[reviewType] ?? 0) + 1;
}
export function recordIrbReportableEvent(eventType: string): void {
  state.reportableEvents[eventType] = (state.reportableEvents[eventType] ?? 0) + 1;
}

export function renderIrbMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP irb_submissions_created_total IRB submissions created, by risk level');
  lines.push('# TYPE irb_submissions_created_total counter');
  for (const [risk, n] of Object.entries(state.submissionsCreated)) lines.push(`irb_submissions_created_total{risk="${risk}"} ${n}`);
  lines.push('# HELP irb_approvals_total IRB approvals, by review type');
  lines.push('# TYPE irb_approvals_total counter');
  for (const [rt, n] of Object.entries(state.approvals)) lines.push(`irb_approvals_total{review_type="${rt}"} ${n}`);
  lines.push('# HELP irb_reportable_events_total IRB reportable events, by type');
  lines.push('# TYPE irb_reportable_events_total counter');
  for (const [et, n] of Object.entries(state.reportableEvents)) lines.push(`irb_reportable_events_total{event_type="${et}"} ${n}`);
  return lines;
}

export function snapshotIrbMetrics(): IrbMetricsState {
  return JSON.parse(JSON.stringify(state));
}
export function resetIrbMetrics(): void {
  state.submissionsCreated = {};
  state.approvals = {};
  state.reportableEvents = {};
}
