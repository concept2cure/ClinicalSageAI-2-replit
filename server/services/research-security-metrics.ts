/**
 * Research-security / COI metrics (add-on, NSPM-33 / NOT-OD-26-017) — in-memory
 * counters surfaced via the central /api/metrics endpoint. Mirrors the suite's
 * metrics convention (see etmf-metrics.ts).
 *
 * @module server/services/research-security-metrics
 */

interface ResearchSecurityMetricsState {
  disclosuresFiled: Record<string, number>; // by disclosure_type
  foreignNexus: number;
  reviewed: Record<string, number>; // by review status
}

const state: ResearchSecurityMetricsState = { disclosuresFiled: {}, foreignNexus: 0, reviewed: {} };

export function recordCoiDisclosure(disclosureType: string, foreignFlag: boolean): void {
  state.disclosuresFiled[disclosureType] = (state.disclosuresFiled[disclosureType] ?? 0) + 1;
  if (foreignFlag) state.foreignNexus += 1;
}
export function recordCoiReview(status: string): void {
  state.reviewed[status] = (state.reviewed[status] ?? 0) + 1;
}

export function renderResearchSecurityMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP coi_disclosures_filed_total COI / research-security disclosures filed, by type');
  lines.push('# TYPE coi_disclosures_filed_total counter');
  for (const [t, n] of Object.entries(state.disclosuresFiled)) lines.push(`coi_disclosures_filed_total{type="${t}"} ${n}`);
  lines.push('# HELP coi_foreign_nexus_total Disclosures flagged with a foreign nexus (research security)');
  lines.push('# TYPE coi_foreign_nexus_total counter');
  lines.push(`coi_foreign_nexus_total ${state.foreignNexus}`);
  lines.push('# HELP coi_disclosures_reviewed_total COI disclosures reviewed, by outcome status');
  lines.push('# TYPE coi_disclosures_reviewed_total counter');
  for (const [s, n] of Object.entries(state.reviewed)) lines.push(`coi_disclosures_reviewed_total{status="${s}"} ${n}`);
  return lines;
}

export function snapshotResearchSecurityMetrics(): ResearchSecurityMetricsState { return JSON.parse(JSON.stringify(state)); }
export function resetResearchSecurityMetrics(): void { state.disclosuresFiled = {}; state.foreignNexus = 0; state.reviewed = {}; }
