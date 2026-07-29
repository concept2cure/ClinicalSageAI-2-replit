import type { FC } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { CHART_MOTION, CHART_NEUTRAL_STEPS, CHART_PALETTE } from './tokens';
import { DataTableFallback } from './DataTableFallback';
import { usePrefersReducedMotion } from './useReducedMotion';

export interface LifecycleStackedBarDatum {
  label: string;
  approved: number;
  review: number;
  draft: number;
}

export interface LifecycleStackedBarProps {
  data: LifecycleStackedBarDatum[];
}

const CHART_HEIGHT = 300;

/**
 * Stacked bar of document lifecycle state per group.
 *
 * Stages map to earthy tones so the stack reads at a glance: approved (olive
 * success), in review (amber warning), draft (a neutral stone). The same
 * counts are exposed as a data table so meaning never rests on color alone.
 */
export const LifecycleStackedBar: FC<LifecycleStackedBarProps> = ({ data }) => {
  const prefersReducedMotion = usePrefersReducedMotion();
  const caption = `Lifecycle by group: ${data
    .map((d) => `${d.label} approved ${d.approved}, in review ${d.review}, draft ${d.draft}`)
    .join('; ')}`;

  return (
    <figure className="m-0" role="group" aria-label={caption}>
      <figcaption className="sr-only">{caption}</figcaption>
      <div style={{ width: '100%', height: CHART_HEIGHT }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 8, right: 16, top: 8 }}>
            <CartesianGrid stroke={CHART_PALETTE.hairline} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: CHART_PALETTE.inkMuted, fontSize: 12 }}
              stroke={CHART_PALETTE.hairline}
            />
            <YAxis
              tick={{ fill: CHART_PALETTE.inkMuted, fontSize: 12 }}
              stroke={CHART_PALETTE.hairline}
            />
            <Tooltip cursor={{ fill: CHART_PALETTE.hairline }} />
            <Legend wrapperStyle={{ fontSize: 12, color: CHART_PALETTE.inkMuted }} />
            <Bar
              dataKey="approved"
              name="Approved"
              stackId="lifecycle"
              fill={CHART_PALETTE.success}
              isAnimationActive={!prefersReducedMotion}
              animationDuration={CHART_MOTION.durationMs}
              animationEasing={CHART_MOTION.easing}
            />
            <Bar
              dataKey="review"
              name="In review"
              stackId="lifecycle"
              fill={CHART_PALETTE.warning}
              isAnimationActive={!prefersReducedMotion}
              animationDuration={CHART_MOTION.durationMs}
              animationEasing={CHART_MOTION.easing}
            />
            <Bar
              dataKey="draft"
              name="Draft"
              stackId="lifecycle"
              fill={CHART_NEUTRAL_STEPS[0]}
              radius={[4, 4, 0, 0]}
              isAnimationActive={!prefersReducedMotion}
              animationDuration={CHART_MOTION.durationMs}
              animationEasing={CHART_MOTION.easing}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTableFallback
        caption={caption}
        columns={['Group', 'Approved', 'In review', 'Draft']}
        rows={data.map((d) => [d.label, d.approved, d.review, d.draft])}
      />
    </figure>
  );
};

LifecycleStackedBar.displayName = 'LifecycleStackedBar';
