/**
 * The registration projection reads its eligibility from `eligibility-model.ts`.
 *
 * Three fields of the ClinicalTrials.gov eligibility module used to be hard-coded gaps —
 * "Sex / gender", "Age limits", "Accepts healthy volunteers" — and the criteria themselves were
 * one joined string. This suite pins what the wiring is allowed to do:
 *
 *   • an age limit appears ONLY when an inclusion `age` criterion states one, in that
 *     criterion's own unit, with its own inclusive/exclusive sense;
 *   • mixed time units produce NO age limit, not a converted or chosen one;
 *   • nothing is defaulted — the projection never emits "18 Years" because most trials use it;
 *   • every criterion reaches the record, including the ~50% the grammar refuses;
 *   • sex and healthy-volunteer eligibility stay gaps, and the gap NAMES the field that would
 *     close it, because `StudyDesign.population` has nowhere to record either.
 *
 * It also pins that both engines are reachable through the module barrel, which is the only
 * reason either has a caller at all.
 */

import { describe, it, expect } from 'vitest';
import {
  projectRegistration,
  type RegistrationField,
  type RegistrationRecord,
} from '../registration-projection';
import { projectRegistryEligibility } from '../eligibility-model';
import * as studyDesignModule from '../index';
import type { EligibilityCriterion, StudyDesign } from '../study-design-types';

function designWith(eligibility: EligibilityCriterion[]): StudyDesign {
  return {
    title: 'A phase 3 study of Drug X in type 2 diabetes',
    phase: '3',
    indication: 'type 2 diabetes',
    productType: 'drug',
    targetRegions: ['Germany'],
    objectives: [{ level: 'primary', order: 1, text: 'Superiority on HbA1c', endpointName: 'HbA1c change' }],
    estimands: [],
    endpoints: [
      { name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'change from baseline', timepoint: 'week 24' },
    ],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: {
      targetDescription: 'adults with type 2 diabetes',
      analysisPopulations: [{ kind: 'ITT', definition: 'all randomized' }],
      eligibility,
    },
    arms: [
      { name: 'Drug X', interventions: [{ name: 'Drug X', role: 'investigational' }] },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo' }] },
    ],
    randomization: { ratio: [1, 1], allocationMethod: 'stratified', blinding: 'double' },
    statisticalPlan: { alpha: 0.05, power: 0.9, plannedSampleSize: 400, plannedAnalyses: [] },
  };
}

function fieldOf(rec: RegistrationRecord, name: string): RegistrationField {
  const f = rec.modules.flatMap(m => m.fields).find(x => x.name === name);
  expect(f, `field "${name}" is not in the record`).toBeDefined();
  return f as RegistrationField;
}

/** Criteria the grammar reads: a labelled range, a symbolic comparator, a written unit. */
const PARSEABLE: EligibilityCriterion[] = [
  { type: 'inclusion', text: 'Age 18-75 years' },
  { type: 'inclusion', text: 'HbA1c 7.0-10.5%' },
  { type: 'exclusion', text: 'eGFR < 30 mL/min/1.73m2' },
];

/** Criteria the grammar refuses, each for a different stated reason. */
const UNPARSEABLE: EligibilityCriterion[] = [
  { type: 'inclusion', text: 'Able and willing to provide written informed consent' },
  { type: 'inclusion', text: 'At least 18 years of age' },
  { type: 'exclusion', text: 'Pregnancy or breastfeeding' },
  { type: 'exclusion', text: 'Any condition that, in the opinion of the investigator, would compromise participation' },
];

describe('age limits come from the criteria, in the criteria’s own units', () => {
  it('renders minimum and maximum age when an inclusion age criterion states them', () => {
    const age = fieldOf(projectRegistration(designWith(PARSEABLE), 'ctgov'), 'Age limits');
    expect(age.status).toBe('rendered');
    expect(age.value).toBe('Minimum age: 18 years; Maximum age: 75 years');
    expect(age.gap).toBeUndefined();
  });

  it('keeps a strict comparator strict instead of rounding it into an inclusive bound', () => {
    const age = fieldOf(projectRegistration(designWith([{ type: 'inclusion', text: 'Age > 17 years' }]), 'ctgov'), 'Age limits');
    expect(age.status).toBe('partial'); // a lower bound only
    expect(age.value).toBe('Minimum age: above 17 years');
    expect(age.value).not.toMatch(/^Minimum age: 17 years/);
  });

  it('carries the unit the criterion wrote, not a canonical one', () => {
    const age = fieldOf(projectRegistration(designWith([{ type: 'inclusion', text: 'Age 6-17 months' }]), 'ctgov'), 'Age limits');
    expect(age.value).toBe('Minimum age: 6 months; Maximum age: 17 months');
  });

  it('emits NO age limit when the age criteria mix time units, and says why', () => {
    const mixed = designWith([
      { type: 'inclusion', text: 'Age >= 18 years' },
      { type: 'inclusion', text: 'Age <= 900 months' },
    ]);
    const age = fieldOf(projectRegistration(mixed, 'ctgov'), 'Age limits');
    expect(age.status).toBe('missing');
    expect(age.value).toBeNull();
    expect(age.gap).toMatch(/more than one time unit/i);
    expect(age.gap).toMatch(/does not convert/i);
    // Neither bound leaked through in either unit.
    expect(JSON.stringify(age)).not.toMatch(/Minimum age: 18|Maximum age: 900/);
  });

  it('defaults nothing when no criterion states an age at all', () => {
    const rec = projectRegistration(designWith(UNPARSEABLE), 'ctgov');
    const age = fieldOf(rec, 'Age limits');
    expect(age.status).toBe('missing');
    expect(age.value).toBeNull();
    // `an lower` is the engine's own wording (eligibility-model.ts `ageAbsenceReason`); the
    // projection passes the reason through verbatim rather than paraphrasing it.
    expect(age.gap).toMatch(/no inclusion criterion states an lower age bound in a written time unit/i);
    expect(age.gap).toMatch(/upper age bound in a written time unit/i);
    // The registry's own habitual default must never appear from nowhere.
    expect(JSON.stringify(rec)).not.toMatch(/18 Years/);
    expect(JSON.stringify(rec)).not.toMatch(/Minimum age: /);
  });

  it('does not fold an age EXCLUSION into the registry age limits', () => {
    const rec = projectRegistration(designWith([{ type: 'exclusion', text: 'Age < 18 years' }]), 'ctgov');
    const age = fieldOf(rec, 'Age limits');
    expect(age.status).toBe('missing');
    expect(age.gap).toMatch(/exclusion criterion constrains age/i);
  });
});

describe('sex and healthy-volunteer eligibility stay gaps, and name what would settle them', () => {
  it('names the field that would close the sex gap', () => {
    const sex = fieldOf(projectRegistration(designWith(PARSEABLE), 'ctgov'), 'Sex / gender');
    expect(sex.status).toBe('missing');
    expect(sex.value).toBeNull();
    expect(sex.required).toBe(true);
    expect(sex.gap).toMatch(/EligibilityRecordedFacts\.sex/);
    expect(sex.gap).toMatch(/StudyDesign\.population/);
    // The old text said only that it was absent; it must now say what would end that.
    expect(sex.gap).not.toBe('Eligibility sex is not part of the design object.');
  });

  it('names the field that would close the healthy-volunteers gap', () => {
    const hv = fieldOf(projectRegistration(designWith(PARSEABLE), 'ctgov'), 'Accepts healthy volunteers');
    expect(hv.status).toBe('missing');
    expect(hv.value).toBeNull();
    expect(hv.gap).toMatch(/EligibilityRecordedFacts\.healthyVolunteers/);
    expect(hv.gap).toMatch(/StudyDesign\.population/);
  });

  it('never reads sex out of the criterion text, however plainly the text states it', () => {
    const gendered = designWith([
      { type: 'inclusion', text: 'Female subjects only' },
      { type: 'inclusion', text: 'Male participants are not eligible' },
      { type: 'exclusion', text: 'Women of childbearing potential' },
    ]);
    const rec = projectRegistration(gendered, 'ctgov');
    const sex = fieldOf(rec, 'Sex / gender');
    expect(sex.status).toBe('missing');
    expect(sex.value).toBeNull();
    // …and the criteria that say it are still in the record, verbatim.
    expect(fieldOf(rec, 'Eligibility criteria').value).toMatch(/Female subjects only/);
  });

  it('never reads healthy-volunteer eligibility out of the criterion text either', () => {
    const hvText = designWith([{ type: 'inclusion', text: 'Healthy volunteers aged 18 or over' }]);
    const hv = fieldOf(projectRegistration(hvText, 'ctgov'), 'Accepts healthy volunteers');
    expect(hv.status).toBe('missing');
    expect(hv.value).toBeNull();
  });
});

describe('no criterion is dropped for being unreadable', () => {
  it('keeps every unparsed criterion in the rendered value and in the structure', () => {
    const rec = projectRegistration(designWith(UNPARSEABLE), 'ctgov');
    const criteria = fieldOf(rec, 'Eligibility criteria');
    expect(criteria.status).toBe('rendered');
    for (const c of UNPARSEABLE) expect(criteria.value).toContain(c.text);

    const structure = criteria.eligibility;
    expect(structure).toBeDefined();
    expect(structure!.criteria.map(r => r.text)).toEqual(UNPARSEABLE.map(c => c.text));
    expect(structure!.structured).toBe(0);
    expect(structure!.unstructured).toBe(UNPARSEABLE.length);
    // Each refusal carries a machine-readable reason rather than vanishing.
    for (const row of structure!.criteria) {
      expect(row.structure.kind).toBe('free_text');
      expect((row.structure as { reason: string }).reason.length).toBeGreaterThan(0);
    }
  });

  it('keeps every criterion when only some of them parse', () => {
    const mixed = [...PARSEABLE, ...UNPARSEABLE];
    const criteria = fieldOf(projectRegistration(designWith(mixed), 'ctgov'), 'Eligibility criteria');
    for (const c of mixed) expect(criteria.value).toContain(c.text);
    expect(criteria.eligibility!.criteria).toHaveLength(mixed.length);
    expect(criteria.eligibility!.structured).toBe(PARSEABLE.length);
    expect(criteria.eligibility!.unstructured).toBe(UNPARSEABLE.length);
  });

  it('renders the criteria it can read as data, on the same field as the text', () => {
    const criteria = fieldOf(projectRegistration(designWith(PARSEABLE), 'ctgov'), 'Eligibility criteria');
    const hba1c = criteria.eligibility!.criteria.find(r => r.text.startsWith('HbA1c'))!;
    expect(hba1c.structure.kind).toBe('threshold');
    expect(hba1c.structure).toMatchObject({
      unit: '%',
      bounds: [{ op: '>=', value: 7 }, { op: '<=', value: 10.5 }],
    });
  });

  it('carries the same criteria through the EU CTIS record, split by type', () => {
    const rec = projectRegistration(designWith([...PARSEABLE, ...UNPARSEABLE]), 'ctis');
    const inclusion = fieldOf(rec, 'Inclusion criteria');
    const exclusion = fieldOf(rec, 'Exclusion criteria');
    const all = [...PARSEABLE, ...UNPARSEABLE];
    for (const c of all.filter(x => x.type === 'inclusion')) expect(inclusion.value).toContain(c.text);
    for (const c of all.filter(x => x.type === 'exclusion')) expect(exclusion.value).toContain(c.text);
    expect(inclusion.eligibility!.criteria.every(r => r.type === 'inclusion')).toBe(true);
    expect(exclusion.eligibility!.criteria.every(r => r.type === 'exclusion')).toBe(true);
    expect(
      inclusion.eligibility!.criteria.length + exclusion.eligibility!.criteria.length,
    ).toBe(all.length);
  });

  it('reports no criteria as a gap rather than an empty rendered field', () => {
    const criteria = fieldOf(projectRegistration(designWith([]), 'ctgov'), 'Eligibility criteria');
    expect(criteria.status).toBe('missing');
    expect(criteria.value).toBeNull();
    expect(criteria.gap).toMatch(/records no eligibility criteria/i);
  });
});

describe('the projection reports everything the engine calls absent', () => {
  const cases: Array<[string, EligibilityCriterion[]]> = [
    ['no criteria', []],
    ['nothing parseable', UNPARSEABLE],
    ['a lower bound only', [{ type: 'inclusion', text: 'Age >= 18 years' }]],
    ['mixed age units', [{ type: 'inclusion', text: 'Age >= 18 years' }, { type: 'inclusion', text: 'Age <= 900 months' }]],
    ['fully bounded', PARSEABLE],
    // Criteria whose wording names a sex and a healthy-volunteer population. The engine reports
    // both facts absent regardless, so the record must still carry both absences: this row is
    // what fails if the projection ever starts reading either out of the text.
    ['criteria whose wording names a sex', [
      { type: 'inclusion', text: 'Female subjects only' } as EligibilityCriterion,
      { type: 'exclusion', text: 'Male participants and healthy volunteers' } as EligibilityCriterion,
    ]],
  ];

  it.each(cases)('carries every absent field of %s into a gap on the record', (_label, criteria) => {
    const block = projectRegistryEligibility(criteria);
    const rec = projectRegistration(designWith(criteria), 'ctgov');
    const unfilled = rec.modules
      .flatMap(m => m.fields)
      .filter(f => f.status !== 'rendered')
      .map(f => f.gap ?? '');
    expect(block.absent.length).toBeGreaterThan(0);
    for (const a of block.absent) {
      expect(
        unfilled.some(g => g.includes(a.reason)),
        `absent field "${a.field}" is not reported anywhere on the record`,
      ).toBe(true);
    }
  });
});

describe('both engines are reachable through the module barrel', () => {
  it('exports the eligibility model', () => {
    expect(typeof studyDesignModule.assessEligibility).toBe('function');
    expect(typeof studyDesignModule.projectRegistryEligibility).toBe('function');
    expect(typeof studyDesignModule.structureEligibility).toBe('function');
    expect(typeof studyDesignModule.parseEligibilityCriterion).toBe('function');
    expect(typeof studyDesignModule.ELIGIBILITY_BASIS).toBe('string');
  });

  it('exports the registry filing engine', () => {
    expect(typeof studyDesignModule.buildRegistryFiling).toBe('function');
    expect(typeof studyDesignModule.filingExpectations).toBe('function');
    expect(typeof studyDesignModule.timelinessObligations).toBe('function');
    expect(studyDesignModule.OBLIGATION_STATUSES).toContain('undetermined');
  });
});
