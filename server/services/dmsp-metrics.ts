/**
 * NIH DMS Plan metrics (Capability C2C-23) — in-memory counters surfaced via the
 * central /api/metrics endpoint.
 *
 * @module server/services/dmsp-metrics
 */

interface DmspMetricsState {
  plansCreated: number;
  elementsUpdated: number;
  plansFinalized: number;
}

const state: DmspMetricsState = { plansCreated: 0, elementsUpdated: 0, plansFinalized: 0 };

export function recordDmsPlanCreated(): void { state.plansCreated += 1; }
export function recordDmsPlanElementUpdated(): void { state.elementsUpdated += 1; }
export function recordDmsPlanFinalized(): void { state.plansFinalized += 1; }

export function renderDmspMetrics(): string[] {
  const lines: string[] = [];
  lines.push('# HELP dms_plans_created_total NIH DMS plans created');
  lines.push('# TYPE dms_plans_created_total counter');
  lines.push(`dms_plans_created_total ${state.plansCreated}`);
  lines.push('# HELP dms_plan_elements_updated_total DMS plan elements updated');
  lines.push('# TYPE dms_plan_elements_updated_total counter');
  lines.push(`dms_plan_elements_updated_total ${state.elementsUpdated}`);
  lines.push('# HELP dms_plans_finalized_total NIH DMS plans finalized');
  lines.push('# TYPE dms_plans_finalized_total counter');
  lines.push(`dms_plans_finalized_total ${state.plansFinalized}`);
  return lines;
}

export function snapshotDmspMetrics(): DmspMetricsState { return JSON.parse(JSON.stringify(state)); }
export function resetDmspMetrics(): void {
  state.plansCreated = 0;
  state.elementsUpdated = 0;
  state.plansFinalized = 0;
}
