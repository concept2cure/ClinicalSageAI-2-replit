/**
 * ICH M7(R2) §7.3 — the concentration limit is the acceptable intake divided
 * by the maximum daily dose: µg/day over g/day is µg/g, which IS ppm. The
 * engine multiplied by a further 1000 and so stated every limit a thousand
 * times too high; the register-facing assessment caught it because the
 * guideline's own worked figure (1.5 µg/day at 0.5 g/day → 3 ppm) came out as
 * 3000 ppm.
 */
import { describe, expect, it } from 'vitest';

import { calculateTTC, controlMutagenicImpurity } from '../mutagenic-impurity-knowledge';

describe('calculateTTC — concentration limit', () => {
  it('states 1.5 ppm for the lifetime TTC at a 1 g/day dose (ICH M7(R2) §7.3)', () => {
    const r = calculateTTC({ treatmentDuration: 'lifetime', route: 'oral', compoundClass: 'not_coc', maxDailyDoseG: 1 });
    expect(r.acceptableIntakeUgPerDay).toBe(1.5);
    expect(r.concentrationLimitPpm).toBe(1.5);
  });

  it('scales with the dose: 0.5 g/day → 3 ppm; 0.01 g/day → 150 ppm', () => {
    expect(calculateTTC({ treatmentDuration: 'lifetime', route: 'oral', compoundClass: 'not_coc', maxDailyDoseG: 0.5 }).concentrationLimitPpm).toBe(3);
    expect(calculateTTC({ treatmentDuration: 'lifetime', route: 'oral', compoundClass: 'not_coc', maxDailyDoseG: 0.01 }).concentrationLimitPpm).toBe(150);
  });

  it('stages the intake by treatment duration (M7 Table 2) and carries it into the limit', () => {
    const month = calculateTTC({ treatmentDuration: 'up_to_1_month', route: 'oral', compoundClass: 'not_coc', maxDailyDoseG: 0.5 });
    expect(month.acceptableIntakeUgPerDay).toBe(120);
    expect(month.concentrationLimitPpm).toBe(240);
  });

  it('states no concentration limit without a dose, rather than a figure', () => {
    expect(calculateTTC({ treatmentDuration: 'lifetime', route: 'oral', compoundClass: 'not_coc' }).concentrationLimitPpm).toBeNull();
  });

  it('the control-strategy specification limit uses the same formula', () => {
    const r = controlMutagenicImpurity({
      impurityClass: 2,
      drugProductType: 'oral solid dosage',
      treatmentDuration: 'lifetime',
      developmentPhase: 'commercial',
      compoundClass: 'not_coc',
      maxDailyDoseG: 0.5,
    });
    expect(r.specificationLimit.concentrationLimitPpm).toBe(3);
  });
});
