import type { FC, ReactElement } from 'react';

import { CalibrationPlot, type CalibrationBucket } from './CalibrationPlot';
import { ForecastBand, type ForecastBandDatum } from './ForecastBand';
import { LifecycleStackedBar, type LifecycleStackedBarDatum } from './LifecycleStackedBar';
import { ProgramBar, type ProgramBarDatum } from './ProgramBar';
import { ReadinessRing } from './ReadinessRing';
import { TrendLine, type TrendLineDatum } from './TrendLine';
import { CHART_PALETTE } from './tokens';

export interface ChartBlockProps {
  /** One of the governed chart kinds from the report block model. */
  chartType: string;
  /** Untrusted spec payload; parsed defensively per chart kind. */
  spec: Record<string, unknown>;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null,
      )
    : [];
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asTone(value: unknown): 'ok' | 'warn' | 'risk' | undefined {
  return value === 'ok' || value === 'warn' || value === 'risk' ? value : undefined;
}

/**
 * Small, non-throwing placeholder for an unknown or unsupported chart kind.
 * Mirrors the calm, factual tone of the design system rather than erroring.
 */
function UnsupportedChart({ chartType }: { chartType: string }): ReactElement {
  return (
    <p
      role="note"
      style={{ color: CHART_PALETTE.inkMuted, fontSize: 13, margin: 0 }}
    >
      Unsupported chart: {chartType || 'unknown'}.
    </p>
  );
}

/**
 * Governed dispatcher: maps a report chart kind to its presentational chart.
 *
 * The set of kinds is fixed (see the `chart` ReportBlock); anything outside it
 * renders a quiet placeholder so a malformed spec can never throw at render.
 */
export const ChartBlock: FC<ChartBlockProps> = ({ chartType, spec }) => {
  switch (chartType) {
    case 'readiness_ring': {
      const value = asNumber(spec.value);
      const label = typeof spec.label === 'string' ? spec.label : undefined;
      return <ReadinessRing value={value} label={label} />;
    }
    case 'bar': {
      const data: ProgramBarDatum[] = asRecordArray(spec.data).map((d) => ({
        label: asString(d.label),
        value: asNumber(d.value),
        tone: asTone(d.tone),
      }));
      return <ProgramBar data={data} />;
    }
    case 'trend': {
      const data: TrendLineDatum[] = asRecordArray(spec.data).map((d) => ({
        x: asString(d.x),
        y: asNumber(d.y),
      }));
      const label = typeof spec.label === 'string' ? spec.label : undefined;
      return <TrendLine data={data} label={label} />;
    }
    case 'stacked_bar': {
      const data: LifecycleStackedBarDatum[] = asRecordArray(spec.data).map((d) => ({
        label: asString(d.label),
        approved: asNumber(d.approved),
        review: asNumber(d.review),
        draft: asNumber(d.draft),
      }));
      return <LifecycleStackedBar data={data} />;
    }
    case 'forecast_band': {
      const data: ForecastBandDatum[] = asRecordArray(spec.data).map((d) => ({
        x: asString(d.x),
        p50: asNumber(d.p50),
        p90: asNumber(d.p90),
      }));
      return <ForecastBand data={data} />;
    }
    case 'calibration': {
      const buckets: CalibrationBucket[] = asRecordArray(spec.buckets).map((b) => ({
        meanPredicted: asNumber(b.meanPredicted),
        observedRate: asNumber(b.observedRate),
        count: asNumber(b.count),
      }));
      return <CalibrationPlot buckets={buckets} />;
    }
    default:
      return <UnsupportedChart chartType={chartType} />;
  }
};

ChartBlock.displayName = 'ChartBlock';
