/**
 * Protocol Budget metrics (C2C-22) — in-memory counters for /api/metrics.
 * @module server/services/protocol-budget-metrics
 */

interface State { itemsAdded: number; paramsSet: number; summaryViews: number }
const state: State = { itemsAdded: 0, paramsSet: 0, summaryViews: 0 };

export function recordBudgetItemAdded(): void { state.itemsAdded += 1; }
export function recordBudgetParamsSet(): void { state.paramsSet += 1; }
export function recordBudgetSummaryView(): void { state.summaryViews += 1; }

export function renderProtocolBudgetMetrics(): string[] {
  return [
    '# HELP protocol_budget_items_added_total Protocol budget line items added',
    '# TYPE protocol_budget_items_added_total counter',
    `protocol_budget_items_added_total ${state.itemsAdded}`,
    '# HELP protocol_budget_params_set_total Protocol budget parameter upserts',
    '# TYPE protocol_budget_params_set_total counter',
    `protocol_budget_params_set_total ${state.paramsSet}`,
    '# HELP protocol_budget_summary_views_total Protocol budget summary reads',
    '# TYPE protocol_budget_summary_views_total counter',
    `protocol_budget_summary_views_total ${state.summaryViews}`,
  ];
}

export function snapshotProtocolBudgetMetrics(): State { return JSON.parse(JSON.stringify(state)); }
export function resetProtocolBudgetMetrics(): void { state.itemsAdded = 0; state.paramsSet = 0; state.summaryViews = 0; }
