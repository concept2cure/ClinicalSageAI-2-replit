import type { FC } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { CHART_MOTION, CHART_PALETTE } from './tokens';
import { DataTableFallback } from './DataTableFallback';
import { usePrefersReducedMotion } from './useReducedMotion';

export interface TrendLineDatum {
  x: string;
  y: number;
}

export interface TrendLineProps {
  data: TrendLineDatum[];
  /** Optional series label used in the accessible description. */
  label?: string;
}

const CHART_HEIGHT = 260;

/**
 * Single-series line chart for a value over time.
 */
export const TrendLine: FC<TrendLineProps> = ({ data, label }) => {
  const prefersReducedMotion = usePrefersReducedMotion();
  const series = label ?? 'Trend';
  const caption = `${series} over time: ${data.map((d) => `${d.x} ${d.y}`).join(', ')}`;

  return (
    <figure className="m-0" role="group" aria-label={caption}>
      <figcaption className="sr-only">{caption}</figcaption>
      <div style={{ width: '100%', height: CHART_HEIGHT }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 8, right: 16, top: 8 }}>
            <CartesianGrid stroke={CHART_PALETTE.hairline} vertical={false} />
            <XAxis
              dataKey="x"
              tick={{ fill: CHART_PALETTE.inkMuted, fontSize: 12 }}
              stroke={CHART_PALETTE.hairline}
            />
            <YAxis
              tick={{ fill: CHART_PALETTE.inkMuted, fontSize: 12 }}
              stroke={CHART_PALETTE.hairline}
            />
            <Tooltip cursor={{ stroke: CHART_PALETTE.hairline }} />
            <Line
              type="monotone"
              dataKey="y"
              name={series}
              stroke={CHART_PALETTE.accent}
              strokeWidth={2}
              dot={{ r: 2, fill: CHART_PALETTE.accent }}
              isAnimationActive={!prefersReducedMotion}
              animationDuration={CHART_MOTION.durationMs}
              animationEasing={CHART_MOTION.easing}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTableFallback
        caption={caption}
        columns={['Point', series]}
        rows={data.map((d) => [d.x, d.y])}
      />
    </figure>
  );
};

TrendLine.displayName = 'TrendLine';
