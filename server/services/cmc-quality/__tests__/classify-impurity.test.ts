/**
 * classifyImpurity — the AnA-facing impurity classifier.
 *
 * ── The defect this pins against ─────────────────────────────────────────────
 * This function held its OWN private copies of the ICH Q3C residual-solvent and
 * Q3D elemental-impurity tables, disagreeing in membership with the catalog in
 * server/services/global-ri/impurities-thresholds.ts, and both copies were
 * partial. Two behaviours followed, and both fabricated:
 *
 *   - A solvent the private table did not recognise was answered
 *     "5000 ppm (Class 3 default)" with an ICH Q3C(R8) citation. Benzene is
 *     Class 1 at 2 ppm, so a misspelling produced a limit 2500x too permissive,
 *     presented as the guideline's own answer.
 *   - An elemental impurity with no recorded route of administration was
 *     assessed as if it were oral (`route || 'oral'`). Q3D's oral PDE is the
 *     most permissive of the three for most elements.
 *
 * Both are now refusals that name what is missing, over ONE catalog.
 *
 * @compliance ICH Q3C(R8), ICH Q3D(R2)
 */
import { describe, it, expect } from 'vitest';
import { classifyImpurity } from '../cmc-quality-knowledge';

describe('classifyImpurity — residual solvents', () => {
  it('classifies a solvent the guideline names', () => {
    const r = classifyImpurity({ impurityType: 'residual_solvent', solventName: 'benzene' } as never);
    expect(r.solventClassification?.class).toBe(1);
    expect(r.solventClassification?.concentrationLimit_ppm).toBe(2);
  });

  it('reaches the whole Q3C catalog, not a partial copy of it', () => {
    for (const [name, expected] of [
      ['tetrahydrofuran', 2],
      ['dimethyl sulfoxide', 3],
      ['1,4-dioxane', 2],
      ['pyridine', 2],
      ['heptane', 3],
      ['cumene', 2],
    ] as const) {
      const r = classifyImpurity({ impurityType: 'residual_solvent', solventName: name } as never);
      expect(r.solventClassification?.class, name).toBe(expected);
    }
  });

  it('REFUSES an unrecognised solvent instead of defaulting it to Class 3', () => {
    const r = classifyImpurity({ impurityType: 'residual_solvent', solventName: 'benzenee' } as never);
    expect(r.solventClassification).toBeUndefined();
    /* The THRESHOLDS are what a section prints as this impurity's limit; the
       generic Q3C explainer in qualificationStrategy legitimately mentions the
       Class 3 figure while describing the guideline. */
    for (const t of [r.reportingThreshold, r.identificationThreshold, r.qualificationThreshold]) {
      expect(t?.value).toContain('benzenee');
      expect(t?.value).toMatch(/not in the ICH Q3C/i);
      expect(t?.value).not.toContain('5000');
      expect(t?.value).not.toMatch(/class\s*3/i);
      expect(t?.unit).toBe('not established');
    }
  });

  it('refuses when no solvent is named at all', () => {
    const r = classifyImpurity({ impurityType: 'residual_solvent' } as never);
    expect(r.solventClassification).toBeUndefined();
    expect(r.reportingThreshold?.value).toMatch(/no solvent is named/i);
    expect(r.reportingThreshold?.unit).toBe('not established');
  });
});

describe('classifyImpurity — elemental impurities', () => {
  it('uses the route-specific PDE when the route is recorded', () => {
    const oral = classifyImpurity({ impurityType: 'elemental', elementName: 'Cd', route: 'oral' } as never);
    expect(oral.elementalClassification?.oralPDE_ug_per_day).toBe(5);
    expect(oral.reportingThreshold?.value).toContain('5');
    const par = classifyImpurity({ impurityType: 'elemental', elementName: 'Cd', route: 'parenteral' } as never);
    expect(par.reportingThreshold?.value).toContain('2');
  });

  it('REFUSES an assessment with no recorded route instead of assuming oral', () => {
    const r = classifyImpurity({ impurityType: 'elemental', elementName: 'Cd' } as never);
    expect(r.reportingThreshold?.value).toMatch(/route/i);
    expect(r.reportingThreshold?.value).not.toMatch(/^5 ug\/day/);
  });

  it('reaches the Class 2A and Class 3 elements, not only Class 1', () => {
    for (const el of ['Co', 'V', 'Ni', 'Pd', 'Cu', 'Cr']) {
      const r = classifyImpurity({ impurityType: 'elemental', elementName: el, route: 'oral' } as never);
      expect(r.elementalClassification, el).toBeTruthy();
    }
  });

  it('refuses an element outside Q3D rather than inventing a PDE', () => {
    const r = classifyImpurity({ impurityType: 'elemental', elementName: 'Xx', route: 'oral' } as never);
    expect(r.elementalClassification).toBeUndefined();
    expect(r.reportingThreshold?.value).toMatch(/not in the ICH Q3D|risk assessment/i);
  });

  it('REFUSES a route Q3D does not tabulate (topical) instead of emitting undefined/NaN thresholds', () => {
    // 'topical' is a declared route enum value and passes the `!route` guard,
    // but Q3D(R2) tabulates a PDE only for oral/parenteral/inhalation. The old
    // code read pdeMicrogramsPerDay['topical'] === undefined and shipped
    // "undefined ug/day" / "NaN ug/day" cited to Q3D(R2).
    const r = classifyImpurity({ impurityType: 'elemental', elementName: 'Cd', route: 'topical' } as never);
    for (const t of [r.reportingThreshold, r.identificationThreshold, r.qualificationThreshold]) {
      expect(t?.value).not.toMatch(/undefined|NaN/i);
      expect(t?.value).toMatch(/does not tabulate|not established|derived and justified/i);
      expect(t?.unit).toBe('not established');
    }
    // The three tabulated PDEs are still surfaced honestly for the reviewer.
    expect(r.elementalClassification?.oralPDE_ug_per_day).toBe(5);
  });

  it('still gives the real PDE for the routes Q3D DOES tabulate (unchanged path)', () => {
    const r = classifyImpurity({ impurityType: 'elemental', elementName: 'Cd', route: 'inhalation' } as never);
    expect(r.reportingThreshold?.unit).toBe('ug/day');
    expect(r.reportingThreshold?.value).not.toMatch(/undefined|NaN/i);
  });
});

describe('classifyImpurity — inorganic impurities', () => {
  it('attributes the pharmacopeial threshold to the monograph, not to ICH Q3A (organic-only)', () => {
    const r = classifyImpurity({ impurityType: 'inorganic' } as never);
    // Q3A/Q3B govern ORGANIC impurities; the canonical engine holds inorganic
    // out of their scope, so the reporting basis must not cite Q3A.
    expect(r.reportingThreshold?.basis).not.toMatch(/Q3A/i);
    expect(r.reportingThreshold?.basis).toMatch(/pharmacopeial monograph/i);
  });
});
