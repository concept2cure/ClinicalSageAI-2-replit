/**
 * assessMetaboliteSafety (AnA tool assess_metabolite_safety) applies the 10%
 * MIST threshold only to a stated exposure share (2026-10-15).
 *
 * It compared percentOfTotalDrugRelated with 10 as given. For a metabolite with
 * no share stated, undefined > 10 is false, so the metabolite was 'no_action' —
 * "At undefined% of total drug-related exposure, this metabolite is below the
 * 10% MIST threshold" — and qualificationTriggered was false. An empty list
 * answered "no additional nonclinical qualification triggered on current data".
 */
import { describe, expect, it } from 'vitest';
import { assessMetaboliteSafety, type AssessMetaboliteSafetyParams } from '../nonclinical-adme-knowledge';
import { ASSESS_METABOLITE_SAFETY } from '../../ana/nonclinicalAdmeTools';

const assess = (p: unknown) => assessMetaboliteSafety(p as AssessMetaboliteSafetyParams);
const disproportionate = { name: 'M4', percentOfTotalDrugRelated: 22, humanToAnimalExposureRatio: 3 };

describe('assessMetaboliteSafety', () => {
  it('does not place a metabolite with no stated exposure share below the threshold', () => {
    const r = assess({ metabolites: [{ name: 'M1' }] });
    const m1 = r.perMetabolite[0];
    expect(m1.classification, 'classification of a metabolite with no exposure share').toBe('not_assessed');
    expect(m1.exceedsThreshold).toBeNull();
    expect(m1.percentOfTotalDrugRelated).toBeNull();
    expect(r.qualificationTriggered).toBeNull();
    expect(r.notAssessed).toEqual(['M1']);
    expect(JSON.stringify(r)).not.toMatch(/undefined%|below the 10% MIST threshold/);
    expect(r.summary).toMatch(/not assessed/i);
    expect(r.summary).toContain('M1');
  });

  it('reads an empty list as no data, not as "no qualification triggered"', () => {
    const r = assess({ metabolites: [] });
    expect(r.qualificationTriggered).toBeNull();
    expect(r.summary).toBe('MIST: no metabolite data supplied; MIST not assessed.');
    expect(r.recommendedActions.join(' ')).not.toMatch(/qualification is triggered/);
  });

  it('does not read a non-number as a share', () => {
    for (const share of [null, 'ten', Number.NaN]) {
      const r = assess({ metabolites: [{ name: 'M2', percentOfTotalDrugRelated: share }] });
      expect(r.perMetabolite[0].classification, String(share)).toBe('not_assessed');
    }
  });

  it('still decides from stated shares', () => {
    const below = assess({ metabolites: [{ name: 'M3', percentOfTotalDrugRelated: 4 }] });
    expect(below.perMetabolite[0].classification).toBe('no_action');
    expect(below.qualificationTriggered).toBe(false);
    const above = assess({ metabolites: [disproportionate] });
    expect(above.perMetabolite[0].classification).toBe('qualification_needed');
    expect(above.qualificationTriggered).toBe(true);
  });

  it('keeps a stated qualification need and names the metabolite it could not assess', () => {
    const r = assess({ metabolites: [disproportionate, { name: 'M5' }] });
    expect(r.qualificationTriggered).toBe(true);
    expect(r.notAssessed).toEqual(['M5']);
    expect(r.summary).toContain('M5');
  });

  it('refuses a call with no metabolite list, naming it', () => {
    expect(() => assess({})).toThrow(/metabolites/);
  });

  it('tells AnA what not_assessed and a null verdict mean', () => {
    expect(ASSESS_METABOLITE_SAFETY.description.slice(0, 1024)).toMatch(/not_assessed/);
  });
});
