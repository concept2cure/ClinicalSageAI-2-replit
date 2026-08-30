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
  detectSectionGaps,
  sectionStatus,
} from '../nonclinical-study-report-builder';

const section = (num: string) => NONCLINICAL_STUDY_REPORT_STRUCTURE.find((s) => s.number === num)!;

// A fully-extracted repeat-dose tox study MINUS the dose-group design, hitting
// the PreclinicalStudy branch of normalizeStudy (extractionConfidence present).
const toxStudy = {
  extractionConfidence: 0.9,
  studyType: 'repeat_dose_tox',
  studyTitle: '28-day rat tox',
  species: 'rat',
  routeOfAdministration: 'oral gavage',
  keyFindings: 'No adverse findings up to the high dose.',
  noael: '100 mg/kg/day',
  targetOrganToxicity: [],
  safetyMargins: [],
} as any;

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
    // Dose groups default to empty (not captured) rather than being absent.
    expect(Array.isArray(out.doseGroups)).toBe(true);
    expect(out.doseGroups).toHaveLength(0);
  });
});

describe('gap engine does not report a section complete over unfilled critical data', () => {
  it('§4 Materials & Methods is partial (not rendered) when dose-group design is absent', () => {
    const study = normalizeStudy(toxStudy); // species + route present, no dose groups
    const s4 = section('4');
    const gaps = detectSectionGaps(s4, study);
    expect(gaps).toContain('dose-group design');
    // Before the fix §4 required only species+route → 0 gaps → 'rendered'.
    expect(sectionStatus(s4, gaps)).toBe('partial');
  });

  it('§4 becomes rendered once dose groups are present', () => {
    const study = normalizeStudy({
      ...toxStudy,
      doseGroups: [{ group: 'High', doseLevel: '100 mg/kg/day' }],
    });
    const s4 = section('4');
    expect(sectionStatus(s4, detectSectionGaps(s4, study))).toBe('rendered');
  });

  it('§6 Discussion & Conclusion is partial (not rendered) when NOAEL is absent, even with key findings', () => {
    const study = normalizeStudy({ ...toxStudy, noael: null });
    const s6 = section('6');
    const gaps = detectSectionGaps(s6, study);
    expect(gaps).toContain('NOAEL');
    // Before the fix §6 required only keyFindings → 0 gaps → 'rendered'.
    expect(sectionStatus(s6, gaps)).toBe('partial');
  });
});
