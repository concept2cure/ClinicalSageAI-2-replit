/**
 * Group-sequential boundaries, pinned to published reference values.
 *
 * ── Why this file exists ──────────────────────────────────────────────────────
 * These boundaries decide when a registrational trial may stop early for
 * efficacy. They go into the SAP, the protocol and the submission, and a
 * regulator will reproduce them. A wrong constant here is not a rendering bug —
 * it inflates type I error in a pivotal trial, and nothing downstream would
 * notice.
 *
 * The implementation is CORRECT: measured against the published Lan–DeMets
 * spending-function tables it agrees to within 6e-4 at every configuration below
 * (see the tolerance note). What was missing is that almost nothing pinned it.
 * Measured before this file was written, `tests/biostat-design-stats-routes.test.ts`
 * and `tests/services/biostatPlatform.test.ts` carried **102 assertions across 63
 * endpoints, of which 10 checked a numeric value** — the rest asserted that a
 * number of the right type came back. Under that suite a transposed coefficient
 * or a wrong tail ships green.
 *
 * ── Provenance of the expected values ────────────────────────────────────────
 * One-sided α = 0.025 (the two-sided 0.05 convention), equally spaced analyses,
 * Lan–DeMets alpha-spending. These are the standard tabulated boundaries for
 * that design — see Jennison & Turnbull, *Group Sequential Methods with
 * Applications to Clinical Trials* (2000), and they are reproducible in R with
 * `gsDesign::gsDesign(k, test.type=1, sfu=sfLDOF)` for O'Brien–Fleming-type and
 * `sfu=sfLDPocock` for Pocock-type spending.
 *
 * ── Tolerance, and why it is 2 decimals and not 3 ──────────────────────────
 * Published tables quote 3–4 decimals; this implementation solves the
 * boundaries by numerical integration over a score grid, not in closed form. At
 * K=3 it returns 3.71055 where the table rounds to 3.710 — a 5.5e-4 disagreement
 * that is grid resolution, not a formula error.
 *
 * Asserting at 3 decimals therefore encodes a precision that cross-implementation
 * agreement cannot support, and the first draft of this file failed on exactly
 * that. The tolerance is 2 decimals (±0.005), which still catches every failure
 * mode that matters — a wrong tail, a transposed coefficient or a mis-signed
 * spending function move a boundary by far more than 0.005 — without pinning
 * digits that depend on the integrator's step size.
 *
 * The EXACT claim lives in the invariant tests below instead: cumulative alpha
 * must equal the target to 1e-10. That is the property a regulator actually
 * relies on, it is independent of any published table, and it is where precision
 * belongs.
 *
 * ── Why the spending boundaries are NOT flat for Pocock ──────────────────────
 * Textbook Pocock boundaries are constant on the z-scale. The Lan–DeMets
 * *spending-function* approximation to Pocock is not, and drifts slightly across
 * looks. That is correct behaviour, not a defect, and it is asserted below so
 * nobody "fixes" it into a constant.
 */

import { describe, it, expect } from 'vitest';
import {
  solveSpendingBoundaries,
  type SpendingFunction,
} from '../../server/services/stats/group-sequential-oc';

const ALPHA = 0.025;
/** Two decimals — see the note on tolerance above. */
const DP = 2;

const equallySpaced = (k: number) => Array.from({ length: k }, (_, i) => (i + 1) / k);

describe("O'Brien–Fleming-type spending (Lan–DeMets) matches the published tables", () => {
  it.each([
    [2, [2.963, 1.969]],
    [3, [3.710, 2.511, 1.993]],
    [4, [4.333, 2.963, 2.359, 2.014]],
    [5, [4.877, 3.357, 2.680, 2.290, 2.031]],
  ])('K=%i', (k, expected) => {
    const { efficacyBoundaries } = solveSpendingBoundaries(
      equallySpaced(k as number),
      ALPHA,
      'obrien-fleming'
    );
    expect(efficacyBoundaries).toHaveLength(expected.length);
    efficacyBoundaries.forEach((z, i) => {
      expect(z, `look ${i + 1} of ${k}`).toBeCloseTo(expected[i], DP);
    });
  });
});

describe('Pocock-type spending (Lan–DeMets) matches the published tables', () => {
  it.each([
    [2, [2.157, 2.201]],
    [4, [2.369, 2.368, 2.358, 2.350]],
  ])('K=%i', (k, expected) => {
    const { efficacyBoundaries } = solveSpendingBoundaries(
      equallySpaced(k as number),
      ALPHA,
      'pocock'
    );
    efficacyBoundaries.forEach((z, i) => {
      expect(z, `look ${i + 1} of ${k}`).toBeCloseTo(expected[i], DP);
    });
  });

  it('is NOT flat across looks — the spending approximation drifts, and should', () => {
    // Guards against someone "correcting" the spending-function boundaries into
    // the textbook constant-Pocock form, which would be a different design and
    // would not spend alpha the way the SAP says it does.
    const { efficacyBoundaries } = solveSpendingBoundaries(equallySpaced(4), ALPHA, 'pocock');
    const spread = Math.max(...efficacyBoundaries) - Math.min(...efficacyBoundaries);
    expect(spread).toBeGreaterThan(0);
    expect(spread).toBeLessThan(0.05); // drifts, but stays recognisably Pocock
  });
});

describe('invariants that hold for every spending function', () => {
  const FUNCTIONS: SpendingFunction[] = ['obrien-fleming', 'pocock', 'linear'];

  it.each(FUNCTIONS)('%s spends EXACTLY alpha by the final look', fn => {
    // The type I error guarantee itself. This is the property a regulator
    // checks, and it is independent of the published tables above — so it would
    // still fail a wrong implementation that happened to be self-consistent.
    const { cumulativeAlpha } = solveSpendingBoundaries(equallySpaced(4), ALPHA, fn);
    expect(cumulativeAlpha[cumulativeAlpha.length - 1]).toBeCloseTo(ALPHA, 10);
  });

  it.each(FUNCTIONS)('%s spends alpha monotonically', fn => {
    const { cumulativeAlpha, incrementalAlpha } = solveSpendingBoundaries(
      equallySpaced(5),
      ALPHA,
      fn
    );
    for (let i = 1; i < cumulativeAlpha.length; i++) {
      expect(cumulativeAlpha[i]).toBeGreaterThan(cumulativeAlpha[i - 1]);
    }
    for (const inc of incrementalAlpha) expect(inc).toBeGreaterThanOrEqual(0);
  });

  it.each(FUNCTIONS)('%s never lets an interim look be easier than the final one', fn => {
    // An interim boundary below the final boundary would mean it is EASIER to
    // stop early than to win at the end — the defining error of a mis-signed
    // spending function, and the one that inflates type I error.
    const { efficacyBoundaries } = solveSpendingBoundaries(equallySpaced(4), ALPHA, fn);
    const final = efficacyBoundaries[efficacyBoundaries.length - 1];
    for (let i = 0; i < efficacyBoundaries.length - 1; i++) {
      expect(efficacyBoundaries[i], `look ${i + 1} vs final`).toBeGreaterThanOrEqual(final);
    }
  });

  it('a tighter alpha produces uniformly higher boundaries', () => {
    // Directional sanity that no table can give: halving alpha must make every
    // boundary harder to cross. A sign error or a swapped tail fails here.
    const loose = solveSpendingBoundaries(equallySpaced(4), 0.05, 'obrien-fleming');
    const tight = solveSpendingBoundaries(equallySpaced(4), 0.005, 'obrien-fleming');
    tight.efficacyBoundaries.forEach((z, i) => {
      expect(z, `look ${i + 1}`).toBeGreaterThan(loose.efficacyBoundaries[i]);
    });
  });

  it('rejects an alpha outside (0, 0.5) rather than returning a boundary', () => {
    for (const bad of [0, -0.01, 0.5, 1]) {
      expect(() => solveSpendingBoundaries(equallySpaced(3), bad, 'obrien-fleming')).toThrow();
    }
  });
});
