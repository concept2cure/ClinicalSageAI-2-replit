/**
 * The Authoring picker's document holds the outline the governed pack holds
 * (second review, 2026-10-18).
 *
 * builtin-authoring-templates projected only an outline's top-level sections.
 * The pack minted from the same outline carries its front matter and
 * subsections, so a PBRER started from the picker had no title page, executive
 * summary or 16.2, and a PAS no 3.2.P under Updated CTD Sections, while the
 * project's governed document had them.
 */
import { describe, expect, it } from 'vitest';
import { builtinAuthoringTemplateId, getBuiltinAuthoringTemplate } from '../builtin-authoring-templates';
import { registryDocumentTemplateCoverage } from '../../market-specs/document-template-library';
import { filingClassPackSections } from '../../c2c/filing-class-packs';

const codes = async (registryId: string) =>
  (await getBuiltinAuthoringTemplate(builtinAuthoringTemplateId(`registry:${registryId}`)))?.sections.map((s) => s.code) ?? [];

describe('the picker carries the whole outline', () => {
  it.each([
    ['EU_PSUR', 'psur'],
    ['US_NDA_SUPP', 'pas'],
    ['US_CBE', 'cbe'],
  ])('%s: the picker document holds every node of the %s pack, in order', async (registryId, docType) => {
    const pack = (await filingClassPackSections(docType)).map((r) => r.key);
    expect(await codes(registryId)).toEqual(pack);
  });

  it('section order is the outline order, front matter first', async () => {
    const t = await getBuiltinAuthoringTemplate(builtinAuthoringTemplateId('registry:EU_PSUR'));
    expect(t?.sections.slice(0, 3).map((s) => s.code)).toEqual(['title_page', 'executive_summary', '1']);
    expect(t?.sections.map((s) => s.ordering)).toEqual(t?.sections.map((_, i) => i));
  });
});

describe('a coverage row names only the outline it serves', () => {
  it('a lifecycle-record or component outline reports no blueprint id', async () => {
    const rows = await registryDocumentTemplateCoverage();
    const row = (id: string) => rows.find((r) => r.registryId === id);
    expect(row('US_TYPE_B_MEETING')?.blueprintId).toBeUndefined();
    expect(row('US_TYPE_B_MEETING')?.outlineSource).toEqual({ kind: 'lifecycle-record', registryId: 'US_TYPE_B_MEETING', record: 'FDA_MEETING_PACKAGE_CORE' });
    expect(row('ICH_QOS')?.blueprintId).toBeUndefined();
    // A blueprint that is served is still named.
    expect(row('US_ORPHAN')?.blueprintId).toBe('us_orphan_sections');
  });
});
