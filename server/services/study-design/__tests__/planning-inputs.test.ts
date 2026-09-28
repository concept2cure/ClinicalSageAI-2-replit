/**
 * Planning inputs — validation and application.
 *
 * What the suite holds: each block is validated strictly against what its
 * engine accepts (an unknown key, an out-of-range value or an inconsistent
 * combination is refused with its path); `null` clears a block and nothing
 * else changes; an activity attribute is set or cleared on exactly one
 * activity; an unknown activity or a design with no SoA is refused; and what
 * is applied is what each engine then reads.
 */
import { describe, expect, it } from 'vitest';

import type { StudyDesign } from '../study-design-types';
import { PlanningInputError, applyPlanningInput, parsePlanningInput } from '../planning-inputs';
import { projectDoseEscalation } from '../dose-escalation';
import { profileDecentralization } from '../dct-profile';

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

const BOIN = {
  method: 'boin', targetToxicity: 0.3, doseLevels: [{ label: 'DL1', dose: '10 mg' }, { label: 'DL2' }], cohortSize: 3, maxSampleSize: 30, startingDoseIndex: 0,
};

const parse = (block: string, value: unknown) => parsePlanningInput({ block, value });

describe('parsePlanningInput — strict validation', () => {
  it('accepts a complete dose-escalation block', () => {
    expect(parse('doseEscalation', BOIN).ok).toBe(true);
  });

  it('refuses an unknown key, an out-of-range target and an inconsistent start, each with its path', () => {
    const r = parse('doseEscalation', { ...BOIN, targetToxicity: 1.2, startingDoseIndex: 5, colour: 'red' });
    expect(r.ok).toBe(false);
    const issues = (r as { issues: string[] }).issues.join(' | ');
    expect(issues).toMatch(/value\.targetToxicity/);
    expect(issues).toMatch(/Unrecognized key\(s\) in object: 'colour'/);
  });

  it('refuses an unknown key inside a nested entry, with the entry\'s path', () => {
    const r = parse('doseEscalation', { ...BOIN, doseLevels: [{ label: 'DL1', mg: 10 }, { label: 'DL2' }] });
    expect(r.ok).toBe(false);
    expect((r as { issues: string[] }).issues.join(' | ')).toMatch(/value\.doseLevels\.0: Unrecognized key\(s\) in object: 'mg'/);
  });

  it('refuses a start dose beyond the recorded levels and a max N smaller than a cohort', () => {
    const r = parse('doseEscalation', { ...BOIN, startingDoseIndex: 2, maxSampleSize: 2 });
    const issues = (r as { issues: string[] }).issues;
    expect(issues).toEqual(expect.arrayContaining(['value.maxSampleSize: is smaller than one cohort', 'value.startingDoseIndex: does not name a recorded dose level']));
  });

  it('refuses an MMRM retention that rises or does not match the visit count', () => {
    const r = parse('mmrmAssumptions', { endpointName: 'X', visits: 3, covariance: 'ar1', rho: 0.5, sigma: 1, delta: 0.3, retention: [0.9, 0.95] });
    expect((r as { issues: string[] }).issues).toEqual(['value.retention: has 2 values for 3 visits', 'value.retention: must never increase from one visit to the next']);
  });

  it('refuses a power-prior plan with no a0, and duplicate accrual sites', () => {
    const ec = parse('externalControlPlan', { source: 'registry', endpointName: 'X', historical: { n: 50, mean: 1, se: 0.2 }, method: 'power_prior', plannedConcurrentControlN: 20 });
    expect((ec as { issues: string[] }).issues).toEqual(['value.a0: is required for a power prior']);
    const ap = parse('accrualPlan', { timeUnit: 'month', sites: [{ id: 'A', meanRate: 1 }, { id: 'A', meanRate: 2 }] });
    expect((ap as { issues: string[] }).issues).toEqual(['value.sites.1.id: site A is listed twice']);
  });

  it('refuses an unknown block and an activity attribute that names neither field', () => {
    expect(parse('budget', {}).ok).toBe(false);
    expect(parse('activityAttributes', { activityId: 'pk' }).ok).toBe(false);
  });

  it('accepts null to clear a block', () => {
    expect(parse('accrualPlan', null)).toEqual({ ok: true, input: { block: 'accrualPlan', value: null } });
  });
});

describe('applyPlanningInput — one block, nothing else', () => {
  it('sets dose escalation under safety, keeps the DLT definition, and the engine reads it', () => {
    const r = parse('doseEscalation', BOIN);
    if (!r.ok) throw new Error('fixture');
    const next = applyPlanningInput(design(), r.input);
    expect(next.safety?.dltDefinition).toBe('Grade 3+ in cycle 1');
    expect(projectDoseEscalation(next).status).toBe('rendered');
    expect({ ...next, safety: design().safety }).toEqual(design());
  });

  it('null clears the block and removes the key', () => {
    const r = parse('doseEscalation', BOIN);
    if (!r.ok) throw new Error('fixture');
    const withBlock = applyPlanningInput(design(), r.input);
    const cleared = applyPlanningInput(withBlock, { block: 'doseEscalation', value: null });
    expect(cleared.safety).not.toHaveProperty('doseEscalation');
    expect(projectDoseEscalation(cleared).status).toBe('missing');
  });

  it('sets and clears one activity\'s location and specimen, and no other activity', () => {
    const set = parse('activityAttributes', { activityId: 'pk', location: 'home', specimen: { type: 'blood', volumeMl: 4 } });
    if (!set.ok) throw new Error('fixture');
    const next = applyPlanningInput(design(), set.input);
    expect(next.scheduleOfActivities!.activities[0]).toMatchObject({ location: 'home', specimen: { type: 'blood', volumeMl: 4 } });
    expect(next.scheduleOfActivities!.activities[1]).toEqual(design().scheduleOfActivities!.activities[1]);
    expect(profileDecentralization(next.scheduleOfActivities).activities.find((a) => a.activityId === 'pk')!.location).toBe('home');
    const clear = parse('activityAttributes', { activityId: 'pk', location: null });
    if (!clear.ok) throw new Error('fixture');
    const cleared = applyPlanningInput(next, clear.input);
    expect(cleared.scheduleOfActivities!.activities[0]).not.toHaveProperty('location');
    expect(cleared.scheduleOfActivities!.activities[0].specimen).toEqual({ type: 'blood', volumeMl: 4 });
  });

  it('refuses an unknown activity and a design with no schedule', () => {
    const r = parse('activityAttributes', { activityId: 'nope', location: 'site' });
    if (!r.ok) throw new Error('fixture');
    expect(() => applyPlanningInput(design(), r.input)).toThrow(PlanningInputError);
    const d = design();
    delete d.scheduleOfActivities;
    expect(() => applyPlanningInput(d, r.input)).toThrow(/no Schedule of Activities/);
  });

  it('does not mutate the design it is given', () => {
    const d = design();
    const before = JSON.stringify(d);
    const r = parse('activityAttributes', { activityId: 'pk', location: 'home' });
    if (!r.ok) throw new Error('fixture');
    applyPlanningInput(d, r.input);
    expect(JSON.stringify(d)).toBe(before);
  });
});
