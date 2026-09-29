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
import { interventions, primaryOutcomes, secondaryOutcomes } from '../who-ictrp-arms-outcomes';
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

/** A design value outside the TypeScript union, as JSON loaded from the database can carry. */
function untyped<T>(value: string): T {
  return value as unknown as T;
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

  it('is frozen deeply: the list, every item definition, and the registration-only list', () => {
    expect(Object.isFrozen(WHO_TRDS_ITEMS)).toBe(true);
    for (const def of WHO_TRDS_ITEMS) expect(Object.isFrozen(def)).toBe(true);
    expect(Object.isFrozen(WHO_TRDS_REGISTRATION_ONLY_ITEMS)).toBe(true);
    expect(() => {
      (WHO_TRDS_ITEMS[0] as { name: string }).name = 'TAMPERED';
    }).toThrow(TypeError);
    expect(projectWhoIctrp(completeDesign()).items[0].name).toBe('Primary Registry and Trial Identifying Number');
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
    expect(item(rec, 13).gap).toBeUndefined();
    expect(item(rec, 17)).toMatchObject({ status: 'rendered', value: '400' });
    expect(item(rec, 19)).toMatchObject({
      status: 'rendered',
      value: ['HbA1c change: change from baseline in HbA1c; method: central laboratory; timepoint: week 24'],
    });
    expect(item(rec, 20)).toMatchObject({
      status: 'rendered',
      value: [
        '[key secondary] Body weight change: change from baseline in body weight; timepoint: week 24',
        '[secondary] FPG change: change in fasting plasma glucose; timepoint: week 24',
      ],
    });
    for (const n of [10, 11, 12, 13, 14, 15, 17, 19, 20]) {
      expect(item(rec, n).status).not.toBe('missing');
    }
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

  it('item 14 is missing when every criterion is blank, and renders no empty "Inclusion: " line', () => {
    const d = completeDesign();
    d.population.eligibility = [{ type: 'inclusion', text: '  ' }, { type: 'exclusion', text: '' }];
    expect(item(projectWhoIctrp(d), 14)).toMatchObject({ status: 'missing', value: null, gap: 'Every recorded eligibility criterion is empty.' });
  });

  it('item 14 names a criterion of unrecognised type instead of dropping it silently or calling it empty', () => {
    const d = completeDesign();
    d.population.eligibility = [{ type: untyped<'inclusion'>('Inclusion'), text: 'Age 18-75 years' }];
    const only = item(projectWhoIctrp(d), 14);
    expect(only).toMatchObject({ status: 'missing', value: null });
    expect(only.gap).toBe('Not rendered: criterion "Age 18-75 years" has unrecognised type "Inclusion" (the recognised types are "inclusion" and "exclusion").');

    d.population.eligibility.push({ type: 'inclusion', text: 'HbA1c >= 7%' }, { type: 'exclusion', text: ' ' });
    const mixed = item(projectWhoIctrp(d), 14);
    expect(mixed.status).toBe('partial');
    expect((mixed.value as string[]).filter(v => /^(Inclusion|Exclusion):/.test(v))).toEqual(['Inclusion: HbA1c >= 7%']);
    expect(mixed.gap).toContain('criterion "Age 18-75 years" has unrecognised type "Inclusion"');
    expect(mixed.gap).toContain('1 recorded eligibility criterion with empty text is not rendered.');
  });
});

describe('projectWhoIctrp — item 11 countries of recruitment', () => {
  it('renders target regions verbatim (trimmed, de-duplicated) as partial, never as confirmed countries', () => {
    const i = item(projectWhoIctrp(completeDesign()), 11);
    expect(i).toMatchObject({ status: 'partial', value: ['Germany', 'India'], source: 'StudyDesign.targetRegions' });
    expect(i.gap).toMatch(/does not state that each entry is a country of recruitment/);
  });

  it('renders the planned recruiting sites\' countries from the accrual plan', () => {
    const d = completeDesign();
    delete d.targetRegions;
    d.accrualPlan = { timeUnit: 'month', sites: [{ id: 's1', country: 'Germany', meanRate: 1 }, { id: 's2', country: ' India ', meanRate: 2 }, { id: 's3', country: 'Germany', meanRate: 1 }] };
    expect(item(projectWhoIctrp(d), 11)).toEqual({
      number: 11,
      name: 'Countries of Recruitment',
      status: 'rendered',
      value: ['Germany', 'India'],
      source: 'StudyDesign.accrualPlan.sites[].country',
    });
  });

  it('with both sources, renders site countries and names each target region no site country matches', () => {
    const d = completeDesign();
    d.targetRegions = ['Germany', 'EU'];
    d.accrualPlan = { timeUnit: 'month', sites: [{ id: 's1', country: 'Germany', meanRate: 1 }, { id: 's2', meanRate: 1 }] };
    const i = item(projectWhoIctrp(d), 11);
    expect(i).toMatchObject({ status: 'partial', value: ['Germany'], source: 'StudyDesign.accrualPlan.sites[].country' });
    expect(i.gap).toContain('1 of 2 planned site(s) in StudyDesign.accrualPlan.sites record no country');
    expect(i.gap).toContain('StudyDesign.targetRegions also records "EU", which no planned site\'s country matches');
  });

  it('is missing, naming both fields, when neither records a country', () => {
    const d = completeDesign();
    delete d.targetRegions;
    d.accrualPlan = { timeUnit: 'month', sites: [{ id: 's1', meanRate: 1 }] };
    const i = item(projectWhoIctrp(d), 11);
    expect(i).toMatchObject({ status: 'missing', value: null });
    expect(i.gap).toBe('Neither StudyDesign.accrualPlan.sites[].country nor StudyDesign.targetRegions records a country or region.');
  });
});

describe('projectWhoIctrp — item 15 study type', () => {
  it('renders type, allocation, masking, assignment and phase as stated, and names purpose as absent', () => {
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

  it('maps no structural design outside the TRDS assignment categories', () => {
    const d = completeDesign();
    d.framework.structuralDesign = 'adaptive';
    d.phase = '2b';
    d.randomization = { ratio: [1, 1], allocationMethod: 'none', blinding: 'open' };
    const i = item(projectWhoIctrp(d), 15);
    expect(i.value).toEqual(['Study type: Interventional', 'Allocation: Non-randomized', 'Masking: None (open label)', 'Phase: 2 (recorded as 2b)']);
    expect(i.gap).toMatch(/structural design "adaptive" is not one of the TRDS assignment categories/);
    expect(i.gap).not.toMatch(/Who is masked/);
  });

  it('does not state a study type when no arm assigns an intervention', () => {
    const d = completeDesign();
    d.arms = [];
    delete d.randomization;
    const i = item(projectWhoIctrp(d), 15);
    expect(i.value).toEqual(['Assignment: Parallel', 'Phase: 3']);
    expect(i.gap).toMatch(/Study type is not stated/);
    expect(i.gap).toMatch(/Allocation is not stated/);
    expect(i.gap).toMatch(/Masking is not stated/);
  });

  it('invents neither a phase nor an assignment when the design records neither', () => {
    const d = completeDesign() as Partial<StudyDesign>;
    delete d.phase;
    delete d.framework;
    const i = item(projectWhoIctrp(d as StudyDesign), 15);
    expect((i.value as string[]).some(v => v.startsWith('Phase:'))).toBe(false);
    expect((i.value as string[]).some(v => v.startsWith('Assignment:'))).toBe(false);
    expect(i.gap).toContain('Phase is not stated: the design records no phase.');
    expect(i.gap).toContain('Assignment is not stated: the design records no structural design.');
  });

  it('renders no Object.prototype member for an unrecognised phase, structural design, allocation or blinding, and echoes the value', () => {
    const d = completeDesign();
    d.phase = untyped<StudyDesign['phase']>('constructor');
    d.framework.structuralDesign = untyped<StudyDesign['framework']['structuralDesign']>('toString');
    d.randomization = { ratio: [1, 1], allocationMethod: untyped<'block'>('hasOwnProperty'), blinding: untyped<'open'>('valueOf') };
    const i = item(projectWhoIctrp(d), 15);
    expect(i.value).toEqual(['Study type: Interventional']);
    expect(JSON.stringify(i)).not.toMatch(/function|native code/);
    expect(i.gap).toContain('Phase is not stated: "constructor" is not a recognised StudyPhase.');
    expect(i.gap).toContain('structural design "toString" is not one of the TRDS assignment categories');
    expect(i.gap).toContain('Allocation is not stated: "hasOwnProperty" is not a recognised allocation method.');
    expect(i.gap).toContain('Masking is not stated: "valueOf" is not a recognised blinding level.');
    expect(i.gap).not.toMatch(/Who is masked/);
  });

  it('a single-arm design that records several arms or a randomization states neither allocation nor assignment, and names the contradiction', () => {
    const d = completeDesign();
    d.framework.structuralDesign = 'single_arm';
    d.randomization = { ratio: [1, 1], allocationMethod: 'block', blinding: 'open' };
    const i = item(projectWhoIctrp(d), 15);
    expect((i.value as string[]).some(v => /^(Allocation|Assignment):/.test(v))).toBe(false);
    expect(i.gap).toContain('the structural design is "single_arm" but 2 arms are recorded and randomization.allocationMethod is "block"');

    d.arms = [d.arms[0]];
    d.randomization = { ratio: [1], allocationMethod: 'none', blinding: 'open' };
    const consistent = item(projectWhoIctrp(d), 15);
    expect(consistent.value).toEqual(['Study type: Interventional', 'Allocation: N/A (single arm)', 'Masking: None (open label)', 'Assignment: Single arm', 'Phase: 3']);
  });

  it('does not call a minimization randomized when the design does not say it has a random element', () => {
    const d = completeDesign();
    d.randomization = { ratio: [1, 1], allocationMethod: 'minimization', blinding: 'double' };
    const i = item(projectWhoIctrp(d), 15);
    expect(i.value).toContain('Allocation: Minimization');
    expect((i.value as string[]).some(v => /Randomized/.test(v))).toBe(false);
    expect(i.gap).toContain('Whether the minimization includes a random element is not recorded');
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

describe('projectWhoIctrp — outcomes by role', () => {
  it('primary endpoints go to item 19 only; key secondary and secondary endpoints to item 20 only', () => {
    const rec = projectWhoIctrp(completeDesign());
    const primary = (item(rec, 19).value as string[]).join(' | ');
    const secondary = (item(rec, 20).value as string[]).join(' | ');
    expect(primary).toMatch(/HbA1c change/);
    expect(primary).not.toMatch(/Body weight change|FPG change/);
    expect(secondary).toMatch(/\[key secondary\] Body weight change/);
    expect(secondary).toMatch(/\[secondary\] FPG change/);
    expect(secondary).not.toMatch(/HbA1c change/);
    for (const other of ['Hypoglycaemia', 'Biomarker Z']) {
      expect(primary).not.toContain(other);
      expect(secondary).not.toContain(other);
    }
  });

  it('items 13, 19 and 20 are exactly what who-ictrp-arms-outcomes.ts renders for the same design', () => {
    const d = completeDesign();
    delete d.endpoints[0].timepoint;
    d.arms[0].interventions[0].dose = ' ';
    const rec = projectWhoIctrp(d);
    expect(item(rec, 13)).toEqual({ number: 13, name: 'Intervention(s)', ...interventions(d) });
    expect(item(rec, 19)).toEqual({ number: 19, name: 'Primary Outcome(s)', ...primaryOutcomes(d) });
    expect(item(rec, 20)).toEqual({ number: 20, name: 'Key Secondary Outcomes', ...secondaryOutcomes(d) });
    expect([item(rec, 13).status, item(rec, 19).status]).toEqual(['partial', 'partial']);
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

  it('item 9 renders a recorded public title; item 10 carries a recorded acronym, and stays rendered without one', () => {
    const d = { ...completeDesign(), publicTitle: '  A study of Drug X for adults with type 2 diabetes ', acronym: 'DX-T2D' };
    const rec = projectWhoIctrp(d);
    expect(item(rec, 9)).toMatchObject({ status: 'rendered', value: 'A study of Drug X for adults with type 2 diabetes', source: 'StudyDesign.publicTitle' });
    expect(item(rec, 10)).toMatchObject({ status: 'rendered', value: `${d.title} (DX-T2D)` });
    expect(item(projectWhoIctrp(completeDesign()), 10)).toMatchObject({ status: 'rendered', value: completeDesign().title });
    expect(item(projectWhoIctrp({ ...completeDesign(), publicTitle: '   ' }), 9).status).toBe('missing');
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
