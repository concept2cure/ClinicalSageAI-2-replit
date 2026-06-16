/**
 * Bioequivalence requirements & BCS biowaiver expert — FDA & EMA.
 */

import { describe, it, expect } from 'vitest';
import {
  getBioequivalenceCriteria,
  getBcsBiowaiverEligibility,
  BE_REGIONS,
  BCS_CLASSES,
  type BeRegion,
  type BcsClass,
} from '../bioequivalence-requirements';

describe('getBioequivalenceCriteria', () => {
  it('models every region with sound acceptance criteria', () => {
    for (const region of BE_REGIONS) {
      const c = getBioequivalenceCriteria(region);
      expect(c.region).toBe(region);
      expect(c.acceptanceRange).toContain('80.00');
      expect(c.acceptanceRange).toContain('125.00');
      expect(c.confidenceLevel).toBe('90%');
      expect(c.parameters).toContain('Cmax');
      expect(c.citation).toBeTruthy();
      expect(c.typicalDesign).toBeTruthy();
      expect(c.highlyVariableApproach).toBeTruthy();
    }
  });

  it('FDA references the ANDA BE guidance / 21 CFR 320 and uses RSABE for HVDs', () => {
    const c = getBioequivalenceCriteria('FDA');
    expect(c.citation).toContain('320');
    expect(c.parameters).toEqual(['Cmax', 'AUC0-t', 'AUC0-∞']);
    expect(c.highlyVariableApproach).toContain('RSABE');
  });

  it('EMA references the BE guideline and uses ABEL for HVDs', () => {
    const c = getBioequivalenceCriteria('EMA');
    expect(c.citation).toContain('1401/98');
    expect(c.highlyVariableApproach).toContain('ABEL');
  });

  it('throws for an unmodeled region', () => {
    expect(() => getBioequivalenceCriteria('PMDA' as BeRegion)).toThrow();
  });

  it('is deterministic', () => {
    expect(getBioequivalenceCriteria('EMA')).toEqual(getBioequivalenceCriteria('EMA'));
  });
});

describe('getBcsBiowaiverEligibility', () => {
  it('models every BCS class with a citation', () => {
    for (const cls of BCS_CLASSES) {
      const e = getBcsBiowaiverEligibility(cls);
      expect(e.bcsClass).toBe(cls);
      expect(e.citation).toBeTruthy();
      expect(e.conditions.length).toBeGreaterThan(0);
    }
  });

  it('Class I is biowaiver eligible (high solubility, high permeability)', () => {
    const e = getBcsBiowaiverEligibility('I');
    expect(e.biowaiverEligible).toBe(true);
    expect(e.solubility).toBe('high');
    expect(e.permeability).toBe('high');
  });

  it('Class III is biowaiver eligible with a very-rapid-dissolution condition', () => {
    const e = getBcsBiowaiverEligibility('III');
    expect(e.biowaiverEligible).toBe(true);
    expect(e.solubility).toBe('high');
    expect(e.permeability).toBe('low');
    expect(e.conditions.some((c) => /very rapidly/i.test(c))).toBe(true);
  });

  it('Class II is NOT biowaiver eligible', () => {
    expect(getBcsBiowaiverEligibility('II').biowaiverEligible).toBe(false);
  });

  it('Class IV is NOT biowaiver eligible', () => {
    expect(getBcsBiowaiverEligibility('IV').biowaiverEligible).toBe(false);
  });

  it('throws for an unmodeled BCS class', () => {
    expect(() => getBcsBiowaiverEligibility('V' as BcsClass)).toThrow();
  });

  it('is deterministic', () => {
    expect(getBcsBiowaiverEligibility('I')).toEqual(getBcsBiowaiverEligibility('I'));
  });
});
