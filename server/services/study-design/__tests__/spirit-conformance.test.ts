/**
 * Tests for the SPIRIT 2013 conformance projection. The engine judges every row of the
 * 33-item (51-row) checklist deterministically: design-evidenced rows from the design
 * object, document-evidenced rows from section presence in the authored protocol, and
 * never fabricates — a row the design cannot show is missing (with a gap), a row only
 * a document can show is not_assessable, never missing, when no document is passed, and
 * a row whose SPIRIT wording asks for something the design has no field for is partial
 * (with that element named), never met. Section titles are matched on whole words.
 */

import { describe, it, expect } from 'vitest';
import {
  assessSpiritConformance,
  SPIRIT_2013_ITEMS,
  SPIRIT_2013_NUMBERED_ITEM_COUNT,
  SPIRIT_BASIS,
  SPIRIT_DOCUMENT_TOPICS,
  SPIRIT_SUPERSEDED_BY,
  type SpiritConformance,
  type SpiritProtocolDocument,
} from '../spirit-conformance';
import { type DesignFramework, type StudyDesign } from '../study-design-types';

const EXPECTED_CODES = [
  '1', '2a', '2b', '3', '4', '5a', '5b', '5c', '5d',
  '6a', '6b', '7', '8',
  '9', '10', '11a', '11b', '11c', '11d', '12', '13', '14', '15',
  '16a', '16b', '16c', '17a', '17b',
  '18a', '18b', '19', '20a', '20b', '20c',
  '21a', '21b', '22', '23',
  '24', '25', '26a', '26b', '27', '28', '29', '30', '31a', '31b', '31c',
  '32', '33',
];

function spiritDesign(): StudyDesign {
  return {
    title: 'A phase 3 study of Drug X in type 2 diabetes',
    phase: '3',
    indication: 'type 2 diabetes',
    productType: 'drug',
    targetRegions: ['US', 'EU'],
    version: 2,
    objectives: [{ level: 'primary', order: 1, text: 'Demonstrate superiority on HbA1c', endpointName: 'HbA1c change' }],
    estimands: [
      {
        endpointName: 'HbA1c change',
        treatmentCondition: 'Drug X 10 mg daily versus placebo',
        population: 'all randomized patients (ITT)',
        variable: 'change from baseline in HbA1c at week 24',
        summaryMeasure: 'difference in means',
        strategy: 'treatment_policy',
        intercurrentEvents: [{ name: 'rescue medication', strategy: 'treatment_policy', justification: 'treatment-policy estimand' }],
      },
    ],
    endpoints: [
      { name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'change from baseline in HbA1c', timepoint: 'week 24', measurementMethod: 'central laboratory HbA1c' },
      { name: 'body weight change', role: 'secondary', type: 'continuous', definition: 'change from baseline in body weight', timepoint: 'week 24' },
    ],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo', controlJustification: 'no approved add-on therapy; placebo is ethical with rescue' },
    population: {
      targetDescription: 'adults with type 2 diabetes inadequately controlled on metformin',
      analysisPopulations: [
        { kind: 'ITT', definition: 'all randomized patients', isPrimaryAnalysisSet: true },
        { kind: 'Safety', definition: 'all patients who received any study drug' },
      ],
      eligibility: [
        { type: 'inclusion', text: 'HbA1c 7.0–10.0% at screening' },
        { type: 'exclusion', text: 'eGFR < 30 mL/min/1.73 m²' },
      ],
    },
    arms: [
      { name: 'Drug X', interventions: [{ name: 'Drug X', role: 'investigational', dose: '10 mg', route: 'oral', regimen: 'once daily', duration: '24 weeks' }], doseModificationRules: 'reduce to 5 mg for grade 2 GI events' },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo', route: 'oral', regimen: 'once daily' }] },
    ],
    randomization: { ratio: [1, 1], allocationMethod: 'stratified', stratificationFactors: ['baseline HbA1c'], blinding: 'double', emergencyUnblindingProcedure: 'IWRS code break by the investigator' },
    scheduleOfActivities: {
      epochs: [
        { id: 'e-scr', name: 'Screening', kind: 'screening', order: 0 },
        { id: 'e-trt', name: 'Treatment', kind: 'treatment', order: 1 },
      ],
      visits: [
        { id: 'v-scr', name: 'Screening', epochId: 'e-scr', studyDay: -14, windowDays: 3, order: 0 },
        { id: 'v-bl', name: 'Baseline', epochId: 'e-trt', studyDay: 1, isBaseline: true, order: 1 },
        { id: 'v-w24', name: 'Week 24', epochId: 'e-trt', studyDay: 169, windowDays: 7, order: 2 },
      ],
      activities: [
        { id: 'a-elig', name: 'Eligibility review', category: 'eligibility', order: 0 },
        { id: 'a-hba1c', name: 'HbA1c', category: 'efficacy', endpointNames: ['HbA1c change'], order: 1 },
      ],
      cells: [
        { activityId: 'a-elig', visitId: 'v-scr', state: 'performed' },
        { activityId: 'a-hba1c', visitId: 'v-bl', state: 'performed' },
        { activityId: 'a-hba1c', visitId: 'v-w24', state: 'performed' },
      ],
    },
    statisticalPlan: {
      alpha: 0.05,
      oneSided: false,
      power: 0.9,
      plannedSampleSize: 400,
      dropoutRate: 0.2,
      plannedAnalyses: [
        { endpointName: 'HbA1c change', method: 'MMRM', estimandEndpointName: 'HbA1c change' },
        { endpointName: 'body weight change', method: 'MMRM' },
      ],
      multiplicity: { method: 'none' },
      missingDataStrategy: 'multiple imputation under missing-at-random',
      sensitivityAnalysesSpecified: true,
      powerAssumptions: { effectSize: 0.4, variance: 0.25, evidence: [{ kind: 'prior_data', source: 'Phase 2 NCT01234567' }] },
    },
    safety: { aeDefinitions: 'MedDRA-coded AEs per ICH E2A', stoppingRules: 'stop for two related SAEs of the same kind', dmcCharter: { present: true, composition: '3 members', meetingCadence: 'quarterly', hasStatisticalMember: true } },
  };
}

function emptyDesign(): StudyDesign {
  return {
    title: '',
    phase: '3',
    indication: '',
    objectives: [],
    estimands: [],
    endpoints: [],
    framework: undefined as unknown as DesignFramework,
    population: { targetDescription: '', analysisPopulations: [], eligibility: [] },
    arms: [],
    statisticalPlan: { plannedAnalyses: [] },
  };
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

function row(c: SpiritConformance, item: string) {
  const r = c.items.find(i => i.item === item);
  if (!r) throw new Error(`no row for ${item}`);
  return r;
}

function doc(sections: SpiritProtocolDocument['sections']): SpiritProtocolDocument {
  return { sections };
}

/** One complete section with content, keyed so that only its TITLE can match a topic. */
function titled(title: string): SpiritProtocolDocument {
  return doc([{ sectionKey: 'sec_x', title, content: 'Authored text.', status: 'complete' }]);
}

const DESIGN_ITEMS = SPIRIT_2013_ITEMS.filter(i => i.evidencedBy === 'design').map(i => i.item);
const EITHER_ITEMS = SPIRIT_2013_ITEMS.filter(i => i.evidencedBy === 'either').map(i => i.item);
const DOC_ONLY_ITEMS = SPIRIT_2013_ITEMS.filter(i => i.evidencedBy === 'protocol_document').map(i => i.item);

describe('SPIRIT_2013_ITEMS catalogue', () => {
  it('carries every SPIRIT 2013 row exactly once, in checklist order', () => {
    expect(SPIRIT_2013_ITEMS.map(i => i.item)).toEqual(EXPECTED_CODES);
    expect(new Set(SPIRIT_2013_ITEMS.map(i => i.item)).size).toBe(EXPECTED_CODES.length);
  });

  it('covers all 33 numbered items and nothing beyond them', () => {
    const numbers = new Set(SPIRIT_2013_ITEMS.map(i => i.number));
    expect(numbers.size).toBe(SPIRIT_2013_NUMBERED_ITEM_COUNT);
    expect(Math.min(...numbers)).toBe(1);
    expect(Math.max(...numbers)).toBe(33);
    for (const i of SPIRIT_2013_ITEMS) expect(i.item.startsWith(String(i.number))).toBe(true);
  });

  it('gives every row a section, title, description and evidence source', () => {
    expect(new Set(SPIRIT_2013_ITEMS.map(i => i.section)).size).toBe(8);
    for (const i of SPIRIT_2013_ITEMS) {
      expect(i.title.length).toBeGreaterThan(0);
      expect(i.description.length).toBeGreaterThan(20);
      expect(['design', 'protocol_document', 'either']).toContain(i.evidencedBy);
    }
  });

  it('registers a document topic for exactly the rows a document can evidence', () => {
    expect(Object.keys(SPIRIT_DOCUMENT_TOPICS).sort()).toEqual([...DOC_ONLY_ITEMS, ...EITHER_ITEMS].sort());
  });

  it('keeps design-only exactly the rows the design object can answer in full', () => {
    expect(DESIGN_ITEMS).toEqual(['6b', '7', '8', '10', '11a', '13', '14', '16a', '20a', '20c']);
    expect(EITHER_ITEMS).toEqual(['1', '3', '9', '11b', '12', '17a', '17b', '18a', '20b', '21a', '21b', '22']);
  });
});

describe('assessSpiritConformance — determinism, shape and basis', () => {
  it('is deterministic and does not mutate its input', () => {
    const d = spiritDesign();
    const before = clone(d);
    const a = assessSpiritConformance(d, doc([{ sectionKey: 'funding', title: 'Funding', content: 'NIH', status: 'complete' }]));
    const b = assessSpiritConformance(d, doc([{ sectionKey: 'funding', title: 'Funding', content: 'NIH', status: 'complete' }]));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(d).toEqual(before);
  });

  it('says on every output that SPIRIT 2025 superseded the 2013 checklist it assesses', () => {
    const c = assessSpiritConformance(spiritDesign());
    expect(c.basis).toBe(SPIRIT_BASIS);
    expect(c.basis).toMatch(/SPIRIT 2013.*Superseded by the SPIRIT 2025 statement \(34 items\); this engine assesses the 2013 checklist only/);
    expect(c.supersededBy).toBe(SPIRIT_SUPERSEDED_BY);
    expect(c.supersededBy).toMatch(/BMJ 2025;389:e081477.*34 minimum items.*not conformance to SPIRIT 2025/);
  });

  it('returns one row per catalogue item and summary counts that sum to the total', () => {
    for (const c of [assessSpiritConformance(spiritDesign()), assessSpiritConformance(emptyDesign()), assessSpiritConformance(spiritDesign(), doc([]))]) {
      expect(c.items.map(i => i.item)).toEqual(EXPECTED_CODES);
      const s = c.summary;
      expect(s.total).toBe(SPIRIT_2013_ITEMS.length);
      expect(s.met + s.partial + s.missing + s.notAssessable).toBe(s.total);
    }
  });

  it('carries a gap on every row that is not met', () => {
    const c = assessSpiritConformance(spiritDesign(), doc([{ sectionKey: 'ethics', title: 'Ethics', content: 'x', status: 'draft' }]));
    for (const r of c.items) {
      if (r.status === 'met') expect(r.gap).toBeUndefined();
      else expect(r.gap && r.gap.length).toBeGreaterThan(0);
    }
  });

  it('has a judge for every design-evidenced row and a topic for every document row (fails closed otherwise)', () => {
    for (const r of assessSpiritConformance(emptyDesign(), doc([])).items) {
      expect(r.gap ?? '').not.toMatch(/No design judge is registered|No document topic is registered/);
    }
  });

  it('is total over null entries in every array it reads and over a non-object design', () => {
    const d = spiritDesign() as unknown as Record<string, unknown[]> & StudyDesign;
    for (const k of ['endpoints', 'objectives', 'arms', 'estimands'] as const) (d[k] as unknown[]).unshift(null);
    (d.population.eligibility as unknown[]).unshift(null);
    (d.arms[1].interventions as unknown[]).push(null);
    (d.statisticalPlan.plannedAnalyses as unknown[]).push(null);
    const sections = [null, 7, { sectionKey: 'funding', title: 'Funding', content: 'NIH', status: 'complete' }] as unknown as SpiritProtocolDocument['sections'];
    const c = assessSpiritConformance(d, doc(sections));
    expect(row(c, '4').status).toBe('met');
    expect(row(c, '11a').status).toBe('met');
    for (const bad of [null, undefined, 42]) expect(assessSpiritConformance(bad as unknown as StudyDesign).summary.total).toBe(51);
  });
});

describe('assessSpiritConformance — the design as evidence', () => {
  it('meets every design-only row on a complete design, with design evidence', () => {
    const c = assessSpiritConformance(spiritDesign());
    for (const item of DESIGN_ITEMS) {
      const r = row(c, item);
      expect({ item, status: r.status }).toEqual({ item, status: 'met' });
      expect(r.evidence.some(e => e.startsWith('design:'))).toBe(true);
    }
  });

  it('pins every either row on a complete design: partial where SPIRIT asks for what the design has no field for', () => {
    const c = assessSpiritConformance(spiritDesign());
    const expected: Record<string, [string, RegExp?]> = {
      '1': ['partial', /identifies the study design/], '3': ['partial', /no protocol date/], '9': ['partial', /study setting type/],
      '11b': ['partial', /discontinuing the allocated intervention/], '12': ['partial', /analysis metric .* not carried/], '17a': ['partial', /which parties are blinded/],
      '17b': ['met'], '18a': ['partial', /data-quality processes/], '20b': ['partial', /Subgroup and adjusted analyses/],
      '21a': ['partial', /independent from the sponsor/], '21b': ['partial', /final decision to terminate/], '22': ['partial', /collecting, assessing, reporting and managing/],
    };
    expect(Object.fromEntries(EITHER_ITEMS.map(i => [i, row(c, i).status]))).toEqual(Object.fromEntries(Object.entries(expected).map(([i, [s]]) => [i, s])));
    for (const [item, [, gap]] of Object.entries(expected)) if (gap) expect(row(c, item).gap, item).toMatch(gap);
  });

  it('reports every design- and either-evidenced row missing, with a gap, on an empty design', () => {
    const c = assessSpiritConformance(emptyDesign());
    for (const item of [...DESIGN_ITEMS, ...EITHER_ITEMS]) {
      const r = row(c, item);
      expect({ item, status: r.status }).toEqual({ item, status: 'missing' });
      expect(r.gap).toMatch(/design (records|has|carries)/i);
    }
    expect(c.summary.missing).toBe(DESIGN_ITEMS.length + EITHER_ITEMS.length);
  });

  it('flags a title that does not name the indication (SPIRIT 1)', () => {
    const d = spiritDesign();
    d.title = 'The XYZ trial';
    const r = row(assessSpiritConformance(d), '1');
    expect(r.status).toBe('partial');
    expect(r.gap).toMatch(/type 2 diabetes/);
    expect(r.gap).toMatch(/Drug X/);
  });

  it('checks a recorded acronym appears in the title, and says when none is recorded (SPIRIT 1)', () => {
    const d = spiritDesign();
    expect(row(assessSpiritConformance(d), '1').gap).toMatch(/nor does the design record whether the trial has an acronym/);
    d.acronym = 'DX-T2D';
    const missingAcronym = row(assessSpiritConformance(d), '1');
    expect(missingAcronym.gap).toMatch(/does not identify the recorded acronym "DX-T2D"/);
    d.title = `${d.title} (DX-T2D)`;
    const named = row(assessSpiritConformance(d), '1');
    expect(named.gap).not.toMatch(/acronym "DX-T2D"|nor does the design record/);
    expect(named.evidence).toContain('design: acronym "DX-T2D"');
    expect(named.status).toBe('partial');
  });

  it('flags a schedule whose visits carry no study day (SPIRIT 13)', () => {
    const d = spiritDesign();
    delete d.scheduleOfActivities!.visits[2].studyDay;
    const r = row(assessSpiritConformance(d), '13');
    expect(r.status).toBe('partial');
    expect(r.gap).toMatch(/1 scheduled visit\(s\) have no study day/);
  });

  it('never fabricates the sample-size determination, and uses only usable values (SPIRIT 14)', () => {
    const d = spiritDesign();
    delete d.statisticalPlan.powerAssumptions;
    expect(row(assessSpiritConformance(d), '14')).toMatchObject({ status: 'partial', gap: expect.stringMatching(/assumptions/) });
    d.statisticalPlan.powerAssumptions = { effectSize: 0.4 };
    d.statisticalPlan.power = 90;
    d.statisticalPlan.alpha = 5;
    const r = row(assessSpiritConformance(d), '14');
    expect(r.status).toBe('partial');
    expect(r.gap).toMatch(/recorded power 90 is not a probability.*recorded alpha 5 is not a probability/);
    d.statisticalPlan.plannedSampleSize = Number.NaN;
    expect(row(assessSpiritConformance(d), '14')).toMatchObject({ status: 'missing', evidence: [] });
    delete d.statisticalPlan.plannedSampleSize;
    expect(row(assessSpiritConformance(d), '14').status).toBe('missing');
  });

  it('flags stratified allocation without factors, an under-described intervention and a missing unblinding procedure', () => {
    const d = spiritDesign();
    delete d.randomization!.stratificationFactors;
    delete d.randomization!.emergencyUnblindingProcedure;
    delete d.arms[0].interventions[0].route;
    const c = assessSpiritConformance(d);
    expect(row(c, '16a')).toMatchObject({ status: 'partial', gap: expect.stringMatching(/stratification factors/) });
    expect(row(c, '11a')).toMatchObject({ status: 'partial', gap: expect.stringMatching(/"Drug X" in arm "Drug X" lacks route/) });
    expect(row(c, '17b').status).toBe('missing');
  });

  it('demands the missing-data method and the DMC explanation rather than assuming them (SPIRIT 20c, 21a)', () => {
    const d = spiritDesign();
    delete d.statisticalPlan.missingDataStrategy;
    d.safety!.dmcCharter = { present: false };
    const c = assessSpiritConformance(d);
    expect(row(c, '20c')).toMatchObject({ status: 'partial', gap: expect.stringMatching(/missing-data/) });
    expect(row(c, '21a')).toMatchObject({ status: 'partial', evidence: ['design: safety.dmcCharter.present = false'], gap: expect.stringMatching(/why a DMC is not needed/) });
  });
});

describe('assessSpiritConformance — SPIRIT 12 judges every outcome', () => {
  it('judges exploratory and safety outcomes too, and names what each lacks', () => {
    const d = spiritDesign();
    d.endpoints.push({ name: 'QoL', role: 'exploratory', type: 'patient_reported', definition: '' }, { name: 'Hypoglycaemia', role: 'safety', type: 'count', definition: 'events < 3.0 mmol/L' });
    const r = row(assessSpiritConformance(d), '12');
    expect(r.status).toBe('partial');
    expect(r.evidence.some(e => e.includes('exploratory endpoint "QoL"'))).toBe(true);
    expect(r.evidence.some(e => e.includes('safety endpoint "Hypoglycaemia"'))).toBe(true);
    expect(r.gap).toMatch(/"QoL" \(exploratory\) lacks measurement variable\/definition, method of aggregation.*time point/);
    expect(r.gap).toMatch(/"Hypoglycaemia" \(safety\) lacks method of aggregation.*time point/);
  });

  it('requires a method of aggregation for every outcome, primary included', () => {
    const complete = row(assessSpiritConformance(spiritDesign()), '12');
    expect(complete.gap).not.toMatch(/"HbA1c change" \(primary\) lacks/);
    expect(complete.gap).toMatch(/"body weight change" \(secondary\) lacks method of aggregation/);
    const d = spiritDesign();
    delete (d.estimands[0] as { summaryMeasure?: string }).summaryMeasure;
    expect(row(assessSpiritConformance(d), '12').gap).toMatch(/"HbA1c change" \(primary\) lacks method of aggregation/);
  });

  it('labels a time frame taken from the Schedule of Activities as derived, and flags it when neither exists', () => {
    const d = spiritDesign();
    delete d.endpoints[0].timepoint;
    const derived = row(assessSpiritConformance(d), '12');
    expect(derived.evidence[0]).toMatch(/time frame derived from the Schedule of Activities: Baseline \(day 1\), Week 24 \(day 169\)/);
    expect(derived.gap).not.toMatch(/"HbA1c change" \(primary\) lacks[^;]*time point/);
    delete d.scheduleOfActivities;
    expect(row(assessSpiritConformance(d), '12').gap).toMatch(/"HbA1c change" \(primary\) lacks time point/);
  });
});

describe('assessSpiritConformance — design judges never overclaim', () => {
  it('requires a placebo to say how and when it is given (SPIRIT 11a)', () => {
    const d = spiritDesign();
    d.arms[1].interventions[0] = { name: 'Placebo', role: 'placebo' };
    expect(row(assessSpiritConformance(d), '11a')).toMatchObject({ status: 'partial', gap: expect.stringMatching(/"Placebo" in arm "Placebo" lacks route, regimen/) });
  });

  it('never reads an unrecorded DMC presence as a recorded "no DMC" (SPIRIT 21a)', () => {
    const d = spiritDesign();
    d.safety!.dmcCharter = { composition: 'three independent clinicians' } as never;
    const r = row(assessSpiritConformance(d), '21a');
    expect(r.status).toBe('missing');
    expect(r.gap).toMatch(/without safety\.dmcCharter\.present, so it does not state whether the trial has a DMC/);
    expect(JSON.stringify(r)).not.toMatch(/present = false|records that there is no DMC/);
  });

  it('flags analyses that name no endpoint the design carries (SPIRIT 20a)', () => {
    const d = spiritDesign();
    d.statisticalPlan.plannedAnalyses.push({ endpointName: 'ghost', method: 'ANCOVA' });
    expect(row(assessSpiritConformance(d), '20a')).toMatchObject({ status: 'partial', gap: expect.stringMatching(/name no endpoint the design carries: "ghost"/) });
    d.endpoints = [];
    expect(row(assessSpiritConformance(d), '20a').gap).toMatch(/records no primary endpoint/);
  });

  it('reads the allocation ratio against the arms, and a null boundary as no boundary (SPIRIT 8, 21b)', () => {
    const d = spiritDesign();
    d.arms.push({ name: 'Drug X 5 mg', interventions: [{ name: 'Drug X', role: 'investigational', dose: '5 mg', route: 'oral', regimen: 'once daily' }] });
    expect(row(assessSpiritConformance(d), '8')).toMatchObject({ status: 'partial', gap: expect.stringMatching(/2 part\(s\) but the design records 3 arm\(s\)/) });
    delete d.safety!.stoppingRules;
    d.statisticalPlan.interim = { informationFractions: [0.5], futilityBoundaries: [null] };
    const r = row(assessSpiritConformance(d), '21b');
    expect(r.gap).toMatch(/without a numeric stopping boundary or stopping rules/);
    expect(r.evidence.join(' ')).not.toMatch(/boundaries recorded/);
  });

  it('names the instrument when the measurement method is blank, and does not call open-label "no party blinded" (SPIRIT 18a, 17a)', () => {
    const d = spiritDesign();
    d.endpoints[0].measurementMethod = '';
    d.endpoints[0].validatedInstrument = 'Lab kit A';
    d.randomization!.blinding = 'open';
    const c = assessSpiritConformance(d);
    expect(row(c, '18a').evidence).toContain('design: "HbA1c change" measured by Lab kit A');
    expect(row(c, '17a')).toMatchObject({ status: 'partial', gap: expect.stringMatching(/open-label but not whether any party .* is nonetheless blinded/) });
    expect(row(c, '17a').evidence.join(' ')).not.toMatch(/no party is blinded/);
  });

  it('lets authored sections complete the rows the design cannot answer in full (SPIRIT 1, 12, 21a, 21b, 22)', () => {
    const c = assessSpiritConformance(spiritDesign(), doc(['Title Page', 'Study Endpoints', 'Data Monitoring Committee', 'Interim Analyses and Stopping Rules', 'Adverse Events'].map((title, n) => ({ sectionKey: `s${n}`, title, content: 'Authored.', status: 'complete' }))));
    for (const item of ['1', '12', '21a', '21b', '22']) expect({ item, status: row(c, item).status }).toEqual({ item, status: 'met' });
  });
});

describe('assessSpiritConformance — applicability', () => {
  it('marks allocation and blinding rows not applicable for a single-arm design, even when a document is passed', () => {
    const d = spiritDesign();
    d.framework = { inferentialFrame: 'superiority', structuralDesign: 'single_arm', controlType: 'none' };
    d.arms = [d.arms[0]];
    delete d.randomization;
    const c = assessSpiritConformance(d, doc([{ sectionKey: 'blinding', title: 'Blinding', content: 'Open', status: 'complete' }]));
    for (const item of ['16a', '16b', '16c', '17a', '17b']) {
      const r = row(c, item);
      expect({ item, status: r.status, reason: r.notAssessableReason }).toEqual({ item, status: 'not_assessable', reason: 'not_applicable' });
      expect(r.gap).toMatch(/controlled trials/);
    }
  });

  it('marks 17b not applicable for an open-label design but still assesses 17a', () => {
    const d = spiritDesign();
    d.randomization!.blinding = 'open';
    const c = assessSpiritConformance(d);
    expect(row(c, '17a').status).toBe('partial');
    expect(row(c, '17b')).toMatchObject({ status: 'not_assessable', notAssessableReason: 'not_applicable' });
  });

  it('never treats an unknown, arm-less or multi-group design as inapplicable', () => {
    expect(row(assessSpiritConformance(emptyDesign()), '16a').status).toBe('missing');
    expect(row(assessSpiritConformance(emptyDesign()), '17b').status).toBe('missing');
    const d = spiritDesign();
    d.framework = { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'none' };
    delete d.randomization;
    for (const arms of [[], [d.arms[0]]]) {
      d.arms = arms;
      const c = assessSpiritConformance(d);
      for (const item of ['16a', '16b', '16c', '17a', '17b']) expect(row(c, item).notAssessableReason, `${item} with ${arms.length} arm(s)`).not.toBe('not_applicable');
      expect(row(c, '16a').status).toBe('missing');
    }
    d.framework.structuralDesign = 'dose_ranging';
    expect(row(assessSpiritConformance(d), '16a').notAssessableReason).toBe('not_applicable');
    d.arms = [];
    expect(row(assessSpiritConformance(d), '16a'), 'dose_ranging, no control, arms not entered yet').toMatchObject({ status: 'missing' });
  });
});

describe('assessSpiritConformance — the protocol document as evidence', () => {
  it('reports every document-only row not_assessable — never missing — when no document is passed', () => {
    const c = assessSpiritConformance(spiritDesign());
    expect(c.documentProvided).toBe(false);
    for (const item of DOC_ONLY_ITEMS) {
      const r = row(c, item);
      expect({ item, status: r.status, reason: r.notAssessableReason }).toEqual({ item, status: 'not_assessable', reason: 'no_document' });
      expect(r.gap).toMatch(/no protocol document was passed/i);
    }
    expect(c.summary.missing).toBe(0);
    expect(c.summary.notAssessable).toBe(DOC_ONLY_ITEMS.length);
  });

  it('judges document rows from section presence: complete → met, draft → partial, empty → missing, absent → missing', () => {
    const c = assessSpiritConformance(spiritDesign(), doc([
      { sectionKey: 'funding', title: 'Funding', content: 'Sponsored by Example Pharma.', status: 'complete' },
      { sectionKey: 'consent', title: 'Informed consent', content: 'Investigators obtain written consent.', status: 'draft' },
      { sectionKey: 'specimens', title: 'Biological specimens', content: '', status: 'not_started' },
    ]));
    expect(c.documentProvided).toBe(true);
    expect(row(c, '4')).toMatchObject({ status: 'met', evidence: ['document: section "funding" ("Funding") status complete, 28 characters'] });
    expect(row(c, '26a')).toMatchObject({ status: 'partial', gap: expect.stringMatching(/none is in status "complete"/) });
    expect(row(c, '33')).toMatchObject({ status: 'missing', gap: expect.stringMatching(/have no content/) });
    expect(row(c, '19')).toMatchObject({ status: 'missing', gap: expect.stringMatching(/no section keyed or titled to data management/) });
  });

  it('matches by normalised key or title, and holds an umbrella-keyed section at partial even when its title names the topic', () => {
    const c = assessSpiritConformance(spiritDesign(), doc([
      { sectionKey: 'Funding-Sources', title: 'Support', content: 'Grant 123', status: 'complete' },
      { sectionKey: 'sec-07', title: 'Data Management Plan', content: 'EDC with range checks', status: 'complete' },
      { sectionKey: 'ethics', title: 'Ethics, Consent & Regulatory', content: 'IRB approval will be sought; amendments will be submitted.', status: 'complete' },
    ]));
    expect(row(c, '4').status).toBe('met');
    expect(row(c, '19').status).toBe('met');
    for (const item of ['24', '25', '26a']) expect(row(c, item)).toMatchObject({ status: 'partial', gap: expect.stringMatching(/cannot confirm/) });
  });

  it.each([
    ['Dose Conversion Table', '3'], ['Ancillary and Post-Trial Care', '26b'], ['Data Monitoring Committee', '5d'], ['Compliance with GCP', '11c'],
    ['Statement of Compliance', '11c'], ['Patient Registration', '2a'], ['Data Management & Audit Trail', '23'], ['Blinded Independent Central Review', '17a'],
    ['Emergency Unblinding', '17a'], ['Safety Follow-up', '18b'], ["Investigator's Brochure", '5a'], ['Intervention Implementation', '16c'],
    ['Study Records Retention', '18b'], ['Role of the Sponsor', '5b'], ['Endpoint Adjudication Committee', '12'], ['Early Termination Visit', '21b'],
  ])('does not let a section titled "%s" evidence SPIRIT %s', (title, item) => {
    const r = row(assessSpiritConformance(spiritDesign(), titled(title)), item);
    expect(r.status).not.toBe('met');
    expect(r.evidence.join(' ')).not.toContain(`("${title}")`);
  });

  it.each([
    ['Protocol Version History', '3'], ['Consent for Ancillary Studies', '26b'], ['Ancillary and Post-Trial Care', '30'], ['Steering Committee', '5d'],
    ['Data Monitoring Committee', '21a'], ['Treatment Adherence', '11c'], ['Compliance with Study Drug', '11c'], ['Trial Registration', '2a'],
    ['Auditing', '23'], ['Data Management & Audit Trail', '19'], ['Blinding and Masking', '17a'], ['Emergency Unblinding', '17b'],
    ['Participant Retention', '18b'], ['Protocol Contributors', '5a'], ['Implementation of the Allocation Sequence', '16c'], ['Role of the Sponsor', '5c'],
  ])('lets a section titled "%s" evidence SPIRIT %s', (title, item) => {
    const r = row(assessSpiritConformance(spiritDesign(), titled(title)), item);
    expect(r.status).toBe('met');
    expect(r.evidence.join(' ')).toContain(`("${title}")`);
  });

  it('lets a document section complete an either-evidenced row the design only partly carries', () => {
    const d = spiritDesign();
    const withSection = assessSpiritConformance(d, doc([{ sectionKey: 'version', title: 'Protocol version', content: 'v2.0, 2026-09-01', status: 'complete' }]));
    expect(row(withSection, '3')).toMatchObject({ status: 'met', evidence: ['design: version 2', 'document: section "version" ("Protocol version") status complete, 16 characters'] });
    const without = assessSpiritConformance(d, doc([]));
    expect(row(without, '3')).toMatchObject({ status: 'partial', gap: expect.stringMatching(/no protocol date.*Document: The document has no section/) });
  });

  it('never lets a document override a design-evidenced row', () => {
    const d = spiritDesign();
    delete d.statisticalPlan.plannedSampleSize;
    const c = assessSpiritConformance(d, doc([{ sectionKey: 'statistics', title: 'Sample size', content: 'n=400', status: 'complete' }]));
    expect(row(c, '14').status).toBe('missing');
    expect(row(c, '14').evidence.some(e => e.startsWith('document:'))).toBe(false);
  });
});
