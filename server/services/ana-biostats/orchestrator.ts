/**
 * AnA Biostats — Layers 8 & 9: Orchestrator + Confidence/Escalation
 *
 * Central orchestration of the full biostatistics operating function.
 * Routes requests through all layers: input → computation → judgment →
 * domain adaptation → regulatory customization → document generation →
 * workflow actions → AnA interpretation.
 *
 * Also handles confidence/limitation/escalation behavior (Layer 9).
 */

import { inputNormalizer } from './input-normalizer';
import { computationEngine } from './computation-engine';
import { judgmentEngine } from './judgment-engine';
import { domainAdapter } from './domain-adapter';
import { regulatoryCustomizer } from './regulatory-customizer';
import { documentGenerator } from './document-generator';
import { workflowIntegrator } from './workflow-integrator';

import type {
  StatisticalInput,
  BiostatsWorkflowRequest,
  BiostatsWorkflowResponse,
  AnaInterpretation,
  EscalationInfo,
  InputValidationResult,
  ComputationResult,
  JudgmentResult,
  DomainAdaptation,
  RegulatoryCustomization,
  GovernedStatisticalDocument,
  WorkflowActionResult,
} from './types';

export class AnaBiostatsOrchestrator {

  // ════════════════════════════════════════════════════════════════
  // Full end-to-end workflow execution
  // ════════════════════════════════════════════════════════════════

  async executeWorkflow(request: BiostatsWorkflowRequest): Promise<BiostatsWorkflowResponse> {
    const workflowId = `biostats-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Layer 1: Input normalization
    const validation = inputNormalizer.normalize(request.input);
    if (!validation.valid) {
      return this.buildErrorResponse(workflowId, request, validation);
    }
    const input = validation.normalizedInput;

    // Layer 2: Deterministic computation (enhanced with multiplicity, crossover, missing data)
    const computation = computationEngine.computeEnhanced(input);

    // Layer 3: Judgment
    const judgment = judgmentEngine.judge(input, computation);

    // Layer 4: Domain adaptation
    const domain = domainAdapter.adapt(input, computation, judgment);

    // Layer 5: Regulatory customization
    const regulatory = input.regulatoryBody
      ? regulatoryCustomizer.customize(input, computation, judgment, domain)
      : undefined;

    // Layer 6: Document generation (if requested)
    let document: GovernedStatisticalDocument | undefined;
    if (request.generateDocument && request.documentType) {
      document = documentGenerator.generate(
        request.documentType,
        input,
        computation,
        judgment,
        domain,
        regulatory,
        {
          projectId: input.projectId ?? 0,
          organizationId: request.organizationId,
          userId: request.userId,
        }
      );
    }

    // Layer 7: Workflow actions
    let workflowActions: WorkflowActionResult[] = [];
    if (document) {
      workflowActions = await workflowIntegrator.executeWorkflowActions(
        document,
        judgment,
        {
          autoAttachToDossier: request.autoAttachToDossier,
          reviewRequired: request.reviewRequired,
        }
      );
    }

    // Layer 8: AnA interpretation
    const anaInterpretation = this.generateAnaInterpretation(
      input, computation, judgment, domain, regulatory
    );

    // Layer 9: Escalation assessment
    const escalation = this.assessEscalation(judgment);

    return {
      workflowId,
      input,
      computation,
      judgment,
      domainAdaptation: domain,
      regulatoryCustomization: regulatory,
      confidence: judgment.confidence,
      document,
      workflowActions,
      anaInterpretation,
      escalation,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Scenario comparison workflow
  // ════════════════════════════════════════════════════════════════

  async compareScenarios(
    inputA: Partial<StatisticalInput>,
    inputB: Partial<StatisticalInput>,
    meta: { userId: number; organizationId: number }
  ): Promise<{
    scenarioA: BiostatsWorkflowResponse;
    scenarioB: BiostatsWorkflowResponse;
    comparison: {
      sampleSizeDelta: number;
      powerDelta: number;
      stronger: 'A' | 'B' | 'equivalent';
      recommendation: string;
    };
    comparisonDocument?: GovernedStatisticalDocument;
  }> {
    const validA = inputNormalizer.normalize(inputA);
    const validB = inputNormalizer.normalize(inputB);

    const scenarioA = await this.executeWorkflow({
      workflowType: 'scenario_comparison',
      input: validA.normalizedInput,
      userId: meta.userId,
      organizationId: meta.organizationId,
    });

    const scenarioB = await this.executeWorkflow({
      workflowType: 'scenario_comparison',
      input: validB.normalizedInput,
      userId: meta.userId,
      organizationId: meta.organizationId,
    });

    const comparison = computationEngine.compareScenarios(
      validA.normalizedInput,
      validB.normalizedInput
    );

    // Generate comparison document
    const winningInput = comparison.comparison.stronger === 'A'
      ? validA.normalizedInput
      : validB.normalizedInput;
    const winningComp = comparison.comparison.stronger === 'A'
      ? comparison.scenarioA
      : comparison.scenarioB;

    const comparisonDocument = documentGenerator.generate(
      'scenario_comparison_brief',
      winningInput,
      winningComp,
      scenarioA.judgment,
      scenarioA.domainAdaptation,
      scenarioA.regulatoryCustomization,
      {
        projectId: winningInput.projectId ?? 0,
        organizationId: meta.organizationId,
        userId: meta.userId,
      }
    );

    return {
      scenarioA,
      scenarioB,
      comparison: comparison.comparison,
      comparisonDocument,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Quick compute (no document generation)
  // ════════════════════════════════════════════════════════════════

  quickCompute(rawInput: Partial<StatisticalInput>): {
    validation: InputValidationResult;
    computation?: ComputationResult;
    judgment?: JudgmentResult;
    domain?: DomainAdaptation;
    regulatory?: RegulatoryCustomization;
    interpretation?: AnaInterpretation;
  } {
    const validation = inputNormalizer.normalize(rawInput);
    if (!validation.valid) {
      return { validation };
    }

    const input = validation.normalizedInput;
    const computation = computationEngine.computeEnhanced(input);
    const judgment = judgmentEngine.judge(input, computation);
    const domain = domainAdapter.adapt(input, computation, judgment);
    const regulatory = input.regulatoryBody
      ? regulatoryCustomizer.customize(input, computation, judgment, domain)
      : undefined;
    const interpretation = this.generateAnaInterpretation(input, computation, judgment, domain, regulatory);

    return { validation, computation, judgment, domain, regulatory, interpretation };
  }

  // ════════════════════════════════════════════════════════════════
  // Layer 8: AnA Interpretation
  // ════════════════════════════════════════════════════════════════

  private generateAnaInterpretation(
    input: StatisticalInput,
    computation: ComputationResult,
    judgment: JudgmentResult,
    domain: DomainAdaptation,
    regulatory?: RegulatoryCustomization
  ): AnaInterpretation {
    const n = computation.adjustedTotal ?? computation.sampleSize.total;
    const powerPct = (computation.power * 100).toFixed(1);
    const trackLabel = input.clientTrack === 'biotech_pharma' ? 'pharma/biotech'
      : input.clientTrack === 'medical_device' ? 'medical device'
      : 'diagnostics/IVD';

    // Summary
    let summary: string;
    if (judgment.actionRecommendation === 'proceed') {
      summary = `The ${input.studyType} study requires ${n} subjects total to achieve ${powerPct}% power. The design is statistically sound for a ${trackLabel} ${input.objectiveType} study.`;
    } else if (judgment.actionRecommendation === 'proceed_with_conditions') {
      summary = `The study requires ${n} subjects with ${powerPct}% power. The design is acceptable but has conditions: ${judgment.confidence.limitations.slice(0, 2).join('; ')}.`;
    } else if (judgment.actionRecommendation === 'revise') {
      summary = `The current design (N=${n}, power=${powerPct}%) has statistical concerns that should be addressed before proceeding. Key issues: ${judgment.dimensions.filter(d => d.verdict !== 'adequate').map(d => d.name).join(', ')}.`;
    } else {
      summary = `The current design has significant statistical limitations requiring escalation. ${judgment.escalationReasons[0] || 'Multiple dimensions are inadequate.'}`;
    }

    // Suggested next steps
    const suggestedNextSteps: string[] = [];
    if (judgment.actionRecommendation === 'proceed') {
      suggestedNextSteps.push('Generate Sample Size Rationale document');
      suggestedNextSteps.push('Draft SAP section');
      if (regulatory) suggestedNextSteps.push(`Review ${regulatory.body}-specific requirements`);
    } else if (judgment.actionRecommendation === 'proceed_with_conditions') {
      suggestedNextSteps.push('Address noted conditions');
      suggestedNextSteps.push('Generate Design Assumption Note for review');
      suggestedNextSteps.push('Consider sensitivity analysis');
    } else if (judgment.actionRecommendation === 'revise') {
      suggestedNextSteps.push('Review and revise assumptions');
      suggestedNextSteps.push('Generate Statistical Risk Memo');
      suggestedNextSteps.push('Run scenario comparison with revised assumptions');
    } else {
      suggestedNextSteps.push('Escalate to senior biostatistician');
      suggestedNextSteps.push('Generate Statistical Risk Memo for review');
      suggestedNextSteps.push('Consider fundamental design revision');
    }

    // Confidence statement
    let confidenceStatement: string;
    switch (judgment.confidence.level) {
      case 'high':
        confidenceStatement = 'High confidence in these results. Assumptions are well-supported and the design is robust.';
        break;
      case 'moderate':
        confidenceStatement = 'Moderate confidence. Results depend on assumptions that should be verified with study-specific data.';
        break;
      case 'low':
        confidenceStatement = 'Low confidence. Several assumptions are unverified or default values were used. Results are provisional.';
        break;
      case 'very_low':
        confidenceStatement = 'Very low confidence. Multiple critical assumptions are missing or default. These results should not be used for regulatory planning without expert review.';
        break;
    }

    return {
      summary,
      roleSpecific: judgment.roleExplanations,
      suggestedNextSteps,
      confidenceStatement,
      limitations: judgment.confidence.limitations,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Layer 9: Escalation Assessment
  // ════════════════════════════════════════════════════════════════

  private assessEscalation(judgment: JudgmentResult): EscalationInfo {
    const required = judgment.actionRecommendation === 'escalate'
      || judgment.overallRisk === 'critical'
      || judgment.confidence.level === 'very_low';

    if (!required) {
      return {
        required: false,
        reasons: [],
        severity: judgment.overallRisk,
        suggestedAction: 'No escalation needed',
      };
    }

    return {
      required: true,
      reasons: judgment.escalationReasons,
      severity: judgment.overallRisk,
      suggestedAction: judgment.overallRisk === 'critical'
        ? 'Immediate review by senior biostatistician required. Do not proceed with current design.'
        : 'Review by biostatistics lead recommended before finalizing design.',
      handoffArtifactType: 'statistical_risk_memo',
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Error response for invalid input
  // ════════════════════════════════════════════════════════════════

  private buildErrorResponse(
    workflowId: string,
    request: BiostatsWorkflowRequest,
    validation: InputValidationResult
  ): BiostatsWorkflowResponse {
    const errorMessages = validation.errors.map(e => `${e.field}: ${e.message}`);

    return {
      workflowId,
      input: validation.normalizedInput,
      computation: {
        method: 'N/A — input validation failed',
        sampleSize: { perGroup: 0, total: 0, groups: 0 },
        power: 0,
        effectSize: 0,
        alpha: 0,
        attritionAdjusted: false,
        formula: 'N/A',
        assumptions: [],
      },
      judgment: {
        overallVerdict: 'insufficient_information',
        overallRisk: 'critical',
        actionRecommendation: 'escalate',
        confidence: {
          level: 'very_low',
          score: 0,
          factors: [],
          limitations: errorMessages,
        },
        dimensions: [],
        fragility: {
          fragilityIndex: 100,
          category: 'very_fragile',
          sensitiveParameters: [],
          narrative: 'Cannot assess fragility — input validation failed.',
        },
        endpointMethodFit: {
          fit: 'mismatch',
          suggestedMethod: 'N/A',
          currentMethod: 'N/A',
          rationale: 'Cannot assess — input validation failed.',
          alternatives: [],
        },
        escalationReasons: errorMessages,
        roleExplanations: {
          technical: `Input validation failed: ${errorMessages.join('; ')}`,
          clinical: 'Statistical analysis cannot be performed with the current inputs. Please provide the missing information.',
          regulatory: 'Statistical assessment incomplete due to missing inputs.',
          executive: 'Missing information — statistical analysis cannot proceed.',
        },
      },
      domainAdaptation: {
        track: request.input.clientTrack ?? 'biotech_pharma',
        methodSuggestions: [],
        designConsiderations: [],
        endpointGuidance: [],
        regulatoryNotes: [],
        riskFactors: [],
        templateModifiers: {},
        trackSpecificFields: {},
      },
      confidence: {
        level: 'very_low',
        score: 0,
        factors: [],
        limitations: errorMessages,
      },
      workflowActions: [],
      anaInterpretation: {
        summary: `Cannot complete statistical analysis. Missing or invalid inputs: ${errorMessages.join('; ')}`,
        roleSpecific: {
          technical: `Validation errors: ${errorMessages.join('; ')}`,
          clinical: 'Please provide the missing study parameters.',
          regulatory: 'Statistical assessment incomplete.',
          executive: 'Awaiting required inputs.',
        },
        suggestedNextSteps: ['Provide the missing required fields', 'Review input validation errors'],
        confidenceStatement: 'No confidence — input validation failed.',
        limitations: errorMessages,
      },
      escalation: {
        required: false,
        reasons: errorMessages,
        severity: 'critical',
        suggestedAction: 'Provide missing inputs before proceeding.',
      },
    };
  }
}

export const anaBiostatsOrchestrator = new AnaBiostatsOrchestrator();
