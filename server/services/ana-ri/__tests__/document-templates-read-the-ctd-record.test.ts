/**
 * AnA's chat outlines for the CTD components are the one ICH M2–M5 record
 * (D2 cleanup C3, 2026-10-26).
 *
 * When a person asks AnA for a Clinical Overview, a QOS or a 3.2.S, the
 * detected template is put into the prompt as "REQUIRED DOCUMENT STRUCTURE …
 * use the exact headings below". Those outlines were written by hand, and
 * several of their headings are in no ICH M4 guideline ("Individual Study
 * Results — Pivotal Trials", "Conclusions on Clinical Efficacy", "Integrated
 * Summary and Implications for Clinical Use"). The QOS skipped 2.3.S.5,
 * 2.3.S.6, 2.3.P.4, 2.3.P.6 and 2.3.P.7, and the 2.7.4 safety summary had no
 * 2.7.4.5 subdivisions. Every heading is now the record's.
 */
import { describe, expect, it } from 'vitest';
import { DOCUMENT_TEMPLATES, buildDocumentTemplateBlock, detectDocumentTemplate } from '../document-templates';
import { ctdRecordSubtree } from '../../market-specs/ctd-component-outlines';
import { ichHeadingTitle } from '../../ind/ctd/ich-m4-headings';
import { CTD_AUTHORING_GUIDANCE } from '../../ind/ctd/authoring-guidance';

const CTD_CHAT = [
  ['ctd_2_2_introduction', '2.2'],
  ['ctd_2_3_qos', '2.3'],
  ['ctd_2_4_nonclinical_overview', '2.4'],
  ['ctd_2_5_clinical_overview', '2.5'],
  ['ctd_2_7_3_efficacy_summary', '2.7.3'],
  ['ctd_2_7_4_safety_summary', '2.7.4'],
  ['cmc_drug_substance', '3.2.S'],
  ['cmc_drug_product', '3.2.P'],
] as const;

describe('a CTD chat outline is the record’s subtree', () => {
  it.each(CTD_CHAT)('%s: every numbered section is a record heading below %s, in CTD order, titled as the record titles it', (id, root) => {
    const t = DOCUMENT_TEMPLATES[id];
    const coded = t.sections.filter((s) => s.code && /^[2-5]/.test(s.code));
    const below = ctdRecordSubtree(root).map((h) => h.code);
    expect(coded.map((s) => s.code)).toEqual(below.length ? below : [root]);
    for (const s of coded) expect(s.heading, s.code).toBe(`${s.code} ${ichHeadingTitle(s.code!)}`);
    // Nothing un-numbered beside them but the QOS's Introduction.
    expect(t.sections.filter((s) => !s.code).map((s) => s.heading)).toEqual(id === 'ctd_2_3_qos' ? ['Introduction'] : []);
  });

  it('the headings the hand copies invented are gone, and the ones they dropped are there', () => {
    const headings = Object.values(DOCUMENT_TEMPLATES).flatMap((t) => t.sections.map((s) => s.heading)).join('\n');
    for (const invented of ['Individual Study Results — Pivotal Trials', 'Conclusions on Clinical Efficacy', 'Integrated Summary and Implications for Clinical Use', 'Deaths and Serious Adverse Events']) {
      expect(headings).not.toContain(invented);
    }
    const qos = DOCUMENT_TEMPLATES.ctd_2_3_qos.sections.map((s) => s.code);
    for (const c of ['2.3.S.5', '2.3.S.6', '2.3.P.4', '2.3.P.6', '2.3.P.7', '2.3.A.1', '2.3.R']) expect(qos, c).toContain(c);
    expect(DOCUMENT_TEMPLATES.ctd_2_7_4_safety_summary.sections.map((s) => s.code)).toContain('2.7.4.5.4');
  });

  it('a word target is the record brief’s own range, never a number written here', () => {
    for (const [id] of CTD_CHAT) {
      for (const s of DOCUMENT_TEMPLATES[id].sections.filter((x) => x.code)) {
        expect(s.targetWords, `${id} ${s.code}`).toEqual(CTD_AUTHORING_GUIDANCE[s.code!]?.wordCountRange);
      }
    }
    expect(DOCUMENT_TEMPLATES.ctd_2_5_clinical_overview.sections.find((s) => s.code === '2.5.1')?.targetWords).toBeDefined();
  });

  it('the prompt AnA receives for "draft a clinical overview" carries the record’s headings, with 2.5.6.4', () => {
    const block = buildDocumentTemplateBlock(detectDocumentTemplate('draft a clinical overview')!);
    expect(block).toContain('2.5.6.4 Benefit-Risk Assessment');
    expect(block).toMatch(/~\d+–\d+ words/);
  });
});
