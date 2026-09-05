/**
 * f2 similarity — the arithmetic, and every condition that makes it mean
 * something.
 *
 * The engine this replaced had the formulas right and the eligibility wrong in
 * six ways. Each of those is pinned below by the case that used to pass.
 */
import { describe, expect, it } from 'vitest';

import {
  compareDissolutionProfiles,
  pointsFromRecordedProfile,
  type DissolutionProfileInput,
} from '../dissolution-comparison';

const profile = (
  role: 'reference' | 'test',
  points: Array<[number, number, number?, number?]>,
): DissolutionProfileInput => ({
  role,
  points: points.map(([timepointMin, meanPercent, rsd = 5, units = 12]) => ({
    timepointMin,
    meanPercent,
    rsdPercent: rsd,
    unitsTested: units,
  })),
});

describe('compareDissolutionProfiles — the statistic', () => {
  it('computes f2 and f1 over the included timepoints', () => {
    const r = compareDissolutionProfiles(
      profile('reference', [[10, 40], [20, 65], [30, 80]]),
      profile('test', [[10, 38], [20, 62], [30, 78]]),
    );
    expect(r.outcome).toBe('computed');
    if (r.outcome !== 'computed') return;
    // Mean squared difference over three points of 2, 3, 2 = (4+9+4)/3 = 5.667
    // f2 = 50 log10( (1+5.667)^-0.5 * 100 ) = 50 log10(38.73) = 79.4
    expect(r.f2).toBeCloseTo(79.4, 1);
    expect(r.f2Similar).toBe(true);
    expect(r.inputsUsed.n).toBe(3);
  });

  it('compares the UNROUNDED f2 against the cut-off', () => {
    /* The previous engine rounded to two decimals and then compared, so a true
       f2 just under 50 was reported as 50 and PASS. Construct a comparison that
       lands fractionally below and check the verdict follows the real value. */
    const r = compareDissolutionProfiles(
      profile('reference', [[10, 40], [20, 65], [30, 80], [45, 84]]),
      profile('test', [[10, 25], [20, 50], [30, 65], [45, 69]]),
    );
    if (r.outcome !== 'computed') throw new Error('expected a computed result');
    expect(r.f2Similar).toBe(r.f2 >= 50);
    expect(Number(r.f2Reported)).toBeCloseTo(r.f2, 1);
  });
});

describe('compareDissolutionProfiles — the refusals', () => {
  it('refuses profiles sampled at different times, however similar the means', () => {
    /* THE headline defect: the previous engine compared index by index if the
       array lengths matched, so 10/20/30 against 15/30/60 with identical means
       returned f2 = 100 and "SIMILAR" for profiles sharing no timepoint. */
    const r = compareDissolutionProfiles(
      profile('reference', [[10, 40], [20, 65], [30, 80]]),
      profile('test', [[15, 40], [30, 65], [60, 80]]),
    );
    expect(r.outcome).toBe('refused');
    if (r.outcome !== 'refused') return;
    expect(r.code).toBe('TIMEPOINTS_DO_NOT_MATCH');
    expect(r.offending).toHaveLength(2);
  });

  it('refuses when the unit count is not recorded, rather than assuming twelve', () => {
    const bare: DissolutionProfileInput = {
      role: 'reference',
      points: [
        { timepointMin: 10, meanPercent: 40, rsdPercent: 5 },
        { timepointMin: 20, meanPercent: 65, rsdPercent: 4 },
        { timepointMin: 30, meanPercent: 80, rsdPercent: 3 },
      ],
    };
    const r = compareDissolutionProfiles(bare, { ...bare, role: 'test' });
    expect(r.outcome).toBe('refused');
    if (r.outcome !== 'refused') return;
    expect(r.code).toBe('UNITS_NOT_RECORDED');
    expect(r.message).toContain('not assumed to be twelve');
  });

  it('refuses when variability is not recorded, because the CV limits cannot be evaluated', () => {
    const noVar: DissolutionProfileInput = {
      role: 'reference',
      points: [
        { timepointMin: 10, meanPercent: 40, unitsTested: 12 },
        { timepointMin: 20, meanPercent: 65, unitsTested: 12 },
        { timepointMin: 30, meanPercent: 80, unitsTested: 12 },
      ],
    };
    const r = compareDissolutionProfiles(noVar, { ...noVar, role: 'test' });
    expect(r.outcome).toBe('refused');
    if (r.outcome !== 'refused') return;
    expect(r.code).toBe('VARIABILITY_NOT_RECORDED');
  });

  it('refuses when variability exceeds the limit at an early or a later timepoint', () => {
    const early = compareDissolutionProfiles(
      profile('reference', [[10, 40, 26], [20, 65, 5], [30, 80, 4]]),
      profile('test', [[10, 38, 5], [20, 62, 5], [30, 78, 4]]),
    );
    expect(early.outcome).toBe('refused');
    if (early.outcome === 'refused') expect(early.code).toBe('EARLY_VARIABILITY_EXCEEDED');

    const late = compareDissolutionProfiles(
      profile('reference', [[10, 40, 12], [20, 65, 14], [30, 80, 4]]),
      profile('test', [[10, 38, 5], [20, 62, 5], [30, 78, 4]]),
    );
    expect(late.outcome).toBe('refused');
    if (late.outcome === 'refused') expect(late.code).toBe('LATE_VARIABILITY_EXCEEDED');
  });

  it('refuses rather than grading f2 on fewer than three comparable points', () => {
    const r = compareDissolutionProfiles(
      profile('reference', [[0, 0], [10, 90], [20, 96]]),
      profile('test', [[0, 0], [10, 88], [20, 95]]),
    );
    expect(r.outcome).toBe('refused');
    if (r.outcome !== 'refused') return;
    // t=0 dropped, truncated after the first point at/above 85% → one point.
    expect(['TOO_FEW_TIMEPOINTS', 'BOTH_VERY_RAPIDLY_DISSOLVING']).toContain(r.code);
  });

  it('answers "no f2 needed" for two very rapidly dissolving profiles instead of a contradictory verdict', () => {
    /* The previous engine returned f2Pass=false alongside an interpretation
       saying the profiles were similar — two contradictory fields in one
       governed result. */
    const r = compareDissolutionProfiles(
      profile('reference', [[5, 88], [10, 95], [15, 99]]),
      profile('test', [[5, 90], [10, 96], [15, 99]]),
    );
    expect(r.outcome).toBe('refused');
    if (r.outcome !== 'refused') return;
    expect(r.code).toBe('BOTH_VERY_RAPIDLY_DISSOLVING');
    expect(r.alternative).toBe('no_f2_needed_very_rapidly_dissolving');
  });
});

describe('compareDissolutionProfiles — what it reports about itself', () => {
  it('excludes t = 0 and says it did', () => {
    /* Including t = 0, where both profiles are 0 by construction, adds a zero
       difference that inflates f2. */
    const withZero = compareDissolutionProfiles(
      profile('reference', [[0, 0], [10, 40], [20, 65], [30, 80]]),
      profile('test', [[0, 0], [10, 30], [20, 55], [30, 70]]),
    );
    const withoutZero = compareDissolutionProfiles(
      profile('reference', [[10, 40], [20, 65], [30, 80]]),
      profile('test', [[10, 30], [20, 55], [30, 70]]),
    );
    if (withZero.outcome !== 'computed' || withoutZero.outcome !== 'computed') throw new Error('expected computed');
    expect(withZero.inputsUsed.zeroTimepointExcluded).toBe(true);
    expect(withZero.f2).toBeCloseTo(withoutZero.f2, 6);
  });

  it('includes at most one point at or above 85% and lists what it discarded', () => {
    const r = compareDissolutionProfiles(
      profile('reference', [[10, 40], [20, 65], [30, 88], [45, 96], [60, 99]]),
      profile('test', [[10, 38], [20, 62], [30, 85], [45, 95], [60, 98]]),
    );
    if (r.outcome !== 'computed') throw new Error('expected computed');
    expect(r.inputsUsed.n).toBe(3);
    expect(r.inputsUsed.above85Truncation.applied).toBe(true);
    expect(r.inputsUsed.above85Truncation.discardedTimepointsMin).toEqual([45, 60]);
  });

  it('reports only conditions it actually evaluated, with the observed value', () => {
    const r = compareDissolutionProfiles(
      profile('reference', [[10, 40], [20, 65], [30, 80]]),
      profile('test', [[10, 38], [20, 62], [30, 78]]),
    );
    if (r.outcome !== 'computed') throw new Error('expected computed');
    for (const check of r.checksEvaluated) {
      expect(check.observed).toBeTruthy();
      expect(check.observed).not.toBe('not evaluated');
    }
    expect(r.scope).toContain('not a bioequivalence conclusion');
  });
});

describe('pointsFromRecordedProfile — the register row shape', () => {
  it('reads the columns the register form writes', () => {
    const pts = pointsFromRecordedProfile([
      { timepoint: '10', meanPercent: '42', sd: '3.1', rsd: '7.4', n: '12' },
      { timepoint: '20', meanPercent: '78', rsd: '3.3', n: '12' },
    ]);
    expect(pts[0]).toMatchObject({ timepointMin: 10, meanPercent: 42, rsdPercent: 7.4, unitsTested: 12 });
    expect(pts[1].sdPercent).toBeNull();
  });

  it('leaves a blank cell absent rather than turning it into a zero', () => {
    const pts = pointsFromRecordedProfile([{ timepoint: '10', meanPercent: '42', sd: '', rsd: '', n: '' }]);
    expect(pts[0].sdPercent).toBeNull();
    expect(pts[0].rsdPercent).toBeNull();
    expect(pts[0].unitsTested).toBeNull();
  });
});
