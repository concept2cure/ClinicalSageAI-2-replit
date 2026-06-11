/**
 * Tests for the sterilization requirements module.
 */
import { describe, it, expect } from 'vitest';
import { STERILIZATION_METHODS, sterilizationRequirements } from '../sterilization';

describe('sterilization methods', () => {
  it('maps each terminal method to its ISO standard and SAL 10⁻⁶', () => {
    const byId = Object.fromEntries(STERILIZATION_METHODS.map((m) => [m.id, m]));
    expect(byId['eo'].standard).toBe('ISO 11135');
    expect(byId['radiation'].standard).toBe('ISO 11137-1');
    expect(byId['steam'].standard).toBe('ISO 17665');
    for (const id of ['eo', 'radiation', 'steam', 'dry_heat', 'vh2o2'] as const) {
      expect(byId[id].terminal).toBe(true);
      expect(byId[id].sal).toMatch(/10⁻⁶/);
    }
  });

  it('aseptic processing is non-terminal with no SAL claim', () => {
    const aseptic = STERILIZATION_METHODS.find((m) => m.id === 'aseptic')!;
    expect(aseptic.terminal).toBe(false);
    expect(aseptic.sal).toMatch(/No terminal/i);
    expect(aseptic.standard).toBe('ISO 13408');
  });

  it('EO carries the residual standard (ISO 10993-7)', () => {
    const eo = STERILIZATION_METHODS.find((m) => m.id === 'eo')!;
    expect(eo.validationElements.some((e) => /10993-7/.test(e))).toBe(true);
  });
});

describe('sterilizationRequirements', () => {
  it('does not apply to a non-sterile device', () => {
    const r = sterilizationRequirements({ sterile: false });
    expect(r.applicable).toBe(false);
    expect(r.method).toBeUndefined();
  });

  it('resolves the method standard + packaging for a sterile device', () => {
    const r = sterilizationRequirements({ sterile: true, method: 'eo' });
    expect(r.applicable).toBe(true);
    expect(r.method?.standard).toBe('ISO 11135');
    expect(r.packagingStandard).toMatch(/ISO 11607/);
    expect(r.reviewerQuestions.some((q) => /SAL 10⁻⁶/.test(q))).toBe(true);
  });

  it('flags an unspecified method but still applies', () => {
    const r = sterilizationRequirements({ sterile: true });
    expect(r.applicable).toBe(true);
    expect(r.method).toBeUndefined();
    expect(r.notes.some((n) => /method not specified/i.test(n))).toBe(true);
  });
});
