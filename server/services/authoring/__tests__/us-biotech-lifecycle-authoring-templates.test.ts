import { describe, expect, it } from 'vitest';
import { builtinAuthoringTemplateId, getBuiltinAuthoringTemplate } from '../builtin-authoring-templates';

const SUBTYPES = [
  ['pre_ind_meeting', 8], ['end_of_phase_2_meeting', 9], ['pre_nda_meeting', 9], ['pre_bla_meeting', 10],
  ['ind_protocol_amendment', 4], ['ind_information_amendment', 4], ['ind_cmc_amendment', 4],
  ['ind_response_to_clinical_hold', 4], ['cbe_30', 5], ['cbe_0', 6], ['iss', 7], ['ise', 6],
] as const;

describe('exact existing US lifecycle records reach the single editor', () => {
  it.each(SUBTYPES)('resolves retained source identity for %s with its actual parts', async (record, count) => {
    const entryId = `component:us_lifecycle_${record}`;
    const template = await getBuiltinAuthoringTemplate(builtinAuthoringTemplateId(entryId));
    expect(template, `The exact ${record} working document is absent from editor starts`).toBeDefined();
    expect(template!.entryId).toBe(entryId);
    expect(template!.filingContext).toEqual({ registryId: null, region: 'US', agency: 'FDA' });
    expect(template!.sections).toHaveLength(count);
    expect(template!.sections.every(section => section.content === '')).toBe(true);
    expect(template!.sections.every(section => section.guidance.source_reference ===
      `lifecycle-component:LIFECYCLE_DOCUMENT_TYPES:${record}`)).toBe(true);
    expect(template!.aiDraftable).toBe(true);
  });

  it('keeps an EOP2 package distinct from the pre-BLA package and CBE variants apart', async () => {
    const load = (record: string) => getBuiltinAuthoringTemplate(builtinAuthoringTemplateId(`component:us_lifecycle_${record}`));
    const [eop, bla, thirty, immediate] = await Promise.all([
      load('end_of_phase_2_meeting'), load('pre_bla_meeting'), load('cbe_30'), load('cbe_0'),
    ]);
    expect(eop?.sections.map(section => section.code)).toContain('MTG-STATS');
    expect(eop?.sections.map(section => section.code)).not.toContain('MTG-QUAL');
    expect(bla?.sections.map(section => section.code)).toContain('MTG-QUAL');
    expect(bla?.sections.map(section => section.code)).toContain('MTG-MFG');
    expect(thirty?.sections.map(section => section.code)).toContain('CBE30-CHANGE');
    expect(immediate?.sections.map(section => section.code)).toContain('CBE0-SAFETY');
    expect(thirty?.id).not.toBe(immediate?.id);
  });
});
