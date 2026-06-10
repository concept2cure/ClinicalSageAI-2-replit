/**
 * Tests for the CER structure model — proves the MEDDEV 2.7/1 stages and the CER
 * report sections (with reviewer questions) are consistent, and that the
 * completeness assessment handles equivalence and clinical-data flags correctly.
 */
import { describe, it, expect } from 'vitest';
import {
  CER_STAGES,
  CER_SECTIONS,
  getCerSection,
  cerSectionIds,
  cerReviewerQuestions,
  assessCerStructure,
} from '../cer-structure';

describe('CER structure — consistency', () => {
  it('has the five MEDDEV stages in order', () => {
    expect(CER_STAGES.map((s) => s.stage)).toEqual([0, 1, 2, 3, 4]);
    for (const s of CER_STAGES) {
      expect(s.title).toBeTruthy();
      expect(s.purpose).toBeTruthy();
      expect(s.output).toBeTruthy();
    }
  });

  it('has unique section ids, each with a purpose and ≥1 reviewer question', () => {
    const ids = cerSectionIds();
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of CER_SECTIONS) {
      expect(s.title).toBeTruthy();
      expect(s.purpose).toBeTruthy();
      expect(s.reviewerQuestions.length).toBeGreaterThan(0);
    }
  });

  it('flattens reviewer questions across all sections', () => {
    const qs = cerReviewerQuestions();
    expect(qs.length).toBeGreaterThanOrEqual(CER_SECTIONS.length);
    expect(qs.every((q) => q.sectionId && q.question)).toBe(true);
    // The analysis section asks about GSPR conformity.
    expect(qs.some((q) => q.sectionId === 'analysis' && /GSPR/.test(q.question))).toBe(true);
  });

  it('marks the data-bearing sections as requiring clinical data', () => {
    for (const id of ['clinical_background', 'clinical_data', 'appraisal', 'analysis']) {
      expect(getCerSection(id)?.requiresClinicalData).toBe(true);
    }
    // The cover summary is narrative, not clinical-data-bearing.
    expect(getCerSection('summary')?.requiresClinicalData).toBe(false);
  });
});

describe('CER structure — completeness assessment', () => {
  const requiredNonEquivIds = CER_SECTIONS.filter((s) => s.required && !s.equivalenceOnly).map((s) => s.id);

  it('is ready when all required (non-equivalence) sections are present and equivalence is not claimed', () => {
    const a = assessCerStructure(requiredNonEquivIds, { equivalenceClaimed: false });
    expect(a.ready).toBe(true);
    expect(a.missingRequiredSections).toHaveLength(0);
    expect(a.equivalenceAddressed).toBe(true);
  });

  it('requires the equivalence section only when equivalence is claimed', () => {
    const withoutEquiv = assessCerStructure(requiredNonEquivIds, { equivalenceClaimed: true });
    expect(withoutEquiv.ready).toBe(false);
    expect(withoutEquiv.missingRequiredSections).toContain('equivalence');
    expect(withoutEquiv.equivalenceAddressed).toBe(false);

    const withEquiv = assessCerStructure([...requiredNonEquivIds, 'equivalence'], { equivalenceClaimed: true });
    expect(withEquiv.ready).toBe(true);
    expect(withEquiv.equivalenceAddressed).toBe(true);
  });

  it('reports the specific missing required sections', () => {
    const a = assessCerStructure(['summary', 'scope']);
    expect(a.ready).toBe(false);
    expect(a.missingRequiredSections).toContain('analysis');
    expect(a.missingRequiredSections).toContain('conclusions');
  });

  it('surfaces present sections that still need clinical-data substantiation', () => {
    const a = assessCerStructure(requiredNonEquivIds);
    expect(a.sectionsNeedingClinicalData).toEqual(expect.arrayContaining(['analysis', 'clinical_data']));
  });
});
