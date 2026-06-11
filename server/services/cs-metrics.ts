/**
 * Controlled Substances metrics (Capability C2C-15) — in-memory counters
 * surfaced via the central /api/metrics endpoint.
 *
 * @module server/services/cs-metrics
 */

interface CsMetricsState {
  registrationsCreated: number;
  substancesCreated: Record<string, number>; // by schedule
  transactions: Record<string, number>; // by type
}

const state: CsMetricsState = { registrationsCreated: 0, substancesCreated: {}, transactions: {} };

export function recordCsRegistration(): void {
  state.registrationsCreated += 1;
}
export function recordCsSubstance(schedule: string): void {
  state.substancesCreated[schedule] = (state.substancesCreated[schedule] ?? 0) + 1;
}
export function recordCsTransaction(type: string): void {
  state.transactions[type] = (state.transactions[type] ?? 0) + 1;
}

export function renderCsMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP cs_registrations_created_total DEA registrations created');
  lines.push('# TYPE cs_registrations_created_total counter');
  lines.push(`cs_registrations_created_total ${state.registrationsCreated}`);
  lines.push('# HELP cs_substances_created_total Controlled substances created, by schedule');
  lines.push('# TYPE cs_substances_created_total counter');
  for (const [s, n] of Object.entries(state.substancesCreated)) lines.push(`cs_substances_created_total{schedule="${s}"} ${n}`);
  lines.push('# HELP cs_transactions_total Controlled-substance transactions, by type');
  lines.push('# TYPE cs_transactions_total counter');
  for (const [t, n] of Object.entries(state.transactions)) lines.push(`cs_transactions_total{type="${t}"} ${n}`);
  return lines;
}

export function snapshotCsMetrics(): CsMetricsState {
  return JSON.parse(JSON.stringify(state));
}
export function resetCsMetrics(): void {
  state.registrationsCreated = 0;
  state.substancesCreated = {};
  state.transactions = {};
}
