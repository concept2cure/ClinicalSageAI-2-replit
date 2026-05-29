/**
 * Deterministic, seedable pseudo-random number generator for the statistics
 * engine.
 *
 * Why this exists: a regulated biostatistics tool must be reproducible. Every
 * Monte Carlo simulation, bootstrap, and random variate the engine produces has
 * to be identical given the same seed and the same inputs, so a result can be
 * regenerated and defended during a regulatory review. The platform previously
 * used unseeded `Math.random()`, which makes simulations non-reproducible.
 *
 * The core generator is mulberry32 — small, fast, and statistically adequate
 * for simulation work. It is intentionally pure (no Node built-ins) so it can
 * run in any runtime.
 */

const DEFAULT_SEED = 0x9e3779b9; // golden-ratio constant; avoids a zero state

export class Rng {
  private state: number;
  private spareNormal: number | null = null;

  constructor(seed: number = DEFAULT_SEED) {
    this.state = (seed >>> 0) || DEFAULT_SEED;
  }

  /** Uniform float in [0, 1). */
  uniform(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    return Math.floor(this.uniform() * maxExclusive);
  }

  /** Bernoulli draw with success probability p. */
  bernoulli(p: number): boolean {
    return this.uniform() < p;
  }

  /** Exponential variate with the given rate (lambda > 0). */
  exponential(rate: number): number {
    const u = 1 - this.uniform(); // in (0, 1], so log is finite
    return -Math.log(u) / rate;
  }

  /** Normal variate (Box–Muller), mean and sd configurable, second draw cached. */
  normal(mean = 0, sd = 1): number {
    if (this.spareNormal !== null) {
      const z = this.spareNormal;
      this.spareNormal = null;
      return mean + sd * z;
    }
    let u1 = this.uniform();
    const u2 = this.uniform();
    if (u1 < 1e-12) u1 = 1e-12;
    const r = Math.sqrt(-2 * Math.log(u1));
    const z0 = r * Math.cos(2 * Math.PI * u2);
    this.spareNormal = r * Math.sin(2 * Math.PI * u2);
    return mean + sd * z0;
  }

  /** Gamma variate (Marsaglia–Tsang), shape k > 0, scale theta > 0. */
  gamma(shape: number, scale = 1): number {
    if (shape < 1) {
      const u = this.uniform();
      return this.gamma(shape + 1, scale) * Math.pow(u, 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      const x = this.normal();
      const v0 = 1 + c * x;
      if (v0 <= 0) continue;
      const v = v0 * v0 * v0;
      const u = this.uniform();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v * scale;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
    }
  }

  /** Beta variate via two gamma variates. */
  beta(a: number, b: number): number {
    const x = this.gamma(a, 1);
    const y = this.gamma(b, 1);
    const s = x + y;
    return s > 0 ? x / s : 0.5;
  }

  /** Binomial count: number of successes in n independent Bernoulli(p) trials. */
  binomial(n: number, p: number): number {
    let successes = 0;
    for (let i = 0; i < n; i++) {
      if (this.uniform() < p) successes++;
    }
    return successes;
  }
}

/** Hash an arbitrary string to a uint32 seed (FNV-1a). */
export function seedFromString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Stable JSON serialization with sorted object keys, so the same logical input
 * always produces the same string (and therefore the same derived seed/hash).
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** Deterministic seed derived from a JSON-serializable object. */
export function seedFromObject(obj: unknown): number {
  return seedFromString(stableStringify(obj));
}

/**
 * Create a generator. With no seed, a fixed default is used so behavior is still
 * deterministic. Prefer deriving a seed from inputs via {@link seedFromObject}
 * so identical requests reproduce identical results.
 */
export function createRng(seed?: number): Rng {
  return new Rng(seed === undefined || !Number.isFinite(seed) ? DEFAULT_SEED : Math.trunc(seed));
}
