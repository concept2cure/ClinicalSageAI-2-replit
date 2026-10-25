import { describe, expect, it } from 'vitest';
import { getAllINDSections, type INDSection } from '../../../../services/regulatory/ind-ectd-sections';
import { normalizeCtdCode } from '../../../../shared/regulatory/section-code';
import { CTD_AUTHORING_GUIDANCE } from '../../ind/ctd/authoring-guidance';
import { getDocumentTemplate } from '../../market-specs/document-template-library';
import { ctdRecordSubtree } from '../../market-specs/ctd-component-outlines';
import { ichHeadingTitle } from '../../ind/ctd/ich-m4-headings';
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
    // One record (2026-10-25): every row, the root included, is a heading of the ICH M2–M5
    // record, numbered and titled as the record holds it — never a working identifier.
    expect(rows[0]).toMatchObject({ code, title: ichHeadingTitle(code), content: '', ordering: 100 });
    expect(rows.map(row => row.code)).toEqual([code, ...ctdRecordSubtree(code).map(h => h.code)]);
    expect(rows.every(row => row.title === ichHeadingTitle(row.code))).toBe(true);
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

  it("holds 2.4's six ICH M4S headings as its own rows, with the outline's own purposes, not as working identifiers", () => {
    const rows = outline('m2.4');
    expect(rows.map(row => row.code)).toEqual(['2.4', '2.4.1', '2.4.2', '2.4.3', '2.4.4', '2.4.5', '2.4.6']);
    expect(rows.some(row => row.code.includes(':work:'))).toBe(false);
    const served = getDocumentTemplate('nonclinical_overview')!.sections;
    for (const s of served) expect(rows.find(row => row.code === s.number)!.guidance.guidance_text, s.number).toContain(s.purpose);
    expect(rows.find(row => row.code === '2.4.2')!.guidance.source_reference).toContain('ich-m4-headings.ts#2.4.2');
    expect(outline('m2').map(row => row.code)).toEqual(expect.arrayContaining(rows.map(row => row.code)));
    expect(rows.every(row => row.content === '')).toBe(true);
  });

  it('the QOS holds its substance, product and appendix headings from the record (they were held only in the IND list)', () => {
    const codes = outline('m2.3').map(row => row.code);
    for (const c of ['2.3.S.1', '2.3.S.7', '2.3.P.1', '2.3.P.8', '2.3.A.1', '2.3.A.2', '2.3.A.3']) expect(codes, c).toContain(c);
    expect(outline('m2.3').find(row => row.code === '2.3.P.1')!.title).toBe('Description and Composition of the Drug Product');
  });

  it('expands nonclinical written and tabulated scopes without manufacturing their tables or results', () => {
    const rows = outline('m2.6');
    expect(rows.map(row => row.code)).toEqual(expect.arrayContaining(['2.6.1', '2.6.2.1', '2.6.2.7', '2.6.3', '2.6.4', '2.6.5', '2.6.6', '2.6.7']));
    expect(rows.find(row => row.code === '2.6.3')!.guidance.compliance_checklist)
      .toEqual(expect.arrayContaining(CTD_AUTHORING_GUIDANCE['2.6.3'].expectedData!));
    expect(rows.every(row => row.content === '')).toBe(true);
  });

  it.each(['m2.5', 'm2.7'])('%s carries the record to its depth (2.5.6.1–2.5.6.5, 2.7.4.2.1.5), and no other summary scope', code => {
    const root = normalizeCtdCode(code)!;
    const codes = outline(code).map(row => row.code);
    expect(codes).toEqual([root, ...ctdRecordSubtree(root).map(h => h.code)]);
    expect(codes).toContain(root === '2.5' ? '2.5.6.4' : '2.7.4.2.1.5');
    expect(codes.every(c => c === root || c.startsWith(`${root}.`))).toBe(true);
  });

  it('loads detailed substance controls and only the requested drug-product development scope', () => {
    expect(outline('m3.2.S.4').map(row => row.code)).toEqual(['3.2.S.4', '3.2.S.4.1', '3.2.S.4.2', '3.2.S.4.3', '3.2.S.4.4', '3.2.S.4.5']);
    const development = outline('m3.2.P.2').map(row => row.code);
    expect(development).toEqual(expect.arrayContaining(['3.2.P.2.1.1', '3.2.P.2.1.2', '3.2.P.2.2.3', '3.2.P.2.6']));
    expect(development).not.toContain('3.2.P.3');
    expect(development).not.toContain('3.2.S');
    // The leaves' structural parents are the record's headings too (added 2026-10-09); before the
    // projector read the record they were dropped, and 3.2.P.2.1.1 had no parent heading.
    expect(development.indexOf('3.2.P.2.1')).toBeLessThan(development.indexOf('3.2.P.2.1.1'));
    expect(development.indexOf('3.2.P.2.2')).toBeLessThan(development.indexOf('3.2.P.2.2.1'));
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
