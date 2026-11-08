/**
 * CDISC pilot defect D13: SAS TLFs round half away from zero on the decimal
 * value, and JS toFixed rounds the binary one, so (60.0 + 60.1) / 2 printed
 * "60.0" where the published convention prints "60.1". SYNTHETIC values.
 */
import { describe, expect, it } from 'vitest';
import { buildDemographicsTable, buildExposureTable, roundHalfUp, type StudyData } from '../../csr-tabulation-builders';
import { buildEfficacyTable } from '../csr-efficacy-table';

const study = (weights: number[]): StudyData => ({ studyId: 'SYN', protocolNumber: 'SYN', efficacy: [], adverseEvents: [], disposition: [],
  treatmentArms: [{ armId: 'A', armName: 'A', randomized: weights.length, populations: { safety: weights.length, itt: weights.length, completed: weights.length } }],
  demographics: weights.map((weight, i) => ({ subjectId: `S${i}`, armId: 'A', age: 60, sex: 'F' as const, weight })) });

describe('table figures round half away from zero on the decimal value', () => {
  it('formats the boundary cases as the SAS convention does', () => {
    expect(roundHalfUp(60.05, 1)).toBe('60.1');
    expect(roundHalfUp(1.005, 2)).toBe('1.01');
    expect(roundHalfUp(-2.25, 1)).toBe('-2.3');
    expect(roundHalfUp(-0.04, 1)).toBe('0.0');
    expect(roundHalfUp(0.1 + 0.2, 1)).toBe('0.3');
    expect(roundHalfUp(2.5, 0)).toBe('3');
  });
  it('prints a mean of 60.05 as 60.1, not 60.0', () => {
    const row = buildDemographicsTable(study([60.0, 60.1])).rows.find(r => r[0].startsWith('Weight'));
    expect(row?.[1]).toBe('60.1 (0.1)');
  });
  it('prints exposure the same way', () => {
    const s = study([60]);
    expect(buildExposureTable({ ...s, exposure: [{ armId: 'A', meanExposureDays: 60.05, totalPersonYears: 1.005 }] }).rows[0].slice(3)).toEqual(['60.1', '1.01']);
  });

  it.each([[0.0004, '<0.001'], [0.9996, '>0.999'], [0, '0.000'], [1, '1.000'],
    [0.001, '0.001'], [0.999, '0.999']] as const)('preserves the bound of an imported p-value %s', (pValue, display) => {
    const s = study([60]);
    s.efficacy = [{ endpointType: 'primary', endpointName: 'Synthetic endpoint', armId: 'A', value: 12, display: '12', pValue }];
    expect(buildEfficacyTable(s, 'primary').rows[0][4]).toBe(display);
  });
});
