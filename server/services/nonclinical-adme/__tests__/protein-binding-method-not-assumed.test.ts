/**
 * assessProteinBinding (AnA tool assess_protein_binding) does not say how the
 * binding was measured when nobody said (2026-10-15).
 *
 * method defaulted to 'equilibrium_dialysis', so data whose method was never
 * given came back as "Plasma protein binding by equilibrium_dialysis: human fu
 * = 0.05", and the non-specific-binding correction owed to ultrafiltration or
 * ultracentrifugation values was left out. A call with no species data threw a
 * TypeError instead of asking for them.
 */
import { describe, expect, it } from 'vitest';
import { assessProteinBinding, type AssessProteinBindingParams } from '../nonclinical-adme-knowledge';

const HUMAN = [{ species: 'human', fractionUnbound: 0.05 }];

describe('assessProteinBinding', () => {
  it('does not name a method that was not stated', () => {
    const r = assessProteinBinding({ speciesData: HUMAN });
    expect(r.method, 'method reported when none was stated').toBeNull();
    expect(r.summary).not.toMatch(/equilibrium_dialysis/);
    expect(r.summary).toMatch(/method not stated/);
    expect(r.methodGuidance.join(' ')).toMatch(/not stated/);
  });

  it('reports a stated method', () => {
    const r = assessProteinBinding({ speciesData: HUMAN, method: 'ultrafiltration' });
    expect(r.method).toBe('ultrafiltration');
    expect(r.summary).toMatch(/by ultrafiltration/);
  });

  it('asks for species data rather than failing on their absence', () => {
    expect(() => assessProteinBinding({} as AssessProteinBindingParams)).toThrow(/speciesData/);
  });
});
