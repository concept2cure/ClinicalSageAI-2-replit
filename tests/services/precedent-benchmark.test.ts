import { describe, it, expect } from 'vitest';
import {
  computeBenchmark,
  percentile,
  wilsonInterval,
  MIN_TRIALS_FOR_DISTRIBUTION,
  MIN_TRIALS_FOR_SUCCESS_RATE,
  type PrecedentTrial,
  type Distribution,
} from '../../server/services/corpus/precedent-benchmark';
import {
  statusToOutcome,
  endpointsFromDetail,
} from '../../server/services/corpus/precedent-benchmark-reader';

function trial(overrides: Partial<PrecedentTrial> = {}): PrecedentTrial {
  return {
    sampleSize: 100,
    durationWeeks: 24,
    studyDesign: 'randomized, double masking',
    endpoints: ['ORR'],
    outcome: true,
    ...overrides,
  };
}

describe('percentile', () => {
  it('matches known quartiles', () => {
    const xs = [1, 2, 3, 4, 5];
    expect(percentile(xs, 0)).toBe(1);
    expect(percentile(xs, 0.5)).toBe(3);
    expect(percentile(xs, 1)).toBe(5);
    expect(percentile(xs, 0.25)).toBe(2);
  });
  it('interpolates between points', () => {
    expect(percentile([10, 20], 0.5)).toBe(15);
  });
  it('handles single element', () => {
    expect(percentile([42], 0.9)).toBe(42);
  });
});

describe('wilsonInterval', () => {
  it('brackets the point estimate', () => {
    const [lo, hi] = wilsonInterval(5, 10);
    expect(lo).toBeGreaterThan(0);
    expect(lo).toBeLessThan(0.5);
    expect(hi).toBeGreaterThan(0.5);
    expect(hi).toBeLessThan(1);
  });
  it('stays within [0,1] at the extremes', () => {
    const [lo, hi] = wilsonInterval(10, 10);
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
    const [lo2, hi2] = wilsonInterval(0, 10);
    expect(lo2).toBeGreaterThanOrEqual(0);
    expect(hi2).toBeLessThanOrEqual(1);
  });
  it('narrows as n grows', () => {
    const small = wilsonInterval(5, 10);
    const large = wilsonInterval(500, 1000);
    expect(large[1] - large[0]).toBeLessThan(small[1] - small[0]);
  });
  it('returns [0,0] for n=0', () => {
    expect(wilsonInterval(0, 0)).toEqual([0, 0]);
  });
});

describe('computeBenchmark — distributions', () => {
  it('summarizes sample size and duration when enough trials', () => {
    const trials = [50, 80, 100, 120, 200, 300].map(n =>
      trial({ sampleSize: n, durationWeeks: n / 4 })
    );
    const b = computeBenchmark('NSCLC', 'Phase 2', trials);
    expect(b.totalTrials).toBe(6);
    const ss = b.sampleSize as Distribution;
    expect(ss.n).toBe(6);
    expect(ss.min).toBe(50);
    expect(ss.max).toBe(300);
    expect(ss.median).toBe(110);
    expect(ss.q1).toBeLessThan(ss.median);
    expect(ss.q3).toBeGreaterThan(ss.median);
    expect('assessable' in b.duration ? b.duration.assessable : true).not.toBe(false);
  });

  it('marks distribution not assessable below the threshold', () => {
    const trials = Array.from({ length: MIN_TRIALS_FOR_DISTRIBUTION - 1 }, () =>
      trial({ sampleSize: 100 })
    );
    const b = computeBenchmark('Rare', 'Phase 1', trials);
    expect('assessable' in b.sampleSize && b.sampleSize.assessable === false).toBe(true);
    if ('assessable' in b.sampleSize && b.sampleSize.assessable === false) {
      expect(b.sampleSize.note).toMatch(/need 5/);
    }
  });

  it('ignores null/zero sample sizes in the distribution', () => {
    const trials = [
      ...[50, 80, 100, 120, 200].map(n => trial({ sampleSize: n })),
      trial({ sampleSize: null }),
      trial({ sampleSize: 0 }),
    ];
    const b = computeBenchmark('X', 'Phase 2', trials);
    expect((b.sampleSize as Distribution).n).toBe(5);
  });
});

describe('computeBenchmark — frequencies', () => {
  it('ranks common designs and endpoints by frequency', () => {
    const trials = [
      trial({ studyDesign: 'parallel', endpoints: ['ORR', 'PFS'] }),
      trial({ studyDesign: 'parallel', endpoints: ['ORR'] }),
      trial({ studyDesign: 'crossover', endpoints: ['OS'] }),
    ];
    const b = computeBenchmark('X', 'Phase 2', trials);
    expect(b.commonDesigns[0]).toMatchObject({ value: 'parallel', count: 2 });
    expect(b.commonEndpoints[0]).toMatchObject({ value: 'ORR', count: 2 });
    expect(b.commonDesigns[0].fraction).toBeCloseTo(2 / 3, 5);
  });
});

describe('computeBenchmark — success rate', () => {
  it('computes empirical rate with CI when enough known outcomes', () => {
    const trials = [
      ...Array.from({ length: 6 }, () => trial({ outcome: true })),
      ...Array.from({ length: 2 }, () => trial({ outcome: false })),
    ];
    const b = computeBenchmark('X', 'Phase 3', trials);
    expect(b.successRate.assessable).toBe(true);
    expect(b.successRate.knownOutcomeN).toBe(8);
    expect(b.successRate.successes).toBe(6);
    expect(b.successRate.rate).toBeCloseTo(0.75, 5);
    expect(b.successRate.ci95).not.toBeNull();
  });

  it('excludes ongoing/unknown trials from the denominator (not counted as failures)', () => {
    const trials = [
      ...Array.from({ length: 8 }, () => trial({ outcome: true })),
      ...Array.from({ length: 5 }, () => trial({ outcome: null })),
    ];
    const b = computeBenchmark('X', 'Phase 3', trials);
    expect(b.successRate.knownOutcomeN).toBe(8);
    expect(b.successRate.rate).toBe(1); // 8/8, the 5 unknowns are excluded
  });

  it('is not assessable below the known-outcome threshold', () => {
    const trials = Array.from({ length: MIN_TRIALS_FOR_SUCCESS_RATE - 1 }, () =>
      trial({ outcome: true })
    );
    const b = computeBenchmark('X', 'Phase 3', trials);
    expect(b.successRate.assessable).toBe(false);
    expect(b.successRate.rate).toBeNull();
    expect(b.successRate.ci95).toBeNull();
    expect(b.successRate.note).toMatch(/need 8/);
  });
});

describe('computeBenchmark — empty corpus', () => {
  it('returns a fully not-assessable benchmark for no trials', () => {
    const b = computeBenchmark('X', 'Phase 1', []);
    expect(b.totalTrials).toBe(0);
    expect('assessable' in b.sampleSize && b.sampleSize.assessable === false).toBe(true);
    expect(b.successRate.assessable).toBe(false);
    expect(b.commonDesigns).toEqual([]);
    expect(b.note).toMatch(/No comparable trials/);
  });
});

describe('statusToOutcome (reader helper)', () => {
  it('maps completed/approved to true', () => {
    expect(statusToOutcome('completed')).toBe(true);
    expect(statusToOutcome('Successful')).toBe(true);
    expect(statusToOutcome('approved')).toBe(true);
  });
  it('maps terminated/withdrawn/suspended/failed to false', () => {
    expect(statusToOutcome('terminated')).toBe(false);
    expect(statusToOutcome('Withdrawn')).toBe(false);
    expect(statusToOutcome('failed')).toBe(false);
  });
  it('maps ongoing/unknown/admin states to null', () => {
    expect(statusToOutcome('recruiting')).toBeNull();
    expect(statusToOutcome('draft')).toBeNull();
    expect(statusToOutcome('in_review')).toBeNull();
    expect(statusToOutcome(null)).toBeNull();
    expect(statusToOutcome(undefined)).toBeNull();
  });
});

describe('endpointsFromDetail (reader helper)', () => {
  it('flattens primary and secondary endpoint arrays', () => {
    expect(endpointsFromDetail({ primary: ['ORR'], secondary: ['PFS', 'OS'] })).toEqual([
      'ORR',
      'PFS',
      'OS',
    ]);
  });
  it('is defensive against malformed input', () => {
    expect(endpointsFromDetail(null)).toEqual([]);
    expect(endpointsFromDetail('nope')).toEqual([]);
    expect(endpointsFromDetail({ primary: 'x' })).toEqual([]);
  });
});
