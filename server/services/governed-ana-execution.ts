import {
  evaluateAndInterceptGovernedDocument,
  type GovernedEvaluationInput,
} from '../src/control-plane/governed-document-evaluator.js';
import { hasUnresolvedGovernedDecisions } from './governed-decision-repository.js';
import { governedDecisionPersisted } from './governed-decision-ledger.js';
import { integrateSignal } from './intelligence/rim-integration.js';
import { ArtifactWriteRefusedError, tagArtifact, type ArtifactWriteHook, type TagArtifactResult } from './artifact-tagger.js';
import type {
  CanonicalGovernedState,
  GovernedArtifactMutationContract,
  GovernedLearningEvent,
} from '../../shared/types/governed-document-fabric.js';
import {
  resolveToRegistryEntry,
  resolveToDeficiencyType,
  getSubmissionTypeContext,
  type SubmissionTypeContext,
} from '../../shared/regulatory/submission-type-bridge.js';

interface ExecuteGovernedAnaOperationInput {
  evaluationInput: GovernedEvaluationInput;
  artifactMutation?: GovernedArtifactMutationContract;
  /**
   * Handed to tagArtifact: runs inside the artifact write's own transaction,
   * before COMMIT. A throw rolls the write back (persistenceStatus 'failed').
   * Used by AnA revert_to_version to sign the version in the transaction that
   * writes it.
   */
  inTransaction?: ArtifactWriteHook;
}

interface ExecuteGovernedAnaOperationResult {
  artifactMutation: TagArtifactResult | null;
  canonicalGovernedState: CanonicalGovernedState;
  decisionReference: string;
  /** Whether the governed decision's ledger row was written; its id is handed out before the queued insert runs. */
  decisionPersisted: boolean;
  /**
   * The RIM run the learning signal was captured under — RIM's working memory;
   * nothing here persists it. Null when it was not captured, and
   * learningEventFailure says why.
   */
  learningEventReference: string | null;
  learningEventFailure?: string;
  executionTrace: {
    evaluatedAt: string;
    persistedAt: string;
    qualityGrade: string;
    intent: string;
    outcome: string;
  };
  qualityGateResult: GovernedArtifactMutationContract['qualityGate'];
  persistenceStatus: 'persisted' | 'rejected' | 'failed' | 'not_requested';
  /**
   * Why the write was refused, when it was: the artifact writer's words
   * (ArtifactWriteRefusedError), or UNATTRIBUTABLE_ACTOR when no user is named.
   */
  persistenceRefusal?: { code: ArtifactWriteRefusedError['code'] | 'UNATTRIBUTABLE_ACTOR'; message: string };
}

/** A positive integer id, or null — never 0 standing in for "none". */
function positiveIntegerId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
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

// ─── Submission Type Bridge Resolution ───────────────────────────────────────
// Resolves the raw submissionType from the evaluation context via the canonical
// bridge. Returns enriched context or null if the type is unknown/absent.

interface ResolvedSubmissionContext {
  /** Canonical registry ID (e.g. 'US_IND', 'EU_MAA') */
  registryId: string;
  /** Deficiency-taxonomy-compatible type for intelligence services */
  deficiencyType: string;
  /** Full context from bridge (display name, agency, region, etc.) */
  bridgeContext: SubmissionTypeContext;
}

function resolveSubmissionTypeFromContext(
  submissionType: string | undefined,
): ResolvedSubmissionContext | null {
  if (!submissionType) return null;
  const entry = resolveToRegistryEntry(submissionType);
  if (!entry) return null;
  const bridgeContext = getSubmissionTypeContext(submissionType);
  if (!bridgeContext) return null;
  return {
    registryId: bridgeContext.registryId,
    deficiencyType: resolveToDeficiencyType(submissionType),
    bridgeContext,
  };
}

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

/**
 * `decisionPersisted` says whether the governed decision's ledger row was
 * written. The evaluator hands out the reference before its queued insert runs,
 * and every caller shows the id; it is awaited here so none shows it blind.
 */
export async function buildCanonicalGovernedState(
  input: GovernedEvaluationInput,
): Promise<CanonicalGovernedState & { decisionPersisted: boolean }> {
  // Refused before anything is evaluated or recorded. This was
  // `Number(organizationId) || 0` until 2026-10-15: an absent organization was
  // read as org 0, and the unresolved-decision gate below answered for it.
  const orgId = positiveIntegerId(input.context.organizationId);
  if (orgId === null) {
    throw new Error(
      `Governed evaluation refused: ${JSON.stringify(input.context.organizationId)} is not an organization id, ` +
        'so its unresolved governed decisions cannot be read.',
    );
  }
  const evaluated = evaluateAndInterceptGovernedDocument(input);
  const decisionWritten = governedDecisionPersisted(evaluated.decisionReference);
  /* The project key travels as the platform addresses it. `Number(uuid) || 0`
     sent every Module 3 project to bucket 0, which is why one review queue
     answered for all of them — and why the write behind it failed a foreign key
     to projects(id) on every attempt. */
  const projectRef = String(evaluated.evaluation.context.projectId ?? '');

  const lifecycle = await hasUnresolvedGovernedDecisions(projectRef, orgId);
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

  // Enrich context with canonical submission type data from the bridge.
  // If the raw submissionType resolves, upgrade it to the registry ID and
  // backfill regulatorBody from the registry when the caller didn't supply one.
  const resolved = resolveSubmissionTypeFromContext(canonical.context.submissionType);
  if (resolved) {
    canonical.context.submissionType = resolved.registryId;
    if (!canonical.context.regulatorBody) {
      canonical.context.regulatorBody = resolved.bridgeContext.agency;
    }
  }

  return Object.assign(canonical, { decisionPersisted: await decisionWritten });
}

/**
 * The run reference only for a signal RIM captured; for any other status the
 * reference is null and `failure` carries the run and RIM's warnings. Until
 * 2026-10-15 the run id came back whatever the status — a run id is minted
 * before the capture is attempted, so a failed capture has one too.
 */
export async function emitGovernedLearningEvent(
  event: GovernedLearningEvent,
): Promise<{ reference: string | null; failure?: string }> {
  // Resolve submission type via the canonical bridge so intelligence services
  // receive the registry ID and deficiency-taxonomy type regardless of what
  // string the caller originally supplied.
  const resolvedSub = resolveSubmissionTypeFromContext(event.submissionType);

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
      // 2026-10-15: was the readiness score clamped to 30-95. Nothing here
      // computes a confidence, so none is stated.
      confidence: null,
      action: `Governed ${event.intent} outcome=${event.outcome}`,
      patternIds: [],
      metadata: {
        source: 'governed_ana_execution',
        ...event,
        // Canonical bridge enrichment — downstream consumers get the registry
        // ID and deficiency type without needing their own resolution logic.
        ...(resolvedSub && {
          canonicalSubmissionType: resolvedSub.registryId,
          deficiencyType: resolvedSub.deficiencyType,
          submissionRegion: resolvedSub.bridgeContext.region,
          submissionAgency: resolvedSub.bridgeContext.agency,
        }),
      },
    }
  );

  if (result.status === 'completed') return { reference: result.runId };
  const warnings = (result.warnings ?? []).join('; ');
  return {
    reference: null,
    failure: `RIM run ${result.runId} did not capture the learning signal (${result.status})${warnings ? `: ${warnings}` : ''}.`,
  };
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
  let persistenceRefusal: ExecuteGovernedAnaOperationResult['persistenceRefusal'];

  if (input.artifactMutation) {
    const validation = validateGovernedMutation(input.artifactMutation);
    const blocked = canonical.derivedFlags.isBlocked || canonical.derivedFlags.hasUnresolvedGovernedDecisions;
    // The writing user. An actor that is not a user id was written as user 0
    // (tagged 'system') until 2026-10-15; an unattributable write is refused.
    const userId = positiveIntegerId(input.evaluationInput.context.actorId);

    if (!validation.ok || blocked) {
      persistenceStatus = 'rejected';
    } else if (userId === null) {
      persistenceStatus = 'rejected';
      persistenceRefusal = { code: 'UNATTRIBUTABLE_ACTOR', message: `The actor ${JSON.stringify(input.evaluationInput.context.actorId)} is not a user id, so the write could not be attributed to anyone. Nothing was written.` };
    } else {
      try {
        mutationResult = await tagArtifact({
          projectId: input.artifactMutation.projectId,
          organizationId: input.artifactMutation.organizationId,
          userId,
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
            // Whether the ledger holds that decision: its insert is queued and can fail.
            decisionRecorded: canonical.decisionPersisted,
          },
          inTransaction: input.inTransaction,
        });
        persistenceStatus = 'persisted';
      } catch (err) {
        // A refusal is not a failure: the writer said why, and nothing was written.
        if (err instanceof ArtifactWriteRefusedError) {
          persistenceStatus = 'rejected';
          persistenceRefusal = { code: err.code, message: err.message };
        } else {
          persistenceStatus = 'failed';
        }
      }
    }
  }

  // The RIM signal store keys on integer organization and project ids. A uuid
  // project was filed as project 0 — every such project in one bucket — until
  // 2026-10-15. The organization was checked in buildCanonicalGovernedState.
  const learningProjectId = positiveIntegerId(canonical.context.projectId);
  const learning = learningProjectId === null
    ? { reference: null, failure: `Not emitted: project ${JSON.stringify(canonical.context.projectId)} has no integer id, which the RIM signal store keys on.` }
    : await emitGovernedLearningEvent({
        organizationId: Number(canonical.context.organizationId),
        projectId: learningProjectId,
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
    decisionPersisted: canonical.decisionPersisted,
    learningEventReference: learning.reference,
    ...(learning.failure && { learningEventFailure: learning.failure }),
    executionTrace: {
      evaluatedAt: canonical.stateFreshness.evaluatedAt,
      persistedAt: new Date().toISOString(),
      qualityGrade: input.artifactMutation?.qualityGate.grade || 'n/a',
      intent: canonical.context.intendedAction,
      outcome: canonical.decision.outcome,
    },
    qualityGateResult: qualityGate,
    persistenceStatus,
    ...(persistenceRefusal && { persistenceRefusal }),
  };
}
