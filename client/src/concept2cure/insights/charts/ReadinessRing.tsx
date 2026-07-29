import type { FC } from 'react';
import {
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from 'recharts';

import { CHART_MOTION, CHART_PALETTE } from './tokens';
import { DataTableFallback } from './DataTableFallback';
import { usePrefersReducedMotion } from './useReducedMotion';

export interface ReadinessRingProps {
  /** Readiness value, 0–100. Values outside the range are clamped. */
  value: number;
  /** Optional label rendered beneath the percentage. */
  label?: string;
}

const RING_SIZE = 200;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, value));
}

/**
 * Earthy radial gauge for a single readiness percentage.
 *
 * Tone follows status thresholds so meaning is never carried by color alone:
 * the numeric percentage is always shown in the center and in the data table.
 */
export const ReadinessRing: FC<ReadinessRingProps> = ({ value, label }) => {
  const prefersReducedMotion = usePrefersReducedMotion();
  const percent = clampPercent(value);

  const ringColor =
    percent >= 80
      ? CHART_PALETTE.success
      : percent >= 50
        ? CHART_PALETTE.warning
        : CHART_PALETTE.error;

  const data = [{ name: 'readiness', value: percent, fill: ringColor }];
  const caption = label
    ? `${label}: ${percent} percent ready`
    : `Readiness: ${percent} percent`;

  return (
    <figure className="m-0" role="group" aria-label={caption}>
      <figcaption className="sr-only">{caption}</figcaption>
      <div
        style={{ width: RING_SIZE, height: RING_SIZE, position: 'relative' }}
        aria-hidden="true"
      >
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="72%"
            outerRadius="100%"
            data={data}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar
              dataKey="value"
              background={{ fill: CHART_PALETTE.hairline }}
              cornerRadius={RING_SIZE}
              isAnimationActive={!prefersReducedMotion}
              animationDuration={CHART_MOTION.durationMs}
              animationEasing={CHART_MOTION.easing}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: CHART_PALETTE.ink,
          }}
        >
          <span style={{ fontSize: 32, fontWeight: 600 }}>{percent}%</span>
          {label ? (
            <span style={{ fontSize: 13, color: CHART_PALETTE.inkMuted }}>{label}</span>
          ) : null}
        </div>
      </div>
      <DataTableFallback
        caption={caption}
        columns={['Measure', 'Percent']}
        rows={[[label ?? 'Readiness', percent]]}
      />
    </figure>
  );
};

ReadinessRing.displayName = 'ReadinessRing';
