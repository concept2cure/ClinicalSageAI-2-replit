/**
 * Biostatistics Judgment Layer — Comprehensive Test Suite
 *
 * Tests:
 * - Power adequacy classification
 * - Assumption fragility judgment
 * - Endpoint-method defensibility
 * - Statistical risk classification
 * - Tradeoff analysis
 * - Role-aware interpretation differences
 * - Governed artifact generation
 * - Full pipeline orchestration
 * - Invalid input handling
 *
 * Three core scenarios:
 * 1. Well-designed Phase III trial (adequate)
 * 2. Underpowered / fragile Phase III trial
 * 3. Invalid / incomplete input
 */

import { describe, it, expect } from 'vitest';
import {
  runJudgmentPipeline,
  runPipelineAndGenerateArtifact,
  runPipelineForRole,
  judgePowerAdequacy,
  judgeAssumptionFragility,
  judgeEndpointMethodDefensibility,
  analyzeTradeoffs,
  classifyStatisticalRisks,
  generateStatisticalArtifact,
} from '../server/services/biostatistics-judgment';
import type {
  StudyDesignInput,
  BiostatisticsJudgmentReport,
  StakeholderRole,
} from '../server/services/biostatistics-judgment';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════════

const SCENARIO_ADEQUATE: StudyDesignInput = {
  projectId: 'test-adequate-001',
  studyType: 'superiority',
  phase: 'III',
  indication: 'Type 2 Diabetes',
  endpointType: 'continuous',
  primaryEndpoint: 'Change in HbA1c from baseline',
  statisticalMethod: 'ancova',
  alpha: 0.05,
  powerTarget: 0.90,
  effectSizeAssumption: 0.4,
  effectSizeUnit: '% HbA1c reduction',
  allocationRatio: 1,
  attritionAssumption: 0.15,
  computedSampleSize: 400,
  computedPower: 0.92,
  variance: 1.2,
  missingDataMethod: 'mmrm',
  multiplicityAdjustment: 'hochberg',
};

const SCENARIO_FRAGILE: StudyDesignInput = {
  projectId: 'test-fragile-002',
  studyType: 'superiority',
  phase: 'III',
  indication: 'Major Depressive Disorder',
  endpointType: 'continuous',
  primaryEndpoint: 'MADRS total score change',
  statisticalMethod: 'mmrm',
  alpha: 0.05,
  powerTarget: 0.80,
  effectSizeAssumption: 2.5,
  effectSizeUnit: 'points',
  allocationRatio: 1,
  attritionAssumption: 0.35,
  computedSampleSize: 180,
  computedPower: 0.75,
  variance: 64,
  interimAnalyses: 1,
  missingDataMethod: 'complete_case',
};

const SCENARIO_INVALID: StudyDesignInput = {
  projectId: 'test-invalid-003',
  studyType: 'non_inferiority',
  phase: 'III',
  indication: 'Hypertension',
  endpointType: 'binary',
  primaryEndpoint: 'Blood pressure control rate',
  statisticalMethod: 'cox_regression',
  alpha: 0.05,
  powerTarget: 0.80,
  effectSizeAssumption: 0,
  allocationRatio: 1,
  attritionAssumption: 0,
  computedSampleSize: 100,
  computedPower: 0,
  controlRate: 0.55,
  treatmentRate: 0.60,
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 1: POWER ADEQUACY JUDGMENT
// ═══════════════════════════════════════════════════════════════════════════════

describe('Power Adequacy Judgment', () => {
  it('classifies adequate power correctly', () => {
    const result = judgePowerAdequacy(SCENARIO_ADEQUATE);
    expect(result.classification).toBe('adequate');
    expect(result.effectivePower).toBe(0.92);
    expect(result.rationale.length).toBeGreaterThan(0);
    expect(result.concerns.length).toBe(0);
  });

  it('classifies marginal/underpowered correctly', () => {
    const result = judgePowerAdequacy(SCENARIO_FRAGILE);
    // 0.75 power with 35% attrition → should downgrade
    expect(['marginal', 'underpowered']).toContain(result.classification);
    expect(result.concerns.length).toBeGreaterThan(0);
    expect(result.recommendedActions.length).toBeGreaterThan(0);
  });

  it('classifies indeterminate when power is zero/invalid', () => {
    const result = judgePowerAdequacy(SCENARIO_INVALID);
    expect(result.classification).toBe('indeterminate');
    expect(result.effectivePower).toBe(null);
  });

  it('downgrades adequate to marginal with high attrition', () => {
    const input = { ...SCENARIO_ADEQUATE, attritionAssumption: 0.35, computedPower: 0.82 };
    const result = judgePowerAdequacy(input);
    expect(result.classification).toBe('marginal');
    expect(result.rationale.some(r => r.includes('attrition'))).toBe(true);
  });

  it('flags Phase III underpowered as high risk', () => {
    const input = { ...SCENARIO_FRAGILE, computedPower: 0.60, phase: 'III' as const };
    const result = judgePowerAdequacy(input);
    expect(result.classification).toBe('underpowered');
    expect(result.concerns.some(c => c.includes('Phase III'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 2: ASSUMPTION FRAGILITY
// ═══════════════════════════════════════════════════════════════════════════════

describe('Assumption Fragility Judgment', () => {
  it('scores low-to-moderate fragility for well-designed study', () => {
    const result = judgeAssumptionFragility(SCENARIO_ADEQUATE);
    // Even well-designed studies have some assumption dependencies — moderate is acceptable
    expect(['low', 'moderate']).toContain(result.fragilityLevel);
    expect(result.fragilityScore).toBeLessThan(60);
    expect(result.keyDependencies.length).toBeGreaterThan(0);
  });

  it('scores high fragility for fragile study', () => {
    const result = judgeAssumptionFragility(SCENARIO_FRAGILE);
    expect(['moderate', 'high']).toContain(result.fragilityLevel);
    expect(result.fragilityScore).toBeGreaterThan(30);
    expect(result.likelyFailureModes.length).toBeGreaterThan(0);
  });

  it('flags missing effect size', () => {
    const result = judgeAssumptionFragility(SCENARIO_INVALID);
    expect(result.sensitivityFactors.some(f => f.parameter === 'effect_size')).toBe(true);
    expect(result.keyDependencies.some(d => d.includes('Effect size'))).toBe(true);
  });

  it('flags zero attrition assumption', () => {
    const result = judgeAssumptionFragility(SCENARIO_INVALID);
    expect(result.sensitivityFactors.some(f => f.parameter === 'attrition')).toBe(true);
    expect(result.likelyFailureModes.some(m => m.includes('dropout'))).toBe(true);
  });

  it('provides sensitivity factors with impact levels', () => {
    const result = judgeAssumptionFragility(SCENARIO_FRAGILE);
    expect(result.sensitivityFactors.length).toBeGreaterThan(0);
    for (const factor of result.sensitivityFactors) {
      expect(['high', 'moderate', 'low']).toContain(factor.impact);
      expect(factor.description).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 3: ENDPOINT-METHOD DEFENSIBILITY
// ═══════════════════════════════════════════════════════════════════════════════

describe('Endpoint-Method Defensibility', () => {
  it('rates appropriate pairing as appropriate', () => {
    const result = judgeEndpointMethodDefensibility(SCENARIO_ADEQUATE);
    expect(result.rating).toBe('appropriate');
    expect(result.endpointAssessment).toBeTruthy();
    expect(result.methodAssessment).toBeTruthy();
    expect(result.pairingAssessment).toBeTruthy();
  });

  it('rates inappropriate pairing (cox for binary) as poorly matched', () => {
    const result = judgeEndpointMethodDefensibility(SCENARIO_INVALID);
    expect(result.rating).toBe('poorly_matched');
    expect(result.limitations.length).toBeGreaterThan(0);
  });

  it('applies pairing rules for non-inferiority without margin', () => {
    const result = judgeEndpointMethodDefensibility(SCENARIO_INVALID);
    // non_inferiority + no margin → should flag
    expect(
      result.limitations.some(l => l.includes('margin')) ||
      result.caveats.some(c => c.includes('margin'))
    ).toBe(true);
  });

  it('flags interim analyses without multiplicity adjustment', () => {
    const input = { ...SCENARIO_ADEQUATE, interimAnalyses: 2, multiplicityAdjustment: undefined };
    const result = judgeEndpointMethodDefensibility(input);
    expect(result.caveats.some(c => c.includes('alpha') || c.includes('interim'))).toBe(true);
  });

  it('adds Phase III regulatory consideration', () => {
    const result = judgeEndpointMethodDefensibility(SCENARIO_ADEQUATE);
    expect(result.regulatoryConsiderations.some(r => r.includes('Phase III'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 5: STATISTICAL RISK CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Statistical Risk Classifier', () => {
  it('classifies low risk for adequate design', () => {
    const power = judgePowerAdequacy(SCENARIO_ADEQUATE);
    const fragility = judgeAssumptionFragility(SCENARIO_ADEQUATE);
    const defensibility = judgeEndpointMethodDefensibility(SCENARIO_ADEQUATE);
    const result = classifyStatisticalRisks(SCENARIO_ADEQUATE, power, fragility, defensibility);

    expect(result.overallRiskLevel).toBe('low');
    expect(result.criticalCount).toBe(0);
  });

  it('classifies higher risk for fragile design', () => {
    const power = judgePowerAdequacy(SCENARIO_FRAGILE);
    const fragility = judgeAssumptionFragility(SCENARIO_FRAGILE);
    const defensibility = judgeEndpointMethodDefensibility(SCENARIO_FRAGILE);
    const result = classifyStatisticalRisks(SCENARIO_FRAGILE, power, fragility, defensibility);

    expect(['moderate', 'high', 'critical']).toContain(result.overallRiskLevel);
    expect(result.majorCount).toBeGreaterThan(0);
  });

  it('identifies critical risk for inappropriate method', () => {
    const power = judgePowerAdequacy(SCENARIO_INVALID);
    const fragility = judgeAssumptionFragility(SCENARIO_INVALID);
    const defensibility = judgeEndpointMethodDefensibility(SCENARIO_INVALID);
    const result = classifyStatisticalRisks(SCENARIO_INVALID, power, fragility, defensibility);

    expect(result.criticalCount).toBeGreaterThan(0);
    expect(result.risks.some(r => r.riskType === 'endpoint_method_mismatch')).toBe(true);
  });

  it('detects missing data risk', () => {
    const power = judgePowerAdequacy(SCENARIO_FRAGILE);
    const fragility = judgeAssumptionFragility(SCENARIO_FRAGILE);
    const defensibility = judgeEndpointMethodDefensibility(SCENARIO_FRAGILE);
    const result = classifyStatisticalRisks(SCENARIO_FRAGILE, power, fragility, defensibility);

    expect(result.risks.some(r => r.riskType === 'missing_data_risk')).toBe(true);
  });

  it('provides summary for all risk levels', () => {
    const power = judgePowerAdequacy(SCENARIO_ADEQUATE);
    const fragility = judgeAssumptionFragility(SCENARIO_ADEQUATE);
    const defensibility = judgeEndpointMethodDefensibility(SCENARIO_ADEQUATE);
    const result = classifyStatisticalRisks(SCENARIO_ADEQUATE, power, fragility, defensibility);

    expect(result.summary).toBeTruthy();
    expect(typeof result.summary).toBe('string');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 4: TRADEOFF ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Tradeoff Interpreter', () => {
  it('produces tradeoffs for adequate design', () => {
    const power = judgePowerAdequacy(SCENARIO_ADEQUATE);
    const fragility = judgeAssumptionFragility(SCENARIO_ADEQUATE);
    const result = analyzeTradeoffs(SCENARIO_ADEQUATE, power, fragility);

    expect(result.tradeoffs.length).toBeGreaterThan(0);
    expect(result.safestPath).toBeTruthy();
    expect(result.overallGuidance).toBeTruthy();
  });

  it('identifies favorable tradeoffs for fragile design', () => {
    const power = judgePowerAdequacy(SCENARIO_FRAGILE);
    const fragility = judgeAssumptionFragility(SCENARIO_FRAGILE);
    const result = analyzeTradeoffs(SCENARIO_FRAGILE, power, fragility);

    const favorable = result.tradeoffs.filter(t => t.netAssessment === 'favorable');
    expect(favorable.length).toBeGreaterThan(0);
  });

  it('each tradeoff has complete structure', () => {
    const power = judgePowerAdequacy(SCENARIO_ADEQUATE);
    const fragility = judgeAssumptionFragility(SCENARIO_ADEQUATE);
    const result = analyzeTradeoffs(SCENARIO_ADEQUATE, power, fragility);

    for (const tradeoff of result.tradeoffs) {
      expect(tradeoff.dimension).toBeTruthy();
      expect(tradeoff.currentChoice).toBeTruthy();
      expect(tradeoff.alternative).toBeTruthy();
      expect(tradeoff.whatImproves.length).toBeGreaterThan(0);
      expect(tradeoff.whatWorses.length).toBeGreaterThan(0);
      expect(['favorable', 'neutral', 'unfavorable']).toContain(tradeoff.netAssessment);
      expect(tradeoff.recommendation).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 6: ROLE-AWARE INTERPRETATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Role-Aware Interpreter', () => {
  const roles: StakeholderRole[] = ['ceo', 'ra_lead', 'clinical_lead', 'medical_writer', 'biostatistician'];

  it('produces different interpretations for each role', () => {
    const report = runJudgmentPipeline(SCENARIO_ADEQUATE);

    const headlines = new Set<string>();
    for (const role of roles) {
      const interp = report.roleInterpretations[role];
      expect(interp).toBeDefined();
      expect(interp.role).toBe(role);
      expect(interp.headline).toBeTruthy();
      headlines.add(interp.headline);
    }

    // At least 3 different headlines (some might overlap for similar assessments)
    expect(headlines.size).toBeGreaterThanOrEqual(3);
  });

  it('CEO interpretation focuses on business impact', () => {
    const { interpretation } = runPipelineForRole(SCENARIO_FRAGILE, 'ceo');
    expect(interpretation.role).toBe('ceo');
    // CEO-relevant terms
    const allText = [
      interpretation.headline,
      ...interpretation.keyPoints,
      ...interpretation.implications,
      interpretation.riskFraming,
    ].join(' ').toLowerCase();
    expect(
      allText.includes('risk') || allText.includes('cost') ||
      allText.includes('timeline') || allText.includes('investment')
    ).toBe(true);
  });

  it('RA interpretation focuses on regulatory defensibility', () => {
    const { interpretation } = runPipelineForRole(SCENARIO_FRAGILE, 'ra_lead');
    expect(interpretation.role).toBe('ra_lead');
    const allText = [
      interpretation.headline,
      ...interpretation.keyPoints,
      ...interpretation.implications,
    ].join(' ').toLowerCase();
    expect(
      allText.includes('regulatory') || allText.includes('reviewer') ||
      allText.includes('defensib') || allText.includes('submission')
    ).toBe(true);
  });

  it('biostatistician interpretation is technical', () => {
    const { interpretation } = runPipelineForRole(SCENARIO_ADEQUATE, 'biostatistician');
    expect(interpretation.role).toBe('biostatistician');
    const allText = [
      ...interpretation.keyPoints,
      ...interpretation.implications,
    ].join(' ').toLowerCase();
    expect(
      allText.includes('power') || allText.includes('fragility') ||
      allText.includes('assumption') || allText.includes('score')
    ).toBe(true);
  });

  it('medical writer gets documentation guidance', () => {
    const { interpretation } = runPipelineForRole(SCENARIO_ADEQUATE, 'medical_writer');
    expect(interpretation.role).toBe('medical_writer');
    expect(interpretation.actionItems.length).toBeGreaterThan(0);
    const allActions = interpretation.actionItems.join(' ').toLowerCase();
    expect(
      allActions.includes('document') || allActions.includes('include') ||
      allActions.includes('effect size')
    ).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 7: GOVERNED ARTIFACT GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Statistical Artifact Generator', () => {
  it('generates a statistical risk memo', () => {
    const { artifact } = runPipelineAndGenerateArtifact(SCENARIO_FRAGILE, 'statistical_risk_memo');
    expect(artifact.artifactType).toBe('statistical_risk_memo');
    expect(artifact.title).toContain('Statistical Risk Memo');
    expect(artifact.sections.length).toBeGreaterThan(3);
    expect(artifact.metadata.provenance).toBe('ana_biostatistics_judgment');
    expect(artifact.metadata.projectId).toBe('test-fragile-002');
  });

  it('generates a sample size rationale', () => {
    const { artifact } = runPipelineAndGenerateArtifact(SCENARIO_ADEQUATE, 'sample_size_rationale');
    expect(artifact.artifactType).toBe('sample_size_rationale');
    expect(artifact.title).toContain('Sample Size Rationale');
    // Should contain the sample size number
    const allContent = artifact.sections.map(s => s.content).join(' ');
    expect(allContent).toContain('400');
    expect(allContent).toContain('90%');
  });

  it('generates a design assumption note', () => {
    const { artifact } = runPipelineAndGenerateArtifact(SCENARIO_ADEQUATE, 'design_assumption_note');
    expect(artifact.artifactType).toBe('design_assumption_note');
    expect(artifact.sections.some(s => s.heading === 'Key Assumptions')).toBe(true);
    expect(artifact.sections.some(s => s.heading === 'Sensitivity Assessment')).toBe(true);
  });

  it('generates a SAP section draft', () => {
    const { artifact } = runPipelineAndGenerateArtifact(SCENARIO_ADEQUATE, 'sap_section_draft');
    expect(artifact.artifactType).toBe('sap_section_draft');
    expect(artifact.sections.some(s => s.heading === 'Primary Analysis Method')).toBe(true);
    expect(artifact.sections.some(s => s.heading === 'Sample Size')).toBe(true);
  });

  it('generates a scenario comparison brief', () => {
    const { artifact } = runPipelineAndGenerateArtifact(SCENARIO_FRAGILE, 'scenario_comparison_brief');
    expect(artifact.artifactType).toBe('scenario_comparison_brief');
    expect(artifact.sections.some(s => s.heading.includes('Tradeoff'))).toBe(true);
    expect(artifact.sections.some(s => s.heading === 'Safest Path Forward')).toBe(true);
  });

  it('artifact has structured metadata', () => {
    const { artifact } = runPipelineAndGenerateArtifact(SCENARIO_ADEQUATE, 'statistical_risk_memo');
    expect(artifact.metadata.generatedAt).toBeTruthy();
    expect(artifact.metadata.generatedBy).toBeTruthy();
    expect(artifact.metadata.version).toBe('1.0');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FULL PIPELINE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Full Judgment Pipeline', () => {
  it('runs complete pipeline for adequate design', () => {
    const report = runJudgmentPipeline(SCENARIO_ADEQUATE);

    expect(report.provenance).toBe('ana_biostatistics_judgment');
    expect(report.generatedAt).toBeTruthy();
    expect(report.powerJudgment.classification).toBe('adequate');
    expect(['low', 'moderate']).toContain(report.fragilityJudgment.fragilityLevel);
    expect(report.defensibilityJudgment.rating).toBe('appropriate');
    expect(['low', 'moderate']).toContain(report.riskProfile.overallRiskLevel);
    expect(report.tradeoffAnalysis.tradeoffs.length).toBeGreaterThan(0);
    expect(Object.keys(report.roleInterpretations).length).toBe(5);
    expect(
      report.overallAssessment.includes('ACCEPTABLE') || report.overallAssessment.includes('MODERATE')
    ).toBe(true);
  });

  it('runs complete pipeline for fragile design', () => {
    const report = runJudgmentPipeline(SCENARIO_FRAGILE);

    expect(report.powerJudgment.classification).not.toBe('adequate');
    expect(report.fragilityJudgment.fragilityScore).toBeGreaterThan(30);
    expect(report.riskProfile.majorCount).toBeGreaterThan(0);
    expect(report.overallAssessment).not.toContain('ACCEPTABLE');
  });

  it('runs complete pipeline for invalid input', () => {
    const report = runJudgmentPipeline(SCENARIO_INVALID);

    expect(report.powerJudgment.classification).toBe('indeterminate');
    expect(report.defensibilityJudgment.rating).toBe('poorly_matched');
    expect(report.riskProfile.criticalCount).toBeGreaterThan(0);
    expect(report.overallAssessment).toContain('CRITICAL');
  });

  it('pipeline + artifact generation works end-to-end', () => {
    const { report, artifact } = runPipelineAndGenerateArtifact(
      SCENARIO_ADEQUATE,
      'statistical_risk_memo',
      'test-runner',
    );

    expect(report.powerJudgment).toBeDefined();
    expect(artifact.sections.length).toBeGreaterThan(0);
    expect(artifact.metadata.generatedBy).toBe('test-runner');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// INVALID INPUT HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Invalid Input Handling', () => {
  it('handles zero effect size gracefully', () => {
    const result = judgePowerAdequacy(SCENARIO_INVALID);
    expect(result.classification).toBe('indeterminate');
    // Should not throw
  });

  it('handles zero attrition', () => {
    const result = judgeAssumptionFragility(SCENARIO_INVALID);
    expect(result.sensitivityFactors.some(f => f.parameter === 'attrition')).toBe(true);
    // Should flag but not throw
  });

  it('handles inappropriate method pairing', () => {
    const result = judgeEndpointMethodDefensibility(SCENARIO_INVALID);
    expect(result.rating).toBe('poorly_matched');
    expect(result.limitations.length).toBeGreaterThan(0);
  });

  it('full pipeline handles invalid input without throwing', () => {
    expect(() => runJudgmentPipeline(SCENARIO_INVALID)).not.toThrow();
    const report = runJudgmentPipeline(SCENARIO_INVALID);
    expect(report).toBeDefined();
    expect(report.overallAssessment).toBeTruthy();
  });

  it('artifact generation handles invalid input scenario', () => {
    expect(() =>
      runPipelineAndGenerateArtifact(SCENARIO_INVALID, 'statistical_risk_memo')
    ).not.toThrow();
    const { artifact } = runPipelineAndGenerateArtifact(SCENARIO_INVALID, 'statistical_risk_memo');
    expect(artifact.sections.length).toBeGreaterThan(0);
  });
});
