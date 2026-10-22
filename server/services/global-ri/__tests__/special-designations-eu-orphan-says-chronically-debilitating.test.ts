/**
 * The EU orphan screen states the criterion it applies: "life-threatening or
 * chronically debilitating" (Regulation (EC) No 141/2000 Art 3(1)(a)).
 *
 * What it used to say (until 2026-10-15): its rationale and its unmet-criterion
 * text read "seriously debilitating" — the wording of other EU instruments
 * (conditional MA, PRIME), not the orphan criterion the engine decides. The
 * input description was corrected the same day; these strings were not.
 */
import { describe, expect, it } from 'vitest';
import { assessDesignationEligibility } from '../special-designations';

describe('EMA orphan screen wording', () => {
  it('a met prevalence limb is described as chronically debilitating', () => {
    const r = assessDesignationEligibility({ market: 'EMA', euPrevalencePer10k: 3, seriousOrLifeThreatening: true, noSatisfactoryTreatment: true });
    expect(r.orphan.rationale).toMatch(/chronically debilitating/);
    expect(r.orphan.rationale).not.toMatch(/seriously debilitating/);
  });

  it('a condition stated not to meet it is described as not chronically debilitating', () => {
    const r = assessDesignationEligibility({ market: 'EMA', euPrevalencePer10k: 3, seriousOrLifeThreatening: false, noSatisfactoryTreatment: true });
    expect(r.orphan.rationale).toMatch(/not life-threatening\/chronically debilitating/);
  });
});
