/**
 * Tests for the ICH E6(R3) / E8(R1) critical-to-quality derivation. Every rule
 * fires on a design that carries its trigger and stays silent on one that does
 * not; a trigger that is absent, blank or not one of the recorded values is
 * NOTED, never presumed; every rating is a default seed whose source is named,
 * and the rows that restate an RBM catalogue row carry that row's rating; every
 * factor names the design element it came from; a runtime-partial design never
 * throws; and the output is byte-identical run to run.
 */

import { describe, it, expect } from 'vitest';
import {
  CTQ_BASIS, CTQ_DEFAULT_RATINGS, CTQ_NOT_ASSESSED, deriveCtqFactors, doseModificationNote, pdWithoutSpecimenNote,
  unnamedTriggerNote, unparsedEligibilityNote, untypedEligibilityNote, type DerivedCtqFactor,
} from '../ctq-derivation';
import { DEFAULT_CTQ_FACTORS, type CtqSeed } from '../../rbm/rbm-engine';
import { type ScheduleOfActivities, type StudyDesign } from '../study-design-types';

function ctqSoa(): ScheduleOfActivities {
  return {
    epochs: [{ id: 'e_scr', name: 'Screening', kind: 'screening', order: 0 }, { id: 'e_trt', name: 'Treatment', kind: 'treatment', order: 1 }],
    visits: [
      { id: 'V1', name: 'Screening', epochId: 'e_scr', studyDay: -28, order: 0 },
      { id: 'V2', name: 'Baseline', epochId: 'e_trt', studyDay: 1, isBaseline: true, order: 1 },
      { id: 'V3', name: 'Week 24', epochId: 'e_trt', studyDay: 168, windowDays: 3, order: 2 },
    ],
    activities: [
      { id: 'a_consent', name: 'Informed consent', category: 'administrative', order: 0 },
      { id: 'a_hba1c', name: 'HbA1c', category: 'efficacy', endpointNames: ['HbA1c change'], order: 1 },
      { id: 'a_dose', name: 'Drug X dispensing and dosing', category: 'drug_administration', order: 2 },
      { id: 'a_pk', name: 'PK blood sample', category: 'pk', order: 3 },
      { id: 'a_bio', name: 'Fasting C-peptide', category: 'biomarker', endpointNames: ['C-peptide change'], order: 4 },
      { id: 'a_vitals', name: 'Vital signs', category: 'safety', order: 5 },
    ],
    cells: [{ activityId: 'a_hba1c', visitId: 'V3', state: 'performed' }, { activityId: 'a_dose', visitId: 'V2', state: 'performed' }],
  };
}

/** Every trigger present, every eligibility criterion parseable, so `notAssessed` is empty. */
function ctqDesign(): StudyDesign {
  return {
    title: 'A phase 3 study of Drug X in type 2 diabetes',
    phase: '3',
    indication: 'type 2 diabetes',
    productType: 'drug',
    objectives: [{ level: 'primary', order: 1, text: 'Demonstrate superiority on HbA1c', endpointName: 'HbA1c change' }],
    estimands: [],
    endpoints: [
      { name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'change from baseline in HbA1c', measurementMethod: 'central laboratory HbA1c (NGSP-certified)', timepoint: 'week 24' },
      { name: 'DTSQ change', role: 'key_secondary', type: 'patient_reported', definition: 'change in treatment satisfaction', validatedInstrument: 'DTSQ status version', timepoint: 'week 24' },
      { name: 'C-peptide change', role: 'secondary', type: 'continuous', definition: 'change from baseline in fasting C-peptide' },
      { name: 'Hypoglycaemia events', role: 'safety', type: 'count', definition: 'documented hypoglycaemia events' },
    ],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: {
      targetDescription: 'adults with type 2 diabetes inadequately controlled on metformin',
      analysisPopulations: [{ kind: 'ITT', definition: 'all randomized patients', isPrimaryAnalysisSet: true }],
      eligibility: [
        { type: 'inclusion', text: 'Age 18-75 years' },
        { type: 'inclusion', text: 'HbA1c 7.0-10.0 %' },
        { type: 'exclusion', text: 'eGFR < 45 mL/min/1.73m²' },
      ],
    },
    arms: [
      { name: 'Drug X', interventions: [{ name: 'Drug X', role: 'investigational', dose: '10 mg', route: 'oral' }], doseModificationRules: 'Reduce to 5 mg on a second confirmed hypoglycaemia event.' },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo' }] },
    ],
    randomization: { ratio: [1, 1], allocationMethod: 'stratified', blinding: 'double', emergencyUnblindingProcedure: 'IWRS code-break by the investigator, 24/7' },
    scheduleOfActivities: ctqSoa(),
    statisticalPlan: { plannedAnalyses: [{ endpointName: 'HbA1c change', method: 'MMRM' }], interim: { informationFractions: [0.5], spendingFunction: 'obrien_fleming' } },
    safety: {
      aeDefinitions: 'MedDRA coding', stoppingRules: 'Study pauses on two treatment-related SAEs of the same kind.',
      dltDefinition: 'Grade ≥3 non-haematological toxicity within 28 days of first dose.', dmcCharter: { present: true, meetingCadence: 'quarterly' },
    },
  };
}

/** Only the fields the type requires; nothing that triggers a rule. */
function emptyDesign(): StudyDesign {
  return {
    title: 'An empty design', phase: '2', indication: 'unspecified', objectives: [], estimands: [], endpoints: [],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: { targetDescription: '', analysisPopulations: [], eligibility: [] }, arms: [], statisticalPlan: { plannedAnalyses: [] },
  };
}

/** What an unvalidated JSONB row can carry at runtime: typed as a design, shaped as anything. */
function runtime(shape: unknown): StudyDesign {
  return shape as StudyDesign;
}

function clone(d: StudyDesign): StudyDesign {
  return JSON.parse(JSON.stringify(d));
}

function byKind(factors: DerivedCtqFactor[], kind: DerivedCtqFactor['derivedFrom']['kind']): DerivedCtqFactor[] {
  return factors.filter((f) => f.derivedFrom.kind === kind);
}

type Rating = Pick<CtqSeed, 'category' | 'likelihood' | 'impact' | 'isCritical'>;

function rating(f: CtqSeed): Rating {
  return { category: f.category, likelihood: f.likelihood, impact: f.impact, isCritical: f.isCritical };
}

/** The RBM catalogue row by title, looked up here independently of the engine's own anchor table. */
function catalogue(title: string): Rating {
  const row = DEFAULT_CTQ_FACTORS.find((f) => f.ctqFactor === title);
  if (!row) throw new Error(`DEFAULT_CTQ_FACTORS has no row "${title}"`);
  return rating(row);
}

/** The full design's factor titles, in rule order. */
const FULL_DESIGN_FACTORS = [
  'Primary endpoint assessment: central laboratory HbA1c (NGSP-certified) at week 24',
  'Key secondary endpoint assessment: DTSQ status version at week 24',
  'Eligibility verification: Age 18-75 years',
  'Eligibility verification: HbA1c 7.0-10.0 %',
  'Eligibility verification: eGFR < 45 mL/min/1.73m²',
  'IMP accountability and dosing: Drug X dispensing and dosing',
  'Sample timing and handling: PK blood sample',
  'Sample timing and handling: Fasting C-peptide',
  'Dose modification and titration rules: Drug X',
  'Blind maintenance (double-blind design)',
  'Emergency unblinding (double-blind design)',
  'Stopping-rule triggers and escalation',
  'DMC data readiness and review cadence (quarterly)',
  'Dose-limiting toxicity assessment and escalation decisions',
  'Interim analysis data-cut integrity (information fractions 0.5)',
];

const ALL_AREAS_ABSENT = [
  CTQ_NOT_ASSESSED.endpoints, CTQ_NOT_ASSESSED.eligibility, CTQ_NOT_ASSESSED.scheduleOfActivities, CTQ_NOT_ASSESSED.arms,
  CTQ_NOT_ASSESSED.randomization, CTQ_NOT_ASSESSED.safety, CTQ_NOT_ASSESSED.interim,
];

describe('deriveCtqFactors — whole-design properties', () => {
  it('is deterministic and does not mutate the input', () => {
    const d = ctqDesign();
    const before = JSON.stringify(d);
    expect(JSON.stringify(deriveCtqFactors(d))).toBe(JSON.stringify(deriveCtqFactors(d)));
    expect(JSON.stringify(d)).toBe(before);
  });

  it('cites its basis on the output and as a constant', () => {
    expect(CTQ_BASIS).toBe('ICH E6(R3) §3.10 — identification of critical-to-quality factors at design; ICH E8(R1) — quality by design and critical-to-quality factors; TransCelerate RACT');
    expect(deriveCtqFactors(ctqDesign()).basis).toBe(CTQ_BASIS);
  });

  it('yields zero factors and a populated notAssessed for an empty design', () => {
    const out = deriveCtqFactors(emptyDesign());
    expect(out.factors).toEqual([]);
    expect(out.notAssessed).toEqual(ALL_AREAS_ABSENT);
  });

  it('reads every area of a full design (notAssessed empty) and emits one factor per trigger', () => {
    const out = deriveCtqFactors(ctqDesign());
    expect(out.notAssessed).toEqual([]);
    expect(out.factors.map((f) => f.ctqFactor)).toEqual(FULL_DESIGN_FACTORS);
  });

  it('is critical only for the primary-endpoint, eligibility, IMP, blinding, stopping-rule and DLT rows', () => {
    const { factors } = deriveCtqFactors(ctqDesign());
    const critical = [0, 2, 3, 4, 5, 9, 10, 11, 13].map((i) => FULL_DESIGN_FACTORS[i]);
    expect(factors.filter((f) => f.isCritical).map((f) => f.ctqFactor)).toEqual(critical);
    expect(critical.filter((t) => /Key secondary|Sample|Dose modification|DMC|Interim/.test(t))).toEqual([]);
  });

  it('freezes its exported tables so no caller can change a later derivation', () => {
    expect(Object.isFrozen(CTQ_DEFAULT_RATINGS)).toBe(true);
    for (const entry of Object.values(CTQ_DEFAULT_RATINGS)) expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(CTQ_NOT_ASSESSED)).toBe(true);
    const before = JSON.stringify(deriveCtqFactors(ctqDesign()));
    expect(() => { (CTQ_DEFAULT_RATINGS.efficacy as { impact: number }).impact = 1; }).toThrow(TypeError);
    expect(JSON.stringify(deriveCtqFactors(ctqDesign()))).toBe(before);
  });
});

describe('deriveCtqFactors — ratings', () => {
  it('pins the category table and keeps every rating inside 1..5 on both bounds', () => {
    expect(CTQ_DEFAULT_RATINGS).toEqual({
      safety: { likelihood: 3, impact: 5 }, efficacy: { likelihood: 3, impact: 4 }, data_integrity: { likelihood: 3, impact: 4 }, compliance: { likelihood: 2, impact: 4 },
    });
    const ratings = [...Object.values(CTQ_DEFAULT_RATINGS), ...deriveCtqFactors(ctqDesign()).factors];
    for (const v of ratings.flatMap((r) => [r.likelihood, r.impact])) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it('gives the primary-endpoint, eligibility and IMP rows the rating of their RBM catalogue rows', () => {
    const { factors } = deriveCtqFactors(ctqDesign());
    const primary = factors.find((f) => f.derivedFrom.kind === 'endpoint' && f.derivedFrom.ref === 'HbA1c change')!;
    expect(rating(primary)).toEqual(catalogue('Primary endpoint data collection'));
    const eligibility = byKind(factors, 'eligibility');
    expect(eligibility).toHaveLength(3);
    for (const f of eligibility) expect(rating(f)).toEqual(catalogue('Eligibility / inclusion-exclusion verification'));
    const imp = factors.find((f) => f.derivedFrom.ref === 'Drug X dispensing and dosing')!;
    expect(rating(imp)).toEqual(catalogue('Investigational product accountability and compliance'));
    expect(primary.ratingFrom).toEqual({ table: 'DEFAULT_CTQ_FACTORS', ctqFactor: 'Primary endpoint data collection' });
    expect(imp.ratingFrom).toEqual({ table: 'DEFAULT_CTQ_FACTORS', ctqFactor: 'Investigational product accountability and compliance' });
  });

  it('marks every rating default_seed and names the table row it came from', () => {
    const { factors } = deriveCtqFactors(ctqDesign());
    for (const f of factors) {
      expect(f.ratingSource).toBe('default_seed');
      const from = f.ratingFrom;
      if (from.table === 'DEFAULT_CTQ_FACTORS') expect(rating(f)).toEqual(catalogue(from.ctqFactor));
      else {
        expect(from.category).toBe(f.category);
        expect({ likelihood: f.likelihood, impact: f.impact }).toEqual(CTQ_DEFAULT_RATINGS[from.category]);
      }
    }
    const keySecondary = factors.find((f) => f.derivedFrom.ref === 'DTSQ change')!;
    expect(keySecondary.ratingFrom).toEqual({ table: 'CTQ_DEFAULT_RATINGS', category: 'efficacy' });
    expect(keySecondary.isCritical).toBe(false);
  });
});

describe('deriveCtqFactors — provenance and RACT compatibility', () => {
  it('points every derivedFrom ref at a real name, text or field of the design', () => {
    const d = ctqDesign();
    const { factors } = deriveCtqFactors(d);
    const endpointNames = d.endpoints.map((e) => e.name);
    const activities = d.scheduleOfActivities!.activities;
    const criteria = d.population.eligibility.map((c) => c.text);
    const armNames = d.arms.map((a) => a.name);
    for (const f of factors) {
      switch (f.derivedFrom.kind) {
        case 'endpoint': expect(endpointNames).toContain(f.derivedFrom.ref); break;
        case 'activity': expect(activities.find((a) => a.id === f.derivedFrom.id)?.name).toBe(f.derivedFrom.ref); break;
        case 'eligibility': expect(criteria).toContain(f.derivedFrom.ref); break;
        case 'intervention': expect(armNames).toContain(f.derivedFrom.ref); break;
        case 'randomization': expect(f.derivedFrom.ref).toBe('randomization.blinding'); break;
        case 'safety': expect(['safety.stoppingRules', 'safety.dmcCharter', 'safety.dltDefinition']).toContain(f.derivedFrom.ref); break;
        case 'statistical_plan': expect(f.derivedFrom.ref).toBe('statisticalPlan.interim'); break;
      }
    }
    expect(new Set(factors.map((f) => f.derivedFrom.kind))).toEqual(
      new Set(['endpoint', 'eligibility', 'activity', 'intervention', 'randomization', 'safety', 'statistical_plan']),
    );
  });

  it('tells two same-named SoA activities apart by their activity id', () => {
    const d = clone(ctqDesign());
    d.scheduleOfActivities!.activities = [{ id: 'a1', name: 'PK sample', category: 'pk', order: 0 }, { id: 'a2', name: 'PK sample', category: 'pk', order: 1 }];
    const rows = byKind(deriveCtqFactors(d).factors, 'activity');
    expect(rows.map((f) => f.derivedFrom)).toEqual([{ kind: 'activity', ref: 'PK sample', id: 'a1' }, { kind: 'activity', ref: 'PK sample', id: 'a2' }]);
  });

  it('emits rows that carry exactly the CtqSeed fields the RBM catalogue uses, plus provenance', () => {
    const seedKeys = Object.keys(DEFAULT_CTQ_FACTORS[0]).sort();
    const categories = new Set(DEFAULT_CTQ_FACTORS.map((f) => f.category));
    for (const f of deriveCtqFactors(ctqDesign()).factors) {
      const keys = Object.keys(f).filter((k) => !['derivedFrom', 'ratingSource', 'ratingFrom'].includes(k)).sort();
      expect(keys).toEqual(seedKeys);
      expect(categories.has(f.category)).toBe(true);
    }
  });

  it('never emits a factor for a trigger the design does not contain', () => {
    const d = emptyDesign();
    d.endpoints = [{ name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'change from baseline in HbA1c' }];
    const out = deriveCtqFactors(d);
    expect(out.factors.map((f) => f.derivedFrom.kind)).toEqual(['endpoint']);
    expect(out.notAssessed).not.toContain(CTQ_NOT_ASSESSED.endpoints);
    expect(out.notAssessed).toContain(CTQ_NOT_ASSESSED.randomization);
    expect(out.notAssessed).toContain(CTQ_NOT_ASSESSED.safety);
  });
});

describe('deriveCtqFactors — totality on runtime-partial designs', () => {
  it('does not throw on a design with every structural node missing, and notes every area', () => {
    const out = deriveCtqFactors(runtime({ title: 'fragment' }));
    expect(out.factors).toEqual([]);
    expect(out.notAssessed).toEqual(ALL_AREAS_ABSENT);
    expect(deriveCtqFactors(runtime(null)).notAssessed).toEqual(ALL_AREAS_ABSENT);
  });

  it('does not throw on partial nested nodes, and states exactly what it could not read', () => {
    const out = deriveCtqFactors(runtime({
      arms: [{ name: 'A', doseModificationRules: 'reduce' }, { name: 'B' }], randomization: { ratio: [1, 1], allocationMethod: 'block' },
      safety: { dmcCharter: {} }, statisticalPlan: { interim: {} },
    }));
    expect(out.factors.map((f) => f.ctqFactor)).toEqual(['Dose modification and titration rules: A', 'Interim analysis data-cut integrity (information fractions not recorded)']);
    expect(out.factors[0].riskDescription).toContain('arm "A" applied late');
    expect(out.notAssessed).toEqual([
      CTQ_NOT_ASSESSED.endpoints, CTQ_NOT_ASSESSED.eligibility, CTQ_NOT_ASSESSED.scheduleOfActivities, doseModificationNote(['B']),
      CTQ_NOT_ASSESSED.blinding, CTQ_NOT_ASSESSED.stoppingRules, CTQ_NOT_ASSESSED.dmcCharter, CTQ_NOT_ASSESSED.dltDefinition,
    ]);
  });

  it('does not throw when list-shaped nodes carry non-list or null values', () => {
    const out = deriveCtqFactors(runtime({
      endpoints: 'HbA1c', population: { eligibility: [null, { type: 'inclusion', text: 'Age >= 18 years' }] }, arms: {},
      scheduleOfActivities: { activities: [null, { id: 'p', name: 'PK', category: 'pk', endpointNames: 'x', order: 0 }] },
      statisticalPlan: { interim: { informationFractions: 'half' } },
    }));
    expect(out.factors.map((f) => f.ctqFactor)).toEqual([
      'Eligibility verification: Age >= 18 years', 'Sample timing and handling: PK', 'Interim analysis data-cut integrity (information fractions not recorded)',
    ]);
    expect(out.notAssessed).toContain(CTQ_NOT_ASSESSED.endpoints);
    expect(out.notAssessed).toContain(CTQ_NOT_ASSESSED.arms);
  });
});

describe('deriveCtqFactors — endpoint rule', () => {
  it('fires for primary (critical) and key-secondary (not critical), not for secondary or safety', () => {
    const rows = byKind(deriveCtqFactors(ctqDesign()).factors, 'endpoint');
    expect(rows.map((f) => [f.derivedFrom.ref, f.category, f.isCritical])).toEqual([['HbA1c change', 'efficacy', true], ['DTSQ change', 'efficacy', false]]);
  });

  it('cites the primary-endpoint missing-data QTL on the primary row only', () => {
    const [primary, keySecondary] = byKind(deriveCtqFactors(ctqDesign()).factors, 'endpoint');
    expect(primary.mitigation).toContain('primary-endpoint missing-data QTL');
    expect(keySecondary.mitigation).not.toContain('primary-endpoint');
    expect(keySecondary.mitigation).toContain('missing-data KRI on this endpoint');
  });

  it('names the measurement method, or the validated instrument, or the endpoint name', () => {
    const d = ctqDesign();
    d.endpoints = [
      { name: 'Instrumented', role: 'primary', type: 'patient_reported', definition: 'x', validatedInstrument: 'EQ-5D-5L', measurementMethod: 'questionnaire', timepoint: 'week 12' },
      { name: 'Methodical', role: 'key_secondary', type: 'continuous', definition: 'x', measurementMethod: 'central lab' },
      { name: 'Bare', role: 'key_secondary', type: 'binary', definition: 'x' },
    ];
    expect(byKind(deriveCtqFactors(d).factors, 'endpoint').map((f) => f.ctqFactor)).toEqual([
      'Primary endpoint assessment: EQ-5D-5L at week 12', 'Key secondary endpoint assessment: central lab', 'Key secondary endpoint assessment: Bare',
    ]);
  });

  it('states when a patient-reported endpoint records no validated instrument', () => {
    const d = ctqDesign();
    d.endpoints = [{ name: 'PRO', role: 'primary', type: 'patient_reported', definition: 'x' }];
    const [row] = byKind(deriveCtqFactors(d).factors, 'endpoint');
    expect(row.riskDescription).toMatch(/No validated instrument is recorded/);
    expect(row.ctqFactor).toBe('Primary endpoint assessment: PRO');
  });

  it('notes endpoints that carry no confirmatory role rather than firing', () => {
    const d = ctqDesign();
    d.endpoints = [{ name: 'Exploratory only', role: 'exploratory', type: 'continuous', definition: 'x' }];
    const out = deriveCtqFactors(d);
    expect(byKind(out.factors, 'endpoint')).toEqual([]);
    expect(out.notAssessed).toContain(CTQ_NOT_ASSESSED.confirmatoryEndpoints);
  });

  it('notes an unnamed primary endpoint instead of emitting a row with an empty ref', () => {
    const d = ctqDesign();
    d.endpoints = [{ name: '  ', role: 'primary', type: 'continuous', definition: 'x' }];
    const out = deriveCtqFactors(d);
    expect(byKind(out.factors, 'endpoint')).toEqual([]);
    expect(out.notAssessed).toEqual([unnamedTriggerNote('endpoints', 1)]);
  });
});

describe('deriveCtqFactors — eligibility rule', () => {
  it('fires per numeric criterion with the text verbatim and the direction of the risk set by the criterion type', () => {
    const rows = byKind(deriveCtqFactors(ctqDesign()).factors, 'eligibility');
    expect(rows.map((f) => f.derivedFrom.ref)).toEqual(['Age 18-75 years', 'HbA1c 7.0-10.0 %', 'eGFR < 45 mL/min/1.73m²']);
    const tail = ', or the value not source-verifiable at screening; ineligible subjects undermine the analysis population.';
    expect(rows[0].riskDescription).toBe(`Subjects enrolled who do not satisfy the inclusion threshold (Age >= 18 years and <= 75 years)${tail}`);
    expect(rows[2].riskDescription).toBe(`Subjects enrolled although they meet the exclusion threshold (eGFR < 45 mL/min/1.73m²)${tail}`);
  });

  it('does not fire for prose or date criteria and counts them as not assessed', () => {
    const d = ctqDesign();
    d.population.eligibility = [
      { type: 'exclusion', text: 'History of myocardial infarction within the last 6 months' },
      { type: 'inclusion', text: 'Diagnosis date >= 2020-01-01' },
      { type: 'inclusion', text: 'Age >= 18 years' },
    ];
    const out = deriveCtqFactors(d);
    expect(byKind(out.factors, 'eligibility').map((f) => f.derivedFrom.ref)).toEqual(['Age >= 18 years']);
    expect(out.notAssessed).toEqual([unparsedEligibilityNote(2, 3)]);
    expect(unparsedEligibilityNote(2, 3)).toContain('a date');
    expect(unparsedEligibilityNote(2, 3)).not.toContain('refuse');
  });

  it('notes a numeric criterion with no inclusion/exclusion type rather than guessing the direction', () => {
    const d = ctqDesign();
    d.population.eligibility = [{ text: 'eGFR < 45 mL/min' }] as unknown as StudyDesign['population']['eligibility'];
    const out = deriveCtqFactors(d);
    expect(byKind(out.factors, 'eligibility')).toEqual([]);
    expect(out.notAssessed).toEqual([untypedEligibilityNote(1)]);
  });

  it('notes an empty eligibility list', () => {
    const d = ctqDesign();
    d.population.eligibility = [];
    const out = deriveCtqFactors(d);
    expect(byKind(out.factors, 'eligibility')).toEqual([]);
    expect(out.notAssessed).toContain(CTQ_NOT_ASSESSED.eligibility);
  });
});

describe('deriveCtqFactors — schedule-of-activities rule', () => {
  it('fires data_integrity for pk/biomarker and the catalogue IMP rating for drug_administration, nothing else', () => {
    const rows = byKind(deriveCtqFactors(ctqDesign()).factors, 'activity');
    expect(rows.map((f) => [f.derivedFrom.ref, f.category, f.isCritical])).toEqual([
      ['Drug X dispensing and dosing', catalogue('Investigational product accountability and compliance').category, true],
      ['PK blood sample', 'data_integrity', false],
      ['Fasting C-peptide', 'data_integrity', false],
    ]);
    expect(rows[2].riskDescription).toContain('Feeds endpoint(s): C-peptide change');
    expect(rows[1].riskDescription).not.toContain('Feeds endpoint');
  });

  it('rates a pd activity that records a specimen, and notes one that does not', () => {
    const d = clone(ctqDesign());
    d.scheduleOfActivities!.activities = [
      { id: 'pd1', name: 'Plasma cytokines', category: 'pd', specimen: { type: 'blood' }, order: 0 },
      { id: 'pd2', name: 'QTc response', category: 'pd', order: 1 },
    ];
    const out = deriveCtqFactors(d);
    const rows = byKind(out.factors, 'activity');
    expect(rows.map((f) => f.derivedFrom.id)).toEqual(['pd1']);
    expect(rows[0].riskDescription).toContain('PD sample "Plasma cytokines"');
    expect(out.notAssessed).toEqual([pdWithoutSpecimenNote(1)]);
  });

  it('notes an unnamed sampling activity instead of emitting a row with an empty name', () => {
    const d = clone(ctqDesign());
    d.scheduleOfActivities!.activities = [{ id: 'x', name: '', category: 'pk', order: 0 }];
    const out = deriveCtqFactors(d);
    expect(byKind(out.factors, 'activity')).toEqual([]);
    expect(out.notAssessed).toEqual([unnamedTriggerNote('schedule of activities', 1)]);
  });

  it('notes an absent SoA, and a SoA with no activities, rather than firing', () => {
    const noSoa = clone(ctqDesign());
    delete noSoa.scheduleOfActivities;
    const a = deriveCtqFactors(noSoa);
    expect(byKind(a.factors, 'activity')).toEqual([]);
    expect(a.notAssessed).toEqual([CTQ_NOT_ASSESSED.scheduleOfActivities]);
    const bare = clone(ctqDesign());
    bare.scheduleOfActivities = { epochs: [], visits: [], activities: [], cells: [] };
    expect(deriveCtqFactors(bare).notAssessed).toEqual([CTQ_NOT_ASSESSED.scheduleOfActivities]);
  });

  it('stays silent on a SoA whose activities are all of other categories', () => {
    const d = clone(ctqDesign());
    d.scheduleOfActivities!.activities = d.scheduleOfActivities!.activities.filter((x) => x.category === 'efficacy');
    const out = deriveCtqFactors(d);
    expect(byKind(out.factors, 'activity')).toEqual([]);
    expect(out.notAssessed).toEqual([]);
  });
});

describe('deriveCtqFactors — arms rule', () => {
  it('fires per arm with dose-modification rules, named for the arm and its interventions', () => {
    const rows = byKind(deriveCtqFactors(ctqDesign()).factors, 'intervention');
    expect(rows.map((f) => f.derivedFrom.ref)).toEqual(['Drug X']);
    expect(rows[0].riskDescription).toContain('arm "Drug X" (Drug X)');
  });

  it('names each non-placebo arm that records no rules, and never a placebo-only arm', () => {
    const d = clone(ctqDesign());
    delete d.arms[0].doseModificationRules;
    const out = deriveCtqFactors(d);
    expect(byKind(out.factors, 'intervention')).toEqual([]);
    expect(out.notAssessed).toEqual([doseModificationNote(['Drug X'])]);
    expect(doseModificationNote(['Drug X'])).toBe('arms: no dose-modification rules recorded for arm(s) "Drug X"; no dose-modification factor derived for them');
    d.arms = [];
    expect(deriveCtqFactors(d).notAssessed).toEqual([CTQ_NOT_ASSESSED.arms]);
  });

  it('treats blank rules as unrecorded and a blank arm name as unnamed', () => {
    const d = clone(ctqDesign());
    d.arms = [{ name: 'Drug X', interventions: [{ name: 'Drug X', role: 'investigational' }], doseModificationRules: '   ' }, { name: ' ', interventions: [{ name: 'Drug Y', role: 'investigational' }], doseModificationRules: 'halve' }];
    const out = deriveCtqFactors(d);
    expect(byKind(out.factors, 'intervention')).toEqual([]);
    expect(out.notAssessed).toEqual([doseModificationNote(['Drug X']), unnamedTriggerNote('arms', 1)]);
  });
});

describe('deriveCtqFactors — blinding rule', () => {
  it('fires blind-maintenance and emergency-unblinding rows for a blinded design only', () => {
    const rows = byKind(deriveCtqFactors(ctqDesign()).factors, 'randomization');
    expect(rows.map((f) => [f.category, f.isCritical])).toEqual([['data_integrity', true], ['compliance', true]]);
    expect(rows[1].riskDescription).toContain('IWRS code-break by the investigator, 24/7');
    const open = clone(ctqDesign());
    open.randomization!.blinding = 'open';
    const o = deriveCtqFactors(open);
    expect(byKind(o.factors, 'randomization')).toEqual([]);
    expect(o.notAssessed).toEqual([]);
    const none = clone(ctqDesign());
    delete none.randomization;
    expect(deriveCtqFactors(none).notAssessed).toEqual([CTQ_NOT_ASSESSED.randomization]);
  });

  it('fires for single and triple blinding too', () => {
    for (const level of ['single', 'triple'] as const) {
      const d = clone(ctqDesign());
      d.randomization!.blinding = level;
      const titles = byKind(deriveCtqFactors(d).factors, 'randomization').map((f) => f.ctqFactor);
      expect(titles).toEqual([`Blind maintenance (${level}-blind design)`, `Emergency unblinding (${level}-blind design)`]);
    }
  });

  it('never presumes a blinded design from a missing, blank or unrecognised blinding value', () => {
    for (const blinding of [undefined, null, '', 'partial']) {
      const d = runtime({ ...clone(ctqDesign()), randomization: { ratio: [1, 1], allocationMethod: 'block', blinding } });
      const out = deriveCtqFactors(d);
      expect(byKind(out.factors, 'randomization')).toEqual([]);
      expect(out.factors.some((f) => f.ctqFactor.includes('-blind design'))).toBe(false);
      expect(out.notAssessed).toEqual([CTQ_NOT_ASSESSED.blinding]);
    }
  });

  it('says so when a blinded design records no emergency unblinding procedure', () => {
    const d = clone(ctqDesign());
    delete d.randomization!.emergencyUnblindingProcedure;
    const [, unblinding] = byKind(deriveCtqFactors(d).factors, 'randomization');
    expect(unblinding.riskDescription).toMatch(/No emergency unblinding procedure is recorded/);
  });
});

describe('deriveCtqFactors — safety and interim rules', () => {
  it('fires stopping-rule (critical), DMC (not critical) and DLT (critical) rows from the safety design', () => {
    const rows = byKind(deriveCtqFactors(ctqDesign()).factors, 'safety');
    expect(rows.map((f) => [f.derivedFrom.ref, f.isCritical])).toEqual([['safety.stoppingRules', true], ['safety.dmcCharter', false], ['safety.dltDefinition', true]]);
  });

  it('notes each unrecorded safety field, treats present:false as assessed, and an absent node as one note', () => {
    const d = clone(ctqDesign());
    d.safety = { dmcCharter: { present: false } };
    const out = deriveCtqFactors(d);
    expect(byKind(out.factors, 'safety')).toEqual([]);
    expect(out.notAssessed).toEqual([CTQ_NOT_ASSESSED.stoppingRules, CTQ_NOT_ASSESSED.dltDefinition]);
    d.safety = { aeDefinitions: 'MedDRA' };
    expect(deriveCtqFactors(d).notAssessed).toEqual([CTQ_NOT_ASSESSED.stoppingRules, CTQ_NOT_ASSESSED.dmcCharter, CTQ_NOT_ASSESSED.dltDefinition]);
    delete d.safety;
    expect(deriveCtqFactors(d).notAssessed).toEqual([CTQ_NOT_ASSESSED.safety]);
  });

  it('treats a DMC charter with no present value as unrecorded, not as a recorded negative', () => {
    const d = runtime({ ...clone(ctqDesign()), safety: { stoppingRules: 's', dltDefinition: 'd', dmcCharter: {} } });
    const out = deriveCtqFactors(d);
    expect(byKind(out.factors, 'safety').map((f) => f.derivedFrom.ref)).toEqual(['safety.stoppingRules', 'safety.dltDefinition']);
    expect(out.notAssessed).toEqual([CTQ_NOT_ASSESSED.dmcCharter]);
  });

  it('treats blank or whitespace-only stopping rules and DLT definition as unrecorded', () => {
    const d = clone(ctqDesign());
    d.safety = { stoppingRules: '   ', dltDefinition: '\n\t', dmcCharter: { present: false } };
    const out = deriveCtqFactors(d);
    expect(byKind(out.factors, 'safety')).toEqual([]);
    expect(out.notAssessed).toEqual([CTQ_NOT_ASSESSED.stoppingRules, CTQ_NOT_ASSESSED.dltDefinition]);
  });

  it('fires the interim data-cut row only when an interim design is present', () => {
    const rows = byKind(deriveCtqFactors(ctqDesign()).factors, 'statistical_plan');
    expect(rows.map((f) => [f.category, f.isCritical])).toEqual([['data_integrity', false]]);
    const d = clone(ctqDesign());
    delete d.statisticalPlan.interim;
    const out = deriveCtqFactors(d);
    expect(byKind(out.factors, 'statistical_plan')).toEqual([]);
    expect(out.notAssessed).toEqual([CTQ_NOT_ASSESSED.interim]);
  });
});
