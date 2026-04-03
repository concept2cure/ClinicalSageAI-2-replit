/**
 * Governed Document Evaluator
 *
 * Central orchestrator for the Governed Document Decision Fabric.
 * This is the single entry point that lanes (CMC, Communication Center,
 * generic governed flows) call to evaluate a document action.
 *
 * Orchestrates:
 * 1. Context resolution
 * 2. Readiness evaluation
 * 3. Placement authority
 * 4. Export/publish gating
 * 5. Consequence generation
 * 6. Decision persistence
 *
 * Returns a complete GovernedDocumentEvaluation that the calling lane
 * can use to allow/block/warn on the requested action.
 */

import type {
  GovernedDocumentEvaluation,
  GovernedDecisionSummary,
  GovernedDecisionReference,
  GovernedDecisionOutcome,
  LifecycleReadinessState,
  PlacementAuthorityDecision,
  ExportGateDecision,
  PublishGateDecision,
  DownstreamOperatingConsequence,
  RIMContextHints,
  UIPresentationHints,
} from '../../../shared/types/governed-document-fabric';

import {
  resolveDocumentContext,
  type ContextResolutionInput,
  type ContextResolutionResult,
} from './document-context-resolver';

import {
  evaluateReadiness,
  type ReadinessEvaluationInput,
} from './readiness-gates';

import { evaluatePlacementAuthority } from './placement-authority';

import {
  evaluateExportGate,
  evaluatePublishGate,
  type ExportGateInput,
  type PublishGateInput,
} from './export-publish-gates';

import { generateConsequences } from './document-consequence-engine';

import { recordGovernedDecision } from './governed-decision-service';

export const GOVERNED_DOCUMENT_EVALUATOR_VERSION = '1.0.0';

/**
 * Full evaluation input — what a lane provides to evaluate a governed document action.
 *
 * Combines context resolution input with lane-specific state that the evaluator
 * cannot determine on its own.
 */
export interface GovernedEvaluationInput {
  // Context resolution
  context: ContextResolutionInput;

  // Lane-provided state for readiness evaluation
  documentState: {
    hasContent: boolean;
    hasEvidence: boolean;
    evidenceCount?: number;
    hasBeenReviewed: boolean;
    reviewApprovalCount?: number;
    requiredReviewCount?: number;
    hasApproval: boolean;
    approvalDate?: string;
    hasPlacement: boolean;
    placementValid: boolean;
    hasProvenance: boolean;
    unresolvedContradictionCount: number;
    criticalContradictionCount: number;
    isStale?: boolean;
    staleReason?: string;
    completenessScore?: number;
    missingRequiredFields?: string[];
  };

  // Export-specific state (optional — only needed for export/publish intents)
  exportState?: {
    contentHash?: string;
    humanReviewApproved: boolean;
    aiGenerated: boolean;
    provenanceComplete: boolean;
  };

  // Publish-specific state (optional — only needed for publish/dispatch intents)
  publishState?: {
    exportCompleted: boolean;
    exportHash?: string;
    hasGatewayProfile: boolean;
    gatewayProfileValid: boolean;
    hasSequenceNumber: boolean;
    hasAuthorityProfile: boolean;
    authorityAcceptsFormat: boolean;
    allSectionsApproved: boolean;
    staleSectionCount: number;
  };

  // RIM context (optional — injected by callers that have access to the RIM bridge)
  rimContext?: {
    signalSummary: { totalSignals: number; averageScore: number; overallTrend: string };
    topPatternIds: string[];
    recentBlockerHistory: number;
    hasHighRiskSignals: boolean;
    hasCriticalPatterns: boolean;
    compactSummary: string;
  };
}

/**
 * Result of a governed document evaluation
 */
export interface GovernedEvaluationResult {
  evaluation: GovernedDocumentEvaluation;
  decisionReference: GovernedDecisionReference;
  contextResolution: ContextResolutionResult;
}

/**
 * Evaluate a governed document action.
 *
 * This is the primary entry point for all lanes.
 * Returns a complete evaluation with decision, consequences, and a persistent reference.
 */
export function evaluateGovernedDocument(
  input: GovernedEvaluationInput
): GovernedEvaluationResult {
  const timestamp = new Date().toISOString();

  // 1. Resolve context
  const contextResolution = resolveDocumentContext(input.context);
  const context = contextResolution.context;

  // 2. Evaluate readiness
  const readinessInput: ReadinessEvaluationInput = {
    context,
    ...input.documentState,
    rimContext: input.rimContext ? {
      totalSignals: input.rimContext.signalSummary.totalSignals,
      averageScore: input.rimContext.signalSummary.averageScore,
      overallTrend: input.rimContext.signalSummary.overallTrend,
      recentBlockerHistory: input.rimContext.recentBlockerHistory,
      hasHighRiskSignals: input.rimContext.hasHighRiskSignals,
      hasCriticalPatterns: input.rimContext.hasCriticalPatterns,
    } : undefined,
  };
  const readiness: LifecycleReadinessState = evaluateReadiness(readinessInput);

  // 3. Evaluate placement authority
  const placement: PlacementAuthorityDecision = evaluatePlacementAuthority(context);

  // 4. Evaluate export gate
  let exportGate: ExportGateDecision;
  if (input.exportState) {
    const exportInput: ExportGateInput = {
      context,
      readiness,
      placement,
      hasContent: input.documentState.hasContent,
      contentHash: input.exportState.contentHash,
      hasApproval: input.documentState.hasApproval,
      approvalDate: input.documentState.approvalDate,
      humanReviewApproved: input.exportState.humanReviewApproved,
      aiGenerated: input.exportState.aiGenerated,
      provenanceComplete: input.exportState.provenanceComplete,
      unresolvedContradictionCount: input.documentState.unresolvedContradictionCount,
      isStale: input.documentState.isStale ?? false,
    };
    exportGate = evaluateExportGate(exportInput);
  } else {
    // Default: evaluate with what we have
    exportGate = evaluateExportGate({
      context,
      readiness,
      placement,
      hasContent: input.documentState.hasContent,
      hasApproval: input.documentState.hasApproval,
      humanReviewApproved: false,
      aiGenerated: false,
      provenanceComplete: input.documentState.hasProvenance,
      unresolvedContradictionCount: input.documentState.unresolvedContradictionCount,
      isStale: input.documentState.isStale ?? false,
    });
  }

  // 5. Evaluate publish gate
  let publishGate: PublishGateDecision;
  if (input.publishState) {
    const publishInput: PublishGateInput = {
      context,
      readiness,
      placement,
      hasContent: input.documentState.hasContent,
      contentHash: input.exportState?.contentHash,
      hasApproval: input.documentState.hasApproval,
      approvalDate: input.documentState.approvalDate,
      humanReviewApproved: input.exportState?.humanReviewApproved ?? false,
      aiGenerated: input.exportState?.aiGenerated ?? false,
      provenanceComplete: input.exportState?.provenanceComplete ?? input.documentState.hasProvenance,
      unresolvedContradictionCount: input.documentState.unresolvedContradictionCount,
      isStale: input.documentState.isStale ?? false,
      ...input.publishState,
    };
    publishGate = evaluatePublishGate(publishInput);
  } else {
    // Default minimal publish gate
    publishGate = {
      outcome: 'insufficient_context',
      gateChecks: [],
      blockingReasons: [],
      remediationSteps: [],
      dispatchReady: false,
    };
  }

  // 6. Generate consequences
  const consequences: DownstreamOperatingConsequence[] = generateConsequences({
    context,
    readiness,
    placement,
    exportGate,
    publishGate,
  });

  // 7. Determine overall decision
  const decision = deriveDecision(context, readiness, placement, exportGate, publishGate, consequences);

  // 8. Build RIM context hints
  const rimContextHints: RIMContextHints = {
    readinessLevel: readiness.level,
    blockerCategories: readiness.blockers.map(b => b.category),
    warningCategories: readiness.warnings.map(w => w.category),
    exportGateOutcome: exportGate.outcome,
    publishGateOutcome: publishGate.outcome,
    consequenceTypes: consequences.map(c => c.consequenceType),
    placementOutcome: placement.outcome,
    documentClass: context.documentType,
    regulatorScope: context.regulatorBody,
    submissionType: context.submissionType,
  };

  // 9. Build UI presentation hints
  const uiPresentationHints: UIPresentationHints = buildUIPresentationHints(
    readiness, placement, exportGate, publishGate, decision, consequences
  );

  // 10. Build full evaluation
  const evaluation: GovernedDocumentEvaluation = {
    context,
    readiness,
    placement,
    exportGate,
    publishGate,
    consequences,
    decision,
    rimContextHints,
    uiPresentationHints,
    evaluatedAt: timestamp,
  };

  // 9. Persist decision
  const decisionReference = recordGovernedDecision(evaluation);

  // Update decision with reference
  decision.decisionReference = decisionReference;

  return {
    evaluation,
    decisionReference,
    contextResolution,
  };
}

/**
 * Evaluate a governed document action AND emit the decision to the RIM learning loop.
 *
 * This is the canonical public entry point. All production callers should use this
 * instead of calling evaluateGovernedDocument() + interceptFabricDecision() separately.
 * Evaluation and interception are coupled — you cannot evaluate without learning.
 */
export function evaluateAndInterceptGovernedDocument(
  input: GovernedEvaluationInput
): GovernedEvaluationResult {
  const result = evaluateGovernedDocument(input);

  // Emit to RIM learning loop (non-blocking, fire-and-forget)
  try {
    // Dynamic import to avoid circular dependency
    const bridgeModule = require('../../../server/services/intelligence/fabric-signal-bridge');
    if (bridgeModule?.interceptFabricDecision) {
      bridgeModule.interceptFabricDecision({
        organizationId: Number(result.evaluation.context.organizationId) || 0,
        projectId: Number(result.evaluation.context.projectId) || 0,
        decisionId: result.decisionReference.decisionId,
        intent: result.evaluation.context.intendedAction,
        outcome: result.evaluation.decision.outcome,
        readinessLevel: result.evaluation.readiness.level,
        readinessScore: result.evaluation.readiness.score,
        blockerCount: result.evaluation.decision.blockerCount,
        warningCount: result.evaluation.decision.warningCount,
        blockerCategories: result.evaluation.readiness.blockers.map(
          (b: { category: string }) => b.category
        ),
        exportGateOutcome: result.evaluation.exportGate.outcome,
        publishGateOutcome: result.evaluation.publishGate.outcome,
        consequenceTypes: result.evaluation.consequences.map(
          (c: { consequenceType: string }) => c.consequenceType
        ),
      });
    }
  } catch {
    // RIM bridge unavailable — evaluation still valid
  }

  return result;
}

/**
 * Derive the overall governed decision from all sub-evaluations.
 */
function deriveDecision(
  context: GovernedDocumentEvaluation['context'],
  readiness: LifecycleReadinessState,
  placement: PlacementAuthorityDecision,
  exportGate: ExportGateDecision,
  publishGate: PublishGateDecision,
  consequences: DownstreamOperatingConsequence[]
): GovernedDecisionSummary {
  const intent = context.intendedAction;
  let outcome: GovernedDecisionOutcome;
  const rationale: string[] = [];

  // Count blockers and warnings across all evaluations
  const allBlockers = [
    ...readiness.blockers,
    ...(placement.blockingReasons || []),
    ...exportGate.blockingReasons,
    ...publishGate.blockingReasons,
  ];
  const allWarnings = readiness.warnings;
  const blockerCount = allBlockers.length;
  const warningCount = allWarnings.length;
  const consequenceCount = consequences.length;
  const criticalBlockers = allBlockers.filter(b => b.severity === 'critical');

  // Determine outcome based on intent and evaluation results
  if (criticalBlockers.length > 0) {
    outcome = 'block';
    rationale.push(`${criticalBlockers.length} critical blocker(s) prevent ${intent}`);
  } else if (readiness.level === 'blocked') {
    outcome = 'block';
    rationale.push(`Readiness is blocked — cannot ${intent}`);
  } else if (readiness.level === 'degraded' || readiness.confidence === 'insufficient') {
    outcome = 'degraded';
    rationale.push(`Evaluation is degraded — insufficient context for confident decision`);
  } else {
    // Intent-specific gating
    switch (intent) {
      case 'export':
        if (exportGate.outcome === 'blocked') {
          outcome = 'block';
          rationale.push('Export gate checks failed');
        } else if (exportGate.outcome === 'insufficient_context') {
          outcome = 'review';
          rationale.push('Export gate has insufficient context — manual review recommended');
        } else {
          outcome = 'allow';
          rationale.push('Export gate passed');
        }
        break;

      case 'publish':
      case 'dispatch':
        if (publishGate.outcome === 'blocked') {
          outcome = 'block';
          rationale.push('Publish gate checks failed');
        } else if (publishGate.outcome === 'insufficient_context') {
          outcome = 'review';
          rationale.push('Publish gate has insufficient context — manual review recommended');
        } else {
          outcome = 'allow';
          rationale.push('Publish gate passed');
        }
        break;

      case 'place':
      case 'relocate':
        if (placement.outcome === 'blocked') {
          outcome = 'block';
          rationale.push('Placement authority denied');
        } else if (placement.outcome === 'insufficient_context') {
          outcome = 'review';
          rationale.push('Placement has insufficient context');
        } else {
          outcome = 'allow';
          rationale.push(`Placement ${placement.outcome === 'fallback_allowed' ? 'allowed with fallback' : 'allowed'}`);
        }
        break;

      default:
        // For create, update, promote, approve, lock, archive, rollback, compile, refresh
        if (blockerCount > 0) {
          outcome = 'review';
          rationale.push(`${blockerCount} blocker(s) detected — review recommended`);
        } else {
          outcome = 'allow';
          rationale.push(`${intent} action allowed`);
        }
        break;
    }
  }

  return {
    decisionId: '', // Will be set by recordGovernedDecision
    outcome,
    intent,
    rationale: rationale.join('; '),
    blockerCount,
    warningCount,
    consequenceCount,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build compact UI presentation hints from the evaluation.
 */
function buildUIPresentationHints(
  readiness: LifecycleReadinessState,
  placement: PlacementAuthorityDecision,
  exportGate: ExportGateDecision,
  publishGate: PublishGateDecision,
  decision: GovernedDecisionSummary,
  consequences: DownstreamOperatingConsequence[]
): UIPresentationHints {
  const gateTone = (outcome: string): 'green' | 'amber' | 'red' | 'stone' => {
    if (outcome === 'eligible') return 'green';
    if (outcome === 'blocked') return 'red';
    if (outcome === 'insufficient_context') return 'stone';
    return 'amber';
  };

  const readinessTone = (): 'green' | 'amber' | 'red' | 'stone' => {
    if (readiness.level === 'blocked') return 'red';
    if (readiness.level === 'degraded') return 'stone';
    if (['publish_ready', 'export_ready'].includes(readiness.level)) return 'green';
    return 'amber';
  };

  const nextAction = deriveNextAction(readiness, exportGate, publishGate, consequences);

  return {
    readinessBadge: {
      label: readiness.level.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      tone: readinessTone(),
    },
    exportBadge: { label: exportGate.outcome, tone: gateTone(exportGate.outcome) },
    publishBadge: { label: publishGate.outcome, tone: gateTone(publishGate.outcome) },
    topBlockerMessages: readiness.blockers.slice(0, 3).map(b => b.message),
    topWarningMessages: readiness.warnings.slice(0, 3).map(w => w.message),
    nextRecommendedAction: nextAction,
    placementLabel: placement.canonicalDestination
      ? `${placement.outcome} (${placement.canonicalDestination})`
      : placement.outcome,
    decisionOutcomeLabel: decision.outcome,
  };
}

/**
 * Derive the next recommended action based on the evaluation state.
 */
function deriveNextAction(
  readiness: LifecycleReadinessState,
  exportGate: ExportGateDecision,
  publishGate: PublishGateDecision,
  consequences: DownstreamOperatingConsequence[]
): string {
  if (readiness.level === 'blocked') {
    const topBlocker = readiness.blockers[0];
    return topBlocker?.remediationHint || 'Resolve critical blockers before proceeding';
  }
  if (readiness.level === 'evidence_gap') return 'Add evidence to support document claims';
  if (readiness.level === 'draft') return 'Complete document content';
  if (readiness.level === 'review_ready') return 'Submit for review';
  if (readiness.level === 'approval_ready') return 'Submit for approval';
  if (readiness.level === 'export_ready') {
    if (exportGate.outcome === 'blocked') {
      return exportGate.remediationSteps?.[0] || 'Resolve export gate issues';
    }
    return 'Document is ready for export';
  }
  if (readiness.level === 'publish_ready') {
    if (publishGate.outcome === 'blocked') {
      return publishGate.remediationSteps?.[0] || 'Resolve publish gate issues';
    }
    return 'Document is ready for publishing';
  }
  return 'Continue working on document';
}
