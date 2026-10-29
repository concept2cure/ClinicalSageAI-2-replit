/**
 * CDISC pilot defect D13: SAS TLFs round half away from zero on the decimal
 * value, and JS toFixed rounds the binary one, so (60.0 + 60.1) / 2 printed
 * "60.0" where the published convention prints "60.1". SYNTHETIC values.
 */
import { describe, expect, it } from 'vitest';
import { buildDemographicsTable, buildExposureTable, roundHalfUp, type StudyData } from '../../csr-tabulation-builders';

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
});
