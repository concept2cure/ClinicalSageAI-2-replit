/**
 * Estimand advisor (ICH E9(R1)) — unit tests. Deterministic; verifies strategy
 * resolution, draft QC of the five attributes, and the framework catalog.
 */
import { describe, it, expect } from 'vitest';
import { adviseEstimand, listEstimandFramework } from '../estimands';

describe('adviseEstimand', () => {
  it('explains the treatment-policy strategy', () => {
    const r = adviseEstimand({ strategy: 'treatment_policy' });
    expect(r.resolved.strategy).toBe('treatment_policy');
    expect(r.brief).toContain('regardless of the intercurrent event');
  });

  it('resolves a strategy alias (principal stratification)', () => {
    const r = adviseEstimand({ strategy: 'principal stratification' });
    expect(r.resolved.strategy).toBe('principal_stratum');
  });

  it('flags missing attributes in an incomplete estimand draft', () => {
    const r = adviseEstimand({ draft: { treatment: 'Drug X vs placebo', variable: 'change at wk 24' } });
    expect(r.missingAttributes).toEqual(
      expect.arrayContaining(['Population', 'Intercurrent-event handling', 'Population-level summary']),
    );
    expect(r.brief).toContain('Missing attributes');
  });

  it('confirms a complete estimand draft', () => {
    const r = adviseEstimand({
      draft: {
        treatment: 'Drug X 50mg + SoC vs placebo + SoC',
        population: 'adults with moderate-severe disease',
        variable: 'change from baseline at week 24',
        intercurrentEvents: 'treatment-policy for rescue medication',
        summary: 'difference in mean change',
      },
    });
    expect(r.missingAttributes).toEqual([]);
    expect(r.brief).toContain('All five estimand attributes are specified');
  });

  it('lists the framework (5 attributes, 5 strategies)', () => {
    const f = listEstimandFramework();
    expect(f.attributes).toHaveLength(5);
    expect(f.strategies.map(s => s.id)).toContain('composite');
  });
});
