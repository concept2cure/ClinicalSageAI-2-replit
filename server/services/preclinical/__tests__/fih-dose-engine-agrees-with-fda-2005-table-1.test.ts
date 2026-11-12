/**
 * The first-in-human dose engine agrees with the published table it cites.
 *
 * ── Why this file exists (2026-11-12, slice N4 of
 * docs/design/NONCLINICAL_IB_WHAT_EXISTS_2026-11-12.md) ──────────────────────
 * The engine's own tests recompute its own formula (HED = NOAEL x animal Km /
 * human Km), so a wrong Km would pass them. AnA's in-scope compute_fih_dose and
 * calculate_safety_margin answer "engine: deterministic" with these numbers.
 *
 * FDA, "Guidance for Industry: Estimating the Maximum Safe Starting Dose in
 * Initial Clinical Trials for Therapeutics in Adult Healthy Volunteers" (July
 * 2005), Table 1 publishes, per species, the Km and the two rounded conversion
 * factors: "to convert animal dose in mg/kg to HED in mg/kg, either divide
 * animal dose by" a factor, "or multiply animal dose by" another. The table's
 * values below are transcribed from that guidance for an adult of 60 kg (human
 * Km 37). The engine's exact Km ratio must agree with each published factor to
 * the factor's own rounding. Its default safety factor is the guidance's 10.
 */
import { describe, it, expect } from 'vitest';

import { HUMAN_KM, computeFirstInHumanDose, computeHED, kmForSpecies } from '../fih-dose-engine';

/** FDA 2005, Table 1: species, Km, "divide animal dose by", "multiply animal dose by". */
const TABLE_1: Array<[species: string, km: number, divideBy: number, multiplyBy: number]> = [
  ['mouse', 3, 12.3, 0.08],
  ['hamster', 5, 7.4, 0.13],
  ['rat', 6, 6.2, 0.16],
  ['ferret', 7, 5.3, 0.19],
  ['guinea pig', 8, 4.6, 0.22],
  ['rabbit', 12, 3.1, 0.32],
  ['dog', 20, 1.8, 0.54],
  ['monkey', 12, 3.1, 0.32],
  ['marmoset', 6, 6.2, 0.16],
  ['squirrel monkey', 7, 5.3, 0.19],
  ['baboon', 20, 1.8, 0.54],
  ['micro-pig', 27, 1.4, 0.73],
  ['mini-pig', 35, 1.1, 0.95],
];

describe('FDA 2005 Table 1', () => {
  it('the human Km is 37 (60 kg adult)', () => {
    expect(HUMAN_KM).toBe(37);
  });

  it.each(TABLE_1)('%s: the engine\'s Km is the table\'s (%d)', (species, km) => {
    expect(kmForSpecies(species)).toBe(km);
  });

  it.each(TABLE_1)('%s (Km %d): HED agrees with "divide by %s" and "multiply by %s" to their rounding', (species, _km, divideBy, multiplyBy) => {
    const hed = computeHED(100, kmForSpecies(species) as number);
    // The published factors are rounded, and not always to the nearest: the hamster's 5/37 = 0.135 is printed
    // 0.13. So each is allowed one unit in its last printed place: a wrong Km is off by far more (the nearest
    // other Km, for the rat, would put the HED 17% away).
    expect(Math.abs(100 / hed - divideBy)).toBeLessThanOrEqual(0.1 + 1e-9);
    expect(Math.abs(hed / 100 - multiplyBy)).toBeLessThanOrEqual(0.01 + 1e-9);
  });

  it('a rat NOAEL of 50 mg/kg gives an HED of about 8 mg/kg and, by the default factor of 10, an MRSD of about 0.8 mg/kg', () => {
    const result = computeFirstInHumanDose({ speciesNoaels: [{ species: 'rat', noaelMgPerKg: 50 }] });
    expect(result.mrsd.hedBySpecies[0].hedMgPerKg).toBeCloseTo(8.1, 1);
    expect(result.mrsd.safetyFactor).toBe(10);
    expect(result.mrsd.mrsdMgPerKg).toBeCloseTo(0.81, 2);
  });

  it('the most sensitive species sets the dose, as the guidance asks (step 3)', () => {
    const result = computeFirstInHumanDose({ speciesNoaels: [{ species: 'rat', noaelMgPerKg: 50 }, { species: 'dog', noaelMgPerKg: 10 }] });
    // Dog HED 10 x 20/37 = 5.4 mg/kg is lower than rat 8.1 mg/kg.
    expect(result.mrsd.hedBySpecies[0].species.toLowerCase()).toContain('dog');
    expect(result.mrsd.mrsdMgPerKg).toBeCloseTo(0.54, 2);
  });
});
