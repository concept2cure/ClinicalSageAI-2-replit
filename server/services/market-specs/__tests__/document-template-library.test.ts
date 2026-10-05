/**
 * Tests for the document template library — proves the document structures are
 * internally consistent, ordered, and queryable by family / CTD section / id.
 */
import { describe, it, expect } from 'vitest';
import {
  DOCUMENT_TEMPLATES,
  getDocumentTemplate,
  templatesForFamily,
  templateForCtdSection,
  documentTemplateIds,
} from '../document-template-library';
import { getRequirements } from '../submission-requirements';
import { LABELING_RULES_KNOWLEDGE } from '../../ivd-knowledge/regulatory/labeling-rules';
import { assembleTechDoc } from '../../pathway-engines/mdr-ivdr/tech-doc-assembler';

describe('document template library — consistency', () => {
  it('has unique ids and at least one section per template', () => {
    const ids = documentTemplateIds();
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of DOCUMENT_TEMPLATES) {
      expect(t.title).toBeTruthy();
      expect(t.regulatoryBasis).toBeTruthy();
      expect(t.families.length).toBeGreaterThan(0);
      expect(t.sections.length).toBeGreaterThan(0);
      for (const s of t.sections) {
        expect(s.number).toBeTruthy();
        expect(s.heading).toBeTruthy();
        expect(s.purpose).toBeTruthy();
        expect(typeof s.required).toBe('boolean');
      }
    }
  });

  it('every template requires at least one section', () => {
    for (const t of DOCUMENT_TEMPLATES) {
      expect(t.sections.some((s) => s.required)).toBe(true);
    }
  });
});

describe('document template library — canonical structures', () => {
  it('Clinical Overview matches the ICH M4E 2.5.1–2.5.6 spine', () => {
    const co = getDocumentTemplate('clinical_overview')!;
    expect(co.ctdSection).toBe('2.5');
    expect(co.sections.map((s) => s.number)).toEqual(['2.5.1', '2.5.2', '2.5.3', '2.5.4', '2.5.5', '2.5.6']);
  });

  it('510(k) Summary carries the 21 CFR 807.92 elements incl. substantial equivalence', () => {
    const k = getDocumentTemplate('k510_summary')!;
    expect(k.regulatoryBasis).toMatch(/807\.92/);
    expect(k.sections.some((s) => /substantial equivalence/i.test(s.heading))).toBe(true);
    expect(k.sections.some((s) => /predicate/i.test(s.heading))).toBe(true);
  });

  it('SmPC has the 10 top-level sections', () => {
    const smpc = getDocumentTemplate('smpc')!;
    expect(smpc.sections.map((s) => s.number)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  });

  it('GSPR checklist maps to MDR Annex I chapters I–III', () => {
    const gspr = getDocumentTemplate('gspr_checklist')!;
    expect(gspr.regulatoryBasis).toMatch(/Annex I/);
    expect(gspr.sections.map((s) => s.number)).toEqual(['I', 'II', 'III']);
  });
});

/**
 * F73 part A (g-ivdr-gspr-checklist): the GSPR checklist was one template for
 * eu_mdr and eu_ivdr, citing MDR Annex I numbering ("Requirement 23: label and
 * IFU") for IVDs. IVDR Annex I numbers its chapters 1–8 / 9–19 / 20, so an IVD
 * checklist drafted from it cited requirements the IVDR does not have. Each
 * regulation now has its own checklist; both numberings are recall until EUR-Lex
 * is re-read (docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/
 * g-ivdr-gspr-checklist-facts.md).
 */
describe('document template library — one GSPR checklist per EU device regulation', () => {
  const text = (t: { sections: Array<{ heading: string; purpose: string }> }) =>
    t.sections.map((s) => `${s.heading} ${s.purpose}`).join(' | ');

  it('no template serves both eu_mdr and eu_ivdr under one Annex I numbering', () => {
    for (const t of DOCUMENT_TEMPLATES) {
      expect(t.families.includes('eu_mdr') && t.families.includes('eu_ivdr'), t.id).toBe(false);
    }
  });

  it('no eu_ivdr template cites MDR Annex I numbering', () => {
    for (const t of templatesForFamily('eu_ivdr')) {
      const body = `${t.regulatoryBasis} | ${text(t)}`;
      expect(body, t.id).not.toMatch(/Requirement 23|Requirements? 1–9|Requirements? 10–22|2017\/745|is parallel/);
    }
  });

  it('gspr_checklist is the MDR checklist: MDR only, MDR Annex I basis, recall-labelled', () => {
    const mdr = getDocumentTemplate('gspr_checklist')!;
    expect(mdr.families).toEqual(['eu_mdr']);
    expect(mdr.regulatoryBasis).toMatch(/Regulation \(EU\) 2017\/745.*Annex I\b/);
    expect(mdr.regulatoryBasis).not.toMatch(/IVDR|2017\/746|parallel/);
    expect(mdr.basis?.confidence).toBe('recall');
    expect(mdr.regulatoryBasis).toMatch(/recall/);
    expect(mdr.sections.find((s) => s.number === 'III')!.purpose).toMatch(/Section 23\b/);
  });

  it('ivdr_gspr_checklist cites IVDR Annex I: Ch I §1–8, Ch II §9–19, Ch III §20 (label 20.2, IFU 20.4)', () => {
    const ivdr = getDocumentTemplate('ivdr_gspr_checklist');
    expect(ivdr, 'ivdr_gspr_checklist exists').toBeDefined();
    expect(ivdr!.families).toEqual(['eu_ivdr']);
    expect(ivdr!.regulatoryBasis).toMatch(/Regulation \(EU\) 2017\/746.*Annex I\b/);
    expect(ivdr!.basis?.confidence).toBe('recall');
    expect(ivdr!.regulatoryBasis).toMatch(/recall/);
    expect(ivdr!.sections.map((s) => s.number)).toEqual(['I', 'II', 'III']);
    const [i, ii, iii] = ivdr!.sections;
    expect(i.heading).toMatch(/General requirements/i);
    expect(i.purpose).toMatch(/Sections 1–8\b/);
    expect(ii.heading).toMatch(/performance, design and manufacture/i);
    expect(ii.purpose).toMatch(/Sections 9–19\b/);
    expect(iii.heading).toMatch(/Information supplied with the device/i);
    expect(iii.purpose).toMatch(/Section 20\b/);
    expect(iii.purpose).toMatch(/20\.2\b.*label/i);
    expect(iii.purpose).toMatch(/20\.4\b.*instructions for use/i);
    expect(templatesForFamily('eu_ivdr').map((t) => t.id)).toContain('ivdr_gspr_checklist');
    expect(templatesForFamily('eu_mdr').map((t) => t.id)).not.toContain('ivdr_gspr_checklist');
  });

  it("the IVDR checklist's Chapter III and the IVD labelling record cite the same section", () => {
    const record = LABELING_RULES_KNOWLEDGE.find((e) => e.id === 'label.eu.ivdr-annex-i-ch3')!;
    expect(record, 'label.eu.ivdr-annex-i-ch3').toBeDefined();
    const cited = record.citations.map((c) => c.label).join(' | ');
    const section = /Section (\d+)\b/.exec(cited)?.[1];
    expect(section, 'the labelling record names an Annex I section').toBeDefined();
    const iii = getDocumentTemplate('ivdr_gspr_checklist')!.sections.find((s) => s.number === 'III')!;
    expect(iii.purpose).toMatch(new RegExp(`Section ${section}\\b`));
    expect(record.keyPoints.join(' ')).toMatch(/§20\.2.*label/);
    expect(record.keyPoints.join(' ')).toMatch(/§20\.4.*IFU/);
  });

  it('each EU device submission type points its GSPR row at its own regulation\'s checklist', () => {
    for (const type of ['mdr_td', 'ivdr_td'] as const) {
      const req = getRequirements(type)!;
      for (const row of req.requiredDocuments) {
        if (!row.templateId) continue;
        const t = getDocumentTemplate(row.templateId);
        expect(t, `${type} → ${row.templateId}`).toBeDefined();
        expect(t!.families, `${type} → ${row.templateId}`).toContain(req.family);
      }
    }
    expect(getRequirements('ivdr_td')!.requiredDocuments.map((d) => d.templateId)).toContain('ivdr_gspr_checklist');
    expect(getRequirements('mdr_td')!.requiredDocuments.map((d) => d.templateId)).toContain('gspr_checklist');
  });

  it('the IVDR technical-file assembler places a leaf typed ivdr_gspr_checklist in the GSPR slot', () => {
    const r = assembleTechDoc({
      leaves: [{ sectionCode: 'x1', title: 'Annex I conformity table', documentType: 'ivdr_gspr_checklist' }],
      regulation: 'ivdr',
    });
    const gspr = r.sections.find((s) => s.id === 'gspr')!;
    expect(gspr.present).toBe(true);
    expect(gspr.titleOnlyLeafIndices).toEqual([]);
  });

  it('the MDR technical-file assembler does not take the IVDR checklist as its GSPR by type', () => {
    const r = assembleTechDoc({
      leaves: [{ sectionCode: 'x1', title: 'Annex I conformity table', documentType: 'ivdr_gspr_checklist' }],
      regulation: 'mdr',
    });
    expect(r.sections.find((s) => s.id === 'gspr')!.present).toBe(false);
    expect(r.summary.missingRequired).toContain('gspr');
  });
});

describe('document template library — lookups', () => {
  it('filters by family', () => {
    const estar = templatesForFamily('estar');
    expect(estar.some((t) => t.id === 'k510_summary')).toBe(true);
    expect(estar.every((t) => t.families.includes('estar'))).toBe(true);

    const ivdr = templatesForFamily('eu_ivdr');
    expect(ivdr.some((t) => t.id === 'performance_evaluation_report')).toBe(true);
  });

  it('resolves a template by CTD section', () => {
    expect(templateForCtdSection('2.3')?.id).toBe('quality_overall_summary');
    expect(templateForCtdSection('9.9')).toBeUndefined();
  });

  it('returns undefined for an unknown id', () => {
    expect(getDocumentTemplate('nope')).toBeUndefined();
  });
});
