/**
 * Governed Context Envelope for AnA/Chat Prompts
 *
 * Provides a compact, bounded markdown summary of the current governed
 * document state for injection into AnA/chat system prompts. This module
 * bridges the Governed Document Decision Fabric with the chat context
 * pipeline without dumping raw fabric payloads.
 *
 * Key constraints:
 * - promptBlock is always <800 chars
 * - Evaluation failures degrade gracefully (hasMeaningfulContext: false)
 * - Pure formatting is separated from I/O for testability
 *
 * @module server/services/ana-ri/governed-context-envelope
 */

import {
  evaluateGovernedDocument,
  type GovernedEvaluationInput,
} from '../../src/control-plane/governed-document-evaluator';

import type {
  GovernedDocumentEvaluation,
  GovernedMutationIntent,
} from '../../../shared/types/governed-document-fabric';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GovernedContextEnvelope {
  /** Compact markdown block for prompt injection (<800 chars) */
  promptBlock: string;
  /** Structured summary for programmatic use */
  summary: {
    readinessLevel: string;
    readinessScore: number;
    blockerCount: number;
    warningCount: number;
    topBlockers: string[]; // max 3, human-readable
    exportEligible: boolean;
    publishEligible: boolean;
    nextRecommendedAction: string;
    placementStatus: string;
    decisionRef?: string;
  };
  /** Whether this envelope has meaningful governance data */
  hasMeaningfulContext: boolean;
  /** ISO timestamp of evaluation */
  evaluatedAt: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_PROMPT_BLOCK_CHARS = 800;
const MAX_TOP_BLOCKERS = 3;
const MAX_BLOCKER_MESSAGE_LENGTH = 60;

// ─── Empty envelope ─────────────────────────────────────────────────────────

function createEmptyEnvelope(): GovernedContextEnvelope {
  return {
    promptBlock: '',
    summary: {
      readinessLevel: 'unknown',
      readinessScore: 0,
      blockerCount: 0,
      warningCount: 0,
      topBlockers: [],
      exportEligible: false,
      publishEligible: false,
      nextRecommendedAction: 'No governance context available',
      placementStatus: 'unknown',
    },
    hasMeaningfulContext: false,
    evaluatedAt: new Date().toISOString(),
  };
}

// ─── Function 1: buildGovernedContextEnvelope ───────────────────────────────

/**
 * Build a compact governed context envelope for AnA/chat prompts.
 * Returns a bounded markdown string (<800 chars) summarizing current
 * governed state for the active project/artifact context.
 */
export async function buildGovernedContextEnvelope(params: {
  organizationId: string;
  projectId: string;
  actorId: string;
  artifactId?: string;
  documentType?: string;
  currentLifecycleStatus?: string;
  regulatorBody?: string;
  submissionType?: string;
  ctdSection?: string;
}): Promise<GovernedContextEnvelope> {
  // Guard: no project means no meaningful governance
  if (!params.projectId || !params.organizationId) {
    return createEmptyEnvelope();
  }

  try {
    const now = new Date().toISOString();

    // Build evaluation input with safe defaults for chat context
    // (we don't have full artifact data in chat, so use conservative defaults)
    const evaluationInput: GovernedEvaluationInput = {
      context: {
        organizationId: params.organizationId,
        projectId: params.projectId,
        artifactId: params.artifactId,
        documentType: params.documentType,
        regulatorBody: params.regulatorBody,
        submissionType: params.submissionType,
        ctdSection: params.ctdSection,
        currentLifecycleStatus: params.currentLifecycleStatus,
        intendedAction: 'refresh' as GovernedMutationIntent,
        actorId: params.actorId,
        requestId: `chat-envelope-${Date.now()}`,
        timestamp: now,
      },
      documentState: {
        hasContent: true,
        hasEvidence: false,
        evidenceCount: 0,
        hasBeenReviewed: false,
        reviewApprovalCount: 0,
        requiredReviewCount: 1,
        hasApproval: false,
        hasPlacement: !!params.ctdSection,
        placementValid: !!params.ctdSection,
        hasProvenance: false,
        unresolvedContradictionCount: 0,
        criticalContradictionCount: 0,
        isStale: false,
      },
    };

    const result = evaluateGovernedDocument(evaluationInput);
    const evaluation = result.evaluation;

    // Extract structured summary
    const readiness = evaluation.readiness;
    const placement = evaluation.placement;
    const exportGate = evaluation.exportGate;
    const publishGate = evaluation.publishGate;
    const decision = evaluation.decision;

    const topBlockers = readiness.blockers
      .slice(0, MAX_TOP_BLOCKERS)
      .map((b) => truncate(b.message, MAX_BLOCKER_MESSAGE_LENGTH));

    const nextAction = deriveNextRecommendedAction(evaluation);
    const placementStatus = placement.canonicalDestination
      ? `${placement.canonicalDestination} (${placement.outcome})`
      : placement.outcome;

    const summary: GovernedContextEnvelope['summary'] = {
      readinessLevel: readiness.level,
      readinessScore: readiness.score,
      blockerCount: decision.blockerCount,
      warningCount: decision.warningCount,
      topBlockers,
      exportEligible: exportGate.outcome === 'eligible',
      publishEligible: publishGate.outcome === 'eligible',
      nextRecommendedAction: nextAction,
      placementStatus,
      decisionRef: decision.decisionReference?.decisionId,
    };

    // Format the prompt block
    const promptBlock = formatFabricStateForPrompt({
      readiness: {
        level: readiness.level,
        score: readiness.score,
        blockers: readiness.blockers.map((b) => ({ message: b.message })),
        warnings: readiness.warnings.map((w) => ({ message: w.message })),
      },
      placement: {
        outcome: placement.outcome,
        canonicalDestination: placement.canonicalDestination,
      },
      exportGate: { outcome: exportGate.outcome },
      publishGate: {
        outcome: publishGate.outcome,
        dispatchReady: publishGate.dispatchReady,
      },
      decision: {
        outcome: decision.outcome,
        blockerCount: decision.blockerCount,
        warningCount: decision.warningCount,
      },
      consequences: evaluation.consequences.map((c) => ({
        consequenceType: c.consequenceType,
        description: c.description,
      })),
    });

    return {
      promptBlock,
      summary,
      hasMeaningfulContext: true,
      evaluatedAt: now,
    };
  } catch {
    // Evaluation failed — degrade gracefully
    return createEmptyEnvelope();
  }
}

// ─── Function 2: formatFabricStateForPrompt ─────────────────────────────────

/**
 * Format a GovernedDocumentEvaluation into a compact prompt-safe string.
 * Pure function, no I/O. Returns max 800 chars.
 */
export function formatFabricStateForPrompt(evaluation: {
  readiness: {
    level: string;
    score: number;
    blockers: Array<{ message: string }>;
    warnings: Array<{ message: string }>;
  };
  placement: { outcome: string; canonicalDestination?: string };
  exportGate: { outcome: string };
  publishGate: { outcome: string; dispatchReady: boolean };
  decision: { outcome: string; blockerCount: number; warningCount: number };
  consequences: Array<{ consequenceType: string; description: string }>;
}): string {
  const { readiness, placement, exportGate, publishGate, decision, consequences } = evaluation;

  const lines: string[] = [];
  lines.push('## Current Governance State');

  // Readiness line
  lines.push(`- **Readiness**: ${readiness.level} (score: ${readiness.score}/100)`);

  // Blockers summary
  if (decision.blockerCount > 0) {
    const blockerMessages = readiness.blockers
      .slice(0, MAX_TOP_BLOCKERS)
      .map((b) => truncate(b.message, MAX_BLOCKER_MESSAGE_LENGTH));
    lines.push(`- **Blockers**: ${decision.blockerCount} (${blockerMessages.join(', ')})`);
  } else {
    lines.push('- **Blockers**: none');
  }

  // Warnings (count only)
  if (decision.warningCount > 0) {
    lines.push(`- **Warnings**: ${decision.warningCount}`);
  }

  // Export eligibility
  lines.push(`- **Export**: ${exportGate.outcome === 'eligible' ? 'eligible' : 'not eligible'}`);

  // Publish eligibility
  if (publishGate.outcome === 'eligible') {
    lines.push(`- **Publish**: eligible${publishGate.dispatchReady ? ' (dispatch ready)' : ''}`);
  }

  // Placement
  const placementDisplay = placement.canonicalDestination
    ? `${placement.canonicalDestination} (${placement.outcome})`
    : placement.outcome;
  lines.push(`- **Placement**: ${placementDisplay}`);

  // Decision outcome
  lines.push(`- **Decision**: ${decision.outcome}`);

  // Action-required consequences (max 2 for compactness)
  const actionConsequences = consequences
    .filter((c) => c.consequenceType === 'open_blocker' || c.consequenceType === 'open_task')
    .slice(0, 2);
  if (actionConsequences.length > 0) {
    lines.push(`- **Actions needed**: ${actionConsequences.map((c) => truncate(c.description, 50)).join('; ')}`);
  }

  let result = lines.join('\n');

  // Enforce the 800-char ceiling
  if (result.length > MAX_PROMPT_BLOCK_CHARS) {
    result = result.slice(0, MAX_PROMPT_BLOCK_CHARS - 3) + '...';
  }

  return result;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Derive the most useful next recommended action from the evaluation.
 */
function deriveNextRecommendedAction(evaluation: GovernedDocumentEvaluation): string {
  const { readiness, decision, exportGate, publishGate } = evaluation;

  // Critical blockers first
  const criticalBlockers = readiness.blockers.filter((b) => b.severity === 'critical');
  if (criticalBlockers.length > 0) {
    const hint = criticalBlockers[0].remediationHint;
    return hint || `Resolve critical blocker: ${truncate(criticalBlockers[0].message, 60)}`;
  }

  // Decision-based recommendations
  switch (decision.outcome) {
    case 'block':
      if (readiness.blockers.length > 0) {
        return `Resolve ${readiness.blockers.length} blocker(s) before proceeding`;
      }
      return 'Resolve blocking issues before proceeding';
    case 'review':
      return 'Manual review recommended before promotion';
    case 'degraded':
      return 'Add missing context to improve evaluation confidence';
    case 'allow':
      // Suggest next lifecycle step
      if (exportGate.outcome !== 'eligible') {
        return 'Complete review and approval to reach export eligibility';
      }
      if (publishGate.outcome !== 'eligible') {
        return 'Complete export to reach publish eligibility';
      }
      if (!publishGate.dispatchReady) {
        return 'Verify dispatch readiness for submission';
      }
      return 'Document is on track — continue current workflow';
  }

  return 'Continue current workflow';
}

/**
 * Truncate a string to maxLen, adding ellipsis if needed.
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
