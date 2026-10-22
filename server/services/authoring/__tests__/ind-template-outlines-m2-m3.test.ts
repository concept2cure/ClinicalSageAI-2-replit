import { describe, expect, it } from 'vitest';
import { getAllINDSections, type INDSection } from '../../../../services/regulatory/ind-ectd-sections';
import { normalizeCtdCode } from '../../../../shared/regulatory/section-code';
import { CTD_AUTHORING_GUIDANCE } from '../../ind/ctd/authoring-guidance';
import { templateForCtdSection } from '../../market-specs/document-template-library';
import { buildModule2Or3Outline } from '../ind-template-outlines-m2-m3';

const canonical = getAllINDSections();
const moduleSections = canonical.filter(section => ['M2', 'M3'].includes(section.module) && section.depth > 0);
const section = (code: string): INDSection => canonical.find(section => section.code === code)!;
const outline = (code: string) => buildModule2Or3Outline(section(code));

describe('IND Module 2 and 3 templates are loadable from every canonical type', () => {
  it.each(['M2', 'M3'])('offers an exact editor template reference for every %s section', async module => {
    const { buildIndDocumentCatalog } = await import('../ind-document-catalog');
    const sections = buildIndDocumentCatalog().sections.filter(section => section.module === module);
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      expect(section).toHaveProperty('template.id', expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i));
    }
  });
});

describe('source-derived Module 2 and 3 working outlines', () => {
  it.each(moduleSections)('preserves $code as the exact first section, with empty facts and only its own descendants', selected => {
    const rows = buildModule2Or3Outline(selected);
    const code = normalizeCtdCode(selected.code)!;
    expect(rows[0]).toMatchObject({ code, title: selected.title, content: '', ordering: 100 });
    expect(rows.every(row => row.code === code || row.code.startsWith(`${code}.`) || row.code.startsWith(`${code}:work:`))).toBe(true);
    expect(new Set(rows.map(row => row.code)).size).toBe(rows.length);
    expect(rows.every(row => row.content === '' && row.guidance.guidance_text.includes('current IND stage'))).toBe(true);
    expect(rows.every(row => row.guidance.regulatory_references.length > 0 && row.guidance.source_reference)).toBe(true);
    expect(rows.map(row => row.ordering)).toEqual(rows.map((_, index) => (index + 1) * 100));
  });

  it('keeps all recorded QOS substance/product leaves and the recorded regional guidance', () => {
    const rows = outline('m2.3');
    expect(rows.map(row => row.code)).toEqual(expect.arrayContaining(['2.3.S.1', '2.3.S.7', '2.3.P.1', '2.3.P.8', '2.3.A', '2.3.R']));
    const s5 = rows.find(row => row.code === '2.3.S.5')!;
    expect(s5.guidance.guidance_text).toContain(section('m2.3.S.5').description);
    expect(s5.guidance.source_reference).toContain('ind-ectd-sections.ts#m2.3.S.5');
  });

  it('keeps all six recorded expert-report headings as local working identifiers under the exact 2.4 root', () => {
    const rows = outline('m2.4');
    const source = templateForCtdSection('2.4')!;
    expect(rows.map(row => row.code)).toEqual(['2.4', ...source.sections.map((_, index) => `2.4:work:${index + 1}`)]);
    expect(outline('m2').map(row => row.code)).toEqual(expect.arrayContaining(rows.map(row => row.code)));
    expect(rows.slice(1).map(row => row.title)).toEqual(source.sections.map(section => section.heading));
    source.sections.forEach((section, index) => {
      expect(rows[index + 1].guidance.guidance_text).toContain(section.purpose);
      expect(rows[index + 1].guidance.guidance_text).toContain('not a CTD filing node');
      expect(rows[index + 1].guidance.regulatory_references).toContain(source.regulatoryBasis);
      expect(rows[index + 1].guidance.source_reference).toContain(`document-template-library.ts#${source.id}`);
    });
    expect(rows.every(row => row.content === '')).toBe(true);
  });

  it('expands nonclinical written and tabulated scopes without manufacturing their tables or results', () => {
    const rows = outline('m2.6');
    expect(rows.map(row => row.code)).toEqual(expect.arrayContaining(['2.6.1', '2.6.2.1', '2.6.2.7', '2.6.3', '2.6.4', '2.6.5', '2.6.6', '2.6.7']));
    expect(rows.find(row => row.code === '2.6.3')!.guidance.compliance_checklist)
      .toEqual(expect.arrayContaining(CTD_AUTHORING_GUIDANCE['2.6.3'].expectedData!));
    expect(rows.every(row => row.content === '')).toBe(true);
  });

  it.each(['m2.5', 'm2.7'])('includes all six recorded clinical components of %s without importing another summary scope', code => {
    const root = normalizeCtdCode(code)!;
    expect(outline(code).map(row => row.code)).toEqual([root, ...Array.from({ length: 6 }, (_, index) => `${root}.${index + 1}`)]);
  });

  it('loads detailed substance controls and only the requested drug-product development scope', () => {
    expect(outline('m3.2.S.4').map(row => row.code)).toEqual(['3.2.S.4', '3.2.S.4.1', '3.2.S.4.2', '3.2.S.4.3', '3.2.S.4.4', '3.2.S.4.5']);
    const development = outline('m3.2.P.2').map(row => row.code);
    expect(development).toEqual(expect.arrayContaining(['3.2.P.2.1.1', '3.2.P.2.1.2', '3.2.P.2.2.3', '3.2.P.2.6']));
    expect(development).not.toContain('3.2.P.3');
    expect(development).not.toContain('3.2.S');
    expect(development).not.toContain('3.2.P.2.1');
  });

  it('retains complete canonical instructions, evidence requirements, pitfalls and reference provenance', () => {
    const rows = [...outline('m2'), ...outline('m3')];
    for (const source of Object.values(CTD_AUTHORING_GUIDANCE).filter(source => source.module === 2 || source.module === 3)) {
      const row = rows.find(row => row.code === source.code)!;
      expect(row, source.code).toBeDefined();
      expect(row.guidance.guidance_text).toContain(source.authoringGuidance);
      expect(row.guidance.compliance_checklist).toEqual(expect.arrayContaining([...source.keyContentElements, ...(source.expectedData ?? [])]));
      expect(row.guidance.common_pitfalls).toEqual(source.commonPitfalls ?? []);
      expect(row.guidance.regulatory_references).toContain(source.guidance);
      expect(row.guidance.source_reference).toContain(`authoring-guidance.ts#${source.code}`);
      expect(row.guidance.guidance_text).toContain('do not add required filing sections');
    }
  });

  it('uses the shared CTD order for substance, product, appendices and regional information', () => {
    for (const [root, prefix] of [['m2.3', '2.3'], ['m3', '3.2']]) {
      const codes = outline(root).map(row => row.code);
      expect(codes.indexOf(`${prefix}.S`)).toBeLessThan(codes.indexOf(`${prefix}.P`));
      expect(codes.indexOf(`${prefix}.P`)).toBeLessThan(codes.indexOf(`${prefix}.A`));
      expect(codes.indexOf(`${prefix}.A`)).toBeLessThan(codes.indexOf(`${prefix}.R`));
    }
  });

  it('returns independent guidance arrays without mutating source reference records', () => {
    const rows = outline('m3.2.S.4');
    rows[0].guidance.compliance_checklist.length = 0;
    rows[0].guidance.common_pitfalls.push('Altered working guidance');
    expect(outline('m3.2.S.4')[0].guidance.compliance_checklist.length).toBeGreaterThan(0);
    expect(CTD_AUTHORING_GUIDANCE['3.2.S.4'].commonPitfalls).not.toContain('Altered working guidance');
  });

  it('refuses unknown, malformed, foreign-module and mismatched scope instead of inventing an outline', () => {
    for (const selected of [section('m1.2'), { ...section('m2.3'), code: 'm2.999' }, { ...section('m2.3'), code: 'not-a-code' }, { ...section('m2.3'), code: 'm3.2.S' }]) {
      expect(buildModule2Or3Outline(selected)).toEqual([]);
    }
  });
});
