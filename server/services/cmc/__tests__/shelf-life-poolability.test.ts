import { describe, it, expect } from 'vitest';
import { assessBatchPoolability } from '../shelf-life-poolability.js';

describe('assessBatchPoolability (ICH Q1E)', () => {
  // Three near-identical declining batches → should be poolable.
  // Three declining batches with realistic within-batch scatter (so between-batch
  // differences are not significant relative to residual variance) → poolable.
  const similar = [
    { batchId: 'A', data: [{ time: 0, value: 101.2 }, { time: 6, value: 98.7 }, { time: 12, value: 97.3 }, { time: 18, value: 95.2 }] },
    { batchId: 'B', data: [{ time: 0, value: 100.6 }, { time: 6, value: 99.3 }, { time: 12, value: 96.8 }, { time: 18, value: 95.6 }] },
    { batchId: 'C', data: [{ time: 0, value: 101.0 }, { time: 6, value: 98.9 }, { time: 12, value: 97.0 }, { time: 18, value: 95.0 }] },
  ];

  it('pools combinable batches and estimates from the pooled regression', () => {
    const r = assessBatchPoolability({ batches: similar, specLimit: 95, direction: 'decreasing' });
    expect(r.slopeTest.poolable).toBe(true);
    expect(r.interceptTest?.poolable).toBe(true);
    expect(r.decision).toBe('pooled');
    expect(r.pooledShelfLife).not.toBeNull();
    expect(r.shelfLife).toBe(r.pooledShelfLife);
  });

  it('refuses to pool batches with clearly different slopes and uses the minimum', () => {
    const divergent = [
      { batchId: 'Fast', data: [{ time: 0, value: 101 }, { time: 6, value: 97 }, { time: 12, value: 93 }, { time: 18, value: 89 }] },
      { batchId: 'Slow', data: [{ time: 0, value: 101 }, { time: 6, value: 100.5 }, { time: 12, value: 100 }, { time: 18, value: 99.5 }] },
    ];
    const r = assessBatchPoolability({ batches: divergent, specLimit: 95, direction: 'decreasing' });
    expect(r.slopeTest.poolable).toBe(false);
    expect(r.interceptTest).toBeNull();
    expect(r.decision).toBe('minimum-of-batches');
    expect(r.shelfLife).toBe(Math.min(...r.perBatchShelfLives.map((p) => p.shelfLife)));
  });

  it('validates inputs', () => {
    expect(() => assessBatchPoolability({ batches: [similar[0]], specLimit: 95, direction: 'decreasing' })).toThrow(/at least 2 batches/);
    expect(() => assessBatchPoolability({ batches: [{ batchId: 'X', data: [{ time: 0, value: 1 }] }, similar[0]], specLimit: 95, direction: 'decreasing' })).toThrow(/at least 3/);
  });

  it('is deterministic', () => {
    const a = assessBatchPoolability({ batches: similar, specLimit: 95, direction: 'decreasing' });
    const b = assessBatchPoolability({ batches: similar, specLimit: 95, direction: 'decreasing' });
    expect(a).toEqual(b);
  });
});
