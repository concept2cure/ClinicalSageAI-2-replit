/**
 * Tests for the F distribution (server/services/stats/f-distribution.ts).
 *
 * Validated against tabulated central-F critical values, the F_{1,∞}=z² and
 * F_{d,d} median identities, and — for the noncentral F — agreement with the
 * closed-form normal power in the large-denominator-df limit.
 */

import { describe, it, expect } from 'vitest';
import {
  fCdf,
  fQuantile,
  noncentralFCdf,
  noncentralFPower,
} from '../../server/services/stats/f-distribution';
import { normalCdf, normalQuantile } from '../../server/services/stats/normal';

describe('central F — against tabulated critical values', () => {
  it('matches standard 95th-percentile F values', () => {
    expect(fQuantile(0.95, 1, 10)).toBeCloseTo(4.9646, 3);
    expect(fQuantile(0.95, 5, 10)).toBeCloseTo(3.3258, 3);
    expect(fQuantile(0.95, 10, 20)).toBeCloseTo(2.3479, 3);
    expect(fQuantile(0.95, 3, 15)).toBeCloseTo(3.2874, 3);
  });

  it('matches a 99th-percentile value', () => {
    expect(fQuantile(0.99, 1, 10)).toBeCloseTo(10.0443, 3);
  });

  it('F_{1,∞} quantile equals z² (here via large df)', () => {
    const z = normalQuantile(0.975); // 1.959964
    expect(fQuantile(0.95, 1, 1e7)).toBeCloseTo(z * z, 3);
  });

  it('F_{d,d} has median 1', () => {
    expect(fCdf(1, 10, 10)).toBeCloseTo(0.5, 6);
    expect(fCdf(1, 25, 25)).toBeCloseTo(0.5, 6);
  });

  it('CDF and quantile are inverses', () => {
    for (const [d1, d2, p] of [[3, 12, 0.4], [5, 30, 0.9], [1, 8, 0.975]] as const) {
      expect(fCdf(fQuantile(p, d1, d2), d1, d2)).toBeCloseTo(p, 6);
    }
  });
});

describe('noncentral F', () => {
  it('reduces to the central F when λ = 0', () => {
    for (const f of [0.5, 1, 2, 4]) {
      expect(noncentralFCdf(f, 3, 12, 0)).toBeCloseTo(fCdf(f, 3, 12), 10);
    }
  });

  it('power increases with the noncentrality', () => {
    const a = noncentralFPower(1, 20, 3, 0.05);
    const b = noncentralFPower(1, 20, 8, 0.05);
    expect(b).toBeGreaterThan(a);
  });

  it('power equals alpha at λ = 0', () => {
    expect(noncentralFPower(1, 100, 0, 0.05)).toBeCloseTo(0.05, 6);
    expect(noncentralFPower(3, 50, 0, 0.01)).toBeCloseTo(0.01, 6);
  });

  it('matches the closed-form normal power in the large-df limit', () => {
    // For ν1 = 1 and ν2 → ∞, the F test is the square of a two-sided z test:
    // power = Φ(√λ − z_{1−α/2}) + Φ(−√λ − z_{1−α/2}).
    const alpha = 0.05;
    const zc = normalQuantile(1 - alpha / 2);
    for (const lambda of [4, 7.84, 10.5]) {
      const sqrtL = Math.sqrt(lambda);
      const normalPower = normalCdf(sqrtL - zc) + normalCdf(-sqrtL - zc);
      expect(noncentralFPower(1, 5_000_000, lambda, alpha)).toBeCloseTo(normalPower, 3);
    }
  });
});
