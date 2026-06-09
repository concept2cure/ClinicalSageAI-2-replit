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
