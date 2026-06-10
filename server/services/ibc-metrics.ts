/**
 * IBC metrics (Capability C2C-07) — in-memory counters surfaced via the central
 * /api/metrics endpoint. Mirrors the other committee metrics modules.
 *
 * @module server/services/ibc-metrics
 */

interface IbcMetricsState {
  registrationsCreated: Record<string, number>; // by biosafety level
  approvals: number;
  agentsRegistered: Record<string, number>; // by risk group
}

const state: IbcMetricsState = { registrationsCreated: {}, approvals: 0, agentsRegistered: {} };

export function recordIbcRegistrationCreated(bsl: string): void {
  state.registrationsCreated[bsl] = (state.registrationsCreated[bsl] ?? 0) + 1;
}
export function recordIbcApproval(): void {
  state.approvals += 1;
}
export function recordIbcAgentRegistered(riskGroup: string): void {
  state.agentsRegistered[riskGroup] = (state.agentsRegistered[riskGroup] ?? 0) + 1;
}

export function renderIbcMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP ibc_registrations_created_total IBC registrations created, by biosafety level');
  lines.push('# TYPE ibc_registrations_created_total counter');
  for (const [bsl, n] of Object.entries(state.registrationsCreated)) lines.push(`ibc_registrations_created_total{bsl="${bsl}"} ${n}`);
  lines.push('# HELP ibc_approvals_total IBC registration approvals');
  lines.push('# TYPE ibc_approvals_total counter');
  lines.push(`ibc_approvals_total ${state.approvals}`);
  lines.push('# HELP ibc_agents_registered_total Biological agents registered, by risk group');
  lines.push('# TYPE ibc_agents_registered_total counter');
  for (const [rg, n] of Object.entries(state.agentsRegistered)) lines.push(`ibc_agents_registered_total{risk_group="${rg}"} ${n}`);
  return lines;
}

export function snapshotIbcMetrics(): IbcMetricsState {
  return JSON.parse(JSON.stringify(state));
}
export function resetIbcMetrics(): void {
  state.registrationsCreated = {};
  state.approvals = 0;
  state.agentsRegistered = {};
}
