/**
 * Unit tests for the first-in-human dose-justification engine.
 *
 * Pure module — no mocks. Validates the FDA 2005 HED/MRSD math, MABEL
 * derivation, most-conservative selection, species Km resolution, and the
 * failure modes that must not silently mis-scale a dose.
 */

import { describe, it, expect } from 'vitest';

import {
  computeFirstInHumanDose,
  computeHED,
  kmForSpecies,
  parseDoseMgPerKg,
  HUMAN_KM,
} from '../fih-dose-engine';

describe('kmForSpecies', () => {
  it('resolves canonical species', () => {
    expect(kmForSpecies('rat')).toBe(6);
    expect(kmForSpecies('dog')).toBe(20);
    expect(kmForSpecies('cynomolgus monkey')).toBe(12);
    expect(kmForSpecies('minipig')).toBe(35);
  });

  it('tolerates strain prefixes and casing', () => {
    expect(kmForSpecies('Sprague-Dawley Rat')).toBe(6);
    expect(kmForSpecies('Beagle dog')).toBe(20);
    expect(kmForSpecies('NHP')).toBe(12);
  });

  it('returns null for unknown species rather than guessing', () => {
    expect(kmForSpecies('axolotl')).toBeNull();
    expect(kmForSpecies(null)).toBeNull();
    expect(kmForSpecies('')).toBeNull();
  });
});

describe('parseDoseMgPerKg', () => {
  it('parses mg/kg and mg/kg/day', () => {
    expect(parseDoseMgPerKg('10 mg/kg/day')).toBe(10);
    expect(parseDoseMgPerKg('50 mg/kg')).toBe(50);
    expect(parseDoseMgPerKg('NOAEL = 12.5 mg/kg/day')).toBe(12.5);
  });

  it('refuses to convert a bare mg amount', () => {
    expect(parseDoseMgPerKg('200 mg total')).toBeNull();
    expect(parseDoseMgPerKg(null)).toBeNull();
  });
});

describe('computeHED', () => {
  it('scales by Km ratio (FDA 2005)', () => {
    // Rat NOAEL 10 mg/kg → HED = 10 × 6/37
    expect(computeHED(10, 6)).toBeCloseTo((10 * 6) / HUMAN_KM, 6);
  });
});

describe('computeFirstInHumanDose — MRSD path', () => {
  it('selects the most sensitive species and applies SF 10', () => {
    const result = computeFirstInHumanDose({
      speciesNoaels: [
        { species: 'rat', noaelMgPerKg: 10, studyRef: '13-wk rat' },
        { species: 'dog', noaelMgPerKg: 10, studyRef: '13-wk dog' },
      ],
    });

    // Rat HED (1.62) < dog HED (5.41), so rat is most sensitive.
    expect(result.mrsd.selectedSpecies).toBe('rat');
    expect(result.mrsd.hedBySpecies[0].species).toBe('rat');
    expect(result.mrsd.selectedHedMgPerKg).toBeCloseTo(1.6216, 3);
    expect(result.mrsd.safetyFactor).toBe(10);
    // MRSD mg/kg = 1.6216 / 10; total = × 60 kg ≈ 9.73 mg
    expect(result.mrsd.mrsdTotalMg).toBeCloseTo(9.732, 2);
    expect(result.limitedBy).toBe('MRSD');
    expect(result.recommendedStartingDoseMg).toBeCloseTo(9.732, 2);
  });

  it('honours a safety-factor override with rationale', () => {
    const result = computeFirstInHumanDose({
      speciesNoaels: [{ species: 'rat', noaelMgPerKg: 10 }],
      safetyFactor: 20,
      safetyFactorRationale: 'Steep dose-response and novel target.',
    });
    expect(result.mrsd.safetyFactor).toBe(20);
    expect(result.mrsd.safetyFactorRationale).toMatch(/novel target/);
    // Half of the SF-10 MRSD.
    expect(result.mrsd.mrsdTotalMg).toBeCloseTo(4.865, 2);
  });

  it('can force the most appropriate species away from the most sensitive', () => {
    const result = computeFirstInHumanDose({
      speciesNoaels: [
        { species: 'rat', noaelMgPerKg: 10 },
        { species: 'dog', noaelMgPerKg: 10 },
      ],
      mostAppropriateSpecies: 'dog',
    });
    expect(result.mrsd.selectedSpecies).toBe('dog');
    expect(result.mrsd.selectedHedMgPerKg).toBeCloseTo(5.4054, 3);
  });
});

describe('computeFirstInHumanDose — MABEL competes with MRSD', () => {
  it('is MABEL-limited when MABEL is the lower derivation', () => {
    // High NOAELs push MRSD well above the MABEL dose of 10 mg.
    const result = computeFirstInHumanDose({
      speciesNoaels: [{ species: 'dog', noaelMgPerKg: 30 }],
      mabel: {
        minAnticipatedEffectiveExposure: 10,
        exposurePerMgDose: 1,
        mabelSafetyFactor: 1,
        basis: '10% receptor occupancy from in vitro Kd + human popPK',
      },
    });
    expect(result.mabel?.mabelDoseMg).toBe(10);
    expect(result.mrsd.mrsdTotalMg).toBeGreaterThan(10);
    expect(result.limitedBy).toBe('MABEL');
    expect(result.recommendedStartingDoseMg).toBe(10);
    expect(result.rationale).toMatch(/MABEL-limited/);
  });

  it('is MRSD-limited when the MRSD is the lower derivation', () => {
    const result = computeFirstInHumanDose({
      speciesNoaels: [{ species: 'rat', noaelMgPerKg: 10 }],
      mabel: {
        minAnticipatedEffectiveExposure: 1000,
        exposurePerMgDose: 1,
      },
    });
    expect(result.mabel?.mabelDoseMg).toBe(1000);
    expect(result.limitedBy).toBe('MRSD');
    expect(result.recommendedStartingDoseMg).toBeCloseTo(9.732, 2);
  });

  it('applies a MABEL safety factor', () => {
    const result = computeFirstInHumanDose({
      speciesNoaels: [{ species: 'dog', noaelMgPerKg: 100 }],
      mabel: {
        minAnticipatedEffectiveExposure: 20,
        exposurePerMgDose: 1,
        mabelSafetyFactor: 2,
      },
    });
    // 20 / 1 / 2 = 10 mg
    expect(result.mabel?.mabelDoseMg).toBe(10);
  });
});

describe('computeFirstInHumanDose — failure modes', () => {
  it('throws when no species are supplied', () => {
    expect(() => computeFirstInHumanDose({ speciesNoaels: [] })).toThrow(/at least one species/);
  });

  it('skips species without a resolvable Km and warns', () => {
    const result = computeFirstInHumanDose({
      speciesNoaels: [
        { species: 'axolotl', noaelMgPerKg: 10 },
        { species: 'rat', noaelMgPerKg: 10 },
      ],
    });
    expect(result.warnings.some(w => /axolotl/.test(w))).toBe(true);
    expect(result.mrsd.selectedSpecies).toBe('rat');
  });

  it('throws when no species produce a usable HED', () => {
    expect(() =>
      computeFirstInHumanDose({ speciesNoaels: [{ species: 'axolotl', noaelMgPerKg: 10 }] }),
    ).toThrow(/no species produced a usable HED/);
  });

  it('accepts an explicit Km override for an unknown species', () => {
    const result = computeFirstInHumanDose({
      speciesNoaels: [{ species: 'transgenic mouse line X', noaelMgPerKg: 10, km: 3 }],
    });
    expect(result.mrsd.selectedHedMgPerKg).toBeCloseTo((10 * 3) / 37, 3);
  });
});
