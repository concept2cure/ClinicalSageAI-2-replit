/**
 * Tests for the WHO ICTRP Trial Registration Data Set projection. The record is exactly the
 * 24 TRDS v1.3.1 items in official order; items a study design carries (titles, countries,
 * condition, interventions, criteria, study type, sample size, outcomes) render from the
 * design and name what they lack; the fourteen registration-only items (ids, dates, sponsors,
 * funders, contacts, status, ethics, results, IPD) are always missing with one exact gap and
 * are never filled from anything the design happens to hold — not its id, its programme id,
 * or an NCT number it cites as evidence.
 */

import { describe, it, expect } from 'vitest';
import {
  projectWhoIctrp,
  NOT_CARRIED_BY_DESIGN,
  WHO_ICTRP_BASIS,
  WHO_TRDS_ITEMS,
  WHO_TRDS_REGISTRATION_ONLY_ITEMS,
  WHO_TRDS_VERSION,
  type WhoIctrpRecord,
  type WhoTrdsItem,
} from '../who-ictrp-registration';
import { type StudyDesign } from '../study-design-types';

const OFFICIAL_NAMES = [
  'Primary Registry and Trial Identifying Number',
  'Date of Registration in Primary Registry',
  'Secondary Identifying Numbers',
  'Source(s) of Monetary or Material Support',
  'Primary Sponsor',
  'Secondary Sponsor(s)',
  'Contact for Public Queries',
  'Contact for Scientific Queries',
  'Public Title',
  'Scientific Title',
  'Countries of Recruitment',
  'Health Condition(s) or Problem(s) Studied',
  'Intervention(s)',
  'Key Inclusion and Exclusion Criteria',
  'Study Type',
  'Date of First Enrollment',
  'Sample Size',
  'Recruitment Status',
  'Primary Outcome(s)',
  'Key Secondary Outcomes',
  'Ethics Review',
  'Completion Date',
  'Summary Results',
  'IPD Sharing Statement',
];

const REGISTRATION_ONLY = [1, 2, 3, 4, 5, 6, 7, 8, 16, 18, 21, 22, 23, 24];

/** Everything a design can carry, plus identifiers that must never leak into registry items. */
function completeDesign(): StudyDesign {
  return {
    id: 'sd-0001',
    programId: 'prog-acme-dx',
    organizationId: 42,
    title: 'A randomised, double-blind, placebo-controlled phase 3 study of Drug X in type 2 diabetes',
    phase: '3',
    indication: 'Type 2 diabetes mellitus',
    productType: 'drug',
    targetRegions: ['Germany', 'India', 'Germany', ' '],
    objectives: [{ level: 'primary', order: 1, text: 'Demonstrate superiority on HbA1c', endpointName: 'HbA1c change' }],
    estimands: [],
    endpoints: [
      { name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'change from baseline in HbA1c', measurementMethod: 'central laboratory', timepoint: 'week 24' },
      { name: 'Body weight change', role: 'key_secondary', type: 'continuous', definition: 'change from baseline in body weight', timepoint: 'week 24' },
      { name: 'FPG change', role: 'secondary', type: 'continuous', definition: 'change in fasting plasma glucose', timepoint: 'week 24' },
      { name: 'Hypoglycaemia', role: 'safety', type: 'count', definition: 'confirmed hypoglycaemic events', timepoint: 'week 26' },
      { name: 'Biomarker Z', role: 'exploratory', type: 'continuous', definition: 'change in biomarker Z', timepoint: 'week 24' },
    ],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: {
      targetDescription: 'adults with type 2 diabetes',
      analysisPopulations: [{ kind: 'ITT', definition: 'all randomized' }],
      eligibility: [
        { type: 'inclusion', text: 'Age 18-75 years' },
        { type: 'inclusion', text: 'HbA1c 7.0-10.5%' },
        { type: 'exclusion', text: 'eGFR < 30 mL/min/1.73m2' },
      ],
    },
    arms: [
      { name: 'Drug X', interventions: [{ name: 'Drug X', role: 'investigational', dose: '10 mg', route: 'oral', regimen: 'once daily', duration: '24 weeks' }] },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo', route: 'oral', regimen: 'once daily', duration: '24 weeks' }] },
    ],
    randomization: { ratio: [1, 1], allocationMethod: 'stratified', blinding: 'double' },
    statisticalPlan: { alpha: 0.05, power: 0.9, plannedSampleSize: 400, plannedAnalyses: [] },
    evidence: [{ kind: 'precedent', source: 'Prior phase 2 trial', ref: 'NCT01234567' }],
  };
}

function clone(d: StudyDesign): StudyDesign {
  return JSON.parse(JSON.stringify(d));
}

function item(rec: WhoIctrpRecord, n: number): WhoTrdsItem {
  const found = rec.items.find(i => i.number === n);
  if (!found) throw new Error(`item ${n} absent`);
  return found;
}

describe('WHO TRDS item list', () => {
  it('is version 1.3.1 with exactly 24 items in official order and official names', () => {
    expect(WHO_TRDS_VERSION).toBe('1.3.1');
    expect(WHO_TRDS_ITEMS).toHaveLength(24);
    expect(WHO_TRDS_ITEMS.map(i => i.number)).toEqual(Array.from({ length: 24 }, (_, k) => k + 1));
    expect(WHO_TRDS_ITEMS.map(i => i.name)).toEqual(OFFICIAL_NAMES);
  });

  it('declares exactly the fourteen registration-only items', () => {
    expect([...WHO_TRDS_REGISTRATION_ONLY_ITEMS]).toEqual(REGISTRATION_ONLY);
  });
});

describe('projectWhoIctrp — record shape', () => {
  it('returns all 24 items in official order, with registry, version and basis', () => {
    const rec = projectWhoIctrp(completeDesign());
    expect(rec.registry).toBe('WHO ICTRP (TRDS)');
    expect(rec.version).toBe('1.3.1');
    expect(rec.basis).toBe(WHO_ICTRP_BASIS);
    expect(rec.basis).toMatch(/TRDS\) v1\.3\.1 — 24 items; ICMJE/);
    expect(rec.items).toHaveLength(24);
    expect(rec.items.map(i => i.number)).toEqual(Array.from({ length: 24 }, (_, k) => k + 1));
    expect(rec.items.map(i => i.name)).toEqual(OFFICIAL_NAMES);
  });

  it('summary counts are tallied from the items and sum to 24', () => {
    for (const d of [completeDesign(), { ...completeDesign(), arms: [], endpoints: [], targetRegions: [] }]) {
      const rec = projectWhoIctrp(d);
      const { rendered, partial, missing, total } = rec.summary;
      expect(total).toBe(24);
      expect(rendered + partial + missing).toBe(24);
      expect(rendered).toBe(rec.items.filter(i => i.status === 'rendered').length);
      expect(partial).toBe(rec.items.filter(i => i.status === 'partial').length);
      expect(missing).toBe(rec.items.filter(i => i.status === 'missing').length);
    }
    expect(projectWhoIctrp(completeDesign()).summary).toEqual({ rendered: 6, partial: 3, missing: 15, total: 24 });
  });

  it('every non-rendered item carries a gap, every item with a value names its source', () => {
    for (const i of projectWhoIctrp(completeDesign()).items) {
      if (i.status !== 'rendered') expect(i.gap).toBeTruthy();
      if (i.status === 'missing') expect(i.value).toBeNull();
      else expect(i.source).toBeTruthy();
    }
  });
});

describe('projectWhoIctrp — design-carried items', () => {
  it('a complete design renders every design-carried item', () => {
    const rec = projectWhoIctrp(completeDesign());
    expect(item(rec, 10)).toMatchObject({ status: 'rendered', value: completeDesign().title, source: 'StudyDesign.title' });
    expect(item(rec, 12)).toMatchObject({ status: 'rendered', value: 'Type 2 diabetes mellitus' });
    expect(item(rec, 13)).toMatchObject({
      status: 'rendered',
      value: [
        'Drug X: Drug X 10 mg oral once daily; duration 24 weeks (investigational)',
        'Placebo: Placebo oral once daily; duration 24 weeks (placebo)',
      ],
    });
    expect(item(rec, 17)).toMatchObject({ status: 'rendered', value: '400' });
    expect(item(rec, 19)).toMatchObject({
      status: 'rendered',
      value: ['HbA1c change: change from baseline in HbA1c; method: central laboratory; timepoint: week 24'],
    });
    expect(item(rec, 20)).toMatchObject({
      status: 'rendered',
      value: ['Body weight change: change from baseline in body weight; timepoint: week 24'],
    });
    for (const n of [10, 11, 12, 13, 14, 15, 17, 19, 20]) {
      expect(item(rec, n).status).not.toBe('missing');
    }
  });

  it('item 11 renders target regions verbatim (trimmed, de-duplicated) as partial, never as confirmed countries', () => {
    const i = item(projectWhoIctrp(completeDesign()), 11);
    expect(i.status).toBe('partial');
    expect(i.value).toEqual(['Germany', 'India']);
    expect(i.gap).toMatch(/does not state that each entry is a country of recruitment/);
  });

  it('item 11 is missing when the design carries no target regions', () => {
    const d = completeDesign();
    delete d.targetRegions;
    const i = item(projectWhoIctrp(d), 11);
    expect(i).toMatchObject({ status: 'missing', value: null });
    expect(i.gap).toMatch(/targetRegions records no country or region/);
  });

  it('item 14 renders every criterion and the stated age bounds, and names sex as absent', () => {
    const i = item(projectWhoIctrp(completeDesign()), 14);
    expect(i.status).toBe('partial');
    expect(i.value).toEqual([
      'Inclusion: Age 18-75 years',
      'Inclusion: HbA1c 7.0-10.5%',
      'Exclusion: eGFR < 30 mL/min/1.73m2',
      'Minimum age: 18 years (inclusive)',
      'Maximum age: 75 years (inclusive)',
    ]);
    expect(i.gap).toMatch(/^Sex: .*declares no field that records it\.$/);
  });

  it('item 14 invents no age bound when no criterion states one, and is missing with no criteria', () => {
    const d = completeDesign();
    d.population.eligibility = [{ type: 'inclusion', text: 'Adults with type 2 diabetes' }];
    const i = item(projectWhoIctrp(d), 14);
    expect(i.status).toBe('partial');
    expect(i.value).toEqual(['Inclusion: Adults with type 2 diabetes']);
    expect(i.gap).toMatch(/No exclusion criterion is recorded\./);
    expect(i.gap).toMatch(/Minimum age: No inclusion criterion states an? lower age bound/);
    expect((i.value as string[]).some(v => /age/i.test(v) && /Minimum|Maximum/.test(v))).toBe(false);

    d.population.eligibility = [];
    expect(item(projectWhoIctrp(d), 14)).toMatchObject({ status: 'missing', value: null, gap: 'The design records no eligibility criteria.' });
  });
});

describe('projectWhoIctrp — study type, interventions, sample size', () => {
  it('item 15 renders type, allocation, masking, assignment and phase as stated, and names purpose as absent', () => {
    const i = item(projectWhoIctrp(completeDesign()), 15);
    expect(i.status).toBe('partial');
    expect(i.value).toEqual([
      'Study type: Interventional',
      'Allocation: Randomized (stratified)',
      'Masking: Double blind',
      'Assignment: Parallel',
      'Phase: 3',
    ]);
    expect(i.gap).toMatch(/Who is masked is not recorded/);
    expect(i.gap).toMatch(/Purpose \(treatment, prevention, diagnostic, …\) is not recorded/);
  });

  it('item 15 maps no structural design outside the TRDS assignment categories', () => {
    const d = completeDesign();
    d.framework.structuralDesign = 'adaptive';
    d.phase = '2b';
    d.randomization = { ratio: [1, 1], allocationMethod: 'none', blinding: 'open' };
    const i = item(projectWhoIctrp(d), 15);
    expect(i.value).toEqual(['Study type: Interventional', 'Allocation: Non-randomized', 'Masking: None (open label)', 'Phase: 2 (recorded as 2b)']);
    expect(i.gap).toMatch(/structural design "adaptive" is not one of the TRDS assignment categories/);
    expect(i.gap).not.toMatch(/Who is masked/);
  });

  it('item 15 does not state a study type when no arm assigns an intervention', () => {
    const d = completeDesign();
    d.arms = [];
    delete d.randomization;
    const i = item(projectWhoIctrp(d), 15);
    expect(i.value).toEqual(['Assignment: Parallel', 'Phase: 3']);
    expect(i.gap).toMatch(/Study type is not stated/);
    expect(i.gap).toMatch(/Allocation is not stated/);
    expect(i.gap).toMatch(/Masking is not stated/);
  });

  it('item 13 is partial when an arm has no intervention and missing with no arms', () => {
    const d = completeDesign();
    d.arms.push({ name: 'Observation', interventions: [] });
    const i = item(projectWhoIctrp(d), 13);
    expect(i.status).toBe('partial');
    expect((i.value as string[])[2]).toBe('Observation: (no intervention recorded)');
    expect(i.gap).toBe('No intervention is recorded for arm(s): Observation.');

    d.arms = [];
    expect(item(projectWhoIctrp(d), 13)).toMatchObject({ status: 'missing', value: null });
  });

  it('sample size is missing when plannedSampleSize is absent or not a positive whole number', () => {
    const d = completeDesign();
    delete d.statisticalPlan.plannedSampleSize;
    const absent = item(projectWhoIctrp(d), 17);
    expect(absent).toMatchObject({ status: 'missing', value: null });
    expect(absent.gap).toBe('StudyDesign.statisticalPlan.plannedSampleSize is not recorded.');
    expect(absent.source).toBeUndefined();

    for (const bad of [0, -10, 123.5]) {
      d.statisticalPlan.plannedSampleSize = bad;
      const i = item(projectWhoIctrp(d), 17);
      expect(i).toMatchObject({ status: 'missing', value: null });
      expect(i.gap).toMatch(/is not a positive whole number/);
    }
  });
});

describe('projectWhoIctrp — outcomes split by role', () => {
  it('primary endpoints go to item 19 only and key secondaries to item 20 only', () => {
    const rec = projectWhoIctrp(completeDesign());
    const primary = (item(rec, 19).value as string[]).join(' | ');
    const keySecondary = (item(rec, 20).value as string[]).join(' | ');
    expect(primary).toMatch(/HbA1c change/);
    expect(primary).not.toMatch(/Body weight change/);
    expect(keySecondary).toMatch(/Body weight change/);
    expect(keySecondary).not.toMatch(/HbA1c change/);
    for (const other of ['FPG change', 'Hypoglycaemia', 'Biomarker Z']) {
      expect(primary).not.toContain(other);
      expect(keySecondary).not.toContain(other);
    }
  });

  it('a plain secondary endpoint is not promoted to a key secondary outcome', () => {
    const d = completeDesign();
    d.endpoints = d.endpoints.filter(e => e.role !== 'key_secondary');
    const i = item(projectWhoIctrp(d), 20);
    expect(i).toMatchObject({ status: 'missing', value: null });
    expect(i.gap).toBe('No endpoint has role "key_secondary". 1 endpoint(s) with role "secondary" are not promoted to key secondary outcomes.');
  });

  it('an outcome without a timepoint is partial; the Schedule of Activities supplies one when it collects the endpoint', () => {
    const d = completeDesign();
    delete d.endpoints[0].timepoint;
    const untimed = item(projectWhoIctrp(d), 19);
    expect(untimed.status).toBe('partial');
    expect(untimed.gap).toBe('Timepoint is not recorded for: HbA1c change.');

    d.scheduleOfActivities = {
      epochs: [{ id: 'e1', name: 'Treatment', kind: 'treatment', order: 0 }],
      visits: [{ id: 'V9', name: 'Week 24', epochId: 'e1', studyDay: 168, order: 0 }],
      activities: [{ id: 'a1', name: 'HbA1c', category: 'efficacy', endpointNames: ['HbA1c change'], order: 0 }],
      cells: [{ activityId: 'a1', visitId: 'V9', state: 'performed' }],
    };
    const timed = item(projectWhoIctrp(d), 19);
    expect(timed.status).toBe('rendered');
    expect((timed.value as string[])[0]).toMatch(/timepoint: Week 24 \(day 168\)$/);
  });

  it('primary outcome is missing when no endpoint has the primary role', () => {
    const d = completeDesign();
    d.endpoints = d.endpoints.filter(e => e.role !== 'primary');
    expect(item(projectWhoIctrp(d), 19)).toMatchObject({ status: 'missing', value: null, gap: 'No endpoint has role "primary".' });
  });
});

describe('projectWhoIctrp — never fabricates', () => {
  it('registration-only items are always missing with the exact gap, whatever the design holds', () => {
    const sparse = { ...completeDesign(), title: '', indication: '', arms: [], endpoints: [], targetRegions: [] };
    for (const d of [completeDesign(), sparse]) {
      const rec = projectWhoIctrp(d);
      for (const n of REGISTRATION_ONLY) {
        const i = item(rec, n);
        expect(i.status).toBe('missing');
        expect(i.value).toBeNull();
        expect(i.gap).toBe(NOT_CARRIED_BY_DESIGN);
        expect(i.gap).toBe('not carried by the study design; supplied at registration');
        expect(i.source).toBeUndefined();
      }
    }
  });

  it('no identifier on the design (id, programme, organisation, evidence NCT ref) appears anywhere in the record', () => {
    const text = JSON.stringify(projectWhoIctrp(completeDesign()));
    for (const leaked of ['sd-0001', 'prog-acme-dx', 'NCT01234567', 'Prior phase 2 trial']) {
      expect(text).not.toContain(leaked);
    }
  });

  it('public title is missing when the design carries no distinct one; the scientific title is not reused', () => {
    const d = completeDesign();
    const i = item(projectWhoIctrp(d), 9);
    expect(i).toMatchObject({ status: 'missing', value: null });
    expect(i.value).not.toBe(d.title);
    expect(i.gap).toMatch(/scientific title is not reused as the public one/);
  });

  it('design-carried items are missing with a reason when the design is silent', () => {
    const d = { ...completeDesign(), title: '', indication: '', arms: [], endpoints: [], targetRegions: [] };
    const rec = projectWhoIctrp(d);
    for (const n of [9, 10, 11, 12, 13, 19, 20]) {
      expect(item(rec, n).status).toBe('missing');
      expect(item(rec, n).gap).toBeTruthy();
    }
  });
});

describe('projectWhoIctrp — determinism', () => {
  it('returns deep-equal output for equal input and does not mutate the design', () => {
    const d = completeDesign();
    const before = clone(d);
    const a = projectWhoIctrp(d);
    const b = projectWhoIctrp(clone(d));
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(d).toEqual(before);
  });
});
