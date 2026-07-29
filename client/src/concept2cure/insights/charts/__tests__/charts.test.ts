import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';

import {
  CalibrationPlot,
  ChartBlock,
  CHART_BLOCK_KINDS,
  CHART_MOTION,
  CHART_NEUTRAL_STEPS,
  CHART_PALETTE,
  CHART_TONE,
  ForecastBand,
  LifecycleStackedBar,
  ProgramBar,
  ReadinessRing,
  TrendLine,
} from '../index';

/**
 * Light, dependency-free checks. The repo's vitest environment is `node` (no
 * jsdom), so we do not mount the DOM. Calling the function components directly
 * returns a React element, which is enough to verify the dispatcher wiring and
 * that every governed kind resolves to a component without throwing.
 */

describe('chart tokens', () => {
  it('exposes the documented semantic roles', () => {
    const expectedRoles = [
      'canvas',
      'surface',
      'hairline',
      'ink',
      'inkMuted',
      'accent',
      'aiBlue',
      'success',
      'warning',
      'error',
    ];
    for (const role of expectedRoles) {
      expect(CHART_PALETTE).toHaveProperty(role);
      expect(CHART_PALETTE[role as keyof typeof CHART_PALETTE]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('binds design-system hexes (no neon)', () => {
    expect(CHART_PALETTE.canvas).toBe('#faf9f5');
    expect(CHART_PALETTE.accent).toBe('#d97757');
    expect(CHART_PALETTE.aiBlue).toBe('#6a9bcc');
    expect(CHART_PALETTE.success).toBe('#788c5d');
    expect(CHART_PALETTE.warning).toBe('#d97706');
    expect(CHART_PALETTE.error).toBe('#dc3545');
  });

  it('provides neutral steps and a tone map', () => {
    expect(CHART_NEUTRAL_STEPS.length).toBeGreaterThan(0);
    expect(CHART_TONE.ok).toBe(CHART_PALETTE.success);
    expect(CHART_TONE.warn).toBe(CHART_PALETTE.warning);
    expect(CHART_TONE.risk).toBe(CHART_PALETTE.error);
  });

  it('encodes the calm-motion contract', () => {
    expect(CHART_MOTION.durationMs).toBe(200);
    expect(CHART_MOTION.easing).toBe('ease-out');
  });
});

describe('chart components', () => {
  it('exports every governed chart as a function component', () => {
    const components = [
      ReadinessRing,
      ProgramBar,
      TrendLine,
      LifecycleStackedBar,
      ForecastBand,
      CalibrationPlot,
      ChartBlock,
    ];
    for (const component of components) {
      expect(typeof component).toBe('function');
    }
  });
});

describe('ChartBlock dispatcher', () => {
  const specByKind: Record<string, Record<string, unknown>> = {
    readiness_ring: { value: 72, label: 'Readiness' },
    bar: { data: [{ label: 'Program A', value: 4, tone: 'ok' }] },
    trend: { data: [{ x: 'Q1', y: 3 }], label: 'Filings' },
    stacked_bar: { data: [{ label: 'CMC', approved: 2, review: 1, draft: 3 }] },
    forecast_band: { data: [{ x: 'M1', p50: 4, p90: 7 }] },
    calibration: { buckets: [{ meanPredicted: 0.2, observedRate: 0.25, count: 40 }] },
  };

  it('returns a React element for every known chart kind', () => {
    for (const kind of CHART_BLOCK_KINDS) {
      const element = ChartBlock({ chartType: kind, spec: specByKind[kind] ?? {} });
      expect(isValidElement(element)).toBe(true);
    }
  });

  it('tolerates malformed specs without throwing', () => {
    for (const kind of CHART_BLOCK_KINDS) {
      const element = ChartBlock({ chartType: kind, spec: {} });
      expect(isValidElement(element)).toBe(true);
    }
  });

  it('renders a placeholder for an unknown chart kind', () => {
    const element = ChartBlock({ chartType: 'pie_of_doom', spec: {} });
    expect(isValidElement(element)).toBe(true);
  });
});
