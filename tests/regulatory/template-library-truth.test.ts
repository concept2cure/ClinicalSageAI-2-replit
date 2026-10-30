/**
 * The market-specs document template library is what AnA's launch-scope tool
 * `get_document_template` (and GET /api/submissions/templates/:id) serves as a
 * "factual document spine". These pin the spines against their sources:
 *
 *  - the CSR outline IS the canonical ICH E3 tree (server/services/ind/ctd,
 *    csr-e3-*.ts) — §1–§16 with E3's own numbers and titles, not a hand copy
 *    shifted by one from §6 with §3–§5 and §15 missing;
 *  - the PBRER outline carries ICH E2C(R2) §1–§19, including §12–§15;
 *  - the cover letter is not filed under one CTD code, because its Module 1
 *    placement differs by region (FDA 1.2, EU 1.0 — server/services/regional-ctd-templates.ts),
 *    and 1.1 is FDA Forms.
 */
import { describe, it, expect } from 'vitest';
import {
  getDocumentTemplate,
  templateForCtdSection,
} from '../../server/services/market-specs/document-template-library';
import { e3TopLevel, ICH_E3_GUIDANCE } from '../../server/services/ind/ctd/index.js';

describe('template library — CSR outline is the ICH E3 tree', () => {
  // The spine is the whole tree since 13bafc62ff (2026-10-26): §1–§16 and every sub-heading under
  // them, in E3's order (docs/design/EDITOR_CSR_CRF_COMPLETION_2026-10-26.md).
  it('numbers and titles equal every node of ICH_E3_GUIDANCE, §1–§16 among them', () => {
    const csr = getDocumentTemplate('clinical_study_report')!;
    expect(csr.sections.map((s) => `${s.number} ${s.heading}`)).toEqual(
      ICH_E3_GUIDANCE.map((s) => `${s.number} ${s.title}`),
    );
    const top = new Set(e3TopLevel().map((s) => s.number));
    expect(csr.sections.filter((s) => top.has(s.number)).map((s) => `${s.number} ${s.heading}`)).toEqual(
      e3TopLevel().map((s) => `${s.number} ${s.title}`),
    );
  });

  it('every section says what it is for, and §14 is the displays NOT in the text', () => {
    const csr = getDocumentTemplate('clinical_study_report')!;
    for (const s of csr.sections) expect(s.purpose.trim().length).toBeGreaterThan(0);
    const s14 = csr.sections.find((s) => s.number === '14')!;
    expect(s14).toBeDefined();
    expect(s14.purpose).not.toMatch(/in-text/i);
  });
});

describe('template library — PBRER outline is ICH E2C(R2) §1–§20', () => {
  it('carries every numbered section in order, after the title page and executive summary', () => {
    const p = getDocumentTemplate('pbrer')!;
    // §20 Appendices, the title page and the executive summary added 2026-10-18 (review finding).
    expect(p.sections.map((s) => s.number)).toEqual(
      Array.from({ length: 20 }, (_, i) => String(i + 1)),
    );
    expect(p.frontMatter?.map((s) => s.heading)).toEqual(['Title Page', 'Executive Summary']);
    // GVP Module VII asks every section to be completed, stating none where there is none.
    expect(p.sections.filter((s) => ['8', '9', '10', '11', '12'].includes(s.number)).every((s) => s.required)).toBe(true);
  });

  it('§12–§19 carry the E2C(R2) headings', () => {
    const p = getDocumentTemplate('pbrer')!;
    const h = (n: string) => p.sections.find((s) => s.number === n)?.heading ?? '';
    expect(h('12')).toMatch(/Other Periodic Reports/);
    expect(h('13')).toMatch(/Lack of Efficacy/);
    expect(h('14')).toMatch(/Late-Breaking/);
    expect(h('15')).toMatch(/Overview of Signals/);
    expect(h('16')).toMatch(/Signal and Risk Evaluation/);
    expect(h('17')).toMatch(/Benefit Evaluation/);
    expect(h('18')).toMatch(/Integrated Benefit-Risk Analysis for Approved Indications/);
    expect(h('19')).toMatch(/Conclusions and Actions/);
  });
});

describe('template library — cover letter placement is regional', () => {
  it('is not served for CTD 1.1 (FDA Forms)', () => {
    expect(templateForCtdSection('1.1')).toBeUndefined();
  });

  it('carries no single CTD code, and its basis names FDA 1.2 and EU 1.0', () => {
    const cl = getDocumentTemplate('cover_letter')!;
    expect(cl.ctdSection).toBeUndefined();
    expect(cl.regulatoryBasis).toMatch(/FDA[^;]*1\.2/);
    expect(cl.regulatoryBasis).toMatch(/EU[^;]*1\.0/);
  });
});

describe('template library — unaffected lookups (guard)', () => {
  it('Clinical Overview stays at 2.5 and the QOS still resolves by 2.3', () => {
    expect(getDocumentTemplate('clinical_overview')!.ctdSection).toBe('2.5');
    expect(templateForCtdSection('2.3')?.id).toBe('quality_overall_summary');
    expect(templateForCtdSection('5.3.5.1')?.id).toBe('clinical_study_report');
  });
});
