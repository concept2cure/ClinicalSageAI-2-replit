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

  it.each([
    ['1,000 mg/kg/day', 1000],
    ['NOAEL: 1,250.5 mg/kg', 1250.5],
    ['1e3 mg/kg', 1000],
    ['1E-3 mg/kg/day', 0.001],
    ['+2.5e+2 mg/kg', 250],
    ['.5 mg/kg/day', 0.5],
    ['  NOAEL = 0 mg / kg / day  ', 0],
  ])('reads the complete unambiguous numeric dose %s', (text, dose) => {
    expect(parseDoseMgPerKg(text)).toBe(dose);
  });

  it.each([
    '-10 mg/kg/day',
    '−10 mg/kg/day',
    '-1e-3 mg/kg',
    '1,5 mg/kg',
    '12,34 mg/kg',
    '1.2.3 mg/kg',
    '1e mg/kg',
    '1e999 mg/kg',
    '1e-999 mg/kg',
    '10–20 mg/kg',
    '>= 10 mg/kg/day',
    'NOAEL was not established at 10 mg/kg/day',
    '10 mg/kg/day caused adverse effects',
    '10 mg/kg/day in rats; 5 mg/kg/day in dogs',
    '10 mg/kg/hour',
    '10 mg/kg/day (approximately)',
  ])('refuses ambiguous, malformed, negative, or out-of-range dose text %s', text => {
    expect(parseDoseMgPerKg(text)).toBeNull();
  });
});

describe('computeHED', () => {
  it('scales by Km ratio (FDA 2005)', () => {
    // Rat NOAEL 10 mg/kg → HED = 10 × 6/37
    expect(computeHED(10, 6)).toBeCloseTo((10 * 6) / HUMAN_KM, 6);
  });

  it.each([0, -1, NaN, Infinity, -Infinity, null, '6'])('refuses invalid Km %s', km => {
    expect(() => computeHED(10, km as number)).toThrow(/Km must be/);
  });

  it.each([-1, NaN, Infinity, -Infinity, null, '10'])('refuses invalid NOAEL %s', noael => {
    expect(() => computeHED(noael as number, 6)).toThrow(/NOAEL must be/);
  });

  it('refuses non-finite and underflowed HED results from finite inputs', () => {
    expect(() => computeHED(Number.MAX_VALUE, Number.MAX_VALUE)).toThrow(/HED must be/);
    expect(() => computeHED(Number.MIN_VALUE, 1)).toThrow(/HED must be/);
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
    // MRSD total = (10 × 6/37) / 10 × 60 kg ≈ 9.72973 mg.
    expect(result.mrsd.mrsdTotalMg).toBeCloseTo(9.72973, 5);
    expect(result.limitedBy).toBe('MRSD');
    expect(result.recommendedStartingDoseMg).toBeCloseTo(9.72973, 5);
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
    expect(result.mrsd.mrsdTotalMg).toBeCloseTo(4.864865, 5);
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
    expect(result.rationale).not.toMatch(/most sensitive/);
  });

  it('does not round intermediate derivations into a higher starting dose', () => {
    const result = computeFirstInHumanDose({
      speciesNoaels: [{ species: 'rat', noaelMgPerKg: 10 }],
    });
    expect(result.mrsd.selectedHedMgPerKg).toBeCloseTo(60 / 37, 12);
    expect(result.mrsd.mrsdMgPerKg).toBeCloseTo(6 / 37, 12);
    expect(result.recommendedStartingDoseMg).toBeCloseTo(360 / 37, 12);
  });

  it('selects the lower HED even when both would round to the same displayed value', () => {
    const result = computeFirstInHumanDose({
      speciesNoaels: [
        { species: 'larger', noaelMgPerKg: 0.0003, km: 1 },
        { species: 'smaller', noaelMgPerKg: 0.0002, km: 1 },
      ],
    });
    expect(result.mrsd.selectedSpecies).toBe('smaller');
    expect(result.mrsd.hedBySpecies[0].hedMgPerKg).toBeLessThan(result.mrsd.hedBySpecies[1].hedMgPerKg);
    expect(result.recommendedStartingDoseMg).toBeGreaterThan(0);
  });

  it('does not overflow an otherwise representable result while formatting decimals', () => {
    const result = computeFirstInHumanDose({
      speciesNoaels: [{ species: 'rat', noaelMgPerKg: 1e305, km: 37 }],
      safetyFactor: 1,
      humanReferenceWeightKg: 1,
    });
    expect(result.recommendedStartingDoseMg).toBe(1e305);
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
    expect(result.recommendedStartingDoseMg).toBeCloseTo(9.72973, 5);
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

  it('retains small positive derivations and selects MABEL before any display rounding', () => {
    const result = computeFirstInHumanDose({
      speciesNoaels: [{ species: 'rat', noaelMgPerKg: 0.0004, km: 37 }],
      safetyFactor: 1,
      humanReferenceWeightKg: 1,
      mabel: { minAnticipatedEffectiveExposure: 0.0003, exposurePerMgDose: 1 },
    });
    expect(result.mrsd.mrsdTotalMg).toBe(0.0004);
    expect(result.mabel?.mabelDoseMg).toBe(0.0003);
    expect(result.recommendedStartingDoseMg).toBe(0.0003);
    expect(result.limitedBy).toBe('MABEL');
  });

  it('preserves an explicitly supplied zero exposure instead of substituting a positive dose', () => {
    const result = computeFirstInHumanDose({
      speciesNoaels: [{ species: 'rat', noaelMgPerKg: 10 }],
      mabel: { minAnticipatedEffectiveExposure: 0, exposurePerMgDose: 1 },
    });
    expect(result.recommendedStartingDoseMg).toBe(0);
    expect(result.limitedBy).toBe('MABEL');
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

describe('computeFirstInHumanDose — invalid calculation parameters', () => {
  it.each([0, -1, NaN, Infinity, -Infinity, null, '60'])('refuses invalid reference weight %s', weight => {
    expect(() => computeFirstInHumanDose({
      speciesNoaels: [{ species: 'rat', noaelMgPerKg: 10 }],
      humanReferenceWeightKg: weight as number,
    })).toThrow(/humanReferenceWeightKg must be/);
  });

  it.each([0, -1, NaN, Infinity, -Infinity, null, '10'])('refuses invalid safety factor %s', factor => {
    expect(() => computeFirstInHumanDose({
      speciesNoaels: [{ species: 'rat', noaelMgPerKg: 10 }],
      safetyFactor: factor as number,
    })).toThrow(/safetyFactor must be/);
  });

  it.each([0, -1, NaN, Infinity, -Infinity, null, '6'])('refuses invalid explicit Km %s without a fallback', km => {
    expect(() => computeFirstInHumanDose({
      speciesNoaels: [
        { species: 'rat', noaelMgPerKg: 10, km: km as number },
        { species: 'dog', noaelMgPerKg: 10 },
      ],
    })).toThrow(/Km must be/);
  });

  it.each([-1, NaN, Infinity, -Infinity, null, '10'])('refuses invalid NOAEL %s without dropping that study', noael => {
    expect(() => computeFirstInHumanDose({
      speciesNoaels: [
        { species: 'rat', noaelMgPerKg: noael as number },
        { species: 'dog', noaelMgPerKg: 10 },
      ],
    })).toThrow(/NOAEL must be/);
  });

  it.each(['rabbit', '', ' ', null])('refuses an unusable explicit most-appropriate species %s', species => {
    expect(() => computeFirstInHumanDose({
      speciesNoaels: [{ species: 'rat', noaelMgPerKg: 10 }],
      mostAppropriateSpecies: species as string,
    })).toThrow(/mostAppropriateSpecies must be/);
  });

  it('does not replace a requested unresolved species with another species', () => {
    expect(() => computeFirstInHumanDose({
      speciesNoaels: [
        { species: 'axolotl', noaelMgPerKg: 10 },
        { species: 'rat', noaelMgPerKg: 10 },
      ],
      mostAppropriateSpecies: 'axolotl',
    })).toThrow(/mostAppropriateSpecies must be/);
  });
});

describe('computeFirstInHumanDose — invalid MABEL parameters', () => {
  it.each([-1, NaN, Infinity, -Infinity, null, '10'])('refuses invalid MABEL exposure %s', exposure => {
    expect(() => computeFirstInHumanDose({
      speciesNoaels: [{ species: 'rat', noaelMgPerKg: 10 }],
      mabel: { minAnticipatedEffectiveExposure: exposure as number, exposurePerMgDose: 1 },
    })).toThrow(/minAnticipatedEffectiveExposure must be/);
  });

  it.each([0, -1, NaN, Infinity, -Infinity, null, '1'])('refuses invalid MABEL exposure-per-dose factor %s', factor => {
    expect(() => computeFirstInHumanDose({
      speciesNoaels: [{ species: 'rat', noaelMgPerKg: 10 }],
      mabel: { minAnticipatedEffectiveExposure: 10, exposurePerMgDose: factor as number },
    })).toThrow(/exposurePerMgDose must be/);
  });

  it.each([0, -1, NaN, Infinity, -Infinity, null, '1'])('refuses invalid MABEL safety factor %s', factor => {
    expect(() => computeFirstInHumanDose({
      speciesNoaels: [{ species: 'rat', noaelMgPerKg: 10 }],
      mabel: { minAnticipatedEffectiveExposure: 10, exposurePerMgDose: 1, mabelSafetyFactor: factor as number },
    })).toThrow(/mabelSafetyFactor must be/);
  });
});

describe('computeFirstInHumanDose — numeric range', () => {
  it.each([
    { safetyFactor: Number.MIN_VALUE },
    { humanReferenceWeightKg: Number.MAX_VALUE },
  ])('refuses overflowed MRSD results from finite parameters %j', parameters => {
    expect(() => computeFirstInHumanDose({
      speciesNoaels: [{ species: 'rat', noaelMgPerKg: 100 }],
      ...parameters,
    })).toThrow(/MRSD.*must be/);
  });

  it.each([
    { minAnticipatedEffectiveExposure: Number.MAX_VALUE, exposurePerMgDose: Number.MIN_VALUE },
    { minAnticipatedEffectiveExposure: 1, exposurePerMgDose: 1, mabelSafetyFactor: Number.MIN_VALUE },
    { minAnticipatedEffectiveExposure: Number.MIN_VALUE, exposurePerMgDose: 10 },
  ])('refuses overflowed or underflowed MABEL results from finite parameters %j', mabel => {
    expect(() => computeFirstInHumanDose({
      speciesNoaels: [{ species: 'rat', noaelMgPerKg: 10 }],
      mabel,
    })).toThrow(/MABEL.*must be/);
  });

  it('refuses an underflowed MRSD instead of reporting a zero dose', () => {
    expect(() => computeFirstInHumanDose({
      speciesNoaels: [{ species: 'rat', noaelMgPerKg: Number.MIN_VALUE, km: 37 }],
    })).toThrow(/MRSD.*must be/);
  });
});
