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
