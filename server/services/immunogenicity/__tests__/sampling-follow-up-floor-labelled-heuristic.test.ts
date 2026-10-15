/**
 * The sampling plan says which rule set the follow-up, and labels the 28-day
 * floor and the 8x / 12x half-life extensions as platform heuristics
 * (2026-10-15).
 *
 * What the code used to do: `followUp = Math.max(followUp, 28)` with the
 * comment "at least ~28 days for any biologic" and no source, and the 8x (high
 * tier) and 12x (non-redundant counterpart) multiples likewise. A product with
 * a 2-day half-life came back "follow-up extends to ≈ 28 days", and the
 * extended follow-up row put "≈ 168 days after the last dose" beside an EMA
 * 2017 citation, as though the guidance set the figure. No guidance in the
 * citation table sets any of the three.
 */
import { describe, expect, it } from 'vitest';
import { planImmunogenicitySampling, type ImmunogenicitySamplingParams } from '../immunogenicity-knowledge';

const plan = (p: Record<string, unknown>) =>
  planImmunogenicitySampling(p as unknown as ImmunogenicitySamplingParams);

const BASE = {
  halfLife_days: 21,
  riskTier: 'moderate',
  doseFrequency: 'intermittent',
  treatmentDuration_weeks: 12,
  endogenousNonRedundant: false,
  drawVolume_mL: 5,
};

describe('planImmunogenicitySampling: the follow-up basis is stated', () => {
  it('labels the 28-day floor a platform heuristic where it sets the follow-up', () => {
    const r = plan({ ...BASE, halfLife_days: 2, riskTier: 'low', doseFrequency: 'single' });

    expect(r.followUpDuration_days).toBe(28);
    expect(r.followUpBasis).toMatch(/28-day minimum/);
    expect(r.followUpBasis).toMatch(/platform heuristic/);
    expect(r.summary).toMatch(/≈ 28 days \(the 28-day minimum, a platform heuristic/);
  });

  it('labels the 8x and 12x extensions, on the row that carries the figure too', () => {
    const high = plan({ ...BASE, riskTier: 'high' });
    expect(high.followUpDuration_days).toBe(168);
    expect(high.followUpBasis).toMatch(/^8 half-lives .*platform heuristic/);
    const extended = high.timepoints.find((t) => t.label === 'Follow-up 2 (extended)');
    expect(extended?.timing).toMatch(/≈ 168 days after the last dose \(8 half-lives .*platform heuristic/);

    const endogenous = plan({ ...BASE, endogenousNonRedundant: true });
    expect(endogenous.followUpDuration_days).toBe(252);
    expect(endogenous.followUpBasis).toMatch(/^12 half-lives .*platform heuristic/);
  });

  it('does not call the 5-half-life washout a heuristic', () => {
    const r = plan(BASE);

    expect(r.followUpDuration_days).toBe(105);
    expect(r.followUpBasis).toBe('5 half-lives, the washout');
  });
});
