// @vitest-environment jsdom
/**
 * Planning-input forms — the parsers between the governed drawer's strings
 * and the block the server validates.
 *
 * What the suite holds: a value that does not parse, or that the server would
 * refuse (a range, a whole number, a duplicate, a rule across fields), is
 * refused with its label (and its line, for list fields), never coerced — "0x9"
 * is not a number and an empty retention slot is not skipped; a line with more
 * fields than its list has is refused, so a "|" inside a value never cuts it
 * short; a blank optional field is left out, never defaulted, and no choice is
 * pre-selected for a block that is not recorded; "Clear" sends null; every
 * form's prefill of a recorded block — including φ1/φ2, a "|"-free dose, an
 * arm name with a comma, an optional sub-study field, and a shared control of
 * none, of an arm, and of an arm really named "None" — parses back to the same
 * block; and when a recorded block cannot come back exactly (text with a "|",
 * a line break, a key the form has no field for, a value no option shows), the
 * drawer says so and nothing is pre-selected, rather than rewriting it on the
 * next edit. The activity drawer edits only the activity it was opened for.
 * The client's vocabularies and bounds are pinned to the server's.
 *
 * The panel (ProtocolDevPlanningInputs.tsx), through the real `apiRequest`
 * with only `fetch` stubbed: a design that cannot be read is an alert, not an
 * empty panel; a refused write keeps the drawer open and reports the server's
 * own field-level details, framed as "not recorded … Nothing was written"; a
 * successful write carries the block as read (`expected`) and re-reads the
 * design before any badge says "recorded"; a stale block closes the drawer
 * and re-reads; a request that did not complete is not reported as nothing
 * written; every button names its target, and a viewer's say why they are
 * disabled; a design with no Schedule of Activities says so.
 */
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { ACCRUAL_FORM, DOSE_FORM, MMRM_FORM, MMRM_MAX_VISITS, drawerFor, losses, withGovernance, type PlanningFormSpec } from '../surfaces/planningInputForms';
import { EXTERNAL_FORM, LOCATIONS, MASTER_FORM, SPECIMENS, activityFields, activityRecorded, parseActivity } from '../surfaces/planningStructureForms';
import { biospecimenView } from '../surfaces/ProtocolDevPlanningProjections';
import { PlanningInputsPanel } from '../surfaces/ProtocolDevPlanningInputs';
import { MMRM_MAX_VISITS as SERVER_MMRM_MAX_VISITS, SPECIMEN_TYPES } from '../../../../../server/services/study-design/planning-inputs';
import { SOA_ACTIVITY_LOCATIONS } from '../../../../../server/services/study-design/dct-profile';

type Obj = Record<string, unknown>;

/** The drawer's initial values: each field's default, as C2CForm seeds them. */
function prefill(fields: { key: string; default?: string }[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, f.default ?? '']));
}

const DESIGN: Obj = { arms: [{ name: 'Drug A, 10 mg' }, { name: 'Drug B' }, { name: 'Docetaxel' }, { name: 'None' }] };

/** Record → prefill → parse: what an edit that changes nothing would send. */
const roundTrip = (form: PlanningFormSpec, block: Obj) => form.parse(prefill(withGovernance(form.fields(block, DESIGN))), DESIGN);
/** A value set built on the prefill of `block`, with some fields changed. */
const edited = (form: PlanningFormSpec, block: Obj, change: Record<string, string>) => form.parse({ ...prefill(withGovernance(form.fields(block, DESIGN))), ...change }, DESIGN);
const drawer = (form: PlanningFormSpec, block: Obj | null) => drawerFor(form.fields(block, DESIGN), (v) => form.parse(v, DESIGN), block);

const BOIN = { method: 'boin', targetToxicity: 0.3, doseLevels: [{ label: 'DL1', dose: '10 mg' }, { label: 'DL2' }], cohortSize: 3, maxSampleSize: 30, startingDoseIndex: 0 };
const BOIN_FULL = { ...BOIN, doseLevels: [{ label: 'DL1', dose: '10 mg/m2 QD' }, { label: 'DL2', dose: '20 mg' }, { label: 'DL3' }], startingDoseIndex: 1, stopWhenAtDoseN: 9, phi1: 0.2, phi2: 0.4, eliminationThreshold: 0.9 };

describe('dose escalation', () => {
  it('round-trips: the prefill of a recorded block parses back to the same block, φ1 and φ2 included', () => {
    expect(roundTrip(DOSE_FORM, BOIN)).toEqual({ ok: true, value: BOIN });
    expect(roundTrip(DOSE_FORM, BOIN_FULL)).toEqual({ ok: true, value: BOIN_FULL });
    expect(drawer(DOSE_FORM, BOIN_FULL).note).toBeNull();
  });

  it('refuses a non-number with its label, and a starting dose that is not a level', () => {
    expect(edited(DOSE_FORM, BOIN, { targetToxicity: 'thirty percent' })).toEqual({ ok: false, error: 'Target DLT rate is not a number: "thirty percent".' });
    expect(edited(DOSE_FORM, BOIN, { startingDose: 'DL9' })).toEqual({ ok: false, error: 'Starting dose "DL9" is not one of the dose levels.' });
  });

  it('refuses, before any request, what the server would refuse: range, whole number, the cohort rules and the neighbourhood', () => {
    expect(edited(DOSE_FORM, BOIN, { targetToxicity: '1.2' })).toEqual({ ok: false, error: 'Target DLT rate must be strictly between 0 and 1: "1.2".' });
    expect(edited(DOSE_FORM, BOIN, { cohortSize: '3.5' })).toEqual({ ok: false, error: 'Cohort size must be a whole number of at least 1: "3.5".' });
    expect(edited(DOSE_FORM, BOIN, { maxSampleSize: '2' })).toEqual({ ok: false, error: 'Maximum patients is smaller than one cohort.' });
    expect(edited(DOSE_FORM, BOIN, { stopWhenAtDoseN: '2' })).toEqual({ ok: false, error: 'Stop at N on one dose is smaller than one cohort: no cohort would complete at a dose.' });
    expect(edited(DOSE_FORM, BOIN, { phi1: '0.35' })).toEqual({ ok: false, error: 'φ1 must be below the target DLT rate (0.3): "0.35".' });
    expect(edited(DOSE_FORM, BOIN, { phi2: '0.3' })).toEqual({ ok: false, error: 'φ2 must be above the target DLT rate (0.3): "0.3".' });
  });

  it('reads only plain decimals: "0x9", "0b1" and "Infinity" are not numbers', () => {
    for (const s of ['0x9', '0b1', '0o7', 'Infinity', '1e999']) {
      expect(edited(DOSE_FORM, BOIN, { stopWhenAtDoseN: s })).toEqual({ ok: false, error: `Stop at N on one dose is not a number: "${s}".` });
    }
    expect(edited(DOSE_FORM, BOIN, { targetToxicity: '3e-1' })).toMatchObject({ ok: true, value: { targetToxicity: 0.3 } });
  });

  it('refuses a dose line with a "|" inside a value, naming the line, rather than dropping what follows it', () => {
    expect(edited(DOSE_FORM, BOIN, { doseLevels: 'DL1 | 10 mg | QD\nDL2' }))
      .toEqual({ ok: false, error: 'Dose levels, line 1: 3 fields where this list has at most 2; a "|" inside a value is not allowed.' });
  });

  it('refuses a dose label listed twice, so the starting dose names one level', () => {
    expect(edited(DOSE_FORM, BOIN, { doseLevels: 'DL1 | 10 mg\nDL1 | 20 mg', startingDose: 'DL1' }))
      .toEqual({ ok: false, error: 'Dose levels, line 2: dose level "DL1" is listed twice.' });
  });

  it('a recorded dose holding "|" is shown as recorded, and the drawer says it must be corrected — never rewritten to "/"', () => {
    const rec = { ...BOIN, doseLevels: [{ label: 'DL1', dose: '10 mg/m2 | QD' }, { label: 'DL2' }] };
    expect(DOSE_FORM.fields(rec, DESIGN).find((f) => f.key === 'doseLevels')!.default).toBe('DL1 | 10 mg/m2 | QD\nDL2');
    expect(drawer(DOSE_FORM, rec).note).toMatch(/does not pass the form's checks: Dose levels, line 1: 3 fields/);
    expect(roundTrip(DOSE_FORM, rec).ok).toBe(false);
  });

  it('a recorded start on a duplicated label is not silently moved to the first', () => {
    const rec = { ...BOIN, doseLevels: [{ label: 'DL1', dose: '10 mg' }, { label: 'DL1', dose: '20 mg' }], startingDoseIndex: 1 };
    expect(roundTrip(DOSE_FORM, rec)).toEqual({ ok: false, error: 'Dose levels, line 2: dose level "DL1" is listed twice.' });
    expect(drawer(DOSE_FORM, rec).note).toMatch(/listed twice/);
  });

  it('leaves a blank optional field out rather than defaulting it; "Clear" sends null', () => {
    const parsed = roundTrip(DOSE_FORM, BOIN) as { ok: true; value: Obj };
    for (const k of ['eliminationThreshold', 'stopWhenAtDoseN', 'phi1', 'phi2']) expect(parsed.value).not.toHaveProperty(k);
    expect(DOSE_FORM.parse({ action: 'clear' }, DESIGN)).toEqual({ ok: true, value: null });
  });
});

describe('accrual plan and MMRM', () => {
  const PLAN = { timeUnit: 'month', sites: [{ id: 'US-01', country: 'US', meanRate: 1.5, rateCv: 0.5, activationTime: 0 }, { id: 'DE-01', meanRate: 0.8 }], rateSource: 'feasibility', seed: 7 };

  it('reports a bad site line by the number the author sees, and round-trips a recorded plan', () => {
    expect(roundTrip(ACCRUAL_FORM, PLAN)).toEqual({ ok: true, value: PLAN });
    expect(edited(ACCRUAL_FORM, PLAN, { sites: 'US-01 | US | fast' })).toEqual({ ok: false, error: 'Sites, line 1: mean rate is not a number: "fast".' });
    expect(edited(ACCRUAL_FORM, PLAN, { sites: 'US-01 | US | 1\n\nDE-01 | DE | -1' })).toEqual({ ok: false, error: 'Sites, line 3: mean rate must be 0 or more: "-1".' });
  });

  it('refuses a duplicate site id and a sixth field, each by line', () => {
    expect(edited(ACCRUAL_FORM, PLAN, { sites: 'US-01 | US | 1\nUS-01 | US | 2' })).toEqual({ ok: false, error: 'Sites, line 2: site "US-01" is listed twice.' });
    expect(edited(ACCRUAL_FORM, PLAN, { sites: 'US-01 | US | 1 | 0.5 | 0 | extra' }))
      .toEqual({ ok: false, error: 'Sites, line 1: 6 fields where this list has at most 5; a "|" inside a value is not allowed.' });
  });

  it('pre-selects no choice for a block that is not recorded', () => {
    const selects = (form: PlanningFormSpec) => form.fields(null, DESIGN).filter((f) => f.type === 'select' && f.required).map((f) => [f.key, f.default]);
    expect(selects(ACCRUAL_FORM)).toEqual([['timeUnit', '']]);
    expect(selects(MMRM_FORM)).toEqual([['covariance', '']]);
    expect(selects(EXTERNAL_FORM)).toEqual([['method', '']]);
    expect(ACCRUAL_FORM.parse({ ...prefill(ACCRUAL_FORM.fields(null, DESIGN)), sites: 'A | | 1' }, DESIGN)).toEqual({ ok: false, error: 'Time unit is required.' });
  });

  const M = { endpointName: 'HbA1c', visits: 3, covariance: 'ar1', rho: 0.6, sigma: 1.1, delta: 0.4, retention: [0.95, 0.9, 0.85], targetVisit: 2, allocationRatio: 2, source: 'phase 2' };

  it('parses MMRM retention as a list and refuses a bad entry, and an empty slot, by position', () => {
    expect(roundTrip(MMRM_FORM, M)).toEqual({ ok: true, value: M });
    expect(edited(MMRM_FORM, M, { retention: '0.95, x, 0.85' })).toEqual({ ok: false, error: 'Retention value 2 is not a number: "x".' });
    expect(edited(MMRM_FORM, M, { visits: '2', targetVisit: '', retention: '0.95,,0.85' })).toEqual({ ok: false, error: 'Retention value 2 is empty.' });
  });

  it('refuses a retention that rises or does not match the visits, a target visit outside them, and more visits than the bound', () => {
    expect(edited(MMRM_FORM, M, { retention: '0.95, 0.9' })).toEqual({ ok: false, error: 'Retention has 2 values for 3 visits: give one per visit.' });
    expect(edited(MMRM_FORM, M, { retention: '0.9, 0.95, 0.8' })).toEqual({ ok: false, error: 'Retention value 2 (0.95) is above value 1 (0.9): retention never increases.' });
    expect(edited(MMRM_FORM, M, { targetVisit: '4' })).toEqual({ ok: false, error: 'Target visit 4 is not one of the 3 modelled visits.' });
    expect(edited(MMRM_FORM, M, { visits: String(MMRM_MAX_VISITS + 1) })).toEqual({ ok: false, error: `Visits must be at most ${MMRM_MAX_VISITS}: "${MMRM_MAX_VISITS + 1}".` });
    expect(edited(MMRM_FORM, M, { rho: '1' })).toEqual({ ok: false, error: 'ρ must be at least 0 and less than 1: "1".' });
  });
});

describe('external control', () => {
  const EC = { source: 'registry', endpointName: '6MWD', historical: { n: 120, mean: -25, se: 4 }, method: 'power_prior', a0: 0.5, plannedConcurrentControlN: 30, assumedSd: 40, tippingPointAnalysisPlanned: true };

  it('round-trips a plan of either method, keeping "not stated" as absent', () => {
    const parsed = roundTrip(EXTERNAL_FORM, EC);
    expect(parsed).toEqual({ ok: true, value: EC });
    expect((parsed as { value: Obj }).value).not.toHaveProperty('covariateBalancePlanned');
    const cp = { ...EC, method: 'commensurate', a0: undefined, tau2: 1.5 };
    delete cp.a0;
    expect(roundTrip(EXTERNAL_FORM, cp)).toEqual({ ok: true, value: cp });
  });

  it('sends only the discount the chosen method reads, and requires it', () => {
    expect(edited(EXTERNAL_FORM, EC, { method: 'commensurate', tau2: '1' })).toEqual({ ok: true, value: { ...(({ a0: _a0, ...rest }) => rest)(EC), method: 'commensurate', tau2: 1 } });
    expect(edited(EXTERNAL_FORM, EC, { method: 'commensurate', tau2: '' })).toEqual({ ok: false, error: 'τ² (commensurate prior) is required.' });
    expect(edited(EXTERNAL_FORM, EC, { a0: '1.5' })).toEqual({ ok: false, error: 'a0 (power prior) must be between 0 and 1: "1.5".' });
  });
});

describe('master protocol', () => {
  const MP = {
    subStudies: [
      { id: 'S1', name: 'KRAS', population: 'KRAS G12C NSCLC', arms: ['Drug A, 10 mg', 'Docetaxel'], biomarker: 'KRAS G12C', biomarkerAssay: 'NGS', decisionRule: 'PFS HR < 0.7' },
      { id: 'S2', name: 'MET', population: 'METex14 NSCLC', arms: ['Drug B', 'Docetaxel'] },
    ],
    sharedControlArm: 'Docetaxel', nonConcurrentControls: 'used_with_time_adjustment', armAdditionProcedure: 'By amendment', multiplicityAcrossSubStudies: 'Each sub-study at its own alpha',
  };

  it('round-trips a recorded plan from its own prefill: optional fields, an arm with a comma, and each shared-control state', () => {
    expect(roundTrip(MASTER_FORM, MP)).toEqual({ ok: true, value: MP });
    expect(roundTrip(MASTER_FORM, { ...MP, sharedControlArm: null })).toEqual({ ok: true, value: { ...MP, sharedControlArm: null } });
    const unstated = { ...MP, sharedControlArm: undefined };
    delete unstated.sharedControlArm;
    expect(roundTrip(MASTER_FORM, unstated)).toEqual({ ok: true, value: unstated });
    // An arm really named "None" is that arm, not "no shared control".
    expect(roundTrip(MASTER_FORM, { ...MP, subStudies: [{ ...MP.subStudies[0], arms: ['None', 'Drug B'] }], sharedControlArm: 'None' }))
      .toMatchObject({ ok: true, value: { sharedControlArm: 'None' } });
    expect(drawer(MASTER_FORM, MP).note).toBeNull();
  });

  it('a sub-study stated as not biomarker-defined round-trips as null, distinct from a blank biomarker; the justification round-trips', () => {
    const stated = { ...MP, subStudies: [MP.subStudies[0], { ...MP.subStudies[1], biomarker: null }], nonConcurrentControlsJustification: 'Rare population; time trend modelled' };
    expect(roundTrip(MASTER_FORM, stated)).toEqual({ ok: true, value: stated });
    const parsed = roundTrip(MASTER_FORM, MP) as { ok: true; value: { subStudies: Obj[] } };
    expect(parsed.value.subStudies[1]).not.toHaveProperty('biomarker');
  });

  it('refuses a not-biomarker-defined id that is no sub-study, is listed twice, or also names a biomarker', () => {
    expect(edited(MASTER_FORM, MP, { notBiomarkerDefined: 'S9' })).toEqual({ ok: false, error: 'Sub-studies not defined by a biomarker, line 1: "S9" is not one of the sub-studies.' });
    expect(edited(MASTER_FORM, MP, { notBiomarkerDefined: 'S2\nS2' })).toEqual({ ok: false, error: 'Sub-studies not defined by a biomarker, line 2: "S2" is listed twice.' });
    expect(edited(MASTER_FORM, MP, { notBiomarkerDefined: 'S1' })).toEqual({ ok: false, error: 'Sub-studies not defined by a biomarker, line 1: "S1" also names a biomarker.' });
  });

  it('refuses an arm the design does not carry, a line with no arm, a duplicate id, and an eighth field', () => {
    const line = (s: string) => edited(MASTER_FORM, MP, { subStudies: s });
    expect(line('S3 | X | pop | Drug C')).toEqual({ ok: false, error: 'Sub-studies, line 1: arm "Drug C" is not one of the design\'s arms (Drug A, 10 mg; Drug B; Docetaxel; None).' });
    expect(line('S3 | X | pop | ')).toEqual({ ok: false, error: 'Sub-studies, line 1: name at least one arm.' });
    expect(line('S1 | X | pop | Drug B\nS1 | Y | pop | Drug B')).toEqual({ ok: false, error: 'Sub-studies, line 2: sub-study id "S1" is listed twice.' });
    expect(line('S1 | n | p | Drug B | bm | assay | PFS HR < 0.7 | OS HR < 0.8'))
      .toEqual({ ok: false, error: 'Sub-studies, line 1: 8 fields where this list has at most 7; a "|" inside a value is not allowed.' });
  });

  it('a recorded population with a line break is not split into two sub-studies on the next edit: the drawer says so', () => {
    const rec = { ...MP, subStudies: [{ ...MP.subStudies[1], population: 'METex14\nNSCLC' }] };
    expect(drawer(MASTER_FORM, rec).note).toMatch(/does not pass the form's checks: Sub-studies, line 1/);
  });

  it('offers the shared control from the design\'s arms, keeping a recorded one the design lacks, marked', () => {
    const opts = MASTER_FORM.fields({ ...MP, sharedControlArm: 'Placebo' }, DESIGN).find((f) => f.key === 'sharedControlArm')!.options;
    expect(opts).toEqual(expect.arrayContaining([{ value: 'none', label: expect.stringMatching(/^None — /) }, { value: 'arm:None', label: 'None' }, { value: 'arm:Placebo', label: "Placebo (not one of the design's arms)" }]));
  });
});

describe('lossless editing: what cannot come back exactly is named, and recording it is a stated choice', () => {
  it('a recorded key the form has no field for is named, and no action is pre-selected', () => {
    const d = drawer(DOSE_FORM, { ...BOIN, colour: 'red' });
    expect(d.note).toMatch(/colour: recorded "red"; this form would drop it/);
    const action = d.fields.find((f) => f.key === 'action')!;
    expect(action.default).toBe('');
    expect(action.options!.map((o) => (typeof o === 'string' ? o : o.value))).toEqual(['record-as-shown', 'clear']);
  });

  it('text a single-line input cannot hold is shown as the input would hold it, and named', () => {
    const d = drawer(ACCRUAL_FORM, { timeUnit: 'month', sites: [{ id: 'A', meanRate: 1 }], rateSource: 'survey\n2026' });
    expect(d.fields.find((f) => f.key === 'rateSource')!.default).toBe('survey2026');
    expect(d.note).toMatch(/rateSource: recorded "survey\\n2026"; this form would record "survey2026"/);
  });

  it('a recorded value no option shows is named rather than held out of sight', () => {
    const d = drawerFor(activityFields({ id: 'pk', location: 'garage' }), (v) => parseActivity(v, 'pk'), { activityId: 'pk', ...activityRecorded({ location: 'garage' }) }, null);
    expect(d.fields.find((f) => f.key === 'location')!.default).toBe('');
    expect(d.note).toMatch(/location: recorded "garage"; this form would record null/);
  });

  it('losses compares numbers as text and names additions', () => {
    expect(losses({ a: 1, b: [0.5] }, { a: 1, b: [0.5] })).toEqual([]);
    expect(losses({ a: '1' }, { a: 1 })).toEqual([]);
    expect(losses({ a: 1 }, { a: 1, b: 2 })).toEqual(['b: not recorded; this form would record 2']);
  });
});

describe('one activity', () => {
  const PK = { id: 'pk', name: 'PK', category: 'pk', location: 'home', specimen: { type: 'blood', volumeMl: 4, processing: 'spin', storage: '-80C' } };

  it('edits only the activity it was opened for: no activity picker, and the id is the drawer\'s', () => {
    const fields = activityFields(PK);
    expect(fields.map((f) => f.key)).not.toContain('activityId');
    const v = prefill(fields);
    expect(parseActivity(v, 'pk')).toEqual({ ok: true, value: { activityId: 'pk', ...activityRecorded(PK) } });
    // The ECG drawer's values never become PK's: they go to ECG, whatever is posted.
    const ecg = prefill(activityFields({ id: 'ecg', name: 'ECG', category: 'safety', location: 'site' }));
    expect(parseActivity(ecg, 'ecg')).toEqual({ ok: true, value: { activityId: 'ecg', location: 'site', specimen: null } });
  });

  it('"Not stated" and "None recorded" clear, a value records, a bad volume is refused', () => {
    const v = prefill(activityFields(PK));
    expect(parseActivity({ ...v, location: '', specimenType: '' }, 'pk')).toEqual({ ok: true, value: { activityId: 'pk', location: null, specimen: null } });
    expect(parseActivity({ ...v, volumeMl: 'four' }, 'pk')).toEqual({ ok: false, error: 'Volume is not a number: "four".' });
    expect(parseActivity({ ...v, volumeMl: '0' }, 'pk')).toEqual({ ok: false, error: 'Volume must be greater than 0: "0".' });
  });
});

describe('parity with the server', () => {
  it('the location and specimen vocabularies, and the MMRM visit bound, are the server\'s', () => {
    expect([...LOCATIONS]).toEqual([...SOA_ACTIVITY_LOCATIONS]);
    expect([...SPECIMENS]).toEqual([...SPECIMEN_TYPES]);
    expect(MMRM_MAX_VISITS).toBe(SERVER_MMRM_MAX_VISITS);
  });
});

describe('biospecimen view', () => {
  it('prints the worst 8-week window as a lower bound when the totals are lower bounds', () => {
    const view = (lower: boolean) => biospecimenView({ biospecimens: { status: 'partial', gaps: [], notes: [], specimens: [], bloodVolume: {
      totalScheduledMl: 40, totalUpperBoundMl: 40, totalsAreLowerBounds: lower, maxEightWeekScheduledMl: 40, maxDrawVisitsInAnyWeek: 1, referencePoints: [], meaning: '',
    } } });
    expect(view(true).note).toContain('Worst 8-week window: at least 40 mL (lower bound);');
    expect(view(false).note).toContain('Worst 8-week window: 40 mL;');
  });
});

/* ── The panel ─────────────────────────────────────────────────────────────── */

const SOA = {
  epochs: [], visits: [], cells: [],
  activities: [{ id: 'ecg', name: 'ECG', category: 'safety', location: 'site' }, { id: 'pk', name: 'PK', category: 'pk', location: 'home', specimen: { type: 'blood', volumeMl: 4 } }],
};
const PANEL_DESIGN = { id: 'sd_1', arms: [], safety: { dltDefinition: 'Grade 3+' }, statisticalPlan: { plannedAnalyses: [] }, scheduleOfActivities: SOA };

type Reply = () => Response | Promise<Response>;
const reply = (status: number, body: unknown): Reply => () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const designReply = (d: Obj) => reply(200, { design: d, validation: null });

function mount(replies: Reply[], canWrite = true) {
  const calls: { method: string; url: string; body: Obj | null }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { method?: string; body?: unknown } = {}) => {
    calls.push({ method: String(init.method ?? 'GET'), url: String(url), body: init.body ? JSON.parse(String(init.body)) : null });
    const next = replies.shift();
    if (!next) throw new Error(`unexpected request ${String(init.method)} ${String(url)}`);
    return next();
  }));
  const onError = vi.fn();
  const onToast = vi.fn();
  render(React.createElement(PlanningInputsPanel, { studyId: 'sd_1', canWrite, onError, onToast }));
  return { calls, onError, onToast };
}

const field = (dialog: HTMLElement, label: RegExp) => within(dialog).getByLabelText(label) as HTMLInputElement;
async function fillDose(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: 'Record Dose-escalation rules (BOIN)' }));
  const dialog = screen.getByRole('dialog');
  for (const [label, value] of [[/^Target DLT rate/, '0.8'], [/^Cohort size/, '3'], [/^Maximum patients/, '30'], [/^Dose levels/, 'DL1\nDL2'], [/^Reason for change/, 'Record the escalation rules']] as const) {
    fireEvent.change(field(dialog, label), { target: { value } });
  }
  return dialog;
}
const submitDrawer = (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole('button', { name: /Record$/ }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the planning-inputs panel', () => {
  it('a design that cannot be read is an alert, never an empty panel', async () => {
    mount([reply(500, { error: 'INTERNAL_ERROR' })]);
    expect((await screen.findByRole('alert')).textContent).toMatch(/^The design could not be read, so its planning inputs are not shown\./);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a refused write keeps the drawer open and reports the server\'s own details, framed as nothing written', async () => {
    const { calls, onError, onToast } = mount([designReply(PANEL_DESIGN), reply(400, { error: 'INVALID_PLANNING_INPUT', details: ['value.targetToxicity: the BOIN boundaries cannot be computed'] })]);
    submitDrawer(await fillDose());
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError).toHaveBeenCalledWith('Dose-escalation rules (BOIN) was not recorded — The server refused these values: value.targetToxicity: the BOIN boundaries cannot be computed. Nothing was written.');
    expect(onToast).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(calls.map((c) => c.method)).toEqual(['GET', 'POST']);
  });

  it('a successful write carries the block as read, and the badge says "recorded" only after the design is re-read', async () => {
    let release: () => void = () => undefined;
    const reread = new Promise<void>((r) => { release = r; });
    const recorded = { ...PANEL_DESIGN, safety: { ...PANEL_DESIGN.safety, doseEscalation: { method: 'boin' } } };
    const { calls, onToast } = mount([designReply(PANEL_DESIGN), reply(200, { studyId: 'sd_1' }), async () => { await reread; return designReply(recorded)(); }]);
    submitDrawer(await fillDose());
    await waitFor(() => expect(onToast).toHaveBeenCalledWith('Dose-escalation rules (BOIN) recorded on the design.'));
    expect(calls[1]).toMatchObject({ method: 'POST', url: '/api/study-design/sd_1/planning', body: { block: 'doseEscalation', expected: null, reason: 'Record the escalation rules', value: { targetToxicity: 0.8, cohortSize: 3 } } });
    const row = screen.getByText('Dose-escalation rules (BOIN)', { selector: '.pd-kv-k' }).parentElement!;
    expect(within(row).getByText('Not Recorded')).toBeTruthy();
    release();
    await waitFor(() => expect(within(row).getByText('Recorded')).toBeTruthy());
    expect(calls.map((c) => c.method)).toEqual(['GET', 'POST', 'GET']);
  });

  it('a block another author wrote in between is refused: the drawer closes and the design is re-read', async () => {
    const { calls, onError } = mount([designReply(PANEL_DESIGN), reply(409, { error: 'STALE_BLOCK', detail: 'This block changed after it was read.' }), designReply(PANEL_DESIGN)]);
    submitDrawer(await fillDose());
    await waitFor(() => expect(calls.length).toBe(3));
    expect(onError).toHaveBeenCalledWith('Dose-escalation rules (BOIN) was not recorded — This block changed after it was read. Nothing was written.');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a request that did not complete is not reported as nothing written; the design is re-read', async () => {
    const { calls, onError } = mount([designReply(PANEL_DESIGN), () => { throw new TypeError('Failed to fetch'); }, designReply(PANEL_DESIGN)]);
    submitDrawer(await fillDose());
    await waitFor(() => expect(calls.length).toBe(3));
    const message = onError.mock.calls[0][0] as string;
    expect(message).toMatch(/did not complete \(Failed to fetch\), so whether it was recorded is not known/);
    expect(message).not.toMatch(/Nothing was written/);
  });

  it('an activity drawer posts for its own activity, with what it recorded as the precondition', async () => {
    const { calls } = mount([designReply(PANEL_DESIGN), reply(200, {}), designReply(PANEL_DESIGN)]);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit PK location and specimen' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByLabelText(/^Activity/)).toBeNull();
    fireEvent.change(field(dialog, /^Reason for change/), { target: { value: 'Move the PK draw to site' } });
    fireEvent.change(field(dialog, /^Where it is performed/), { target: { value: 'site' } });
    submitDrawer(dialog);
    await waitFor(() => expect(calls.length).toBe(3));
    expect(calls[1].body).toEqual({
      block: 'activityAttributes', reason: 'Move the PK draw to site',
      value: { activityId: 'pk', location: 'site', specimen: { type: 'blood', volumeMl: 4 } },
      expected: { location: 'home', specimen: { type: 'blood', volumeMl: 4 } },
    });
  });

  it('a viewer\'s buttons name their target and say why they are disabled; no Schedule of Activities is stated', async () => {
    mount([designReply({ ...PANEL_DESIGN, scheduleOfActivities: undefined })], false);
    const btn = await screen.findByRole('button', { name: 'Record Site accrual plan' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.getAttribute('title')).toBe('A writing role is required to record planning inputs.');
    expect(screen.getByText(/This design records no Schedule of Activities, so no activity location or specimen can be recorded\./)).toBeTruthy();
  });
});
