/**
 * Tests for the ICH M11 §1.2 Trial Schema projection. The schema is a deterministic
 * figure of the design object: every epoch and arm the design carries is drawn, nothing
 * the design lacks is invented (no epochs, days, windows or interventions), the
 * randomisation marker sits after the last pre-treatment epoch, and the SVG is
 * byte-identical across calls, self-contained and accessible.
 */

import { describe, it, expect } from 'vitest';
import {
  projectTrialSchema,
  describeIntervention,
  NO_INTERVENTION_LABEL,
  NO_SOA_GAP,
  TRIAL_SCHEMA_BASIS,
} from '../trial-schema';
import { type StudyDesign, type ScheduleOfActivities } from '../study-design-types';

/** Screening → run-in → treatment → follow-up, every visit dated, baseline marked. */
function schemaSoa(): ScheduleOfActivities {
  return {
    epochs: [
      { id: 'e_fu', name: 'Follow-up', kind: 'follow_up', order: 3 },
      { id: 'e_trt', name: 'Treatment', kind: 'treatment', order: 2 },
      { id: 'e_scr', name: 'Screening', kind: 'screening', order: 0 },
      { id: 'e_runin', name: 'Placebo run-in', kind: 'run_in', order: 1 },
    ],
    visits: [
      { id: 'V1', name: 'Screening', epochId: 'e_scr', studyDay: -28, order: 0 },
      { id: 'V2', name: 'Run-in start', epochId: 'e_runin', studyDay: -14, windowDays: 2, order: 1 },
      { id: 'V3', name: 'Baseline', epochId: 'e_trt', studyDay: 1, isBaseline: true, order: 2 },
      { id: 'V4', name: 'Week 12', epochId: 'e_trt', studyDay: 84, windowDays: 3, order: 3 },
      { id: 'V5', name: 'Week 24', epochId: 'e_trt', studyDay: 168, windowDays: 3, order: 4 },
      { id: 'V6', name: 'Safety follow-up', epochId: 'e_fu', studyDay: 196, windowDays: 7, order: 5 },
    ],
    activities: [
      { id: 'a_hba1c', name: 'HbA1c', category: 'efficacy', endpointNames: ['HbA1c change'], order: 0 },
    ],
    cells: [
      { activityId: 'a_hba1c', visitId: 'V3', state: 'performed' },
      { activityId: 'a_hba1c', visitId: 'V5', state: 'performed' },
    ],
  };
}

function schemaDesign(): StudyDesign {
  return {
    title: 'A phase 3 study of Drug X in type 2 diabetes',
    phase: '3',
    indication: 'type 2 diabetes',
    productType: 'drug',
    objectives: [{ level: 'primary', order: 1, text: 'Demonstrate superiority on HbA1c', endpointName: 'HbA1c change' }],
    estimands: [],
    endpoints: [{ name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'change from baseline in HbA1c at week 24' }],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: { targetDescription: 'adults with type 2 diabetes', analysisPopulations: [], eligibility: [] },
    arms: [
      { name: 'Drug X', interventions: [{ name: 'Drug X', role: 'investigational', dose: '10 mg', route: 'oral', regimen: 'once daily' }] },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo', route: 'oral', regimen: 'once daily' }] },
    ],
    randomization: { ratio: [1, 1], allocationMethod: 'stratified', blinding: 'double', stratificationFactors: ['region'] },
    scheduleOfActivities: schemaSoa(),
    statisticalPlan: { plannedAnalyses: [] },
  };
}

function clone(d: StudyDesign): StudyDesign {
  return JSON.parse(JSON.stringify(d));
}

/** Pull `x`/`width` (or `cx`) off the first SVG element carrying the given data attribute. */
function geometry(svg: string, attr: string, value: string): { x: number; w: number } {
  const re = new RegExp(`<[a-z]+ [^>]*${attr}="${value}"[^>]*>`);
  const el = svg.match(re)?.[0];
  if (!el) throw new Error(`no element with ${attr}="${value}" in svg`);
  const num = (name: string) => {
    const m = el.match(new RegExp(` ${name}="(-?[0-9.]+)"`));
    return m ? Number(m[1]) : NaN;
  };
  const cx = num('cx');
  return Number.isNaN(cx) ? { x: num('x'), w: num('width') } : { x: cx, w: 0 };
}

describe('projectTrialSchema: a full design', () => {
  it('cites the M11 §1.2 basis', () => {
    expect(TRIAL_SCHEMA_BASIS).toMatch(/ICH M11/);
    expect(TRIAL_SCHEMA_BASIS).toMatch(/§1\.2 Trial Schema/);
    expect(projectTrialSchema(schemaDesign()).basis).toBe(TRIAL_SCHEMA_BASIS);
  });

  it('renders every epoch (in order) and every arm of a full design, with no gaps', () => {
    const out = projectTrialSchema(schemaDesign());
    expect(out.status).toBe('rendered');
    expect(out.gaps).toEqual([]);
    expect(out.model.epochs.map(e => e.id)).toEqual(['e_scr', 'e_runin', 'e_trt', 'e_fu']);
    expect(out.model.epochs.map(e => e.kind)).toEqual(['screening', 'run_in', 'treatment', 'follow_up']);
    expect(out.model.epochs.map(e => e.milestones.map(m => m.name))).toEqual([
      ['Screening'], ['Run-in start'], ['Baseline', 'Week 12', 'Week 24'], ['Safety follow-up'],
    ]);
    expect(out.model.arms.map(a => a.name)).toEqual(['Drug X', 'Placebo']);
    expect(out.model.arms[0].label).toBe('Drug X: Drug X 10 mg oral once daily');
    expect(out.model.followUp).toEqual({
      epochIds: ['e_fu'],
      name: 'Follow-up',
      milestones: [{ name: 'Safety follow-up', studyDay: 196, windowDays: 7, isBaseline: false }],
    });
    const svg = out.svg!;
    for (const id of ['e_scr', 'e_runin', 'e_trt', 'e_fu']) expect(svg).toContain(`data-epoch="${id}"`);
    for (const name of ['Screening', 'Placebo run-in', 'Treatment', 'Follow-up']) expect(svg).toContain(`>${name}</text>`);
    expect(svg).toContain('data-arm="Drug X"');
    expect(svg).toContain('data-arm="Placebo"');
    expect(svg).toContain('data-role="follow-up"');
    expect(svg).toContain('Day 84 ±3');
    expect(svg).toContain('data-baseline="true"');
  });

  it('is deterministic: two calls on equal designs are byte-identical', () => {
    const a = projectTrialSchema(schemaDesign());
    const b = projectTrialSchema(schemaDesign());
    expect(a.svg).not.toBeNull();
    expect(a.svg).toBe(b.svg);
    expect(a).toEqual(b);
    expect(a.svg).not.toMatch(/Date|Math\.random|\d{4}-\d{2}-\d{2}T/);
  });

  it('is self-contained and accessible: <title>, <desc>, no external fonts or scripts', () => {
    const svg = projectTrialSchema(schemaDesign()).svg!;
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toMatch(/<title id="ts-title">Trial schema: A phase 3 study of Drug X in type 2 diabetes<\/title>/);
    expect(svg).toMatch(/<desc id="ts-desc">[^<]+<\/desc>/);
    expect(svg).toContain('aria-labelledby="ts-title ts-desc"');
    expect(svg).toContain('role="img"');
    expect(svg).not.toMatch(/<script|@import|url\(|href=|xlink:/);
    const desc = svg.match(/<desc id="ts-desc">([^<]+)<\/desc>/)![1];
    expect(desc).toContain('Epochs left to right: Screening (screening: Screening Day -28); Placebo run-in');
    expect(desc).toContain('Randomization after Placebo run-in: 1:1 · double-blind · stratified.');
    expect(desc).toContain('Arms: Drug X: Drug X 10 mg oral once daily; Placebo: Placebo oral once daily.');
  });

});

describe('projectTrialSchema: randomisation point placement', () => {
  it('places the randomisation marker after the last pre-treatment epoch and before treatment', () => {
    const out = projectTrialSchema(schemaDesign());
    expect(out.model.randomization).toEqual({
      present: true,
      afterEpochId: 'e_runin',
      beforeEpochId: 'e_trt',
      ratio: [1, 1],
      blinding: 'double',
      allocationMethod: 'stratified',
      stratificationFactors: ['region'],
    });
    const svg = out.svg!;
    const runIn = geometry(svg, 'data-epoch', 'e_runin');
    const treatment = geometry(svg, 'data-epoch', 'e_trt');
    const marker = geometry(svg, 'data-role', 'randomization');
    expect(marker.x).toBeGreaterThan(runIn.x + runIn.w);
    expect(marker.x).toBeLessThan(treatment.x);
    // The arm lanes begin after the marker and end within the treatment epoch.
    const lane = svg.match(/<line data-arm="Drug X" x1="(-?[0-9.]+)" y1="[0-9.]+" x2="(-?[0-9.]+)"/)!;
    expect(Number(lane[1])).toBeGreaterThan(marker.x);
    expect(Number(lane[2])).toBeLessThanOrEqual(treatment.x + treatment.w);
  });

  it('with screening but no run-in, the marker follows screening', () => {
    const d = clone(schemaDesign());
    d.scheduleOfActivities!.epochs = d.scheduleOfActivities!.epochs.filter(e => e.id !== 'e_runin');
    d.scheduleOfActivities!.visits = d.scheduleOfActivities!.visits.filter(v => v.epochId !== 'e_runin');
    const out = projectTrialSchema(d);
    expect(out.status).toBe('rendered');
    expect(out.model.randomization.afterEpochId).toBe('e_scr');
  });

});

describe('projectTrialSchema: gaps are reported, never filled', () => {
  it('no Schedule of Activities: partial, the named gap, and arms drawn alone with the figure saying so', () => {
    const d = clone(schemaDesign());
    delete d.scheduleOfActivities;
    const out = projectTrialSchema(d);
    expect(out.status).toBe('partial');
    expect(out.gaps).toEqual([NO_SOA_GAP]);
    expect(NO_SOA_GAP).toBe('no Schedule of Activities: epochs and visit milestones cannot be drawn');
    expect(out.model.epochs).toEqual([]);
    expect(out.model.followUp).toBeUndefined();
    expect(out.model.randomization).toMatchObject({ present: true });
    expect(out.model.randomization.afterEpochId).toBeUndefined();
    const svg = out.svg!;
    expect(svg).not.toContain('data-epoch=');
    expect(svg).toContain('data-arm="Drug X"');
    expect(svg).toContain('data-arm="Placebo"');
    expect(svg).toContain('data-role="randomization"');
    expect(svg).toContain('Schedule of Activities not recorded: epochs and visit milestones not drawn');
    expect(svg).toContain(`Gap: ${NO_SOA_GAP}`);
  });

  it('no Schedule of Activities and no arms: missing, svg null', () => {
    const d = clone(schemaDesign());
    delete d.scheduleOfActivities;
    d.arms = [];
    const out = projectTrialSchema(d);
    expect(out.status).toBe('missing');
    expect(out.svg).toBeNull();
    expect(out.gaps).toEqual([NO_SOA_GAP, 'no arms recorded: arm lanes cannot be drawn']);
  });

  it('a Schedule of Activities with no epochs is reported as such, not as absent', () => {
    const d = clone(schemaDesign());
    d.scheduleOfActivities = { epochs: [], visits: [], activities: [], cells: [] };
    const out = projectTrialSchema(d);
    expect(out.status).toBe('partial');
    expect(out.gaps).toEqual(['Schedule of Activities has no epochs: epochs and visit milestones cannot be drawn']);
  });

  it('draws an arm with no interventions with the explicit label, and reports it', () => {
    const d = clone(schemaDesign());
    d.arms.push({ name: 'Open cohort', interventions: [] });
    d.randomization!.ratio = [1, 1, 1];
    const out = projectTrialSchema(d);
    expect(out.status).toBe('partial');
    expect(out.gaps).toEqual(['arm "Open cohort" has no intervention recorded']);
    expect(out.model.arms.map(a => a.name)).toEqual(['Drug X', 'Placebo', 'Open cohort']);
    expect(out.model.arms[2]).toEqual({ name: 'Open cohort', interventions: [], label: `Open cohort: ${NO_INTERVENTION_LABEL}` });
    expect(NO_INTERVENTION_LABEL).toBe('(no intervention recorded)');
    const svg = out.svg!;
    expect(svg).toContain('data-arm="Open cohort"');
    expect(svg).toContain(`>Open cohort: ${NO_INTERVENTION_LABEL}</text>`);
  });

  it('never invents a study day: an undated visit is drawn without a day label and reported', () => {
    const d = clone(schemaDesign());
    const v = d.scheduleOfActivities!.visits.find(x => x.id === 'V1')!;
    delete v.studyDay;
    const out = projectTrialSchema(d);
    expect(out.status).toBe('partial');
    expect(out.gaps).toEqual(['visit(s) without a recorded study day, drawn without a day label: "Screening"']);
    const m = out.model.epochs[0].milestones[0];
    expect(m).toEqual({ name: 'Screening', isBaseline: false });
    expect('studyDay' in m).toBe(false);
    expect(out.svg).toContain('data-visit="Screening"');
    expect(out.svg).not.toMatch(/>Day (0|undefined|NaN|null)/);
    // The screening box has no day-range line either, because nothing in it is dated.
    expect(out.svg).not.toMatch(/>Day -28/);
  });

  it('reports an epoch with no visits instead of drawing invented milestones', () => {
    const d = clone(schemaDesign());
    d.scheduleOfActivities!.visits = d.scheduleOfActivities!.visits.filter(v => v.epochId !== 'e_fu');
    const out = projectTrialSchema(d);
    expect(out.status).toBe('partial');
    expect(out.gaps).toEqual(['epoch "Follow-up" has no scheduled visits: no milestones can be drawn for it']);
    expect(out.model.followUp).toEqual({ epochIds: ['e_fu'], name: 'Follow-up', milestones: [] });
    expect(out.svg).toContain('data-epoch="e_fu"');
  });

});

describe('projectTrialSchema: randomisation honesty', () => {
  it('a multi-arm design with no randomisation node is a gap, never an assumed allocation', () => {
    const d = clone(schemaDesign());
    delete d.randomization;
    const out = projectTrialSchema(d);
    expect(out.status).toBe('partial');
    expect(out.gaps).toEqual(['no randomization recorded: the allocation point cannot be marked for 2 arms']);
    expect(out.model.randomization).toEqual({ present: false });
    expect(out.svg).not.toContain('data-role="randomization"');
    expect(out.svg).toContain('data-arm="Drug X"');
  });

  it('a single-arm design without randomisation is complete, with no marker and no gap', () => {
    const d = clone(schemaDesign());
    delete d.randomization;
    d.arms = [d.arms[0]];
    d.framework.structuralDesign = 'single_arm';
    d.framework.controlType = 'none';
    const out = projectTrialSchema(d);
    expect(out.status).toBe('rendered');
    expect(out.gaps).toEqual([]);
    expect(out.model.randomization).toEqual({ present: false });
    expect(out.svg).not.toContain('data-role="randomization"');
    expect(out.svg).toContain('No randomization point is drawn.');
  });

  it('a recorded allocation method of none is the sponsor saying so: no marker, no gap', () => {
    const d = clone(schemaDesign());
    d.randomization = { ratio: [1, 1], allocationMethod: 'none', blinding: 'open' };
    const out = projectTrialSchema(d);
    expect(out.gaps).toEqual([]);
    expect(out.model.randomization.present).toBe(false);
    expect(out.model.randomization.allocationMethod).toBe('none');
    expect(out.svg).not.toContain('data-role="randomization"');
  });

  it('reports a ratio that does not match the arm count', () => {
    const d = clone(schemaDesign());
    d.randomization!.ratio = [2, 1, 1];
    const out = projectTrialSchema(d);
    expect(out.gaps).toEqual(['randomization ratio [2, 1, 1] has 3 entries but the design has 2 arms']);
  });

  it('cannot place the marker when no treatment epoch exists, and says so', () => {
    const d = clone(schemaDesign());
    d.scheduleOfActivities!.epochs = d.scheduleOfActivities!.epochs.filter(e => e.kind !== 'treatment');
    d.scheduleOfActivities!.visits = d.scheduleOfActivities!.visits.filter(v => v.epochId !== 'e_trt');
    const out = projectTrialSchema(d);
    expect(out.gaps).toEqual(['no treatment epoch: the randomization point cannot be placed after a pre-treatment epoch']);
    expect(out.model.randomization.afterEpochId).toBeUndefined();
    expect(out.model.randomization.beforeEpochId).toBeUndefined();
    expect(out.svg).not.toContain('data-role="randomization"');
  });

});

describe('projectTrialSchema: not-drawn items, escaping and helpers', () => {
  it('leaves unscheduled epochs and visits out of the timeline and names them as not drawn', () => {
    const d = clone(schemaDesign());
    d.scheduleOfActivities!.epochs.push({ id: 'e_unsch', name: 'Unscheduled', kind: 'unscheduled', order: 9 });
    d.scheduleOfActivities!.visits.push({ id: 'ET', name: 'Early termination', epochId: 'e_trt', unscheduled: true, order: 9 });
    d.scheduleOfActivities!.visits.push({ id: 'UNS', name: 'Unscheduled visit', epochId: 'e_unsch', order: 10 });
    const out = projectTrialSchema(d);
    expect(out.status).toBe('rendered');
    expect(out.model.epochs.map(e => e.id)).not.toContain('e_unsch');
    expect(out.model.epochs[2].milestones.map(m => m.name)).toEqual(['Baseline', 'Week 12', 'Week 24']);
    expect(out.model.notDrawn).toEqual([
      'unscheduled epoch "Unscheduled" is not a timeline period and is not drawn',
      'unscheduled visit "Early termination" has no planned timepoint and is not drawn',
      'visit "Unscheduled visit" belongs to an unscheduled epoch and is not drawn',
    ]);
    expect(out.svg).not.toContain('data-visit="Early termination"');
    expect(out.svg).toContain('Not drawn: unscheduled epoch');
  });

  it('reports a visit that references an undefined epoch instead of placing it', () => {
    const d = clone(schemaDesign());
    d.scheduleOfActivities!.visits.push({ id: 'VX', name: 'Orphan', epochId: 'e_missing', studyDay: 5, order: 11 });
    const out = projectTrialSchema(d);
    expect(out.gaps).toEqual(['visit "Orphan" references undefined epoch "e_missing" and is not drawn']);
    expect(out.svg).not.toContain('data-visit="Orphan"');
  });

  it('escapes design text so the SVG stays well-formed', () => {
    const d = clone(schemaDesign());
    d.arms[0].name = 'Drug X & "Co" <high>';
    d.title = "Tom's <trial>";
    const svg = projectTrialSchema(d).svg!;
    expect(svg).toContain('data-arm="Drug X &amp; &quot;Co&quot; &lt;high&gt;"');
    expect(svg).toContain('<title id="ts-title">Trial schema: Tom&#39;s &lt;trial&gt;</title>');
    expect(svg).not.toMatch(/<high>/);
  });

  it('describes an intervention from recorded parts only, in a fixed order', () => {
    expect(describeIntervention({ name: 'Drug X', role: 'investigational', dose: '10 mg', route: 'oral', regimen: 'once daily' })).toBe('Drug X 10 mg oral once daily');
    expect(describeIntervention({ name: 'Placebo', role: 'placebo' })).toBe('Placebo');
    expect(describeIntervention({ name: 'Drug Y', role: 'comparator', route: '  ' })).toBe('Drug Y');
  });
});
