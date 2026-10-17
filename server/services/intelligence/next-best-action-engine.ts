/**
 * Next Best Action Engine — Ranked Action List from Intelligence Signals
 *
 * Consumes recommendations, readiness gaps, and project state to produce
 * a prioritized list of concrete actions the user should take next.
 *
 * Ranking: severity / urgency (deadlines, overdue items) only. No impact or
 * effort estimate is computed, so none ranks anything (2026-10-15).
 *
 * @module server/services/intelligence/next-best-action-engine
 */

import { generateRecommendations, type RecommendationContext, type Recommendation } from './recommendation-engine.js';
import {
  computeReadinessScore,
  readinessFigure,
  type ReadinessContext,
  type ReadinessGap,
} from './readiness-scoring-engine.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface NextAction {
  readonly actionId: string;
  readonly rank: number;
  readonly title: string;
  readonly description: string;
  readonly category: ActionCategory;
  readonly urgency: 'immediate' | 'this_week' | 'this_sprint' | 'backlog';
  /**
   * Null: nothing estimates impact. 2026-10-15: it restated severity under this
   * name, and effort defaulted to 'moderate' ('quick' for a validation failure).
   */
  readonly impactEstimate: 'high' | 'medium' | 'low' | null;
  /** From a gap's recorded effort hours; null when none is recorded. */
  readonly effortEstimate: 'quick' | 'moderate' | 'substantial' | null;
  readonly sourceRecommendationId: string | null;
  readonly sourceGapId: string | null;
  readonly targetObjectType: string;
  readonly targetObjectId: string;
}

export type ActionCategory =
  | 'document_completion'
  | 'risk_remediation'
  | 'quality_improvement'
  | 'compliance_fix'
  | 'milestone_action'
  | 'review_needed'
  | 'evidence_gathering';

export interface NextActionSet {
  readonly actions: NextAction[];
  readonly generatedAt: string;
  readonly totalActions: number;
  /** readinessFigure(): null unless an assessment measured more than completeness. */
  readonly readinessScore: number | null;
  readonly topCategory: ActionCategory | null;
  /** Recommendation generators whose read failed: their actions are missing. */
  readonly failedGenerators: readonly string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate the ranked next-best-action list for a project.
 */
export async function generateNextActions(
  ctx: RecommendationContext & ReadinessContext,
  maxActions: number = 10,
): Promise<NextActionSet> {
  // Gather signals concurrently
  const [recSet, readiness] = await Promise.all([
    generateRecommendations(ctx),
    computeReadinessScore(ctx),
  ]);

  const actions: NextAction[] = [];
  let actionIdx = 0;

  // ── Convert recommendations to actions ────────────────────────────────
  for (const rec of recSet.recommendations) {
    actions.push(recommendationToAction(rec, actionIdx++));
  }

  // ── Convert readiness gaps not already covered ────────────────────────
  const coveredTargets = new Set(actions.map(a => `${a.targetObjectType}:${a.targetObjectId}`));
  for (const gap of readiness.gaps) {
    const key = `${gap.module}:${gap.id}`;
    if (!coveredTargets.has(key)) {
      actions.push(gapToAction(gap, actionIdx++));
    }
  }

  // ── Rank actions ──────────────────────────────────────────────────────
  // Urgency only; the sort is stable, so the engines' own order holds inside
  // one urgency. It used to break ties on the restated-severity "impact" and
  // the defaulted "effort", neither of which anything estimated.
  const urgencyOrder: Record<string, number> = { immediate: 0, this_week: 1, this_sprint: 2, backlog: 3 };
  actions.sort((a, b) => (urgencyOrder[a.urgency] ?? 4) - (urgencyOrder[b.urgency] ?? 4));

  // Assign final ranks and trim
  const ranked = actions.slice(0, maxActions).map((a, i) => ({ ...a, rank: i + 1 }));

  // Determine top category
  const categoryCounts = new Map<ActionCategory, number>();
  for (const a of ranked) {
    categoryCounts.set(a.category, (categoryCounts.get(a.category) ?? 0) + 1);
  }
  let topCategory: ActionCategory | null = null;
  let topCount = 0;
  for (const [cat, count] of categoryCounts) {
    if (count > topCount) {
      topCategory = cat;
      topCount = count;
    }
  }

  return {
    actions: ranked,
    generatedAt: new Date().toISOString(),
    totalActions: ranked.length,
    readinessScore: readinessFigure(readiness),
    topCategory,
    failedGenerators: recSet.failedGenerators,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERTERS
// ═══════════════════════════════════════════════════════════════════════════════

function recommendationToAction(rec: Recommendation, idx: number): NextAction {
  return {
    actionId: `action-rec-${idx}`,
    rank: 0, // assigned after sorting
    title: rec.suggestedAction.length > 80 ? rec.suggestedAction.slice(0, 77) + '...' : rec.suggestedAction,
    description: rec.reason,
    category: mapRecTypeToCategory(rec.type),
    urgency: mapSeverityToUrgency(rec.severity),
    impactEstimate: null,
    effortEstimate: null,
    sourceRecommendationId: rec.recommendationId,
    sourceGapId: null,
    targetObjectType: rec.targetObjectType,
    targetObjectId: rec.targetObjectId,
  };
}

function gapToAction(gap: ReadinessGap, idx: number): NextAction {
  return {
    actionId: `action-gap-${idx}`,
    rank: 0,
    title: gap.remediation.length > 80 ? gap.remediation.slice(0, 77) + '...' : gap.remediation,
    description: gap.description,
    category: gap.module === 'milestones' ? 'milestone_action'
      : gap.module === 'documents' ? 'document_completion'
      : 'risk_remediation',
    urgency: gap.severity === 'critical' ? 'immediate' : gap.severity === 'high' ? 'this_week' : 'this_sprint',
    impactEstimate: null,
    effortEstimate: gap.estimatedEffortHours !== null
      ? (gap.estimatedEffortHours <= 2 ? 'quick' : gap.estimatedEffortHours <= 8 ? 'moderate' : 'substantial')
      : null,
    sourceRecommendationId: null,
    sourceGapId: gap.id,
    targetObjectType: gap.module,
    targetObjectId: gap.id,
  };
}

function mapRecTypeToCategory(type: string): ActionCategory {
  switch (type) {
    case 'missing_document':
    case 'incomplete_section':
      return 'document_completion';
    case 'validation_failure':
    case 'compliance_gap':
      return 'compliance_fix';
    case 'quality_gap':
      return 'quality_improvement';
    case 'risk_mitigation':
    case 'readiness_blocker':
      return 'risk_remediation';
    case 'cross_reference_issue':
      return 'review_needed';
    case 'evidence_gap':
      return 'evidence_gathering';
    default:
      return 'document_completion';
  }
}

function mapSeverityToUrgency(severity: string): NextAction['urgency'] {
  switch (severity) {
    case 'critical': return 'immediate';
    case 'high': return 'this_week';
    case 'medium': return 'this_sprint';
    default: return 'backlog';
  }
}
