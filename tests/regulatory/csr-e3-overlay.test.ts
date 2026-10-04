/**
 * The ICH E3 overlay is E3's tree, and every CSR outline on the platform is
 * read from it (D2, 2026-10-04, docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/).
 *
 * The overlay (server/services/ind/ctd/csr-e3-guidance.ts) is the one model of
 * what a clinical study report contains. Before it, five copies of the outline
 * disagreed: csr-builder's ICH_E3_STRUCTURE (its own wording), the CSR
 * scaffold behind get_csr_template (no §11.4.2.x, §12.2.x, §12.3.x, §12.4.x,
 * §14.x, §16.1.x, §16.2.x), the CSR template injected into AnA's prompt
 * (§1–§13), the medical-writing base (thirteen paraphrased headings) and the
 * stream's 5.3.5 playbook (its own wording for §14).
 *
 * E3_NUMBERS below is a deliberate second statement of E3's numbering, as the
 * csr-builder outline test keeps one for §1–§16: deleting a heading from the
 * overlay must fail here, not pass quietly.
 */
import { describe, it, expect } from 'vitest';
import {
  ICH_E3_GUIDANCE,
  getE3Section,
  e3Children,
  e3TopLevel,
  e3BasisFor,
  normalizeE3Number,
  renderE3Brief,
} from '../../server/services/ind/ctd/index';
import { compareSectionCode } from '../../shared/regulatory/section-code';
import { ICH_E3_STRUCTURE } from '../../server/services/csr-builder';
import { getClinicalTemplate } from '../../server/services/templates/clinical-csr-templates';
import { DOCUMENT_TEMPLATES } from '../../server/services/ana-ri/document-templates';
import { composeMedicalWritingGuidance } from '../../server/services/ana/medical-writing';
import { buildSectionSpecificPrompt } from '../../server/services/lumen-context/sections';

const range = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}.${i + 1}`);

const E3_NUMBERS = [
  '1', '2', '3', '4', '5', '5.1', '5.2', '5.3', '6', '7', '8',
  '9', '9.1', '9.2', '9.3', ...range('9.3', 3), '9.4', ...range('9.4', 8), '9.5', ...range('9.5', 4), '9.6', '9.7', ...range('9.7', 2), '9.8',
  '10', '10.1', '10.2',
  '11', '11.1', '11.2', '11.3', '11.4', '11.4.1', '11.4.2', ...range('11.4.2', 8), '11.4.3', '11.4.4', '11.4.5', '11.4.6', '11.4.7',
  '12', '12.1', '12.2', ...range('12.2', 4), '12.3', '12.3.1', ...range('12.3.1', 3), '12.3.2', '12.3.3',
  '12.4', '12.4.1', '12.4.2', ...range('12.4.2', 3), '12.5', '12.6',
  '13', '14', '14.1', '14.2', '14.3', ...range('14.3', 4), '15',
  '16', '16.1', ...range('16.1', 12), '16.2', ...range('16.2', 8), '16.3', ...range('16.3', 2), '16.4',
];

/** Platform decomposition E3 does not number: csr-builder's synopsis and objectives children. */
const PLATFORM_ONLY = (n: string) => /^(2|8)\.\d+$/.test(n);

describe('the overlay is ICH E3’s tree', () => {
  it('carries exactly the headings E3 numbers, in report order', () => {
    expect(ICH_E3_GUIDANCE.map((s) => s.number)).toEqual(E3_NUMBERS);
    const sorted = [...E3_NUMBERS].sort(compareSectionCode);
    expect(sorted).toEqual(E3_NUMBERS);
  });

  it('every heading sits under a heading that exists', () => {
    for (const s of ICH_E3_GUIDANCE) {
      const parent = s.number.includes('.') ? s.number.slice(0, s.number.lastIndexOf('.')) : null;
      if (parent) expect(getE3Section(parent), `${s.number}'s parent ${parent}`).toBeDefined();
    }
  });

  it.each([
    ['16.1', 12], ['16.2', 8], ['16.3', 2], ['14.3', 4], ['11.4.2', 8], ['12.2', 4], ['12.3.1', 3], ['9.4', 8], ['9.5', 4],
  ] as const)('§%s has its %i numbered headings', (parent, n) => {
    expect(e3Children(parent).length).toBe(n);
  });

  it('every heading cites its own E3 number; every checked source names its URL and date', () => {
    for (const s of ICH_E3_GUIDANCE) {
      const basis = e3BasisFor(s);
      expect(basis[0].ref, s.number).toBe(`ICH E3 §${s.number}`);
      for (const b of basis.filter((x) => x.confidence === 'regulator-text')) {
        expect(b.url, `${s.number}: ${b.ref}`).toMatch(/^https:\/\/www\.(fda|ema|ecfr)\.(gov|europa\.eu)\//);
        expect(b.checked, `${s.number}: ${b.ref}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it('a heading that names data sources says they are practice, not a requirement', () => {
    for (const s of ICH_E3_GUIDANCE.filter((x) => x.sources?.length)) {
      expect(e3BasisFor(s).some((b) => b.confidence === 'platform-convention'), s.number).toBe(true);
      expect(renderE3Brief(s.number), s.number).toContain('platform practice');
    }
  });

  it('E3 §16.2.7 and §12.2.4 name both the preferred and the investigator’s term; §16.3.1 names 314.50(f)(2)', () => {
    expect(renderE3Brief('16.2.7')).toMatch(/preferred term and the investigator’s original term/);
    expect(renderE3Brief('12.2.4')).toMatch(/both the preferred term and the original term/);
    expect(renderE3Brief('16.3.1')).toContain('314.50(f)(2)');
  });

  it('resolves a number however it is written, and answers nothing for one E3 does not have', () => {
    expect(normalizeE3Number('§12.2')).toBe('12.2');
    expect(normalizeE3Number('E3 12.2.4')).toBe('12.2.4');
    expect(getE3Section(' 16.1.9 ')?.title).toBe('Documentation of statistical methods');
    expect(renderE3Brief('17')).toBeNull();
    expect(renderE3Brief('12.9')).toBeNull();
    expect(renderE3Brief()).toContain('16. Appendices');
  });
});

describe('every CSR outline on the platform is read from the overlay', () => {
  it("csr-builder's ICH_E3_STRUCTURE uses E3's numbers and headings", () => {
    const nodes = ICH_E3_STRUCTURE.flatMap((s) => [s, ...(s.childSections ?? [])]);
    for (const n of nodes.filter((x) => !PLATFORM_ONLY(x.number))) {
      const e3 = getE3Section(n.number);
      expect(e3, `ICH_E3_STRUCTURE ${n.number} is not an E3 heading`).toBeDefined();
      expect(n.title, `ICH_E3_STRUCTURE ${n.number}`).toBe(e3!.title);
    }
  });

  it('the CSR scaffold behind get_csr_template carries every E3 heading', () => {
    const content = getClinicalTemplate('m5-3-5-1-csr')!.content;
    for (const s of ICH_E3_GUIDANCE) {
      const heading = s.number.includes('.') ? `${s.number} ${s.title}` : `${s.number}. ${s.title.toUpperCase()}`;
      expect(content, `scaffold missing ${s.number}`).toContain(heading);
    }
  });

  it("the CSR template injected into AnA's prompt covers §1–§16 with E3's headings", () => {
    const headings = DOCUMENT_TEMPLATES.clinical_study_report.sections.map((s) => s.heading);
    expect(headings).toEqual(e3TopLevel().map((s) => `${s.number}. ${s.title}`));
  });

  it("the medical-writing base outlines the CSR with E3's sixteen headings", () => {
    const structure = composeMedicalWritingGuidance({ documentType: 'csr' }).documentStandard!.structure;
    expect(structure).toEqual(e3TopLevel().map((s) => `${s.number}. ${s.title}`));
  });

  it("the stream's 5.3.5 playbook lists E3's sixteen headings", () => {
    const prompt = buildSectionSpecificPrompt('5.3.5')!;
    for (const s of e3TopLevel()) expect(prompt, s.number).toContain(`${s.number}. ${s.title}`);
  });
});
