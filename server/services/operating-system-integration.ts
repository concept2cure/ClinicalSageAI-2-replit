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
  LedgerInputRefusal,
  type AssumptionCategory,
  type AssumptionRecord,
  type ConfidenceLevel,
  type SourceType,
} from './assumption-registry-service';
import { DecisionRecordService, type DecisionRecord } from './decision-record-service';
/* domain_track on the governance ledger is a DISCIPLINE. These three contexts
   used to declare it as the product-modality vocabulary (biotech, device,
   diagnostics, combination, biosimilar) -- a different column of the same name
   on shared/schema/operating-system.ts. Every write here was therefore
   rejected by the CHECK constraint and swallowed, and both registries stayed
   empty. SAP generation and statistical defensibility are biostatistics; see
   server/services/domain-track.ts. */
import { DEFAULT_DOMAIN_TRACK, type DomainTrack } from './domain-track';
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
  /** As the SAP request stated it; absent when it did not (it was 0.15). */
  dropoutRate?: number;
  primaryEndpoint: string;
  effectSize?: number;
  alpha?: number;
  power?: number;
  domainTrack?: DomainTrack;
  regulatorBody?: string;
  jurisdiction?: string;
  sourceArtifactId?: number;
  createdById?: number;
}

/**
 * A deterministic defensibility verdict (statistical-defensibility-service.ts,
 * the ana-biostats judgment engine). Until 2026-10-05 this carried a model's
 * 0-100 score, rating and issue counts.
 */
export interface DefensibilityDecisionContext {
  organizationId: number;
  projectId: number;
  overallVerdict: 'adequate' | 'marginal' | 'inadequate' | 'insufficient_information';
  overallRisk: 'low' | 'moderate' | 'high' | 'critical';
  actionRecommendation: 'proceed' | 'proceed_with_conditions' | 'revise' | 'escalate';
  /** Dimensions the engine judged inadequate, and marginal. */
  inadequateDimensions: string[];
  marginalDimensions: string[];
  escalationReasons: string[];
  relatedArtifactId?: number;
  domainTrack?: DomainTrack;
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
  /** As the caller stated it, in the ledger's vocabulary; absent is none. */
  confidence?: ConfidenceLevel | null;
  domainTrack?: DomainTrack;
  regulatorBody?: string;
  jurisdiction?: string;
  createdById?: number;
}

/**
 * A SAP capture that stopped part-way: the assumptions in
 * `writtenAssumptionIds` were stored before it did, and no decision was. The
 * caller reports what is in the registry rather than a bare driver error.
 */
export class SapCaptureIncomplete extends Error {
  constructor(
    readonly failure: unknown,
    readonly writtenAssumptionIds: string[],
  ) {
    super(`SAP inputs were not fully recorded: ${failure instanceof Error ? failure.message : String(failure)}`);
    this.name = 'SapCaptureIncomplete';
  }
}

/**
 * Who a ledger entry is recorded as. An absent user was recorded as 'system'
 * (decided_by / created_by) until 2026-10-15; now nothing is recorded.
 */
function requireActor(createdById: unknown, flow: string): number {
  const id = Number(createdById);
  if (Number.isInteger(id) && id > 0) return id;
  throw new LedgerInputRefusal(
    'createdBy',
    `${flow}: no authenticated user, so nothing was recorded. A ledger entry names who made it; it is not recorded as 'system'.`,
  );
}

/** '3' and 'Phase 3' both read 'Phase 3' (titles said "Phase Phase 3"). */
const phaseLabel = (phase: string) => (/^phase\b/i.test(phase.trim()) ? phase.trim() : `Phase ${phase}`);

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
   * Record the SAP's stated inputs in the assumption registry, and the SAP
   * itself as a decision.
   *
   * Until 2026-10-15 every value written here was outside the registry's
   * vocabulary (category 'analysis_population' / 'attrition', source
   * 'ana_generated' / 'manual', confidence 'provisional' / 'uncertain'), so the
   * first INSERT failed and the caller logged it as non-fatal: no SAP ever
   * recorded an assumption. Each input is now recorded in the registry's own
   * terms, only when the request stated it, with no confidence — nobody stated
   * one. The source is 'sap' for the SAP's planning figures and
   * 'sponsor_decision' for what the sponsor chose (the endpoint, and a dropout
   * rate the request named): the split the old 'ana_generated' / 'manual' drew.
   * A failure part-way throws SapCaptureIncomplete, naming what was written.
   */
  async captureFromSapGeneration(ctx: SapAssumptionContext): Promise<{
    assumptions: AssumptionRecord[];
    decision: DecisionRecord;
    notCaptured: string[];
  }> {
    const createdById = requireActor(ctx.createdById, 'captureFromSapGeneration');
    const study = `${ctx.indication} ${phaseLabel(ctx.phase)}`;
    const base = {
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      sourceArtifactId: ctx.sourceArtifactId,
      sourceDescription: 'SAP generation request',
      domainTrack: ctx.domainTrack ?? 'biostatistics',
      regulatorBody: ctx.regulatorBody,
      jurisdiction: ctx.jurisdiction,
      createdById,
    };
    const stated = (category: AssumptionCategory, sourceType: SourceType, fields: Record<string, unknown>) => ({
      ...base,
      category,
      sourceType,
      ...fields,
    });

    const inputs: Array<Record<string, unknown>> = [
      stated('enrollment', 'sap', {
        name: `Sample size for ${study}`,
        description: 'Total planned sample size for the study',
        numericValue: ctx.sampleSize,
        unit: 'participants',
        rationale: 'Planned sample size as stated in the SAP request; not computed by the generator',
      }),
    ];
    const notCaptured: string[] = [];
    if (ctx.dropoutRate != null) {
      inputs.push(
        stated('dropout', 'sponsor_decision', {
          name: `Dropout rate for ${study}`,
          description: 'Expected dropout rate',
          numericValue: ctx.dropoutRate,
          unit: 'proportion',
          rationale: 'Dropout rate as stated in the SAP request',
        }),
      );
    } else {
      notCaptured.push('dropout rate (not specified in the SAP request)');
    }
    if (ctx.effectSize != null) {
      inputs.push(
        stated('effect_size', 'sap', {
          // The request's minimum_detectable_effect: it was titled an "expected
          // effect size", which is a different figure.
          name: `Minimum detectable effect for ${ctx.primaryEndpoint}`,
          description: 'Minimum detectable effect for the primary endpoint',
          numericValue: ctx.effectSize,
          rationale: 'Minimum detectable effect as stated in the SAP request; not computed by the generator',
        }),
      );
    } else {
      notCaptured.push('minimum detectable effect (not specified in the SAP request)');
    }
    inputs.push(
      stated('endpoint', 'sponsor_decision', {
        name: `Primary endpoint: ${ctx.primaryEndpoint}`,
        description: 'Primary endpoint',
        textValue: ctx.primaryEndpoint,
        rationale: 'Primary endpoint as stated in the SAP request',
      }),
    );

    const assumptions: AssumptionRecord[] = [];
    try {
      for (const input of inputs) {
        assumptions.push(await this.assumptionService.createAssumption(input));
      }

      // Create a decision record for the SAP generation itself
      const assumptionIds = assumptions.map(a => a.id);
      const decision = await this.decisionService.createDecision({
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        contextType: 'biostatistics_analysis',
        contextDescription: `SAP generation for ${study}`,
        /* recommendation_type carries a CHECK naming twelve types; the three
            descriptive labels this file used ('sap_generation',
            'defensibility_assessment', 'document_generation') are not among
            them, so every decision write here was rejected alongside the
            domainTrack above. The label is kept below, where it reaches
            decision_context and stays queryable. */
        recommendationType: 'statistical_method',
        analysisKind: 'sap_generation',
        recommendationSummary: `Generate SAP with N=${ctx.sampleSize}, dropout=${
          ctx.dropoutRate == null ? 'not specified' : `${(ctx.dropoutRate * 100).toFixed(0)}%`
        }, endpoint=${ctx.primaryEndpoint}`,
        recommendationDetail:
          `Statistical Analysis Plan generated using ${assumptions.length} structured assumptions, recorded as the SAP request stated them. ` +
          `None has been reviewed; each requires review before the SAP can be promoted beyond advisory status.`,
        // No confidence: nobody stated one. It was 'provisional', which the
        // column refuses (2026-10-15).
        evidenceSources: ['sap_generator_service', 'historical_comparator_data'],
        actionState: 'recommended_only',
        approvalState: 'pending_review',
        relatedAssumptionIds: assumptionIds,
        relatedArtifactId: ctx.sourceArtifactId,
        domainTrack: ctx.domainTrack ?? 'biostatistics',
        regulatorBody: ctx.regulatorBody,
        jurisdiction: ctx.jurisdiction,
        governanceBoundary: 'advisory',
        linkedAssumptionIds: assumptionIds,
        createdById,
      });

      // Create contradiction-readiness links between assumptions and the SAP
      if (ctx.sourceArtifactId) {
        for (const assumption of assumptions) {
          // Compatibility shim — no-op but keeps the integration wiring in place
          await this.assumptionService.createContradictionLink();
        }
      }

      return { assumptions, decision, notCaptured };
    } catch (err) {
      throw new SapCaptureIncomplete(err, assumptions.map(a => a.id));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FLOW 2: STATISTICAL DEFENSIBILITY (Regulatory/Biostatistics)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Record a decision from statistical defensibility assessment.
   * Captures the analysis result and the recommended action.
   */
  async captureFromDefensibilityAssessment(ctx: DefensibilityDecisionContext) {
    // A verdict is not a confidence. This mapped 'adequate' -> 'strong',
    // 'marginal' -> 'moderate' and anything else -> 'uncertain' (three of them
    // outside the column's CHECK) until 2026-10-15. The verdict is in the
    // summary; a confidence is the decider's to state, and nobody has.
    const createdById = requireActor(ctx.createdById, 'captureFromDefensibilityAssessment');

    const actionState =
      ctx.actionRecommendation === 'proceed' ? ('prepared' as const) : ('recommended_only' as const);

    const approvalState =
      ctx.actionRecommendation === 'escalate' || ctx.inadequateDimensions.length > 0
        ? ('pending_review' as const)
        : ('not_required' as const);

    const named = (label: string, list: string[]) => (list.length > 0 ? `${label}: ${list.join(', ')}. ` : '');

    const decision = await this.decisionService.createDecision({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      contextType: 'regulatory_analysis',
      contextDescription: `Statistical defensibility assessment — ${ctx.overallVerdict} (${ctx.overallRisk} risk)`,
      // See the note in captureFromSapGeneration: a defensibility assessment
      // rates the study design, which is the type the column accepts.
      recommendationType: 'study_design',
      analysisKind: 'defensibility_assessment',
      recommendationSummary:
        `Study design judged "${ctx.overallVerdict}", risk ${ctx.overallRisk}; ` +
        `recommended action: ${ctx.actionRecommendation}. ` +
        named('Inadequate', ctx.inadequateDimensions) +
        named('Marginal', ctx.marginalDimensions),
      recommendationDetail:
        ctx.escalationReasons.length > 0
          ? `Escalation reasons:\n${ctx.escalationReasons.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
          : 'No escalation reasons.',
      evidenceSources: ['statistical_defensibility_service', 'deterministic_judgment_engine'],
      actionState,
      approvalState,
      relatedArtifactId: ctx.relatedArtifactId,
      domainTrack: ctx.domainTrack ?? 'biostatistics',
      regulatorBody: ctx.regulatorBody,
      jurisdiction: ctx.jurisdiction,
      governanceBoundary: 'advisory',
      notes: `Overall risk: ${ctx.overallRisk}`,
      createdById,
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
    const createdById = requireActor(ctx.createdById, 'captureFromDocumentGeneration');
    const decision = await this.decisionService.createDecision({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      contextType: 'document_generation',
      contextDescription: `Generated ${ctx.documentType}: "${ctx.documentTitle}"`,
      // See the note in captureFromSapGeneration: a generated document is a
      // decision about what enters the submission data package.
      recommendationType: 'data_package',
      analysisKind: 'document_generation',
      recommendationSummary: `Generated ${ctx.documentType} "${ctx.documentTitle}" using ${ctx.usedAssumptionIds.length} linked assumptions.`,
      recommendationDetail:
        `Document generated as advisory output. ` +
        `Confidence: ${ctx.confidence ?? 'not stated'}. ` +
        `Linked assumptions: ${ctx.usedAssumptionIds.length}. ` +
        `Must be reviewed before promotion to governed draft.`,
      confidence: ctx.confidence ?? null,
      evidenceSources: ['document_generation_service'],
      actionState: 'executed',
      actionDescription: `Generated artifact #${ctx.generatedArtifactId}`,
      executedArtifactId: ctx.generatedArtifactId,
      executedArtifactVersionId: ctx.generatedArtifactVersionId,
      relatedAssumptionIds: ctx.usedAssumptionIds,
      linkedAssumptionIds: ctx.usedAssumptionIds,
      // Document generation spans every discipline, so there is nothing to
      // derive from here; the ledger's own default stands until the caller
      // supplies the track.
      domainTrack: ctx.domainTrack ?? DEFAULT_DOMAIN_TRACK,
      regulatorBody: ctx.regulatorBody,
      jurisdiction: ctx.jurisdiction,
      governanceBoundary: 'advisory',
      createdById,
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
