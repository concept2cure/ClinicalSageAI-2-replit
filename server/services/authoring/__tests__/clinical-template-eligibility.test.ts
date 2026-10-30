import { describe, expect, it } from 'vitest';
import { getTemplatesForType, searchTemplates } from '../../regulatory/templateCatalog';
import { builtinAuthoringTemplateId, getBuiltinAuthoringTemplate } from '../builtin-authoring-templates';
import { documentComponentContext, resolveDocumentPreparationScope } from '../../market-specs/document-preparation';
import { clinicalSectionDraftingMode } from '../document-template-outline-sections';

const clinical = ['protocol', 'investigators_brochure', 'statistical_analysis_plan', 'informed_consent', 'dsur', 'pbrer'];
const manual: Record<string, string[]> = {
  protocol: ['title_page', 'table_of_contents', '1.2', '1.3'], investigators_brochure: ['table_of_contents'],
  informed_consent: ['10'], dsur: ['7', 'appendices'], pbrer: ['6', '6.2', '6.3', '20'],
};
const get = (id: string) => getBuiltinAuthoringTemplate(builtinAuthoringTemplateId(`component:${id}`));

describe('source-supported clinical document starts', () => {
  it.each(clinical)('offers exact narrative metadata and an empty editable %s template', async id => {
    expect(searchTemplates('').find(row => row.id === id)).toMatchObject({ id, aiDraftable: true });
    const template = await get(id);
    expect(template).toMatchObject({ kind: 'narrative', aiDraftable: true, authoringMode: 'ai_draft' });
    expect(template!.sections.every(row => row.content === '')).toBe(true);
    const section = template!.sections.find(row => row.code === (id === 'protocol' ? '1.1' : '1'))!;
    expect(section.guidance.drafting_mode).toBe('narrative');
  });

  it.each(['US_IND', 'US_NDA', 'US_BLA', 'US_505B2', 'US_351K'])('offers clinical working documents for %s without using an unknown-type fallback', registryId => {
    const available = getTemplatesForType(registryId).map(row => row.id);
    for (const id of clinical) expect(available).toContain(id);
    expect(new Set(available).size).toBe(available.length);
  });

  it.each(Object.entries(manual))('retains explicit source preparation for %s original record sections', async (id, codes) => {
    const template = await get(id);
    for (const code of codes) {
      const row = template!.sections.find(section => section.code === code);
      expect(row, `${id}:${code}`).toBeDefined();
      expect(row!.guidance.drafting_mode).toBe('manual');
      expect(row!.guidance.guidance_text).toMatch(/original|source|generated|signature/i);
    }
  });

  it.each(['US_IND', 'US_NDA', 'US_BLA', 'US_351K', 'US_505B2'])('keeps the whole %s filing as a mixed preparation workspace', async id => {
    expect(await getBuiltinAuthoringTemplate(builtinAuthoringTemplateId(`registry:${id}`)))
      .toMatchObject({ aiDraftable: false, kind: 'preparation', authoringMode: 'manual' });
  });
});

describe('exact US lifecycle scope and preserved device scope', () => {
  it.each(['JP', 'CA'] as const)('refuses a US lifecycle component targeted at %s', market => {
    expect(documentComponentContext('us_lifecycle_iss')).toEqual({ region: 'US', agency: 'FDA' });
    expect(() => resolveDocumentPreparationScope({ templateId: 'us_lifecycle_iss', market })).toThrow(/US document/);
  });

  it('retains the US scope and existing device-specific refusal', () => {
    expect(resolveDocumentPreparationScope({ templateId: 'us_lifecycle_iss', market: 'US' })).toMatchObject({ market: 'US' });
    expect(documentComponentContext('k510_summary')).toEqual({ region: 'US', agency: 'FDA' });
    expect(() => resolveDocumentPreparationScope({ templateId: 'k510_summary', market: 'JP' })).toThrow(/US document/);
    expect(documentComponentContext('us_lifecycle_unrecorded')).toEqual({ region: 'GLOBAL', agency: 'ICH' });
  });

  it('does not assign narrative eligibility to an unknown component identity', () => {
    expect(clinicalSectionDraftingMode('unknown', '1')).toBe('manual');
  });
});
