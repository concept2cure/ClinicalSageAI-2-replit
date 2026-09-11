/**
 * Predictive Recommendation Engine — Phase 3
 *
 * Produces structured, grounded recommendations based on actual project state.
 * No speculation — every recommendation is tied to real objects and evidence.
 *
 * Recommendation types:
 * - missing_content: Documents/sections that should exist but don't
 * - weak_content: Low validation scores or incomplete content
 * - stale_content: Documents not updated in configurable window
 * - unvalidated_content: Documents that have never been validated
 * - unrouted_document: Documents not assigned to a CTD module
 * - blocked_workflow: Tasks/workflows in blocked state
 * - overdue_task: Tasks past due date
 * - validation_failure: Critical/major validation findings unresolved
 * - inconsistency: Cross-reference mismatches detected
 * - readiness_gap: Module-level gaps in submission readiness
 * - next_best_action: Highest-impact next step
 *
 * Every rule here is deterministic: it matched project state, or it did not.
 * So every recommendation is reported as `sourceType: 'rules_based'` with
 * `confidence: null`. Until WO-16C finding 124 each analyzer instead stamped a
 * per-rule literal (0.95 / 0.9 / 0.85 / 0.8 / 0.7) that nothing computed; that
 * constant was the intra-severity tie-break AND was painted as an unlabeled
 * "95%" chip on the AnA Command surface. Ordering now uses the declared
 * RULE_PRECEDENCE below, which states its own basis.
 */

import { generateUUID } from '../../utils/id-generator';
import type {
  CrossObjectReasoningPayload,
  Recommendation,
  RecommendationType,
  RecommendationSeverity,
  RecommendationSet,
  RecommendationRequest,
} from '../../../shared/types/orchestration';
import type { AIActionType } from '../../../shared/types/ai-actions';
import type { WorkflowTemplateId } from '../../../shared/types/orchestration';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Staleness threshold in days. */
const STALE_THRESHOLD_DAYS = 30;

/** Minimum documents expected per CTD module for readiness. */
const MIN_DOCS_PER_MODULE: Record<string, number> = {
  'Module 1': 3,
  'Module 2': 5,
  'Module 3': 4,
  'Module 4': 3,
  'Module 5': 4,
};

/**
 * Tie-break order WITHIN one severity band, lowest first.
 *
 * The basis is stated rather than scored: how much the item blocks a
 * submission. A failed validation and a document that was never validated stop
 * a filing outright; a module short of its expected content is a gap in the
 * dossier; a late or stalled task is schedule risk; weak content is a quality
 * risk; an unrouted document is a filing chore; stale content is a review
 * reminder. `next_best_action` restates whichever recommendation is already
 * top of the list, so it sits last in its band rather than duplicating ahead
 * of the item it points at.
 *
 * `missing_content` and `inconsistency` are declared in the shared type but no
 * analyzer here emits them yet; they are ranked with their nearest kin so the
 * table stays exhaustive.
 */
const RULE_PRECEDENCE: Record<RecommendationType, number> = {
  validation_failure: 1,
  unvalidated_content: 2,
  missing_content: 3,
  readiness_gap: 4,
  overdue_task: 5,
  blocked_workflow: 6,
  weak_content: 7,
  inconsistency: 8,
  unrouted_document: 9,
  stale_content: 10,
  next_best_action: 11,
};

// ---------------------------------------------------------------------------
// Main Engine
// ---------------------------------------------------------------------------

/**
 * Generate recommendations from a cross-object reasoning payload.
 * All recommendations are grounded in the payload data.
 */
export function generateRecommendations(
  payload: CrossObjectReasoningPayload,
  request?: RecommendationRequest
): RecommendationSet {
  const recommendations: Recommendation[] = [];
  const now = new Date();

  // Run all analyzers
  recommendations.push(...analyzeUnvalidatedContent(payload, now));
  recommendations.push(...analyzeUnroutedDocuments(payload, now));
  recommendations.push(...analyzeStaleContent(payload, now));
  recommendations.push(...analyzeValidationFailures(payload, now));
  recommendations.push(...analyzeModuleGaps(payload, now));
  recommendations.push(...analyzeBlockedTasks(payload, now));
  recommendations.push(...analyzeOverdueTasks(payload, now));
  recommendations.push(...analyzeWeakContent(payload, now));

  // Generate next-best-action from top recommendation
  const nextBest = deriveNextBestAction(recommendations, payload, now);
  if (nextBest) recommendations.push(nextBest);

  // Apply filters from request
  let filtered = recommendations;
  if (request?.types && request.types.length > 0) {
    filtered = filtered.filter((r) => request.types!.includes(r.recommendationType));
  }
  if (request?.minSeverity) {
    const severityOrder: RecommendationSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
    const minIdx = severityOrder.indexOf(request.minSeverity);
    filtered = filtered.filter((r) => severityOrder.indexOf(r.severity) <= minIdx);
  }

  // Sort by severity, then by the declared rule precedence. These rules carry
  // no score, so there is nothing to sort by except an order this file states
  // (RULE_PRECEDENCE); ties inside one rule keep payload order, and
  // Array.prototype.sort is stable, so the result is deterministic.
  filtered.sort((a, b) => {
    const sevOrder = ['critical', 'high', 'medium', 'low', 'info'];
    const sevDiff = sevOrder.indexOf(a.severity) - sevOrder.indexOf(b.severity);
    if (sevDiff !== 0) return sevDiff;
    return RULE_PRECEDENCE[a.recommendationType] - RULE_PRECEDENCE[b.recommendationType];
  });

  // Limit
  if (request?.limit) {
    filtered = filtered.slice(0, request.limit);
  }

  // Build summary
  const summary = {
    critical: filtered.filter((r) => r.severity === 'critical').length,
    high: filtered.filter((r) => r.severity === 'high').length,
    medium: filtered.filter((r) => r.severity === 'medium').length,
    low: filtered.filter((r) => r.severity === 'low').length,
    info: filtered.filter((r) => r.severity === 'info').length,
    total: filtered.length,
  };

  return {
    projectId: payload.scope.projectId,
    organizationId: payload.scope.organizationId,
    recommendations: filtered,
    summary,
    generatedAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Individual Analyzers
// ---------------------------------------------------------------------------

function analyzeUnvalidatedContent(
  payload: CrossObjectReasoningPayload,
  now: Date
): Recommendation[] {
  const validatedDocIds = new Set(payload.validations.map((v) => v.documentId));
  const unvalidated = payload.documents.filter(
    (d) => !validatedDocIds.has(d.id) && d.status !== 'draft'
  );

  return unvalidated.map((d) =>
    makeRecommendation({
      type: 'unvalidated_content',
      severity: 'high',
      targetType: 'document',
      targetId: d.id,
      targetTitle: d.title,
      reason: `"${d.title}" is in ${d.status} status but has never been validated.`,
      evidence: [
        `Document status: ${d.status}`,
        `No validation records found for document ID ${d.id}`,
      ],
      suggestedAction: 'Run validation on this document',
      actionPayload: {
        actionType: 'run_validation' as AIActionType,
        payload: { targetId: d.id, targetType: 'artifact' },
      },
      module: d.module,
      now,
    })
  );
}

function analyzeUnroutedDocuments(
  payload: CrossObjectReasoningPayload,
  now: Date
): Recommendation[] {
  const unrouted = payload.documents.filter(
    (d) => !d.isRouted && d.status !== 'draft'
  );

  return unrouted.map((d) =>
    makeRecommendation({
      type: 'unrouted_document',
      severity: 'medium',
      targetType: 'document',
      targetId: d.id,
      targetTitle: d.title,
      reason: `"${d.title}" has not been routed to any CTD module.`,
      evidence: [
        `Document status: ${d.status}`,
        `No module assignment found`,
      ],
      suggestedAction: 'Route this document to the appropriate CTD module',
      actionPayload: {
        actionType: 'route_document_to_module' as AIActionType,
        payload: { targetId: d.id, targetType: 'document' },
      },
      now,
    })
  );
}

function analyzeStaleContent(
  payload: CrossObjectReasoningPayload,
  now: Date
): Recommendation[] {
  const staleThreshold = new Date(now);
  staleThreshold.setDate(staleThreshold.getDate() - STALE_THRESHOLD_DAYS);

  return payload.documents
    .filter((d) => {
      if (!d.lastModified) return false;
      return new Date(d.lastModified) < staleThreshold && d.status !== 'archived';
    })
    .map((d) =>
      makeRecommendation({
        type: 'stale_content',
        severity: 'low',
        targetType: 'document',
        targetId: d.id,
        targetTitle: d.title,
        reason: `"${d.title}" has not been updated in over ${STALE_THRESHOLD_DAYS} days.`,
        evidence: [
          `Last modified: ${d.lastModified}`,
          `Stale threshold: ${STALE_THRESHOLD_DAYS} days`,
        ],
        suggestedAction: 'Review and update this document',
        module: d.module,
        now,
      })
    );
}

function analyzeValidationFailures(
  payload: CrossObjectReasoningPayload,
  now: Date
): Recommendation[] {
  return payload.validations
    .filter((v) => v.criticalCount > 0 || v.majorCount > 0)
    .map((v) => {
      const severity: RecommendationSeverity = v.criticalCount > 0 ? 'critical' : 'high';
      return makeRecommendation({
        type: 'validation_failure',
        severity,
        targetType: 'document',
        targetId: v.documentId,
        targetTitle: v.documentTitle,
        reason: `Validation found ${v.criticalCount} critical and ${v.majorCount} major findings.`,
        evidence: [
          `Compliance score: ${v.complianceScore}%`,
          `Critical findings: ${v.criticalCount}`,
          `Major findings: ${v.majorCount}`,
          `Validated at: ${v.validatedAt}`,
        ],
        suggestedAction: v.criticalCount > 0
          ? 'Address critical validation findings immediately'
          : 'Review and resolve major validation findings',
        actionPayload: {
          actionType: 'refine_with_validation' as AIActionType,
          payload: { targetId: v.documentId, findings: v.findings },
        },
        now,
      });
    });
}

function analyzeModuleGaps(
  payload: CrossObjectReasoningPayload,
  now: Date
): Recommendation[] {
  const recs: Recommendation[] = [];

  for (const m of payload.moduleMap) {
    if (m.module === 'Unassigned') continue;
    const expected = MIN_DOCS_PER_MODULE[m.module] || 3;

    if (m.documentCount < expected) {
      recs.push(
        makeRecommendation({
          type: 'readiness_gap',
          severity: m.documentCount === 0 ? 'critical' : 'high',
          targetType: 'module',
          targetId: m.module,
          targetTitle: m.module,
          reason: `${m.module} has ${m.documentCount}/${expected} expected documents.`,
          evidence: [
            `Current documents: ${m.documentCount}`,
            `Expected minimum: ${expected}`,
            `Completeness: ${m.completenessPercent}%`,
            ...m.missingItems.slice(0, 3),
          ],
          suggestedAction: `Draft or assign content to ${m.module}`,
          module: m.module,
          now,
        })
      );
    }
  }

  return recs;
}

function analyzeBlockedTasks(
  payload: CrossObjectReasoningPayload,
  now: Date
): Recommendation[] {
  return payload.tasks
    .filter((t) => t.isBlocked)
    .map((t) =>
      makeRecommendation({
        type: 'blocked_workflow',
        severity: t.priority === 'high' || t.priority === 'critical' ? 'high' : 'medium',
        targetType: 'task',
        targetId: t.id,
        targetTitle: t.title,
        reason: `Task "${t.title}" is blocked.`,
        evidence: [
          `Status: ${t.status}`,
          `Priority: ${t.priority}`,
          t.assignee ? `Assigned to: ${t.assignee}` : 'Unassigned',
        ],
        suggestedAction: 'Investigate and resolve the blocking issue',
        module: t.module,
        now,
      })
    );
}

function analyzeOverdueTasks(
  payload: CrossObjectReasoningPayload,
  now: Date
): Recommendation[] {
  return payload.tasks
    .filter((t) => t.isOverdue)
    .map((t) =>
      makeRecommendation({
        type: 'overdue_task',
        severity: 'high',
        targetType: 'task',
        targetId: t.id,
        targetTitle: t.title,
        reason: `Task "${t.title}" is past its due date.`,
        evidence: [
          `Due date: ${t.dueDate}`,
          `Status: ${t.status}`,
          `Priority: ${t.priority}`,
        ],
        suggestedAction: 'Complete or reschedule this task',
        module: t.module,
        now,
      })
    );
}

function analyzeWeakContent(
  payload: CrossObjectReasoningPayload,
  now: Date
): Recommendation[] {
  return payload.validations
    .filter((v) => v.complianceScore < 70 && v.complianceScore > 0 && v.criticalCount === 0)
    .map((v) =>
      makeRecommendation({
        type: 'weak_content',
        severity: v.complianceScore < 50 ? 'high' : 'medium',
        targetType: 'document',
        targetId: v.documentId,
        targetTitle: v.documentTitle,
        reason: `Compliance score of ${v.complianceScore}% indicates content quality issues.`,
        evidence: [
          `Compliance score: ${v.complianceScore}%`,
          `Minor findings: ${v.minorCount}`,
          `Major findings: ${v.majorCount}`,
        ],
        suggestedAction: 'Refine content to improve compliance score',
        actionPayload: {
          actionType: 'refine_with_validation' as AIActionType,
          payload: { targetId: v.documentId, findings: v.findings },
        },
        now,
      })
    );
}

// ---------------------------------------------------------------------------
// Next Best Action
// ---------------------------------------------------------------------------

function deriveNextBestAction(
  recs: Recommendation[],
  payload: CrossObjectReasoningPayload,
  now: Date
): Recommendation | null {
  if (recs.length === 0) {
    // No issues — recommend running a readiness review
    return makeRecommendation({
      type: 'next_best_action',
      severity: 'info',
      targetType: 'project',
      targetId: payload.scope.projectId,
      targetTitle: payload.project.name,
      reason: 'No critical issues found. Run a readiness review to confirm submission preparedness.',
      evidence: ['All analyzers returned no critical or high findings'],
      suggestedAction: 'Run submission readiness review workflow',
      actionPayload: {
        actionType: 'submission_readiness_review' as WorkflowTemplateId,
        payload: { projectId: payload.scope.projectId },
      },
      now,
    });
  }

  // Pick the highest-impact unresolved recommendation
  const top = recs[0]; // Already sorted by severity
  return makeRecommendation({
    type: 'next_best_action',
    severity: top.severity,
    targetType: top.targetObjectType,
    targetId: top.targetObjectId,
    targetTitle: top.targetObjectTitle,
    reason: `Highest-priority action: ${top.reason}`,
    evidence: top.evidence,
    suggestedAction: top.suggestedAction,
    actionPayload: top.actionPayload,
    module: top.module,
    now,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MakeRecommendationParams {
  type: RecommendationType;
  severity: RecommendationSeverity;
  targetType: string;
  targetId: string | number;
  targetTitle?: string;
  reason: string;
  evidence: string[];
  suggestedAction: string;
  actionPayload?: {
    actionType: AIActionType | WorkflowTemplateId;
    payload: Record<string, unknown>;
  };
  module?: string;
  now: Date;
}

function makeRecommendation(params: MakeRecommendationParams): Recommendation {
  return {
    id: generateUUID(),
    recommendationType: params.type,
    severity: params.severity,
    targetObjectType: params.targetType,
    targetObjectId: params.targetId,
    targetObjectTitle: params.targetTitle,
    reason: params.reason,
    evidence: params.evidence,
    suggestedAction: params.suggestedAction,
    actionPayload: params.actionPayload,
    // Deterministic rule: it matched, or it was not emitted. There is no score
    // to report, and a constant reported as one would be fabricated.
    sourceType: 'rules_based',
    confidence: null,
    module: params.module,
    generatedAt: params.now.toISOString(),
  };
}
