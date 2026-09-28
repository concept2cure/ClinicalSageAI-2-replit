/**
 * Planning inputs — validation and application.
 *
 * What the suite holds: each block is validated strictly against what its
 * engine accepts (an unknown key, an out-of-range value or an inconsistent
 * combination is refused with its path — including a per-dose stop smaller
 * than a cohort, a duplicate dose label, a BOIN neighbourhood the engine
 * cannot compute boundaries for, a method's missing or unused discount, and a
 * visit count beyond the MMRM bound); text that the recording form could not
 * show back ("|", ";" in an arm, a line break) is refused; `null` clears a
 * block and nothing else changes; an activity attribute is set or cleared on
 * exactly one activity; an unknown activity or a design with no SoA is
 * refused; what is applied is what each block's engine then reads, and a
 * cleared block is one it no longer reads; and the recorded block a writer's
 * precondition is compared with is exactly what the design carries.
 */
import { describe, expect, it } from 'vitest';

import type { StudyDesign } from '../study-design-types';
import {
  MMRM_MAX_VISITS, PlanningInputError, applyPlanningInput, parsePlanningInput, recordedBlock, sameRecorded,
  type PlanningInput,
} from '../planning-inputs';
import { projectDoseEscalation } from '../dose-escalation';
import { profileDecentralization } from '../dct-profile';
import { projectEnrollment } from '../enrollment-projection';
import { projectMmrmSizing } from '../mmrm-sizing';
import { projectExternalControlPlan } from '../external-control-plan';
import { checkMasterProtocol } from '../master-protocol';

function design(): StudyDesign {
  return {
    id: 'sd_1', programId: '11111111-1111-4111-8111-111111111111',
    title: 'A first-in-human study', phase: 'FIH', indication: 'solid tumours', objectives: [], estimands: [],
    endpoints: [{ name: 'DLT', role: 'primary', type: 'binary', definition: 'DLT in cycle 1' }],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'single_arm', controlType: 'none' },
    population: { targetDescription: 'adults', analysisPopulations: [], eligibility: [] },
    arms: [], statisticalPlan: { plannedAnalyses: [], plannedSampleSize: 30 },
    safety: { dltDefinition: 'Grade 3+ in cycle 1' },
    scheduleOfActivities: {
      epochs: [{ id: 'e1', name: 'Treatment', kind: 'treatment', order: 0 }],
      visits: [{ id: 'V1', name: 'Day 1', epochId: 'e1', studyDay: 1, isBaseline: true, order: 0 }],
      activities: [{ id: 'pk', name: 'PK', category: 'pk', order: 0 }, { id: 'ecg', name: 'ECG', category: 'safety', order: 1 }],
      cells: [{ activityId: 'pk', visitId: 'V1', state: 'performed' }],
    },
  } as StudyDesign;
}

/** A randomised platform design with a continuous MMRM endpoint and an external control: every planning engine applies. */
function platform(): StudyDesign {
  return {
    ...design(), phase: '2',
    endpoints: [{ name: 'HbA1c', role: 'primary', type: 'continuous', definition: 'change from baseline' }],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'platform', controlType: 'external' },
    arms: [{ name: 'Drug A, 10 mg', interventions: [] }, { name: 'Drug B', interventions: [] }, { name: 'Placebo', interventions: [] }],
    statisticalPlan: { plannedAnalyses: [{ endpointName: 'HbA1c', method: 'MMRM' }], plannedSampleSize: 300, alpha: 0.05, power: 0.9 },
  } as unknown as StudyDesign;
}

const BOIN = {
  method: 'boin', targetToxicity: 0.3, doseLevels: [{ label: 'DL1', dose: '10 mg' }, { label: 'DL2' }], cohortSize: 3, maxSampleSize: 30, startingDoseIndex: 0,
};
const MMRM = { endpointName: 'HbA1c', visits: 2, covariance: 'ar1', rho: 0.5, sigma: 1, delta: 0.5, retention: [0.9, 0.8], allocationRatio: 1 };
const EXTERNAL = { source: 'registry', endpointName: 'HbA1c', historical: { n: 50, mean: 1, se: 0.2 }, method: 'commensurate', tau2: 0.5, plannedConcurrentControlN: 20, assumedSd: 1 };
const MASTER = { subStudies: [{ id: 'S1', name: 'KRAS', population: 'KRAS G12C', arms: ['Drug A, 10 mg', 'Placebo'] }, { id: 'S2', name: 'MET', population: 'METex14', arms: ['Drug B', 'Placebo'] }], sharedControlArm: 'Placebo' };

const parse = (block: string, value: unknown) => parsePlanningInput({ block, value });
const issuesOf = (block: string, value: unknown): string[] => {
  const r = parse(block, value);
  return r.ok ? [] : r.issues;
};
function input(block: string, value: unknown): PlanningInput {
  const r = parse(block, value);
  if (!r.ok) throw new Error(`fixture refused: ${r.issues.join('; ')}`);
  return r.input;
}

describe('parsePlanningInput — strict validation', () => {
  it('accepts a complete dose-escalation block', () => {
    expect(parse('doseEscalation', BOIN).ok).toBe(true);
  });

  it('refuses an unknown key, an out-of-range target and an inconsistent start, each with its path', () => {
    const issues = issuesOf('doseEscalation', { ...BOIN, targetToxicity: 1.2, startingDoseIndex: 5, colour: 'red' }).join(' | ');
    expect(issues).toMatch(/value\.targetToxicity/);
    expect(issues).toMatch(/Unrecognized key\(s\) in object: 'colour'/);
    // An out-of-range target is reported once, as itself — not also as a neighbourhood the author never typed.
    expect(issues).not.toMatch(/phi1|neighbourhood/);
  });

  it('refuses an unknown key inside a nested entry, with the entry\'s path', () => {
    expect(issuesOf('doseEscalation', { ...BOIN, doseLevels: [{ label: 'DL1', mg: 10 }, { label: 'DL2' }] }).join(' | '))
      .toMatch(/value\.doseLevels\.0: Unrecognized key\(s\) in object: 'mg'/);
  });

  it('refuses a start dose beyond the recorded levels, a max N smaller than a cohort, and a per-dose stop smaller than a cohort', () => {
    expect(issuesOf('doseEscalation', { ...BOIN, startingDoseIndex: 2, maxSampleSize: 2, stopWhenAtDoseN: 2 })).toEqual(expect.arrayContaining([
      'value.maxSampleSize: is smaller than one cohort',
      'value.startingDoseIndex: does not name a recorded dose level',
      'value.stopWhenAtDoseN: is smaller than one cohort: no cohort completes at a dose',
    ]));
    expect(parse('doseEscalation', { ...BOIN, stopWhenAtDoseN: 3 }).ok).toBe(true);
  });

  it('refuses a dose label listed twice, so the starting dose names exactly one level', () => {
    expect(issuesOf('doseEscalation', { ...BOIN, doseLevels: [{ label: 'DL1', dose: '10 mg' }, { label: 'DL1', dose: '20 mg' }], startingDoseIndex: 1 }))
      .toEqual(['value.doseLevels.1.label: dose level DL1 is listed twice']);
  });

  it('refuses a BOIN neighbourhood the engine cannot compute, on the φ the author supplied, else on the target', () => {
    expect(issuesOf('doseEscalation', { ...BOIN, phi1: 0.35 })).toEqual([expect.stringMatching(/^value\.phi1: the BOIN boundaries cannot be computed/)]);
    expect(issuesOf('doseEscalation', { ...BOIN, phi2: 0.25 })).toEqual([expect.stringMatching(/^value\.phi2: the BOIN boundaries cannot be computed/)]);
    // 0.8 with the engine's default neighbourhood puts φ2 at or above 1.
    expect(issuesOf('doseEscalation', { ...BOIN, targetToxicity: 0.8 })).toEqual([expect.stringMatching(/^value\.targetToxicity: the BOIN boundaries cannot be computed/)]);
    expect(parse('doseEscalation', { ...BOIN, phi1: 0.2, phi2: 0.4 }).ok).toBe(true);
  });

  it('refuses an MMRM retention that rises or does not match the visit count, a target visit outside them, and more visits than the bound', () => {
    expect(issuesOf('mmrmAssumptions', { ...MMRM, visits: 3, retention: [0.9, 0.95] }))
      .toEqual(['value.retention: has 2 values for 3 visits', 'value.retention: must never increase from one visit to the next']);
    expect(issuesOf('mmrmAssumptions', { ...MMRM, targetVisit: 3 })).toEqual(['value.targetVisit: is not one of the modelled visits']);
    const n = MMRM_MAX_VISITS + 1;
    expect(issuesOf('mmrmAssumptions', { ...MMRM, visits: n, retention: Array(n).fill(0.9) }).join(' | ')).toMatch(/^value\.visits: Number must be less than or equal to 100/);
    expect(parse('mmrmAssumptions', { ...MMRM, visits: MMRM_MAX_VISITS, retention: Array(MMRM_MAX_VISITS).fill(0.9) }).ok).toBe(true);
  });

  it('refuses a method\'s missing discount and the other method\'s unused one, and duplicate accrual sites', () => {
    const ec = { ...EXTERNAL, method: 'power_prior', tau2: undefined };
    expect(issuesOf('externalControlPlan', ec)).toEqual(['value.a0: is required for a power prior']);
    expect(issuesOf('externalControlPlan', { ...EXTERNAL, tau2: undefined })).toEqual(['value.tau2: is required for a commensurate prior']);
    expect(issuesOf('externalControlPlan', { ...EXTERNAL, a0: 0.5 })).toEqual(['value.a0: applies only to a power prior; a commensurate plan does not use it']);
    expect(issuesOf('externalControlPlan', { ...ec, a0: 0.5, tau2: 1 })).toEqual(['value.tau2: applies only to a commensurate prior; a power-prior plan does not use it']);
    expect(issuesOf('accrualPlan', { timeUnit: 'month', sites: [{ id: 'A', meanRate: 1 }, { id: 'A', meanRate: 2 }] })).toEqual(['value.sites.1.id: site A is listed twice']);
  });

  it('refuses an unknown key in the master protocol, in a sub-study and in a specimen', () => {
    expect(issuesOf('masterProtocol', { ...MASTER, owner: 'x' })).toEqual(["value: Unrecognized key(s) in object: 'owner'"]);
    expect(issuesOf('masterProtocol', { subStudies: [{ ...MASTER.subStudies[0], cohort: 1 }] })).toEqual(["value.subStudies.0: Unrecognized key(s) in object: 'cohort'"]);
    expect(issuesOf('activityAttributes', { activityId: 'pk', specimen: { type: 'blood', tube: 'EDTA' } })).toEqual(["value.specimen: Unrecognized key(s) in object: 'tube'"]);
    expect(issuesOf('masterProtocol', { subStudies: [MASTER.subStudies[0], MASTER.subStudies[0]] })).toEqual(['value.subStudies.1.id: sub-study S1 is listed twice']);
  });

  it('refuses list text the recording form could not show back: "|" or a line break in an entry, ";" in an arm', () => {
    expect(issuesOf('doseEscalation', { ...BOIN, doseLevels: [{ label: 'DL1', dose: '10 mg/m2 | QD' }, { label: 'DL2' }] }))
      .toEqual([expect.stringMatching(/^value\.doseLevels\.0\.dose: must not contain "\|" or a line break/)]);
    expect(issuesOf('accrualPlan', { timeUnit: 'month', sites: [{ id: 'US|01', meanRate: 1 }] })).toEqual([expect.stringMatching(/^value\.sites\.0\.id: must not contain/)]);
    const sub = MASTER.subStudies[0];
    expect(issuesOf('masterProtocol', { subStudies: [{ ...sub, decisionRule: 'PFS HR < 0.7 | OS HR < 0.8' }] })).toEqual([expect.stringMatching(/^value\.subStudies\.0\.decisionRule: must not contain/)]);
    expect(issuesOf('masterProtocol', { subStudies: [{ ...sub, population: 'KRAS\nG12C' }] })).toEqual([expect.stringMatching(/^value\.subStudies\.0\.population: must not contain/)]);
    expect(issuesOf('masterProtocol', { subStudies: [{ ...sub, arms: ['Drug A; high dose'] }] })).toEqual([expect.stringMatching(/^value\.subStudies\.0\.arms\.0: must not contain "\|", ";"/)]);
    // A comma is ordinary text in an arm name.
    expect(parse('masterProtocol', MASTER).ok).toBe(true);
  });

  it('refuses an unknown block under `block`, and an activity attribute that names neither field', () => {
    expect(issuesOf('budget', {})).toEqual([expect.stringMatching(/^block: Invalid discriminator value/)]);
    expect(parsePlanningInput({})).toEqual({ ok: false, issues: [expect.stringMatching(/^block: /)] });
    expect(parse('activityAttributes', { activityId: 'pk' }).ok).toBe(false);
  });

  it('accepts null to clear a block', () => {
    expect(parse('accrualPlan', null)).toEqual({ ok: true, input: { block: 'accrualPlan', value: null } });
  });
});

describe('applyPlanningInput — one block, nothing else, and its engine reads it', () => {
  it('sets dose escalation under safety, keeps the DLT definition, and the engine reads it', () => {
    const next = applyPlanningInput(design(), input('doseEscalation', BOIN));
    expect(next.safety?.dltDefinition).toBe('Grade 3+ in cycle 1');
    expect(projectDoseEscalation(next).status).toBe('rendered');
    expect({ ...next, safety: design().safety }).toEqual(design());
  });

  it('null clears the block and removes the key', () => {
    const withBlock = applyPlanningInput(design(), input('doseEscalation', BOIN));
    const cleared = applyPlanningInput(withBlock, { block: 'doseEscalation', value: null });
    expect(cleared.safety).not.toHaveProperty('doseEscalation');
    expect(projectDoseEscalation(cleared).status).toBe('missing');
  });

  it('the accrual plan is what the enrollment forecast reads; null clears it', () => {
    const plan = { timeUnit: 'month', sites: [{ id: 'US-01', meanRate: 2, rateCv: 0.5, activationTime: 0 }, { id: 'DE-01', country: 'DE', meanRate: 1, rateCv: 0.5, activationTime: 2 }], seed: 7 };
    const next = applyPlanningInput(platform(), input('accrualPlan', plan));
    expect({ ...next, accrualPlan: undefined }).toEqual({ ...platform(), accrualPlan: undefined });
    expect(projectEnrollment(next).sites?.total).toBe(2);
    expect(projectEnrollment(applyPlanningInput(next, { block: 'accrualPlan', value: null })).status).toBe('missing');
  });

  it('MMRM assumptions sit under the statistical plan, where the sizing engine reads them; null clears them', () => {
    const next = applyPlanningInput(platform(), input('mmrmAssumptions', MMRM));
    expect(next.statisticalPlan.plannedAnalyses).toEqual(platform().statisticalPlan.plannedAnalyses);
    const sized = projectMmrmSizing(next);
    expect(sized.endpointName).toBe('HbA1c');
    expect(sized.sizing?.targetVisit).toBe(2);
    expect(sized.sizing?.allocationSource).toBe('mmrm_assumptions');
    const cleared = applyPlanningInput(next, { block: 'mmrmAssumptions', value: null });
    expect(cleared.statisticalPlan).not.toHaveProperty('mmrmAssumptions');
    expect(projectMmrmSizing(cleared).sizing).toBeNull();
  });

  it('the external-control plan is what the borrowing engine reads; null clears it', () => {
    const next = applyPlanningInput(platform(), input('externalControlPlan', EXTERNAL));
    expect(projectExternalControlPlan(next).borrowing).toMatchObject({ method: 'commensurate', parameter: { name: 'tau2', value: 0.5 } });
    const cleared = applyPlanningInput(next, { block: 'externalControlPlan', value: null });
    expect(cleared).not.toHaveProperty('externalControlPlan');
    expect(projectExternalControlPlan(cleared).status).toBe('missing');
  });

  it('the master protocol is what the structural check reads; null clears it', () => {
    const next = applyPlanningInput(platform(), input('masterProtocol', MASTER));
    const check = checkMasterProtocol(next);
    expect(check.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'sub-study KRAS', element: 'Arms', stated: true, detail: 'Drug A, 10 mg, Placebo' }),
      expect.objectContaining({ element: 'Shared control arm', stated: true }),
    ]));
    // Arms that exist in the design, including one with a comma, raise no integrity defect.
    expect(check.integrity.filter((s) => /does not carry/.test(s))).toEqual([]);
    const cleared = applyPlanningInput(next, { block: 'masterProtocol', value: null });
    expect(cleared).not.toHaveProperty('masterProtocol');
    expect(checkMasterProtocol(cleared).elements).toEqual([]);
  });

  it('sets and clears one activity\'s location and specimen, and no other activity', () => {
    const next = applyPlanningInput(design(), input('activityAttributes', { activityId: 'pk', location: 'home', specimen: { type: 'blood', volumeMl: 4 } }));
    expect(next.scheduleOfActivities!.activities[0]).toMatchObject({ location: 'home', specimen: { type: 'blood', volumeMl: 4 } });
    expect(next.scheduleOfActivities!.activities[1]).toEqual(design().scheduleOfActivities!.activities[1]);
    expect(profileDecentralization(next.scheduleOfActivities).activities.find((a) => a.activityId === 'pk')!.location).toBe('home');
    const cleared = applyPlanningInput(next, input('activityAttributes', { activityId: 'pk', location: null }));
    expect(cleared.scheduleOfActivities!.activities[0]).not.toHaveProperty('location');
    expect(cleared.scheduleOfActivities!.activities[0].specimen).toEqual({ type: 'blood', volumeMl: 4 });
  });

  it('refuses an unknown activity and a design with no schedule', () => {
    const i = input('activityAttributes', { activityId: 'nope', location: 'site' });
    expect(() => applyPlanningInput(design(), i)).toThrow(PlanningInputError);
    const d = design();
    delete d.scheduleOfActivities;
    expect(() => applyPlanningInput(d, i)).toThrow(/no Schedule of Activities/);
  });

  it('does not mutate the design it is given', () => {
    const d = design();
    const before = JSON.stringify(d);
    applyPlanningInput(d, input('activityAttributes', { activityId: 'pk', location: 'home' }));
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe('recordedBlock — what a writer\'s precondition is compared with', () => {
  it('is the block where the design carries it, or null; for an activity, its location and specimen', () => {
    const d = applyPlanningInput(platform(), input('mmrmAssumptions', MMRM));
    expect(recordedBlock(d, input('mmrmAssumptions', null))).toEqual(MMRM);
    expect(recordedBlock(d, input('accrualPlan', null))).toBeNull();
    expect(recordedBlock(design(), input('doseEscalation', null))).toBeNull();
    const withPk = applyPlanningInput(design(), input('activityAttributes', { activityId: 'pk', location: 'home' }));
    expect(recordedBlock(withPk, input('activityAttributes', { activityId: 'pk', location: null }))).toEqual({ location: 'home', specimen: null });
  });

  it('compares by content, not key order, and a changed value is not the same', () => {
    expect(sameRecorded({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 })).toBe(true);
    expect(sameRecorded(MMRM, { ...MMRM, rho: 0.6 })).toBe(false);
    expect(sameRecorded(null, MMRM)).toBe(false);
    expect(sameRecorded(null, null)).toBe(true);
  });
});
