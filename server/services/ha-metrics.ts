/**
 * HA Interaction & Commitment metrics (Capability C2C-03) — in-memory counters
 * surfaced via the central /api/metrics endpoint. Mirrors fcoi-metrics.
 *
 * @module server/services/ha-metrics
 */

interface HaMetricsState {
  interactionsCreated: number;
  commitmentsCreated: Record<string, number>; // by commitment_type
  commitmentsFulfilled: number;
}

const state: HaMetricsState = {
  interactionsCreated: 0,
  commitmentsCreated: {},
  commitmentsFulfilled: 0,
};

export function recordHaInteractionCreated(): void {
  state.interactionsCreated += 1;
}
export function recordHaCommitmentCreated(type: string): void {
  state.commitmentsCreated[type] = (state.commitmentsCreated[type] ?? 0) + 1;
}
export function recordHaCommitmentFulfilled(): void {
  state.commitmentsFulfilled += 1;
}

export function renderHaMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP ha_interactions_created_total HA interactions (agency meetings) created');
  lines.push('# TYPE ha_interactions_created_total counter');
  lines.push(`ha_interactions_created_total ${state.interactionsCreated}`);
  lines.push('# HELP ha_commitments_created_total Regulatory commitments created, by type');
  lines.push('# TYPE ha_commitments_created_total counter');
  for (const [type, n] of Object.entries(state.commitmentsCreated)) {
    lines.push(`ha_commitments_created_total{type="${type}"} ${n}`);
  }
  lines.push('# HELP ha_commitments_fulfilled_total Regulatory commitments marked fulfilled');
  lines.push('# TYPE ha_commitments_fulfilled_total counter');
  lines.push(`ha_commitments_fulfilled_total ${state.commitmentsFulfilled}`);
  return lines;
}

export function snapshotHaMetrics(): HaMetricsState {
  return JSON.parse(JSON.stringify(state));
}
export function resetHaMetrics(): void {
  state.interactionsCreated = 0;
  state.commitmentsCreated = {};
  state.commitmentsFulfilled = 0;
}
