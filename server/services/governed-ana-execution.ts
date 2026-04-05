import {
  evaluateAndInterceptGovernedDocument,
  type GovernedEvaluationInput,
} from '../src/control-plane/governed-document-evaluator.js';
import { hasUnresolvedGovernedDecisions } from './governed-decision-repository.js';
import { integrateSignal } from './intelligence/rim-integration.js';
import { tagArtifact, type TagArtifactResult } from './artifact-tagger.js';
import type {
  CanonicalGovernedState,
  GovernedArtifactMutationContract,
  GovernedLearningEvent,
} from '../../shared/types/governed-document-fabric.js';

interface ExecuteGovernedAnaOperationInput {
  evaluationInput: GovernedEvaluationInput;
  artifactMutation?: GovernedArtifactMutationContract;
}

interface ExecuteGovernedAnaOperationResult {
  artifactMutation: TagArtifactResult | null;
  canonicalGovernedState: CanonicalGovernedState;
  decisionReference: string;
  learningEventReference: string;
  executionTrace: {
    evaluatedAt: string;
    persistedAt: string;
    qualityGrade: string;
    intent: string;
    outcome: string;
  };
  qualityGateResult: GovernedArtifactMutationContract['qualityGate'];
  persistenceStatus: 'persisted' | 'rejected' | 'failed' | 'not_requested';
}

const MIN_CONTENT_THRESHOLD = 80;
const PLACEHOLDER_PATTERNS = [
  /lorem ipsum/i,
  /\bplaceholder\b/i,
  /\btbd\b/i,
  /\bto be determined\b/i,
  /\bcoming soon\b/i,
  /\binsert .* here\b/i,
];

function normalizeOutcomeLabel(outcome: string): 'pass' | 'warn' | 'fail' {
  if (outcome === 'allow') return 'pass';
  if (outcome === 'review' || outcome === 'degraded') return 'warn';
  return 'fail';
}

function validateGovernedMutation(contract: GovernedArtifactMutationContract): {
  ok: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  const trimmed = contract.content.trim();

  if (trimmed.length < MIN_CONTENT_THRESHOLD) {
    issues.push(`Content below minimum threshold (${MIN_CONTENT_THRESHOLD} chars)`);
  }
  if (!contract.title?.trim()) issues.push('Title is required');
  if (!contract.documentType?.trim()) issues.push('Document type is required');
  if (!trimmed) issues.push('Content is empty');

  const hasPlaceholder = PLACEHOLDER_PATTERNS.some(pattern => pattern.test(trimmed));
  if (hasPlaceholder) issues.push('Content includes placeholder/filler patterns');

  if (contract.structureSections.length > 0) {
    const missingSections = contract.structureSections.filter(
      section => !trimmed.toLowerCase().includes(section.toLowerCase())
    );
    if (missingSections.length > 0) {
      issues.push(`Missing required structure sections: ${missingSections.slice(0, 3).join(', ')}`);
    }
  }

  if (/(risk_memo|strategy_note|reviewer_question_brief|deficiency_preemption_memo)/i.test(contract.documentType)) {
    if (!/\[(KNOWN|INFERRED|MISSING)\]/.test(trimmed)) {
      issues.push('Evidence labeling is required ([KNOWN]/[INFERRED]/[MISSING])');
    }
  }

  return { ok: issues.length === 0, issues };
}

function buildDerivedFlags(state: CanonicalGovernedState): CanonicalGovernedState['derivedFlags'] {
  const blockers = state.blockers;
  return {
    isBlocked: state.decision.outcome === 'block',
    isReviewRequired: state.decision.outcome === 'review',
    isExportReady: state.exportDecision.outcome === 'eligible',
    isPublishReady: state.publishDecision.outcome === 'eligible' && state.publishDecision.dispatchReady,
    hasUnresolvedGovernedDecisions: state.decisionLifecycle.hasUnresolved,
    hasCriticalContradictions: blockers.some(b => b.category === 'unresolved_contradiction' && b.severity === 'critical'),
    hasPlacementGap: blockers.some(b => b.category === 'missing_placement'),
    hasEvidenceGap: blockers.some(b => b.category === 'missing_evidence') || state.readinessState.level === 'evidence_gap',
    requiresHumanApproval: blockers.some(b => b.category === 'missing_approval' || b.category === 'missing_review'),
    isDegraded: state.decision.outcome === 'degraded' || state.readinessState.level === 'degraded',
  };
}

export async function buildCanonicalGovernedState(
  input: GovernedEvaluationInput,
): Promise<CanonicalGovernedState> {
  const evaluated = evaluateAndInterceptGovernedDocument(input);
  const orgId = Number(evaluated.evaluation.context.organizationId) || 0;
  const projectId = Number(evaluated.evaluation.context.projectId) || 0;

  const lifecycle = await hasUnresolvedGovernedDecisions(projectId, orgId);
  const blockers = [
    ...evaluated.evaluation.readiness.blockers,
    ...(evaluated.evaluation.placement.blockingReasons || []),
    ...evaluated.evaluation.exportGate.blockingReasons,
    ...evaluated.evaluation.publishGate.blockingReasons,
  ];

  const canonical: CanonicalGovernedState = {
    context: evaluated.evaluation.context,
    decision: evaluated.evaluation.decision,
    readinessState: evaluated.evaluation.readiness,
    blockers,
    warnings: evaluated.evaluation.readiness.warnings,
    placementDecision: evaluated.evaluation.placement,
    exportDecision: evaluated.evaluation.exportGate,
    publishDecision: evaluated.evaluation.publishGate,
    nextRecommendedAction: evaluated.evaluation.uiPresentationHints?.nextRecommendedAction ||
      (evaluated.evaluation.decision.outcome === 'block' ? 'Resolve blockers before retrying mutation' : 'Proceed with governed flow'),
    downstreamConsequences: evaluated.evaluation.consequences,
    decisionReference: evaluated.decisionReference,
    uiPresentationHints: evaluated.evaluation.uiPresentationHints,
    rimContextHints: evaluated.evaluation.rimContextHints,
    decisionLifecycle: lifecycle,
    artifactBinding: {
      artifactId: evaluated.evaluation.context.artifactId,
      artifactVersionId: evaluated.evaluation.context.artifactVersionId,
      sectionCode: evaluated.evaluation.context.sectionCode,
      placementTarget: evaluated.evaluation.context.intendedPlacementTarget,
    },
    stateFreshness: {
      evaluatedAt: evaluated.evaluation.evaluatedAt,
      generatedAt: new Date().toISOString(),
    },
    derivedFlags: {
      isBlocked: false,
      isReviewRequired: false,
      isExportReady: false,
      isPublishReady: false,
      hasUnresolvedGovernedDecisions: false,
      hasCriticalContradictions: false,
      hasPlacementGap: false,
      hasEvidenceGap: false,
      requiresHumanApproval: false,
      isDegraded: false,
    },
  };
  canonical.derivedFlags = buildDerivedFlags(canonical);

  return canonical;
}

export async function emitGovernedLearningEvent(event: GovernedLearningEvent): Promise<string> {
  const result = integrateSignal(
    {
      organizationId: event.organizationId,
      projectId: event.projectId,
      artifactId: event.artifactId,
      runType: 'manual_capture',
    },
    {
      type: 'cross_module',
      riskLevel: event.outcome === 'block' ? 'critical' : event.outcome === 'degraded' ? 'high' : 'low',
      reviewerSensitivity: event.outcome === 'block' ? 'likely_question' : 'possible_question',
      defensibilityVerdict: normalizeOutcomeLabel(event.outcome) === 'pass' ? 'acceptable' : 'at_risk',
      score: event.readinessScore,
      confidence: Math.max(30, Math.min(95, event.readinessScore)),
      action: `Governed ${event.intent} outcome=${event.outcome}`,
      patternIds: [],
      metadata: {
        source: 'governed_ana_execution',
        ...event,
      },
    }
  );

  return result.runId;
}

export async function executeGovernedAnaOperation(
  input: ExecuteGovernedAnaOperationInput,
): Promise<ExecuteGovernedAnaOperationResult> {
  const canonical = await buildCanonicalGovernedState(input.evaluationInput);

  const qualityGate = input.artifactMutation?.qualityGate || {
    grade: 'unknown',
    pass: false,
    issues: ['Mutation contract missing'],
  };

  let mutationResult: TagArtifactResult | null = null;
  let persistenceStatus: ExecuteGovernedAnaOperationResult['persistenceStatus'] = 'not_requested';

  if (input.artifactMutation) {
    const validation = validateGovernedMutation(input.artifactMutation);
    const blocked = canonical.derivedFlags.isBlocked || canonical.derivedFlags.hasUnresolvedGovernedDecisions;

    if (!validation.ok || blocked) {
      persistenceStatus = 'rejected';
    }

    if (validation.ok && !canonical.derivedFlags.isBlocked && !canonical.derivedFlags.hasUnresolvedGovernedDecisions) {
      try {
        mutationResult = await tagArtifact({
          projectId: input.artifactMutation.projectId,
          organizationId: input.artifactMutation.organizationId,
          userId: Number(input.evaluationInput.context.actorId) || 0,
          artifactId: input.artifactMutation.artifactId,
          sectionCode: input.artifactMutation.sectionCode || 'ana-governed',
          title: input.artifactMutation.title,
          content: input.artifactMutation.content,
          status: input.artifactMutation.status,
          source: 'ana_ri',
          metadata: {
            governedMutationContract: input.artifactMutation,
            qualityValidationIssues: validation.issues,
            decisionReference: canonical.decisionReference.decisionId,
          },
        });
        persistenceStatus = 'persisted';
      } catch {
        persistenceStatus = 'failed';
      }
    }
  }

  const learningEventReference = await emitGovernedLearningEvent({
    organizationId: Number(canonical.context.organizationId) || 0,
    projectId: Number(canonical.context.projectId) || 0,
    artifactId: mutationResult?.artifactId ? String(mutationResult.artifactId) : canonical.context.artifactId,
    decisionId: canonical.decisionReference.decisionId,
    intent: canonical.context.intendedAction,
    outcome: canonical.decision.outcome,
    readinessLevel: canonical.readinessState.level,
    readinessScore: canonical.readinessState.score,
    blockerCategories: canonical.blockers.map(b => b.category),
    warningCategories: canonical.warnings.map(w => w.category),
    placementOutcome: canonical.placementDecision.outcome,
    exportGateOutcome: canonical.exportDecision.outcome,
    publishGateOutcome: canonical.publishDecision.outcome,
    unresolvedDecisionCount: canonical.decisionLifecycle.unresolvedCount,
    criticalContradictionCount: canonical.blockers.filter(
      b => b.category === 'unresolved_contradiction' && b.severity === 'critical'
    ).length,
    documentType: canonical.context.documentType,
    submissionType: canonical.context.submissionType,
    regulatorBody: canonical.context.regulatorBody,
    originSurface: canonical.context.originSurface,
    qualityGateGrade: input.artifactMutation?.qualityGate.grade,
    artifactMutationType: input.artifactMutation?.artifactClass || 'none',
    executedAt: new Date().toISOString(),
  });

  return {
    artifactMutation: mutationResult,
    canonicalGovernedState: canonical,
    decisionReference: canonical.decisionReference.decisionId,
    learningEventReference,
    executionTrace: {
      evaluatedAt: canonical.stateFreshness.evaluatedAt,
      persistedAt: new Date().toISOString(),
      qualityGrade: input.artifactMutation?.qualityGate.grade || 'n/a',
      intent: canonical.context.intendedAction,
      outcome: canonical.decision.outcome,
    },
    qualityGateResult: qualityGate,
    persistenceStatus,
  };
}
