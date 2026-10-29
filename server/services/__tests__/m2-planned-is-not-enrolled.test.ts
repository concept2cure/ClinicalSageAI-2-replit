/**
 * Module 2 never presents a planned sample size as subjects enrolled or exposed
 * (CSR path review, 2026-10-29).
 *
 * CSRSummaryInput.sampleSize is documented as enrolled subjects, but its one
 * producer (csr/load-csr-inputs-for-project.ts) filled it from the CSR build
 * request's study information: the planned size. So the Clinical Overview
 * wrote "The safety database comprises 600 subjects enrolled" from a plan,
 * and counted it as exposure. A planned size now travels as itself.
 */
import { describe, expect, it } from 'vitest';
import { buildM25ClinicalOverview, buildM27ClinicalSummary, type CSRSummaryInput } from '../m2-summary-builders';

const planned: CSRSummaryInput = {
  studyId: 'X-301', protocolNumber: 'X-301', phase: '3',
  studyDesign: 'randomized, double-blind, placebo-controlled',
  primaryEndpoint: 'global cure at week 8', primaryResult: 'See §11.4 (Efficacy Results) of the CSR for tabulated results.',
  sampleSize: null, plannedSampleSize: 600, pivotal: true,
};
const ctx = { indication: 'recurrent C. difficile infection', investigationalProduct: 'Drug X' };

describe('a planned sample size is not an enrolled one', () => {
  it('the Clinical Overview says enrolled is not recorded, names the plan, and counts no exposure', () => {
    const r = buildM25ClinicalOverview({ csrs: [planned], ...ctx });
    expect(r.narrative).not.toMatch(/600 subjects/);
    expect(r.narrative).toMatch(/enrolled not recorded; planned 600/);
    expect(r.gaps).toContain('safety database (no exposure data)');
  });

  it('the Clinical Summary says the same', () => {
    const r = buildM27ClinicalSummary({ csrs: [planned], ...ctx });
    expect(r.narrative).not.toMatch(/n=600\b/);
    expect(r.narrative).toMatch(/n=\[enrolled not recorded; planned 600\]/);
  });

  it('a recorded enrolled size still reads as it did', () => {
    const r = buildM27ClinicalSummary({ csrs: [{ ...planned, sampleSize: 23, plannedSampleSize: 600 }], ...ctx });
    expect(r.narrative).toMatch(/n=23\b/);
    expect(r.narrative).not.toMatch(/planned 600/);
  });
});
