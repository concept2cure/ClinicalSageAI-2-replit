/**
 * Planning-input forms — the parsers between the governed drawer's strings
 * and the block the server validates.
 *
 * What the suite holds: a value that does not parse is refused with its label
 * (and its line, for list fields), never coerced; a blank optional field is
 * left out, never defaulted; "Clear" sends null; the forms prefill from what
 * the design records, and parsing the prefill gives back the same block (so
 * editing is lossless); "none" states there is no shared control.
 */
import { describe, expect, it } from 'vitest';

import { ACCRUAL_FORM, DOSE_FORM, MMRM_FORM, withGovernance } from '../surfaces/planningInputForms';
import { EXTERNAL_FORM, MASTER_FORM, activityFields, parseActivity } from '../surfaces/planningStructureForms';

/** The drawer's initial values: each field's default, as C2CForm seeds them. */
function prefill(fields: { key: string; default?: string }[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, f.default ?? '']));
}

const BOIN = { method: 'boin', targetToxicity: 0.3, doseLevels: [{ label: 'DL1', dose: '10 mg' }, { label: 'DL2' }], cohortSize: 3, maxSampleSize: 30, startingDoseIndex: 0 };

describe('dose escalation', () => {
  it('round-trips: the prefill of a recorded block parses back to the same block', () => {
    const v = prefill(withGovernance(DOSE_FORM.fields(BOIN)));
    expect(DOSE_FORM.parse(v)).toEqual({ ok: true, value: BOIN });
  });

  it('refuses a non-number with its label, and a starting dose that is not a level', () => {
    const v = { ...prefill(withGovernance(DOSE_FORM.fields(BOIN))), targetToxicity: 'thirty percent' };
    expect(DOSE_FORM.parse(v)).toEqual({ ok: false, error: 'Target DLT rate is not a number: "thirty percent".' });
    const w = { ...prefill(withGovernance(DOSE_FORM.fields(BOIN))), startingDose: 'DL9' };
    expect(DOSE_FORM.parse(w)).toEqual({ ok: false, error: 'Starting dose "DL9" is not one of the dose levels.' });
  });

  it('leaves a blank optional field out rather than defaulting it', () => {
    const v = prefill(withGovernance(DOSE_FORM.fields(BOIN)));
    const parsed = DOSE_FORM.parse(v) as { ok: true; value: Record<string, unknown> };
    expect(parsed.value).not.toHaveProperty('eliminationThreshold');
    expect(parsed.value).not.toHaveProperty('stopWhenAtDoseN');
  });

  it('"Clear" sends null', () => {
    expect(DOSE_FORM.parse({ action: 'clear' })).toEqual({ ok: true, value: null });
  });
});

describe('accrual plan and MMRM', () => {
  it('reports a bad site line by number, and round-trips a recorded plan', () => {
    const plan = { timeUnit: 'month', sites: [{ id: 'US-01', country: 'US', meanRate: 1.5, rateCv: 0.5, activationTime: 0 }, { id: 'DE-01', meanRate: 0.8 }], rateSource: 'feasibility' };
    expect(ACCRUAL_FORM.parse(prefill(withGovernance(ACCRUAL_FORM.fields(plan))))).toEqual({ ok: true, value: plan });
    const bad = { ...prefill(withGovernance(ACCRUAL_FORM.fields(plan))), sites: 'US-01 | US | fast' };
    expect(ACCRUAL_FORM.parse(bad)).toEqual({ ok: false, error: 'Sites, line 1: mean rate is not a number: "fast".' });
  });

  it('parses MMRM retention as a list and refuses a bad entry by position', () => {
    const m = { endpointName: 'HbA1c', visits: 3, covariance: 'ar1', rho: 0.6, sigma: 1.1, delta: 0.4, retention: [0.95, 0.9, 0.85], source: 'phase 2' };
    expect(MMRM_FORM.parse(prefill(withGovernance(MMRM_FORM.fields(m))))).toEqual({ ok: true, value: m });
    const bad = { ...prefill(withGovernance(MMRM_FORM.fields(m))), retention: '0.95, x, 0.85' };
    expect(MMRM_FORM.parse(bad)).toEqual({ ok: false, error: 'Retention value 2 is not a number: "x".' });
  });
});

describe('external control and master protocol', () => {
  it('round-trips an external-control plan, keeping "not stated" as absent', () => {
    const ec = { source: 'registry', endpointName: '6MWD', historical: { n: 120, mean: -25, se: 4 }, method: 'power_prior', a0: 0.5, plannedConcurrentControlN: 30, assumedSd: 40, tippingPointAnalysisPlanned: true };
    const parsed = EXTERNAL_FORM.parse(prefill(withGovernance(EXTERNAL_FORM.fields(ec))));
    expect(parsed).toEqual({ ok: true, value: ec });
    expect((parsed as { value: Record<string, unknown> }).value).not.toHaveProperty('covariateBalancePlanned');
  });

  it('parses sub-studies by line, "none" states no shared control, and a line with no arm is refused', () => {
    const v = {
      action: 'record', reason: 'x',
      subStudies: 'S1 | KRAS | KRAS G12C NSCLC | Drug A, Docetaxel | KRAS G12C | NGS | PFS HR < 1\nS2 | MET | METex14 NSCLC | Drug B',
      sharedControlArm: 'none', nonConcurrentControls: 'not_used', armAdditionProcedure: '', armDroppingRules: '', multiplicityAcrossSubStudies: '',
    };
    const parsed = MASTER_FORM.parse(v) as { ok: true; value: { subStudies: unknown[]; sharedControlArm: unknown } };
    expect(parsed.value.sharedControlArm).toBeNull();
    expect(parsed.value.subStudies).toEqual([
      { id: 'S1', name: 'KRAS', population: 'KRAS G12C NSCLC', arms: ['Drug A', 'Docetaxel'], biomarker: 'KRAS G12C', biomarkerAssay: 'NGS', decisionRule: 'PFS HR < 1' },
      { id: 'S2', name: 'MET', population: 'METex14 NSCLC', arms: ['Drug B'] },
    ]);
    expect(MASTER_FORM.parse({ ...v, subStudies: 'S3 | X | pop | ' })).toEqual({ ok: false, error: 'Sub-studies, line 1: name at least one arm.' });
  });
});

describe('one activity', () => {
  it('prefills the selected activity; "Not stated" and "None recorded" clear, a value records', () => {
    const acts = [{ id: 'pk', name: 'PK', category: 'pk', location: 'home', specimen: { type: 'blood', volumeMl: 4 } }];
    const v = prefill(activityFields(acts, 'pk'));
    expect(v).toMatchObject({ activityId: 'pk', location: 'home', specimenType: 'blood', volumeMl: '4' });
    expect(parseActivity(v)).toEqual({ ok: true, value: { activityId: 'pk', location: 'home', specimen: { type: 'blood', volumeMl: 4 } } });
    expect(parseActivity({ ...v, location: '', specimenType: '' })).toEqual({ ok: true, value: { activityId: 'pk', location: null, specimen: null } });
    expect(parseActivity({ ...v, volumeMl: 'four' })).toEqual({ ok: false, error: 'Volume is not a number: "four".' });
  });
});
