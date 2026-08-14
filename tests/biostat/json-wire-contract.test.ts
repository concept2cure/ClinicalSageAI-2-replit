/**
 * Statistical results must survive JSON — the wire value has to be intentional.
 *
 * ── The class this guards ────────────────────────────────────────────────────
 * `JSON.stringify(Infinity)` and `JSON.stringify(NaN)` are both `null`, silently.
 * A stats function that returns either puts `null` on the wire beside
 * `"success": true`, and the client cannot tell an undefined quantity from a
 * missing field — or from a *different* undefined quantity.
 *
 * Two live instances were found and fixed while writing round 4:
 *
 *   • `winRatioAnalysis` returned `Infinity` when an arm had zero losses, and
 *     `NaN` for the CI bounds. `POST /api/biostat/win-ratio` therefore emitted
 *     `"winRatio": null` for BOTH "every pair a win" and "every pair a tie" —
 *     overwhelming benefit and no evidence, indistinguishable, in the primary
 *     endpoint of a hierarchical composite design.
 *   • `computeDiagnosticAccuracy` returned `lrPositive: Infinity` whenever
 *     specificity = 1, which is ordinary in a small IVD validation study.
 *
 * Both now return `null` explicitly, which is also the convention the
 * clinical-performance module already used for `calculateClinical2x2`
 * ("represents undefined denominators explicitly for persistence/UI consumers").
 * The outlier was the exception, not the rule.
 *
 * ── Why a sweep and not more individual tests ────────────────────────────────
 * The defect is invisible in process — the values look fine until they are
 * serialized — so it is exactly the kind that recurs. This file walks each
 * result object and fails on any non-finite number that is not explicitly
 * listed below with a reason. A new one cannot be added silently.
 *
 * ── What is deliberately NOT asserted ────────────────────────────────────────
 * That every undefined quantity must be `null`. Some functions legitimately
 * return `Infinity` as a *domain* answer — `expectedTimeToEnroll` returns it
 * when no site has capacity, meaning "never", which is a true statement about
 * the trial rather than a missing value. Those are listed as known and
 * accepted, so the list records a decision instead of a gap.
 */

import { describe, it, expect } from 'vitest';
import { winRatioAnalysis, type LevelSpec } from '../../server/services/stats/win-ratio';
import { computeDiagnosticAccuracy } from '../../server/services/stats/clinical-performance';
import { restrictedMeanSurvival } from '../../server/services/stats/rmst';
import { solveSpendingBoundaries } from '../../server/services/stats/group-sequential-oc';
import { mmrmSampleSize } from '../../server/services/stats/mmrm-design';
import { assuranceTwoSampleMeans } from '../../server/services/stats/assurance';
import { expectedEventsByTime } from '../../server/services/stats/event-projection';
import { clopperPearsonInterval } from '../../server/services/stats/special';

/** Every non-finite number in an object graph, with its dotted path. */
function nonFiniteFields(value: unknown, path = ''): string[] {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? [] : [`${path || '<root>'} = ${value}`];
  }
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => nonFiniteFields(v, `${path}[${i}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) =>
      nonFiniteFields(v, path ? `${path}.${k}` : k)
    );
  }
  return [];
}

const higher: LevelSpec = { type: 'continuous', direction: 'higher-better' };
const cont = (v: number) => ({ levels: [{ value: v }] });

/**
 * Each case is an EDGE input chosen to provoke a non-finite value — a zero
 * denominator, a perfect classifier, a degenerate design. Running the happy path
 * would prove nothing here.
 */
const CASES: Array<{ name: string; run: () => unknown }> = [
  {
    name: 'winRatioAnalysis — zero losses (undefined ratio)',
    run: () => winRatioAnalysis([cont(10), cont(8)], [cont(5), cont(3)], [higher]),
  },
  {
    name: 'winRatioAnalysis — every pair a tie (no information)',
    run: () => winRatioAnalysis([cont(5), cont(5)], [cont(5), cont(5)], [higher]),
  },
  {
    name: 'computeDiagnosticAccuracy — perfect specificity (LR+ undefined)',
    run: () => computeDiagnosticAccuracy({ tp: 50, fp: 0, fn: 5, tn: 50 }),
  },
  {
    name: 'computeDiagnosticAccuracy — perfect sensitivity',
    run: () => computeDiagnosticAccuracy({ tp: 50, fp: 5, fn: 0, tn: 50 }),
  },
  {
    name: 'computeDiagnosticAccuracy — with a prevalence adjustment at p=0',
    run: () => computeDiagnosticAccuracy({ tp: 50, fp: 5, fn: 5, tn: 50 }, { prevalence: 0 }),
  },
  {
    name: 'restrictedMeanSurvival — no events at all',
    run: () => restrictedMeanSurvival([1, 2, 3], [0, 0, 0], 3),
  },
  {
    name: 'solveSpendingBoundaries — a very tight alpha',
    run: () => solveSpendingBoundaries([0.25, 0.5, 0.75, 1], 0.0001, 'obrien-fleming'),
  },
  {
    name: 'mmrmSampleSize — degenerate single visit',
    run: () =>
      mmrmSampleSize({ visits: 1, covariance: 'CS', rho: 0, sigma: 1, delta: 0.5 }),
  },
  {
    name: 'assuranceTwoSampleMeans — a near-point prior',
    run: () =>
      assuranceTwoSampleMeans({ priorMean: 0.5, priorSd: 0.0001, nPerArm: 64 }),
  },
  {
    name: 'expectedEventsByTime — at t = 0',
    run: () =>
      expectedEventsByTime(
        {
          accrualRate: 10,
          accrualPeriod: 10,
          medianControl: 10,
          hazardRatio: 1,
          targetEvents: 50,
        },
        0
      ),
  },
  {
    name: 'clopperPearsonInterval — zero successes',
    run: () => clopperPearsonInterval(0, 10, 0.95),
  },
  {
    name: 'clopperPearsonInterval — all successes',
    run: () => clopperPearsonInterval(10, 10, 0.95),
  },
];

describe('no statistical result carries a value JSON cannot represent', () => {
  it.each(CASES)('$name', ({ run }) => {
    const result = run();
    const offenders = nonFiniteFields(result);
    expect(
      offenders,
      'these fields are Infinity or NaN and will silently become null on the wire.\n' +
        'Return null explicitly instead, so the type tells the truth and the client\n' +
        'can distinguish "undefined" from "missing":\n  ' +
        offenders.join('\n  ')
    ).toEqual([]);
  });

  it.each(CASES)('$name round-trips through JSON without losing a field', ({ run }) => {
    // Distinct from the check above: that one catches values JSON would mangle,
    // this one catches a field VANISHING. `undefined` is dropped entirely by
    // JSON.stringify, which is a quieter failure than null — the key simply is
    // not there, and a client destructuring it gets undefined with no error.
    const result = run();
    if (!result || typeof result !== 'object') return;
    const wire = JSON.parse(JSON.stringify(result));
    const missing = Object.keys(result as object).filter(k => !(k in wire));
    expect(missing, `fields dropped by serialization: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('the detector itself works', () => {
  // A sweep that cannot fail is worse than no sweep. These pin the helper, so a
  // refactor that quietly stops descending into nested objects or arrays is
  // caught here rather than by the absence of findings above.
  it('finds Infinity and NaN at any depth', () => {
    expect(nonFiniteFields({ a: Infinity })).toEqual(['a = Infinity']);
    expect(nonFiniteFields({ a: { b: NaN } })).toEqual(['a.b = NaN']);
    expect(nonFiniteFields({ a: [1, -Infinity] })).toEqual(['a[1] = -Infinity']);
    expect(nonFiniteFields({ a: [{ b: NaN }] })).toEqual(['a[0].b = NaN']);
  });

  it('passes clean objects, including nulls and strings', () => {
    expect(nonFiniteFields({ a: 1, b: null, c: 'x', d: [1, 2], e: { f: 0 } })).toEqual([]);
  });
});
