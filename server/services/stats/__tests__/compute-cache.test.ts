/**
 * Compute-cache (bounded LRU memoize) tests.
 */

import { describe, it, expect } from 'vitest';
import { ComputeCache, stableKey } from '../compute-cache';

describe('stableKey', () => {
  it('is invariant to object key order', () => {
    expect(stableKey({ a: 1, b: 2 })).toBe(stableKey({ b: 2, a: 1 }));
    expect(stableKey({ a: 1, b: 2 })).not.toBe(stableKey({ a: 1, b: 3 }));
  });

  it('handles nested structures and arrays', () => {
    expect(stableKey({ x: [{ b: 1, a: 2 }] })).toBe(stableKey({ x: [{ a: 2, b: 1 }] }));
  });
});

describe('ComputeCache', () => {
  it('memoizes: computes once for identical inputs', () => {
    const cache = new ComputeCache<number>(10);
    let calls = 0;
    const fn = () => { calls += 1; return 42; };
    expect(cache.memoize({ a: 1 }, fn)).toBe(42);
    expect(cache.memoize({ a: 1 }, fn)).toBe(42);
    expect(calls).toBe(1);
    // Different input recomputes.
    expect(cache.memoize({ a: 2 }, fn)).toBe(42);
    expect(calls).toBe(2);
  });

  it('evicts the least-recently-used entry past capacity', () => {
    const cache = new ComputeCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');          // 'a' becomes most-recently-used
    cache.set('c', 3);       // evicts 'b' (LRU)
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBeLessThanOrEqual(2);
  });

  it('tracks hit/miss stats', () => {
    const cache = new ComputeCache<number>(10);
    cache.memoize({ k: 1 }, () => 1); // miss
    cache.memoize({ k: 1 }, () => 1); // hit
    const s = cache.stats();
    expect(s.hits).toBe(1);
    expect(s.misses).toBe(1);
    expect(s.hitRate).toBeCloseTo(0.5, 3);
  });

  it('clear resets the cache and stats', () => {
    const cache = new ComputeCache<number>(10);
    cache.set('a', 1);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });
});
