/**
 * Tests for the SPIRIT 2013 conformance projection. The engine judges every row of the
 * 33-item (51-row) checklist deterministically: design-evidenced rows from the design
 * object, document-evidenced rows from section presence in the authored protocol, and
 * never fabricates — a row the design cannot show is missing (with a gap) and a row only
 * a document can show is not_assessable, never missing, when no document is passed.
 */

import { describe, it, expect } from 'vitest';
import {
  assessSpiritConformance,
  SPIRIT_2013_ITEMS,
  SPIRIT_2013_NUMBERED_ITEM_COUNT,
  SPIRIT_BASIS,
  SPIRIT_DOCUMENT_TOPICS,
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
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo' }] },
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
    const sections = new Set(SPIRIT_2013_ITEMS.map(i => i.section));
    expect(sections.size).toBe(8);
    for (const i of SPIRIT_2013_ITEMS) {
      expect(i.title.length).toBeGreaterThan(0);
      expect(i.description.length).toBeGreaterThan(20);
      expect(['design', 'protocol_document', 'either']).toContain(i.evidencedBy);
    }
  });

  it('registers a document topic for exactly the rows a document can evidence', () => {
    expect(Object.keys(SPIRIT_DOCUMENT_TOPICS).sort()).toEqual([...DOC_ONLY_ITEMS, ...EITHER_ITEMS].sort());
  });
});

describe('assessSpiritConformance — determinism and shape', () => {
  it('is deterministic and does not mutate its input', () => {
    const d = spiritDesign();
    const before = clone(d);
    const a = assessSpiritConformance(d, doc([{ sectionKey: 'funding', title: 'Funding', content: 'NIH', status: 'complete' }]));
    const b = assessSpiritConformance(d, doc([{ sectionKey: 'funding', title: 'Funding', content: 'NIH', status: 'complete' }]));
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(d).toEqual(before);
    expect(a.basis).toBe(SPIRIT_BASIS);
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
    const c = assessSpiritConformance(emptyDesign(), doc([]));
    for (const r of c.items) {
      expect(r.gap ?? '').not.toMatch(/No design judge is registered|No document topic is registered/);
    }
  });
});

describe('assessSpiritConformance — the design as evidence', () => {
  it('meets every design-evidenced row on a complete design, with design evidence', () => {
    const c = assessSpiritConformance(spiritDesign());
    for (const item of DESIGN_ITEMS) {
      const r = row(c, item);
      expect({ item, status: r.status }).toEqual({ item, status: 'met' });
      expect(r.evidence.some(e => e.startsWith('design:'))).toBe(true);
    }
  });

  it('never leaves an either-evidenced row missing on a complete design', () => {
    const c = assessSpiritConformance(spiritDesign());
    for (const item of EITHER_ITEMS) expect(['met', 'partial']).toContain(row(c, item).status);
    expect(row(c, '17b').status).toBe('met');
    expect(row(c, '3').status).toBe('partial');
    expect(row(c, '3').gap).toMatch(/no protocol date/i);
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

  it('falls back to the Schedule of Activities for an outcome time point, and flags it when neither exists (SPIRIT 12)', () => {
    const d = spiritDesign();
    delete d.endpoints[0].timepoint;
    expect(row(assessSpiritConformance(d), '12').status).toBe('met');
    delete d.scheduleOfActivities;
    const r = row(assessSpiritConformance(d), '12');
    expect(r.status).toBe('partial');
    expect(r.gap).toMatch(/"HbA1c change" lacks time point/);
  });

  it('flags a schedule whose visits carry no study day (SPIRIT 13)', () => {
    const d = spiritDesign();
    delete d.scheduleOfActivities!.visits[2].studyDay;
    const r = row(assessSpiritConformance(d), '13');
    expect(r.status).toBe('partial');
    expect(r.gap).toMatch(/1 scheduled visit\(s\) have no study day/);
  });

  it('never fabricates the sample-size determination (SPIRIT 14)', () => {
    const d = spiritDesign();
    delete d.statisticalPlan.powerAssumptions;
    const partial = row(assessSpiritConformance(d), '14');
    expect(partial.status).toBe('partial');
    expect(partial.gap).toMatch(/assumptions/);
    delete d.statisticalPlan.plannedSampleSize;
    expect(row(assessSpiritConformance(d), '14').status).toBe('missing');
  });

  it('flags stratified allocation without factors, an under-described intervention and a missing unblinding procedure', () => {
    const d = spiritDesign();
    delete d.randomization!.stratificationFactors;
    delete d.randomization!.emergencyUnblindingProcedure;
    delete d.arms[0].interventions[0].route;
    const c = assessSpiritConformance(d);
    expect(row(c, '16a').status).toBe('partial');
    expect(row(c, '16a').gap).toMatch(/stratification factors/);
    expect(row(c, '11a').status).toBe('partial');
    expect(row(c, '11a').gap).toMatch(/"Drug X" in arm "Drug X" lacks route/);
    expect(row(c, '17b').status).toBe('missing');
  });

  it('demands the missing-data method and the DMC explanation rather than assuming them (SPIRIT 20c, 21a)', () => {
    const d = spiritDesign();
    delete d.statisticalPlan.missingDataStrategy;
    d.safety!.dmcCharter = { present: false };
    const c = assessSpiritConformance(d);
    expect(row(c, '20c').status).toBe('partial');
    expect(row(c, '20c').gap).toMatch(/missing-data/);
    expect(row(c, '21a').status).toBe('partial');
    expect(row(c, '21a').gap).toMatch(/why a DMC is not needed/);
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

  it('meets 17a and marks 17b not applicable for an open-label design', () => {
    const d = spiritDesign();
    d.randomization!.blinding = 'open';
    const c = assessSpiritConformance(d);
    expect(row(c, '17a').status).toBe('met');
    expect(row(c, '17b').status).toBe('not_assessable');
    expect(row(c, '17b').notAssessableReason).toBe('not_applicable');
  });

  it('never treats an unknown design as inapplicable', () => {
    const c = assessSpiritConformance(emptyDesign());
    expect(row(c, '16a').status).toBe('missing');
    expect(row(c, '17b').status).toBe('missing');
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
    expect(row(c, '4').status).toBe('met');
    expect(row(c, '4').evidence).toEqual(['document: section "funding" ("Funding") status complete, 28 characters']);
    expect(row(c, '26a').status).toBe('partial');
    expect(row(c, '26a').gap).toMatch(/not in status "complete"|none is in status "complete"/);
    expect(row(c, '33').status).toBe('missing');
    expect(row(c, '33').gap).toMatch(/have no content/);
    expect(row(c, '19').status).toBe('missing');
    expect(row(c, '19').gap).toMatch(/no section keyed or titled to data management/);
  });

  it('matches by normalised key or by title, and scores an umbrella section at most partial', () => {
    const c = assessSpiritConformance(spiritDesign(), doc([
      { sectionKey: 'Funding-Sources', title: 'Support', content: 'Grant 123', status: 'complete' },
      { sectionKey: 'sec-07', title: 'Data Management Plan', content: 'EDC with range checks', status: 'complete' },
      { sectionKey: 'ethics', title: 'Ethics, Consent & Regulatory', content: 'IRB approval will be sought; amendments will be submitted.', status: 'complete' },
    ]));
    expect(row(c, '4').status).toBe('met');
    expect(row(c, '19').status).toBe('met');
    expect(row(c, '26a').status).toBe('met');
    expect(row(c, '25').status).toBe('partial');
    expect(row(c, '25').gap).toMatch(/cannot confirm/);
    expect(row(c, '24').status).toBe('partial');
  });

  it('lets a document section complete an either-evidenced row the design only partly carries', () => {
    const d = spiritDesign();
    const withSection = assessSpiritConformance(d, doc([{ sectionKey: 'version', title: 'Protocol version', content: 'v2.0, 2026-09-01', status: 'complete' }]));
    expect(row(withSection, '3').status).toBe('met');
    expect(row(withSection, '3').evidence).toEqual([
      'design: version 2',
      'document: section "version" ("Protocol version") status complete, 16 characters',
    ]);
    const without = assessSpiritConformance(d, doc([]));
    expect(row(without, '3').status).toBe('partial');
    expect(row(without, '3').gap).toMatch(/no protocol date.*Document: The document has no section/);
  });

  it('never lets a document override a design-evidenced row', () => {
    const d = spiritDesign();
    delete d.statisticalPlan.plannedSampleSize;
    const c = assessSpiritConformance(d, doc([{ sectionKey: 'statistics', title: 'Sample size', content: 'n=400', status: 'complete' }]));
    expect(row(c, '14').status).toBe('missing');
    expect(row(c, '14').evidence.some(e => e.startsWith('document:'))).toBe(false);
  });
});
