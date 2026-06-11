/**
 * RIM-lite metrics (Capability C2C-12) — in-memory counters surfaced via the
 * central /api/metrics endpoint. Mirrors the other domain metrics modules.
 *
 * @module server/services/rim-metrics
 */

interface RimMetricsState {
  productsCreated: number;
  registrationsByStatus: Record<string, number>;
  labelsApproved: Record<string, number>; // by label type
}

const state: RimMetricsState = { productsCreated: 0, registrationsByStatus: {}, labelsApproved: {} };

export function recordRimProductCreated(): void {
  state.productsCreated += 1;
}
export function recordRimRegistration(status: string): void {
  state.registrationsByStatus[status] = (state.registrationsByStatus[status] ?? 0) + 1;
}
export function recordRimLabelApproved(labelType: string): void {
  state.labelsApproved[labelType] = (state.labelsApproved[labelType] ?? 0) + 1;
}

export function renderRimMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP rim_products_created_total RIM products created');
  lines.push('# TYPE rim_products_created_total counter');
  lines.push(`rim_products_created_total ${state.productsCreated}`);
  lines.push('# HELP rim_registrations_total RIM registration upserts, by market status');
  lines.push('# TYPE rim_registrations_total counter');
  for (const [s, n] of Object.entries(state.registrationsByStatus)) lines.push(`rim_registrations_total{status="${s}"} ${n}`);
  lines.push('# HELP rim_labels_approved_total Label versions approved, by type');
  lines.push('# TYPE rim_labels_approved_total counter');
  for (const [t, n] of Object.entries(state.labelsApproved)) lines.push(`rim_labels_approved_total{label_type="${t}"} ${n}`);
  return lines;
}

export function snapshotRimMetrics(): RimMetricsState {
  return JSON.parse(JSON.stringify(state));
}
export function resetRimMetrics(): void {
  state.productsCreated = 0;
  state.registrationsByStatus = {};
  state.labelsApproved = {};
}
