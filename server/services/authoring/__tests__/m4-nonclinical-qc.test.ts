/**
 * Module 4 nonclinical assembly QC — coverage, required-section status, CTD
 * placement, GLP, structure, and the honest-by-construction verdict.
 */

import { describe, it, expect } from 'vitest';
import { runM4NonclinicalQc, type M4StudyReportInput } from '../m4-nonclinical-qc';

function sections(allRendered = true): M4StudyReportInput['sections'] {
  return [
    { number: '1', title: 'Title Page', required: true, status: 'rendered' },
    { number: '5', title: 'Results', required: true, status: allRendered ? 'rendered' : 'missing' },
    { number: '7', title: 'Tabulated Data', required: true, status: 'rendered' },
  ];
}

function report(over: Partial<M4StudyReportInput> & { studyId: string; studyType: string }): M4StudyReportInput {
  return {
    sections: sections(),
    ...over,
    // Default placement to the correct CTD section unless overridden.
    reportSection: over.reportSection ?? defaultSection(over.studyType),
  };
}

function defaultSection(studyType: string): string {
  const map: Record<string, string> = {
    pharmacology: '4.2.1.1',
    safety_pharmacology: '4.2.1.3',
    pharmacokinetics: '4.2.2',
    repeat_dose_tox: '4.2.3.2',
    genotoxicity: '4.2.3.3',
  };
  return map[studyType] ?? '4.2.3.2';
}

const fullProgram = (): M4StudyReportInput[] => [
  report({ studyId: 'PH-1', studyType: 'pharmacology' }),
  report({ studyId: 'SP-1', studyType: 'safety_pharmacology' }),
  report({ studyId: 'PK-1', studyType: 'pharmacokinetics' }),
  report({ studyId: 'TX-1', studyType: 'repeat_dose_tox', glpStatus: 'GLP' }),
  report({ studyId: 'GT-1', studyType: 'genotoxicity' }),
];

describe('runM4NonclinicalQc — verdict', () => {
  it('ready for a complete ICH M3(R2) program with correct placement', () => {
    const res = runM4NonclinicalQc({ reports: fullProgram() });
    expect(res.ready).toBe(true);
    expect(res.counts.errors).toBe(0);
    expect(res.missingCoverage).toEqual([]);
    expect(res.disciplinesPresent).toEqual(['pharmacokinetics', 'pharmacology', 'toxicology']);
  });
});

describe('runM4NonclinicalQc — coverage', () => {
  it('warns (default) on a missing recommended study type, staying ready', () => {
    const res = runM4NonclinicalQc({ reports: fullProgram().filter((r) => r.studyType !== 'genotoxicity') });
    expect(res.ready).toBe(true);
    expect(res.missingCoverage).toContain('genotoxicity');
    expect(res.findings.some((f) => f.code === 'COVERAGE')).toBe(true);
  });

  it('blocks when requireCoverage makes a gap an error', () => {
    const res = runM4NonclinicalQc({
      reports: fullProgram().filter((r) => r.studyType !== 'genotoxicity'),
      requireCoverage: true,
    });
    expect(res.ready).toBe(false);
    expect(res.findings.find((f) => f.code === 'COVERAGE')?.severity).toBe('error');
  });
});

describe('runM4NonclinicalQc — sections', () => {
  it('errors on a required section that is missing', () => {
    const program = fullProgram();
    program[3] = report({ studyId: 'TX-1', studyType: 'repeat_dose_tox', glpStatus: 'GLP', sections: sections(false) });
    const res = runM4NonclinicalQc({ reports: program });
    expect(res.ready).toBe(false);
    expect(res.findings.some((f) => f.code === 'SECTION_MISSING' && f.studyId === 'TX-1')).toBe(true);
  });

  it('warns on a partially rendered required section', () => {
    const program = fullProgram();
    program[0].sections = [{ number: '5', title: 'Results', required: true, status: 'partial' }];
    const res = runM4NonclinicalQc({ reports: program });
    expect(res.ready).toBe(true);
    expect(res.findings.some((f) => f.code === 'SECTION_PARTIAL')).toBe(true);
  });
});

describe('runM4NonclinicalQc — structure coverage', () => {
  // A report carrying only §1 omits required NSR sections 2–7.
  const sparse = (): M4StudyReportInput[] => [
    report({ studyId: 'TX-1', studyType: 'repeat_dose_tox', glpStatus: 'GLP', sections: [{ number: '1', title: 'Title Page', required: true, status: 'rendered' }] }),
  ];

  it('warns by default on an entirely absent required section (stays ready)', () => {
    const res = runM4NonclinicalQc({ reports: sparse(), expectedStudyTypes: ['repeat_dose_tox'] });
    expect(res.ready).toBe(true);
    expect(res.findings.some((f) => f.code === 'SECTION_ABSENT')).toBe(true);
  });

  it('errors on an absent required section under requireFullStructure', () => {
    const res = runM4NonclinicalQc({ reports: sparse(), expectedStudyTypes: ['repeat_dose_tox'], requireFullStructure: true });
    expect(res.ready).toBe(false);
    expect(res.findings.some((f) => f.code === 'SECTION_ABSENT' && f.severity === 'error')).toBe(true);
  });
});

describe('runM4NonclinicalQc — placement, GLP, structure', () => {
  it('errors when the CTD 4.2.x placement is wrong for the study type', () => {
    const program = fullProgram();
    program[3] = report({ studyId: 'TX-1', studyType: 'repeat_dose_tox', reportSection: '4.2.2', glpStatus: 'GLP' });
    const res = runM4NonclinicalQc({ reports: program });
    expect(res.ready).toBe(false);
    const placement = res.findings.find((f) => f.code === 'PLACEMENT' && f.studyId === 'TX-1');
    expect(placement?.message).toContain('4.2.3.2');
  });

  it('errors on empty placement', () => {
    const res = runM4NonclinicalQc({
      reports: [{ studyId: 'TX-1', studyType: 'repeat_dose_tox', reportSection: '', sections: sections(), glpStatus: 'GLP' }],
      expectedStudyTypes: ['repeat_dose_tox'],
    });
    expect(res.findings.some((f) => f.code === 'PLACEMENT')).toBe(true);
  });

  it('warns on a non-GLP toxicology study', () => {
    const program = fullProgram();
    program[3] = report({ studyId: 'TX-1', studyType: 'repeat_dose_tox', glpStatus: 'non-GLP' });
    const res = runM4NonclinicalQc({ reports: program });
    expect(res.ready).toBe(true);
    expect(res.findings.some((f) => f.code === 'GLP' && f.studyId === 'TX-1')).toBe(true);
  });

  it('errors on a duplicate study id', () => {
    const res = runM4NonclinicalQc({
      reports: [
        report({ studyId: 'TX-1', studyType: 'repeat_dose_tox', glpStatus: 'GLP' }),
        report({ studyId: 'TX-1', studyType: 'repeat_dose_tox', glpStatus: 'GLP' }),
      ],
      expectedStudyTypes: ['repeat_dose_tox'],
    });
    expect(res.findings.some((f) => f.code === 'DUPLICATE')).toBe(true);
    expect(res.ready).toBe(false);
  });
});
