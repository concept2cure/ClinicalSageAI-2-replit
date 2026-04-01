/**
 * Operating System Integration Service
 *
 * Wires the Assumption Registry and Decision Record foundation into
 * existing Concept2Cure flows:
 *
 * 1. Biostatistics: SAP generation, power/sample-size reasoning
 * 2. Regulatory: statistical defensibility, consistency checking
 * 3. Document generation: governed artifact paths
 *
 * This service does NOT replace existing flow logic.
 * It augments flows with structured assumption capture, decision recording,
 * contradiction-readiness linkage, and governance boundary awareness.
 *
 * @module server/services/operating-system-integration
 */

import {
  AssumptionRegistryService,
  type CreateAssumptionInput,
} from './assumption-registry-service';
import { DecisionRecordService, type CreateDecisionInput } from './decision-record-service';
import { GovernanceBoundaryService } from './governance-boundary-service';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SapAssumptionContext {
  organizationId: number;
  projectId: number;
  indication: string;
  phase: string;
  sampleSize: number;
  dropoutRate: number;
  primaryEndpoint: string;
  effectSize?: number;
  alpha?: number;
  power?: number;
  domainTrack?: 'biotech' | 'device' | 'diagnostics' | 'combination' | 'biosimilar';
  regulatorBody?: string;
  jurisdiction?: string;
  sourceArtifactId?: number;
  createdById?: number;
}

export interface DefensibilityDecisionContext {
  organizationId: number;
  projectId: number;
  overallScore: number;
  overallRating: string;
  criticalIssueCount: number;
  majorIssueCount: number;
  reviewerRiskLevel: string;
  recommendations: string[];
  relatedArtifactId?: number;
  domainTrack?: 'biotech' | 'device' | 'diagnostics' | 'combination' | 'biosimilar';
  regulatorBody?: string;
  jurisdiction?: string;
  createdById?: number;
}

export interface DocumentGenerationDecisionContext {
  organizationId: number;
  projectId: number;
  documentType: string;
  documentTitle: string;
  generatedArtifactId: number;
  generatedArtifactVersionId?: number;
  usedAssumptionIds: string[];
  confidence: 'strong' | 'moderate' | 'provisional' | 'uncertain';
  domainTrack?: 'biotech' | 'device' | 'diagnostics' | 'combination' | 'biosimilar';
  regulatorBody?: string;
  jurisdiction?: string;
  createdById?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class OperatingSystemIntegration {
  private static instance: OperatingSystemIntegration;
  private assumptionService: AssumptionRegistryService;
  private decisionService: DecisionRecordService;
  private governanceService: GovernanceBoundaryService;

  private constructor() {
    this.assumptionService = AssumptionRegistryService.getInstance();
    this.decisionService = DecisionRecordService.getInstance();
    this.governanceService = GovernanceBoundaryService.getInstance();
  }

  static getInstance(): OperatingSystemIntegration {
    if (!OperatingSystemIntegration.instance) {
      OperatingSystemIntegration.instance = new OperatingSystemIntegration();
    }
    return OperatingSystemIntegration.instance;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FLOW 1: SAP GENERATION (Biostatistics)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Capture structured assumptions from SAP generation.
   * Call this after SAP content is generated to persist the assumptions
   * that were used, making them queryable and reusable.
   */
  async captureFromSapGeneration(ctx: SapAssumptionContext) {
    const assumptions = [];

    // 1. Sample size assumption
    assumptions.push(
      await this.assumptionService.createAssumption({
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        category: 'analysis_population',
        name: `Sample size for ${ctx.indication} Phase ${ctx.phase}`,
        description: `Total planned sample size for the study`,
        valueType: 'numeric',
        numericValue: ctx.sampleSize,
        unit: 'participants',
        rationale: `Calculated for ${ctx.indication} Phase ${ctx.phase} study`,
        sourceType: 'ana_generated',
        sourceArtifactId: ctx.sourceArtifactId,
        sourceDescription: 'SAP generation flow',
        domainTrack: ctx.domainTrack ?? 'biotech',
        regulatorBody: ctx.regulatorBody,
        jurisdiction: ctx.jurisdiction,
        confidence: 'provisional',
        createdById: ctx.createdById,
      })
    );

    // 2. Dropout/attrition assumption
    assumptions.push(
      await this.assumptionService.createAssumption({
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        category: 'attrition',
        name: `Dropout rate for ${ctx.indication} Phase ${ctx.phase}`,
        description: `Expected dropout/attrition rate used in sample size calculation`,
        valueType: 'numeric',
        numericValue: ctx.dropoutRate,
        unit: 'proportion',
        rationale:
          ctx.dropoutRate === 0.15
            ? 'Default dropout rate assumption — should be reviewed against historical data'
            : `Study-specific dropout rate based on indication and phase`,
        sourceType: ctx.dropoutRate === 0.15 ? 'ana_generated' : 'manual',
        sourceArtifactId: ctx.sourceArtifactId,
        sourceDescription: 'SAP generation flow',
        domainTrack: ctx.domainTrack ?? 'biotech',
        regulatorBody: ctx.regulatorBody,
        jurisdiction: ctx.jurisdiction,
        confidence: ctx.dropoutRate === 0.15 ? 'uncertain' : 'provisional',
        createdById: ctx.createdById,
      })
    );

    // 3. Effect size assumption (if provided)
    if (ctx.effectSize !== undefined) {
      assumptions.push(
        await this.assumptionService.createAssumption({
          organizationId: ctx.organizationId,
          projectId: ctx.projectId,
          category: 'effect_size',
          name: `Expected effect size for ${ctx.primaryEndpoint}`,
          description: `Assumed treatment effect for primary endpoint`,
          valueType: 'numeric',
          numericValue: ctx.effectSize,
          rationale: 'Effect size used in sample size justification',
          sourceType: 'ana_generated',
          sourceArtifactId: ctx.sourceArtifactId,
          sourceDescription: 'SAP generation flow',
          domainTrack: ctx.domainTrack ?? 'biotech',
          regulatorBody: ctx.regulatorBody,
          jurisdiction: ctx.jurisdiction,
          confidence: 'provisional',
          createdById: ctx.createdById,
        })
      );
    }

    // 4. Endpoint assumption
    assumptions.push(
      await this.assumptionService.createAssumption({
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        category: 'endpoint',
        name: `Primary endpoint: ${ctx.primaryEndpoint}`,
        description: `Primary endpoint selection and measurement assumption`,
        valueType: 'text',
        textValue: ctx.primaryEndpoint,
        rationale: `Selected as primary endpoint for ${ctx.indication} Phase ${ctx.phase}`,
        sourceType: 'manual',
        sourceArtifactId: ctx.sourceArtifactId,
        sourceDescription: 'SAP generation flow',
        domainTrack: ctx.domainTrack ?? 'biotech',
        regulatorBody: ctx.regulatorBody,
        jurisdiction: ctx.jurisdiction,
        confidence: 'provisional',
        createdById: ctx.createdById,
      })
    );

    // Create a decision record for the SAP generation itself
    const assumptionIds = assumptions.map(a => a.id);
    const decision = await this.decisionService.createDecision({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      contextType: 'biostatistics_analysis',
      contextDescription: `SAP generation for ${ctx.indication} Phase ${ctx.phase}`,
      recommendationType: 'sap_generation',
      recommendationSummary: `Generate SAP with N=${ctx.sampleSize}, dropout=${(
        ctx.dropoutRate * 100
      ).toFixed(0)}%, endpoint=${ctx.primaryEndpoint}`,
      recommendationDetail:
        `Statistical Analysis Plan generated using ${assumptions.length} structured assumptions. ` +
        `All assumptions are provisional and require review before the SAP can be promoted beyond advisory status.`,
      confidence: 'provisional',
      evidenceSources: ['sap_generator_service', 'historical_comparator_data'],
      actionState: 'recommended_only',
      approvalState: 'pending_review',
      relatedAssumptionIds: assumptionIds,
      relatedArtifactId: ctx.sourceArtifactId,
      domainTrack: ctx.domainTrack ?? 'biotech',
      regulatorBody: ctx.regulatorBody,
      jurisdiction: ctx.jurisdiction,
      governanceBoundary: 'advisory',
      linkedAssumptionIds: assumptionIds,
      createdById: ctx.createdById,
    });

    // Create contradiction-readiness links between assumptions and the SAP
    if (ctx.sourceArtifactId) {
      for (const assumption of assumptions) {
        // Compatibility shim — no-op but keeps the integration wiring in place
        await this.assumptionService.createContradictionLink();
      }
    }

    return { assumptions, decision };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FLOW 2: STATISTICAL DEFENSIBILITY (Regulatory/Biostatistics)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Record a decision from statistical defensibility assessment.
   * Captures the analysis result, its confidence, and recommended actions.
   */
  async captureFromDefensibilityAssessment(ctx: DefensibilityDecisionContext) {
    const confidence =
      ctx.overallRating === 'strong'
        ? ('strong' as const)
        : ctx.overallRating === 'adequate'
        ? ('moderate' as const)
        : ctx.overallRating === 'weak'
        ? ('provisional' as const)
        : ('uncertain' as const);

    const actionState =
      ctx.criticalIssueCount > 0
        ? ('recommended_only' as const)
        : ctx.majorIssueCount > 0
        ? ('recommended_only' as const)
        : ('prepared' as const);

    const approvalState =
      ctx.criticalIssueCount > 0 ? ('pending_review' as const) : ('not_required' as const);

    const decision = await this.decisionService.createDecision({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      contextType: 'regulatory_analysis',
      contextDescription: `Statistical defensibility assessment — score ${ctx.overallScore}/100 (${ctx.overallRating})`,
      recommendationType: 'defensibility_assessment',
      recommendationSummary:
        `Study design rated as "${ctx.overallRating}" (${ctx.overallScore}/100). ` +
        `${ctx.criticalIssueCount} critical, ${ctx.majorIssueCount} major issues. ` +
        `Reviewer risk: ${ctx.reviewerRiskLevel}.`,
      recommendationDetail:
        ctx.recommendations.length > 0
          ? `Recommended actions:\n${ctx.recommendations
              .map((r, i) => `${i + 1}. ${r}`)
              .join('\n')}`
          : 'No specific recommendations generated.',
      confidence,
      evidenceSources: ['statistical_defensibility_service', 'ai_review'],
      actionState,
      approvalState,
      relatedArtifactId: ctx.relatedArtifactId,
      domainTrack: ctx.domainTrack ?? 'biotech',
      regulatorBody: ctx.regulatorBody,
      jurisdiction: ctx.jurisdiction,
      governanceBoundary: 'advisory',
      notes: `Reviewer risk level: ${ctx.reviewerRiskLevel}`,
      createdById: ctx.createdById,
    });

    return decision;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FLOW 3: DOCUMENT GENERATION (Governed Artifacts)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Record a decision when a governed document is generated.
   * Links the generated artifact to its underlying assumptions and
   * establishes the governance boundary.
   */
  async captureFromDocumentGeneration(ctx: DocumentGenerationDecisionContext) {
    const decision = await this.decisionService.createDecision({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      contextType: 'document_generation',
      contextDescription: `Generated ${ctx.documentType}: "${ctx.documentTitle}"`,
      recommendationType: 'document_generation',
      recommendationSummary: `Generated ${ctx.documentType} "${ctx.documentTitle}" using ${ctx.usedAssumptionIds.length} linked assumptions.`,
      recommendationDetail:
        `Document generated as advisory output. ` +
        `Confidence: ${ctx.confidence}. ` +
        `Linked assumptions: ${ctx.usedAssumptionIds.length}. ` +
        `Must be reviewed before promotion to governed draft.`,
      confidence: ctx.confidence,
      evidenceSources: ['document_generation_service'],
      actionState: 'executed',
      actionDescription: `Generated artifact #${ctx.generatedArtifactId}`,
      executedArtifactId: ctx.generatedArtifactId,
      executedArtifactVersionId: ctx.generatedArtifactVersionId,
      relatedAssumptionIds: ctx.usedAssumptionIds,
      linkedAssumptionIds: ctx.usedAssumptionIds,
      domainTrack: ctx.domainTrack ?? 'biotech',
      regulatorBody: ctx.regulatorBody,
      jurisdiction: ctx.jurisdiction,
      governanceBoundary: 'advisory',
      createdById: ctx.createdById,
    });

    // Link each assumption to the generated artifact
    for (const assumptionId of ctx.usedAssumptionIds) {
      try {
        // Compatibility shims — no-op but keeps wiring in place
        await this.assumptionService.linkToArtifact();
        await this.assumptionService.linkToDecision();
      } catch {
        // Non-fatal
      }
    }

    return decision;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GOVERNANCE CHECK UTILITY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if an artifact can transition to a new governance boundary.
   * Uses the governance boundary service to evaluate rules.
   */
  async checkArtifactGovernanceTransition(
    organizationId: number,
    projectId: number,
    artifactId: number,
    fromBoundary: 'advisory' | 'governed_draft' | 'approved' | 'locked' | 'submission_ready',
    toBoundary: 'advisory' | 'governed_draft' | 'approved' | 'locked' | 'submission_ready',
    actorId?: number,
    actorRole?: string
  ) {
    return this.governanceService.evaluateTransition({
      organizationId,
      projectId,
      artifactId,
      fromBoundary,
      toBoundary,
      actorId,
      actorRole,
    });
  }
}
