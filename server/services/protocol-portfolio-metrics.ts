/**
 * Protocol-portfolio metrics (Capability C2C-16) — in-memory counter surfaced via
 * the central /api/metrics endpoint.
 *
 * @module server/services/protocol-portfolio-metrics
 */

interface PortfolioMetricsState {
  views: number;
}

const state: PortfolioMetricsState = { views: 0 };

export function recordPortfolioView(): void { state.views += 1; }

export function renderProtocolPortfolioMetrics(): string[] {
  return [
    '# HELP protocol_portfolio_views_total Protocol-portfolio analytics reads',
    '# TYPE protocol_portfolio_views_total counter',
    `protocol_portfolio_views_total ${state.views}`,
  ];
}

export function snapshotProtocolPortfolioMetrics(): PortfolioMetricsState { return JSON.parse(JSON.stringify(state)); }
export function resetProtocolPortfolioMetrics(): void { state.views = 0; }
