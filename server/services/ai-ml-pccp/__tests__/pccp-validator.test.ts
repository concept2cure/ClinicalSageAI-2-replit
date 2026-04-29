/**
 * PCCP validator tests — pure unit tests, no DB.
 */

import { describe, expect, test } from 'vitest';

import { validatePccp } from '../pccp-validator.service';
import type { AiMlPccpPlan, AiMlModification } from '../../../../shared/schema/ai-ml-pccp';

const completePlan = (overrides: Partial<AiMlPccpPlan> = {}): AiMlPccpPlan => ({
  id: 'plan-1',
  organizationId: 1,
  programId: 'prog-1',
  code: 'PCCP-001',
  version: 1,
  previousPlanId: null,
  title: 'Test Plan',
  deviceSubjectName: 'Subject AI Device',
  intendedUse: 'Triage of chest X-rays for suspected pneumothorax.',
  descriptionSummary: 'Algorithm refinements within prespecified bounds.',
  dataManagementPractices: 'Data ingest follows SOP-DATA-001 with PII redaction.',
  retrainingPractices: 'Quarterly retraining on the curated training pool.',
  performanceEvaluationProtocol: 'Frozen test set; AUC measured at each release.',
  updateProcedures: 'OTA push with staged rollout and 24h monitoring window.',
  transparencyCommitments: 'Release notes include performance deltas and changelog.',
  benefitsNarrative: 'Improved sensitivity for subtle apical pneumothoraces.',
  risksNarrative: 'Possible false-positive uptick on motion-artifact images.',
  mitigationsNarrative: 'Mandatory human-in-the-loop review for all positives.',
  comparisonToCurrentDevice: 'No change to indications; bounded performance shift.',
  monitoringPlan: 'Quarterly real-world performance review.',
  driftDetectionPlan: 'PSI drift index monitored monthly with 0.2 alert threshold.',
  biasSubgroupAnalysisPlan: 'Per-release subgroup analysis by age, sex, scanner make.',
  cybersecurityImpactNarrative: 'No change to attack surface; SBOM regenerated each release.',
  labelingImpactNarrative: 'IFU updated only when boundary is crossed.',
  rollbackStrategyNarrative: 'Atomic OTA revert to N-1 within 30 minutes.',
  status: 'draft',
  approvedBy: null,
  approvedAt: null,
  signatureId: null,
  locked: false,
  guidanceVersion: 'FDA-PCCP-2024',
  metadata: null,
  createdBy: null,
  updatedBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const completeMod = (overrides: Partial<AiMlModification> = {}): AiMlModification => ({
  id: 'mod-1',
  planId: 'plan-1',
  code: 'MOD-001',
  ordering: 0,
  title: 'Periodic retraining within ±3% AUC',
  modificationType: 'retraining',
  boundary: 'AUC may drift no more than 0.03 from baseline 0.91.',
  boundaryDeltaLimit: '+/- 3% AUC',
  rationale: 'Drift recovery from data distribution shift.',
  retrainingDataCriteria: 'Curated pool: minimum 5,000 cases, balanced by view position.',
  performanceMetric: 'AUC',
  performanceComparator: '>=',
  performanceThresholdValue: '0.88',
  performanceTestSet: 'Frozen TestSet-A v3',
  rollbackStrategy: 'Atomic OTA revert to N-1 within 30 minutes; audit log captured.',
  cybersecurityImpact: 'No connectivity changes; SBOM regenerated.',
  labelingImpact: 'No labeling change as long as boundary holds.',
  biasSubgroupAnalysis: 'Subgroup AUC reported per release across age, sex, scanner.',
  status: 'draft',
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('validatePccp — happy path', () => {
  test('a complete plan with one complete modification passes the gate', () => {
    const r = validatePccp(completePlan(), [completeMod()]);
    expect(r.criticalCount).toBe(0);
    expect(r.passesGate).toBe(true);
    expect(r.componentCoverage.descriptionOfModifications).toBe(true);
    expect(r.componentCoverage.modificationProtocol).toBe(true);
    expect(r.componentCoverage.impactAssessment).toBe(true);
  });
});

describe('validatePccp — plan-level critical findings', () => {
  test('blank Modification Protocol fields raise PCCP-002', () => {
    const r = validatePccp(
      completePlan({
        dataManagementPractices: null,
        retrainingPractices: null,
        performanceEvaluationProtocol: null,
        updateProcedures: null,
      }),
      [completeMod()]
    );
    const f = r.findings.find(x => x.code === 'PCCP-002');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('critical');
    expect(f!.message).toMatch(/data_management_practices/);
    expect(r.passesGate).toBe(false);
  });

  test('blank Impact Assessment raises PCCP-003', () => {
    const r = validatePccp(
      completePlan({
        benefitsNarrative: null,
        risksNarrative: null,
        mitigationsNarrative: null,
        comparisonToCurrentDevice: null,
      }),
      [completeMod()]
    );
    expect(r.findings.some(f => f.code === 'PCCP-003' && f.severity === 'critical')).toBe(true);
  });

  test('no description AND no modifications raises PCCP-001', () => {
    const r = validatePccp(completePlan({ descriptionSummary: null }), []);
    expect(r.findings.some(f => f.code === 'PCCP-001' && f.severity === 'critical')).toBe(true);
  });

  test('plan with descriptionSummary but no modifications still passes PCCP-001', () => {
    const r = validatePccp(completePlan({ descriptionSummary: 'Bounded change set' }), []);
    expect(r.findings.some(f => f.code === 'PCCP-001')).toBe(false);
  });

  test('locked plan in non-final status raises PCCP-099', () => {
    const r = validatePccp(completePlan({ locked: true, status: 'draft' }), [completeMod()]);
    expect(r.findings.some(f => f.code === 'PCCP-099' && f.severity === 'critical')).toBe(true);
  });
});

describe('validatePccp — plan-level warnings', () => {
  test('missing monitoring/drift/bias/rollback/cyber/labeling raise warnings', () => {
    const r = validatePccp(
      completePlan({
        monitoringPlan: null,
        driftDetectionPlan: null,
        biasSubgroupAnalysisPlan: null,
        rollbackStrategyNarrative: null,
        cybersecurityImpactNarrative: null,
        labelingImpactNarrative: null,
      }),
      [completeMod()]
    );
    const codes = r.findings.map(f => f.code);
    for (const expected of ['PCCP-010', 'PCCP-011', 'PCCP-012', 'PCCP-013', 'PCCP-014', 'PCCP-015']) {
      expect(codes).toContain(expected);
    }
    // Warnings alone do not block the gate
    expect(r.criticalCount).toBe(0);
    expect(r.passesGate).toBe(true);
  });
});

describe('validatePccp — modification-level checks', () => {
  test('missing rollback strategy raises PCCP-103 critical', () => {
    const r = validatePccp(completePlan(), [
      completeMod({ rollbackStrategy: '' as any }),
    ]);
    expect(r.findings.some(f => f.code === 'PCCP-103' && f.severity === 'critical')).toBe(true);
  });

  test('non-quantitative threshold raises PCCP-104 critical', () => {
    const r = validatePccp(completePlan(), [
      completeMod({ performanceThresholdValue: 'not-a-number' }),
    ]);
    expect(r.findings.some(f => f.code === 'PCCP-104' && f.severity === 'critical')).toBe(true);
  });

  test('numeric threshold with percent passes PCCP-104', () => {
    const r = validatePccp(completePlan(), [
      completeMod({ performanceThresholdValue: '88%' }),
    ]);
    expect(r.findings.some(f => f.code === 'PCCP-104')).toBe(false);
  });

  test('numeric range threshold passes PCCP-104', () => {
    const r = validatePccp(completePlan(), [
      completeMod({ performanceThresholdValue: '0.85-0.92' }),
    ]);
    expect(r.findings.some(f => f.code === 'PCCP-104')).toBe(false);
  });

  test('retraining-class modification without retraining-data criteria raises PCCP-105', () => {
    const r = validatePccp(completePlan(), [
      completeMod({ modificationType: 'algorithm_update', retrainingDataCriteria: null }),
    ]);
    expect(r.findings.some(f => f.code === 'PCCP-105' && f.severity === 'critical')).toBe(true);
  });

  test('retraining without bias/subgroup analysis raises PCCP-106 warning', () => {
    const r = validatePccp(completePlan(), [
      completeMod({ biasSubgroupAnalysis: null }),
    ]);
    expect(r.findings.some(f => f.code === 'PCCP-106' && f.severity === 'warning')).toBe(true);
  });

  test('output_format change without labeling impact raises PCCP-108', () => {
    const r = validatePccp(completePlan(), [
      completeMod({ modificationType: 'output_format_change', labelingImpact: null }),
    ]);
    expect(r.findings.some(f => f.code === 'PCCP-108')).toBe(true);
  });

  test('input_data change without cybersecurity impact raises PCCP-107', () => {
    const r = validatePccp(completePlan(), [
      completeMod({ modificationType: 'input_data_change', cybersecurityImpact: null }),
    ]);
    expect(r.findings.some(f => f.code === 'PCCP-107')).toBe(true);
  });

  test('every finding carries a citation', () => {
    const r = validatePccp(
      completePlan({
        dataManagementPractices: null,
        risksNarrative: null,
      }),
      [completeMod({ rollbackStrategy: '' as any, performanceThresholdValue: 'tbd' })]
    );
    for (const f of r.findings) {
      expect(f.citation && f.citation.length).toBeGreaterThan(0);
    }
  });
});
