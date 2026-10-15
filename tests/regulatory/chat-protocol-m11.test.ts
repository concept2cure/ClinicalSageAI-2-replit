/**
 * AnA drafts a clinical protocol in chat to the ICH M11 structure the platform
 * holds (D2, 2026-10-15).
 *
 * Measured at the IB second slice: "draft a phase 1 protocol"
 * (server/services/ana-ri/document-templates.ts ind_phase1_protocol) told the
 * model it must use ten headings of its own ("5. Selection of Subjects",
 * "7. Assessments", "8. Statistical Considerations", "10. References"), while
 * the open-document brief, get_document_template and the Projects blueprint
 * give the ICH M11 protocol outline (shared/regulatory/protocol-m11.ts), whose
 * numbering differs from section 5 on (e.g. 8 Trial Assessments, 10
 * Statistical Considerations, 14 References).
 */
import { describe, it, expect } from 'vitest';
import { ICH_M11_PROTOCOL_SECTIONS, ICH_M11_PROTOCOL_BASIS } from '../../shared/regulatory/protocol-m11';
import { DOCUMENT_TEMPLATES } from '../../server/services/ana-ri/document-templates';

const m11Level1 = ICH_M11_PROTOCOL_SECTIONS.filter((s) => !s.number || !s.number.includes('.'));
const heading = (s: (typeof m11Level1)[number]) => (s.number ? `${s.number}. ${s.title}` : s.title);

describe('the protocol AnA drafts in chat follows ICH M11', () => {
  const chat = DOCUMENT_TEMPLATES.ind_phase1_protocol;
  it('its headings are the M11 front matter and level-1 headings, in order', () => {
    expect(chat.sections.map((s) => s.heading)).toEqual(m11Level1.map(heading));
  });
  it('cites the M11 basis', () => {
    expect(chat.regulatoryReferences.join(' ')).toContain(ICH_M11_PROTOCOL_BASIS.ref);
  });
  it('keeps its phase 1 drafting guidance (dose escalation, DLT) on the M11 sections it belongs to', () => {
    const design = chat.sections.find((s) => s.heading.startsWith('4. '))!;
    expect(design.guidance).toMatch(/escalation|DLT/i);
    const stats = chat.sections.find((s) => s.heading.startsWith('10. '))!;
    expect(stats.guidance).toMatch(/MTD|sample size|study size/i);
  });
});

describe('the medical-writing advisor gives the M11 protocol structure', () => {
  it('lists the M11 level-1 headings and names ICH M11 among the governing standards', async () => {
    const { getDocumentTypeStandard } = await import('../../server/services/ana/medical-writing');
    const p = getDocumentTypeStandard('protocol')!;
    expect(p.structure).toEqual(m11Level1.filter((s) => s.number).map((s) => `${s.number}. ${s.title}`));
    expect(p.governingStandards.join(' ')).toMatch(/M11/);
  });
});

describe('a draft with every M11 heading is reviewed as having every M11 heading', () => {
  it('the long §9 heading is detected (the outline extractor dropped any line over 120 characters)', async () => {
    const { reviewMedicalWriting } = await import('../../server/services/ana/medical-writing-review');
    const draft = m11Level1.filter((s) => s.number).map((s) => `## ${s.number}. ${s.title}\n\nText.`).join('\n\n');
    expect(reviewMedicalWriting('protocol', draft).missingSections).toEqual([]);
  });
});
