/**
 * Amendment substantiality — EU CTR 536/2014 Article 16, derived rather than
 * declared.
 *
 * The existing `classifyAmendmentImpact` takes the sponsor's declared type as
 * an input, so it cannot disagree with it. These tests are mostly about the
 * ways this module could give a sponsor a dangerous answer:
 *
 *   • saying "non-substantial" at all;
 *   • reporting an unassessable field as unchanged;
 *   • agreeing with a declaration the evidence contradicts;
 *   • inventing a threshold the regulation does not set.
 */
import { describe, it, expect } from 'vitest';

import { diffDesigns, changedFields, deltaIsFullyComparedAndClean } from '../design-delta';
import { assessSubstantiality, type SubstantialityInput } from '../substantiality';
import type { StudyDesign } from '../../study-design/study-design-types';
import type { BurdenDelta } from '../../study-design/burden-delta';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** A design complete enough that every indicator is comparable. */
function full(over: Partial<StudyDesign> = {}): StudyDesign {
  return {
    id: 'sd_1',
    title: 'BX-204 pivotal',
    phase: '3',
    indication: 'Type 2 diabetes',
    targetRegions: ['US', 'EU'],
    objectives: [],
    estimands: [],
    endpoints: [
      { name: 'HbA1c change at week 24', role: 'primary', type: 'continuous', definition: 'Change from baseline', timepoint: 'week 24' },
    ],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: {
      targetDescription: 'Adults with T2DM',
      analysisPopulations: [],
      eligibility: [{ type: 'inclusion', text: 'HbA1c 7.0-10.5%' }],
    },
    arms: [
      { name: 'BX-204', interventions: [{ name: 'BX-204', role: 'investigational', dose: '10 mg', route: 'oral', duration: '24 weeks' }] },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo', dose: '0 mg', route: 'oral', duration: '24 weeks' }] },
    ],
    randomization: { ratio: [1, 1], allocationMethod: 'block', blinding: 'double' },
    statisticalPlan: { alpha: 0.05, power: 0.9, plannedSampleSize: 600, plannedAnalyses: [{ endpointName: 'HbA1c change at week 24', method: 'MMRM' }] },
    safety: { stoppingRules: 'Stop on confirmed DKA.' },
    ...over,
  };
}

/** A design that records almost nothing — the "nothing to compare" case. */
function sparse(): StudyDesign {
  return {
    title: 'Untitled',
    phase: '2',
    indication: '',
    objectives: [],
    estimands: [],
    endpoints: [],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: { targetDescription: '', analysisPopulations: [], eligibility: [] },
    arms: [],
    statisticalPlan: { plannedAnalyses: [] },
  };
}

function burden(over: Partial<BurdenDelta> = {}): BurdenDelta {
  return {
    comparable: true,
    direction: 'unchanged',
    deltas: [],
    addedVisits: [], removedVisits: [], changedVisits: [],
    addedAssessments: [], removedAssessments: [], changedAssessments: [],
    findings: [],
    basis: 'test',
    ...over,
  };
}

function input(over: Partial<SubstantialityInput> = {}): SubstantialityInput {
  return {
    declared: { amendmentType: 'major', affectsConsent: true, affectsRisk: true },
    designDelta: diffDesigns(full(), full()),
    burdenDelta: burden(),
    regions: ['US', 'EU'],
    ...over,
  };
}

// ─── The rule the module exists to hold ──────────────────────────────────────

describe('substantiality — never says non-substantial', () => {
  it('has no verdict value that asserts non-substantiality, even when nothing fired', () => {
    const a = assessSubstantiality(input());

    expect(a.counts.indicated).toBe(0);
    expect(a.verdict).toBe('no_indicator_found');
    expect(JSON.stringify(a)).not.toMatch(/non[_-]substantial["']|"non_substantial"/i);
  });

  it('says in words that a clean comparison is not a determination', () => {
    const a = assessSubstantiality(input());

    expect(a.verdictReason).toMatch(/NOT a determination of non-substantiality/i);
    expect(a.verdictReason).toMatch(/sponsor/i);
  });

  it('reports undetermined, not clean, when something material could not be compared', () => {
    const a = assessSubstantiality(input({ designDelta: diffDesigns(sparse(), sparse()) }));

    expect(a.verdict).toBe('undetermined');
    expect(a.counts.notAssessed).toBeGreaterThan(0);
    expect(a.verdictReason).toMatch(/NOT a determination of non-substantiality/i);
  });

  it('reports every indicator as not-assessed when there is no second version at all', () => {
    const a = assessSubstantiality(input({ designDelta: null, burdenDelta: null }));

    expect(a.verdict).toBe('undetermined');
    expect(a.indicators.every((i) => i.status === 'not_assessed')).toBe(true);
    expect(a.indicators.some((i) => i.status === 'not_indicated')).toBe(false);
  });
});

// ─── Absent is not unchanged ─────────────────────────────────────────────────

describe('design delta — absent on both sides is unknown, not unchanged', () => {
  it('does not report two designs with no safety section as having the same safety design', () => {
    const d = diffDesigns(sparse(), sparse());

    expect(d.safety).toBe('unknown');
    expect(d.notComparable).toContain('safety');
    expect(deltaIsFullyComparedAndClean(d)).toBe(false);
  });

  it('reports a genuinely identical recorded field as unchanged', () => {
    const d = diffDesigns(full(), full());

    expect(d.safety).toBe('unchanged');
    expect(d.primaryEndpoint).toBe('unchanged');
    expect(d.notComparable).toEqual([]);
    expect(deltaIsFullyComparedAndClean(d)).toBe(true);
  });

  it('carries the not-assessed reason through to the indicator', () => {
    const a = assessSubstantiality(input({ designDelta: diffDesigns(sparse(), sparse()) }));
    const safety = a.indicators.find((i) => i.id === 'eu-ctr-safety-design');

    expect(safety?.status).toBe('not_assessed');
    expect(safety?.message).toMatch(/has not shown that its stopping rules are unchanged/);
  });
});

// ─── The indicators ──────────────────────────────────────────────────────────

describe('substantiality — indicators', () => {
  it('fires on a changed primary endpoint', () => {
    const after = full({ endpoints: [{ name: 'Fasting plasma glucose at week 24', role: 'primary', type: 'continuous', definition: 'Change from baseline' }] });
    const a = assessSubstantiality(input({ designDelta: diffDesigns(full(), after) }));

    expect(a.verdict).toBe('substantial');
    expect(a.indicators.find((i) => i.id === 'eu-ctr-primary-endpoint')?.status).toBe('indicated');
    expect(a.changed).toContain('primary endpoint');
  });

  it('fires on changed eligibility', () => {
    const after = full({ population: { targetDescription: 'Adults with T2DM', analysisPopulations: [], eligibility: [{ type: 'inclusion', text: 'HbA1c 6.5-12.0%' }] } });
    const a = assessSubstantiality(input({ designDelta: diffDesigns(full(), after) }));

    expect(a.indicators.find((i) => i.id === 'eu-ctr-eligibility')?.status).toBe('indicated');
  });

  it('refuses to read a dose increase out of free text, and says so', () => {
    const after = full({ arms: [
      { name: 'BX-204', interventions: [{ name: 'BX-204', role: 'investigational', dose: '20 mg', route: 'oral', duration: '24 weeks' }] },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo', dose: '0 mg', route: 'oral', duration: '24 weeks' }] },
    ] });
    const a = assessSubstantiality(input({ designDelta: diffDesigns(full(), after) }));
    const i = a.indicators.find((x) => x.id === 'eu-ctr-intervention');

    expect(i?.status).toBe('indicated');
    expect(i?.message).toMatch(/DIRECTION of the change is not determined/);
    expect(i?.message).not.toMatch(/increase[sd]? from/i);
  });

  it('fires on increased participant burden and names the scale', () => {
    const a = assessSubstantiality(input({
      burdenDelta: burden({
        direction: 'increased',
        deltas: [{ measure: 'procedureCount', before: 40, after: 61, delta: 21, status: 'computed' }],
      }),
    }));
    const i = a.indicators.find((x) => x.id === 'eu-ctr-participant-burden');

    expect(i?.status).toBe('indicated');
    expect(i?.message).toMatch(/from 40 to 61/);
  });

  it('treats an incomparable burden delta as not assessed, not as unchanged burden', () => {
    const a = assessSubstantiality(input({ burdenDelta: burden({ comparable: false, direction: 'unknown' }) }));
    const i = a.indicators.find((x) => x.id === 'eu-ctr-participant-burden');

    expect(i?.status).toBe('not_assessed');
    expect(i?.message).toMatch(/not a finding that burden is unchanged/);
  });

  it('does not treat a burden decrease as a reason to skip the determination', () => {
    const a = assessSubstantiality(input({ burdenDelta: burden({ direction: 'decreased' }) }));
    const i = a.indicators.find((x) => x.id === 'eu-ctr-participant-burden');

    expect(i?.status).toBe('not_indicated');
    expect(i?.message).toMatch(/not as a reason to skip/);
  });
});

// ─── No invented thresholds ──────────────────────────────────────────────────

describe('substantiality — 21 CFR 312.30(b)(1)(i) sample size', () => {
  it('reports the magnitude and explicitly declines to decide significance', () => {
    const after = full({ statisticalPlan: { alpha: 0.05, power: 0.9, plannedSampleSize: 900, plannedAnalyses: [{ endpointName: 'HbA1c change at week 24', method: 'MMRM' }] } });
    const a = assessSubstantiality(input({ designDelta: diffDesigns(full(), after) }));
    const i = a.indicators.find((x) => x.id === 'us-ind-312-30-subject-number');

    expect(i?.status).toBe('indicated');
    expect(i?.message).toMatch(/from 600 to 900/);
    expect(i?.message).toMatch(/leaves to the sponsor; it is not decided here/);
    // No invented percentage or cut-off anywhere in the indicator.
    expect(i?.message).not.toMatch(/\d+\s*%/);
    expect(i?.action).toMatch(/sets no numeric threshold/);
  });

  it('is not assessed when either version omits the planned sample size', () => {
    const after = full({ statisticalPlan: { alpha: 0.05, power: 0.9, plannedAnalyses: [] } });
    const a = assessSubstantiality(input({ designDelta: diffDesigns(full(), after) }));

    expect(a.indicators.find((x) => x.id === 'us-ind-312-30-subject-number')?.status).toBe('not_assessed');
  });
});

// ─── The declaration can be contradicted ─────────────────────────────────────

describe('substantiality — reconciling the sponsor’s declaration', () => {
  const changedEndpoint = () => diffDesigns(full(), full({ endpoints: [{ name: 'FPG at week 24', role: 'primary', type: 'continuous', definition: 'Change from baseline' }] }));

  it('contradicts an administrative declaration when the design changed', () => {
    const a = assessSubstantiality(input({
      declared: { amendmentType: 'administrative', affectsConsent: false, affectsRisk: false },
      designDelta: changedEndpoint(),
    }));

    expect(a.declarationConflict).toMatch(/declared administrative/);
    expect(a.declarationConflict).toMatch(/primary endpoint/);
  });

  it('contradicts a minor declaration by naming the expedited-review basis', () => {
    const a = assessSubstantiality(input({
      declared: { amendmentType: 'minor', affectsConsent: false, affectsRisk: false },
      designDelta: changedEndpoint(),
    }));

    expect(a.declarationConflict).toMatch(/46\.110/);
  });

  it('contradicts "affects neither consent nor risk" when eligibility changed', () => {
    const after = full({ population: { targetDescription: 'x', analysisPopulations: [], eligibility: [{ type: 'exclusion', text: 'Pregnancy' }] } });
    const a = assessSubstantiality(input({
      declared: { amendmentType: 'major', affectsConsent: false, affectsRisk: false },
      designDelta: diffDesigns(full(), after),
    }));

    expect(a.declarationConflict).toMatch(/neither consent nor risk/);
  });

  it('raises no conflict when the declaration matches the evidence', () => {
    const a = assessSubstantiality(input({
      declared: { amendmentType: 'major', affectsConsent: true, affectsRisk: true },
      designDelta: changedEndpoint(),
    }));

    expect(a.declarationConflict).toBeNull();
  });

  it('raises no conflict when nothing fired, whatever was declared', () => {
    const a = assessSubstantiality(input({ declared: { amendmentType: 'administrative', affectsConsent: false, affectsRisk: false } }));

    expect(a.declarationConflict).toBeNull();
  });
});

// ─── Unrecorded regions do not remove a trial from the EU ────────────────────

describe('substantiality — region scope', () => {
  it('evaluates the EU indicators anyway when no region is recorded, and says why', () => {
    const a = assessSubstantiality(input({ regions: null }));
    const note = a.indicators.find((i) => i.id === 'eu-ctr-scope-unrecorded');

    expect(note?.status).toBe('not_assessed');
    expect(note?.message).toMatch(/not a record that the trial is outside the EU/);
    expect(a.indicators.some((i) => i.id === 'eu-ctr-primary-endpoint')).toBe(true);
  });

  it('adds no scope note when regions are recorded', () => {
    const a = assessSubstantiality(input({ regions: ['EU'] }));

    expect(a.indicators.some((i) => i.id === 'eu-ctr-scope-unrecorded')).toBe(false);
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('determinism', () => {
  it('gives byte-identical output for the same input', () => {
    const i = input();
    expect(JSON.stringify(assessSubstantiality(i))).toBe(JSON.stringify(assessSubstantiality(i)));
  });

  it('diffs designs identically regardless of arm or endpoint ordering in the set comparison', () => {
    const a = full();
    const b = full({ endpoints: [...full().endpoints].reverse() });
    expect(diffDesigns(a, b).endpointSet).toBe('unchanged');
  });

  it('names changed fields in a stable order', () => {
    const after = full({ phase: '2', population: { targetDescription: 'x', analysisPopulations: [], eligibility: [] } });
    expect(changedFields(diffDesigns(full(), after))).toEqual(['eligibility criteria', 'phase']);
  });
});
