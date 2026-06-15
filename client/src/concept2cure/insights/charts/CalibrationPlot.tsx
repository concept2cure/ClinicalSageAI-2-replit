import type { FC } from 'react';
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';

import { CHART_MOTION, CHART_PALETTE } from './tokens';
import { DataTableFallback } from './DataTableFallback';
import { usePrefersReducedMotion } from './useReducedMotion';

export interface CalibrationBucket {
  /** Mean predicted probability for the bucket, 0–1. */
  meanPredicted: number;
  /** Observed event rate for the bucket, 0–1. */
  observedRate: number;
  /** Number of observations in the bucket. */
  count: number;
}

export interface CalibrationPlotProps {
  buckets: CalibrationBucket[];
}

const CHART_HEIGHT = 300;

/**
 * Reliability (calibration) plot: observed rate against predicted probability,
 * compared with the perfectly-calibrated diagonal.
 *
 * Points on the terracotta diagonal are well calibrated; deviation above or
 * below reads as over- or under-confidence. The diagonal is drawn as a
 * reference so the comparison is explicit rather than implied by color.
 */
export const CalibrationPlot: FC<CalibrationPlotProps> = ({ buckets }) => {
  const prefersReducedMotion = usePrefersReducedMotion();
  const caption = `Calibration buckets: ${buckets
    .map(
      (b) =>
        `predicted ${b.meanPredicted}, observed ${b.observedRate}, n ${b.count}`,
    )
    .join('; ')}`;

  return (
    <figure className="m-0" role="group" aria-label={caption}>
      <figcaption className="sr-only">{caption}</figcaption>
      <div style={{ width: '100%', height: CHART_HEIGHT }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid stroke={CHART_PALETTE.hairline} />
            <XAxis
              type="number"
              dataKey="meanPredicted"
              name="Predicted"
              domain={[0, 1]}
              tick={{ fill: CHART_PALETTE.inkMuted, fontSize: 12 }}
              stroke={CHART_PALETTE.hairline}
            />
            <YAxis
              type="number"
              dataKey="observedRate"
              name="Observed"
              domain={[0, 1]}
              tick={{ fill: CHART_PALETTE.inkMuted, fontSize: 12 }}
              stroke={CHART_PALETTE.hairline}
            />
            <ZAxis type="number" dataKey="count" range={[40, 220]} name="Count" />
            <ReferenceLine
              segment={[
                { x: 0, y: 0 },
                { x: 1, y: 1 },
              ]}
              stroke={CHART_PALETTE.inkMuted}
              strokeDasharray="4 4"
            />
            <Tooltip cursor={{ stroke: CHART_PALETTE.hairline }} />
            <Scatter
              name="Calibration"
              data={buckets}
              fill={CHART_PALETTE.aiBlue}
              line={false}
              isAnimationActive={!prefersReducedMotion}
              animationDuration={CHART_MOTION.durationMs}
              animationEasing={CHART_MOTION.easing}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <DataTableFallback
        caption={caption}
        columns={['Mean predicted', 'Observed rate', 'Count']}
        rows={buckets.map((b) => [b.meanPredicted, b.observedRate, b.count])}
      />
    </figure>
  );
};

CalibrationPlot.displayName = 'CalibrationPlot';
