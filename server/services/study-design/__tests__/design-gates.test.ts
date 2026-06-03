/**
 * Tests for the study-design gates and the defensibility report. Pure functions:
 * a clean baseline design clears every gate, and each mutation trips exactly the
 * finding it should, at the right severity. No DB, no AI, no RNG.
 */

import { describe, it, expect } from 'vitest';
import {
  estimandGate,
  endpointRedFlags,
  frameworkRules,
  multiplicityGate,
  powerRedFlags,
  runAllGates,
  type DesignFinding,
} from '../design-gates';
import { validateDesign } from '../design-validation';
import { type StudyDesign } from '../study-design-types';

/** A complete, defensible design that clears every gate (risk = low). */
function baseDesign(): StudyDesign {
  return {
    title: 'A Phase 3 study of Drug X in type 2 diabetes',
    phase: '3',
    indication: 'type 2 diabetes',
    productType: 'drug',
    objectives: [
      { level: 'primary', order: 1, text: 'Demonstrate superiority on HbA1c', endpointName: 'HbA1c change' },
    ],
    estimands: [
      {
        endpointName: 'HbA1c change',
        treatmentCondition: 'Drug X 10 mg daily versus placebo',
        population: 'all randomized patients (ITT)',
        variable: 'change from baseline in HbA1c at week 24',
        summaryMeasure: 'difference in means',
        strategy: 'treatment_policy',
        intercurrentEvents: [
          {
            name: 'rescue medication',
            strategy: 'treatment_policy',
            justification: 'rescue reflects the treatment-policy estimand',
          },
        ],
      },
    ],
    endpoints: [
      {
        name: 'HbA1c change',
        role: 'primary',
        type: 'continuous',
        definition: 'change from baseline in HbA1c at week 24',
        isSurrogate: false,
        regulatoryAcceptance: 'accepted_precedent',
      },
    ],
    framework: {
      inferentialFrame: 'superiority',
      structuralDesign: 'parallel_group',
      controlType: 'placebo',
    },
    population: {
      targetDescription: 'adults with type 2 diabetes inadequately controlled on metformin',
      analysisPopulations: [
        { kind: 'ITT', definition: 'all randomized patients', isPrimaryAnalysisSet: true },
        { kind: 'Safety', definition: 'all patients who received any study drug' },
      ],
      eligibility: [{ type: 'inclusion', text: 'HbA1c 7.0–10.0% at screening' }],
    },
    arms: [
      { name: 'Drug X', interventions: [{ name: 'Drug X', role: 'investigational', dose: '10 mg', route: 'oral' }] },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo' }] },
    ],
    randomization: { ratio: [1, 1], allocationMethod: 'stratified', blinding: 'double' },
    statisticalPlan: {
      alpha: 0.05,
      oneSided: false,
      power: 0.9,
      plannedSampleSize: 400,
      dropoutRate: 0.2,
      plannedAnalyses: [{ endpointName: 'HbA1c change', method: 'MMRM' }],
      multiplicity: { method: 'none' },
      sensitivityAnalysesSpecified: true,
      powerAssumptions: {
        effectSize: 0.4,
        priorPhaseObservedEffect: 0.5,
        historicalDropoutRate: 0.18,
        evidence: [{ kind: 'prior_data', source: 'Phase 2 NCT01234567' }],
      },
    },
  };
}

/** Clone the baseline so mutations stay isolated. */
function clone(d: StudyDesign): StudyDesign {
  return JSON.parse(JSON.stringify(d));
}

function codes(findings: DesignFinding[]): string[] {
  return findings.map(f => f.code);
}

describe('baseline design', () => {
  it('clears every gate', () => {
    expect(runAllGates(baseDesign())).toEqual([]);
  });

  it('validates as low risk and may advance', () => {
    const report = validateDesign(baseDesign());
    expect(report.riskLevel).toBe('low');
    expect(report.canAdvance).toBe(true);
    expect(report.blocksApproval).toBe(false);
    expect(report.counts).toEqual({ critical: 0, major: 0, minor: 0, info: 0 });
  });
});

describe('§2 estimand gate', () => {
  it('flags a primary endpoint with no estimand as critical', () => {
    const d = clone(baseDesign());
    d.estimands = [];
    const findings = estimandGate(d);
    expect(codes(findings)).toContain('EST-001');
    expect(findings.find(f => f.code === 'EST-001')?.severity).toBe('critical');
  });

  it('flags an incomplete estimand as major', () => {
    const d = clone(baseDesign());
    d.estimands[0].summaryMeasure = '';
    const findings = estimandGate(d);
    const est = findings.find(f => f.code === 'EST-002');
    expect(est?.severity).toBe('major');
    expect(est?.detail).toMatch(/summary measure/i);
  });

  it('surfaces a missing-rationale intercurrent event as a minor warning', () => {
    const d = clone(baseDesign());
    d.estimands[0].intercurrentEvents[0].justification = '';
    const findings = estimandGate(d);
    expect(codes(findings)).toContain('EST-003');
    expect(findings.find(f => f.code === 'EST-003')?.severity).toBe('minor');
  });

  it('requires an estimand for key secondary endpoints, not plain secondary', () => {
    const keySecondary = clone(baseDesign());
    keySecondary.endpoints.push({
      name: 'body weight change',
      role: 'key_secondary',
      type: 'continuous',
      definition: 'change from baseline in body weight',
    });
    expect(codes(estimandGate(keySecondary))).toContain('EST-001');

    const plainSecondary = clone(baseDesign());
    plainSecondary.endpoints.push({
      name: 'body weight change',
      role: 'secondary',
      type: 'continuous',
      definition: 'change from baseline in body weight',
    });
    expect(codes(estimandGate(plainSecondary))).not.toContain('EST-001');
  });
});

describe('§3 endpoint red-flags', () => {
  it('flags a surrogate primary without accepted precedent', () => {
    const d = clone(baseDesign());
    d.endpoints[0].isSurrogate = true;
    d.endpoints[0].regulatoryAcceptance = 'surrogate_needs_qualification';
    expect(codes(endpointRedFlags(d))).toContain('EPT-001');
  });

  it('flags a time-to-event endpoint with no event definition', () => {
    const d = clone(baseDesign());
    d.endpoints[0].type = 'time_to_event';
    expect(codes(endpointRedFlags(d))).toContain('EPT-002');
  });

  it('flags a patient-reported endpoint with no validated instrument', () => {
    const d = clone(baseDesign());
    d.endpoints[0].type = 'patient_reported';
    expect(codes(endpointRedFlags(d))).toContain('EPT-003');
  });

  it('flags more than one primary endpoint', () => {
    const d = clone(baseDesign());
    d.endpoints.push({
      name: 'fasting glucose',
      role: 'primary',
      type: 'continuous',
      definition: 'change from baseline in fasting plasma glucose',
    });
    expect(codes(endpointRedFlags(d))).toContain('EPT-005');
  });

  it('flags a design with no primary endpoint as critical', () => {
    const d = clone(baseDesign());
    d.endpoints[0].role = 'secondary';
    const finding = endpointRedFlags(d).find(f => f.code === 'EPT-006');
    expect(finding?.severity).toBe('critical');
  });
});

describe('§4 framework rules', () => {
  it('flags non-inferiority without a margin as critical', () => {
    const d = clone(baseDesign());
    d.framework.inferentialFrame = 'non_inferiority';
    const finding = frameworkRules(d).find(f => f.code === 'FRM-001');
    expect(finding?.severity).toBe('critical');
  });

  it('flags non-inferiority without per-protocol as a co-primary set', () => {
    const d = clone(baseDesign());
    d.framework.inferentialFrame = 'non_inferiority';
    d.framework.margin = 0.1;
    d.framework.marginJustification = 'half the historical active-control effect';
    // population has no PP primary set
    expect(codes(frameworkRules(d))).toContain('FRM-003');
  });

  it('flags an external control without an ICH E10 justification', () => {
    const d = clone(baseDesign());
    d.framework.controlType = 'external';
    expect(codes(frameworkRules(d))).toContain('FRM-004');
  });
});

describe('§10/§17 multiplicity gate', () => {
  it('flags a testing hierarchy with no multiplicity control as critical', () => {
    const d = clone(baseDesign());
    d.endpoints.push({
      name: 'body weight change',
      role: 'key_secondary',
      type: 'continuous',
      definition: 'change from baseline in body weight',
    });
    d.estimands.push({
      endpointName: 'body weight change',
      treatmentCondition: 'Drug X 10 mg daily versus placebo',
      population: 'all randomized patients (ITT)',
      variable: 'change from baseline in body weight at week 24',
      summaryMeasure: 'difference in means',
      strategy: 'treatment_policy',
      intercurrentEvents: [
        { name: 'rescue medication', strategy: 'treatment_policy', justification: 'treatment policy' },
      ],
    });
    const finding = multiplicityGate(d).find(f => f.code === 'MUL-001');
    expect(finding?.severity).toBe('critical');
  });

  it('does not flag a single confirmatory endpoint', () => {
    expect(multiplicityGate(baseDesign())).toEqual([]);
  });
});

describe('§6 power red-flags', () => {
  it('flags underpowered designs', () => {
    const d = clone(baseDesign());
    d.statisticalPlan.power = 0.7;
    expect(codes(powerRedFlags(d))).toContain('PWR-002');
  });

  it('flags missing sensitivity analyses', () => {
    const d = clone(baseDesign());
    d.statisticalPlan.sensitivityAnalysesSpecified = false;
    expect(codes(powerRedFlags(d))).toContain('PWR-003');
  });

  it('flags an assumed effect that exceeds the prior-phase observed (optimism bias)', () => {
    const d = clone(baseDesign());
    d.statisticalPlan.powerAssumptions!.effectSize = 0.6; // prior observed is 0.5
    expect(codes(powerRedFlags(d))).toContain('PWR-004');
  });
});

describe('defensibility report', () => {
  it('rates a critical finding as blocking', () => {
    const d = clone(baseDesign());
    d.estimands = []; // EST-001 critical for the primary
    const report = validateDesign(d);
    expect(report.riskLevel).toBe('critical');
    expect(report.blocksApproval).toBe(true);
    expect(report.canAdvance).toBe(false);
  });

  it('rates a major finding as high risk and non-advanceable but not approval-blocking', () => {
    const d = clone(baseDesign());
    d.statisticalPlan.power = 0.7; // PWR-002 major
    const report = validateDesign(d);
    expect(report.riskLevel).toBe('high');
    expect(report.canAdvance).toBe(false);
    expect(report.blocksApproval).toBe(false);
  });

  it('orders findings worst-first and lists the standards checked', () => {
    const d = clone(baseDesign());
    d.estimands = []; // critical
    d.statisticalPlan.sensitivityAnalysesSpecified = false; // minor
    const report = validateDesign(d);
    expect(report.findings[0].severity).toBe('critical');
    expect(report.standardsChecked).toContain('ICH E9(R1)');
  });
});
