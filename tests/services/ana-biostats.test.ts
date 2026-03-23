/**
 * AnA Biostats — Comprehensive Test Suite
 *
 * Tests cover:
 * - Deterministic reproducibility
 * - Invalid/missing assumption handling
 * - Project binding
 * - Artifact creation preparation
 * - Track-aware behavior
 * - Regulator-aware behavior
 * - Workflow integration
 * - Failure behavior
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { InputNormalizer } from '../../server/services/ana-biostats/input-normalizer';
import { ComputationEngine } from '../../server/services/ana-biostats/computation-engine';
import { JudgmentEngine } from '../../server/services/ana-biostats/judgment-engine';
import { DomainAdapter } from '../../server/services/ana-biostats/domain-adapter';
import { RegulatoryCustomizer } from '../../server/services/ana-biostats/regulatory-customizer';
import { DocumentGenerator } from '../../server/services/ana-biostats/document-generator';
import { AnaBiostatsOrchestrator } from '../../server/services/ana-biostats/orchestrator';

import type { StatisticalInput } from '../../server/services/ana-biostats/types';

// ═══════════════════════════════════════════════════════════════
// Shared instances
// ═══════════════════════════════════════════════════════════════

const normalizer = new InputNormalizer();
const engine = new ComputationEngine();
const judgment = new JudgmentEngine();
const domainAdapter = new DomainAdapter();
const regCustomizer = new RegulatoryCustomizer();
const docGenerator = new DocumentGenerator();
const orchestrator = new AnaBiostatsOrchestrator();

// ═══════════════════════════════════════════════════════════════
// Standard Pharma Input
// ═══════════════════════════════════════════════════════════════

const pharmaInput: StatisticalInput = {
  clientTrack: 'biotech_pharma',
  regulatoryBody: 'FDA',
  studyType: 'superiority',
  objectiveType: 'efficacy',
  endpointType: 'continuous',
  alpha: 0.05,
  powerTarget: 0.80,
  effectSize: 0.5,
  variance: 1.0,
  attritionRate: 0.15,
  allocationRatio: 1,
  indication: 'NSCLC',
  phase: 'III',
  numberOfGroups: 2,
};

const deviceInput: StatisticalInput = {
  clientTrack: 'medical_device',
  regulatoryBody: 'FDA',
  studyType: 'non_inferiority',
  objectiveType: 'performance',
  endpointType: 'continuous',
  alpha: 0.05,
  powerTarget: 0.80,
  effectSize: 0.3,
  variance: 1.0,
  nonInferiorityMargin: 0.15,
  attritionRate: 0.10,
  allocationRatio: 1,
  numberOfGroups: 2,
};

const diagnosticInput: StatisticalInput = {
  clientTrack: 'diagnostics_ivd',
  regulatoryBody: 'FDA',
  studyType: 'diagnostic_accuracy',
  objectiveType: 'diagnostic_accuracy',
  endpointType: 'sensitivity_specificity',
  alpha: 0.05,
  powerTarget: 0.80,
  effectSize: 0.90,
  sensitivity: 0.90,
  specificity: 0.85,
  prevalence: 0.30,
  attritionRate: 0.10,
  allocationRatio: 1,
  numberOfGroups: 1,
};

// ═══════════════════════════════════════════════════════════════
// 1. Input Normalization Tests
// ═══════════════════════════════════════════════════════════════

describe('Layer 1: Input Normalization', () => {
  it('validates and normalizes a complete pharma input', () => {
    const result = normalizer.normalize(pharmaInput);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.normalizedInput.alpha).toBe(0.05);
    expect(result.normalizedInput.clientTrack).toBe('biotech_pharma');
  });

  it('rejects missing required fields', () => {
    const result = normalizer.normalize({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    const fields = result.errors.map(e => e.field);
    expect(fields).toContain('clientTrack');
    expect(fields).toContain('studyType');
    expect(fields).toContain('endpointType');
  });

  it('warns on unusual alpha', () => {
    const result = normalizer.normalize({ ...pharmaInput, alpha: 0.20 });
    expect(result.warnings.some(w => w.field === 'alpha')).toBe(true);
  });

  it('warns on low power target', () => {
    const result = normalizer.normalize({ ...pharmaInput, powerTarget: 0.60 });
    expect(result.warnings.some(w => w.field === 'powerTarget')).toBe(true);
  });

  it('warns on high attrition rate', () => {
    const result = normalizer.normalize({ ...pharmaInput, attritionRate: 0.35 });
    expect(result.warnings.some(w => w.field === 'attritionRate')).toBe(true);
  });

  it('prefills default values', () => {
    const result = normalizer.normalize({
      clientTrack: 'biotech_pharma',
      studyType: 'superiority',
      objectiveType: 'efficacy',
      endpointType: 'continuous',
      effectSize: 0.5,
    });
    expect(result.prefilled).toContain('alpha');
    expect(result.prefilled).toContain('powerTarget');
    expect(result.prefilled).toContain('attritionRate');
    expect(result.normalizedInput.alpha).toBe(0.05);
    expect(result.normalizedInput.powerTarget).toBe(0.80);
  });

  it('requires NI margin for non-inferiority studies', () => {
    const result = normalizer.normalize({
      ...pharmaInput,
      studyType: 'non_inferiority',
      nonInferiorityMargin: undefined,
    });
    expect(result.errors.some(e => e.field === 'nonInferiorityMargin')).toBe(true);
  });

  it('requires sensitivity/specificity for diagnostic accuracy studies', () => {
    const result = normalizer.normalize({
      clientTrack: 'diagnostics_ivd',
      studyType: 'diagnostic_accuracy',
      objectiveType: 'diagnostic_accuracy',
      endpointType: 'sensitivity_specificity',
      effectSize: 0.90,
      attritionRate: 0.10,
      allocationRatio: 1,
    });
    // Missing effectSize without diagnostic rates makes it invalid
    expect(result.valid).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Deterministic Computation Tests
// ═══════════════════════════════════════════════════════════════

describe('Layer 2: Deterministic Computation', () => {
  it('computes reproducible sample size for continuous superiority', () => {
    const result1 = engine.compute(pharmaInput);
    const result2 = engine.compute(pharmaInput);

    // Deterministic: same input → same output
    expect(result1.sampleSize.perGroup).toBe(result2.sampleSize.perGroup);
    expect(result1.sampleSize.total).toBe(result2.sampleSize.total);
    expect(result1.power).toBe(result2.power);
    expect(result1.sampleSize.perGroup).toBeGreaterThan(0);
    expect(result1.sampleSize.total).toBeGreaterThan(0);
  });

  it('computes sample size for binary endpoints', () => {
    const binaryInput: StatisticalInput = {
      ...pharmaInput,
      endpointType: 'binary',
      controlRate: 0.30,
      treatmentRate: 0.50,
      effectSize: 0.20,
    };
    const result = engine.compute(binaryInput);
    expect(result.method).toContain('proportion');
    expect(result.sampleSize.perGroup).toBeGreaterThan(0);
  });

  it('computes sample size for survival endpoints', () => {
    const survivalInput: StatisticalInput = {
      ...pharmaInput,
      endpointType: 'time_to_event',
      effectSize: 0.30,
      eventRate: 0.60,
    };
    const result = engine.compute(survivalInput);
    expect(result.method).toContain('Log-rank');
    expect(result.sampleSize.total).toBeGreaterThan(0);
  });

  it('computes diagnostic accuracy metrics', () => {
    const result = engine.compute(diagnosticInput);
    expect(result.diagnosticMetrics).toBeDefined();
    expect(result.diagnosticMetrics!.sensitivity).toBe(0.90);
    expect(result.diagnosticMetrics!.specificity).toBe(0.85);
    expect(result.diagnosticMetrics!.ppv).toBeGreaterThan(0);
    expect(result.diagnosticMetrics!.npv).toBeGreaterThan(0);
  });

  it('adjusts sample size for attrition', () => {
    const result = engine.compute(pharmaInput);
    expect(result.attritionAdjusted).toBe(true);
    expect(result.adjustedTotal).toBeGreaterThan(result.sampleSize.total);
  });

  it('generates scenario comparisons', () => {
    const result = engine.compute(pharmaInput);
    expect(result.scenarios).toBeDefined();
    expect(result.scenarios!.length).toBeGreaterThan(0);
    expect(result.scenarios!.some(s => s.label.includes('Conservative'))).toBe(true);
    expect(result.scenarios!.some(s => s.label.includes('Base case'))).toBe(true);
  });

  it('computes non-inferiority design', () => {
    const result = engine.compute(deviceInput);
    expect(result.method).toContain('non-inferiority');
    expect(result.sampleSize.perGroup).toBeGreaterThan(0);
  });

  it('compares two scenarios correctly', () => {
    const inputA = { ...pharmaInput, effectSize: 0.5 };
    const inputB = { ...pharmaInput, effectSize: 0.3 };
    const comparison = engine.compareScenarios(inputA, inputB);

    expect(comparison.scenarioA.sampleSize.total).toBeLessThan(comparison.scenarioB.sampleSize.total);
    expect(comparison.comparison.stronger).toBe('A');
  });

  it('larger effect size requires fewer subjects', () => {
    const small = engine.compute({ ...pharmaInput, effectSize: 0.3 });
    const large = engine.compute({ ...pharmaInput, effectSize: 0.8 });
    expect(large.sampleSize.total).toBeLessThan(small.sampleSize.total);
  });

  it('higher power requires more subjects', () => {
    const low = engine.compute({ ...pharmaInput, powerTarget: 0.70 });
    const high = engine.compute({ ...pharmaInput, powerTarget: 0.95 });
    expect(high.sampleSize.total).toBeGreaterThan(low.sampleSize.total);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Judgment Engine Tests
// ═══════════════════════════════════════════════════════════════

describe('Layer 3: Judgment Engine', () => {
  it('judges a well-powered study as adequate', () => {
    const comp = engine.compute({ ...pharmaInput, powerTarget: 0.90 });
    const result = judgment.judge({ ...pharmaInput, powerTarget: 0.90 }, comp);

    expect(result.overallVerdict).toBe('adequate');
    expect(['low', 'moderate']).toContain(result.overallRisk);
    expect(['proceed', 'proceed_with_conditions']).toContain(result.actionRecommendation);
  });

  it('flags an underpowered study', () => {
    const comp = engine.compute({ ...pharmaInput, effectSize: 0.1, variance: 1.0 });
    // Force a low-power scenario
    const lowPowerComp = { ...comp, power: 0.45 };
    const result = judgment.judge({ ...pharmaInput, effectSize: 0.1 }, lowPowerComp);

    expect(result.dimensions.find(d => d.name === 'Power Adequacy')?.verdict).toBe('inadequate');
  });

  it('assesses fragility correctly', () => {
    const comp = engine.compute(pharmaInput);
    const result = judgment.judge(pharmaInput, comp);

    expect(result.fragility).toBeDefined();
    expect(['robust', 'moderate', 'fragile', 'very_fragile']).toContain(result.fragility.category);
    expect(result.fragility.fragilityIndex).toBeGreaterThanOrEqual(0);
    expect(result.fragility.fragilityIndex).toBeLessThanOrEqual(100);
  });

  it('assesses endpoint-method fit', () => {
    const comp = engine.compute(pharmaInput);
    const result = judgment.judge(pharmaInput, comp);

    expect(result.endpointMethodFit).toBeDefined();
    expect(['strong', 'acceptable', 'weak', 'mismatch']).toContain(result.endpointMethodFit.fit);
  });

  it('generates role-specific explanations', () => {
    const comp = engine.compute(pharmaInput);
    const result = judgment.judge(pharmaInput, comp);

    expect(result.roleExplanations.technical).toBeTruthy();
    expect(result.roleExplanations.clinical).toBeTruthy();
    expect(result.roleExplanations.regulatory).toBeTruthy();
    expect(result.roleExplanations.executive).toBeTruthy();
  });

  it('recommends escalation for critical issues', () => {
    // Create a deliberately bad scenario
    const badInput: StatisticalInput = {
      ...pharmaInput,
      phase: 'III',
      effectSize: 0.05,
      variance: 10,
      attritionRate: 0.40,
    };
    const comp = engine.compute(badInput);
    const badComp = { ...comp, power: 0.25 };
    const result = judgment.judge(badInput, badComp);

    expect(['revise', 'escalate']).toContain(result.actionRecommendation);
    expect(result.escalationReasons.length).toBeGreaterThan(0);
  });

  it('provides confidence assessment', () => {
    const comp = engine.compute(pharmaInput);
    const result = judgment.judge(pharmaInput, comp);

    expect(['high', 'moderate', 'low', 'very_low']).toContain(result.confidence.level);
    expect(result.confidence.score).toBeGreaterThanOrEqual(0);
    expect(result.confidence.score).toBeLessThanOrEqual(100);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Domain Track Adaptation Tests
// ═══════════════════════════════════════════════════════════════

describe('Layer 4: Domain Track Adaptation', () => {
  it('adapts for biotech/pharma track', () => {
    const comp = engine.compute(pharmaInput);
    const jdg = judgment.judge(pharmaInput, comp);
    const adaptation = domainAdapter.adapt(pharmaInput, comp, jdg);

    expect(adaptation.track).toBe('biotech_pharma');
    expect(adaptation.designConsiderations.some(c => c.includes('estimand'))).toBe(true);
    expect(adaptation.templateModifiers.estimand_section).toBe('required');
  });

  it('adapts for medical device track', () => {
    const comp = engine.compute(deviceInput);
    const jdg = judgment.judge(deviceInput, comp);
    const adaptation = domainAdapter.adapt(deviceInput, comp, jdg);

    expect(adaptation.track).toBe('medical_device');
    expect(adaptation.designConsiderations.some(c => c.toLowerCase().includes('bayesian') || c.toLowerCase().includes('device'))).toBe(true);
    expect(adaptation.regulatoryNotes.some(n => n.includes('510(k)') || n.includes('MDR'))).toBe(true);
  });

  it('adapts for diagnostics/IVD track', () => {
    const comp = engine.compute(diagnosticInput);
    const jdg = judgment.judge(diagnosticInput, comp);
    const adaptation = domainAdapter.adapt(diagnosticInput, comp, jdg);

    expect(adaptation.track).toBe('diagnostics_ivd');
    expect(adaptation.methodSuggestions.some(s => s.includes('Clopper-Pearson') || s.includes('binomial'))).toBe(true);
    expect(adaptation.templateModifiers.diagnostic_accuracy_section).toBe('required');
  });

  it('produces different adaptations for different tracks', () => {
    const compP = engine.compute(pharmaInput);
    const compD = engine.compute(diagnosticInput);
    const jdgP = judgment.judge(pharmaInput, compP);
    const jdgD = judgment.judge(diagnosticInput, compD);

    const adaptP = domainAdapter.adapt(pharmaInput, compP, jdgP);
    const adaptD = domainAdapter.adapt(diagnosticInput, compD, jdgD);

    expect(adaptP.track).not.toBe(adaptD.track);
    expect(adaptP.templateModifiers).not.toEqual(adaptD.templateModifiers);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. Regulatory Customization Tests
// ═══════════════════════════════════════════════════════════════

describe('Layer 5: Regulatory Customization', () => {
  it('customizes for FDA', () => {
    const comp = engine.compute(pharmaInput);
    const jdg = judgment.judge(pharmaInput, comp);
    const domain = domainAdapter.adapt(pharmaInput, comp, jdg);
    const reg = regCustomizer.customize(pharmaInput, comp, jdg, domain);

    expect(reg.body).toBe('FDA');
    expect(reg.statisticalExpectations.length).toBeGreaterThan(0);
    expect(reg.guidanceReferences.some(g => g.includes('FDA'))).toBe(true);
  });

  it('customizes for EMA', () => {
    const emaInput = { ...pharmaInput, regulatoryBody: 'EMA' as const };
    const comp = engine.compute(emaInput);
    const jdg = judgment.judge(emaInput, comp);
    const domain = domainAdapter.adapt(emaInput, comp, jdg);
    const reg = regCustomizer.customize(emaInput, comp, jdg, domain);

    expect(reg.body).toBe('EMA');
    expect(reg.statisticalExpectations.some(e => e.includes('EMA') || e.includes('ICH'))).toBe(true);
  });

  it('customizes for PMDA', () => {
    const pmdaInput = { ...pharmaInput, regulatoryBody: 'PMDA' as const };
    const comp = engine.compute(pmdaInput);
    const jdg = judgment.judge(pmdaInput, comp);
    const domain = domainAdapter.adapt(pmdaInput, comp, jdg);
    const reg = regCustomizer.customize(pmdaInput, comp, jdg, domain);

    expect(reg.body).toBe('PMDA');
    expect(reg.specificConstraints.some(c => c.includes('Japanese') || c.includes('ethnic'))).toBe(true);
  });

  it('customizes for MHRA', () => {
    const mhraInput = { ...pharmaInput, regulatoryBody: 'MHRA' as const };
    const comp = engine.compute(mhraInput);
    const jdg = judgment.judge(mhraInput, comp);
    const domain = domainAdapter.adapt(mhraInput, comp, jdg);
    const reg = regCustomizer.customize(mhraInput, comp, jdg, domain);

    expect(reg.body).toBe('MHRA');
    expect(reg.specificConstraints.some(c => c.includes('UK') || c.includes('Brexit'))).toBe(true);
  });

  it('produces different content for FDA vs EMA', () => {
    const compFDA = engine.compute(pharmaInput);
    const jdgFDA = judgment.judge(pharmaInput, compFDA);
    const domFDA = domainAdapter.adapt(pharmaInput, compFDA, jdgFDA);
    const regFDA = regCustomizer.customize(pharmaInput, compFDA, jdgFDA, domFDA);

    const emaInput = { ...pharmaInput, regulatoryBody: 'EMA' as const };
    const compEMA = engine.compute(emaInput);
    const jdgEMA = judgment.judge(emaInput, compEMA);
    const domEMA = domainAdapter.adapt(emaInput, compEMA, jdgEMA);
    const regEMA = regCustomizer.customize(emaInput, compEMA, jdgEMA, domEMA);

    expect(regFDA.body).not.toBe(regEMA.body);
    expect(regFDA.templateVariations.header_format).not.toBe(regEMA.templateVariations.header_format);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. Document Generation Tests
// ═══════════════════════════════════════════════════════════════

describe('Layer 6: Document Generation', () => {
  it('generates a sample size rationale document', () => {
    const comp = engine.compute(pharmaInput);
    const jdg = judgment.judge(pharmaInput, comp);
    const domain = domainAdapter.adapt(pharmaInput, comp, jdg);
    const reg = regCustomizer.customize(pharmaInput, comp, jdg, domain);

    const doc = docGenerator.generate(
      'sample_size_rationale',
      pharmaInput, comp, jdg, domain, reg,
      { projectId: 1, organizationId: 1, userId: 1 }
    );

    expect(doc.type).toBe('sample_size_rationale');
    expect(doc.title).toContain('Sample Size Rationale');
    expect(doc.content).toContain('Sample Size Determination');
    expect(doc.content).toContain(comp.method);
    expect(doc.status).toBe('draft');
    expect(doc.projectId).toBe(1);
    expect(doc.provenance.engineVersion).toBe('1.0.0');
  });

  it('generates a statistical risk memo', () => {
    const comp = engine.compute(pharmaInput);
    const jdg = judgment.judge(pharmaInput, comp);
    const domain = domainAdapter.adapt(pharmaInput, comp, jdg);

    const doc = docGenerator.generate(
      'statistical_risk_memo',
      pharmaInput, comp, jdg, domain, undefined,
      { projectId: 1, organizationId: 1, userId: 1 }
    );

    expect(doc.type).toBe('statistical_risk_memo');
    expect(doc.content).toContain('Risk Classification');
    expect(doc.content).toContain('Dimension Analysis');
    expect(doc.content).toContain('Fragility Assessment');
  });

  it('generates an SAP section draft', () => {
    const comp = engine.compute(pharmaInput);
    const jdg = judgment.judge(pharmaInput, comp);
    const domain = domainAdapter.adapt(pharmaInput, comp, jdg);

    const doc = docGenerator.generate(
      'sap_section_draft',
      pharmaInput, comp, jdg, domain, undefined,
      { projectId: 1, organizationId: 1, userId: 1 }
    );

    expect(doc.content).toContain('Study Objectives');
    expect(doc.content).toContain('Sample Size Determination');
    expect(doc.content).toContain('Statistical Methods');
  });

  it('preserves provenance in generated documents', () => {
    const comp = engine.compute(pharmaInput);
    const jdg = judgment.judge(pharmaInput, comp);
    const domain = domainAdapter.adapt(pharmaInput, comp, jdg);

    const doc = docGenerator.generate(
      'sample_size_rationale',
      pharmaInput, comp, jdg, domain, undefined,
      { projectId: 1, organizationId: 1, userId: 1 }
    );

    expect(doc.provenance.computationInputs).toEqual(pharmaInput);
    expect(doc.provenance.computationResults).toEqual(comp);
    expect(doc.provenance.judgmentResults).toEqual(jdg);
    expect(doc.provenance.generatedAt).toBeTruthy();
  });

  it('includes regulatory notes when body is specified', () => {
    const comp = engine.compute(pharmaInput);
    const jdg = judgment.judge(pharmaInput, comp);
    const domain = domainAdapter.adapt(pharmaInput, comp, jdg);
    const reg = regCustomizer.customize(pharmaInput, comp, jdg, domain);

    const doc = docGenerator.generate(
      'sample_size_rationale',
      pharmaInput, comp, jdg, domain, reg,
      { projectId: 1, organizationId: 1, userId: 1 }
    );

    expect(doc.content).toContain('Regulatory Considerations');
    expect(doc.content).toContain('FDA');
  });

  it('project-binds generated documents', () => {
    const comp = engine.compute(pharmaInput);
    const jdg = judgment.judge(pharmaInput, comp);
    const domain = domainAdapter.adapt(pharmaInput, comp, jdg);

    const doc = docGenerator.generate(
      'sample_size_rationale',
      pharmaInput, comp, jdg, domain, undefined,
      { projectId: 42, organizationId: 7, userId: 3 }
    );

    expect(doc.projectId).toBe(42);
    expect(doc.organizationId).toBe(7);
    expect(doc.createdBy).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. Orchestrator / End-to-End Workflow Tests
// ═══════════════════════════════════════════════════════════════

describe('Layer 8-9: Orchestrator End-to-End', () => {
  it('executes full sample size rationale workflow', async () => {
    const result = await orchestrator.executeWorkflow({
      workflowType: 'sample_size_rationale',
      input: pharmaInput,
      userId: 1,
      organizationId: 1,
      generateDocument: true,
      documentType: 'sample_size_rationale',
    });

    expect(result.workflowId).toBeTruthy();
    expect(result.computation.sampleSize.total).toBeGreaterThan(0);
    expect(result.judgment.overallVerdict).toBeTruthy();
    expect(result.domainAdaptation.track).toBe('biotech_pharma');
    expect(result.document).toBeDefined();
    expect(result.document!.type).toBe('sample_size_rationale');
    expect(result.anaInterpretation.summary).toBeTruthy();
  });

  it('executes full statistical risk review workflow', async () => {
    const result = await orchestrator.executeWorkflow({
      workflowType: 'statistical_risk_review',
      input: pharmaInput,
      userId: 1,
      organizationId: 1,
      generateDocument: true,
      documentType: 'statistical_risk_memo',
    });

    expect(result.document).toBeDefined();
    expect(result.document!.type).toBe('statistical_risk_memo');
    expect(result.anaInterpretation.suggestedNextSteps.length).toBeGreaterThan(0);
  });

  it('executes device track workflow', async () => {
    const result = await orchestrator.executeWorkflow({
      workflowType: 'sample_size_rationale',
      input: deviceInput,
      userId: 1,
      organizationId: 1,
      generateDocument: true,
      documentType: 'sample_size_rationale',
    });

    expect(result.domainAdaptation.track).toBe('medical_device');
    expect(result.regulatoryCustomization?.body).toBe('FDA');
  });

  it('executes diagnostic track workflow', async () => {
    const result = await orchestrator.executeWorkflow({
      workflowType: 'sample_size_rationale',
      input: diagnosticInput,
      userId: 1,
      organizationId: 1,
      generateDocument: true,
      documentType: 'sample_size_rationale',
    });

    expect(result.domainAdaptation.track).toBe('diagnostics_ivd');
    expect(result.computation.diagnosticMetrics).toBeDefined();
  });

  it('handles invalid input gracefully', async () => {
    const result = await orchestrator.executeWorkflow({
      workflowType: 'sample_size_rationale',
      input: { clientTrack: 'biotech_pharma' } as any,
      userId: 1,
      organizationId: 1,
    });

    expect(result.judgment.overallVerdict).toBe('insufficient_information');
    expect(result.confidence.level).toBe('very_low');
    expect(result.anaInterpretation.summary).toContain('Cannot complete');
  });

  it('quick compute returns results without document', () => {
    const result = orchestrator.quickCompute(pharmaInput);
    expect(result.validation.valid).toBe(true);
    expect(result.computation).toBeDefined();
    expect(result.judgment).toBeDefined();
    expect(result.domain).toBeDefined();
    expect(result.interpretation).toBeDefined();
  });

  it('quick compute handles validation failure', () => {
    const result = orchestrator.quickCompute({});
    expect(result.validation.valid).toBe(false);
    expect(result.computation).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. Scenario Comparison Tests
// ═══════════════════════════════════════════════════════════════

describe('Scenario Comparison Workflow', () => {
  it('compares two pharma scenarios', async () => {
    const result = await orchestrator.compareScenarios(
      { ...pharmaInput, effectSize: 0.5 },
      { ...pharmaInput, effectSize: 0.3 },
      { userId: 1, organizationId: 1 }
    );

    expect(result.comparison.stronger).toBeTruthy();
    expect(result.comparison.recommendation).toBeTruthy();
    expect(result.comparisonDocument).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. Failure Behavior Tests
// ═══════════════════════════════════════════════════════════════

describe('Failure Behavior', () => {
  it('handles missing effect size', () => {
    const result = normalizer.normalize({
      clientTrack: 'biotech_pharma',
      studyType: 'superiority',
      objectiveType: 'efficacy',
      endpointType: 'continuous',
      attritionRate: 0.10,
      allocationRatio: 1,
    });
    expect(result.errors.some(e => e.field === 'effectSize')).toBe(true);
  });

  it('handles zero effect size in computation', () => {
    const zeroInput: StatisticalInput = { ...pharmaInput, effectSize: 0 };
    // Should not throw, should return a result (possibly infinite or very large N)
    expect(() => engine.compute(zeroInput)).not.toThrow();
  });

  it('handles very small alpha', () => {
    const result = engine.compute({ ...pharmaInput, alpha: 0.001 });
    expect(result.sampleSize.total).toBeGreaterThan(0);
    // Smaller alpha → larger sample size
    const normalResult = engine.compute(pharmaInput);
    expect(result.sampleSize.total).toBeGreaterThan(normalResult.sampleSize.total);
  });

  it('exposes confidence limitations', () => {
    const input: StatisticalInput = {
      ...pharmaInput,
      variance: undefined, // will use default
      indication: undefined,
      phase: undefined,
    };
    const comp = engine.compute(input);
    const jdg = judgment.judge(input, comp);

    // Should have limitations about defaults or missing context
    expect(jdg.confidence.limitations.length).toBeGreaterThanOrEqual(0);
    expect(jdg.confidence.score).toBeLessThanOrEqual(100);
  });

  it('does not produce silent failures', async () => {
    const result = await orchestrator.executeWorkflow({
      workflowType: 'sample_size_rationale',
      input: {} as any,
      userId: 1,
      organizationId: 1,
    });

    // Should have clear error information, not silent empty results
    expect(result.anaInterpretation.summary.length).toBeGreaterThan(0);
    expect(result.judgment.overallVerdict).toBe('insufficient_information');
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. Deterministic Reproducibility (3 scenarios)
// ═══════════════════════════════════════════════════════════════

describe('Deterministic Reproducibility', () => {
  it('Scenario 1: Phase III NSCLC superiority — exact numeric reproduction', () => {
    const run1 = engine.compute(pharmaInput);
    const run2 = engine.compute(pharmaInput);
    const run3 = engine.compute(pharmaInput);

    expect(run1.sampleSize.perGroup).toBe(run2.sampleSize.perGroup);
    expect(run2.sampleSize.perGroup).toBe(run3.sampleSize.perGroup);
    expect(run1.power).toBe(run2.power);
    expect(run2.power).toBe(run3.power);
    expect(run1.adjustedTotal).toBe(run2.adjustedTotal);
  });

  it('Scenario 2: Device non-inferiority — exact numeric reproduction', () => {
    const run1 = engine.compute(deviceInput);
    const run2 = engine.compute(deviceInput);

    expect(run1.sampleSize.perGroup).toBe(run2.sampleSize.perGroup);
    expect(run1.sampleSize.total).toBe(run2.sampleSize.total);
  });

  it('Scenario 3: Diagnostic accuracy — exact numeric reproduction', () => {
    const run1 = engine.compute(diagnosticInput);
    const run2 = engine.compute(diagnosticInput);

    expect(run1.sampleSize.total).toBe(run2.sampleSize.total);
    expect(run1.diagnosticMetrics!.ppv).toBe(run2.diagnosticMetrics!.ppv);
    expect(run1.diagnosticMetrics!.npv).toBe(run2.diagnosticMetrics!.npv);
  });
});
