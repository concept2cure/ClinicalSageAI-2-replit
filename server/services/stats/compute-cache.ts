/**
 * Bounded, deterministic compute cache.
 *
 * A tiny in-memory LRU for memoizing the results of deterministic (or seeded,
 * therefore reproducible) computations — so repeat requests for the same
 * program plan / Monte-Carlo run (same inputs + seed) are served from cache
 * instead of re-simulating. Production hardening for the heavier endpoints.
 *
 * Keyed by a stable JSON serialization of the input. Not for non-deterministic
 * (unseeded) computations.
 */

import { stableStringify } from '../../../shared/canonical-json.js';

/**
 * Stable cache key: object keys sorted recursively so key order doesn't matter.
 * Delegates to the one canonicalizer — a cache key is not a persisted digest,
 * so re-pointing it costs at most one miss
 * (docs/CANONICALIZATION_MIGRATION_2026-08.md).
 */
export function stableKey(value: unknown): string {
  return stableStringify(value);
}

export class ComputeCache<T = unknown> {
  private map = new Map<string, T>();
  private hits = 0;
  private misses = 0;

  constructor(private readonly maxEntries = 500) {}

  /** Get a cached value, refreshing its LRU recency. */
  get(key: string): T | undefined {
    if (!this.map.has(key)) {
      this.misses += 1;
      return undefined;
    }
    const value = this.map.get(key)!;
    // Move to most-recently-used.
    this.map.delete(key);
    this.map.set(key, value);
    this.hits += 1;
    return value;
  }

  /** Store a value, evicting the least-recently-used entry when over capacity. */
  set(key: string, value: T): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  /** Memoize: return cached value for the input, or compute, store, and return it. */
  memoize(input: unknown, compute: () => T): T {
    const key = stableKey(input);
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = compute();
    this.set(key, value);
    return value;
  }

  get size(): number {
    return this.map.size;
  }

  stats(): { size: number; hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;
    return { size: this.map.size, hits: this.hits, misses: this.misses, hitRate: total ? Math.round((this.hits / total) * 1000) / 1000 : 0 };
  }

  clear(): void {
    this.map.clear();
    this.hits = 0;
    this.misses = 0;
  }
}
