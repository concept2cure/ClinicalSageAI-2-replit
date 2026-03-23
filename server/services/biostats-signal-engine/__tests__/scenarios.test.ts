/**
 * Biostats Signal Engine — Real-World Scenario Tests
 *
 * Three proven scenarios:
 *   1. Power inadequacy (biotech: Phase III oncology)
 *   2. Endpoint/document misalignment (device/diagnostics: 510(k))
 *   3. Low-confidence statistical uncertainty with no auto-execution
 *
 * Plus unit tests for each evaluator.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluatePowerInadequacy,
  evaluateEndpointMisalignment,
  evaluateStatisticalUncertainty,
  evaluateSampleSizeDrift,
  evaluateMultiplicityGap,
  evaluateMissingDataRisk,
} from '../evaluators';
import type { BiostatEvaluationRequest } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO 1: BIOTECH — Phase III Oncology Power Inadequacy
//
// Context: A biotech company running a Phase III trial for a PD-L1 inhibitor
// in NSCLC. Protocol assumed effect size of 0.35 (OS hazard ratio), planned
// 400 patients. Actual enrollment is 320 due to competitive enrollment.
// The study is underpowered for the primary endpoint.
// ═══════════════════════════════════════════════════════════════════════════

describe('Scenario 1: Biotech Phase III Oncology — Power Inadequacy', () => {
  const biotechRequest: BiostatEvaluationRequest = {
    organizationId: 1,
    projectId: 101,
    studyId: 501,
    studyDesign: {
      phase: 'Phase III',
      indication: 'Non-Small Cell Lung Cancer (NSCLC)',
      therapeuticArea: 'Oncology',
      designType: 'parallel',
      regulatoryPath: 'NDA',
    },
    powerParams: {
      plannedN: 400,
      enrolledN: 220,
      effectSize: 0.15,
      alpha: 0.05,
      targetPower: 0.80,
      dropoutRate: 0.15,
      endpointType: 'time_to_event',
      hazardRatio: 0.85,  // Modest HR in competitive NSCLC landscape
    },
    artifactRefs: [
      {
        artifactId: 'protocol-nsclc-001',
        artifactType: 'protocol',
        title: 'Phase III NSCLC Protocol v3.2',
        section: 'Section 9.4 — Statistical Methods',
        ctdSection: '2.7.4',
      },
    ],
  };

  it('detects power inadequacy for underpowered oncology trial', () => {
    const { signal, receipt } = evaluatePowerInadequacy(biotechRequest);

    expect(signal).not.toBeNull();
    expect(signal!.signalType).toBe('power_inadequacy');
    expect(signal!.severity).toMatch(/critical|high|medium/);
    expect(signal!.evidenceClass).toBe('deterministic');

    // Verify computation is deterministic and provable
    expect(signal!.computation.method).toBe('time_to_event_power_calculation');
    expect(signal!.computation.thresholdMet).toBe(true);
    expect(signal!.computation.deterministicProof).toContain('power');

    // Verify actions target the right systems
    const actionTypes = signal!.actions.map(a => a.actionType);
    expect(actionTypes).toContain('generate_contradiction');
    expect(actionTypes).toContain('update_assumption');

    // Verify it targets contradiction engine
    expect(signal!.actions.some(a => a.targetSystem === 'contradiction_engine')).toBe(true);

    // Verify it targets assumption registry
    expect(signal!.actions.some(a => a.targetSystem === 'assumption_registry')).toBe(true);

    // Verify it targets resolution orchestrator
    expect(signal!.actions.some(a => a.targetSystem === 'resolution_orchestrator')).toBe(true);

    // Proof receipt exists
    expect(receipt).not.toBeNull();
    expect(receipt!.signalType).toBe('power_inadequacy');
    expect(receipt!.evaluationContext.indication).toBe('Non-Small Cell Lung Cancer (NSCLC)');
  });

  it('also detects sample size drift for same trial', () => {
    const { signal } = evaluateSampleSizeDrift(biotechRequest);

    expect(signal).not.toBeNull();
    expect(signal!.signalType).toBe('sample_size_drift');
    // 80 out of 400 = 20% drift
    expect(signal!.computation.outputs).toHaveProperty('driftPercent');
    const drift = signal!.computation.outputs.driftPercent as number;
    expect(drift).toBe(45);
    expect(signal!.severity).toBe('critical'); // 45% underenrollment is critical
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO 2: DEVICE/DIAGNOSTICS — 510(k) Endpoint Misalignment
//
// Context: A diagnostics company submitting a 510(k) for an AI-based
// diagnostic device. Protocol defines primary endpoint as "sensitivity
// at 95% specificity". SAP says "AUC". The CSR reports "positive
// predictive value". These are three different endpoints across three
// documents — a critical regulatory finding.
// ═══════════════════════════════════════════════════════════════════════════

describe('Scenario 2: Device/Diagnostics 510(k) — Endpoint Misalignment', () => {
  const deviceRequest: BiostatEvaluationRequest = {
    organizationId: 2,
    projectId: 202,
    studyId: 602,
    studyDesign: {
      phase: 'Pivotal',
      indication: 'Early Detection of Pancreatic Cancer',
      therapeuticArea: 'Diagnostics',
      designType: 'single_arm',
      regulatoryPath: '510k',
    },
    endpoints: {
      protocol: [
        {
          name: 'Sensitivity at 95% Specificity',
          category: 'primary',
          type: 'binary',
          measurementVariable: 'sensitivity',
          timepoint: 'single assessment',
          statisticalMethod: 'exact binomial CI',
          source: 'protocol',
        },
        {
          name: 'Negative Predictive Value',
          category: 'secondary',
          type: 'binary',
          source: 'protocol',
        },
      ],
      sap: [
        {
          name: 'Area Under ROC Curve (AUC)',
          category: 'primary',
          type: 'continuous',
          measurementVariable: 'AUC',
          timepoint: 'single assessment',
          statisticalMethod: 'DeLong method',
          source: 'sap',
        },
        {
          name: 'Negative Predictive Value',
          category: 'secondary',
          type: 'binary',
          source: 'sap',
        },
      ],
      csr: [
        {
          name: 'Positive Predictive Value',
          category: 'primary',
          type: 'binary',
          measurementVariable: 'PPV',
          timepoint: 'single assessment',
          statisticalMethod: 'Wilson score CI',
          source: 'csr',
        },
      ],
    },
    artifactRefs: [
      {
        artifactId: 'protocol-dx-001',
        artifactType: 'protocol',
        title: '510(k) Clinical Protocol — AI Pancreatic Cancer Dx',
        section: 'Section 7 — Study Endpoints',
      },
      {
        artifactId: 'sap-dx-001',
        artifactType: 'sap',
        title: 'Statistical Analysis Plan v2.1',
        section: 'Section 4 — Primary Analysis',
      },
      {
        artifactId: 'csr-dx-001',
        artifactType: 'csr',
        title: 'Clinical Study Report — Pivotal Study',
        section: 'Section 11 — Efficacy Results',
      },
    ],
  };

  it('detects endpoint misalignment across protocol/SAP/CSR', () => {
    const { signal, receipt } = evaluateEndpointMisalignment(deviceRequest);

    expect(signal).not.toBeNull();
    expect(signal!.signalType).toBe('endpoint_document_misalignment');
    expect(signal!.severity).toBe('critical'); // Primary endpoint name mismatch = critical

    // Check misalignments detected
    const misalignments = signal!.computation.outputs.misalignments as any[];
    expect(misalignments.length).toBeGreaterThanOrEqual(2); // At least protocol↔SAP and protocol↔CSR

    // Check that it found the primary endpoint name mismatch
    const nameMismatches = misalignments.filter(
      (m: any) => m.field === 'primary_endpoint_name'
    );
    expect(nameMismatches.length).toBeGreaterThan(0);

    // Verify actions target contradiction engine
    expect(signal!.actions.some(a => a.actionType === 'generate_contradiction')).toBe(true);
    expect(signal!.actions.some(a => a.targetSystem === 'contradiction_engine')).toBe(true);

    // Verify blocking action for critical severity
    expect(signal!.actions.some(a => a.actionType === 'block_submission')).toBe(true);

    // Proof receipt
    expect(receipt).not.toBeNull();
    expect(receipt!.evaluationContext.regulatoryPath).toBe('510k');
    expect(receipt!.evaluationContext.therapeuticArea).toBe('Diagnostics');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO 3: LOW-CONFIDENCE UNCERTAINTY — No Auto-Execute
//
// Context: A Phase II cardiovascular trial. The primary endpoint p-value
// is 0.048 (just under 0.05). The 95% CI for the treatment difference
// spans the clinical threshold (MCID). The point estimate is very close
// to the minimum clinically important difference. The system MUST NOT
// auto-execute any actions — it must escalate to a human biostatistician.
// ═══════════════════════════════════════════════════════════════════════════

describe('Scenario 3: Statistical Uncertainty — No Auto-Execution', () => {
  const uncertaintyRequest: BiostatEvaluationRequest = {
    organizationId: 3,
    projectId: 303,
    studyId: 703,
    studyDesign: {
      phase: 'Phase II',
      indication: 'Heart Failure with Preserved Ejection Fraction (HFpEF)',
      therapeuticArea: 'Cardiovascular',
      designType: 'parallel',
      regulatoryPath: 'NDA',
    },
    results: {
      primaryPValue: 0.048,
      confidenceInterval: [-0.5, 5.2],
      pointEstimate: 2.3,
      clinicalThreshold: 2.5, // MCID = 2.5 points on 6MWD
    },
    artifactRefs: [
      {
        artifactId: 'csr-cv-001',
        artifactType: 'csr',
        title: 'Clinical Study Report — Phase II HFpEF Trial',
        section: 'Section 11.4 — Primary Efficacy Analysis',
        ctdSection: '2.7.3',
      },
    ],
  };

  it('detects statistical uncertainty and blocks auto-execution', () => {
    const { signal, receipt } = evaluateStatisticalUncertainty(uncertaintyRequest);

    expect(signal).not.toBeNull();
    expect(signal!.signalType).toBe('statistical_uncertainty');

    // Severity should be high (p-value in boundary zone + CI spans threshold)
    expect(['high', 'critical']).toContain(signal!.severity);

    // CRITICAL: Must have no_auto_execute action
    const noAutoExecute = signal!.actions.find(a => a.actionType === 'no_auto_execute');
    expect(noAutoExecute).toBeDefined();
    expect(noAutoExecute!.reason).toContain('automated action prohibited');

    // Must require human review
    const humanReview = signal!.actions.find(a => a.actionType === 'require_human_review');
    expect(humanReview).toBeDefined();

    // Must escalate to biostatistician
    const escalate = signal!.actions.find(a => a.actionType === 'escalate_to_biostat');
    expect(escalate).toBeDefined();

    // Check uncertainty reasons
    const reasons = signal!.computation.outputs.uncertaintyReasons as string[];
    expect(reasons.length).toBeGreaterThanOrEqual(2);
    expect(reasons.some(r => r.includes('p-value'))).toBe(true);
    expect(reasons.some(r => r.includes('CI') || r.includes('threshold'))).toBe(true);

    // Proof receipt
    expect(receipt).not.toBeNull();
    expect(receipt!.evaluationContext.indication).toContain('HFpEF');
  });

  it('does NOT auto-execute even if p-value is technically significant', () => {
    const { signal } = evaluateStatisticalUncertainty(uncertaintyRequest);

    // Even though p = 0.048 < 0.05, the engine flags uncertainty
    expect(signal).not.toBeNull();

    // No action should be of type that implies automated execution
    const autoActions = signal!.actions.filter(
      a => a.actionType !== 'no_auto_execute' &&
           a.actionType !== 'require_human_review' &&
           a.actionType !== 'escalate_to_biostat'
    );
    expect(autoActions.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UNIT TESTS: Individual Evaluator Coverage
// ═══════════════════════════════════════════════════════════════════════════

describe('Evaluator Unit Tests', () => {
  describe('Power Inadequacy', () => {
    it('returns null when no powerParams provided', () => {
      const { signal } = evaluatePowerInadequacy({
        organizationId: 1, projectId: 1,
      });
      expect(signal).toBeNull();
    });

    it('returns null when study is adequately powered', () => {
      const { signal } = evaluatePowerInadequacy({
        organizationId: 1, projectId: 1,
        powerParams: {
          plannedN: 500, effectSize: 0.5, sigma: 1,
          alpha: 0.05, targetPower: 0.80,
          endpointType: 'continuous',
        },
      });
      expect(signal).toBeNull();
    });

    it('detects critical power inadequacy for small sample', () => {
      const { signal } = evaluatePowerInadequacy({
        organizationId: 1, projectId: 1,
        powerParams: {
          plannedN: 20, effectSize: 0.1, sigma: 1,
          alpha: 0.05, targetPower: 0.80,
          endpointType: 'continuous',
        },
      });
      expect(signal).not.toBeNull();
      expect(signal!.severity).toBe('critical');
    });

    it('computes power correctly for binary endpoints', () => {
      const { signal } = evaluatePowerInadequacy({
        organizationId: 1, projectId: 1,
        powerParams: {
          plannedN: 30, effectSize: 0.1,
          alpha: 0.05, targetPower: 0.80,
          endpointType: 'binary',
          controlRate: 0.3, treatmentRate: 0.4,
        },
      });
      expect(signal).not.toBeNull();
      expect(signal!.computation.method).toBe('binary_power_calculation');
    });
  });

  describe('Endpoint Misalignment', () => {
    it('returns null when fewer than 2 sources', () => {
      const { signal } = evaluateEndpointMisalignment({
        organizationId: 1, projectId: 1,
        endpoints: {
          protocol: [{ name: 'OS', category: 'primary', type: 'time_to_event', source: 'protocol' }],
        },
      });
      expect(signal).toBeNull();
    });

    it('returns null when endpoints match', () => {
      const { signal } = evaluateEndpointMisalignment({
        organizationId: 1, projectId: 1,
        endpoints: {
          protocol: [{ name: 'Overall Survival', category: 'primary', type: 'time_to_event', source: 'protocol' }],
          sap: [{ name: 'Overall Survival', category: 'primary', type: 'time_to_event', source: 'sap' }],
        },
      });
      expect(signal).toBeNull();
    });

    it('detects type mismatch even when names match', () => {
      const { signal } = evaluateEndpointMisalignment({
        organizationId: 1, projectId: 1,
        endpoints: {
          protocol: [{ name: 'PFS', category: 'primary', type: 'time_to_event', source: 'protocol' }],
          sap: [{ name: 'PFS', category: 'primary', type: 'binary', source: 'sap' }],
        },
      });
      expect(signal).not.toBeNull();
      expect(signal!.signalType).toBe('endpoint_document_misalignment');
    });
  });

  describe('Statistical Uncertainty', () => {
    it('returns null when no results provided', () => {
      const { signal } = evaluateStatisticalUncertainty({
        organizationId: 1, projectId: 1,
      });
      expect(signal).toBeNull();
    });

    it('returns null for clearly significant results', () => {
      const { signal } = evaluateStatisticalUncertainty({
        organizationId: 1, projectId: 1,
        results: {
          primaryPValue: 0.001,
          confidenceInterval: [2.0, 8.0],
          pointEstimate: 5.0,
          clinicalThreshold: 1.0,
        },
      });
      expect(signal).toBeNull();
    });

    it('always includes no_auto_execute for uncertain results', () => {
      const { signal } = evaluateStatisticalUncertainty({
        organizationId: 1, projectId: 1,
        results: {
          primaryPValue: 0.049,
          confidenceInterval: [-1, 3],
          pointEstimate: 1.0,
          clinicalThreshold: 1.1,
        },
      });
      expect(signal).not.toBeNull();
      expect(signal!.actions.some(a => a.actionType === 'no_auto_execute')).toBe(true);
    });
  });

  describe('Sample Size Drift', () => {
    it('returns null when no enrollment data', () => {
      const { signal } = evaluateSampleSizeDrift({
        organizationId: 1, projectId: 1,
        powerParams: { plannedN: 100, effectSize: 0.5, alpha: 0.05, targetPower: 0.8, endpointType: 'continuous' },
      });
      expect(signal).toBeNull();
    });

    it('returns null when drift under 5%', () => {
      const { signal } = evaluateSampleSizeDrift({
        organizationId: 1, projectId: 1,
        powerParams: { plannedN: 100, enrolledN: 97, effectSize: 0.5, alpha: 0.05, targetPower: 0.8, endpointType: 'continuous' },
      });
      expect(signal).toBeNull();
    });

    it('detects critical drift at 30%+ underenrollment', () => {
      const { signal } = evaluateSampleSizeDrift({
        organizationId: 1, projectId: 1,
        powerParams: { plannedN: 200, enrolledN: 130, effectSize: 0.5, alpha: 0.05, targetPower: 0.8, endpointType: 'continuous' },
      });
      expect(signal).not.toBeNull();
      expect(signal!.severity).toBe('critical');
    });
  });

  describe('Multiplicity Gap', () => {
    it('returns null when single comparison', () => {
      const { signal } = evaluateMultiplicityGap({
        organizationId: 1, projectId: 1,
        multiplicity: { numberOfComparisons: 1 },
      });
      expect(signal).toBeNull();
    });

    it('returns null when adjustment method specified', () => {
      const { signal } = evaluateMultiplicityGap({
        organizationId: 1, projectId: 1,
        multiplicity: { numberOfComparisons: 5, adjustmentMethod: 'Bonferroni' },
      });
      expect(signal).toBeNull();
    });

    it('detects critical gap with 5+ uncontrolled comparisons', () => {
      const { signal } = evaluateMultiplicityGap({
        organizationId: 1, projectId: 1,
        multiplicity: { numberOfComparisons: 6 },
        powerParams: { plannedN: 100, effectSize: 0.5, alpha: 0.05, targetPower: 0.8, endpointType: 'continuous' },
      });
      expect(signal).not.toBeNull();
      expect(signal!.severity).toBe('critical');
      // Verify FWER calculation
      const outputs = signal!.computation.outputs as any;
      expect(outputs.inflatedFWER).toBeGreaterThan(0.2);
    });
  });

  describe('Missing Data Risk', () => {
    it('returns null when no missing data info', () => {
      const { signal } = evaluateMissingDataRisk({
        organizationId: 1, projectId: 1,
      });
      expect(signal).toBeNull();
    });

    it('detects LOCF as high-severity concern', () => {
      const { signal } = evaluateMissingDataRisk({
        organizationId: 1, projectId: 1,
        missingData: { assumedDropoutRate: 0.10, handlingMethod: 'LOCF' },
      });
      expect(signal).not.toBeNull();
      expect(signal!.severity).toMatch(/high|critical/);
      expect(signal!.description).toContain('LOCF');
    });

    it('detects observed dropout exceeding assumed', () => {
      const { signal } = evaluateMissingDataRisk({
        organizationId: 1, projectId: 1,
        missingData: { assumedDropoutRate: 0.10, observedDropoutRate: 0.28 },
      });
      expect(signal).not.toBeNull();
      expect(signal!.severity).toMatch(/high|critical/);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROOF: Cross-System Wiring Verification
// ═══════════════════════════════════════════════════════════════════════════

describe('Cross-System Wiring Proof', () => {
  it('power inadequacy signal creates contradiction + assumption + resolution actions', () => {
    const { signal } = evaluatePowerInadequacy({
      organizationId: 1, projectId: 1,
      powerParams: {
        plannedN: 30, effectSize: 0.15, sigma: 1,
        alpha: 0.05, targetPower: 0.80,
        endpointType: 'continuous',
      },
    });

    expect(signal).not.toBeNull();

    // Must wire to all 3 systems
    const systems = new Set(signal!.actions.map(a => a.targetSystem));
    expect(systems.has('contradiction_engine')).toBe(true);
    expect(systems.has('assumption_registry')).toBe(true);
    expect(systems.has('resolution_orchestrator')).toBe(true);
  });

  it('endpoint misalignment creates contradiction + resolution actions', () => {
    const { signal } = evaluateEndpointMisalignment({
      organizationId: 1, projectId: 1,
      endpoints: {
        protocol: [{ name: 'OS', category: 'primary', type: 'time_to_event', source: 'protocol' }],
        csr: [{ name: 'PFS', category: 'primary', type: 'time_to_event', source: 'csr' }],
      },
    });

    expect(signal).not.toBeNull();
    const systems = new Set(signal!.actions.map(a => a.targetSystem));
    expect(systems.has('contradiction_engine')).toBe(true);
    expect(systems.has('resolution_orchestrator')).toBe(true);
  });

  it('statistical uncertainty ONLY creates human review + escalation — no contradiction', () => {
    const { signal } = evaluateStatisticalUncertainty({
      organizationId: 1, projectId: 1,
      results: {
        primaryPValue: 0.051,
        confidenceInterval: [-0.2, 4.1],
        pointEstimate: 2.0,
        clinicalThreshold: 2.0,
      },
    });

    expect(signal).not.toBeNull();
    // No generate_contradiction action for uncertainty
    expect(signal!.actions.every(a => a.actionType !== 'generate_contradiction')).toBe(true);
    // Only human-facing actions
    const actionTypes = signal!.actions.map(a => a.actionType);
    expect(actionTypes).toContain('no_auto_execute');
    expect(actionTypes).toContain('require_human_review');
    expect(actionTypes).toContain('escalate_to_biostat');
  });
});
