/**
 * Tests for the ICH E6(R3) critical-to-quality derivation. Every rule fires on a
 * design that carries its trigger and stays silent on one that does not; every
 * rating is the category default and says so; every factor names the design
 * element it came from; an empty design yields no factor and a full ledger of
 * what could not be read; and the output is byte-identical run to run.
 */

import { describe, it, expect } from 'vitest';
import {
  CTQ_BASIS,
  CTQ_DEFAULT_RATINGS,
  CTQ_NOT_ASSESSED,
  deriveCtqFactors,
  unparsedEligibilityNote,
  type DerivedCtqFactor,
} from '../ctq-derivation';
import { DEFAULT_CTQ_FACTORS } from '../../rbm/rbm-engine';
import { type ScheduleOfActivities, type StudyDesign } from '../study-design-types';

function ctqSoa(): ScheduleOfActivities {
  return {
    epochs: [
      { id: 'e_scr', name: 'Screening', kind: 'screening', order: 0 },
      { id: 'e_trt', name: 'Treatment', kind: 'treatment', order: 1 },
    ],
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
    cells: [
      { activityId: 'a_hba1c', visitId: 'V2', state: 'performed' },
      { activityId: 'a_hba1c', visitId: 'V3', state: 'performed' },
      { activityId: 'a_dose', visitId: 'V2', state: 'performed' },
      { activityId: 'a_pk', visitId: 'V3', state: 'performed' },
    ],
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
    statisticalPlan: {
      plannedAnalyses: [{ endpointName: 'HbA1c change', method: 'MMRM' }],
      interim: { informationFractions: [0.5], spendingFunction: 'obrien_fleming' },
    },
    safety: {
      aeDefinitions: 'MedDRA coding',
      stoppingRules: 'Study pauses on two treatment-related SAEs of the same kind.',
      dltDefinition: 'Grade ≥3 non-haematological toxicity within 28 days of first dose.',
      dmcCharter: { present: true, meetingCadence: 'quarterly' },
    },
  };
}

/** Only the fields the type requires; nothing that triggers a rule. */
function emptyDesign(): StudyDesign {
  return {
    title: 'An empty design',
    phase: '2',
    indication: 'unspecified',
    objectives: [],
    estimands: [],
    endpoints: [],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: { targetDescription: '', analysisPopulations: [], eligibility: [] },
    arms: [],
    statisticalPlan: { plannedAnalyses: [] },
  };
}

function clone(d: StudyDesign): StudyDesign {
  return JSON.parse(JSON.stringify(d));
}

function byKind(factors: DerivedCtqFactor[], kind: DerivedCtqFactor['derivedFrom']['kind']): DerivedCtqFactor[] {
  return factors.filter((f) => f.derivedFrom.kind === kind);
}

describe('deriveCtqFactors — whole-design properties', () => {
  it('is deterministic and does not mutate the input', () => {
    const d = ctqDesign();
    const before = JSON.stringify(d);
    const a = deriveCtqFactors(d);
    const b = deriveCtqFactors(d);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(d)).toBe(before);
  });

  it('cites its basis on the output and as a constant', () => {
    expect(CTQ_BASIS).toBe('ICH E6(R3) §3.10 — identification of critical-to-quality factors at design; TransCelerate RACT');
    expect(deriveCtqFactors(ctqDesign()).basis).toBe(CTQ_BASIS);
  });

  it('yields zero factors and a populated notAssessed for an empty design', () => {
    const out = deriveCtqFactors(emptyDesign());
    expect(out.factors).toEqual([]);
    expect(out.notAssessed).toEqual([
      CTQ_NOT_ASSESSED.endpoints,
      CTQ_NOT_ASSESSED.eligibility,
      CTQ_NOT_ASSESSED.scheduleOfActivities,
      CTQ_NOT_ASSESSED.arms,
      CTQ_NOT_ASSESSED.randomization,
      CTQ_NOT_ASSESSED.safety,
      CTQ_NOT_ASSESSED.interim,
    ]);
  });

  it('reads every area of a full design (notAssessed empty) and emits one factor per trigger', () => {
    const out = deriveCtqFactors(ctqDesign());
    expect(out.notAssessed).toEqual([]);
    expect(out.factors.map((f) => f.ctqFactor)).toEqual([
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
    ]);
  });

  it('marks every rating default_seed and takes it from the one category table', () => {
    const { factors } = deriveCtqFactors(ctqDesign());
    expect(factors.length).toBeGreaterThan(0);
    for (const f of factors) {
      expect(f.ratingSource).toBe('default_seed');
      expect({ likelihood: f.likelihood, impact: f.impact }).toEqual(CTQ_DEFAULT_RATINGS[f.category]);
    }
  });

  it('is critical only for the primary-endpoint, IMP, blinding, stopping-rule and DLT rows', () => {
    const { factors } = deriveCtqFactors(ctqDesign());
    expect(factors.filter((f) => f.isCritical).map((f) => f.ctqFactor)).toEqual([
      'Primary endpoint assessment: central laboratory HbA1c (NGSP-certified) at week 24',
      'IMP accountability and dosing: Drug X dispensing and dosing',
      'Blind maintenance (double-blind design)',
      'Emergency unblinding (double-blind design)',
      'Stopping-rule triggers and escalation',
      'Dose-limiting toxicity assessment and escalation decisions',
    ]);
  });
});

describe('deriveCtqFactors — provenance and RACT compatibility', () => {
  it('points every derivedFrom ref at a real name, text or field of the design', () => {
    const d = ctqDesign();
    const { factors } = deriveCtqFactors(d);
    const endpointNames = d.endpoints.map((e) => e.name);
    const activityNames = d.scheduleOfActivities!.activities.map((a) => a.name);
    const criteria = d.population.eligibility.map((c) => c.text);
    const armNames = d.arms.map((a) => a.name);
    for (const f of factors) {
      switch (f.derivedFrom.kind) {
        case 'endpoint': expect(endpointNames).toContain(f.derivedFrom.ref); break;
        case 'activity': expect(activityNames).toContain(f.derivedFrom.ref); break;
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

  it('emits rows that carry exactly the CtqSeed fields the RBM catalogue uses, plus provenance', () => {
    const seedKeys = Object.keys(DEFAULT_CTQ_FACTORS[0]).sort();
    const categories = new Set(DEFAULT_CTQ_FACTORS.map((f) => f.category));
    for (const f of deriveCtqFactors(ctqDesign()).factors) {
      const keys = Object.keys(f).filter((k) => k !== 'derivedFrom' && k !== 'ratingSource').sort();
      expect(keys).toEqual(seedKeys);
      expect(categories.has(f.category)).toBe(true);
      expect(f.likelihood).toBeGreaterThanOrEqual(1);
      expect(f.impact).toBeLessThanOrEqual(5);
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

describe('deriveCtqFactors — endpoint rule', () => {
  it('fires for primary (critical) and key-secondary (not critical), not for secondary or safety', () => {
    const rows = byKind(deriveCtqFactors(ctqDesign()).factors, 'endpoint');
    expect(rows.map((f) => [f.derivedFrom.ref, f.category, f.isCritical])).toEqual([
      ['HbA1c change', 'efficacy', true],
      ['DTSQ change', 'efficacy', false],
    ]);
  });

  it('names the measurement method, or the validated instrument, or the endpoint name', () => {
    const d = ctqDesign();
    d.endpoints = [
      { name: 'Instrumented', role: 'primary', type: 'patient_reported', definition: 'x', validatedInstrument: 'EQ-5D-5L', measurementMethod: 'questionnaire', timepoint: 'week 12' },
      { name: 'Methodical', role: 'key_secondary', type: 'continuous', definition: 'x', measurementMethod: 'central lab' },
      { name: 'Bare', role: 'key_secondary', type: 'binary', definition: 'x' },
    ];
    expect(byKind(deriveCtqFactors(d).factors, 'endpoint').map((f) => f.ctqFactor)).toEqual([
      'Primary endpoint assessment: EQ-5D-5L at week 12',
      'Key secondary endpoint assessment: central lab',
      'Key secondary endpoint assessment: Bare',
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
});

describe('deriveCtqFactors — eligibility rule', () => {
  it('fires per numeric criterion with the text verbatim and the parsed bounds in the risk', () => {
    const rows = byKind(deriveCtqFactors(ctqDesign()).factors, 'eligibility');
    expect(rows.map((f) => f.derivedFrom.ref)).toEqual(['Age 18-75 years', 'HbA1c 7.0-10.0 %', 'eGFR < 45 mL/min/1.73m²']);
    expect(rows.every((f) => f.category === 'compliance' && !f.isCritical)).toBe(true);
    expect(rows[0].riskDescription).toContain('inclusion threshold (Age >= 18 years and <= 75 years)');
    expect(rows[2].riskDescription).toContain('exclusion threshold (eGFR < 45 mL/min/1.73m²)');
  });

  it('does not fire for prose criteria and counts them as not assessed', () => {
    const d = ctqDesign();
    d.population.eligibility = [
      { type: 'exclusion', text: 'History of myocardial infarction within the last 6 months' },
      { type: 'inclusion', text: 'Age >= 18 years' },
    ];
    const out = deriveCtqFactors(d);
    expect(byKind(out.factors, 'eligibility').map((f) => f.derivedFrom.ref)).toEqual(['Age >= 18 years']);
    expect(out.notAssessed).toContain(unparsedEligibilityNote(1, 2));
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
  it('fires data_integrity for pk/biomarker and critical safety for drug_administration, nothing else', () => {
    const rows = byKind(deriveCtqFactors(ctqDesign()).factors, 'activity');
    expect(rows.map((f) => [f.derivedFrom.ref, f.category, f.isCritical])).toEqual([
      ['Drug X dispensing and dosing', 'safety', true],
      ['PK blood sample', 'data_integrity', false],
      ['Fasting C-peptide', 'data_integrity', false],
    ]);
    expect(rows[2].riskDescription).toContain('Feeds endpoint(s): C-peptide change');
    expect(rows[1].riskDescription).not.toContain('Feeds endpoint');
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

describe('deriveCtqFactors — arms, blinding, safety and interim rules', () => {
  it('fires per arm with dose-modification rules, named for the arm and its interventions', () => {
    const rows = byKind(deriveCtqFactors(ctqDesign()).factors, 'intervention');
    expect(rows.map((f) => f.derivedFrom.ref)).toEqual(['Drug X']);
    expect(rows[0].riskDescription).toContain('arm "Drug X" (Drug X)');
    const d = clone(ctqDesign());
    delete d.arms[0].doseModificationRules;
    expect(byKind(deriveCtqFactors(d).factors, 'intervention')).toEqual([]);
    d.arms = [];
    expect(deriveCtqFactors(d).notAssessed).toContain(CTQ_NOT_ASSESSED.arms);
  });

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

  it('says so when a blinded design records no emergency unblinding procedure', () => {
    const d = clone(ctqDesign());
    delete d.randomization!.emergencyUnblindingProcedure;
    const [, unblinding] = byKind(deriveCtqFactors(d).factors, 'randomization');
    expect(unblinding.riskDescription).toMatch(/No emergency unblinding procedure is recorded/);
  });

  it('fires stopping-rule (critical), DMC (not critical) and DLT (critical) rows from the safety design', () => {
    const rows = byKind(deriveCtqFactors(ctqDesign()).factors, 'safety');
    expect(rows.map((f) => [f.derivedFrom.ref, f.isCritical])).toEqual([
      ['safety.stoppingRules', true],
      ['safety.dmcCharter', false],
      ['safety.dltDefinition', true],
    ]);
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
