/**
 * Tests for the arm and endpoint items of the WHO ICTRP projection (TRDS v1.3.1 items 13,
 * 19 and 20). Item 13 is rendered only when every intervention is named and carries the
 * TRDS drug detail (dosage, frequency, duration) its role calls for; an unnamed arm is named
 * by position. Items 19/20 show a timepoint only when the endpoint states one: Schedule of
 * Activities collection visits are shown as "collected at", keep the item partial, and a
 * visit id that resolves to no visit is never shown. Item 20 carries key secondary and
 * secondary outcomes, labelled by role.
 */

import { describe, it, expect } from 'vitest';
import {
  interventions,
  primaryOutcomes,
  secondaryOutcomes,
  trdsRequiredInterventionDetail,
  WHO_ICTRP_ARMS_OUTCOMES_BASIS,
} from '../who-ictrp-arms-outcomes';
import { type ScheduleOfActivities, type StudyDesign } from '../study-design-types';

/** Only what items 13, 19 and 20 read, fully specified. */
function design(): StudyDesign {
  return {
    title: 'T',
    phase: '3',
    indication: 'Type 2 diabetes mellitus',
    objectives: [],
    estimands: [],
    endpoints: [
      { name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'change from baseline in HbA1c', measurementMethod: 'central laboratory', timepoint: 'week 24' },
      { name: 'Body weight change', role: 'key_secondary', type: 'continuous', definition: 'change from baseline in body weight', timepoint: 'week 24' },
      { name: 'FPG change', role: 'secondary', type: 'continuous', definition: 'change in fasting plasma glucose', timepoint: 'week 24' },
      { name: 'Hypoglycaemia', role: 'safety', type: 'count', definition: 'confirmed hypoglycaemic events', timepoint: 'week 26' },
    ],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: { targetDescription: '', analysisPopulations: [], eligibility: [] },
    arms: [
      { name: 'Drug X', interventions: [{ name: 'Drug X', role: 'investigational', dose: '10 mg', route: 'oral', regimen: 'once daily', duration: '24 weeks' }] },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo', route: 'oral', regimen: 'once daily', duration: '24 weeks' }] },
    ],
    statisticalPlan: { plannedAnalyses: [] },
  };
}

/** HbA1c collected at screening, baseline, an optional week 24, a conditional early termination, and a visit id that does not exist. */
function soaWithScreeningBaselineAndDangling(): ScheduleOfActivities {
  return {
    epochs: [
      { id: 'e0', name: 'Screening', kind: 'screening', order: 0 },
      { id: 'e1', name: 'Treatment', kind: 'treatment', order: 1 },
    ],
    visits: [
      { id: 'V1', name: 'Screening', epochId: 'e0', studyDay: -14, order: 1 },
      { id: 'V2', name: 'Baseline', epochId: 'e1', studyDay: 1, isBaseline: true, order: 2 },
      { id: 'V9', name: 'Week 24', epochId: 'e1', studyDay: 168, order: 3 },
      { id: 'VET', name: 'Early termination', epochId: 'e1', unscheduled: true, order: 4 },
    ],
    activities: [{ id: 'a1', name: 'HbA1c', category: 'efficacy', endpointNames: ['HbA1c change'], order: 0 }],
    cells: [
      { activityId: 'a1', visitId: 'V1', state: 'performed' },
      { activityId: 'a1', visitId: 'V77-dangling', state: 'performed' },
      { activityId: 'a1', visitId: 'V2', state: 'performed' },
      { activityId: 'a1', visitId: 'V9', state: 'optional' },
      { activityId: 'a1', visitId: 'VET', state: 'conditional' },
    ],
  };
}

describe('item 13 — interventions', () => {
  it('cites TRDS v1.3.1 items 13, 19 and 20', () => {
    expect(WHO_ICTRP_ARMS_OUTCOMES_BASIS).toMatch(/TRDS\) v1\.3\.1 — item 13 Intervention\(s\), item 19 Primary Outcome\(s\), item 20 Key Secondary Outcomes/);
  });

  it('a fully specified design renders every arm with no gap', () => {
    expect(interventions(design())).toEqual({
      status: 'rendered',
      value: [
        'Drug X: Drug X 10 mg oral once daily; duration 24 weeks (investigational)',
        'Placebo: Placebo oral once daily; duration 24 weeks (placebo)',
      ],
      source: 'StudyDesign.arms[].interventions',
    });
  });

  it('asks every role for frequency and duration, and every role but placebo and device for a dosage', () => {
    for (const role of ['investigational', 'comparator', 'standard_of_care'] as const) {
      expect(trdsRequiredInterventionDetail(role)).toEqual(['dose', 'regimen', 'duration']);
    }
    expect(trdsRequiredInterventionDetail('placebo')).toEqual(['regimen', 'duration']);
    expect(trdsRequiredInterventionDetail('device')).toEqual(['regimen', 'duration']);
  });

  it('a name-only investigational intervention is partial, naming each missing detail', () => {
    const d = design();
    d.arms = [{ name: 'A', interventions: [{ name: 'Drug X', role: 'investigational' }] }];
    const r = interventions(d);
    expect(r.status).toBe('partial');
    expect(r.value).toEqual(['A: Drug X (investigational)']);
    expect(r.gap).toBe(
      'TRDS item 13 asks for a description detailed enough to tell the arms apart (for drugs, e.g. dosage, frequency and duration): ' +
        '"Drug X" in arm "A" lacks dosage (dose), frequency (regimen), duration.',
    );
  });

  it('asks a placebo and a device for frequency and duration but no dosage', () => {
    const d = design();
    d.arms = [
      { name: 'P', interventions: [{ name: 'Placebo', role: 'placebo', regimen: 'once daily' }] },
      { name: 'D', interventions: [{ name: 'Sensor', role: 'device', regimen: 'worn continuously', duration: '12 weeks' }] },
    ];
    const r = interventions(d);
    expect(r.status).toBe('partial');
    expect(r.gap).toMatch(/"Placebo" in arm "P" lacks duration\.$/);
    expect(r.gap).not.toMatch(/Sensor|dosage \(dose\)/);
  });

  it('is partial when an arm has no intervention, and missing with no arms or no interventions at all', () => {
    const d = design();
    d.arms.push({ name: 'Observation', interventions: [] });
    const r = interventions(d);
    expect(r.status).toBe('partial');
    expect((r.value as string[])[2]).toBe('Observation: (no intervention recorded)');
    expect(r.gap).toBe('No intervention is recorded for arm(s): Observation.');

    d.arms = [{ name: 'Observation', interventions: [] }];
    expect(interventions(d)).toEqual({ status: 'missing', value: null, gap: 'No arm in StudyDesign.arms records an intervention.' });
    d.arms = [];
    expect(interventions(d)).toEqual({ status: 'missing', value: null, gap: 'StudyDesign.arms records no arm, so no intervention is recorded.' });
  });

  it('refers to an unnamed arm or intervention by position and names the absent name, never ": …"', () => {
    const d = design();
    d.arms = [
      { name: '', interventions: [] },
      { name: ' ', interventions: [{ name: '', role: 'investigational', dose: '10 mg', regimen: 'once daily', duration: '24 weeks' }] },
    ];
    const r = interventions(d);
    expect(r.value).toEqual(['arm 1 (unnamed): (no intervention recorded)', 'arm 2 (unnamed): (unnamed intervention) 10 mg once daily; duration 24 weeks (investigational)']);
    expect(r.gap).toContain('No name is recorded for arm 1 (unnamed), arm 2 (unnamed).');
    expect(r.gap).toContain('No intervention is recorded for arm(s): arm 1 (unnamed).');
    expect(r.gap).toContain('intervention 1 in arm 2 (unnamed) lacks name.');
    expect((r.value as string[]).some(v => v.startsWith(':'))).toBe(false);
  });
});

describe('items 19 and 20 — outcomes', () => {
  it('item 19 renders name, metric, method and stated timepoint', () => {
    expect(primaryOutcomes(design())).toMatchObject({
      status: 'rendered',
      value: ['HbA1c change: change from baseline in HbA1c; method: central laboratory; timepoint: week 24'],
    });
  });

  it('item 20 renders key secondary then secondary endpoints, labelled by role, and no safety endpoint', () => {
    const r = secondaryOutcomes(design());
    expect(r).toMatchObject({
      status: 'rendered',
      value: [
        '[key secondary] Body weight change: change from baseline in body weight; timepoint: week 24',
        '[secondary] FPG change: change in fasting plasma glucose; timepoint: week 24',
      ],
    });
    expect(JSON.stringify(r)).not.toMatch(/Hypoglycaemia|HbA1c/);
  });

  it('with no key secondary, the secondary endpoints are rendered as partial and stated to be unranked', () => {
    const d = design();
    d.endpoints = d.endpoints.filter(e => e.role !== 'key_secondary');
    const r = secondaryOutcomes(d);
    expect(r).toMatchObject({ status: 'partial', value: ['[secondary] FPG change: change in fasting plasma glucose; timepoint: week 24'] });
    expect(r.gap).toBe('No endpoint has role "key_secondary"; the 1 endpoint(s) with role "secondary" are rendered as the trial\'s secondary outcomes, unranked.');

    d.endpoints = d.endpoints.filter(e => e.role !== 'secondary');
    expect(secondaryOutcomes(d)).toEqual({ status: 'missing', value: null, gap: 'No endpoint has role "key_secondary" or "secondary".' });
  });

  it('an outcome with no metric or method of measurement is partial and named', () => {
    const d = design();
    d.endpoints[0] = { name: 'HbA1c change', role: 'primary', type: 'continuous', definition: '', timepoint: 'week 24' };
    const r = primaryOutcomes(d);
    expect(r).toMatchObject({ status: 'partial', value: ['HbA1c change; timepoint: week 24'] });
    expect(r.gap).toBe('Metric or method of measurement is not recorded for: HbA1c change.');
  });

  it('an endpoint with neither name nor definition is not rendered as an empty outcome; an unnamed one is named by position', () => {
    const d = design();
    d.endpoints[0] = { name: '', role: 'primary', type: 'continuous', definition: '' };
    const blank = primaryOutcomes(d);
    expect(blank).toMatchObject({ status: 'missing', value: null });
    expect(blank.gap).toContain('Not rendered, as neither a name nor a definition is recorded: StudyDesign.endpoints[0] (unnamed).');

    d.endpoints[0] = { name: ' ', role: 'primary', type: 'continuous', definition: 'change in HbA1c', timepoint: 'week 24' };
    const unnamed = primaryOutcomes(d);
    expect(unnamed).toMatchObject({ status: 'partial', value: ['StudyDesign.endpoints[0] (unnamed): change in HbA1c; timepoint: week 24'] });
    expect(unnamed.gap).toBe('Outcome name is not recorded for: StudyDesign.endpoints[0] (unnamed).');
  });

  it('an outcome with no timepoint is partial, and stays partial when only the Schedule of Activities places it', () => {
    const d = design();
    delete d.endpoints[0].timepoint;
    const untimed = primaryOutcomes(d);
    expect(untimed.status).toBe('partial');
    expect(untimed.gap).toBe('Timepoint is not recorded for: HbA1c change.');

    d.scheduleOfActivities = {
      epochs: [{ id: 'e1', name: 'Treatment', kind: 'treatment', order: 0 }],
      visits: [{ id: 'V9', name: 'Week 24', epochId: 'e1', studyDay: 168, order: 0 }],
      activities: [{ id: 'a1', name: 'HbA1c', category: 'efficacy', endpointNames: ['HbA1c change'], order: 0 }],
      cells: [{ activityId: 'a1', visitId: 'V9', state: 'performed' }],
    };
    const collected = primaryOutcomes(d);
    expect(collected.status).toBe('partial');
    expect((collected.value as string[])[0]).toMatch(/; collected at \(Schedule of Activities\): Week 24 \(day 168\)$/);
    expect((collected.value as string[])[0]).not.toMatch(/timepoint:/);
    expect(collected.gap).toMatch(/^No timepoint is stated on the endpoint for: HbA1c change; the Schedule of Activities visits that collect it are shown instead/);
  });

  it('never presents screening, baseline or an unresolved visit id as a timepoint, and names the dangling visit', () => {
    const d = design();
    delete d.endpoints[0].timepoint;
    d.scheduleOfActivities = soaWithScreeningBaselineAndDangling();
    const r = primaryOutcomes(d);
    expect(r.status).toBe('partial');
    expect(r.value).toEqual([
      'HbA1c change: change from baseline in HbA1c; method: central laboratory; collected at (Schedule of Activities): ' +
        'Screening (day -14), Baseline (day 1), Week 24 (day 168) [optional], Early termination [unscheduled, conditional]',
    ]);
    expect(JSON.stringify(r.value)).not.toContain('V77-dangling');
    expect(JSON.stringify(r.value)).not.toContain('timepoint:');
    expect(r.gap).toContain('No timepoint is stated on the endpoint for: HbA1c change');
    expect(r.gap).toContain('The Schedule of Activities schedules HbA1c change at visit id(s) "V77-dangling" that resolve to no visit; they are not rendered.');
  });

  it('a timepoint stated on the endpoint wins over the Schedule of Activities', () => {
    const d = design();
    d.scheduleOfActivities = soaWithScreeningBaselineAndDangling();
    expect(primaryOutcomes(d)).toMatchObject({ status: 'rendered', value: ['HbA1c change: change from baseline in HbA1c; method: central laboratory; timepoint: week 24'] });
  });

  it('is deterministic and does not mutate the design on the Schedule of Activities path', () => {
    const d = design();
    delete d.endpoints[0].timepoint;
    d.scheduleOfActivities = soaWithScreeningBaselineAndDangling();
    const before = JSON.parse(JSON.stringify(d));
    expect(primaryOutcomes(d)).toEqual(primaryOutcomes(JSON.parse(JSON.stringify(d))));
    expect(d).toEqual(before);
  });
});
