import { describe, expect, it } from 'vitest';
import {
  brierScore,
  calibrationBuckets,
  calibrationQuality,
  freshnessRollup,
  summarizeQuality,
} from '../calibration';
import type { PredictionOutcome } from '../types';

function outcomes(n: number, predicted: number, actual: 0 | 1): PredictionOutcome[] {
  return Array.from({ length: n }, () => ({ predicted, actual }));
}

describe('brierScore', () => {
  it('computes the mean squared error for a known example', () => {
    const result = brierScore([
      { predicted: 0.9, actual: 1 },
      { predicted: 0.2, actual: 0 },
    ]);
    // ((0.1)^2 + (0.2)^2) / 2 = (0.01 + 0.04) / 2 = 0.025
    expect(result).toBeCloseTo(0.025, 10);
  });

  it('returns null on empty input', () => {
    expect(brierScore([])).toBeNull();
  });

  it('clamps out-of-range predicted values to [0, 1]', () => {
    // predicted 1.5 clamps to 1 (diff 0); predicted -0.5 clamps to 0 (diff 0)
    const result = brierScore([
      { predicted: 1.5, actual: 1 },
      { predicted: -0.5, actual: 0 },
    ]);
    expect(result).toBe(0);
  });
});

describe('calibrationBuckets', () => {
  it('counts sum to the input length', () => {
    const data: PredictionOutcome[] = [
      { predicted: 0.05, actual: 0 },
      { predicted: 0.35, actual: 1 },
      { predicted: 0.55, actual: 0 },
      { predicted: 0.95, actual: 1 },
      { predicted: 1.0, actual: 1 },
    ];
    const buckets = calibrationBuckets(data, 5);
    const total = buckets.reduce((acc, b) => acc + b.count, 0);
    expect(total).toBe(data.length);
  });

  it('places exactly 1.0 in the top bucket which is inclusive of 1.0', () => {
    const buckets = calibrationBuckets([{ predicted: 1.0, actual: 1 }], 5);
    expect(buckets[4].count).toBe(1);
    expect(buckets[4].upper).toBe(1);
    // not in any lower bucket
    expect(buckets.slice(0, 4).every(b => b.count === 0)).toBe(true);
  });

  it('computes observedRate and meanPredicted for a hand-built set', () => {
    // Two predictions in bucket [0.8, 1.0]: one hit, one miss => observedRate 0.5
    const buckets = calibrationBuckets(
      [
        { predicted: 0.8, actual: 1 },
        { predicted: 0.9, actual: 0 },
      ],
      5
    );
    expect(buckets[4].count).toBe(2);
    expect(buckets[4].observedRate).toBeCloseTo(0.5, 10);
    expect(buckets[4].meanPredicted).toBeCloseTo(0.85, 10);
  });

  it('reports 0 meanPredicted and observedRate for empty buckets', () => {
    const buckets = calibrationBuckets([{ predicted: 0.05, actual: 1 }], 5);
    expect(buckets[2].count).toBe(0);
    expect(buckets[2].meanPredicted).toBe(0);
    expect(buckets[2].observedRate).toBe(0);
  });
});

describe('calibrationQuality', () => {
  it('returns uncalibrated when sample size < 20', () => {
    expect(calibrationQuality(0.05, 19)).toBe('uncalibrated');
  });

  it('returns uncalibrated when brier is null', () => {
    expect(calibrationQuality(null, 100)).toBe('uncalibrated');
  });

  it('maps brier thresholds at >= 20 samples', () => {
    expect(calibrationQuality(0.05, 20)).toBe('excellent');
    expect(calibrationQuality(0.15, 20)).toBe('good');
    expect(calibrationQuality(0.22, 20)).toBe('fair');
    expect(calibrationQuality(0.4, 20)).toBe('poor');
  });
});

describe('summarizeQuality', () => {
  it('wires brier, quality, sampleSize, and buckets together', () => {
    // 20 well-calibrated outcomes (all correct) => brier 0 => excellent
    const data: PredictionOutcome[] = [
      ...outcomes(10, 1, 1),
      ...outcomes(10, 0, 0),
    ];
    const summary = summarizeQuality(data, 5);
    expect(summary.sampleSize).toBe(20);
    expect(summary.brier).toBe(0);
    expect(summary.quality).toBe('excellent');
    expect(summary.buckets).toHaveLength(5);
  });

  it('honors a custom bucket count', () => {
    const summary = summarizeQuality([{ predicted: 0.5, actual: 1 }], 3);
    expect(summary.buckets).toHaveLength(3);
  });
});

describe('freshnessRollup', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  it('marks providers within budget as fresh', () => {
    const result = freshnessRollup(
      [{ provider: 'pubmed', observedAt: '2026-06-15T11:59:00.000Z', budgetMs: 120000 }],
      now
    );
    expect(result.fresh).toEqual(['pubmed']);
    expect(result.stale).toEqual([]);
  });

  it('marks providers beyond budget as stale', () => {
    const result = freshnessRollup(
      [{ provider: 'pubmed', observedAt: '2026-06-15T11:50:00.000Z', budgetMs: 120000 }],
      now
    );
    expect(result.fresh).toEqual([]);
    expect(result.stale).toEqual(['pubmed']);
  });

  it('treats unparseable observedAt as stale', () => {
    const result = freshnessRollup(
      [{ provider: 'broken', observedAt: 'not-a-date', budgetMs: 999999999 }],
      now
    );
    expect(result.stale).toEqual(['broken']);
  });

  it('preserves input order within each list', () => {
    const result = freshnessRollup(
      [
        { provider: 'a', observedAt: '2026-06-15T11:59:59.000Z', budgetMs: 60000 },
        { provider: 'b', observedAt: '2026-06-15T10:00:00.000Z', budgetMs: 60000 },
        { provider: 'c', observedAt: '2026-06-15T11:59:50.000Z', budgetMs: 60000 },
        { provider: 'd', observedAt: 'bad', budgetMs: 60000 },
      ],
      now
    );
    expect(result.fresh).toEqual(['a', 'c']);
    expect(result.stale).toEqual(['b', 'd']);
  });
});
