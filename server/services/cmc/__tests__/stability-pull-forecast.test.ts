/**
 * Each upcoming pull says what the study's own recorded results predict for
 * every test at it: the fitted value and the 95% prediction interval of the
 * line through the results on file, and where that interval sits against the
 * recorded acceptance criterion.
 *
 * Until 2026-11-14 the trend engine fitted the line and projected when it
 * would reach the limit, and nothing said what result to expect at the next
 * pull. The forecast is the same regression (stability-trending.ts), never a
 * model's figure; with too little data it refuses in words.
 */
import { describe, expect, it } from 'vitest';
import { forecastTrend } from '../stability-trending';
import { stabilityPullSchedule } from '../stability-source';
import { parseAcceptanceCriterion } from '../recorded-stability';

const LINE = [0, 3, 6, 9].map((t) => ({ time: t, value: 100 - 0.2 * t + (t === 3 ? 0.05 : t === 6 ? -0.05 : 0) }));

describe('forecastTrend', () => {
  it('predicts a future result with its prediction interval, from the line through every recorded point', () => {
    const f = forecastTrend(LINE, [12], parseAcceptanceCriterion(['95.0-105.0%']));
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    expect(f.pointsUsed).toBe(4);
    const at = f.at[0];
    expect(at.time).toBe(12);
    expect(at.predicted).toBeCloseTo(97.59, 1);
    expect(at.interval.lower).toBeLessThan(at.predicted);
    expect(at.interval.upper).toBeGreaterThan(at.predicted);
    expect(at.verdict).toBe('within');
  });

  it('says when the predicted result, or only its interval, crosses the limit', () => {
    const steep = [0, 3, 6, 9].map((t) => ({ time: t, value: 100 - 0.5 * t + (t === 3 ? 0.05 : t === 6 ? -0.05 : 0) }));
    const f = forecastTrend(steep, [9.9, 12], parseAcceptanceCriterion(['95.0-105.0%']));
    expect(f.ok && f.at.map((a) => a.verdict)).toEqual(['interval crosses the limit', 'outside']);
  });

  it('gives no verdict without a criterion, and still the figures', () => {
    const f = forecastTrend(LINE, [12], null);
    expect(f.ok && f.at[0].verdict).toBe('no criterion');
  });

  it('refuses, in words, on fewer than three results or one time point', () => {
    const two = forecastTrend(LINE.slice(0, 2), [12], null);
    expect(two).toMatchObject({ ok: false, reason: 'INSUFFICIENT_POINTS' });
    expect(!two.ok && two.detail).toBe('a forecast needs at least 3 numeric results at 2 or more time points; 2 are recorded');
    const flat = forecastTrend([{ time: 3, value: 1 }, { time: 3, value: 2 }, { time: 3, value: 3 }], [12], null);
    expect(flat).toMatchObject({ ok: false, reason: 'TIME_POINTS_DO_NOT_VARY' });
  });
});

describe('stabilityPullSchedule — the forecast at each pull to come', () => {
  const TODAY = new Date(Date.UTC(2026, 10, 14));
  const results = [0, 3, 6, 9].flatMap((t, i) => [
    { timePoint: String(t), parameter: 'Assay', result: String(LINE[i].value), specification: '95.0-105.0%' },
  ]);
  const study = { startDate: '2026-02-01', timePoints: ['0', '3', '6', '9', '12', '18'], testParameters: ['Assay', 'Water content'], stabilityData: { results } };

  it('carries a forecast per test on planned pulls only', () => {
    const s = stabilityPullSchedule(study, TODAY);
    const twelve = s.points.find((p) => p.label === '12')!;
    expect(twelve.state).toBe('planned');
    const assay = twelve.forecast!.find((f) => f.parameter === 'Assay')!;
    expect(assay).toMatchObject({ ok: true, verdict: 'within', pointsUsed: 4 });
    expect(assay.ok && assay.predicted).toBeCloseTo(97.59, 1);
    expect(s.points.find((p) => p.label === '3')!.forecast).toBeUndefined();
  });

  it('says why a test has no forecast', () => {
    const s = stabilityPullSchedule(study, TODAY);
    const water = s.points.find((p) => p.label === '12')!.forecast!.find((f) => f.parameter === 'Water content')!;
    expect(water).toEqual({ parameter: 'Water content', ok: false, detail: 'a forecast needs at least 3 numeric results at 2 or more time points; 0 are recorded' });
  });
});
