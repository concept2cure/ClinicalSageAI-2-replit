/**
 * Next Best Action Engine — Ranked Action List from Intelligence Signals
 *
 * Consumes recommendations, readiness gaps, and project state to produce
 * a prioritized list of concrete actions the user should take next.
 *
 * Ranking factors:
 *   - Severity / urgency (deadlines, overdue items)
 *   - Impact on readiness score
 *   - Effort estimate (quick wins ranked higher when equal urgency)
 *   - Dependencies (blocked actions deprioritized)
 *
 * @module server/services/intelligence/next-best-action-engine
 */

import { generateRecommendations, type RecommendationContext, type Recommendation } from './recommendation-engine.js';
import { computeReadinessScore, type ReadinessContext, type ReadinessGap } from './readiness-scoring-engine.js';

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
  readonly impactEstimate: 'high' | 'medium' | 'low';
  readonly effortEstimate: 'quick' | 'moderate' | 'substantial';
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
  readonly readinessScore: number;
  readonly topCategory: ActionCategory | null;
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
  actions.sort((a, b) => {
    // Urgency first
    const urgencyOrder: Record<string, number> = { immediate: 0, this_week: 1, this_sprint: 2, backlog: 3 };
    const urgencyDiff = (urgencyOrder[a.urgency] ?? 4) - (urgencyOrder[b.urgency] ?? 4);
    if (urgencyDiff !== 0) return urgencyDiff;

    // Then impact
    const impactOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const impactDiff = (impactOrder[a.impactEstimate] ?? 3) - (impactOrder[b.impactEstimate] ?? 3);
    if (impactDiff !== 0) return impactDiff;

    // Then effort (quick wins first)
    const effortOrder: Record<string, number> = { quick: 0, moderate: 1, substantial: 2 };
    return (effortOrder[a.effortEstimate] ?? 3) - (effortOrder[b.effortEstimate] ?? 3);
  });

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
    readinessScore: readiness.overallScore,
    topCategory,
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
    impactEstimate: rec.severity === 'critical' || rec.severity === 'high' ? 'high' : 'medium',
    effortEstimate: rec.type === 'validation_failure' ? 'quick' : 'moderate',
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
    impactEstimate: gap.severity === 'critical' ? 'high' : gap.severity === 'high' ? 'high' : 'medium',
    effortEstimate: gap.estimatedEffortHours
      ? (gap.estimatedEffortHours <= 2 ? 'quick' : gap.estimatedEffortHours <= 8 ? 'moderate' : 'substantial')
      : 'moderate',
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
