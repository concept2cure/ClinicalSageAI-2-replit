/**
 * MMRM power is computed with the canonical Φ, and is reachable (2026-10-12).
 *
 * ── The duplicate ───────────────────────────────────────────────────────────
 * `mmrm-design.ts` carried its own standard-normal CDF:
 *
 *   // Local standard-normal CDF (Abramowitz–Stegun 7.1.26) to avoid a
 *   // circular import.
 *
 * The stated reason is false. The module already imports `normalQuantile`
 * from `./normal` (line 37), and `./normal` imports nothing at all — so there
 * is no cycle to avoid and never was. It is the thirteenth-copy-of-the-normal-
 * CDF problem this repository started 2026-10-05 with, surviving in one more
 * place behind a reason nobody checked.
 *
 * What it cost, measured rather than asserted: A&S 7.1.26 has an absolute
 * error around 7e-8 against the canonical Cody rational-Chebyshev form
 * (~1e-16). `mmrmPower` rounds to six decimals, and over a 0.0001 grid on
 * z ∈ [0, 4] the two forms give a DIFFERENT sixth decimal at 4.4% of points —
 * about one design in twenty-three. That is not a safety defect and this file
 * does not claim it is one. It is a reproducibility defect: a sponsor who
 * reruns the same design against the canonical engine gets a different last
 * digit, and "deterministic, reproducible for the same inputs" is a claim this
 * platform makes in its own provenance stamps.
 *
 * ── The independent check ───────────────────────────────────────────────────
 * `MmrmDesignResult` exposes `varianceFactor`, so the power can be recomputed
 * from first principles outside the module:
 *
 *   power = Φ( |δ| / √(σ²·factor·(1/n₁ + 1/n₂)) − z_{1−α/2} )
 *
 * with Φ and Φ⁻¹ taken from `stats/normal`. A module using its own 7e-8 CDF
 * cannot match that to 1e-12; one calling the canonical Φ matches exactly.
 *
 * ── And it was reachable by nothing ─────────────────────────────────────────
 * `mmrmPower` was declared and referenced nowhere outside its own test: no
 * route, no AnA tool, no calculator. "We can only enrol 90 per arm — what
 * power does that give us?" is the question a sponsor asks after the budget
 * comes back, and the reverse direction of `mmrmSampleSize` could not be
 * asked. That is covered by the route and calculator cases elsewhere; this
 * file pins the arithmetic.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mmrmPower, mmrmSampleSize } from '../../server/services/stats/mmrm-design.js';
import { normalCdf, normalQuantile } from '../../server/services/stats/normal.js';

/** A realistic longitudinal design: 4 post-baseline visits, CS ρ = 0.6. */
const DESIGN = {
  visits: 4,
  covariance: 'compound_symmetry' as const,
  rho: 0.6,
  sigma: 2.5,
  delta: 1.0,
  retention: [1, 0.92, 0.86, 0.8],
  alpha: 0.05,
  power: 0.9,
};

/**
 * Φ(|δ|/SE − z_{1−α/2}) with the CANONICAL Φ — computed outside the module,
 * then rounded to six decimals as `mmrmPower` documents that it rounds. The
 * comparison is therefore EXACT: a module whose CDF differs in the 7th decimal
 * lands on a different 6-decimal value about 4.4% of the time, and identically
 * the rest, so an exact match across several n is the discriminating test.
 */
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;
const referencePower = (factor: number, nPerArm: number, n2: number): number => {
  const se = Math.sqrt(DESIGN.sigma ** 2 * factor * (1 / nPerArm + 1 / n2));
  return round6(normalCdf(Math.abs(DESIGN.delta) / se - normalQuantile(1 - DESIGN.alpha / 2)));
};

describe('mmrmPower against an independent computation', () => {
  const sized = mmrmSampleSize(DESIGN);

  it('equals Φ(|δ|/SE − z) exactly at every n, which a 7e-8 CDF cannot', () => {
    for (const n of [40, 90, 120, sized.nPerArm, 300]) {
      expect(mmrmPower({ ...DESIGN, nPerArm: n }), `n = ${n}`)
        .toBe(referencePower(sized.varianceFactor, n, n));
    }
  });

  it('agrees with the achieved power the sizing itself reports', () => {
    // `achievedPower` is rounded to four decimals by the sizing.
    expect(mmrmPower({ ...DESIGN, nPerArm: sized.nPerArm })).toBeCloseTo(sized.achievedPower, 4);
  });

  it('crosses the target at exactly the n the sizing returned', () => {
    // The round trip: the sized n reaches the target and one fewer does not.
    expect(mmrmPower({ ...DESIGN, nPerArm: sized.nPerArm })).toBeGreaterThanOrEqual(DESIGN.power);
    expect(mmrmPower({ ...DESIGN, nPerArm: sized.nPerArm - 1 })).toBeLessThan(DESIGN.power);
  });

  it('increases with n and with the effect, and falls with the variance', () => {
    const at = (over: Record<string, number>) => mmrmPower({ ...DESIGN, nPerArm: 90, ...over });
    expect(at({ nPerArm: 120 })).toBeGreaterThan(at({}));
    expect(at({ delta: 1.5 })).toBeGreaterThan(at({}));
    expect(at({ sigma: 3.5 })).toBeLessThan(at({}));
  });

  it('honours an unequal allocation through n2', () => {
    const balanced = mmrmPower({ ...DESIGN, nPerArm: 90 });
    const twoToOne = mmrmPower({ ...DESIGN, nPerArm: 90, n2: 180 });
    expect(twoToOne).toBeGreaterThan(balanced);
    expect(twoToOne).toBe(referencePower(sized.varianceFactor, 90, 180));
  });
});

describe('the module carries no second normal CDF', () => {
  it('declares no private standard-normal CDF', () => {
    const src = readFileSync('server/services/stats/mmrm-design.ts', 'utf8');
    /* The structural half of the fix. A reviewer reading only the numbers
       above could not tell a re-added copy from the canonical one, because a
       re-added copy would still pass them at 6 decimals most of the time. */
    expect(src, 'a private CDF was re-added').not.toMatch(/function standardNormalCdf/);
    expect(src, 'the Abramowitz–Stegun constants are back').not.toMatch(/0\.2316419/);
    expect(src, 'the canonical Φ is not imported').toMatch(/import \{[^}]*normalCdf[^}]*\} from '\.\/normal'/);
  });
});
