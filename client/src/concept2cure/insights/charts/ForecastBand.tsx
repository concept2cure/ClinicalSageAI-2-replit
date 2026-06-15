import type { FC } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { CHART_MOTION, CHART_PALETTE } from './tokens';
import { DataTableFallback } from './DataTableFallback';
import { usePrefersReducedMotion } from './useReducedMotion';

export interface ForecastBandDatum {
  x: string;
  /** Central (p50) forecast. */
  p50: number;
  /** Upper (p90) forecast bound; the band spans p50..p90. */
  p90: number;
}

export interface ForecastBandProps {
  data: ForecastBandDatum[];
}

const CHART_HEIGHT = 280;

interface ForecastBandRow extends ForecastBandDatum {
  /** Pre-computed [p50, p90] pair driving the shaded uncertainty band. */
  band: [number, number];
}

/**
 * Forecast with an uncertainty band: a p50 line plus a shaded p50..p90 area.
 *
 * The forecast is an AI-derived series, so it uses the muted AI blue per the
 * design system. The band reads as projection rather than fact; exact values
 * are always available in the data table.
 */
export const ForecastBand: FC<ForecastBandProps> = ({ data }) => {
  const prefersReducedMotion = usePrefersReducedMotion();
  const rows: ForecastBandRow[] = data.map((d) => ({ ...d, band: [d.p50, d.p90] }));
  const caption = `Forecast: ${data
    .map((d) => `${d.x} p50 ${d.p50}, p90 ${d.p90}`)
    .join('; ')}`;

  return (
    <figure className="m-0" role="group" aria-label={caption}>
      <figcaption className="sr-only">{caption}</figcaption>
      <div style={{ width: '100%', height: CHART_HEIGHT }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ left: 8, right: 16, top: 8 }}>
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
            <Area
              dataKey="band"
              name="p50 to p90 range"
              stroke="none"
              fill={CHART_PALETTE.aiBlue}
              fillOpacity={0.18}
              isAnimationActive={!prefersReducedMotion}
              animationDuration={CHART_MOTION.durationMs}
              animationEasing={CHART_MOTION.easing}
            />
            <Line
              type="monotone"
              dataKey="p50"
              name="p50 forecast"
              stroke={CHART_PALETTE.aiBlue}
              strokeWidth={2}
              dot={{ r: 2, fill: CHART_PALETTE.aiBlue }}
              isAnimationActive={!prefersReducedMotion}
              animationDuration={CHART_MOTION.durationMs}
              animationEasing={CHART_MOTION.easing}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <DataTableFallback
        caption={caption}
        columns={['Point', 'p50', 'p90']}
        rows={data.map((d) => [d.x, d.p50, d.p90])}
      />
    </figure>
  );
};

ForecastBand.displayName = 'ForecastBand';
