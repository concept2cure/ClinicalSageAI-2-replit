/**
 * The industry-gap projections, as the Protocol Development pane shows them.
 *
 * The normalizers only re-shape what the engine returned; the properties that
 * matter are the ones a re-shape can break without anyone noticing:
 *
 *  - Absent is printed as absent. A null off-site share reads "not assessed",
 *    never 0%; an `unstated` location stays `unstated`; a SPIRIT row that is
 *    `not_assessable` is shown with that status, not as missing or met.
 *  - Nothing is computed. No pane carries a percentage the engine did not
 *    return (`percent` is null for all of these), and the SPIRIT summary is the
 *    engine's four counts, verbatim.
 *  - The trial-schema SVG is handed over as a figure (rendered as an <img>
 *    data URI by the pane), and a schema the engine could not draw has none.
 *  - Default CtQ ratings are labelled as seeds.
 */
import { describe, expect, it } from 'vitest';

import {
  biospecimenView, ctqView, dctView, doseEscalationView, enrollmentView, externalControlView, INDUSTRY_PROJECTIONS, interimOcView, mmrmView, multiplicityView, spiritView,
  trialSchemaView, usdmView, whoIctrpView,
} from '../surfaces/ProtocolDevIndustryProjections';

describe('trial schema', () => {
  const payload = {
    trialSchema: {
      status: 'rendered',
      gaps: [],
      basis: 'ICH M11 §1.2 Trial Schema',
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><title>t</title></svg>',
      model: {
        title: 'Study X',
        epochs: [{ id: 'e1', name: 'Screening', kind: 'screening', milestones: [{ name: 'V1', studyDay: -28, isBaseline: false }, { name: 'V2', isBaseline: true }] }],
        randomization: { present: true, ratio: [2, 1], blinding: 'double' },
        arms: [{ name: 'A', label: 'A: Drug X 10 mg', interventions: [] }, { name: 'B', label: 'B (no intervention recorded)', interventions: [] }],
        notDrawn: ['unscheduled visit U1'],
      },
    },
  };

  it('hands the SVG over as a figure and prints a missing study day as not recorded', () => {
    const v = trialSchemaView(payload);
    expect(v.figure?.svg).toContain('<svg');
    expect(v.figure?.alt).toBe('Trial schema: Study X');
    expect(v.entries[0].text).toContain('V2 (study day not recorded) — baseline');
    expect(v.entries.map((e) => e.label)).toEqual(['Epoch — Screening', 'Arm — A', 'Arm — B']);
    expect(v.entries[2].text).toContain('(no intervention recorded)');
    expect(v.note).toContain('Randomised 2:1, double blind.');
    expect(v.note).toContain('Not drawn: unscheduled visit U1');
    expect(v.percent).toBeNull();
  });

  it('a schema the engine could not draw has no figure and carries its gaps', () => {
    const v = trialSchemaView({ trialSchema: { status: 'missing', gaps: ['no Schedule of Activities'], svg: null, model: { randomization: { present: false } } } });
    expect(v.figure).toBeUndefined();
    expect(v.status).toBe('missing');
    expect(v.gaps).toEqual(['no Schedule of Activities']);
    expect(v.note).toContain('records no randomisation');
  });
});

describe('SPIRIT 2013', () => {
  it('prints the engine\'s four counts verbatim and keeps not_assessable as its own status', () => {
    const v = spiritView({
      spirit: {
        basis: 'SPIRIT 2013',
        documentProvided: false,
        summary: { met: 10, partial: 3, missing: 7, notAssessable: 31, total: 51 },
        items: [{ item: '4', title: 'Funding', status: 'not_assessable', evidence: [], gap: 'only a protocol section can evidence this' }],
      },
    });
    expect(v.note).toContain('met 10, partial 3, missing 7, not assessable 31, of 51 checklist rows.');
    expect(v.note).toContain('not assessable here, not missing');
    expect(v.entries[0]).toMatchObject({ label: '4. Funding', status: 'not_assessable' });
    expect(v.percent).toBeNull();
  });

  it('never prints a count the engine did not return', () => {
    const v = spiritView({ spirit: { summary: {} , items: [] } });
    expect(v.note).toContain('met not recorded');
    expect(v.note).not.toMatch(/met 0/);
  });
});

describe('critical-to-quality factors', () => {
  it('labels every rating a seed and names the design element it came from', () => {
    const v = ctqView({
      ctq: {
        basis: 'ICH E6(R3)',
        notAssessed: ['no Schedule of Activities'],
        factors: [{ category: 'efficacy', ctqFactor: 'Primary endpoint assessment', riskDescription: 'r', likelihood: 3, impact: 4, isCritical: true, mitigation: 'm', ratingSource: 'default_seed', derivedFrom: { kind: 'endpoint', ref: 'HbA1c change' } }],
      },
    });
    expect(v.entries[0].text).toContain('Derived from endpoint: HbA1c change');
    expect(v.entries[0].text).toContain('(default_seed)');
    expect(v.note).toContain('default seed');
    expect(v.gaps).toEqual(['no Schedule of Activities']);
  });
});

describe('decentralised elements', () => {
  it('a null off-site share reads "not assessed", never 0%', () => {
    const v = dctView({
      dctProfile: {
        basis: 'FDA DCT 2024',
        notAssessed: ['no activity has a stated location'],
        measures: { activitiesTotal: 4, activitiesWithStatedLocation: 0, offSiteShare: { value: null, numerator: 0, denominator: 0 }, visitsFullyOffSiteCapable: [] },
        findings: [],
        activities: [{ activityId: 'a1', name: 'ECG', category: 'safety', location: 'unstated' }],
      },
    });
    expect(v.note).toContain('Off-site share not assessed');
    expect(v.note).not.toMatch(/0%/);
    expect(v.entries[0]).toMatchObject({ label: 'ECG', status: 'unstated' });
    expect(v.percent).toBeNull();
  });

  it('prints a stated share beside its numerator and denominator, and each finding', () => {
    const v = dctView({
      dctProfile: {
        measures: { activitiesTotal: 8, activitiesWithStatedLocation: 4, offSiteShare: { value: 0.75, numerator: 3, denominator: 4 }, visitsFullyOffSiteCapable: ['V3'] },
        findings: [{ severity: 'warning', code: 'DCT-IMP-HOME', message: 'IMP administered at home', activityIds: ['a_imp'] }],
        activities: [],
      },
    });
    expect(v.note).toContain('3 of 4 activities with a stated location (75%)');
    expect(v.note).toContain('V3');
    expect(v.entries[0]).toMatchObject({ label: 'DCT-IMP-HOME', status: 'warning' });
    expect(v.entries[0].text).toContain('Activities: a_imp');
  });
});

describe('BOIN dose escalation', () => {
  it('prints every parameter with its source, so an engine default never reads as a sponsor decision', () => {
    const v = doseEscalationView({
      doseEscalation: {
        status: 'rendered', gaps: [], basis: 'BOIN',
        applicability: { applicable: true, reasons: ['phase FIH is a dose-escalation phase'] },
        parameters: {
          targetToxicity: 0.3, cohortSize: 3, maxSampleSize: 30, stopWhenAtDoseN: 12,
          phi1: { value: 0.18, source: 'engine default' }, phi2: { value: 0.42, source: 'engine default' },
          eliminationThreshold: { value: 0.9, source: 'design' }, startingDose: { index: 0, label: 'DL1' },
        },
        boundaries: { lambdaE: 0.236, lambdaD: 0.358 },
        decisionTable: [{ n: 3, escalateIfAtMost: 0, deescalateIfAtLeast: 2, eliminateIfAtLeast: 3 }, { n: 1, escalateIfAtMost: 0, deescalateIfAtLeast: 1, eliminateIfAtLeast: null }],
        mtdSelection: 'isotonic rule',
      },
    });
    expect(v.note).toContain('φ1 0.18 (engine default)');
    expect(v.note).toContain('elimination threshold 0.9 (design)');
    expect(v.note).toContain('λe = 0.236');
    expect(v.entries[0].text).toBe('Escalate if DLTs ≤ 0 · de-escalate if ≥ 2 · eliminate if ≥ 3');
    expect(v.entries[1].text).toContain('no DLT count eliminates at this n');
  });

  it('a missing escalation design shows its gap and no table', () => {
    const v = doseEscalationView({ doseEscalation: { status: 'missing', gaps: ['the design states no dose-escalation rules'], parameters: null, boundaries: null, decisionTable: [], applicability: { reasons: [] } } });
    expect(v.status).toBe('missing');
    expect(v.gaps).toEqual(['the design states no dose-escalation rules']);
    expect(v.entries).toEqual([]);
  });
});

describe('enrollment forecast', () => {
  it('a target the sites cannot reach reads "not reached", never a time', () => {
    const v = enrollmentView({
      enrollment: {
        status: 'partial', gaps: ['the recorded sites cannot reach the planned sample size'], note: 'n',
        sites: { total: 1, byCountry: [{ country: 'US', sites: 1, meanRatePerUnit: 0 }] },
        forecast: { timeUnit: 'month', targetN: 60, median: null, p10: null, p90: null, probReached: 0, closedFormExpectedTime: null, nSim: 4000, seed: 1 },
      },
    });
    expect(v.note).toContain('Median not reached; 80% interval not reached to not reached.');
    expect(v.note).toContain('Probability of reaching the target: 0');
    expect(v.entries[0].text).toBe('1 site(s); combined mean rate 0 per month.');
  });

  it('with no accrual plan there is no forecast line, only the gap', () => {
    const v = enrollmentView({ enrollment: { status: 'missing', gaps: ['no accrual plan'], forecast: null, sites: null, note: null } });
    expect(v.note).toBe('');
    expect(v.gaps).toEqual(['no accrual plan']);
    expect(v.entries).toEqual([]);
  });
});

describe('USDM export', () => {
  it('prints the conformance status and reason verbatim — unverified stays unverified', () => {
    const v = usdmView({
      usdm: {
        conformance: { status: 'unverified', reason: 'The CDISC USDM JSON schema is not vendored.', standard: 'CDISC USDM v3' },
        unfilledUsdmEntities: ['Organization: no sponsor on the design'],
        unmappedDesignFields: ['safety.doseEscalation: no USDM home in this mapping'],
        study: { versions: [{ studyDesigns: [{ arms: [{ id: 'StudyArm_1', name: 'Drug X' }], epochs: [], encounters: [], activities: [], objectives: [{ id: 'Objective_1', text: 'Show superiority' }], estimands: [], studyInterventions: [] }] }] },
      },
    });
    expect(v.status).toBe('unverified');
    expect(v.note).toContain('Conformance unverified: The CDISC USDM JSON schema is not vendored.');
    expect(v.note).not.toMatch(/\bvalid\b|conformant|compliant/i);
    expect(v.gaps).toEqual(['Organization: no sponsor on the design']);
    expect(v.entries[0].text).toBe('StudyArm_1 — Drug X');
    expect(v.entries[1].text).toBe('None exported.');
    expect(v.entries[4].text).toBe('Objective_1 — Show superiority');
    expect(v.entries[7].gaps).toEqual(['safety.doseEscalation: no USDM home in this mapping']);
  });
});

describe('WHO registration data set', () => {
  it('prints each item with its status and the engine\'s gap, and says nothing was registered', () => {
    const v = whoIctrpView({
      whoIctrp: {
        basis: 'WHO TRDS v1.3.1',
        summary: { rendered: 6, partial: 3, missing: 15, total: 24 },
        items: [
          { number: 5, name: 'Primary Sponsor', status: 'missing', value: null, gap: 'not carried by the study design; supplied at registration' },
          { number: 19, name: 'Primary Outcome(s)', status: 'rendered', value: ['HbA1c change at week 24'] },
        ],
      },
    });
    expect(v.note).toContain('rendered 6, partial 3, missing 15, of 24 items');
    expect(v.note).toContain('nothing is submitted to any registry');
    expect(v.entries[0]).toMatchObject({ label: '5. Primary Sponsor', status: 'missing', text: '', gaps: ['not carried by the study design; supplied at registration'] });
    expect(v.entries[1].text).toBe('HbA1c change at week 24');
  });
});

describe('interim-analysis characteristics', () => {
  it('shows a recorded-vs-solved discrepancy as its own entry and a null power as not computed', () => {
    const v = interimOcView({
      interimOc: {
        status: 'partial', gaps: ['1 recorded efficacy boundary differs'], notes: [], schedule: [0.5, 1],
        discrepancies: [{ look: 1, recorded: 2.5, solved: 2.963, difference: -0.463 }],
        characteristics: {
          boundariesEvaluated: 'recorded', typeIError: 0.031, power: null,
          expectedInformationFraction: { underNull: 0.98, underAlternative: null }, expectedSampleSize: null,
          perLook: [{ look: 1, informationFraction: 0.5, efficacyBoundary: 2.5, futilityBoundary: null, efficacyStopUnderNull: 0.006, efficacyStopUnderAlternative: null }],
        },
      },
    });
    expect(v.note).toContain('Characteristics of the recorded boundaries: type I error 0.031; power not computed (alpha or power not recorded).');
    expect(v.entries[0]).toMatchObject({ status: 'discrepancy', text: 'Recorded 2.5 · solved 2.963 · difference -0.463' });
    expect(v.entries[1].text).toContain('P(stop for efficacy) 0.006 under H0');
  });
});

describe('MMRM sizing', () => {
  it('states a shortfall against the planned N, and prints nothing sized when nothing was', () => {
    const v = mmrmView({ mmrm: { status: 'partial', endpointName: 'HbA1c change', gaps: ['g'], sizing: { nPerArm: 180, nTotal: 360, alphaTwoSided: 0.05, achievedPower: 0.901, varianceFactor: 1.08, efficiencyVsCompleters: 1.09 }, plannedVsRequired: { planned: 300, required: 360, covered: false, shortfall: 60 }, soaVisitCount: 3 } });
    expect(v.note).toContain('Required: 180 per arm, 360 in total (two-sided alpha 0.05)');
    expect(v.note).toContain('The planned 300 is 60 below the requirement.');
    const none = mmrmView({ mmrm: { status: 'partial', endpointName: 'HbA1c change', gaps: ['the target power is not recorded'], sizing: null, plannedVsRequired: null, soaVisitCount: null } });
    expect(none.note).toBe('Endpoint: HbA1c change.');
    expect(none.gaps).toEqual(['the target power is not recorded']);
  });
});

describe('external-control plan', () => {
  it('lists each pre-specification element stated or not, and never shows a posterior', () => {
    const v = externalControlView({ externalControl: {
      status: 'partial', kind: 'hybrid', gaps: ['Tipping-point sensitivity analysis: not recorded'],
      borrowing: { method: 'power_prior', parameter: { name: 'a0', value: 0.5 }, effectiveHistoricalN: 60, borrowedPrecisionFraction: 0.35, plannedConcurrentSe: 7.3 },
      elements: [{ element: 'Tipping-point sensitivity analysis', stated: false, detail: 'not recorded' }],
    } });
    expect(v.note).toContain('power_prior (a0 = 0.5): effective historical N 60');
    expect(v.note).toContain('No posterior or treatment effect is computed at protocol stage.');
    expect(v.entries[0]).toMatchObject({ label: 'Tipping-point sensitivity analysis', status: 'not stated' });
  });
});

describe('multiplicity control', () => {
  it('prints both rates with their SE and the controlled verdict, never recomputed', () => {
    const v = multiplicityView({ multiplicity: {
      status: 'rendered', gaps: [], notes: ['independence caveat'], family: ['A', 'B'], method: 'holm', alpha: 0.05,
      procedure: { fwer: 0.0489, monteCarloSe: 0.0015, controlled: true }, unadjusted: { fwer: 0.0973, monteCarloSe: 0.0021 },
    } });
    expect(v.note).toContain('Named procedure: family-wise error 0.0489 (Monte Carlo SE 0.0015) — controlled at alpha.');
    expect(v.note).toContain('Each hypothesis at full alpha: family-wise error 0.0973 (Monte Carlo SE 0.0021).');
    expect(v.note).toContain('independence caveat');
    expect(v.entries.map((e) => e.label)).toEqual(['A', 'B']);
  });
});

describe('specimens and blood volume', () => {
  it('prints lower bounds as lower bounds and an unknown reference comparison as not known', () => {
    const v = biospecimenView({ biospecimens: {
      status: 'partial', gaps: ['g'], notes: [],
      specimens: [{ activityId: 'bm', name: 'Biomarker', specimen: null, unspecified: ['specimen type, volume, processing and storage'] }],
      bloodVolume: {
        totalScheduledMl: 28, totalUpperBoundMl: 32, totalsAreLowerBounds: true, maxEightWeekScheduledMl: null, maxDrawVisitsInAnyWeek: null,
        referencePoints: [{ appliesTo: 'healthy adults', eightWeekLimitMl: 550, exceededScheduled: null }], meaning: 'not safety limits',
      },
    } });
    expect(v.note).toContain('28 mL scheduled, up to 32 mL with conditional draws — LOWER BOUNDS');
    expect(v.note).toContain('Worst 8-week window: not computable');
    expect(v.note).toContain('Reference 550 mL / 8 weeks (healthy adults): not known.');
    expect(v.entries[0]).toMatchObject({ status: 'unspecified', gaps: ['specimen type, volume, processing and storage not specified'] });
  });
});

describe('the pane\'s projection list', () => {
  it('every industry projection points at a distinct engine path and never pre-computes a percentage', () => {
    const paths = INDUSTRY_PROJECTIONS.map((p) => p.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of INDUSTRY_PROJECTIONS) expect(p.normalize({}).percent, p.id).toBeNull();
  });
});
