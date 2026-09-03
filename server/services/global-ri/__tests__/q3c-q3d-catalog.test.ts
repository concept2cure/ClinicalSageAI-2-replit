/**
 * The ICH Q3C(R8) residual-solvent and Q3D(R2) elemental-impurity catalogs.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * These tables were held in TWO places that disagreed:
 * server/services/global-ri/impurities-thresholds.ts carried 15 solvents and 4
 * elements; server/services/cmc-quality/cmc-quality-knowledge.ts carried its own
 * private RESIDUAL_SOLVENTS of about 22. Neither was the guideline.
 *
 * The private copy also FAILED OPEN: a solvent it did not recognise was assigned
 * "5000 ppm (Class 3 default)" with an ICH Q3C citation attached. Benzene is
 * Class 1 at 2 ppm. A misspelling, or any solvent outside a partial catalog,
 * produced a limit 2500x too permissive presented as the guideline's own answer
 * — in a governed path, which is exactly what the repo's working agreement
 * ("fail closed, never fabricate") forbids.
 *
 * Q3D had the same shape: a missing route of administration silently became
 * oral, and the oral PDE is the most permissive for several elements.
 *
 * @compliance ICH Q3C(R8), ICH Q3D(R2)
 */
import { describe, it, expect } from 'vitest';
import {
  RESIDUAL_SOLVENTS,
  ELEMENTAL_IMPURITIES,
  getResidualSolvent,
  getElementalImpurityPDE,
  assessResidualSolvent,
  assessElementalImpurity,
} from '../impurities-thresholds';

describe('ICH Q3C(R8) — the residual-solvent catalog', () => {
  it('carries every Class 1 solvent the guideline names', () => {
    /* Q3C(R8) Table 1. These are the solvents to be AVOIDED; a catalog missing
       one of them answers "not in the catalog" for the most dangerous case. */
    const class1 = RESIDUAL_SOLVENTS.filter((s) => s.class === 1).map((s) => s.name.toLowerCase());
    for (const name of [
      'benzene',
      'carbon tetrachloride',
      '1,2-dichloroethane',
      '1,1-dichloroethene',
      '1,1,1-trichloroethane',
    ]) {
      expect(class1, name).toContain(name);
    }
    expect(class1).toHaveLength(5);
  });

  it('carries the Class 2 solvents with their PDE and concentration limit as numbers', () => {
    /* A limit that exists only as prose cannot be compared to a measurement. */
    const acetonitrile = getResidualSolvent('acetonitrile');
    expect(acetonitrile).toBeTruthy();
    expect(acetonitrile!.class).toBe(2);
    expect(acetonitrile!.pdeMgPerDay).toBeCloseTo(4.1, 5);
    expect(acetonitrile!.concentrationLimitPpm).toBe(410);

    const dcm = getResidualSolvent('methylene chloride');
    expect(dcm!.pdeMgPerDay).toBeCloseTo(6.0, 5);
    expect(dcm!.concentrationLimitPpm).toBe(600);
  });

  it('is materially complete — Q3C names about seventy solvents, not fifteen', () => {
    expect(RESIDUAL_SOLVENTS.length).toBeGreaterThanOrEqual(60);
    expect(RESIDUAL_SOLVENTS.filter((s) => s.class === 2).length).toBeGreaterThanOrEqual(25);
    expect(RESIDUAL_SOLVENTS.filter((s) => s.class === 3).length).toBeGreaterThanOrEqual(25);
  });

  it('resolves the aliases a staffer actually types', () => {
    for (const [alias, expected] of [
      ['dichloromethane', 'Methylene chloride'],
      ['isopropanol', '2-Propanol'],
      ['IPA', '2-Propanol'],
      ['DMSO', 'Dimethyl sulfoxide'],
      ['DMF', 'N,N-Dimethylformamide'],
      ['THF', 'Tetrahydrofuran'],
      ['MEK', 'Methyl ethyl ketone'],
      ['MTBE', 'tert-Butylmethyl ether'],
    ] as const) {
      const found = getResidualSolvent(alias);
      expect(found, alias).toBeTruthy();
      expect(found!.name, alias).toBe(expected);
    }
  });

  it('REFUSES an unrecognised solvent instead of defaulting it to Class 3', () => {
    /* The defect this file was written for. */
    expect(getResidualSolvent('benzenee')).toBeNull();
    const verdict = assessResidualSolvent({ solventName: 'benzenee', observedPpm: 4000 });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.code).toBe('SOLVENT_NOT_IN_CATALOG');
      expect(verdict.message).toContain('benzenee');
      expect(verdict.message).not.toContain('5000');
      expect(verdict.message).not.toMatch(/class\s*3/i);
    }
  });

  it('compares a recorded level against the solvent it actually is', () => {
    const benzene = assessResidualSolvent({ solventName: 'benzene', observedPpm: 4 });
    expect(benzene.ok).toBe(true);
    if (benzene.ok) {
      expect(benzene.solventClass).toBe(1);
      expect(benzene.limitPpm).toBe(2);
      expect(benzene.withinLimit).toBe(false);
      /* Class 1 is not merely a limit — it is a solvent to be avoided. */
      expect(benzene.disposition).toBe('class-1-avoid');
    }
    const ethanol = assessResidualSolvent({ solventName: 'ethanol', observedPpm: 4000 });
    expect(ethanol.ok).toBe(true);
    if (ethanol.ok) {
      expect(ethanol.solventClass).toBe(3);
      expect(ethanol.withinLimit).toBe(true);
      expect(ethanol.disposition).toBe('within-limit');
    }
  });

  it('refuses a level with no recorded unit rather than assuming ppm', () => {
    const verdict = assessResidualSolvent({ solventName: 'ethanol', observedPpm: Number.NaN });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe('LEVEL_NOT_RECORDED');
  });
});

describe('ICH Q3D(R2) — the elemental-impurity catalog', () => {
  it('carries all four Class 1 elements and the Class 2A elements', () => {
    const symbols = ELEMENTAL_IMPURITIES.map((e) => e.symbol);
    for (const s of ['Pb', 'As', 'Cd', 'Hg']) expect(symbols).toContain(s);
    for (const s of ['Co', 'V', 'Ni']) expect(symbols).toContain(s);
    expect(ELEMENTAL_IMPURITIES.length).toBeGreaterThanOrEqual(20);
  });

  it('REFUSES an assessment with no recorded route instead of assuming oral', () => {
    /* Q3D PDEs differ by route by more than an order of magnitude for several
       elements; oral is the most permissive for most of them. */
    const verdict = assessElementalImpurity({ element: 'Cd', observedMicrogramsPerDay: 4, route: null });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.code).toBe('ROUTE_NOT_RECORDED');
      expect(verdict.message).toMatch(/route/i);
    }
  });

  it('uses the route-specific PDE when the route is recorded', () => {
    /* Cadmium: 5 oral, 2 parenteral. The same measurement passes one and fails
       the other, which is the whole reason the route may not be assumed. */
    const oral = assessElementalImpurity({ element: 'Cd', observedMicrogramsPerDay: 4, route: 'oral' });
    expect(oral.ok && oral.withinLimit).toBe(true);
    const parenteral = assessElementalImpurity({ element: 'Cd', observedMicrogramsPerDay: 4, route: 'parenteral' });
    expect(parenteral.ok && parenteral.withinLimit).toBe(false);
  });

  it('refuses an element outside the catalog rather than inventing a PDE', () => {
    const verdict = assessElementalImpurity({ element: 'Xx', observedMicrogramsPerDay: 1, route: 'oral' });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe('ELEMENT_NOT_IN_CATALOG');
  });

  it('getElementalImpurityPDE still answers for a known element and route', () => {
    expect(getElementalImpurityPDE('Pb', 'oral')!.pdeMicrogramsPerDay).toBe(5);
    expect(getElementalImpurityPDE('As', 'inhalation')!.pdeMicrogramsPerDay).toBe(2);
  });
});
