/**
 * Module 4 nonclinical study-report builder — deterministic scaffolding:
 * the section registry, discipline classification, and study normalization
 * (the regulatorily-critical structure, independent of the AI gateway).
 */

import { describe, it, expect } from 'vitest';
import {
  NONCLINICAL_STUDY_REPORT_STRUCTURE,
  disciplineFor,
  normalizeStudy,
} from '../nonclinical-study-report-builder';

describe('NONCLINICAL_STUDY_REPORT_STRUCTURE', () => {
  it('defines a non-empty, well-formed section registry', () => {
    expect(NONCLINICAL_STUDY_REPORT_STRUCTURE.length).toBeGreaterThan(0);
    for (const s of NONCLINICAL_STUDY_REPORT_STRUCTURE) {
      expect(s.number).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(typeof s.required).toBe('boolean');
      expect(Array.isArray(s.requires)).toBe(true);
    }
  });

  it('has unique section numbers', () => {
    const nums = NONCLINICAL_STUDY_REPORT_STRUCTURE.map((s) => s.number);
    expect(new Set(nums).size).toBe(nums.length);
  });

  it('covers the standard study-report skeleton (summary, methods, results, conclusion)', () => {
    const titles = NONCLINICAL_STUDY_REPORT_STRUCTURE.map((s) => s.title.toLowerCase()).join(' | ');
    expect(titles).toMatch(/summary/);
    expect(titles).toMatch(/method/);
    expect(titles).toMatch(/result/);
    expect(titles).toMatch(/conclusion|discussion/);
  });
});

describe('disciplineFor', () => {
  it('maps pharmacology study types', () => {
    for (const t of ['pharmacology', 'safety_pharm', 'safety_pharmacology']) {
      expect(disciplineFor(t)).toBe('pharmacology');
    }
  });

  it('maps PK/ADME study types', () => {
    for (const t of ['pk', 'tk', 'adme', 'pharmacokinetics']) {
      expect(disciplineFor(t)).toBe('pharmacokinetics');
    }
  });

  it('maps toxicology study types', () => {
    for (const t of ['single_dose_tox', 'repeat_dose_tox', 'genotox', 'carcinogenicity', 'reproductive_tox']) {
      expect(disciplineFor(t)).toBe('toxicology');
    }
  });

  it('returns a valid discipline for an unknown study type (deterministic default)', () => {
    const d = disciplineFor('something_unknown');
    expect(['pharmacology', 'pharmacokinetics', 'toxicology']).toContain(d);
    expect(disciplineFor('something_unknown')).toBe(d); // stable
  });
});

describe('normalizeStudy', () => {
  it('normalizes a minimal study input without throwing, preserving the study type', () => {
    const out = normalizeStudy({ studyType: 'repeat_dose_tox', title: '28-day rat tox' } as any);
    expect(out).toBeTruthy();
    expect(out.studyType).toBe('repeat_dose_tox');
    expect(disciplineFor(out.studyType)).toBe('toxicology');
    expect(Array.isArray(out.targetOrganToxicity)).toBe(true);
  });
});
