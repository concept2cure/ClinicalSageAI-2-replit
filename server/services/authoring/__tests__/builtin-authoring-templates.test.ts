import { beforeAll, describe, expect, it } from 'vitest';
import { GLOBAL_REGISTRY, isDeviceRegistryEntry, isSharedPlanningRegistryEntry } from '../../../../shared/regulatory/global-document-registry';
import {
  DOCUMENT_TEMPLATES, getRegistryDocumentTemplate, getDocumentTemplate, componentTemplateIdForRegistry,
  type DocumentTemplateStructure,
} from '../../market-specs/document-template-library';
import { documentComponentContext, documentComponentRegion, resolveDocumentPreparationScope } from '../../market-specs/document-preparation';
import { searchTemplates } from '../../regulatory/templateCatalog';
import { getIndAuthoringTemplates, indTemplateSnapshot } from '../ind-authoring-templates';
import {
  builtinAuthoringTemplateId, builtinTemplateReference, builtinTemplateSnapshot,
  getBuiltinAuthoringTemplate, getBuiltinAuthoringTemplates, type BuiltinAuthoringTemplate,
} from '../builtin-authoring-templates';

const targets = GLOBAL_REGISTRY.filter(entry => entry.active && (entry.segment === 'pharma_biotech' || isDeviceRegistryEntry(entry) || isSharedPlanningRegistryEntry(entry))
  && ['US', 'CA', 'EU', 'JP', 'GLOBAL'].includes(entry.region));
const components = DOCUMENT_TEMPLATES.filter(outline => outline.families.length > 0);
let all: BuiltinAuthoringTemplate[];
beforeAll(async () => { all = await getBuiltinAuthoringTemplates(); });


/** The whole outline the projection carries: front matter, then each section and its subsections (second review, 2026-10-18). */
function everySection(outline: DocumentTemplateStructure): DocumentTemplateStructure['sections'] {
  const out: DocumentTemplateStructure['sections'] = [];
  const walk = (list: DocumentTemplateStructure['sections']) => { for (const s of list) { out.push(s); if (s.subsections?.length) walk(s.subsections); } };
  walk([...(outline.frontMatter ?? []), ...outline.sections]);
  return out;
}

describe('one builtin authoring projection', () => {
  it('preserves every IND source object and snapshot without added metadata', () => {
    for (const source of getIndAuthoringTemplates()) {
      const actual = all.find(template => template.id === source.id)!;
      expect(actual).toEqual(source);
      expect(actual.filingContext).toBeUndefined();
      expect(builtinTemplateSnapshot(actual)).toBe(indTemplateSnapshot(source));
    }
  });

  it('contains exactly the existing IND sources, selected registry rows, components and explicit leaflet gap', () => {
    expect(all).toHaveLength(getIndAuthoringTemplates().length + targets.length + components.length + 1);
    expect(new Set(all.map(template => template.id)).size).toBe(all.length);
    expect(new Set(all.map(template => template.entryId)).size).toBe(all.length);
    for (const template of all) {
      expect(template.sections.length).toBeGreaterThan(0);
      expect(new Set(template.sections.map(section => section.code)).size).toBe(template.sections.length);
      expect(template.sections.every(section => section.content === '')).toBe(true);
    }
  });

  it.each(targets)('projects the exact $id outline and regional identity', async entry => {
    const expected = await getRegistryDocumentTemplate(entry.id);
    const actual = all.find(template => template.entryId === `registry:${entry.id}`)!;
    expect(actual.id).toBe(builtinAuthoringTemplateId(`registry:${entry.id}`));
    expect(actual.name).toContain(`${entry.region} · `);
    expect(actual.filingContext).toEqual({ registryId: entry.id, region: entry.region, agency: entry.agency });
    expect(actual.sections.map(section => [section.code, section.title])).toEqual(
      everySection(expected!).map(section => [section.number, section.heading]),
    );
    for (const [index, section] of actual.sections.entries()) {
      expect(section.ordering).toBe(index);
      expect(section.guidance.guidance_text).toContain(everySection(expected!)[index].purpose);
      expect(section.guidance.regulatory_references).toContain(expected!.regulatoryBasis);
      expect(section.guidance.source_reference.length).toBeGreaterThan(0);
    }
    expect(actual.limitations.join(' ')).toContain(entry.productClass.join(', '));
    expect(actual.limitations.join(' ')).toMatch(/original forms.*datasets.*signed records.*technical messages/);
    if (!expected?.ctdSection) expect(actual.module).toBeNull();
    const componentId = componentTemplateIdForRegistry(entry.id);
    const exact = componentId && searchTemplates('').find(metadata => getDocumentTemplate(metadata.id)?.id === componentId);
    expect(actual.aiDraftable).toBe(Boolean(exact && exact.aiDraftable));
    expect(actual.kind).toBe(actual.aiDraftable ? 'narrative' : 'preparation');
    expect(builtinTemplateReference(actual).filingContext).toEqual(actual.filingContext);
    expect(builtinTemplateSnapshot(actual)).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each(components)('projects the existing $id document component with its source context', outline => {
    const actual = all.find(template => template.entryId === `component:${outline.id}`)!;
    expect(actual.filingContext).toEqual({ registryId: null, ...documentComponentContext(outline.id) });
    expect(actual.families).toEqual(outline.families);
    expect(actual.name).toContain(`${documentComponentRegion(outline.id)} · `);
    expect(actual.sections.map(section => [section.code, section.title])).toEqual(everySection(outline).map(section => [section.number, section.heading]));
    if (!outline.ctdSection) expect(actual.module).toBeNull();
  });

  it('does not turn ordinal headings, whole filings or cover letters into a Module 1 placement', () => {
    for (const entryId of ['registry:US_NDA', 'registry:CA_CTA', 'registry:JP_CTN', 'component:cover_letter', 'component:protocol']) {
      expect(all.find(template => template.entryId === entryId)?.module).toBeNull();
    }
    expect(all.find(template => template.entryId === 'component:quality_overall_summary')?.module).toBe('M2');
  });

  it('keeps the leaflet metadata gap explicit and preserves originals instead of copying SmPC headings', () => {
    const leaflet = all.find(template => template.entryId === 'component:pil')!;
    expect(leaflet.filingContext).toEqual({ registryId: null, region: 'EU', agency: 'EMA' });
    expect(leaflet.kind).toBe('preparation');
    expect(leaflet.aiDraftable).toBe(false);
    expect(leaflet.module).toBeNull();
    expect(leaflet.limitations.join(' ')).toMatch(/No indexed canonical PIL outline.*not a QRD leaflet or an SmPC copy/);
    expect(leaflet.sections.map(section => section.code)).toEqual(['preparation']);
  });

  it('resolves exact UUIDs case-insensitively, stays deterministic, and never resolves a filing label as a template', async () => {
    const sample = all.find(template => template.entryId === 'registry:JP_MKT_APPROVAL')!;
    expect(await getBuiltinAuthoringTemplate(sample.id.toUpperCase())).toEqual(sample);
    expect(builtinTemplateSnapshot((await getBuiltinAuthoringTemplate(sample.id))!)).toBe(builtinTemplateSnapshot(sample));
    expect(await getBuiltinAuthoringTemplate('US_NDA')).toBeUndefined();
    expect(await getBuiltinAuthoringTemplate('00000000-0000-0000-0000-000000000000')).toBeUndefined();
  });
});

describe('one component regional scope authority', () => {
  it.each(['smpc', 'impd', 'risk_management_plan', 'rmp', 'pil'])('retains EU scope for %s and refuses a conflicting market', templateId => {
    expect(documentComponentRegion(templateId)).toBe('EU');
    expect(resolveDocumentPreparationScope({ templateId, market: 'EU' }).market).toBe('EU');
    expect(() => resolveDocumentPreparationScope({ templateId, market: 'CA' })).toThrow(/EU document/);
  });

  it('keeps shared documents GLOBAL and allows a confirmed supported target market', () => {
    expect(documentComponentRegion('cover_letter')).toBe('GLOBAL');
    expect(resolveDocumentPreparationScope({ templateId: 'cover_letter', market: 'JP' }).market).toBe('JP');
  });
});
