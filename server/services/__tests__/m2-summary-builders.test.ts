/**
 * Unit tests for the M2 summary builders. Focused on buildM25ClinicalOverview
 * (the newly added 2.5 Clinical Overview), which previously had no composer.
 * Pure module — no mocks.
 */

import { describe, it, expect } from 'vitest';

import { buildM25ClinicalOverview, buildM24NonclinicalOverview, buildM23QualityOverallSummary, type CSRSummaryInput } from '../m2-summary-builders';
import { composeModule3FromCanonicalSources } from '../module3Composer';

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

describe('buildM23QualityOverallSummary (QOS via Module 3 composition)', () => {
  it('composes the 2.3.S / 2.3.P QOS from CMC source objects', () => {
    const sections = composeModule3FromCanonicalSources([
      { id: 'ds1', sourceType: 'drug_substance', sourcePayload: { name: 'BX-115', manufacturer: 'Acme' } },
      { id: 'dp1', sourceType: 'drug_product', sourcePayload: { dosageFormDescription: 'tablet', composition: 'API + excipients', strength: '50 mg' } },
    ] as any);
    const qos = buildM23QualityOverallSummary({
      module3Sections: sections,
      drugSubstanceName: 'BX-115',
      drugProductName: 'BX-115 tablets',
    });
    expect(qos.sectionKey).toBe('2.3');
    expect(qos.title).toBe('Quality Overall Summary');
    expect(qos.narrative).toMatch(/2\.3\.S DRUG SUBSTANCE/);
    expect(qos.narrative).toMatch(/2\.3\.P DRUG PRODUCT/);
    expect(qos.completeness).toBeGreaterThanOrEqual(0);
    expect(qos.completeness).toBeLessThanOrEqual(100);
  });
});

describe('buildM25ClinicalOverview', () => {
  it('composes the 2.5.1–2.5.6 critical assessment and leaves the benefit-risk conclusion to the sponsor', () => {
    const r = buildM25ClinicalOverview({
      csrs: [phase1, pivotal],
      indication: 'type 2 diabetes',
      investigationalProduct: 'BX-115',
      developmentRationale: 'Significant unmet need despite available therapies.',
    });
    expect(r.sectionKey).toBe('2.5');
    expect(r.narrative).toMatch(/2\.5\.1 PRODUCT DEVELOPMENT RATIONALE/);
    expect(r.narrative).toMatch(/2\.5\.6 BENEFITS AND RISKS CONCLUSIONS/);
    // This used to assert "the benefit-risk balance is favorable" whenever one
    // pivotal study existed, whatever the SAE and death counts said.
    expect(r.narrative).not.toMatch(/favorable/);
    expect(r.narrative).toMatch(/requires the sponsor's medical and regulatory judgment/);
    expect(r.narrative).toMatch(/BX-301/); // pivotal study cited
    expect(r.gaps).toEqual(['benefit-risk conclusion (sponsor medical/regulatory judgment; not drawn automatically)']);
    // Completeness measures the clinical data present, which is all of it.
    expect(r.completeness).toBe(100);
    expect(r.tables.map(t => t.title)).toContain('Benefit-Risk Safety Overview');
  });

  it('never calls a high-mortality program favorable either', () => {
    const r = buildM25ClinicalOverview({
      csrs: [phase1, { ...pivotal, saeCount: 500, deathCount: 50 }],
      indication: 'type 2 diabetes',
      investigationalProduct: 'BX-115',
    });
    expect(r.narrative).not.toMatch(/favorable/);
    expect(r.narrative).toMatch(/500 serious adverse event\(s\) and 50 death\(s\)/);
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

describe('buildM24NonclinicalOverview — the conclusion is only drawn when nothing is open', () => {
  const study = (studyType: any, id: string) => ({ studyId: id, studyType, primaryFinding: 'No finding of concern.', reportSection: '4.2.1.1' });

  it('does not say the safety profile supports the plan while it lists the missing study categories', () => {
    const r = buildM24NonclinicalOverview({ nonclinicalStudies: [study('pharmacology', 'PH-1')], drugSubstanceName: 'BX-115' });
    expect(r.gaps.length).toBeGreaterThan(0);
    expect(r.narrative).not.toMatch(/supports the proposed clinical investigational plan/);
    expect(r.narrative).toMatch(/incomplete; no conclusion on the proposed clinical investigational plan is drawn pending:/);
  });

  it('draws the conclusion when every category the overview requires is present', () => {
    const all = ['pharmacology', 'safety_pharmacology', 'pharmacokinetics', 'toxicology', 'reproductive_tox', 'genotoxicity', 'carcinogenicity'].map((t, i) => study(t, `S-${i}`));
    const r = buildM24NonclinicalOverview({ nonclinicalStudies: all, drugSubstanceName: 'BX-115' });
    expect(r.gaps).toHaveLength(0);
    expect(r.narrative).toMatch(/supports the proposed clinical investigational plan/);
  });
});
