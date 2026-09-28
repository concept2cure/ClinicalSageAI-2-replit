/**
 * Tests for the ICH M11 §1.2 Trial Schema projection. The schema is a deterministic
 * figure of the design object: every epoch and arm the design carries is drawn, nothing
 * the design lacks is invented (no epochs, days, windows, names or interventions), a
 * visit is never placed in an epoch the design did not unambiguously assign it to, arm
 * lanes never cross a non-treatment epoch, the randomisation marker sits after the last
 * pre-treatment epoch (or at the start of treatment), and the SVG is well-formed XML,
 * byte-identical across calls regardless of clock, RNG or input array order, and
 * accessible — its <desc> carries every gap.
 *
 * SVGs are parsed with jsdom's XML parser (saxes), which rejects characters XML 1.0
 * forbids; @xmldom/xmldom accepts them and so cannot catch that defect.
 */

import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  projectTrialSchema,
  describeIntervention,
  CROSSOVER_GAP,
  EMPTY_SOA_GAP,
  NO_INTERVENTION_LABEL,
  NO_SOA_GAP,
  NO_TREATMENT_EPOCH_GAP,
  TRIAL_SCHEMA_BASIS,
  UNNAMED_INTERVENTION_LABEL,
} from '../trial-schema';
import { type StudyDesign, type ScheduleOfActivities, type SoaEpoch, type SoaVisit } from '../study-design-types';

/** Screening → run-in → treatment → follow-up, every visit dated, baseline marked. Both arrays out of order. */
function schemaSoa(): ScheduleOfActivities {
  return {
    epochs: [
      { id: 'e_fu', name: 'Follow-up', kind: 'follow_up', order: 3 },
      { id: 'e_trt', name: 'Treatment', kind: 'treatment', order: 2 },
      { id: 'e_scr', name: 'Screening', kind: 'screening', order: 0 },
      { id: 'e_runin', name: 'Placebo run-in', kind: 'run_in', order: 1 },
    ],
    visits: [
      { id: 'V5', name: 'Week 24', epochId: 'e_trt', studyDay: 168, windowDays: 3, order: 4 },
      { id: 'V1', name: 'Screening', epochId: 'e_scr', studyDay: -28, order: 0 },
      { id: 'V6', name: 'Safety follow-up', epochId: 'e_fu', studyDay: 196, windowDays: 7, order: 5 },
      { id: 'V4', name: 'Week 12', epochId: 'e_trt', studyDay: 84, windowDays: 3, order: 3 },
      { id: 'V2', name: 'Run-in start', epochId: 'e_runin', studyDay: -14, windowDays: 2, order: 1 },
      { id: 'V3', name: 'Baseline', epochId: 'e_trt', studyDay: 1, isBaseline: true, order: 2 },
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

/** Replace the schedule's epochs (id, name, kind; order = position) and visits (one dated visit per epoch unless given). */
function withEpochs(d: StudyDesign, epochs: Array<[string, string, SoaEpoch['kind']]>, visits?: SoaVisit[]): StudyDesign {
  d.scheduleOfActivities!.epochs = epochs.map(([id, name, kind], order) => ({ id, name, kind, order }));
  d.scheduleOfActivities!.visits = visits ?? epochs.map(([id], i) => ({ id: `v_${id}`, name: `V ${id}`, epochId: id, studyDay: i * 30, order: i }));
  return d;
}

// ─── SVG as XML: parse strictly, then read by attribute ─────────────────────

const { DOMParser } = new JSDOM('').window;
type XmlDoc = ReturnType<InstanceType<typeof DOMParser>['parseFromString']>;

function parse(svg: string | null): XmlDoc {
  expect(svg).not.toBeNull();
  const doc = new DOMParser().parseFromString(svg!, 'image/svg+xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  return doc;
}
function els(doc: XmlDoc, tag: string, attr: string, value: string): Element[] {
  return Array.from(doc.getElementsByTagName(tag)).filter(e => e.getAttribute(attr) === value);
}
const num = (e: Element, a: string): number => Number(e.getAttribute(a));
function box(doc: XmlDoc, id: string): { x: number; right: number } {
  const [r] = els(doc, 'rect', 'data-epoch', id);
  return { x: num(r, 'x'), right: num(r, 'x') + num(r, 'width') };
}
const lanes = (doc: XmlDoc, arm: string): number[][] => els(doc, 'line', 'data-arm', arm).map(e => [num(e, 'x1'), num(e, 'x2')]);
const desc = (doc: XmlDoc): string => doc.getElementsByTagName('desc')[0].textContent ?? '';
const texts = (doc: XmlDoc): string[] => Array.from(doc.getElementsByTagName('text')).map(e => e.textContent ?? '');
const gapLine = (doc: XmlDoc, i: number): string => els(doc, 'text', 'data-gap', String(i)).map(e => e.textContent).join(' ');
const markerX = (doc: XmlDoc): number => num(els(doc, 'circle', 'data-role', 'randomization')[0], 'cx');

describe('projectTrialSchema: a full design', () => {
  it('cites the M11 §1.2 basis', () => {
    expect(TRIAL_SCHEMA_BASIS).toMatch(/ICH M11/);
    expect(TRIAL_SCHEMA_BASIS).toMatch(/§1\.2 Trial Schema/);
    expect(projectTrialSchema(schemaDesign()).basis).toBe(TRIAL_SCHEMA_BASIS);
  });

  it('renders every epoch and every arm of a full design, in design order, with no gaps', () => {
    const out = projectTrialSchema(schemaDesign());
    expect(out.status).toBe('rendered');
    expect(out.gaps).toEqual([]);
    expect(out.model.scheduleRecorded).toBe(true);
    expect(out.model.epochs.map(e => e.id)).toEqual(['e_scr', 'e_runin', 'e_trt', 'e_fu']);
    expect(out.model.epochs.map(e => e.kind)).toEqual(['screening', 'run_in', 'treatment', 'follow_up']);
    // Milestones follow the visits' `order`, not the (shuffled) input array.
    expect(out.model.epochs.map(e => e.milestones.map(m => m.name))).toEqual([
      ['Screening'], ['Run-in start'], ['Baseline', 'Week 12', 'Week 24'], ['Safety follow-up'],
    ]);
    expect(out.model.arms.map(a => a.label)).toEqual(['Drug X: Drug X 10 mg oral once daily', 'Placebo: Placebo oral once daily']);
    expect(out.model.followUp).toEqual({
      epochIds: ['e_fu'], name: 'Follow-up', milestones: [{ name: 'Safety follow-up', studyDay: 196, windowDays: 7, isBaseline: false }],
    });
    const doc = parse(out.svg);
    for (const id of ['e_scr', 'e_runin', 'e_trt', 'e_fu']) expect(els(doc, 'rect', 'data-epoch', id)).toHaveLength(1);
    for (const name of ['Screening', 'Placebo run-in', 'Treatment', 'Follow-up', 'Day 84 ±3']) expect(texts(doc)).toContain(name);
    const xs = ['Baseline', 'Week 12', 'Week 24'].map(v => num(els(doc, 'line', 'data-visit', v)[0], 'x1'));
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(lanes(doc, 'Drug X')).toHaveLength(1);
    expect(lanes(doc, 'Placebo')).toHaveLength(1);
    expect(els(doc, 'line', 'data-role', 'follow-up')).toHaveLength(1);
    expect(els(doc, 'line', 'data-baseline', 'true')).toHaveLength(1);
    expect(texts(doc)).toContain('Milestones are spaced by visit order, not to scale in study days.');
  });

  it('is deterministic: byte-identical whatever the clock, the RNG or the input array order', () => {
    vi.useFakeTimers();
    const rnd = vi.spyOn(Math, 'random');
    try {
      vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
      rnd.mockReturnValue(0.1);
      const a = projectTrialSchema(schemaDesign());
      vi.setSystemTime(new Date('2031-06-15T12:34:56Z'));
      rnd.mockReturnValue(0.9);
      const shuffled = schemaDesign();
      shuffled.scheduleOfActivities!.epochs.reverse();
      shuffled.scheduleOfActivities!.visits.reverse();
      const b = projectTrialSchema(shuffled);
      expect(a.svg).not.toBeNull();
      expect(b.svg).toBe(a.svg);
      expect(b).toEqual(a);
    } finally {
      rnd.mockRestore();
      vi.useRealTimers();
    }
  });

  it('is self-contained and accessible: <title>, <desc> narrating the model, no external fonts or scripts', () => {
    const svg = projectTrialSchema(schemaDesign()).svg!;
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('aria-labelledby="ts-title ts-desc"');
    expect(svg).toContain('role="img"');
    expect(svg).not.toMatch(/<script|@import|url\(|href=|xlink:/);
    const doc = parse(svg);
    expect(doc.getElementsByTagName('title')[0].textContent).toBe('Trial schema: A phase 3 study of Drug X in type 2 diabetes');
    expect(desc(doc)).toContain('Epochs left to right: Screening (screening: Screening Day -28); Placebo run-in');
    expect(desc(doc)).toContain('not to scale in study days');
    expect(desc(doc)).toContain(
      'Randomization after Placebo run-in: 1:1 · double-blind · stratified allocation · stratification factors: region.',
    );
    expect(desc(doc)).toContain('Arms: Drug X: Drug X 10 mg oral once daily; Placebo: Placebo oral once daily.');
    expect(texts(doc)).toContain('Phase 3 · parallel group · placebo control · superiority');
  });

  it('stays well-formed XML when design text carries a character XML cannot hold, and says it was removed', () => {
    const d = schemaDesign();
    d.arms[0].name = 'Drug X\u000Bhigh dose'; // Word's manual line break, pasted
    const out = projectTrialSchema(d);
    const doc = parse(out.svg);
    expect(lanes(doc, 'Drug Xhigh dose')).toHaveLength(1);
    expect(out.model.notDrawn).toEqual([
      '1 text field(s) contain control characters XML cannot carry; the figure draws them with those characters removed',
    ]);
  });
});

describe('projectTrialSchema: randomisation point placement', () => {
  it('places the marker after the last pre-treatment epoch; lanes start after it and stay inside treatment', () => {
    const out = projectTrialSchema(schemaDesign());
    expect(out.model.randomization).toEqual({
      present: true, afterEpochId: 'e_runin', beforeEpochId: 'e_trt', ratio: [1, 1],
      blinding: 'double', allocationMethod: 'stratified', stratificationFactors: ['region'],
    });
    const doc = parse(out.svg);
    const runIn = box(doc, 'e_runin');
    const treatment = box(doc, 'e_trt');
    expect(markerX(doc)).toBeGreaterThan(runIn.right);
    expect(markerX(doc)).toBeLessThan(treatment.x);
    const [[x1, x2]] = lanes(doc, 'Drug X');
    expect(x1).toBeGreaterThan(markerX(doc));
    expect(x2).toBeLessThanOrEqual(treatment.right);
  });

  it('with screening but no run-in, the marker follows screening', () => {
    const d = schemaDesign();
    d.scheduleOfActivities!.epochs = d.scheduleOfActivities!.epochs.filter(e => e.id !== 'e_runin');
    d.scheduleOfActivities!.visits = d.scheduleOfActivities!.visits.filter(v => v.epochId !== 'e_runin');
    const out = projectTrialSchema(d);
    expect(out.status).toBe('rendered');
    expect(out.model.randomization.afterEpochId).toBe('e_scr');
  });

  it('with no pre-treatment epoch, the marker is drawn at the start of treatment', () => {
    const d = withEpochs(schemaDesign(), [['trt', 'Treatment', 'treatment'], ['fu', 'Follow-up', 'follow_up']]);
    d.scheduleOfActivities!.visits[0].isBaseline = true;
    const out = projectTrialSchema(d);
    expect(out.status).toBe('rendered');
    expect(out.model.randomization).toMatchObject({ present: true, beforeEpochId: 'trt' });
    expect(out.model.randomization.afterEpochId).toBeUndefined();
    const doc = parse(out.svg);
    const trt = box(doc, 'trt');
    expect(els(doc, 'circle', 'data-role', 'randomization')).toHaveLength(1);
    expect(markerX(doc)).toBeGreaterThan(trt.x);
    expect(markerX(doc)).toBeLessThan(trt.x + 30);
    expect(desc(doc)).toContain('Randomization at the start of Treatment: 1:1');
  });
});

describe('projectTrialSchema: absent and empty schedules', () => {
  it('no Schedule of Activities: partial, the named gap, arms drawn alone and the figure saying so', () => {
    const d = schemaDesign();
    delete d.scheduleOfActivities;
    const out = projectTrialSchema(d);
    expect(out.status).toBe('partial');
    expect(out.gaps).toEqual([NO_SOA_GAP]);
    expect(out.model.scheduleRecorded).toBe(false);
    expect(out.model.epochs).toEqual([]);
    expect(out.model.followUp).toBeUndefined();
    expect(out.model.randomization.afterEpochId).toBeUndefined();
    const doc = parse(out.svg);
    expect(out.svg).not.toContain('data-epoch=');
    expect(lanes(doc, 'Drug X')).toHaveLength(1);
    expect(els(doc, 'circle', 'data-role', 'randomization')).toHaveLength(1);
    expect(texts(doc)).toContain('Schedule of Activities not recorded: epochs and visit milestones not drawn');
    expect(gapLine(doc, 0)).toBe(`Gap: ${NO_SOA_GAP}`);
    expect(desc(doc)).toContain('No Schedule of Activities: epochs and visit milestones are not drawn.');
  });

  it('no Schedule of Activities and no arms: missing, svg null', () => {
    const d = schemaDesign();
    delete d.scheduleOfActivities;
    d.arms = [];
    const out = projectTrialSchema(d);
    expect(out.status).toBe('missing');
    expect(out.svg).toBeNull();
    expect(out.gaps).toEqual([NO_SOA_GAP, 'no arms recorded: arm lanes cannot be drawn']);
  });

  it.each([
    ['an empty epoch list', []],
    ['only an unscheduled epoch', [{ id: 'u', name: 'Unscheduled', kind: 'unscheduled', order: 0 }]],
  ] as Array<[string, SoaEpoch[]]>)('a recorded schedule with %s is reported as recorded, never as absent', (_, epochs) => {
    const d = schemaDesign();
    d.scheduleOfActivities = { epochs, visits: [], activities: [], cells: [] };
    const out = projectTrialSchema(d);
    expect(out.status).toBe('partial');
    expect(out.gaps).toEqual([EMPTY_SOA_GAP]);
    expect(out.model.scheduleRecorded).toBe(true);
    const doc = parse(out.svg);
    expect(texts(doc)).toContain('Schedule of Activities recorded but has no drawable epochs: epochs and visit milestones not drawn');
    expect(out.svg).not.toContain('not recorded: epochs');
    expect(desc(doc)).toContain('The Schedule of Activities is recorded but has no drawable epochs');
    expect(desc(doc)).not.toContain('No Schedule of Activities');
  });

  it('a schedule with no arms: partial, and the figure says no arms are recorded', () => {
    const d = schemaDesign();
    d.arms = [];
    delete d.randomization;
    const out = projectTrialSchema(d);
    expect(out.status).toBe('partial');
    expect(out.gaps).toEqual(['no arms recorded: arm lanes cannot be drawn']);
    expect(texts(parse(out.svg))).toContain('no arms recorded');
  });
});

describe('projectTrialSchema: gaps are reported, never filled', () => {
  it('draws an arm with no interventions with the explicit label, and reports it', () => {
    const d = schemaDesign();
    d.arms.push({ name: 'Open cohort', interventions: [] });
    d.randomization!.ratio = [1, 1, 1];
    const out = projectTrialSchema(d);
    expect(out.status).toBe('partial');
    expect(out.gaps).toEqual(['arm "Open cohort" has no intervention recorded']);
    expect(out.model.arms[2]).toEqual({ name: 'Open cohort', interventions: [], label: `Open cohort: ${NO_INTERVENTION_LABEL}` });
    const doc = parse(out.svg);
    expect(lanes(doc, 'Open cohort')).toHaveLength(1);
    expect(texts(doc)).toContain(`Open cohort: ${NO_INTERVENTION_LABEL}`);
  });

  it('never invents a study day: an undated visit is drawn without a day label and reported', () => {
    const d = schemaDesign();
    delete d.scheduleOfActivities!.visits.find(x => x.id === 'V1')!.studyDay;
    const out = projectTrialSchema(d);
    expect(out.status).toBe('partial');
    expect(out.gaps).toEqual(['visit(s) without a recorded study day, drawn without a day label: "Screening"']);
    expect(out.model.epochs[0].milestones[0]).toEqual({ name: 'Screening', isBaseline: false });
    const doc = parse(out.svg);
    expect(els(doc, 'line', 'data-visit', 'Screening')).toHaveLength(1);
    expect(out.svg).not.toMatch(/>Day (0|undefined|NaN|null)|>Day -28/);
  });

  it('reports an epoch with no visits instead of drawing invented milestones', () => {
    const d = schemaDesign();
    d.scheduleOfActivities!.visits = d.scheduleOfActivities!.visits.filter(v => v.epochId !== 'e_fu');
    const out = projectTrialSchema(d);
    expect(out.gaps).toEqual(['epoch "Follow-up" has no scheduled visits: no milestones can be drawn for it']);
    expect(out.model.followUp).toEqual({ epochIds: ['e_fu'], name: 'Follow-up', milestones: [] });
  });

  it('an epoch id shared by two epochs: reported, and no visit is drawn in an epoch it was not assigned to', () => {
    const d = schemaDesign();
    d.scheduleOfActivities!.epochs.push({ id: 'e_trt', name: 'Treatment period 2', kind: 'treatment', order: 2.5 });
    const out = projectTrialSchema(d);
    expect(out.status).toBe('partial');
    expect(out.gaps.slice(0, 2)).toEqual([
      'epoch id "e_trt" is shared by 2 epochs ("Treatment", "Treatment period 2"): visits referencing it cannot be placed',
      'visit(s) whose epoch id is shared by more than one epoch, not drawn: "Baseline", "Week 12", "Week 24"',
    ]);
    expect(out.gaps).toContain('the randomization point cannot be placed: epoch id "e_trt" is shared by more than one epoch');
    expect(out.model.epochs.filter(e => e.id === 'e_trt').map(e => e.milestones)).toEqual([[], []]);
    const doc = parse(out.svg);
    for (const v of ['Baseline', 'Week 12', 'Week 24']) expect(els(doc, 'line', 'data-visit', v)).toHaveLength(0);
    for (const v of ['Screening', 'Run-in start', 'Safety follow-up']) expect(els(doc, 'line', 'data-visit', v)).toHaveLength(1);
  });

  it('a blank title, arm or intervention name is a gap drawn as a placeholder, never as blank text or a bare dose', () => {
    const d = schemaDesign();
    d.title = ' ';
    d.arms = [
      { name: '', interventions: [{ name: 'Drug A', role: 'investigational' }] },
      { name: 'B', interventions: [{ name: '  ', role: 'placebo', dose: '10 mg' }] },
    ];
    const out = projectTrialSchema(d);
    expect(out.status).toBe('partial');
    expect(out.gaps).toEqual(['study title not recorded', 'arm 1 has no recorded name', 'arm "B" has an intervention with no recorded name']);
    expect(out.model.arms.map(a => a.label)).toEqual(['(arm 1 name not recorded): Drug A', `B: ${UNNAMED_INTERVENTION_LABEL} 10 mg`]);
    expect(parse(out.svg).getElementsByTagName('title')[0].textContent).toBe('Trial schema: (study title not recorded)');
  });

  it('reports visits whose study days run backwards against their order', () => {
    const d = schemaDesign();
    d.scheduleOfActivities!.visits.find(v => v.id === 'V4')!.studyDay = -100;
    expect(projectTrialSchema(d).gaps).toEqual([
      'visit "Week 12" (Day -100) is ordered after "Baseline" (Day 1) but has an earlier study day: the visit order and the study days disagree',
    ]);
  });

  it('prints every gap, verbatim, in the <desc> and on its own caption line', () => {
    const d = schemaDesign();
    d.randomization!.ratio = [1];
    d.arms[1].interventions = [];
    const out = projectTrialSchema(d);
    expect(out.gaps).toEqual(['arm "Placebo" has no intervention recorded', 'randomization ratio [1] has 1 entries but the design has 2 arms']);
    const doc = parse(out.svg);
    expect(desc(doc)).toContain(`Gaps: ${out.gaps.join('; ')}.`);
    out.gaps.forEach((g, i) => expect(gapLine(doc, i)).toBe(`Gap: ${g}`));
  });
});

describe('projectTrialSchema: randomisation honesty', () => {
  it('a multi-arm design with no randomisation node is a gap, never an assumed allocation', () => {
    const d = schemaDesign();
    delete d.randomization;
    const out = projectTrialSchema(d);
    expect(out.gaps).toEqual(['no randomization recorded: the allocation point cannot be marked for 2 arms']);
    expect(out.model.randomization).toEqual({ present: false });
    expect(out.svg).not.toContain('data-role="randomization"');
  });

  it('a single-arm first-in-human design without randomisation is complete, and worded as such', () => {
    const d = schemaDesign();
    delete d.randomization;
    d.arms = [d.arms[0]];
    d.phase = 'FIH';
    Object.assign(d.framework, { structuralDesign: 'single_arm', controlType: 'none' });
    const out = projectTrialSchema(d);
    expect(out.status).toBe('rendered');
    const doc = parse(out.svg);
    expect(els(doc, 'circle', 'data-role', 'randomization')).toHaveLength(0);
    expect(desc(doc)).toContain('No randomization point is drawn.');
    expect(texts(doc)).toContain('First-in-human · single arm · no control · superiority');
  });

  it('a recorded allocation method of none is the sponsor saying so: no marker, no gap', () => {
    const d = schemaDesign();
    d.randomization = { ratio: [1, 1], allocationMethod: 'none', blinding: 'open' };
    const out = projectTrialSchema(d);
    expect(out.gaps).toEqual([]);
    expect(out.model.randomization).toMatchObject({ present: false, allocationMethod: 'none' });
    expect(out.svg).not.toContain('data-role="randomization"');
  });

  it.each([
    [[2, 1, 1], 'randomization ratio [2, 1, 1] has 3 entries but the design has 2 arms'],
    [[1], 'randomization ratio [1] has 1 entries but the design has 2 arms'],
    [[], 'randomization ratio not recorded for 2 arms'],
    [[0, 1], 'randomization ratio [0, 1] has an entry that is not a positive number'],
  ])('reports ratio %j as a gap', (ratio, gap) => {
    const d = schemaDesign();
    d.randomization!.ratio = ratio;
    expect(projectTrialSchema(d)).toMatchObject({ status: 'partial', gaps: [gap] });
  });

  it('prints a recorded simple allocation verbatim', () => {
    const d = schemaDesign();
    d.randomization = { ratio: [2, 1], allocationMethod: 'simple', blinding: 'open' };
    expect(desc(parse(projectTrialSchema(d).svg))).toContain('Randomization after Placebo run-in: 2:1 · open-label · simple allocation.');
  });
});

describe('projectTrialSchema: arm lanes stay inside treatment epochs', () => {
  it('no treatment epoch: gaps, no marker, arms listed off the timeline and never laid across other epochs', () => {
    const d = withEpochs(schemaDesign(), [['scr', 'Screening', 'screening'], ['fu', 'Follow-up', 'follow_up']]);
    const out = projectTrialSchema(d);
    expect(out.gaps).toEqual([NO_TREATMENT_EPOCH_GAP, 'no treatment epoch: the randomization point cannot be placed after a pre-treatment epoch']);
    const doc = parse(out.svg);
    expect(els(doc, 'circle', 'data-role', 'randomization')).toHaveLength(0);
    expect(lanes(doc, 'Drug X')).toEqual([]);
    expect(els(doc, 'text', 'data-arm', 'Drug X').map(e => e.getAttribute('data-placed'))).toEqual(['false']);
    expect(desc(doc)).toContain('Randomization is recorded but its point is not drawn: 1:1');
    expect(desc(doc)).toContain('Arms, not placed on the timeline because no treatment epoch is recorded');
  });

  it('a single unrandomised arm with no treatment epoch is still partial and draws no lane', () => {
    const d = withEpochs(schemaDesign(), [['scr', 'Screening', 'screening'], ['fu', 'Follow-up', 'follow_up']]);
    d.arms = [d.arms[0]];
    delete d.randomization;
    const out = projectTrialSchema(d);
    expect(out).toMatchObject({ status: 'partial', gaps: [NO_TREATMENT_EPOCH_GAP] });
    expect(lanes(parse(out.svg), 'Drug X')).toEqual([]);
  });

  it('a 2x2 crossover: named gaps, neutral intervention separator, lanes broken at the washout', () => {
    const d = withEpochs(schemaDesign(), [
      ['scr', 'Screening', 'screening'], ['p1', 'Period 1', 'treatment'], ['wo', 'Washout', 'run_in'], ['p2', 'Period 2', 'treatment'],
    ]);
    d.framework.structuralDesign = 'crossover';
    const test = { name: 'Test', role: 'investigational' as const };
    const ref = { name: 'Reference', role: 'comparator' as const };
    d.arms = [{ name: 'Sequence TR', interventions: [test, ref] }, { name: 'Sequence RT', interventions: [ref, test] }];
    d.randomization!.stratificationFactors = [];
    const out = projectTrialSchema(d);
    expect(out.status).toBe('partial');
    expect(out.gaps).toEqual([
      CROSSOVER_GAP,
      '2 treatment epochs recorded ("Period 1", "Period 2") but arms carry no per-epoch intervention assignment: ' +
        "each lane shows the arm's full intervention list in every treatment epoch",
    ]);
    expect(out.model.arms.map(a => a.label)).toEqual(['Sequence TR: Test; Reference', 'Sequence RT: Reference; Test']);
    const doc = parse(out.svg);
    const [p1, wo, p2] = [box(doc, 'p1'), box(doc, 'wo'), box(doc, 'p2')];
    const segs = lanes(doc, 'Sequence TR');
    expect(segs).toHaveLength(2);
    expect(segs[0][0]).toBeGreaterThanOrEqual(p1.x);
    expect(segs[0][1]).toBeLessThanOrEqual(p1.right);
    expect(segs[1][0]).toBeGreaterThanOrEqual(p2.x);
    for (const [x1, x2] of segs) expect(x2 <= wo.x || x1 >= wo.right).toBe(true);
  });

  it('merges every follow-up epoch after treatment into one band covering them all', () => {
    const d = withEpochs(schemaDesign(), [
      ['trt', 'Treatment', 'treatment'], ['fu1', 'Safety follow-up', 'follow_up'], ['fu2', 'Survival follow-up', 'follow_up'],
    ]);
    const out = projectTrialSchema(d);
    expect(out.status).toBe('rendered');
    expect(out.model.followUp).toEqual({
      epochIds: ['fu1', 'fu2'],
      name: 'Safety follow-up / Survival follow-up',
      milestones: [{ name: 'V fu1', studyDay: 30, isBaseline: false }, { name: 'V fu2', studyDay: 60, isBaseline: false }],
    });
    const doc = parse(out.svg);
    const [band] = els(doc, 'line', 'data-role', 'follow-up');
    expect(num(band, 'x1')).toBeGreaterThanOrEqual(box(doc, 'fu1').x);
    expect(num(band, 'x2')).toBeGreaterThan(box(doc, 'fu2').x);
    expect(texts(doc)).toContain('Safety follow-up / Survival follow-up (all arms)');
  });
});

describe('projectTrialSchema: not-drawn items, escaping and helpers', () => {
  it('leaves unscheduled epochs and visits out of the timeline and names them as not drawn', () => {
    const d = schemaDesign();
    d.scheduleOfActivities!.epochs.push({ id: 'e_unsch', name: 'Unscheduled', kind: 'unscheduled', order: 9 });
    d.scheduleOfActivities!.visits.push({ id: 'ET', name: 'Early termination', epochId: 'e_trt', unscheduled: true, order: 9 });
    d.scheduleOfActivities!.visits.push({ id: 'UNS', name: 'Unscheduled visit', epochId: 'e_unsch', order: 10 });
    const out = projectTrialSchema(d);
    expect(out.status).toBe('rendered');
    expect(out.model.epochs.map(e => e.id)).not.toContain('e_unsch');
    expect(out.model.notDrawn).toEqual([
      'unscheduled epoch "Unscheduled" is not a timeline period and is not drawn',
      'unscheduled visit "Early termination" has no planned timepoint and is not drawn',
      'visit "Unscheduled visit" belongs to an unscheduled epoch and is not drawn',
    ]);
    expect(out.svg).not.toContain('data-visit="Early termination"');
    expect(desc(parse(out.svg))).toContain('Not drawn: unscheduled epoch');
  });

  it('reports a visit that references an undefined epoch instead of placing it', () => {
    const d = schemaDesign();
    d.scheduleOfActivities!.visits.push({ id: 'VX', name: 'Orphan', epochId: 'e_missing', studyDay: 500, order: 11 });
    const out = projectTrialSchema(d);
    expect(out.gaps).toEqual(['visit "Orphan" references undefined epoch "e_missing" and is not drawn']);
    expect(out.svg).not.toContain('data-visit="Orphan"');
  });

  it('escapes design text so the SVG stays well-formed', () => {
    const d = schemaDesign();
    d.arms[0].name = 'Drug X & "Co" <high>';
    d.title = "Tom's <trial>";
    const svg = projectTrialSchema(d).svg!;
    expect(svg).toContain('data-arm="Drug X &amp; &quot;Co&quot; &lt;high&gt;"');
    expect(svg).toContain('<title id="ts-title">Trial schema: Tom&apos;s &lt;trial&gt;</title>');
    expect(lanes(parse(svg), 'Drug X & "Co" <high>')).toHaveLength(1);
  });

  it('describes an intervention from recorded parts only, in a fixed order, never as a bare dose', () => {
    expect(describeIntervention({ name: 'Drug X', role: 'investigational', dose: '10 mg', route: 'oral', regimen: 'once daily' })).toBe('Drug X 10 mg oral once daily');
    expect(describeIntervention({ name: 'Placebo', role: 'placebo' })).toBe('Placebo');
    expect(describeIntervention({ name: 'Drug Y', role: 'comparator', route: '  ' })).toBe('Drug Y');
    expect(describeIntervention({ role: 'comparator', dose: '5 mg' })).toBe(`${UNNAMED_INTERVENTION_LABEL} 5 mg`);
  });
});
