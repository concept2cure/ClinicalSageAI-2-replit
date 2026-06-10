/**
 * Statistical-results narrator — unit tests. Deterministic; verifies
 * CI-based significance, hedging, exploratory/multiplicity flags, and phrasing.
 */
import { describe, it, expect } from 'vitest';
import { narrateStatisticalResult } from '../statistical-narrator';

describe('narrateStatisticalResult', () => {
  it('reports a significant time-to-event result from a CI excluding 1', () => {
    const r = narrateStatisticalResult({
      endpoint: 'overall survival',
      analysisType: 'time_to_event',
      arms: [
        { name: 'drug X', n: 300, value: '24.1', unit: 'months' },
        { name: 'placebo', n: 300, value: '18.7', unit: 'months' },
      ],
      measure: 'HR',
      estimate: 0.72,
      ciLower: 0.6,
      ciUpper: 0.86,
      pValue: 0.0003,
    });
    expect(r.significant).toBe(true);
    expect(r.statementStrength).toBe('confirmatory');
    expect(r.narrative).toContain('median was 24.1 months in the drug X arm (n=300) versus 18.7 months in the placebo arm');
    expect(r.narrative).toContain('HR was 0.72 (95% CI 0.6–0.86; p<0.001)');
    expect(r.narrative).toContain('reached statistical significance');
    expect(r.flags).toContain('Statistical significance does not by itself establish clinical relevance.');
  });

  it('flags a non-significant result when the CI includes the null', () => {
    const r = narrateStatisticalResult({
      endpoint: 'progression-free survival',
      analysisType: 'time_to_event',
      measure: 'HR',
      estimate: 0.93,
      ciLower: 0.78,
      ciUpper: 1.11,
      pValue: 0.42,
    });
    expect(r.significant).toBe(false);
    expect(r.flags).toEqual(
      expect.arrayContaining([
        'The 95% CI includes the null value (1).',
        'Not statistically significant at α=0.05.',
      ]),
    );
    expect(r.narrative).toContain('did not demonstrate a statistically significant difference');
  });

  it('handles a difference measure (null = 0) for a binary endpoint', () => {
    const r = narrateStatisticalResult({
      endpoint: 'ORR',
      analysisType: 'binary',
      measure: 'risk difference',
      estimate: 12,
      ciLower: 4,
      ciUpper: 20,
      pValue: 0.003,
    });
    expect(r.significant).toBe(true); // CI 4–20 excludes 0
    expect(r.narrative).toContain('risk difference was 12');
  });

  it('marks exploratory + uncontrolled multiplicity and downgrades strength', () => {
    const r = narrateStatisticalResult({
      endpoint: 'a subgroup',
      analysisType: 'binary',
      measure: 'OR',
      estimate: 1.8,
      ciLower: 1.1,
      ciUpper: 3.0,
      exploratory: true,
      multiplicityControlled: false,
    });
    expect(r.statementStrength).toBe('exploratory');
    expect(r.flags).toEqual(
      expect.arrayContaining([
        'Exploratory/post-hoc analysis — hypothesis-generating, not confirmatory.',
        'Multiplicity not controlled — interpret with caution and do not treat as confirmatory.',
      ]),
    );
  });

  it('returns null significance and descriptive strength when nothing decisive is given', () => {
    const r = narrateStatisticalResult({ endpoint: 'safety', analysisType: 'binary' });
    expect(r.significant).toBeNull();
    expect(r.statementStrength).toBe('descriptive');
    expect(r.narrative).toContain('could not be determined');
  });
});
