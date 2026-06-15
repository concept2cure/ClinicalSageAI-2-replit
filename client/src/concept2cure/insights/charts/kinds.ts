/**
 * The fixed, governed set of chart kinds. Mirrors the `chartType` union on the
 * `chart` ReportBlock (server/services/report-os/render/types.ts). Keeping this
 * here lets the dispatcher and tests share one source of truth without the
 * client importing server code.
 */
export const CHART_BLOCK_KINDS = [
  'readiness_ring',
  'bar',
  'trend',
  'stacked_bar',
  'forecast_band',
  'calibration',
] as const;

export type ChartBlockKind = (typeof CHART_BLOCK_KINDS)[number];
