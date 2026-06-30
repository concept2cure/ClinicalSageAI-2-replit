/**
 * Protocol-portfolio metrics (Capability C2C-16) — in-memory counter surfaced via
 * the central /api/metrics endpoint.
 *
 * @module server/services/protocol-portfolio-metrics
 */

import { createMetricsModule } from './shared/metrics-factory';

const m = createMetricsModule({
  views: { kind: 'scalar', metric: 'protocol_portfolio_views_total', help: 'Protocol-portfolio analytics reads' },
} as const);

export function recordPortfolioView(): void { m.inc('views'); }

export function renderProtocolPortfolioMetrics(): string[] { return m.render(); }
export function snapshotProtocolPortfolioMetrics() { return m.snapshot(); }
export function resetProtocolPortfolioMetrics(): void { m.reset(); }
