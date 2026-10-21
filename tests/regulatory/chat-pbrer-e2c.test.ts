/**
 * AnA drafts a PBRER in chat to the ICH E2C(R2) structure the platform holds
 * (D2, 2026-10-15).
 *
 * Measured at c30e1d490: "draft a PBRER" (ana-ri/document-templates.ts
 * psur_pbrer) told the model it must use sixteen headings that drop E2C(R2)
 * §13 Lack of efficacy, §14 Late-breaking information and §15 Overview of
 * signals, renumber everything after §12, call §4 "Reference Product
 * Information" and §12 "Other PBRER Information"; the library outline
 * (market-specs 'pbrer', E2C(R2) §1–§19) is what the open-document brief and
 * get_document_template give.
 */
import { describe, it, expect } from 'vitest';
import { getDocumentTemplate } from '../../server/services/market-specs/document-template-library';
import { DOCUMENT_TEMPLATES } from '../../server/services/ana-ri/document-templates';

const lib = getDocumentTemplate('pbrer')!;

describe('the PBRER AnA drafts in chat follows ICH E2C(R2)', () => {
  const chat = DOCUMENT_TEMPLATES.psur_pbrer;
  // The title page, executive summary, §20 and the E2C(R2) subsections joined
  // the outline on 2026-10-18; the chat template asks for every one, in order
  // (completeness critic, 2026-10-19: it listed §1–§20 only).
  it('has the front matter, the E2C(R2) headings and their subsections, in order', () => {
    const expected: string[] = (lib.frontMatter ?? []).map((s) => s.heading);
    const walk = (list: typeof lib.sections) => { for (const s of list) { expected.push(`${s.number}. ${s.heading}`); walk(s.subsections ?? []); } };
    walk(lib.sections);
    expect(chat.sections.map((s) => s.heading)).toEqual(expected);
    expect(chat.sections.map((s) => s.heading)).toEqual(expect.arrayContaining([
      'Title Page', 'Executive Summary', '13. Lack of Efficacy in Controlled Clinical Trials', '16.2. Signal Evaluation', '20. Appendices to the PBRER',
    ]));
    // What the governed pack makes mandatory, the chat template requires.
    expect(chat.sections.find((s) => s.heading === 'Executive Summary')?.required).toBe(true);
  });
  it('keeps its drafting guidance on the sections it belongs to', () => {
    const ba = chat.sections.find((s) => s.heading.startsWith('18. '))!;
    expect(ba.guidance).toMatch(/benefit-risk balance/i);
  });
});
