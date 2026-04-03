/**
 * Readiness Gates
 *
 * Evaluates lifecycle readiness state for governed documents.
 * Produces a structured readiness assessment with blockers, warnings, and confidence.
 *
 * Readiness levels (ordered):
 * - draft: Initial state, document exists but not ready for anything
 * - evidence_gap: Document exists but evidence is incomplete
 * - review_ready: Document can be sent for review
 * - approval_ready: Document has been reviewed and can be approved
 * - export_ready: Document is approved and can be exported
 * - publish_ready: Document is export-ready and can be published/dispatched
 * - blocked: Document cannot progress due to blockers
 * - degraded: Evaluation could not complete fully
 */

import { randomUUID } from 'crypto';
import type {
  GovernedDocumentContext,
  LifecycleReadinessState,
  LifecycleReadinessLevel,
  GovernedBlockingReason,
  GovernedWarning,
} from '../../../shared/types/governed-document-fabric';

export const READINESS_GATES_VERSION = '1.0.0';

/**
 * Input for readiness evaluation - context plus additional state from the calling lane
 */
export interface ReadinessEvaluationInput {
  context: GovernedDocumentContext;

  /** Whether the document has any authored content. */
  hasContent: boolean;
  /** Whether the document has linked evidence artifacts. */
  hasEvidence: boolean;
  /** Number of evidence artifacts linked to the document. */
  evidenceCount?: number;
  /** Whether at least one review cycle has been completed. */
  hasBeenReviewed: boolean;
  /** Number of approving reviews received. */
  reviewApprovalCount?: number;
  /** Number of reviews required before the document can advance. */
  requiredReviewCount?: number;
  /** Whether the document has received formal approval. */
  hasApproval: boolean;
  /** ISO 8601 date of the most recent approval. */
  approvalDate?: string;
  /** Whether the document has been assigned a CTD section placement. */
  hasPlacement: boolean;
  /** Whether the current placement is valid for the document type. */
  placementValid: boolean;
  /** Whether the document has a complete provenance chain. */
  hasProvenance: boolean;

  /** Total number of unresolved contradictions (critical + non-critical). */
  unresolvedContradictionCount: number;
  /** Number of contradictions classified as critical. */
  criticalContradictionCount: number;

  /** Whether the document is stale (e.g. source data changed since compilation). */
  isStale?: boolean;
  /** Human-readable reason the document is considered stale. */
  staleReason?: string;

  /** Overall completeness score from 0 to 100. */
  completenessScore?: number;
  /** Names of required fields that are not yet populated. */
  missingRequiredFields?: string[];

  // === RIM context (enrichment from signal bridge) ===

  /** Compact RIM signal context injected by callers with RIM bridge access. */
  rimContext?: {
    /** Total signal count for this project. */
    totalSignals: number;
    /** Average signal quality score (0-100). */
    averageScore: number;
    /** Overall intelligence trend. */
    overallTrend: string;
    /** Number of recent fabric decisions with outcome=block. */
    recentBlockerHistory: number;
    /** Whether high-risk signals exist for this project. */
    hasHighRiskSignals: boolean;
    /** Whether critical regulatory patterns were detected. */
    hasCriticalPatterns: boolean;
  };
}

/**
 * Ordered readiness levels for comparison.
 * Index position determines progression order (higher index = more ready).
 */
const READINESS_ORDER: LifecycleReadinessLevel[] = [
  'blocked',
  'draft',
  'evidence_gap',
  'review_ready',
  'approval_ready',
  'export_ready',
  'publish_ready',
];

/**
 * Evaluate lifecycle readiness state for a governed document.
 *
 * Performs a progressive evaluation: each readiness level requires the
 * previous level's conditions to be met. Hard blockers (critical contradictions,
 * missing context) override the level to 'blocked'.
 *
 * @param input - The document context and current state to evaluate
 * @returns A structured readiness state with level, score, blockers, and warnings
 */
export function evaluateReadiness(input: ReadinessEvaluationInput): LifecycleReadinessState {
  const blockers: GovernedBlockingReason[] = [];
  const warnings: GovernedWarning[] = [];
  const timestamp = new Date().toISOString();

  let score = 0;
  let level: LifecycleReadinessLevel = 'draft';
  let confidence: 'high' | 'moderate' | 'low' | 'insufficient' = 'high';

  // === Check for hard blockers first ===

  // Critical contradictions block everything
  if (input.criticalContradictionCount > 0) {
    blockers.push(createBlocker(
      'unresolved_contradiction',
      'critical',
      `${input.criticalContradictionCount} critical contradiction(s) must be resolved before progression`,
      'readiness-gates',
      'Resolve all critical contradictions before proceeding'
    ));
  }

  // Staleness blocks export/publish
  if (input.isStale) {
    blockers.push(createBlocker(
      'missing_approval',
      'major',
      `Document is stale: ${input.staleReason || 'source data changed since last compilation'}`,
      'readiness-gates',
      'Refresh or recompile the document to clear staleness'
    ));
  }

  // Missing context reduces confidence to insufficient
  if (!input.context.organizationId || !input.context.projectId) {
    blockers.push(createBlocker(
      'missing_context',
      'critical',
      'Organization or project context is missing',
      'readiness-gates'
    ));
    confidence = 'insufficient';
  }

  // === Evaluate progressive readiness ===

  // Base: has content?
  if (input.hasContent) {
    score += 15;
    level = 'draft';
  }

  // Evidence assessment
  if (input.hasEvidence && (input.evidenceCount ?? 0) > 0) {
    score += 15;
  } else {
    level = 'evidence_gap';
    warnings.push(createWarning(
      'evidence_incomplete',
      'Evidence is missing or incomplete',
      'readiness-gates'
    ));
  }

  // Completeness score contribution (up to 20 points)
  if (input.completenessScore !== undefined) {
    const completenessContribution = Math.round(input.completenessScore * 0.2);
    score += completenessContribution;
    if (input.completenessScore < 50) {
      warnings.push(createWarning(
        'low_completeness',
        `Completeness score is ${input.completenessScore}% — below recommended threshold`,
        'readiness-gates'
      ));
    }
  } else {
    // Without a completeness score we cannot fully assess readiness
    confidence = confidence === 'high' ? 'moderate' : confidence;
  }

  // Missing required fields
  if (input.missingRequiredFields && input.missingRequiredFields.length > 0) {
    warnings.push(createWarning(
      'missing_fields',
      `Missing required fields: ${input.missingRequiredFields.join(', ')}`,
      'readiness-gates'
    ));
    if (input.missingRequiredFields.length > 3) {
      score = Math.max(0, score - 10);
    }
  }

  // Review readiness: evidence + content present and no critical blockers
  if (input.hasEvidence && input.hasContent && blockers.filter(b => b.severity === 'critical').length === 0) {
    score += 15;
    level = 'review_ready';
  }

  // Review completion
  if (input.hasBeenReviewed) {
    const reviewsNeeded = input.requiredReviewCount ?? 1;
    const reviewsDone = input.reviewApprovalCount ?? 0;
    if (reviewsDone >= reviewsNeeded) {
      score += 15;
      level = 'approval_ready';
    } else {
      warnings.push(createWarning(
        'incomplete_reviews',
        `${reviewsDone}/${reviewsNeeded} required reviews completed`,
        'readiness-gates'
      ));
    }
  }

  // Approval
  if (input.hasApproval) {
    score += 10;
    level = 'export_ready';
  }

  // Placement + provenance for full export readiness
  if (input.hasApproval && input.hasPlacement && input.placementValid && input.hasProvenance) {
    score += 10;
    level = 'export_ready';
  } else if (input.hasApproval) {
    if (!input.hasPlacement) {
      warnings.push(createWarning(
        'missing_placement',
        'Document is approved but has no CTD section placement',
        'readiness-gates'
      ));
    }
    if (!input.placementValid) {
      warnings.push(createWarning(
        'invalid_placement',
        'Document placement is not valid for its document type',
        'readiness-gates'
      ));
    }
    if (!input.hasProvenance) {
      warnings.push(createWarning(
        'missing_provenance',
        'Document provenance chain is incomplete',
        'readiness-gates'
      ));
    }
  }

  // Publish readiness (highest attainable level)
  if (level === 'export_ready' && input.unresolvedContradictionCount === 0 && !input.isStale) {
    score += 10;
    level = 'publish_ready';
  }

  // Non-critical contradictions are warnings, not blockers
  const nonCriticalContradictions = input.unresolvedContradictionCount - input.criticalContradictionCount;
  if (nonCriticalContradictions > 0) {
    warnings.push(createWarning(
      'non_critical_contradictions',
      `${nonCriticalContradictions} non-critical contradiction(s) remain unresolved`,
      'readiness-gates'
    ));
  }

  // === RIM context influence (when available) ===
  if (input.rimContext) {
    const rim = input.rimContext;

    // Effect 1: Prior blocker history increases review sensitivity
    // If this project has been repeatedly blocked, add a warning and reduce score
    if (rim.recentBlockerHistory >= 3) {
      warnings.push(createWarning(
        'repeated_blocker_history',
        `RIM: ${rim.recentBlockerHistory} recent blocked decisions — review carefully before promotion`,
        'readiness-gates/rim'
      ));
      score = Math.max(0, score - 10);
    }

    // Effect 2: Critical patterns detected → add blocker for export/publish
    // If RIM has flagged critical regulatory patterns, block export readiness
    if (rim.hasCriticalPatterns && (level === 'export_ready' || level === 'publish_ready')) {
      blockers.push(createBlocker(
        'export_gate_failed',
        'major',
        'RIM: Critical regulatory patterns detected — human review required before export',
        'readiness-gates/rim',
        'Review and resolve flagged regulatory patterns before exporting'
      ));
      level = 'approval_ready'; // downgrade from export/publish ready
      score = Math.max(0, score - 15);
    }

    // Effect 3: Declining trend + high risk signals → add warning and reduce confidence
    if (rim.overallTrend === 'declining' && rim.hasHighRiskSignals) {
      warnings.push(createWarning(
        'declining_quality_trend',
        `RIM: Quality trend is declining with high-risk signals (avg score: ${rim.averageScore}/100)`,
        'readiness-gates/rim'
      ));
      confidence = confidence === 'high' ? 'moderate' : confidence;
      score = Math.max(0, score - 5);
    }
  }

  // === Determine final state ===

  // If critical blockers exist, override level to blocked
  const criticalBlockers = blockers.filter(b => b.severity === 'critical');
  if (criticalBlockers.length > 0) {
    level = 'blocked';
    score = Math.min(score, 25);
  }

  // Clamp score to valid range
  score = Math.max(0, Math.min(100, score));

  return {
    level,
    score,
    blockers,
    warnings,
    evaluatedAt: timestamp,
    evaluatedBy: `readiness-gates@${READINESS_GATES_VERSION}`,
    confidence,
  };
}

/**
 * Check if a readiness level meets or exceeds a required minimum level.
 *
 * 'blocked' and 'degraded' never satisfy any requirement.
 *
 * @param current - The document's current readiness level
 * @param required - The minimum level needed
 * @returns true if current meets or exceeds required
 */
export function meetsReadinessLevel(
  current: LifecycleReadinessLevel,
  required: LifecycleReadinessLevel
): boolean {
  if (current === 'blocked' || current === 'degraded') return false;
  const currentIndex = READINESS_ORDER.indexOf(current);
  const requiredIndex = READINESS_ORDER.indexOf(required);
  return currentIndex >= requiredIndex;
}

// === Helper factories ===

/**
 * Create a GovernedBlockingReason with a UUID-based ID (concurrency-safe).
 */
function createBlocker(
  category: GovernedBlockingReason['category'],
  severity: GovernedBlockingReason['severity'],
  message: string,
  source: string,
  remediationHint?: string
): GovernedBlockingReason {
  return {
    id: `blk_${randomUUID()}`,
    category,
    severity,
    message,
    source,
    remediationHint,
  };
}

/**
 * Create a GovernedWarning with a UUID-based ID (concurrency-safe).
 */
function createWarning(
  category: string,
  message: string,
  source: string
): GovernedWarning {
  return {
    id: `wrn_${randomUUID()}`,
    category,
    severity: 'warning',
    message,
    source,
  };
}
