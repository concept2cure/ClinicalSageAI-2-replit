import { describe, expect, it } from 'vitest';
import { builtinAuthoringTemplateId, getBuiltinAuthoringTemplate } from '../builtin-authoring-templates';
import { documentComponentContext, resolveDocumentPreparationScope } from '../../market-specs/document-preparation';
import { NONCLINICAL_STUDY_REPORT_STRUCTURE } from '../nonclinical-study-report-structure';

const get = (id: string) => getBuiltinAuthoringTemplate(builtinAuthoringTemplateId(`component:${id}`));

describe('source-supported CMC working narrative', () => {
  it.each([
    ['drug_substance', '3.2.S.1', '3.2.S.4.5', '3.2.S.4.1', '3.2.S.2'],
    ['drug_product', '3.2.P.2', '3.2.P.5.6', '3.2.P.1', '3.2.P.3'],
  ])('permits only canonical narrative rows of %s', async (id, first, second, table, mixed) => {
    const template = await get(id);
    expect(template).toMatchObject({ aiDraftable: true, kind: 'narrative' });
    for (const code of [first, second]) expect(template!.sections.find(row => row.code === code)!.guidance.drafting_mode).toBe('narrative');
    for (const code of [table, mixed]) expect(template!.sections.find(row => row.code === code)!.guidance.drafting_mode).toBe('manual');
    expect(template!.limitations.join(' ')).toContain('small-molecule US IND');
    expect(template!.sections.every(row => row.content === '')).toBe(true);
  });

  it('retains whole Module 3 as mixed preparation', async () => {
    const { getIndAuthoringTemplates } = await import('../ind-authoring-templates');
    expect(getIndAuthoringTemplates().find(row => row.entryId === 'module:M3')).toMatchObject({ aiDraftable: false, kind: 'preparation' });
  });
});

describe('existing source records reach exact medicinal working documents', () => {
  it('loads US prescribing information with unconfirmed boxed warning and original sources', async () => {
    const template = await get('us_prescribing_information');
    expect(template).toBeDefined();
    expect(template!.filingContext).toEqual({ registryId: null, region: 'US', agency: 'FDA' });
    expect(template!.sections.find(row => row.code === 'H.3')).toMatchObject({ title: 'Indications and Usage', guidance: { drafting_mode: 'narrative' } });
    expect(template!.sections.find(row => row.code === 'BW')).toMatchObject({ guidance: { drafting_mode: 'manual' } });
    expect(template!.sections.find(row => row.code === 'BW')!.guidance.guidance_text).toMatch(/unconfirmed|undetermined/i);
    for (const code of ['source_records', 'contents']) expect(template!.sections.find(row => row.code === code)!.guidance.drafting_mode).toBe('manual');
    expect(template!.limitations.join(' ')).toMatch(/SPL/);
    expect(documentComponentContext('us_prescribing_information')).toEqual({ region: 'US', agency: 'FDA' });
    expect(() => resolveDocumentPreparationScope({ templateId: 'us_prescribing_information', market: 'JP' })).toThrow(/US document/);
  });

  it('loads the existing seven nonclinical parts without substituting a signed source report', async () => {
    const template = await get('nonclinical_study_report');
    expect(template).toBeDefined();
    expect(template!.sections.map(row => [row.code, row.title])).toEqual(NONCLINICAL_STUDY_REPORT_STRUCTURE.map(row => [row.number, row.title]));
    for (const row of template!.sections) expect(row.guidance.drafting_mode).toBe(['1', '7'].includes(row.code) ? 'manual' : 'narrative');
    expect(template!.limitations.join(' ')).toMatch(/signed|GLP/);
    expect(template!.module).toBeNull();
  });
});
