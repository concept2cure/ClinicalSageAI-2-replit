/**
 * The assess_plr_structure tool description claims only what assessPLRStructure
 * does (2026-10-15).
 *
 * What the code used to do: the description told AnA the tool "identifies when a
 * Boxed Warning, REMS, or Medication Guide section is mandatory". It takes no REMS
 * or Medication Guide input and says nothing about either; only hasBoxedWarning
 * decides anything boxed (whether the Highlights boxed warning, H.1, is required).
 * At 1,099 characters it was also past the 1,024 that OpenAI-compatible providers
 * keep (server/services/ai-gateway/gateway.ts trims the rest).
 */
import { describe, it, expect } from 'vitest';
import { ASSESS_PLR_STRUCTURE } from '../../ana/labelingIntelligenceTools';
import { assessPLRStructure } from '../labeling-intelligence-knowledge';

const OPENAI_MAX_TOOL_DESCRIPTION_CHARS = 1024;
const { description } = ASSESS_PLR_STRUCTURE;

describe('assess_plr_structure description', () => {
  it('does not claim to decide when a REMS or Medication Guide is mandatory', () => {
    expect(description, 'claims a REMS / Medication Guide determination it has no input for').not.toMatch(/REMS, or Medication\s+Guide section is mandatory/);
    expect(description).toMatch(/no REMS or Medication Guide input/);
    const props = Object.keys(ASSESS_PLR_STRUCTURE.input_schema.properties as Record<string, unknown>);
    expect(props.filter((p) => /rems|medication/i.test(p))).toEqual([]);
  });

  it('says what hasBoxedWarning decides, as the engine does', () => {
    expect(description).toMatch(/hasBoxedWarning decides whether the Highlights boxed warning \(H\.1\) is required/);
    const h1 = assessPLRStructure({ productType: 'prescription_drug', applicationType: 'NDA', hasBoxedWarning: true })
      .highlightsStructure.find((s) => s.sectionNumber === 'H.1');
    expect(h1?.required).toBe(true);
  });

  it('fits under the 1,024-character tool-description limit', () => {
    expect(description.length).toBeLessThan(OPENAI_MAX_TOOL_DESCRIPTION_CHARS);
  });
});
