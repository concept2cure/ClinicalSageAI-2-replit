import type { FC } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { CHART_MOTION, CHART_PALETTE, CHART_TONE } from './tokens';
import { DataTableFallback } from './DataTableFallback';
import { usePrefersReducedMotion } from './useReducedMotion';

export interface ProgramBarDatum {
  label: string;
  value: number;
  /** Optional status tone. Defaults to the neutral accent treatment. */
  tone?: 'ok' | 'warn' | 'risk';
}

export interface ProgramBarProps {
  data: ProgramBarDatum[];
}

const CHART_HEIGHT = 280;

function toneColor(tone?: 'ok' | 'warn' | 'risk'): string {
  return tone ? CHART_TONE[tone] : CHART_PALETTE.accent;
}

/**
 * Horizontal bar chart for per-program values, tinted by earthy status tone.
 */
export const ProgramBar: FC<ProgramBarProps> = ({ data }) => {
  const prefersReducedMotion = usePrefersReducedMotion();
  const caption = `Program values: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`;

  return (
    <figure className="m-0" role="group" aria-label={caption}>
      <figcaption className="sr-only">{caption}</figcaption>
      <div style={{ width: '100%', height: CHART_HEIGHT }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={data} margin={{ left: 8, right: 16 }}>
            <XAxis
              type="number"
              tick={{ fill: CHART_PALETTE.inkMuted, fontSize: 12 }}
              stroke={CHART_PALETTE.hairline}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={120}
              tick={{ fill: CHART_PALETTE.inkMuted, fontSize: 12 }}
              stroke={CHART_PALETTE.hairline}
            />
            <Tooltip cursor={{ fill: CHART_PALETTE.hairline }} />
            <Bar
              dataKey="value"
              radius={[0, 4, 4, 0]}
              isAnimationActive={!prefersReducedMotion}
              animationDuration={CHART_MOTION.durationMs}
              animationEasing={CHART_MOTION.easing}
            >
              {data.map((datum, index) => (
                <Cell key={index} fill={toneColor(datum.tone)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTableFallback
        caption={caption}
        columns={['Program', 'Value', 'Status']}
        rows={data.map((d) => [d.label, d.value, d.tone ?? 'neutral'])}
      />
    </figure>
  );
};

ProgramBar.displayName = 'ProgramBar';
