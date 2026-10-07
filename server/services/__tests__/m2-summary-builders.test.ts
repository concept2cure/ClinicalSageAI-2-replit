/**
 * Unit tests for the M2 summary builders. Focused on buildM25ClinicalOverview
 * (the newly added 2.5 Clinical Overview), which previously had no composer.
 * Pure module — no mocks.
 */

import { describe, it, expect } from 'vitest';

import { buildM25ClinicalOverview, buildM24NonclinicalOverview, buildM27ClinicalSummary, buildM23QualityOverallSummary, type CSRSummaryInput } from '../m2-summary-builders';
import { composeModule3FromCanonicalSources, type CanonicalSource } from '../module3Composer';
import { assessRecordedTrending, inspectRecordedSeriesCriterion, unassignedObservations, type StabilityPointRecord } from '../cmc/recorded-stability';

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
  // Extracted and zero, not "never extracted".
  saeCount: 0,
  deathCount: 0,
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

const condition = '25°C/60%RH';
const shortTimes = [0, 3, 6, 9, 12, 18, 24];
const monthlyTimes = Array.from({ length: 37 }, (_, index) => index);
const materials = ['drug_substance', 'drug_product'] as const;
type Material = typeof materials[number];
const points = (times: number[], parameter = 'Assay'): StabilityPointRecord[] => times.map((timePoint, index) => ({
  timePoint, parameter, result: 100 - timePoint * 0.1 + [0.03, -0.02, 0.01][index % 3], specification: '>= 95%',
}));
const unnamed = (timePoint: number): StabilityPointRecord => ({ timePoint, parameter: '', result: 99, specification: '>= 95%' });
const source = (material: Material, times: number[], results: StabilityPointRecord[], id = 41): CanonicalSource => ({
  id: `recorded-study-${id}`, sourceType: 'stability', sourceHash: `fixture-hash-${id}`,
  sourcePayload: {
    studyName: 'Recorded LT', stabilityScope: material,
    storageCondition: condition, storageConditions: [condition], timePoints: times,
    drugSubstanceTimePoints: material === 'drug_substance' ? times : null,
    drugSubstanceStorageCondition: material === 'drug_substance' ? condition : null,
    shelfLifeClaim: '24 months', drugProductShelfLifeClaim: material === 'drug_product' ? '24 months' : null,
    batchesStudied: [`B${id}`], results,
  },
});
const compose = (material: Material, sources: CanonicalSource[]) => {
  const sourcesBefore = globalThis.structuredClone(sources);
  const sections = composeModule3FromCanonicalSources(sources);
  const upstream = sections.find(section => section.sectionKey === (material === 'drug_substance' ? '3.2.S.7' : '3.2.P.8'))!;
  const sectionsBefore = globalThis.structuredClone(sections);
  const qos = buildM23QualityOverallSummary({ module3Sections: sections });
  const heading = material === 'drug_substance' ? '2.3.S.7 Stability' : '2.3.P.8 Stability';
  const paragraph = qos.narrative.split(`${heading}\n`)[1].split('\n\n')[0];
  expect(sources).toEqual(sourcesBefore);
  expect(sections).toEqual(sectionsBefore);
  const results = upstream.tables.find(table => table.title.startsWith('Stability Results'))!;
  expect(results.rows).toHaveLength(sources.reduce((count, study) => count + study.sourcePayload.results.length, 0));
  expect(results.rows.every(row => row[6] === 'within')).toBe(true);
  return { upstream, paragraph };
};

describe('QOS preserves the upstream stability qualification', () => {
  it.each(materials)('keeps the %s hold and row reason after a recorded monthly schedule', material => {
    const results = [...points(monthlyTimes), unnamed(36)];
    const { upstream, paragraph } = compose(material, [source(material, monthlyTimes, results)]);
    expect(upstream.narrativeDraft).toMatch(/All 38 recorded result\(s\).*within their recorded acceptance criteria/);
    expect(upstream.narrativeDraft).toMatch(/NOT established/);
    expect(upstream.narrativeDraft).toMatch(/recorded-study-41, row 38:.*no assigned parameter/);
    expect(paragraph).toContain('NOT established');
    expect(paragraph).toMatch(/recorded-study-41, row 38:.*no assigned parameter/);
    expect(paragraph).toBe(upstream.narrativeDraft);
  });

  it.each(materials)('retains the complete %s source/row reason when a short hold already fits', material => {
    const results = [...points(shortTimes), unnamed(24)];
    const reason = `Stability source recorded-study-41, row 8: ${unassignedObservations(results)[0].reason}`;
    const { upstream, paragraph } = compose(material, [source(material, shortTimes, results)]);
    expect(upstream.narrativeDraft).toContain(reason);
    expect(paragraph).toContain('NOT established');
    expect(paragraph).toContain(reason);
    expect(paragraph).toBe(upstream.narrativeDraft);
  });

  it.each(materials)('retains the existing %s criterion-conflict reason', material => {
    const results = points(shortTimes).map((point, index) => ({ ...point, specification: index < 3 ? '>= 95%' : '>= 90%' }));
    const reason = inspectRecordedSeriesCriterion(results).reason!;
    const { upstream, paragraph } = compose(material, [source(material, shortTimes, results)]);
    expect(reason).toContain('different acceptance criteria');
    expect(upstream.narrativeDraft).toContain(reason);
    expect(upstream.narrativeDraft).toContain('NOT established');
    expect(paragraph).toContain(reason);
    expect(paragraph).toBe(upstream.narrativeDraft);
  });

  it.each(materials)('retains a named unestimable %s trend without changing its assessment', material => {
    const water = points(shortTimes, 'Water').slice(0, 2).map(point => ({ ...point, result: 0.3, specification: '<= 2%' }));
    const results = [...points(shortTimes), ...water];
    const trend = assessRecordedTrending({ id: 41, storageConditions: [condition], stabilityData: results });
    if (!trend.ok) throw new Error(trend.error);
    const waterTrend = trend.data.series.find(series => series.parameter === 'Water')!.outcome;
    expect(waterTrend.ok).toBe(false);
    if (waterTrend.ok) throw new Error('Expected the existing short-series refusal');
    const reason = `Water (${condition}): trend not assessed: ${waterTrend.detail}.`;
    const { upstream, paragraph } = compose(material, [source(material, shortTimes, results)]);
    expect(upstream.narrativeDraft).toContain(reason);
    expect(paragraph).toContain(reason);
    expect(paragraph).toBe(upstream.narrativeDraft);
  });

  it.each(materials)('retains a later %s study’s source and row refusal', material => {
    const laterResults = [unnamed(36)];
    const reason = `Stability source recorded-study-42, row 1: ${unassignedObservations(laterResults)[0].reason}`;
    const { upstream, paragraph } = compose(material, [
      source(material, monthlyTimes, points(monthlyTimes)), source(material, monthlyTimes, laterResults, 42),
    ]);
    expect(upstream.narrativeDraft).toContain(reason);
    expect(upstream.narrativeDraft).toContain('NOT established');
    expect(paragraph).toContain(reason);
    expect(paragraph).toBe(upstream.narrativeDraft);
  });

  it.each(materials)('keeps a valid %s monthly series and its trend without inventing a hold', material => {
    const { upstream, paragraph } = compose(material, [source(material, monthlyTimes, points(monthlyTimes))]);
    expect(upstream.narrativeDraft).toContain('supporting stability of');
    expect(upstream.narrativeDraft).toContain('no out-of-trend points');
    expect(paragraph).not.toMatch(/NOT established|no assigned parameter|trend not assessed/);
    expect(paragraph).toBe(upstream.narrativeDraft);
  });

  it('keeps headline tables, input keys, gaps and completeness for the supplied stability sections', () => {
    const sources = materials.map(material => source(material, shortTimes, points(shortTimes)));
    const sourcesBefore = globalThis.structuredClone(sources);
    const stabilitySections = composeModule3FromCanonicalSources(sources).filter(section => ['3.2.S.7', '3.2.P.8'].includes(section.sectionKey));
    const sectionsBefore = globalThis.structuredClone(stabilitySections);
    const qos = buildM23QualityOverallSummary({ module3Sections: stabilitySections });
    expect(qos.inputSectionKeys).toEqual(['3.2.S.7', '3.2.P.8']);
    expect(qos.gaps).toEqual(['3.2.S.1', '3.2.S.2', '3.2.S.3', '3.2.S.4', '3.2.P.1', '3.2.P.2', '3.2.P.3', '3.2.P.5']);
    expect(qos.completeness).toBe(20);
    expect(qos.tables).toEqual(stabilitySections.map(section => section.tables[0]));
    expect(sources).toEqual(sourcesBefore);
    expect(stabilitySections).toEqual(sectionsBefore);
  });

  it('keeps missing-section placeholders and absence metadata', () => {
    const qos = buildM23QualityOverallSummary({ module3Sections: [] });
    expect(qos.narrative).toContain('[Section 3.2.S.7 not yet composed — stability data missing]');
    expect(qos.narrative).toContain('[Section 3.2.P.8 not yet composed]');
    expect(qos.inputSectionKeys).toEqual([]);
    expect(qos.gaps).toHaveLength(10);
    expect(qos.completeness).toBe(0);
    expect(qos.tables).toEqual([]);
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

describe('SAE and death counts that were never extracted are not "0 reported"', () => {
  const noCounts = { ...pivotal, saeCount: undefined, deathCount: undefined } as CSRSummaryInput;

  it('2.7 says the counts were not extracted, records the gap, and prints the gaps in the narrative', () => {
    const r = buildM27ClinicalSummary({ csrs: [phase1, noCounts], indication: 'type 2 diabetes', investigationalProduct: 'BX-115' });
    expect(r.narrative).toMatch(/SAE and death counts have not been extracted for 1 of 2 study/);
    expect(r.narrative).not.toMatch(/0 serious adverse event\(s\) and 0 death\(s\) reported/);
    expect(r.narrative).not.toMatch(/\b0 SAE\(s\) reported/);
    expect(r.gaps).toContain('SAE and death counts not extracted for 1 of 2 study/ies');
    expect(r.narrative).toMatch(/Open items: .*not extracted/);
  });

  it('2.7 states extracted zeros as zeros', () => {
    const r = buildM27ClinicalSummary({ csrs: [phase1, { ...pivotal, saeCount: 0, deathCount: 0 }], indication: 'type 2 diabetes', investigationalProduct: 'BX-115' });
    expect(r.narrative).toMatch(/0 serious adverse event\(s\) and 0 death\(s\) reported/);
    expect(r.gaps.some((g) => /not extracted/.test(g))).toBe(false);
  });

  it('2.7 does not claim efficacy was evaluated when there is no controlled study', () => {
    const r = buildM27ClinicalSummary({ csrs: [phase1], indication: 'type 2 diabetes', investigationalProduct: 'BX-115' });
    expect(r.narrative).not.toMatch(/Efficacy was evaluated in 0/);
    expect(r.narrative).toMatch(/No controlled efficacy study available/);
  });

  it('2.5 carries the same distinction into the safety overview and the benefit-risk data', () => {
    const r = buildM25ClinicalOverview({ csrs: [phase1, noCounts], indication: 'type 2 diabetes', investigationalProduct: 'BX-115' });
    expect(r.narrative).toMatch(/SAE and death counts have not been extracted for 1 of 2 study/);
    expect(r.narrative).not.toMatch(/with 0 serious adverse event/);
    expect(r.gaps).toContain('SAE and death counts not extracted for 1 of 2 study/ies');
  });
});

describe('a sample size that was never recorded is not "n=0"', () => {
  const unsized = { ...pivotal, sampleSize: null, ittPopulation: undefined } as CSRSummaryInput;

  it('2.5 prints the study as not recorded and qualifies the exposure total', () => {
    const r = buildM25ClinicalOverview({ csrs: [phase1, unsized], indication: 'type 2 diabetes', investigationalProduct: 'BX-115' });
    expect(r.narrative).toMatch(/BX-301 \(Phase 3, n=\[sample size not recorded\]\)/);
    expect(r.narrative).not.toMatch(/n=0\b/);
    expect(r.gaps).toContain('sample size not recorded for 1 study/ies — the exposure total excludes them');
    const table = r.tables?.find(t => t.rows.some(row => row[0] === 'BX-301'));
    expect(table?.rows.find(row => row[0] === 'BX-301')?.[3]).toBe('[not recorded]');
  });

  it('2.7 prints the study as not recorded and records the gap', () => {
    const r = buildM27ClinicalSummary({ csrs: [phase1, unsized], indication: 'type 2 diabetes', investigationalProduct: 'BX-115' });
    expect(r.narrative).toMatch(/n=\[sample size not recorded\]/);
    expect(r.narrative).not.toMatch(/n=0\b/);
    expect(r.gaps).toContain('sample size not recorded for 1 study/ies — the exposure total excludes them');
  });

  it('a recorded size still prints as the number', () => {
    const r = buildM25ClinicalOverview({ csrs: [phase1, pivotal], indication: 'type 2 diabetes', investigationalProduct: 'BX-115' });
    expect(r.narrative).toMatch(/BX-301 \(Phase 3, n=600\)/);
  });
});
