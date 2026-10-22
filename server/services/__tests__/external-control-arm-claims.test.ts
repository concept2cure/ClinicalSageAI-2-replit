/** Submission prose describes the service's actual summary pooling. */
import { describe, it, expect } from 'vitest';
import { describeSynthesisMethod, synthesisMethodLimitations, type SynthesisMethod } from '../external-control-arm-service';

const FALSE_FIT_CLAIM = 'Propensity scores estimated the probability of belonging to';

describe('propensity claims require a qualified execution this service cannot produce', () => {
  it('describes summary pooling and unavailable fitting without inventing a fitted model or its absence', () => {
    const prose = describeSynthesisMethod('propensity_score');
    expect(prose).not.toContain(FALSE_FIT_CLAIM);
    expect(prose).not.toContain('Propensity score methodology was used');
    expect(prose).not.toContain('NO propensity model has been fitted');
    expect(prose).toContain('sample-size-weighted pooling');
    expect(prose).toContain('fitting and model qualification are unavailable');
    expect(prose).not.toContain('Fit a propensity model');
  });

  it('a legacy boolean supplied at runtime cannot make a fit claim', () => {
    const prose = Reflect.apply(describeSynthesisMethod, undefined, ['propensity_score', { propensityModelFitted: true }]) as string;
    expect(prose).not.toContain(FALSE_FIT_CLAIM);
    expect(prose).toContain('unavailable');
    expect(prose).toBe(describeSynthesisMethod('propensity_score'));
  });

  it('retains the concrete descriptions of the three available pooling methods', () => {
    for (const method of ['naive_pooling', 'ipw', 'bayesian_borrowing'] as SynthesisMethod[]) {
      expect(describeSynthesisMethod(method)).not.toBe('Method details not available.');
    }
    expect(describeSynthesisMethod('naive_pooling')).toContain('Arm-level summary statistics');
    expect(describeSynthesisMethod('ipw')).toContain('inverse-variance');
    expect(describeSynthesisMethod('bayesian_borrowing')).toContain('random-effects');
  });
});

describe('synthesis limitations remain explicit', () => {
  it('always discloses unadjusted propensity-requested estimates, even with an old fitted flag', () => {
    const limitations = Reflect.apply(synthesisMethodLimitations, undefined, ['propensity_score', { propensityModelFitted: true }]) as string[];
    expect(limitations).toHaveLength(1);
    expect(limitations[0]).toContain('UNADJUSTED');
    expect(limitations[0]).toContain('must not be described');
    expect(limitations[0]).toContain('between-study heterogeneity');
    expect(limitations[0]).toContain('qualification is unavailable');
  });

  it('retains the existing naive-pooling caveat', () => {
    expect(synthesisMethodLimitations('naive_pooling')[0]).toContain('does not adjust for between-study heterogeneity');
  });

  it('adds no propensity caveat to the other available methods', () => {
    expect(synthesisMethodLimitations('ipw')).toEqual([]);
    expect(synthesisMethodLimitations('bayesian_borrowing')).toEqual([]);
  });
});
