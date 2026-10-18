import { describe, expect, it } from 'vitest';
import { buildIndDocumentCatalog } from '../../authoring/ind-document-catalog';
import { documentSectionRequirements, indPyramidRequirements, RESULT_BUDGET, GET_DOCUMENT_SECTION_REQUIREMENTS } from '../regulatory-knowledge-tools';
import type { IndDocumentCatalog } from '../../../../shared/authoring/ind-document-catalog';
import { normalizeCtdCode } from '../../../../shared/regulatory/section-code';

function walk(catalog = buildIndDocumentCatalog(), section?: string) {
  let offset = 0;
  const entries: Array<Record<string, unknown>> = [];
  const pages: Array<Record<string, any>> = [];
  for (let n = 0; n < 1000; n++) {
    const raw = indPyramidRequirements({ document: 'ind_pyramid', offset, limit: 40, ...(section ? { section } : {}) }, catalog);
    expect(raw.length).toBeLessThanOrEqual(RESULT_BUDGET);
    const page = JSON.parse(raw);
    expect(page.error).toBeUndefined();
    expect(page.status).toBeUndefined();
    expect(page.offset).toBe(offset);
    expect(page.returned).toBe(page.entries.length);
    pages.push(page);
    entries.push(...page.entries);
    if (page.nextOffset === null) return { entries, pages };
    expect(page.nextOffset).toBe(offset + page.entries.length);
    expect(page.nextOffset).toBeGreaterThan(offset);
    offset = page.nextOffset;
  }
  throw new Error('Catalogue did not terminate');
}

describe('AnA reads the same complete IND catalogue as the existing editor', () => {
  it('walks every canonical entry once, through the last phase, within the serialized budget', () => {
    const catalog = buildIndDocumentCatalog();
    const { entries, pages } = walk(catalog);
    expect(entries.map(e => e.id).sort()).toEqual([...catalog.deliverables, ...catalog.sections].map(e => e.id).sort());
    expect(new Set(entries.map(e => e.id)).size).toBe(entries.length);
    expect(pages[0].phases).toHaveLength(catalog.phases.length);
    expect(entries.some(e => e.phaseId === catalog.phases.at(-1)!.id)).toBe(true);
    expect(pages[0].counts).toEqual({ phases: catalog.phases.length, deliverables: catalog.deliverables.length, sections: catalog.sections.length, matchingEntries: entries.length });
    expect(pages[0].note).toMatch(/not project inventory, completion, readiness or approval/);
    expect(pages.length).toBeGreaterThan(1);
  });

  it('preserves official-form and dataset authoring limits instead of declaring them narrative drafts', () => {
    const { entries } = walk();
    const forms = entries.filter(e => String(e.title).includes('1571') || String(e.title).includes('1572') || String(e.title).includes('3674'));
    expect(forms.length).toBeGreaterThan(3);
    expect(forms.every(e => e.aiDraftable === false)).toBe(true);
    const section = entries.find(e => e.kind === 'section' && e.title === 'Form FDA 1571');
    expect(section?.authoringMode).toBe('form');
    expect(section?.regulatoryRef).toBeTruthy();
  });

  it('filters a phase or CTD section without losing page cursor semantics', () => {
    const catalog = buildIndDocumentCatalog();
    const last = catalog.phases.at(-1)!.id;
    expect(walk(catalog, last).entries.every(e => e.phaseId === last)).toBe(true);
    const sections = walk(catalog, '3.2.S.4').entries.filter(e => e.kind === 'section');
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.every(e => normalizeCtdCode(String(e.code)) === '3.2.S.4' || normalizeCtdCode(String(e.code))?.startsWith('3.2.S.4.'))).toBe(true);
  });

  it('shrinks complete escaped rows to fit, marks clipped descriptions, and still visits every id', () => {
    const catalog: IndDocumentCatalog = globalThis.structuredClone(buildIndDocumentCatalog());
    const long = '"\\\n'.repeat(1000);
    catalog.sections.forEach(s => { s.title = long; s.regulatoryRef = long; });
    catalog.deliverables.forEach(d => { d.title = long; d.description = long; });
    const { entries, pages } = walk(catalog);
    expect(entries).toHaveLength(catalog.sections.length + catalog.deliverables.length);
    expect(entries.every(e => e.titleClipped)).toBe(true);
    expect(pages[0].returned).toBeLessThan(40);
  });

  it('rejects invalid filters and cursors, and routes through the existing tool identity', () => {
    for (const input of [
      { section: 'phase99' }, { section: '9.9.9' }, { section: 3 },
      { offset: -1 }, { offset: 1.5 }, { offset: '20' }, { offset: 999999 },
      { limit: 0 }, { limit: 41 }, { limit: '20' },
    ]) {
      expect(JSON.parse(documentSectionRequirements({ document: 'ind_pyramid', ...input })).error).toBeTruthy();
    }
    expect(GET_DOCUMENT_SECTION_REQUIREMENTS.name).toBe('get_document_section_requirements');
    expect(GET_DOCUMENT_SECTION_REQUIREMENTS.description).toContain('document="ind_pyramid"');
    const page = JSON.parse(documentSectionRequirements({ document: 'ind_pyramid', limit: 1 }));
    expect(page.entries).toHaveLength(1);
    expect(page.recordOrigin).toContain('services/regulatory/pyramids/ind-pyramid.ts');
  });
});
