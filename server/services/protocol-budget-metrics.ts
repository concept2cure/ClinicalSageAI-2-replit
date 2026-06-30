/**
 * Protocol Budget metrics (C2C-22) — in-memory counters for /api/metrics.
 * @module server/services/protocol-budget-metrics
 */

import { createMetricsModule } from './shared/metrics-factory';

const m = createMetricsModule({
  itemsAdded:   { kind: 'scalar', metric: 'protocol_budget_items_added_total', help: 'Protocol budget line items added' },
  paramsSet:    { kind: 'scalar', metric: 'protocol_budget_params_set_total',  help: 'Protocol budget parameter upserts' },
  summaryViews: { kind: 'scalar', metric: 'protocol_budget_summary_views_total', help: 'Protocol budget summary reads' },
} as const);

export function recordBudgetItemAdded(): void { m.inc('itemsAdded'); }
export function recordBudgetParamsSet(): void { m.inc('paramsSet'); }
export function recordBudgetSummaryView(): void { m.inc('summaryViews'); }

export function renderProtocolBudgetMetrics(): string[] { return m.render(); }
export function snapshotProtocolBudgetMetrics() { return m.snapshot(); }
export function resetProtocolBudgetMetrics(): void { m.reset(); }
