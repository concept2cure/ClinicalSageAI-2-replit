/**
 * Governed visualization layer for Insights.
 *
 * A fixed, design-system-aligned chart set — no arbitrary chart types. Every
 * component is presentational, pulls color from `tokens.ts`, respects reduced
 * motion, and exposes its data to assistive technology. `ChartBlock` is the
 * dispatcher that maps a report `chart` block to the right component.
 */

export { CHART_BLOCK_KINDS } from './kinds';
export type { ChartBlockKind } from './kinds';

export {
  CHART_MOTION,
  CHART_NEUTRAL_STEPS,
  CHART_PALETTE,
  CHART_TONE,
} from './tokens';
export type { ChartPaletteRole } from './tokens';

export { usePrefersReducedMotion } from './useReducedMotion';
export { DataTableFallback } from './DataTableFallback';
export type { DataTableFallbackProps } from './DataTableFallback';

export { ReadinessRing } from './ReadinessRing';
export type { ReadinessRingProps } from './ReadinessRing';

export { ProgramBar } from './ProgramBar';
export type { ProgramBarDatum, ProgramBarProps } from './ProgramBar';

export { TrendLine } from './TrendLine';
export type { TrendLineDatum, TrendLineProps } from './TrendLine';

export { LifecycleStackedBar } from './LifecycleStackedBar';
export type {
  LifecycleStackedBarDatum,
  LifecycleStackedBarProps,
} from './LifecycleStackedBar';

export { ForecastBand } from './ForecastBand';
export type { ForecastBandDatum, ForecastBandProps } from './ForecastBand';

export { CalibrationPlot } from './CalibrationPlot';
export type { CalibrationBucket, CalibrationPlotProps } from './CalibrationPlot';

export { ChartBlock } from './ChartBlock';
export type { ChartBlockProps } from './ChartBlock';
