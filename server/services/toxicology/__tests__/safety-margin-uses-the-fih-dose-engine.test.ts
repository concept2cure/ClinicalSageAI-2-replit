/** Rule 2 audit S4: one HED/MRSD engine, with stated exposure margins retained. */
import { describe, expect, it } from 'vitest';
import { calculateSafetyMargin } from '../toxicology-knowledge';
import { computeFirstInHumanDose } from '../../preclinical/fih-dose-engine';

describe('calculateSafetyMargin uses the canonical FIH dose calculation', () => {
  it('refuses an unknown species instead of reporting a computed zero dose', () => {
    expect(() => calculateSafetyMargin({ noaelMgKg: 30, species: 'axolotl' }))
      .toThrow(/species must be supported/i);
  });

  it('uses the same custom safety factor, body weight and rounding as computeFirstInHumanDose', () => {
    const canonical = computeFirstInHumanDose({
      speciesNoaels: [{ species: 'dog', noaelMgPerKg: 29 }],
      safetyFactor: 7,
      humanReferenceWeightKg: 75,
    });
    const out = calculateSafetyMargin({ noaelMgKg: 29, species: 'dog', additionalSafetyFactor: 7, humanBodyWeightKg: 75 });
    expect(out.hed).toBe(canonical.mrsd.selectedHedMgPerKg);
    expect(out.mrsd).toBe(canonical.mrsd.mrsdMgPerKg);
    expect(out.safetyFactor).toBe(canonical.mrsd.safetyFactor);
    expect(out.calculations[2].result).toBe(Math.round(canonical.mrsd.mrsdTotalMg * 100) / 100);
  });

  it.each([
    ['minipig', 'minipig'],
    ['micropig', 'micro-pig'],
    ['guinea_pig', 'guinea pig'],
    ['Gottingen', 'minipig'],
    ['Sprague-Dawley', 'rat'],
    ['rhesus', 'rhesus monkey'],
    ['Beagle dog', 'dog'],
  ])('resolves %s through the canonical %s species without another Km table', (supplied, canonicalSpecies) => {
    const canonical = computeFirstInHumanDose({ speciesNoaels: [{ species: canonicalSpecies, noaelMgPerKg: 30 }] });
    const out = calculateSafetyMargin({ species: supplied, noaelMgKg: 30 });
    expect(out.hed).toBe(canonical.mrsd.selectedHedMgPerKg);
    expect(out.mrsd).toBe(canonical.mrsd.mrsdMgPerKg);
  });

  it('refuses a nonpositive safety factor rather than producing a non-finite dose', () => {
    expect(() => calculateSafetyMargin({ noaelMgKg: 30, species: 'dog', additionalSafetyFactor: 0 }))
      .toThrow(/safetyFactor must be > 0/);
  });

  it('reports the applied HED/MRSD safety factor as the dose margin, not a species conversion factor', () => {
    const out = calculateSafetyMargin({ noaelMgKg: 30, species: 'dog', additionalSafetyFactor: 20 });
    expect(out.safetyMargin).toBe(20);
    expect(out.safetyMargin).toBe(out.safetyFactor);
  });

  it('preserves the AUC and Cmax margins and low-exposure warnings', () => {
    const out = calculateSafetyMargin({
      noaelMgKg: 30,
      species: 'dog',
      animalAuc: 80,
      humanProjectedAuc: 20,
      animalCmax: 30,
      humanProjectedCmax: 10,
    });
    expect(out.aucMargin).toBe(4);
    expect(out.cmaxMargin).toBe(3);
    expect(out.warnings.some(w => /AUC-based safety margin.*below/.test(w))).toBe(true);
    expect(out.warnings.some(w => /Cmax-based safety margin.*below/.test(w))).toBe(true);
    expect(out.calculations.find(step => step.step === 'AUC-based safety margin')?.result).toBe(4);
    expect(out.calculations.find(step => step.step === 'Cmax-based safety margin')?.result).toBe(3);
  });
});
