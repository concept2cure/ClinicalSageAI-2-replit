/**
 * The EU SmPC section guard reads the one QRD catalog (g-smpc-qrd-one-record).
 *
 * Until 2026-10-05 the guard `plan_labeling_authoring` hands to
 * build_from_template and verify_docx_against_source held 18 of the SmPC's
 * headings. It had no 6.2, 6.3, 6.5, 6.6, 8, 9 or 10 and no top-level 4, 5 or
 * 6, so an SmPC with no shelf-life or container section was reported complete.
 * Six tables listed the SmPC sections and disagreed. This pins four of them to
 * the QRD catalog, `server/services/labeling/smpc-qrd-catalog.ts`. The sixth,
 * `server/services/global-ri/labeling-requirements.ts` LABELING_REQUIREMENTS.EMA,
 * still holds its own literals; it joins the source scan below when it reads
 * the catalog.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { checkSectionGuard, requiredSectionHeaders, buildTemplateReplacements } from '../labeling-authoring';
import * as catalog from '../../labeling/smpc-qrd-catalog';
import { STRUCTURE_SMPC } from '../labelingIntelligenceTools';
import { structureSmPC } from '../../labeling/labeling-intelligence-knowledge';

type CatalogApi = {
  SMPC_QRD_SECTIONS: Array<{ number: string; title: string; depth: number; radiopharmaceuticalOnly?: boolean }>;
  smpcQrdSections?: (opts?: { radiopharmaceutical?: boolean }) => CatalogApi['SMPC_QRD_SECTIONS'];
  qrdHeader?: (s: CatalogApi['SMPC_QRD_SECTIONS'][number]) => string;
  qrdGuardHeader?: (s: CatalogApi['SMPC_QRD_SECTIONS'][number]) => string;
  SMPC_QRD_BASIS?: { ref: string; confidence: string; url?: string };
};
const cat = catalog as unknown as CatalogApi;

/** The 18 headers the EU guard held at HEAD a425d1de, verbatim. */
const TRUNK_EU_18 = [
  '1. NAME OF THE MEDICINAL PRODUCT',
  '2. QUALITATIVE AND QUANTITATIVE COMPOSITION',
  '3. PHARMACEUTICAL FORM',
  '4.1 Therapeutic indications',
  '4.2 Posology and method of administration',
  '4.3 Contraindications',
  '4.4 Special warnings and precautions for use',
  '4.5 Interaction with other medicinal products and other forms of interaction',
  '4.6 Fertility, pregnancy and lactation',
  '4.7 Effects on ability to drive and use machines',
  '4.8 Undesirable effects',
  '4.9 Overdose',
  '5.1 Pharmacodynamic properties',
  '5.2 Pharmacokinetic properties',
  '5.3 Preclinical safety data',
  '6.1 List of excipients',
  '6.4 Special precautions for storage',
  '7. MARKETING AUTHORISATION HOLDER',
];

describe('EU SmPC section guard covers QRD sections 1-10', () => {
  it('does not report an SmPC with no shelf life, container or date of revision as complete', () => {
    const g = checkSectionGuard('eu', TRUNK_EU_18.join('\n'));
    expect(g.complete).toBe(false);
    expect(g.missing).toContain('6.3 Shelf life');
    expect(g.missing).toContain('6.5 Nature and contents of container');
    expect(g.missing).toContain('10. DATE OF REVISION OF THE TEXT');
    expect(g.missing).toContain('6.2 Incompatibilities');
    expect(g.missing).toContain('4. CLINICAL PARTICULARS');
    expect(g.missing).toContain('8. MARKETING AUTHORISATION NUMBER(S)');
  });

  it('takes its headers from the QRD catalog, sections 1-10 only', () => {
    expect(typeof cat.smpcQrdSections).toBe('function');
    expect(typeof cat.qrdGuardHeader).toBe('function');
    const fromCatalog = cat.smpcQrdSections!().map((s) => cat.qrdGuardHeader!(s));
    expect(requiredSectionHeaders('eu')).toEqual(fromCatalog);
    expect(fromCatalog).toHaveLength(28);
    const numbers = cat.smpcQrdSections!().map((s) => s.number);
    expect(numbers).not.toContain('11');
    expect(numbers).not.toContain('12');
  });

  it('keeps radiopharmaceutical sections 11 and 12 in the catalog, flagged and excluded by default', () => {
    const radio = cat.smpcQrdSections!({ radiopharmaceutical: true });
    const s11 = radio.find((s) => s.number === '11');
    const s12 = radio.find((s) => s.number === '12');
    expect(s11?.radiopharmaceuticalOnly).toBe(true);
    expect(s12?.radiopharmaceuticalOnly).toBe(true);
    expect(cat.qrdHeader!(s11!)).toBe('11. DOSIMETRY');
    expect(cat.SMPC_QRD_SECTIONS.map((s) => s.number)).not.toContain('11');
  });

  it('writes top-level headings as "N. UPPER CASE" and subsections as "N.N Sentence case"', () => {
    const byNumber = (n: string) => cat.SMPC_QRD_SECTIONS.find((s) => s.number === n)!;
    expect(cat.qrdHeader!(byNumber('6'))).toBe('6. PHARMACEUTICAL PARTICULARS');
    expect(cat.qrdHeader!(byNumber('6.3'))).toBe('6.3 Shelf life');
  });

  it('accepts the QRD forms of 6.6 (optional "<and other handling>") and 9 (no spaces around the slash)', () => {
    const draft = [
      '6.6 Special precautions for disposal',
      '9. DATE OF FIRST AUTHORISATION/RENEWAL OF THE AUTHORISATION',
    ].join('\n');
    const g = checkSectionGuard('eu', draft);
    const item = (n: string) => g.items.find((i) => i.number === n);
    expect(item('6.6')?.present).toBe(true);
    expect(item('9')?.present).toBe(true);
  });

  it('prints the full QRD heading in the scaffold while the guard accepts the short 6.6', () => {
    // The guard text and the scaffold text differ only where the QRD heading
    // carries optional bracketed text; the scaffold an author receives must
    // carry the record's heading, not the guard's relaxed one.
    const r = buildTemplateReplacements('eu', 'Examplumab');
    expect(r['{{SECTION_6_6}}']).toBe('6.6 Special precautions for disposal and other handling');
    expect(r['{{SECTION_6_3}}']).toBe('6.3 Shelf life');
    expect(r['{{SECTION_4}}']).toBe('4. CLINICAL PARTICULARS');
    expect(requiredSectionHeaders('eu')).toContain('6.6 Special precautions for disposal');
  });

  it('carries a basis for the headings: QRD v10.4 on an EMA URL, wording labelled recall', () => {
    expect(cat.SMPC_QRD_BASIS?.ref).toMatch(/QRD.*10\.4/);
    expect(cat.SMPC_QRD_BASIS?.url).toMatch(/^https:\/\/www\.ema\.europa\.eu\//);
    expect(cat.SMPC_QRD_BASIS?.confidence).toBe('recall');
  });
});

describe('structure_smpc says sections 1-10, with 11 and 12 for radiopharmaceuticals only', () => {
  it('no longer promises "12 numbered SmPC sections"', () => {
    expect(STRUCTURE_SMPC.description).not.toMatch(/12 numbered/);
    expect(STRUCTURE_SMPC.description).toMatch(/radiopharmaceutical/i);
  });

  it('labels its statements about the QRD template text as recall', () => {
    // The heading wording has not been read from the EMA PDF (SMPC_QRD_BASIS
    // is 'recall'), so tool output that describes the template says so.
    expect(STRUCTURE_SMPC.description).toMatch(/v10\.4[^.]*recall/i);
    const s6 = structureSmPC({ productType: 'medicinal_product', procedure: 'centralized' })
      .smpcSections.find((s) => s.sectionNumber === '6');
    const g66 = s6?.subsections?.find((s) => s.number === '6.6')?.guidance ?? '';
    expect(g66).toMatch(/other handling.*recall/i);
  });
});

describe('no second copy of the SmPC headings', () => {
  const root = path.resolve(__dirname, '../../../..');
  const files = [
    'server/services/ana/labeling-authoring.ts',
    'server/services/ana/labeling-structure.ts',
    'server/services/labeling/labeling-intelligence-knowledge.ts',
    'server/services/market-specs/document-template-library.ts',
  ];
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // A copy is a quoted SmPC section number and its title on the same row
  // (`number: '6.3', title: 'Shelf Life'`), or a header literal that carries
  // the number ('6.4 Special precautions for storage').
  const copiesIn = (src: string) =>
    cat.SMPC_QRD_SECTIONS.filter((s) => {
      const t = esc(s.title).replace(/\\? ?\/ ?/g, ' ?/ ?');
      // nosemgrep: detect-non-literal-regexp -- a test: the section number is escaped (esc) and t is built from the template table
      const row = new RegExp(
        `['"\`]${esc(s.number)}['"\`],?[^\\n]*(?:\\n[^\\n]*)?(?:label|title|heading|header|sectionTitle)\\s*:\\s*['"\`]${t}['"\`]`,
        'i',
      );
      // nosemgrep: detect-non-literal-regexp -- a test: the section number is escaped (esc) and t is built from the template table
      const header = new RegExp(`['"\`]${esc(s.number)}\\.?\\s+${t}['"\`]`, 'i');
      return row.test(src) || header.test(src);
    }).map((s) => s.number);

  for (const f of files) {
    it(`${f} holds no SmPC section title of its own`, () => {
      const src = readFileSync(path.join(root, f), 'utf8');
      expect(copiesIn(src)).toEqual([]);
    });
  }
});
