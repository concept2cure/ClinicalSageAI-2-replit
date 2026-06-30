/**
 * Invention Disclosure metrics (Capability C2C-25) — in-memory counters surfaced via
 * the central /api/metrics endpoint.
 *
 * @module server/services/invention-disclosure-metrics
 */

interface DisclosureMetricsState { created: number; updated: number; submitted: number }

const state: DisclosureMetricsState = { created: 0, updated: 0, submitted: 0 };

export function recordDisclosureCreated(): void { state.created += 1; }
export function recordDisclosureUpdated(): void { state.updated += 1; }
export function recordDisclosureSubmitted(): void { state.submitted += 1; }

export function renderInventionDisclosureMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP invention_disclosures_created_total Invention disclosures created');
  lines.push('# TYPE invention_disclosures_created_total counter');
  lines.push(`invention_disclosures_created_total ${state.created}`);
  lines.push('# HELP invention_disclosures_updated_total Invention disclosures updated');
  lines.push('# TYPE invention_disclosures_updated_total counter');
  lines.push(`invention_disclosures_updated_total ${state.updated}`);
  lines.push('# HELP invention_disclosures_submitted_total Invention disclosures submitted for TTO review');
  lines.push('# TYPE invention_disclosures_submitted_total counter');
  lines.push(`invention_disclosures_submitted_total ${state.submitted}`);
  return lines;
}

export function snapshotInventionDisclosureMetrics(): DisclosureMetricsState { return JSON.parse(JSON.stringify(state)); }
export function resetInventionDisclosureMetrics(): void { state.created = 0; state.updated = 0; state.submitted = 0; }
