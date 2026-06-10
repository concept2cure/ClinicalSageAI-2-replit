/**
 * Benchmarking-vs-norms tests.
 */

import { describe, it, expect } from 'vitest';
import { benchmarkProgram, PATHWAY_NORMS } from '../benchmarking';

describe('benchmarkProgram', () => {
  it('a readiness at the pathway mean sits near the 50th percentile', () => {
    const r = benchmarkProgram({ pathway: '510k', readinessScore: PATHWAY_NORMS['510k'].readiness.mean });
    const readiness = r.metrics.find(m => m.metric === 'readiness')!;
    expect(readiness.favorablePercentile).toBeGreaterThan(45);
    expect(readiness.favorablePercentile).toBeLessThan(55);
    expect(readiness.band).toBe('typical');
  });

  it('high readiness lands in a top band; low readiness in a bottom band', () => {
    const hi = benchmarkProgram({ pathway: 'pma', readinessScore: 95 });
    const lo = benchmarkProgram({ pathway: 'pma', readinessScore: 10 });
    expect(hi.metrics[0].favorablePercentile).toBeGreaterThan(lo.metrics[0].favorablePercentile);
    expect(['above_typical', 'top_decile']).toContain(hi.metrics[0].band);
  });

  it('shorter timeline and lower cost are more favorable (inverted metrics)', () => {
    const fast = benchmarkProgram({ pathway: '510k', timelineWeeks: 20, costUsd: 200000 });
    const slow = benchmarkProgram({ pathway: '510k', timelineWeeks: 70, costUsd: 1500000 });
    const fastTimeline = fast.metrics.find(m => m.metric === 'timeline')!;
    const slowTimeline = slow.metrics.find(m => m.metric === 'timeline')!;
    expect(fastTimeline.favorablePercentile).toBeGreaterThan(slowTimeline.favorablePercentile);
    const fastCost = fast.metrics.find(m => m.metric === 'cost')!;
    expect(fastCost.favorablePercentile).toBeGreaterThan(50);
  });

  it('aggregates an overall favorable percentile across metrics', () => {
    const r = benchmarkProgram({ pathway: 'eu_ivdr', readinessScore: 70, timelineWeeks: 60, costUsd: 900000 });
    expect(r.metrics).toHaveLength(3);
    expect(r.overallFavorablePercentile).toBeGreaterThan(0);
    expect(r.overallFavorablePercentile).toBeLessThanOrEqual(100);
  });

  it('rejects an unknown pathway', () => {
    // @ts-expect-error testing runtime guard
    expect(() => benchmarkProgram({ pathway: 'nope', readinessScore: 50 })).toThrow();
  });
});
