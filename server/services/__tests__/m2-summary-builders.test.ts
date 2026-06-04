/**
 * Unit tests for the M2 summary builders. Focused on buildM25ClinicalOverview
 * (the newly added 2.5 Clinical Overview), which previously had no composer.
 * Pure module — no mocks.
 */

import { describe, it, expect } from 'vitest';

import { buildM25ClinicalOverview, type CSRSummaryInput } from '../m2-summary-builders';

const pivotal: CSRSummaryInput = {
  studyId: 'S3',
  protocolNumber: 'BX-301',
  phase: '3',
  studyDesign: 'randomized, double-blind, placebo-controlled',
  primaryEndpoint: 'change in HbA1c at 24 weeks',
  primaryResult: '-1.2% vs placebo (p<0.001)',
  sampleSize: 600,
  ittPopulation: 590,
  saeCount: 12,
  deathCount: 1,
};
const phase1: CSRSummaryInput = {
  studyId: 'S1',
  protocolNumber: 'BX-101',
  phase: '1',
  studyDesign: 'single ascending dose',
  primaryEndpoint: 'safety and PK',
  primaryResult: 'well tolerated; dose-proportional PK',
  sampleSize: 40,
};

describe('buildM25ClinicalOverview', () => {
  it('composes the 2.5.1–2.5.6 critical assessment with a favorable benefit-risk', () => {
    const r = buildM25ClinicalOverview({
      csrs: [phase1, pivotal],
      indication: 'type 2 diabetes',
      investigationalProduct: 'BX-115',
      developmentRationale: 'Significant unmet need despite available therapies.',
    });
    expect(r.sectionKey).toBe('2.5');
    expect(r.narrative).toMatch(/2\.5\.1 PRODUCT DEVELOPMENT RATIONALE/);
    expect(r.narrative).toMatch(/2\.5\.6 BENEFITS AND RISKS CONCLUSIONS/);
    expect(r.narrative).toMatch(/benefit-risk balance is favorable/);
    expect(r.narrative).toMatch(/BX-301/); // pivotal study cited
    expect(r.gaps).toHaveLength(0);
    expect(r.completeness).toBe(100);
    expect(r.tables.map(t => t.title)).toContain('Benefit-Risk Safety Overview');
  });

  it('declines to conclude benefit-risk when there is no pivotal efficacy study', () => {
    const r = buildM25ClinicalOverview({
      csrs: [phase1],
      indication: 'type 2 diabetes',
      investigationalProduct: 'BX-115',
    });
    expect(r.gaps).toContain('pivotal (Phase 3) efficacy evidence');
    expect(r.narrative).toMatch(/cannot be concluded/);
    expect(r.completeness).toBeLessThan(100);
  });

  it('flags every gap for an empty clinical program', () => {
    const r = buildM25ClinicalOverview({ csrs: [], indication: 'x', investigationalProduct: 'y' });
    expect(r.gaps.length).toBeGreaterThanOrEqual(4);
    expect(r.tables).toHaveLength(0);
    expect(r.narrative).toMatch(/no clinical data/i);
  });
});
