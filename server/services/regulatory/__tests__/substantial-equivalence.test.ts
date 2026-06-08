/**
 * Substantial-equivalence engine — exercises every branch of the FDA 510(k) SE
 * decision flowchart and the technological-characteristics comparison.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateSubstantialEquivalence,
  compareTechnologicalCharacteristics,
} from '../substantial-equivalence';

describe('evaluateSubstantialEquivalence — flowchart branches', () => {
  it('different intended use → NSE (with alternative pathway)', () => {
    const r = evaluateSubstantialEquivalence({
      sameIntendedUse: false,
      sameTechnologicalCharacteristics: true,
    });
    expect(r.determination).toBe('NSE');
    expect(r.recommendedPathway).toMatch(/De Novo|PMA/);
    expect(r.decisionPath[0]).toMatch(/Same intended use.*No/);
  });

  it('same use + same tech + supportive data → SE', () => {
    const r = evaluateSubstantialEquivalence({
      sameIntendedUse: true,
      sameTechnologicalCharacteristics: true,
      performanceDataSupportsEquivalence: true,
    });
    expect(r.determination).toBe('SE');
  });

  it('same use + same tech + data not yet available → INSUFFICIENT_DATA', () => {
    const r = evaluateSubstantialEquivalence({
      sameIntendedUse: true,
      sameTechnologicalCharacteristics: true,
      performanceDataSupportsEquivalence: null,
    });
    expect(r.determination).toBe('INSUFFICIENT_DATA');
  });

  it('same use + same tech + non-supportive data → NSE', () => {
    const r = evaluateSubstantialEquivalence({
      sameIntendedUse: true,
      sameTechnologicalCharacteristics: true,
      performanceDataSupportsEquivalence: false,
    });
    expect(r.determination).toBe('NSE');
  });

  it('different tech that raises new questions → NSE', () => {
    const r = evaluateSubstantialEquivalence({
      sameIntendedUse: true,
      sameTechnologicalCharacteristics: false,
      differencesRaiseNewQuestions: true,
    });
    expect(r.determination).toBe('NSE');
    expect(r.decisionPath.some(s => /new questions.*Yes/.test(s))).toBe(true);
  });

  it('different tech, no new questions, supportive data → SE', () => {
    const r = evaluateSubstantialEquivalence({
      sameIntendedUse: true,
      sameTechnologicalCharacteristics: false,
      differencesRaiseNewQuestions: false,
      performanceDataSupportsEquivalence: true,
    });
    expect(r.determination).toBe('SE');
  });

  it('different tech, no new questions, non-supportive data → NSE', () => {
    const r = evaluateSubstantialEquivalence({
      sameIntendedUse: true,
      sameTechnologicalCharacteristics: false,
      differencesRaiseNewQuestions: false,
      performanceDataSupportsEquivalence: false,
    });
    expect(r.determination).toBe('NSE');
  });

  it('different tech with the new-questions judgment undetermined → INSUFFICIENT_DATA', () => {
    const r = evaluateSubstantialEquivalence({
      sameIntendedUse: true,
      sameTechnologicalCharacteristics: false,
    });
    expect(r.determination).toBe('INSUFFICIENT_DATA');
  });

  it('records an ordered decision path and the framework', () => {
    const r = evaluateSubstantialEquivalence({
      sameIntendedUse: true,
      sameTechnologicalCharacteristics: false,
      differencesRaiseNewQuestions: false,
      performanceDataSupportsEquivalence: true,
    });
    expect(r.framework).toBe('FDA 510(k) SE flowchart');
    expect(r.decisionPath.length).toBeGreaterThanOrEqual(4);
  });
});

describe('compareTechnologicalCharacteristics', () => {
  it('flags differing characteristics (whitespace/case-insensitive match)', () => {
    const r = compareTechnologicalCharacteristics([
      { name: 'Energy source', subjectValue: 'Battery', predicateValue: 'battery ' },
      { name: 'Material', subjectValue: 'Titanium', predicateValue: 'Stainless steel' },
    ]);
    expect(r.sameOverall).toBe(false);
    expect(r.differences).toEqual(['Material']);
    expect(r.comparisons[0].same).toBe(true);
  });

  it('sameOverall when all characteristics match', () => {
    const r = compareTechnologicalCharacteristics([
      { name: 'Wavelength', subjectValue: '810 nm', predicateValue: '810 nm' },
    ]);
    expect(r.sameOverall).toBe(true);
    expect(r.differences).toEqual([]);
  });

  it('rejects an empty characteristic list', () => {
    expect(() => compareTechnologicalCharacteristics([])).toThrow();
  });
});
