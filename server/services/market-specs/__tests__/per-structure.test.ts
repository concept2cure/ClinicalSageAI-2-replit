/**
 * Tests for the PER structure model (IVDR Annex XIII) — proves the three pillars,
 * their metrics, the sections + reviewer questions, and the pillar-coverage
 * assessment are consistent and deterministic.
 */
import { describe, it, expect } from 'vitest';
import {
  PER_PILLARS,
  ANALYTICAL_METRICS,
  CLINICAL_METRICS,
  PER_SECTIONS,
  getPerSection,
  metricsForPillar,
  perReviewerQuestions,
  assessPerStructure,
} from '../per-structure';

describe('PER structure — consistency', () => {
  it('has the three performance pillars', () => {
    expect(PER_PILLARS.map((p) => p.id)).toEqual(['scientific_validity', 'analytical', 'clinical']);
  });

  it('catalogs analytical metrics incl. LoD/LoQ, precision, trueness, traceability', () => {
    const ids = ANALYTICAL_METRICS.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['analytical_sensitivity', 'precision', 'trueness', 'traceability']));
    expect(ANALYTICAL_METRICS.every((m) => m.pillar === 'analytical')).toBe(true);
  });

  it('catalogs clinical metrics incl. sensitivity/specificity, PPV/NPV', () => {
    const ids = CLINICAL_METRICS.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['diagnostic_sensitivity', 'diagnostic_specificity', 'predictive_values']));
    expect(CLINICAL_METRICS.every((m) => m.pillar === 'clinical')).toBe(true);
  });

  it('every section has a purpose and ≥1 reviewer question', () => {
    for (const s of PER_SECTIONS) {
      expect(s.purpose).toBeTruthy();
      expect(s.reviewerQuestions.length).toBeGreaterThan(0);
    }
    expect(perReviewerQuestions().some((q) => q.sectionId === 'clinical_performance' && /predictive values/i.test(q.question))).toBe(true);
  });

  it('resolves metrics by pillar', () => {
    expect(metricsForPillar('analytical').length).toBe(ANALYTICAL_METRICS.length);
    expect(metricsForPillar('clinical').length).toBe(CLINICAL_METRICS.length);
    expect(metricsForPillar('scientific_validity')).toHaveLength(0);
  });
});

describe('PER structure — assessment', () => {
  const allRequired = PER_SECTIONS.filter((s) => s.required).map((s) => s.id);

  it('is ready and covers all three pillars when every required section is present', () => {
    const a = assessPerStructure(allRequired);
    expect(a.ready).toBe(true);
    expect(a.pillarsCovered).toEqual(['scientific_validity', 'analytical', 'clinical']);
    expect(a.pillarsMissing).toHaveLength(0);
  });

  it('flags a missing pillar', () => {
    const withoutClinical = allRequired.filter((id) => id !== 'clinical_performance');
    const a = assessPerStructure(withoutClinical);
    expect(a.ready).toBe(false);
    expect(a.missingRequiredSections).toContain('clinical_performance');
    expect(a.pillarsMissing).toContain('clinical');
  });

  it('reports specific missing sections from a partial PER', () => {
    const a = assessPerStructure(['pep', 'scientific_validity']);
    expect(a.ready).toBe(false);
    expect(a.missingRequiredSections).toEqual(expect.arrayContaining(['analytical_performance', 'clinical_performance', 'per_conclusion']));
  });

  it('looks up a section by id', () => {
    expect(getPerSection('analytical_performance')?.pillar).toBe('analytical');
    expect(getPerSection('nope')).toBeUndefined();
  });
});
