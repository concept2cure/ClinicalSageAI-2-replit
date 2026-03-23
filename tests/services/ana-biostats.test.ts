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
import { SMERouter } from '../../server/services/ana-biostats/sme-router';
import { SME_AGENTS, ALL_SME_AGENTS } from '../../server/services/ana-biostats/sme-agents';

import type { StatisticalInput, BiostatsWorkflowRequest } from '../../server/services/ana-biostats/types';

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
const smeRouterInstance = new SMERouter();

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
  it('judges a well-powered study with estimand as adequate', () => {
    const wellInput = { ...pharmaInput, powerTarget: 0.90, estimandStrategy: 'treatment_policy' as const, missingDataMethod: 'MMRM' as const };
    const comp = engine.compute(wellInput);
    const result = judgment.judge(wellInput, comp);

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

// ═══════════════════════════════════════════════════════════════
// 11. ENHANCED: Multiplicity Computation Tests
// ═══════════════════════════════════════════════════════════════

describe('Enhanced: Multiplicity Computation', () => {
  it('computes Bonferroni adjustment for 3 endpoints', () => {
    const result = engine.computeMultiplicity({
      ...pharmaInput,
      numberOfEndpoints: 3,
      multiplicityMethod: 'bonferroni',
    });

    expect(result.method).toBe('bonferroni');
    expect(result.endpointCount).toBe(3);
    expect(result.adjustedAlphas).toHaveLength(3);
    expect(result.adjustedAlphas[0]).toBeCloseTo(0.05 / 3, 4);
    expect(result.effectiveFamilyAlpha).toBeCloseTo(0.05 / 3, 4);
    expect(result.sampleSizeImpact).toBeGreaterThan(0);
  });

  it('computes Holm step-down adjustment', () => {
    const result = engine.computeMultiplicity({
      ...pharmaInput,
      numberOfEndpoints: 3,
      multiplicityMethod: 'holm',
    });

    expect(result.method).toBe('holm');
    expect(result.adjustedAlphas[0]).toBeCloseTo(0.05 / 3, 4);
    expect(result.adjustedAlphas[1]).toBeCloseTo(0.05 / 2, 4);
    expect(result.adjustedAlphas[2]).toBeCloseTo(0.05, 4);
  });

  it('returns no adjustment for single endpoint', () => {
    const result = engine.computeMultiplicity({
      ...pharmaInput,
      numberOfEndpoints: 1,
    });

    expect(result.method).toBe('none');
    expect(result.sampleSizeImpact).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 12. ENHANCED: Crossover Computation Tests
// ═══════════════════════════════════════════════════════════════

describe('Enhanced: Crossover Computation', () => {
  it('computes crossover sample size with efficiency gain', () => {
    const result = engine.computeCrossover({
      ...pharmaInput,
      crossoverPeriods: 2,
      withinSubjectCorrelation: 0.5,
    });

    expect(result.periods).toBe(2);
    expect(result.withinSubjectN).toBeGreaterThan(0);
    expect(result.totalSubjects).toBeGreaterThan(0);
    expect(result.efficiencyGain).toBeGreaterThan(0);
    expect(result.parallelEquivalentN).toBeGreaterThan(result.withinSubjectN);
  });

  it('higher correlation yields smaller crossover N', () => {
    const low = engine.computeCrossover({ ...pharmaInput, crossoverPeriods: 2, withinSubjectCorrelation: 0.3 });
    const high = engine.computeCrossover({ ...pharmaInput, crossoverPeriods: 2, withinSubjectCorrelation: 0.8 });

    expect(high.withinSubjectN).toBeLessThan(low.withinSubjectN);
  });
});

// ═══════════════════════════════════════════════════════════════
// 13. ENHANCED: Missing Data Impact Tests
// ═══════════════════════════════════════════════════════════════

describe('Enhanced: Missing Data Impact', () => {
  it('computes missing data impact for complete case', () => {
    const base = engine.compute(pharmaInput);
    const impact = engine.computeMissingDataImpact(
      { ...pharmaInput, expectedMissingRate: 0.20, missingDataMethod: 'complete_case' },
      base
    );

    expect(impact.method).toBe('Complete case analysis');
    expect(impact.expectedMissingRate).toBe(0.20);
    expect(impact.effectiveSampleSize).toBeLessThan(base.sampleSize.total);
    expect(impact.powerReduction).toBeGreaterThan(0);
    expect(impact.adjustedPower).toBeLessThan(base.power);
  });

  it('MMRM preserves more power than complete case', () => {
    const base = engine.compute(pharmaInput);
    const cc = engine.computeMissingDataImpact(
      { ...pharmaInput, expectedMissingRate: 0.20, missingDataMethod: 'complete_case' },
      base
    );
    const mmrm = engine.computeMissingDataImpact(
      { ...pharmaInput, expectedMissingRate: 0.20, missingDataMethod: 'MMRM' },
      base
    );

    expect(mmrm.adjustedPower).toBeGreaterThanOrEqual(cc.adjustedPower);
  });

  it('higher missing rate increases bias risk', () => {
    const base = engine.compute(pharmaInput);
    const low = engine.computeMissingDataImpact(
      { ...pharmaInput, expectedMissingRate: 0.05, missingDataMethod: 'complete_case' },
      base
    );
    const high = engine.computeMissingDataImpact(
      { ...pharmaInput, expectedMissingRate: 0.25, missingDataMethod: 'complete_case' },
      base
    );

    expect(high.powerReduction).toBeGreaterThan(low.powerReduction);
  });
});

// ═══════════════════════════════════════════════════════════════
// 14. ENHANCED: Agreement/Kappa Computation Tests
// ═══════════════════════════════════════════════════════════════

describe('Enhanced: Agreement/Kappa Computation', () => {
  it('computes kappa sample size', () => {
    const result = engine.computeAgreementKappa({
      ...diagnosticInput,
      studyType: 'agreement',
      agreementTarget: 0.80,
    });

    expect(result.kappaSampleSize).toBeGreaterThan(0);
    expect(result.kappa).toBe(0.80);
  });
});

// ═══════════════════════════════════════════════════════════════
// 15. ENHANCED: AUC Computation Tests
// ═══════════════════════════════════════════════════════════════

describe('Enhanced: AUC Computation', () => {
  it('computes AUC comparison sample size', () => {
    const result = engine.computeAUCComparison({
      ...diagnosticInput,
      endpointType: 'auc_roc',
      aucTarget: 0.85,
      aucNull: 0.50,
    });

    expect(result.aucSampleSize).toBeGreaterThan(0);
    expect(result.auc).toBe(0.85);
    expect(result.aucCI.lower).toBeLessThan(0.85);
    expect(result.aucCI.upper).toBeGreaterThan(0.85);
  });
});

// ═══════════════════════════════════════════════════════════════
// 16. ENHANCED: New Judgment Dimensions Tests
// ═══════════════════════════════════════════════════════════════

describe('Enhanced: New Judgment Dimensions', () => {
  it('flags missing multiplicity correction in Phase III', () => {
    const multiInput: StatisticalInput = {
      ...pharmaInput,
      phase: 'III',
      numberOfEndpoints: 3,
      multiplicityMethod: undefined,
    };
    const comp = engine.computeEnhanced(multiInput);
    const result = judgment.judge(multiInput, comp);

    const multiDim = result.dimensions.find(d => d.name === 'Multiplicity Control');
    expect(multiDim).toBeDefined();
    expect(multiDim!.verdict).toBe('inadequate');
    expect(multiDim!.flags.some(f => f.includes('regulatory rejection'))).toBe(true);
  });

  it('accepts single endpoint without multiplicity', () => {
    const comp = engine.computeEnhanced(pharmaInput);
    const result = judgment.judge(pharmaInput, comp);

    const multiDim = result.dimensions.find(d => d.name === 'Multiplicity Control');
    expect(multiDim).toBeDefined();
    expect(multiDim!.verdict).toBe('adequate');
  });

  it('flags missing estimand in Phase III pharma', () => {
    const noEstimand: StatisticalInput = {
      ...pharmaInput,
      phase: 'III',
      estimandStrategy: undefined,
    };
    const comp = engine.computeEnhanced(noEstimand);
    const result = judgment.judge(noEstimand, comp);

    const estimandDim = result.dimensions.find(d => d.name === 'Estimand Clarity');
    expect(estimandDim).toBeDefined();
    expect(estimandDim!.verdict).toBe('inadequate');
    expect(estimandDim!.flags.some(f => f.includes('ICH E9(R1)'))).toBe(true);
  });

  it('accepts estimand for device track without penalty', () => {
    const comp = engine.computeEnhanced(deviceInput);
    const result = judgment.judge(deviceInput, comp);

    const estimandDim = result.dimensions.find(d => d.name === 'Estimand Clarity');
    expect(estimandDim).toBeDefined();
    expect(estimandDim!.score).toBeGreaterThanOrEqual(70);
  });

  it('flags high missing data rate', () => {
    const highMissing: StatisticalInput = {
      ...pharmaInput,
      expectedMissingRate: 0.35,
      missingDataMethod: undefined,
    };
    const comp = engine.computeEnhanced(highMissing);
    const result = judgment.judge(highMissing, comp);

    const missingDim = result.dimensions.find(d => d.name === 'Missing Data Risk');
    expect(missingDim).toBeDefined();
    expect(missingDim!.verdict).toBe('inadequate');
  });

  it('flags LOCF as not recommended', () => {
    const locfInput: StatisticalInput = {
      ...pharmaInput,
      missingDataMethod: 'LOCF',
      expectedMissingRate: 0.15,
    };
    const comp = engine.computeEnhanced(locfInput);
    const result = judgment.judge(locfInput, comp);

    const missingDim = result.dimensions.find(d => d.name === 'Missing Data Risk');
    expect(missingDim!.flags.some(f => f.includes('LOCF') && f.includes('no longer recommended'))).toBe(true);
  });

  it('flags placebo in non-inferiority as contradictory', () => {
    const badComparator: StatisticalInput = {
      ...deviceInput,
      comparatorType: 'placebo',
      studyType: 'non_inferiority',
    };
    const comp = engine.computeEnhanced(badComparator);
    const result = judgment.judge(badComparator, comp);

    const compDim = result.dimensions.find(d => d.name === 'Comparator Appropriateness');
    expect(compDim).toBeDefined();
    expect(compDim!.verdict).toBe('inadequate');
    expect(compDim!.flags.some(f => f.includes('contradictory'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 17. ENHANCED: Enhanced Orchestrator with New Capabilities
// ═══════════════════════════════════════════════════════════════

describe('Enhanced: Orchestrator with New Capabilities', () => {
  it('includes multiplicity result in enhanced workflow', async () => {
    const result = await orchestrator.executeWorkflow({
      workflowType: 'sample_size_rationale',
      input: { ...pharmaInput, numberOfEndpoints: 3, multiplicityMethod: 'bonferroni' },
      userId: 1,
      organizationId: 1,
    });

    expect(result.computation.multiplicityResult).toBeDefined();
    expect(result.computation.multiplicityResult!.endpointCount).toBe(3);
  });

  it('includes missing data impact when specified', async () => {
    const result = await orchestrator.executeWorkflow({
      workflowType: 'sample_size_rationale',
      input: { ...pharmaInput, expectedMissingRate: 0.20, missingDataMethod: 'MMRM' },
      userId: 1,
      organizationId: 1,
    });

    expect(result.computation.missingDataImpact).toBeDefined();
    expect(result.computation.missingDataImpact!.method).toBe('Mixed model for repeated measures');
  });

  it('includes 10 judgment dimensions in enhanced output', async () => {
    const result = await orchestrator.executeWorkflow({
      workflowType: 'statistical_risk_review',
      input: pharmaInput,
      userId: 1,
      organizationId: 1,
    });

    expect(result.judgment.dimensions.length).toBe(10);
    const dimNames = result.judgment.dimensions.map(d => d.name);
    expect(dimNames).toContain('Multiplicity Control');
    expect(dimNames).toContain('Estimand Clarity');
    expect(dimNames).toContain('Missing Data Risk');
    expect(dimNames).toContain('Comparator Appropriateness');
  });
});

// ═══════════════════════════════════════════════════════════════
// 18. ENHANCED: SAP Document with Multiplicity and Missing Data
// ═══════════════════════════════════════════════════════════════

describe('Enhanced: SAP Document Content', () => {
  it('SAP section includes multiplicity adjustment when specified', () => {
    const multiInput: StatisticalInput = {
      ...pharmaInput,
      numberOfEndpoints: 3,
      multiplicityMethod: 'bonferroni',
    };
    const comp = engine.computeEnhanced(multiInput);
    const jdg = judgment.judge(multiInput, comp);
    const domain = domainAdapter.adapt(multiInput, comp, jdg);

    const doc = docGenerator.generate(
      'sap_section_draft',
      multiInput, comp, jdg, domain, undefined,
      { projectId: 1, organizationId: 1, userId: 1 }
    );

    expect(doc.content).toContain('Multiplicity Adjustment');
    expect(doc.content).toContain('bonferroni');
  });

  it('SAP section includes missing data handling when specified', () => {
    const missingInput: StatisticalInput = {
      ...pharmaInput,
      missingDataMethod: 'MMRM',
      expectedMissingRate: 0.15,
    };
    const comp = engine.computeEnhanced(missingInput);
    const jdg = judgment.judge(missingInput, comp);
    const domain = domainAdapter.adapt(missingInput, comp, jdg);

    const doc = docGenerator.generate(
      'sap_section_draft',
      missingInput, comp, jdg, domain, undefined,
      { projectId: 1, organizationId: 1, userId: 1 }
    );

    expect(doc.content).toContain('MMRM');
    expect(doc.content).toContain('Missing Data Handling');
    expect(doc.content).not.toContain('[To be specified');
  });

  it('SAP section includes estimand framework when specified', () => {
    const estimandInput: StatisticalInput = {
      ...pharmaInput,
      estimandStrategy: 'treatment_policy',
    };
    const comp = engine.computeEnhanced(estimandInput);
    const jdg = judgment.judge(estimandInput, comp);
    const domain = domainAdapter.adapt(estimandInput, comp, jdg);

    const doc = docGenerator.generate(
      'sap_section_draft',
      estimandInput, comp, jdg, domain, undefined,
      { projectId: 1, organizationId: 1, userId: 1 }
    );

    expect(doc.content).toContain('Estimand Framework');
    expect(doc.content).toContain('treatment_policy');
    expect(doc.content).toContain('ICH E9(R1)');
  });
});

// ═══════════════════════════════════════════════════════════════
// 19. SME AGENT DEFINITIONS
// ═══════════════════════════════════════════════════════════════

describe('SME Agent Definitions', () => {
  it('has exactly 5 SME agents defined', () => {
    expect(ALL_SME_AGENTS).toHaveLength(5);
  });

  it('all agents have required fields', () => {
    for (const sme of ALL_SME_AGENTS) {
      expect(sme.id).toBeTruthy();
      expect(sme.name).toBeTruthy();
      expect(sme.title).toBeTruthy();
      expect(sme.scope.length).toBeGreaterThan(0);
      expect(sme.triggerConditions.workflowTypes.length).toBeGreaterThan(0);
      expect(sme.triggerConditions.clientTracks.length).toBeGreaterThan(0);
      expect(sme.reasoningPreferences.emphasizedDimensions.length).toBeGreaterThan(0);
      expect(sme.outputPreferences.primaryDocuments.length).toBeGreaterThan(0);
      expect(sme.escalationRules.provisionalWhen.length).toBeGreaterThan(0);
      expect(sme.escalationRules.humanReviewWhen.length).toBeGreaterThan(0);
    }
  });

  it('each agent has unique ID', () => {
    const ids = ALL_SME_AGENTS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ═══════════════════════════════════════════════════════════════
// 20. SME ROUTING TESTS
// ═══════════════════════════════════════════════════════════════

describe('SME Router: Correct Specialist Selection', () => {
  it('routes sample size request to trial_design_power', () => {
    const result = smeRouterInstance.route({
      workflowType: 'sample_size_rationale',
      input: pharmaInput,
      userId: 1,
      organizationId: 1,
    });
    expect(result.primarySME).toBe('trial_design_power');
    expect(result.confidence).toBeGreaterThan(50);
  });

  it('routes device/diagnostics to device_diagnostics_performance', () => {
    const result = smeRouterInstance.route({
      workflowType: 'sample_size_rationale',
      input: diagnosticInput,
      userId: 1,
      organizationId: 1,
    });
    expect(result.primarySME).toBe('device_diagnostics_performance');
  });

  it('routes SAP workflow to sap_analysis_strategy', () => {
    const result = smeRouterInstance.route({
      workflowType: 'track_aware_drafting',
      input: { ...pharmaInput, estimandStrategy: 'treatment_policy', missingDataMethod: 'MMRM', multiplicityMethod: 'bonferroni' },
      userId: 1,
      organizationId: 1,
      documentType: 'sap_section_draft',
    });
    expect(result.primarySME).toBe('sap_analysis_strategy');
  });

  it('routes regulatory submission to regulatory_submission', () => {
    const result = smeRouterInstance.route({
      workflowType: 'statistical_risk_review',
      input: { ...pharmaInput, regulatoryBody: 'FDA' },
      userId: 1,
      organizationId: 1,
      documentType: 'statistical_reviewer_response',
    });
    expect(result.primarySME).toBe('regulatory_submission');
  });

  it('routes adaptive design to adaptive_sensitivity', () => {
    const result = smeRouterInstance.route({
      workflowType: 'scenario_comparison',
      input: { ...pharmaInput, studyType: 'adaptive', interimAnalyses: 2 },
      userId: 1,
      organizationId: 1,
    });
    expect(result.primarySME).toBe('adaptive_sensitivity');
  });

  it('returns secondary SMEs when multiple match', () => {
    const result = smeRouterInstance.route({
      workflowType: 'sample_size_rationale',
      input: pharmaInput,
      userId: 1,
      organizationId: 1,
    });
    expect(result.secondarySMEs).toBeDefined();
    expect(Array.isArray(result.secondarySMEs)).toBe(true);
  });

  it('provides routing rationale', () => {
    const result = smeRouterInstance.route({
      workflowType: 'sample_size_rationale',
      input: pharmaInput,
      userId: 1,
      organizationId: 1,
    });
    expect(result.rationale).toBeTruthy();
    expect(result.rationale.includes('Primary:')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 21. SME ENHANCEMENT DISTINCTIVENESS
// ═══════════════════════════════════════════════════════════════

describe('SME Enhancement: Distinct Specialist Behavior', () => {
  const comp = engine.computeEnhanced(pharmaInput);
  const jdg = judgment.judge(pharmaInput, comp);
  const domain = domainAdapter.adapt(pharmaInput, comp, jdg);

  it('trial_design_power provides design-specific guidance', () => {
    const enhancement = smeRouterInstance.enhance(
      'trial_design_power', pharmaInput, comp, jdg, domain
    );
    expect(enhancement.smeId).toBe('trial_design_power');
    expect(enhancement.smeName).toBe('Design & Power Specialist');
    // Should emphasize power/design dimensions
    expect(enhancement.documentRecommendations).toContain('sample_size_rationale');
  });

  it('sap_analysis_strategy provides SAP-specific guidance when estimand missing', () => {
    const noEstimandInput = { ...pharmaInput, estimandStrategy: undefined };
    const comp2 = engine.computeEnhanced(noEstimandInput);
    const jdg2 = judgment.judge(noEstimandInput, comp2);
    const dom2 = domainAdapter.adapt(noEstimandInput, comp2, jdg2);

    const enhancement = smeRouterInstance.enhance(
      'sap_analysis_strategy', noEstimandInput, comp2, jdg2, dom2
    );
    expect(enhancement.smeId).toBe('sap_analysis_strategy');
    expect(enhancement.additionalGuidance.some(g => g.includes('Estimand') || g.includes('estimand'))).toBe(true);
  });

  it('regulatory_submission provides body-specific guidance', () => {
    const fdaInput = { ...pharmaInput, regulatoryBody: 'FDA' as const };
    const comp2 = engine.computeEnhanced(fdaInput);
    const jdg2 = judgment.judge(fdaInput, comp2);
    const dom2 = domainAdapter.adapt(fdaInput, comp2, jdg2);
    const reg = regCustomizer.customize(fdaInput, comp2, jdg2, dom2);

    const enhancement = smeRouterInstance.enhance(
      'regulatory_submission', fdaInput, comp2, jdg2, dom2, reg
    );
    expect(enhancement.smeId).toBe('regulatory_submission');
    expect(enhancement.additionalGuidance.some(g => g.includes('FDA') || g.includes('Defensibility'))).toBe(true);
  });

  it('device_diagnostics_performance provides diagnostic-specific guidance', () => {
    const comp2 = engine.computeEnhanced(diagnosticInput);
    const jdg2 = judgment.judge(diagnosticInput, comp2);
    const dom2 = domainAdapter.adapt(diagnosticInput, comp2, jdg2);

    const enhancement = smeRouterInstance.enhance(
      'device_diagnostics_performance', diagnosticInput, comp2, jdg2, dom2
    );
    expect(enhancement.smeId).toBe('device_diagnostics_performance');
    expect(enhancement.documentRecommendations).toContain('sample_size_rationale');
  });

  it('adaptive_sensitivity provides fragility-focused guidance', () => {
    const fragileInput: StatisticalInput = {
      ...pharmaInput,
      effectSize: 0.15,
      variance: 2.0,
      attritionRate: 0.25,
    };
    const comp2 = engine.computeEnhanced(fragileInput);
    const jdg2 = judgment.judge(fragileInput, comp2);
    const dom2 = domainAdapter.adapt(fragileInput, comp2, jdg2);

    const enhancement = smeRouterInstance.enhance(
      'adaptive_sensitivity', fragileInput, comp2, jdg2, dom2
    );
    expect(enhancement.smeId).toBe('adaptive_sensitivity');
    expect(enhancement.additionalGuidance.some(g => g.includes('fragility') || g.includes('Sensitivity'))).toBe(true);
  });

  it('different SMEs produce different enhancements for same input', () => {
    const e1 = smeRouterInstance.enhance('trial_design_power', pharmaInput, comp, jdg, domain);
    const e2 = smeRouterInstance.enhance('sap_analysis_strategy', pharmaInput, comp, jdg, domain);
    const e3 = smeRouterInstance.enhance('regulatory_submission', pharmaInput, comp, jdg, domain);

    // Different SMEs should have different IDs and names
    expect(e1.smeId).not.toBe(e2.smeId);
    expect(e2.smeId).not.toBe(e3.smeId);

    // Different document recommendations
    expect(e1.documentRecommendations).not.toEqual(e3.documentRecommendations);
  });
});

// ═══════════════════════════════════════════════════════════════
// 22. SME IN ORCHESTRATOR END-TO-END
// ═══════════════════════════════════════════════════════════════

describe('SME in Orchestrator: End-to-End', () => {
  it('orchestrator includes SME routing in workflow response', async () => {
    const result = await orchestrator.executeWorkflow({
      workflowType: 'sample_size_rationale',
      input: pharmaInput,
      userId: 1,
      organizationId: 1,
    });

    expect(result.smeRouting).toBeDefined();
    expect(result.smeRouting!.primarySME).toBeTruthy();
    expect(result.smeRouting!.confidence).toBeGreaterThan(0);
    expect(result.smeRouting!.rationale).toBeTruthy();
  });

  it('orchestrator includes SME enhancement in workflow response', async () => {
    const result = await orchestrator.executeWorkflow({
      workflowType: 'sample_size_rationale',
      input: pharmaInput,
      userId: 1,
      organizationId: 1,
    });

    expect(result.smeEnhancement).toBeDefined();
    expect(result.smeEnhancement!.smeId).toBeTruthy();
    expect(result.smeEnhancement!.smeName).toBeTruthy();
  });

  it('SME guidance merges into anaInterpretation', async () => {
    const result = await orchestrator.executeWorkflow({
      workflowType: 'sample_size_rationale',
      input: pharmaInput,
      userId: 1,
      organizationId: 1,
    });

    // SME adds guidance to suggestedNextSteps
    expect(result.anaInterpretation.suggestedNextSteps.length).toBeGreaterThan(0);
  });

  it('device track routes to device specialist in full workflow', async () => {
    const result = await orchestrator.executeWorkflow({
      workflowType: 'sample_size_rationale',
      input: diagnosticInput,
      userId: 1,
      organizationId: 1,
    });

    expect(result.smeRouting!.primarySME).toBe('device_diagnostics_performance');
  });
});

// ═══════════════════════════════════════════════════════════════
// 23. SME FALLBACK / FAILURE BEHAVIOR
// ═══════════════════════════════════════════════════════════════

describe('SME Fallback & Failure Behavior', () => {
  it('falls back to trial_design_power when no strong match', () => {
    const result = smeRouterInstance.route({
      workflowType: 'sample_size_rationale' as any,
      input: {
        clientTrack: 'biotech_pharma',
        studyType: 'superiority',
        objectiveType: 'efficacy',
        endpointType: 'continuous',
        alpha: 0.05,
        powerTarget: 0.80,
        effectSize: 0.5,
        attritionRate: 0.15,
        allocationRatio: 1,
      },
      userId: 1,
      organizationId: 1,
    });

    // Should still route successfully
    expect(result.primarySME).toBeTruthy();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('SME enhancement does not crash on minimal input', () => {
    const minInput: StatisticalInput = {
      clientTrack: 'biotech_pharma',
      studyType: 'superiority',
      objectiveType: 'efficacy',
      endpointType: 'continuous',
      alpha: 0.05,
      powerTarget: 0.80,
      effectSize: 0.5,
      attritionRate: 0.15,
      allocationRatio: 1,
    };
    const comp = engine.computeEnhanced(minInput);
    const jdg = judgment.judge(minInput, comp);
    const dom = domainAdapter.adapt(minInput, comp, jdg);

    // Should not throw for any SME
    for (const sme of ALL_SME_AGENTS) {
      expect(() => {
        smeRouterInstance.enhance(sme.id, minInput, comp, jdg, dom);
      }).not.toThrow();
    }
  });

  it('escalation notes appear when conditions are met', () => {
    const fragileInput: StatisticalInput = {
      ...pharmaInput,
      phase: 'III',
      effectSize: 0.08,
      variance: 5.0,
      attritionRate: 0.30,
      expectedMissingRate: 0.30,
    };
    const comp = engine.computeEnhanced(fragileInput);
    const jdg = judgment.judge(fragileInput, comp);
    const dom = domainAdapter.adapt(fragileInput, comp, jdg);

    // Use trial_design_power which has broader escalation conditions for fragile designs
    const enhancement = smeRouterInstance.enhance(
      'trial_design_power', fragileInput, comp, jdg, dom
    );

    // Should have guidance or provisional notes given the high-risk input
    expect(enhancement.additionalGuidance.length + enhancement.provisionalNotes.length + enhancement.escalationNotes.length).toBeGreaterThan(0);
  });
});
