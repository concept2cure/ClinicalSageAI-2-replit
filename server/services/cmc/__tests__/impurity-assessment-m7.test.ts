/**
 * ICH M7(R2) over a recorded mutagenic impurity.
 *
 * The register carries an impurity whose class is 'mutagenic'. Q3A/Q3B do not
 * govern it — the composer used to render it as "cannot be compared to a
 * threshold … governed instead by ICH M7" and stop, with the M7 engine
 * (services/mutagenic-impurity) sitting unused beside it. These pin the
 * assessment and, as much as the numbers, every case where it must REFUSE.
 */
import { describe, expect, it } from 'vitest';

import { assessRecordedImpurity } from '../impurity-assessment';

const base = {
  impurityName: 'N-nitroso-BX-204',
  impurityType: 'mutagenic',
  observedLevel: '0.5',
  levelUnit: 'ppm',
  maximumDailyDose: '500 mg',
  routeOfAdministration: 'oral',
  amesResult: 'positive',
  structuralAlert: 'yes',
  carcinogenicityData: 'not-tested',
  treatmentDuration: 'lifetime',
  cohortOfConcern: 'not_coc',
};

describe('assessRecordedImpurity — a mutagenic impurity is assessed under ICH M7(R2)', () => {
  it('classifies an Ames-positive impurity as Class 2 and compares the level to the TTC-derived limit', () => {
    const r = assessRecordedImpurity(base, 'drug_substance');
    expect(r.ok).toBe(true);
    if (!r.ok || r.basis !== 'ICH M7(R2)') throw new Error('expected an M7 assessment, got ' + JSON.stringify(r));
    expect(r.impurityClass).toBe(2);
    // 1.5 µg/day lifetime TTC over a 0.5 g dose → 3 ppm.
    expect(r.acceptableIntakeUgPerDay).toBe(1.5);
    expect(r.concentrationLimitPpm).toBe(3);
    expect(r.observedPpm).toBe(0.5);
    expect(r.withinLimit).toBe(true);
    expect(r.disposition).toBe('within-limit');
    expect(r.citation).toMatch(/M7/);
  });

  it('applies the less-than-lifetime staged TTC for the recorded treatment duration', () => {
    const r = assessRecordedImpurity({ ...base, treatmentDuration: 'up-to-1-month' }, 'drug_substance');
    if (!r.ok || r.basis !== 'ICH M7(R2)') throw new Error('expected an M7 assessment');
    expect(r.acceptableIntakeUgPerDay).toBe(120);
    expect(r.concentrationLimitPpm).toBe(240);
  });

  it('reports a level above the limit and says what is owed', () => {
    const r = assessRecordedImpurity({ ...base, observedLevel: '5' }, 'drug_substance');
    if (!r.ok || r.basis !== 'ICH M7(R2)') throw new Error('expected an M7 assessment');
    expect(r.withinLimit).toBe(false);
    expect(r.disposition).toBe('above-limit');
    expect(r.outstanding.join(' ')).toMatch(/above/);
  });

  it('compares a µg/day intake directly to the acceptable intake, without a dose', () => {
    const r = assessRecordedImpurity(
      { ...base, observedLevel: '1.2', levelUnit: 'µg/day', maximumDailyDose: '' },
      'drug_substance',
    );
    if (!r.ok || r.basis !== 'ICH M7(R2)') throw new Error('expected an M7 assessment, got ' + JSON.stringify(r));
    expect(r.observedMicrogramsPerDay).toBe(1.2);
    expect(r.withinLimit).toBe(true);
    // No dose → no concentration limit can be stated, and none is invented.
    expect(r.concentrationLimitPpm).toBeNull();
  });

  it('uses the compound-specific cohort-of-concern limit, not the 1.5 µg/day TTC', () => {
    const r = assessRecordedImpurity({ ...base, cohortOfConcern: 'CoC_aflatoxin_like' }, 'drug_substance');
    if (!r.ok || r.basis !== 'ICH M7(R2)') throw new Error('expected an M7 assessment');
    expect(r.acceptableIntakeUgPerDay).toBeLessThan(1.5);
    expect(r.cohortOfConcern).toBe(true);
  });

  it('places a Class 4/5 impurity under ordinary Q3A/Q3B control with no TTC limit', () => {
    const r = assessRecordedImpurity(
      { ...base, amesResult: 'negative', structuralAlert: 'yes' },
      'drug_substance',
    );
    if (!r.ok || r.basis !== 'ICH M7(R2)') throw new Error('expected an M7 assessment');
    expect(r.impurityClass).toBe(4);
    expect(r.disposition).toBe('non-mutagenic-control');
    expect(r.acceptableIntakeUgPerDay).toBeNull();
    expect(r.withinLimit).toBeNull();
  });

  it('refuses rather than guessing when the record cannot support the M7 decision tree', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...base, amesResult: undefined }, 'AMES_NOT_RECORDED'],
      [{ ...base, amesResult: '' }, 'AMES_NOT_RECORDED'],
      [{ ...base, structuralAlert: undefined }, 'STRUCTURAL_ALERT_NOT_RECORDED'],
      [{ ...base, treatmentDuration: undefined }, 'TREATMENT_DURATION_NOT_RECORDED'],
      [{ ...base, treatmentDuration: 'a while' }, 'TREATMENT_DURATION_NOT_RECORDED'],
      [{ ...base, cohortOfConcern: undefined }, 'COHORT_OF_CONCERN_NOT_RECORDED'],
      [{ ...base, routeOfAdministration: undefined }, 'ROUTE_NOT_RECORDED'],
      // A concentration cannot be compared to a ppm limit without the dose.
      [{ ...base, maximumDailyDose: '' }, 'MDD_MISSING'],
      [{ ...base, levelUnit: '' }, 'LEVEL_UNIT_UNRECORDED'],
      [{ ...base, levelUnit: 'mg' }, 'LEVEL_UNIT_NOT_CONVERTIBLE'],
      [{ ...base, observedLevel: '' }, 'LEVEL_MISSING'],
    ];
    for (const [record, code] of cases) {
      const r = assessRecordedImpurity(record, 'drug_substance');
      expect(r.ok, JSON.stringify(record)).toBe(false);
      if (r.ok) continue;
      expect(r.code, JSON.stringify(record)).toBe(code);
      expect(r.routeTo).toBe('ICH M7(R2)');
    }
  });

  it('does not need duration, route or cohort to classify a Class 5 impurity', () => {
    /* Class 5 carries no TTC limit, so the fields the limit needs are not owed. */
    const r = assessRecordedImpurity(
      { impurityName: 'X', impurityType: 'mutagenic', amesResult: 'negative', structuralAlert: 'no' },
      'drug_substance',
    );
    if (!r.ok || r.basis !== 'ICH M7(R2)') throw new Error('expected an M7 assessment, got ' + JSON.stringify(r));
    expect(r.impurityClass).toBe(5);
    expect(r.disposition).toBe('non-mutagenic-control');
  });

  it('reads the snake_case row shape the register stores', () => {
    const r = assessRecordedImpurity(
      {
        impurity_name: 'X',
        impurity_type: 'mutagenic',
        observed_level: '0.5',
        level_unit: 'ppm',
        maximum_daily_dose: '500 mg',
        route_of_administration: 'oral',
        ames_result: 'positive',
        structural_alert: 'yes',
        carcinogenicity_data: 'not-tested',
        treatment_duration: 'lifetime',
        cohort_of_concern: 'not_coc',
      },
      'drug_substance',
    );
    expect(r.ok).toBe(true);
  });
});

describe('review: the M7 limit keeps its precision, and ppb is a concentration', () => {
  it('a nitrosamine limit in the ppb range is not rounded away before the comparison', () => {
    // 0.018 µg/day over 2.55 g/day = 0.00706 ppm; 9 ppb is ABOVE it.
    const r = assessRecordedImpurity(
      { ...base, cohortOfConcern: 'CoC_nitrosamine', maximumDailyDose: '2550 mg', observedLevel: '0.009', levelUnit: 'ppm' },
      'drug_substance',
    );
    if (!r.ok || r.basis !== 'ICH M7(R2)') throw new Error('expected an M7 assessment, got ' + JSON.stringify(r));
    expect(r.concentrationLimitPpm).toBeCloseTo(0.00706, 4);
    expect(r.withinLimit).toBe(false);
    // And at 4 g/day the limit is 0.0045 ppm, never 0.
    const r2 = assessRecordedImpurity(
      { ...base, cohortOfConcern: 'CoC_nitrosamine', maximumDailyDose: '4000 mg', observedLevel: '0.001', levelUnit: 'ppm' },
      'drug_substance',
    );
    if (!r2.ok || r2.basis !== 'ICH M7(R2)') throw new Error('expected an M7 assessment');
    expect(r2.concentrationLimitPpm).toBeGreaterThan(0);
    expect(r2.withinLimit).toBe(true);
  });

  it('reads a level recorded in ppb — the unit the register offers and nitrosamines are reported in', () => {
    const r = assessRecordedImpurity({ ...base, cohortOfConcern: 'CoC_nitrosamine', observedLevel: '5', levelUnit: 'ppb' }, 'drug_substance');
    if (!r.ok || r.basis !== 'ICH M7(R2)') throw new Error('expected an M7 assessment, got ' + JSON.stringify(r));
    expect(r.observedPpm).toBeCloseTo(0.005, 9);
  });
});
