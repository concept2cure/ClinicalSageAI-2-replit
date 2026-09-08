/**
 * Impurities & limits expert — ICH Q3A(R2)/Q3B(R2)/Q3C(R8)/Q3D(R2) thresholds.
 */

import { describe, it, expect } from 'vitest';
import {
  getDrugSubstanceThresholds,
  getDrugProductThresholds,
  getResidualSolvent,
  getElementalImpurityPDE,
  RESIDUAL_SOLVENTS,
  ELEMENTAL_IMPURITIES,
  type AdministrationRoute,
} from '../impurities-thresholds';

describe('getDrugSubstanceThresholds — Q3A(R2)', () => {
  it('MDD 1000 mg (≤ 2 g) → reporting 0.05%', () => {
    const r = getDrugSubstanceThresholds(1000);
    expect(r.reporting).toBe('0.05%');
    expect(r.identification).toContain('0.10%');
    expect(r.qualification).toContain('0.15%');
    expect(r.citation).toBe('ICH Q3A(R2)');
  });

  it('MDD 3000 mg (> 2 g) → reporting 0.03% / qualification 0.05%', () => {
    const r = getDrugSubstanceThresholds(3000);
    expect(r.reporting).toBe('0.03%');
    expect(r.identification).toBe('0.05%');
    expect(r.qualification).toBe('0.05%');
  });

  it('2000 mg sits on the ≤ 2 g side of the split', () => {
    expect(getDrugSubstanceThresholds(2000).reporting).toBe('0.05%');
    expect(getDrugSubstanceThresholds(2001).reporting).toBe('0.03%');
  });

  it('every output carries the M7 / in-force caveat', () => {
    const notes = getDrugSubstanceThresholds(500).notes.join(' ');
    expect(notes).toContain('M7');
    expect(notes).toContain('in-force');
  });
});

describe('getDrugProductThresholds — Q3B(R2)', () => {
  it('MDD 500 mg → reporting 0.1%', () => {
    expect(getDrugProductThresholds(500).reporting).toBe('0.1%');
  });

  it('MDD 1500 mg → reporting 0.05%', () => {
    expect(getDrugProductThresholds(1500).reporting).toBe('0.05%');
  });

  it('reporting boundary: 1000 mg → 0.1%; 1001 mg → 0.05%', () => {
    expect(getDrugProductThresholds(1000).reporting).toBe('0.1%');
    expect(getDrugProductThresholds(1001).reporting).toBe('0.05%');
  });

  it('identification tiers return the right band', () => {
    // < 1 mg
    expect(getDrugProductThresholds(0.5).identification).toContain('5 µg TDI');
    // 1 mg–10 mg (5 mg)
    expect(getDrugProductThresholds(5).identification).toContain('20 µg TDI');
    // > 10 mg–2 g (50 mg)
    expect(getDrugProductThresholds(50).identification).toContain('2 mg TDI');
    // > 10 mg–2 g (1500 mg)
    expect(getDrugProductThresholds(1500).identification).toContain('2 mg TDI');
    // > 2 g (3000 mg)
    expect(getDrugProductThresholds(3000).identification).toBe('0.10%');
  });

  it('qualification tiers return the right band', () => {
    // < 10 mg (5 mg)
    expect(getDrugProductThresholds(5).qualification).toContain('50 µg TDI');
    // 10–100 mg (50 mg)
    expect(getDrugProductThresholds(50).qualification).toContain('200 µg TDI');
    // > 100 mg–2 g (1500 mg)
    expect(getDrugProductThresholds(1500).qualification).toContain('3 mg TDI');
    // > 2 g (3000 mg)
    expect(getDrugProductThresholds(3000).qualification).toBe('0.15%');
  });
});

describe('getResidualSolvent — Q3C(R8)', () => {
  it('benzene → class 1, 2 ppm', () => {
    const s = getResidualSolvent('benzene')!;
    expect(s.class).toBe(1);
    /* The limit is a NUMBER, not the prose '2 ppm' it used to be: a limit that
       exists only as a string cannot be compared to a measurement, which is why
       no recorded solvent was ever assessed against this table. */
    expect(s.concentrationLimitPpm).toBe(2);
    expect(s.citation).toBe('ICH Q3C(R8)');
  });

  it('acetonitrile → class 2', () => {
    expect(getResidualSolvent('acetonitrile')!.class).toBe(2);
  });

  it('ethanol → class 3', () => {
    expect(getResidualSolvent('ethanol')!.class).toBe(3);
  });

  it('unknown solvent → null', () => {
    expect(getResidualSolvent('water')).toBeNull();
  });

  it('lookup is case-insensitive', () => {
    expect(getResidualSolvent('BENZENE')!.class).toBe(1);
    expect(getResidualSolvent('  Acetonitrile  ')!.class).toBe(2);
  });

  it('catalog has the expected class distribution', () => {
    /* Q3C(R8) names five Class 1 solvents; the Class 2 and Class 3 tables are
       long, and the earlier pin of 5/5 recorded how much of the guideline the
       catalog was missing rather than what the guideline says. */
    expect(RESIDUAL_SOLVENTS.filter((s) => s.class === 1).length).toBe(5);
    expect(RESIDUAL_SOLVENTS.filter((s) => s.class === 2).length).toBeGreaterThanOrEqual(25);
    expect(RESIDUAL_SOLVENTS.filter((s) => s.class === 3).length).toBeGreaterThanOrEqual(25);
  });
});

describe('getElementalImpurityPDE — Q3D(R2)', () => {
  it("('As','inhalation') → 2 µg/day", () => {
    expect(getElementalImpurityPDE('As', 'inhalation')!.pdeMicrogramsPerDay).toBe(2);
  });

  it("('Pb','oral') → 5 µg/day", () => {
    expect(getElementalImpurityPDE('Pb', 'oral')!.pdeMicrogramsPerDay).toBe(5);
  });

  it("('Hg','parenteral') → 3 µg/day", () => {
    expect(getElementalImpurityPDE('Hg', 'parenteral')!.pdeMicrogramsPerDay).toBe(3);
  });

  it('matches by full name, case-insensitively', () => {
    expect(getElementalImpurityPDE('arsenic', 'inhalation')!.pdeMicrogramsPerDay).toBe(2);
    expect(getElementalImpurityPDE('LEAD', 'parenteral')!.pdeMicrogramsPerDay).toBe(5);
  });

  it('unknown element → null', () => {
    expect(getElementalImpurityPDE('Fe', 'oral')).toBeNull();
  });

  it('throws for an unmodeled route', () => {
    expect(() => getElementalImpurityPDE('Pb', 'topical' as AdministrationRoute)).toThrow();
  });

  it('catalog covers the Class 1 elements, and the classes Q3D also requires', () => {
    /* The pin used to be `length === 4`, which recorded that only the Class 1
       elements were modelled. Q3D(R2) Table A.2.1 also sets PDEs for Class 2A,
       2B and 3, and a record naming any of them must be assessable. */
    const symbols = ELEMENTAL_IMPURITIES.map((e) => e.symbol);
    for (const s of ['Pb', 'As', 'Cd', 'Hg']) expect(symbols).toContain(s);
    expect(ELEMENTAL_IMPURITIES.filter((e) => e.class === 'Class 1')).toHaveLength(4);
    expect(ELEMENTAL_IMPURITIES.length).toBeGreaterThanOrEqual(20);
  });
});

describe('invalid input + determinism', () => {
  it('drug-substance thresholds throw for NaN / negative dose', () => {
    expect(() => getDrugSubstanceThresholds(NaN)).toThrow();
    expect(() => getDrugSubstanceThresholds(-1)).toThrow();
    expect(() => getDrugSubstanceThresholds(Infinity)).toThrow();
  });

  it('drug-product thresholds throw for NaN / negative dose', () => {
    expect(() => getDrugProductThresholds(NaN)).toThrow();
    expect(() => getDrugProductThresholds(-100)).toThrow();
  });

  it('is deterministic', () => {
    expect(getDrugSubstanceThresholds(1000)).toEqual(getDrugSubstanceThresholds(1000));
    expect(getDrugProductThresholds(1500)).toEqual(getDrugProductThresholds(1500));
    expect(getElementalImpurityPDE('As', 'inhalation')).toEqual(
      getElementalImpurityPDE('As', 'inhalation'),
    );
  });
});
