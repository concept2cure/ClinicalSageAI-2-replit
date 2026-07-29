/**
 * Research Agreements metrics (Capability C2C-27) — in-memory counters surfaced via
 * the central /api/metrics endpoint.
 *
 * @module server/services/research-agreements-metrics
 */

interface AgreementMetricsState { created: number; updated: number; executed: number }

const state: AgreementMetricsState = { created: 0, updated: 0, executed: 0 };

export function recordAgreementCreated(): void { state.created += 1; }
export function recordAgreementUpdated(): void { state.updated += 1; }
export function recordAgreementExecuted(): void { state.executed += 1; }

export function renderResearchAgreementsMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP research_agreements_created_total Research agreements (MTA/DUA/CDA) created');
  lines.push('# TYPE research_agreements_created_total counter');
  lines.push(`research_agreements_created_total ${state.created}`);
  lines.push('# HELP research_agreements_updated_total Research agreements updated');
  lines.push('# TYPE research_agreements_updated_total counter');
  lines.push(`research_agreements_updated_total ${state.updated}`);
  lines.push('# HELP research_agreements_executed_total Research agreements executed');
  lines.push('# TYPE research_agreements_executed_total counter');
  lines.push(`research_agreements_executed_total ${state.executed}`);
  return lines;
}

export function snapshotResearchAgreementsMetrics(): AgreementMetricsState { return JSON.parse(JSON.stringify(state)); }
export function resetResearchAgreementsMetrics(): void { state.created = 0; state.updated = 0; state.executed = 0; }
