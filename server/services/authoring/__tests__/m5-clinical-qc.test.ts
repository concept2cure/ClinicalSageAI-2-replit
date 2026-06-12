/**
 * Module 5 clinical assembly QC — coverage (phases), required-section status,
 * CTD 5.3.x placement, structure, and the honest-by-construction verdict.
 */

import { describe, it, expect } from 'vitest';
import { runM5ClinicalQc, type M5CsrInput } from '../m5-clinical-qc';

function sections(allDrafted = true): M5CsrInput['sections'] {
  return [
    { number: '1', title: 'Title Page', required: true, status: 'approved' },
    { number: '11', title: 'Efficacy Evaluation', required: true, status: allDrafted ? 'drafted' : 'empty' },
    { number: '12', title: 'Safety Evaluation', required: true, status: 'reviewed' },
  ];
}

function csr(over: Partial<M5CsrInput> & { studyId: string }): M5CsrInput {
  return {
    phase: '1',
    reportSection: 'm5.3.5.1',
    sections: sections(),
    ...over,
  };
}

describe('runM5ClinicalQc — verdict', () => {
  it('ready when CSRs are well-placed with drafted required sections', () => {
    const res = runM5ClinicalQc({ csrs: [csr({ studyId: 'STUDY-1' }), csr({ studyId: 'STUDY-2', phase: '3', reportSection: 'm5.3.5.1' })] });
    expect(res.ready).toBe(true);
    expect(res.counts.errors).toBe(0);
    expect(res.phasesPresent).toEqual(['1', '3']);
  });
});

describe('runM5ClinicalQc — sections', () => {
  it('errors on a required section that is empty', () => {
    const res = runM5ClinicalQc({ csrs: [csr({ studyId: 'STUDY-1', sections: sections(false) })] });
    expect(res.ready).toBe(false);
    expect(res.findings.some((f) => f.code === 'SECTION_EMPTY' && f.studyId === 'STUDY-1')).toBe(true);
  });

  it('warns (non-blocking) on a required section still drafting', () => {
    const res = runM5ClinicalQc({
      csrs: [csr({ studyId: 'STUDY-1', sections: [{ number: '12', title: 'Safety Evaluation', required: true, status: 'drafting' }] })],
    });
    expect(res.ready).toBe(true);
    expect(res.findings.some((f) => f.code === 'SECTION_DRAFTING')).toBe(true);
  });

  it('ignores non-required sections', () => {
    const res = runM5ClinicalQc({
      csrs: [csr({ studyId: 'STUDY-1', sections: [{ number: '16', title: 'Appendices', required: false, status: 'empty' }] })],
    });
    expect(res.ready).toBe(true);
  });
});

describe('runM5ClinicalQc — placement', () => {
  it('errors when not under Module 5.3.x', () => {
    const res = runM5ClinicalQc({ csrs: [csr({ studyId: 'STUDY-1', reportSection: 'm5.2' })] });
    expect(res.ready).toBe(false);
    expect(res.findings.some((f) => f.code === 'PLACEMENT')).toBe(true);
  });

  it('accepts the 5.3.x form without the m prefix', () => {
    const res = runM5ClinicalQc({ csrs: [csr({ studyId: 'STUDY-1', reportSection: '5.3.5.1' })] });
    expect(res.findings.some((f) => f.code === 'PLACEMENT')).toBe(false);
  });

  it('errors on empty placement', () => {
    const res = runM5ClinicalQc({ csrs: [csr({ studyId: 'STUDY-1', reportSection: '' })] });
    expect(res.findings.some((f) => f.code === 'PLACEMENT')).toBe(true);
  });
});

describe('runM5ClinicalQc — coverage + structure', () => {
  it('errors on a missing expected phase only when expectedPhases is supplied', () => {
    const withReq = runM5ClinicalQc({ csrs: [csr({ studyId: 'STUDY-1', phase: '1' })], expectedPhases: ['1', '3'] });
    expect(withReq.ready).toBe(false);
    expect(withReq.missingPhases).toEqual(['3']);

    const noReq = runM5ClinicalQc({ csrs: [csr({ studyId: 'STUDY-1', phase: '1' })] });
    expect(noReq.ready).toBe(true);
    expect(noReq.missingPhases).toEqual([]);
  });

  it('errors on a duplicate study id', () => {
    const res = runM5ClinicalQc({ csrs: [csr({ studyId: 'STUDY-1' }), csr({ studyId: 'STUDY-1' })] });
    expect(res.findings.some((f) => f.code === 'DUPLICATE')).toBe(true);
    expect(res.ready).toBe(false);
  });
});
