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
  it('has the nineteen E2C(R2) headings, in order', () => {
    expect(chat.sections.map((s) => s.heading)).toEqual(lib.sections.map((s) => `${s.number}. ${s.heading}`));
    expect(chat.sections.map((s) => s.heading)).toContain('13. Lack of Efficacy in Controlled Clinical Trials');
  });
  it('keeps its drafting guidance on the sections it belongs to', () => {
    const ba = chat.sections.find((s) => s.heading.startsWith('18. '))!;
    expect(ba.guidance).toMatch(/benefit-risk balance/i);
  });
});
