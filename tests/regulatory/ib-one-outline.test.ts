/**
 * AnA drafts an Investigator's Brochure to the one IB outline the platform
 * holds (D2, 2026-10-15).
 *
 * Measured at 5fc8ad1ba before the change: chat drafting ("draft an
 * investigator's brochure", server/services/ana-ri/document-templates.ts)
 * told the model it MUST use its own headings — "3. Physical, Chemical, and
 * Pharmaceutical Properties" without "and Formulation", a mandatory
 * "References" chapter E6 does not define — while the open-document brief and
 * get_document_template give the library outline (ICH E6(R3) Appendix A). The
 * legacy /api/concept2cure/templates IND IB served "6. Guidance for
 * Investigators" and ctdSection 5.3, though a US IND files the IB at M1
 * 1.14.4.1.
 */
import { describe, it, expect } from 'vitest';
import { getDocumentTemplate } from '../../server/services/market-specs/document-template-library';
import { DOCUMENT_TEMPLATES as CHAT_TEMPLATES } from '../../server/services/ana-ri/document-templates';

const canonical = getDocumentTemplate('investigators_brochure')!;
const canonicalHeadings = canonical.sections.map((s) => `${s.number}. ${s.heading}`);

describe("the IB AnA drafts in chat is the platform's one IB outline", () => {
  const chat = CHAT_TEMPLATES.ind_investigator_brochure;

  it('has exactly the canonical headings, in order', () => {
    expect(chat.sections.map((s) => s.heading)).toEqual(canonicalHeadings);
  });

  it('cites the outline basis (ICH E6(R3) Appendix A), labelled as recall', () => {
    expect(chat.regulatoryReferences.join(' ')).toMatch(/ICH E6\(R3\) Appendix A/);
    expect(chat.regulatoryReferences.join(' ')).toMatch(/recall/);
  });
});

describe('the legacy IND IB template', () => {
  it('renders the canonical headings and files at M1 1.14.4.1', async () => {
    const { legacyIbTemplate } = await import('../../server/routes/concept2cure-ib-template');
    const t = legacyIbTemplate();
    for (const h of canonicalHeadings) expect(t.content).toContain(`## ${h}`);
    expect(t.content).not.toMatch(/Guidance for Investigators\n/);
    expect(t.ctdSection).toBe('1.14.4.1');
  });
});

/*
 * Second slice, 2026-10-15 (measured at 3d8e30a41): the IB builder titled
 * section 3 its own way; the Authoring "Start from" seed used sentence-case
 * copies; the Projects blueprint stamped module 5 on an IB (the registry files
 * a US IB at M1) and called itself "ICH E6 §7" (superseded R2 numbering); the
 * medical-writing advisor and the IND question flow listed the IB without an
 * Introduction or with headings of their own.
 */
describe('every IB tree a client reaches carries the canonical body headings', () => {
  const byNumber = new Map(canonical.sections.map((s) => [s.number, s.heading]));

  it('the IB builder (Investigator’s Brochure surface)', async () => {
    const { IB_STRUCTURE } = await import('../../server/services/authoring/ib-builder');
    for (const s of IB_STRUCTURE.filter((x) => byNumber.has(x.number))) expect(s.title).toBe(byNumber.get(s.number));
  });

  it('the Authoring "Start from" seed', async () => {
    const { SEED_TEMPLATES } = await import('../../server/services/intelligence/template-seeds');
    const ib = SEED_TEMPLATES.find((t) => t.templateCode === 'crossagency_ib')!;
    expect(ib.sections.map((s) => [s.sectionCode, s.sectionTitle])).toEqual(canonical.sections.map((s) => [s.number, s.heading]));
    expect(ib.sourceReference).toMatch(/recall/);
  });

  it('the Projects blueprint is not module 5 and does not cite E6 §7', async () => {
    const { SECTION_BLUEPRINTS } = await import('../../shared/regulatory/project-bootstrap');
    const bp = SECTION_BLUEPRINTS.ich_ib_sections;
    expect(bp.name).not.toMatch(/E6 §7/);
    expect(bp.sections.every((s) => s.module !== 5)).toBe(true);
  });

  it('the medical-writing advisor and the IND question flow list the canonical headings', async () => {
    const { getDocumentTypeStandard } = await import('../../server/services/ana/medical-writing');
    const ib = getDocumentTypeStandard('ib')!;
    for (const h of canonical.sections.map((s) => s.heading)) expect(ib.structure).toContain(h);
    const src = (await import('node:fs')).readFileSync(require('node:path').resolve(__dirname, '../../server/services/ana/intelligence-questions/flows/ind-submission.ts'), 'utf8');
    expect(src).toMatch(/investigators_brochure/);
  });
});

/*
 * Third slice, 2026-10-15 (the library's 24-hour hold lapsed): the canonical
 * IB outline had no E6 front matter and no sub-sections, so the IB builder
 * kept its own (4.1–4.3, 5.1–5.3); the M4E clinical overview outline lacked
 * 2.5.7 Literature References.
 */
describe('the canonical outline carries the IB front matter and sub-sections', () => {
  it('front matter: title page, confidentiality statement, table of contents; body codes stay 1–6', () => {
    expect((canonical.frontMatter ?? []).map((s) => s.heading)).toEqual(['Title Page', 'Confidentiality Statement', 'Table of Contents']);
    expect(canonical.sections.map((s) => s.number)).toEqual(['1', '2', '3', '4', '5', '6']);
  });
  it('sub-sections 4.1–4.3 and 5.1–5.3', () => {
    const subs = (n: string) => (canonical.sections.find((s) => s.number === n)!.subsections ?? []).map((s) => s.number);
    expect(subs('4')).toEqual(['4.1', '4.2', '4.3']);
    expect(subs('5')).toEqual(['5.1', '5.2', '5.3']);
  });
  it('the IB builder takes its sub-sections from it', async () => {
    const { IB_STRUCTURE } = await import('../../server/services/authoring/ib-builder');
    for (const n of ['4', '5']) {
      const lib = canonical.sections.find((s) => s.number === n)!.subsections!;
      const builder = IB_STRUCTURE.find((s) => s.number === n)!.childSections!;
      expect(builder.map((c) => [c.number, c.title, c.required])).toEqual(lib.map((c) => [c.number, c.heading, c.required]));
    }
  });
  it('the open-document brief for an IB shows the front matter and sub-sections', async () => {
    const { renderOpenDocumentBlock } = await import('../../server/services/ana-ri/open-document');
    const block = renderOpenDocumentBlock({ document: { registryId: 'ICH_IB', label: "Investigator's Brochure", source: 'surface', outline: canonical } });
    expect(block).toMatch(/Front matter: Title Page; Confidentiality Statement; Table of Contents/);
    expect(block).toMatch(/4\.1 Nonclinical Pharmacology/);
  });
});

describe('the M4E clinical overview outline', () => {
  it('ends with 2.5.7 Literature References', () => {
    const co = getDocumentTemplate('clinical_overview')!;
    expect(co.sections.map((s) => s.number).at(-1)).toBe('2.5.7');
  });
});
