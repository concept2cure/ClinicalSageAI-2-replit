/**
 * designToxicokinetics and designReactionPhenotyping (AnA tools
 * design_toxicokinetics and design_reaction_phenotyping) assume no unstated
 * input (2026-10-15).
 *
 * designToxicokinetics read an unstated useSatelliteGroup as false and wrote
 * "Main-study animals are sampled for TK"; with no species it threw a TypeError
 * (or, for a rodent study type, wrote "in undefined"), and with no route it
 * wrote "Route: undefined.". designReactionPhenotyping defaulted
 * metabolismMajorClearance to true, which overrode a stated fractionMetabolic:
 * at 0.1, below the 0.25 cut-off, phenotyping was still 'warranted'.
 */
import { describe, expect, it } from 'vitest';
import {
  designReactionPhenotyping,
  designToxicokinetics,
  type DesignReactionPhenotypingParams,
  type DesignToxicokineticsParams,
} from '../nonclinical-adme-knowledge';

const tk = (p: unknown) => designToxicokinetics(p as DesignToxicokineticsParams);
const rp = (p: unknown) => designReactionPhenotyping(p as DesignReactionPhenotypingParams);
const RAT = { studyType: 'repeat_dose_rodent', species: 'rat', route: 'oral' };

describe('designToxicokinetics', () => {
  it('does not say main-study animals are sampled when nobody said', () => {
    const text = tk(RAT).designConsiderations.join(' ');
    expect(text, 'design considerations with useSatelliteGroup unstated').not.toMatch(/^Main-study animals are sampled for TK/);
    expect(text).toMatch(/useSatelliteGroup\) was not stated/);
  });

  it('keeps a stated choice', () => {
    expect(tk({ ...RAT, useSatelliteGroup: false }).designConsiderations[0]).toMatch(/^Main-study animals are sampled for TK/);
    expect(tk({ ...RAT, useSatelliteGroup: true }).designConsiderations[0]).toMatch(/^Satellite \(TK\) animals are used/);
  });

  it('refuses a design with no study type, species or route', () => {
    expect(() => tk({}), 'TK design with nothing stated').toThrow(/studyType.*species.*route/);
    expect(() => tk({ studyType: 'repeat_dose_rodent', route: 'oral' })).toThrow(/species/);
    expect(() => tk({ studyType: 'repeat_dose_rodent', species: 'rat' })).toThrow(/route/);
  });
});

describe('designReactionPhenotyping', () => {
  it('lets a stated metabolic fraction below 0.25 decide, not an unstated default', () => {
    const r = rp({ fractionMetabolic: 0.1 });
    expect(r.warranted, 'warranted with fractionMetabolic 0.1 and metabolismMajorClearance unstated').toBe(false);
    expect(r.summary).toMatch(/limited in scope/);
  });

  it('still warrants phenotyping when metabolism is stated to be the major route', () => {
    expect(rp({ fractionMetabolic: 0.1, metabolismMajorClearance: true }).warranted).toBe(true);
    expect(rp({ fractionMetabolic: 0.4 }).warranted).toBe(true);
  });
});
