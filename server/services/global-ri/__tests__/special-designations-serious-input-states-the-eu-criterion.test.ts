/**
 * The seriousOrLifeThreatening input of global_ri_special_designations is
 * described as the criterion the engine applies with it (2026-10-15).
 *
 * What the code used to do: the tool told AnA the input meant "Life-threatening /
 * seriously debilitating condition", while the only criterion it decides — the EU
 * orphan prevalence limb, Regulation (EC) No 141/2000, as DESIGNATION_REFERENCE
 * states it — reads "life-threatening or chronically debilitating". A seriously but
 * not chronically debilitating condition could be answered true and screened
 * eligible on a criterion it does not meet.
 */
import { describe, it, expect } from 'vitest';
import { GLOBAL_RI_CORE_TOOL_SPECS } from '../ana-tools-specs-core';
import { DESIGNATION_REFERENCE } from '../special-designations';

const props = (name: string) =>
  GLOBAL_RI_CORE_TOOL_SPECS.find((t) => t.name === name)!.input_schema.properties as Record<string, { description: string }>;

describe('global_ri_special_designations seriousOrLifeThreatening', () => {
  it('names the EU orphan criterion text the engine holds', () => {
    expect(DESIGNATION_REFERENCE.EMA.orphanCriteria).toMatch(/life-threatening or chronically debilitating/);
    const description = props('global_ri_special_designations').seriousOrLifeThreatening.description;
    expect(description, 'the input said "seriously debilitating"').not.toMatch(/seriously debilitating/i);
    expect(description).toMatch(/life-threatening or chronically debilitating/i);
    expect(description).toMatch(/141\/2000/);
  });
});
