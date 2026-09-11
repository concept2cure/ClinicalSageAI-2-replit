/**
 * Readiness Engine — Phase 3
 *
 * Computes submission/dossier readiness assessments from cross-object data.
 * Produces actionable readiness scores, module breakdowns, and blockers.
 *
 * Scoring model:
 * - Completeness (30%): Document/artifact coverage vs expected
 * - Quality (25%): Average validation/compliance scores
 * - Compliance (20%): Critical/major finding counts
 * - Routing (15%): Module placement completeness
 * - Consistency (10%): Cross-reference alignment
 *
 * Compliance and consistency each have an input precondition. When it is not
 * met the subscore is `null` — the dimension was not assessed — and the weights
 * are renormalised over the dimensions that were, so a project with nothing in
 * it scores 0 / not_started. Every `null` is accompanied by its reason in
 * `unassessedDimensions`. (WO-16C finding 58: both returned a bare `50`,
 * "Unknown = neutral", which the pre-submission gate panel rendered as a
 * labelled subscore and which scored an empty project 15 / in_progress.)
 */

import type {
  CrossObjectReasoningPayload,
  ReadinessAssessment,
  ReadinessStatus,
  ModuleReadinessItem,
  DocumentReadinessItem,
  ReadinessBlocker,
  Recommendation,
  UnassessedReadinessDimension,
} from '../../../shared/types/orchestration';
import { generateRecommendations } from './recommendation-engine';

// ---------------------------------------------------------------------------
// Scoring Weights
// ---------------------------------------------------------------------------

const WEIGHTS = {
  completeness: 0.30,
  quality: 0.25,
  compliance: 0.20,
  routing: 0.15,
  consistency: 0.10,
};

/**
 * Weighted average across the dimensions that were assessed, with the weights
 * renormalised over exactly those. A `null` dimension is excluded from both
 * the numerator and the denominator — it neither lifts the total (the old
 * "Unknown = neutral" 50) nor sinks it (a 0 would report an unmeasured
 * dimension as a failed one). `completeness`, `quality` and `routing` are
 * always numbers, so the denominator is never 0.
 */
function weightedOverAssessed(scores: {
  completeness: number;
  quality: number;
  compliance: number | null;
  routing: number;
  consistency: number | null;
}): number {
  let weighted = 0;
  let weight = 0;
  for (const key of Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>) {
    const value = scores[key];
    if (value === null) continue;
    weighted += value * WEIGHTS[key];
    weight += WEIGHTS[key];
  }
  if (weight === 0) return 0;
  return Math.round(weighted / weight);
}

// ---------------------------------------------------------------------------
// Main Assessment
// ---------------------------------------------------------------------------

/**
 * Compute a full readiness assessment from a cross-object payload.
 */
export function computeReadinessAssessment(
  payload: CrossObjectReasoningPayload
): ReadinessAssessment {
  const scores = {
    completeness: computeCompletenessScore(payload),
    quality: computeQualityScore(payload),
    compliance: computeComplianceScore(payload),
    routing: computeRoutingScore(payload),
    consistency: computeConsistencyScore(payload),
  };

  // A dimension with no input to measure is null, and says why. It is neither
  // folded into the total as a neutral 50 (which inflated an empty project to
  // 15/'in_progress' and printed "compliance 50" on the pre-submission gate
  // panel) nor as a 0 (which would report an unmeasured dimension as a failing
  // one). The total is the weighted average over what WAS assessed.
  const unassessedDimensions: UnassessedReadinessDimension[] = [];
  if (scores.compliance === null) {
    unassessedDimensions.push({
      dimension: 'compliance',
      reason:
        'no validation runs and no CMC signals on this project — nothing to score regulatory compliance against',
    });
  }
  if (scores.consistency === null) {
    unassessedDimensions.push({
      dimension: 'consistency',
      reason:
        'no routed documents and no promoted artifacts — no cross-reference check applied',
    });
  }

  const overallScore = weightedOverAssessed(scores);

  const moduleBreakdown = computeModuleBreakdown(payload);
  const documentInventory = computeDocumentInventory(payload);
  const blockers = computeBlockers(payload);

  // Generate recommendations using the recommendation engine
  const recSet = generateRecommendations(payload, { projectId: payload.scope.projectId, limit: 15 });

  const status = deriveStatus(overallScore, blockers);

  return {
    projectId: payload.scope.projectId,
    organizationId: payload.scope.organizationId,
    module: payload.scope.module,
    overallScore,
    status,
    scores,
    unassessedDimensions,
    moduleBreakdown,
    documentInventory,
    blockers,
    recommendations: recSet.recommendations,
    assessedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Subscores
// ---------------------------------------------------------------------------

function computeCompletenessScore(payload: CrossObjectReasoningPayload): number {
  const modules = payload.moduleMap.filter((m) => m.module !== 'Unassigned');
  if (modules.length === 0) return 0;

  // Average module completeness
  const avgCompleteness =
    modules.reduce((sum, m) => sum + m.completenessPercent, 0) / modules.length;

  // Factor in overall document count vs a baseline
  const docCount = payload.documents.length;
  const docFactor = Math.min(100, (docCount / 15) * 100); // 15 docs = 100%

  return Math.round((avgCompleteness * 0.6 + docFactor * 0.4));
}

function computeQualityScore(payload: CrossObjectReasoningPayload): number {
  if (payload.validations.length === 0) return 0;

  const avgCompliance =
    payload.validations.reduce((s, v) => s + v.complianceScore, 0) / payload.validations.length;

  // Penalize for unvalidated documents
  const validatedDocIds = new Set(payload.validations.map((v) => v.documentId));
  const nonDraftDocs = payload.documents.filter((d) => d.status !== 'draft');
  const validationCoverage = nonDraftDocs.length > 0
    ? (validatedDocIds.size / nonDraftDocs.length) * 100
    : 0;

  return Math.round(avgCompliance * 0.7 + validationCoverage * 0.3);
}

/**
 * Regulatory compliance, or `null` when there is nothing to measure it from.
 *
 * The score is a penalty walk down from 100 over validation findings, open CMC
 * contradictions and stale Module 3 sections. With no validation runs and no
 * CMC signals there are no findings to walk down from — that is "not assessed",
 * not "100" and not the `50` this returned before WO-16C finding 58.
 */
function computeComplianceScore(payload: CrossObjectReasoningPayload): number | null {
  const cmc = payload.cmcSignals;
  const hasValidations = payload.validations.length > 0;
  const hasCmcSignals = cmc.sourceObjectCount > 0 || cmc.contradictions.length > 0;

  if (!hasValidations && !hasCmcSignals) return null; // nothing measured — see unassessedDimensions

  let score = 100;

  // Validation findings
  const totalCritical = payload.validations.reduce((s, v) => s + v.criticalCount, 0);
  const totalMajor = payload.validations.reduce((s, v) => s + v.majorCount, 0);
  score -= totalCritical * 15;
  score -= totalMajor * 5;

  // CMC contradictions — open ones only; closed/resolved do not penalize
  const openCmc = cmc.contradictions.filter(
    c => c.status.toLowerCase() !== 'resolved' && c.status.toLowerCase() !== 'closed',
  );
  for (const c of openCmc) {
    switch (c.severity) {
      case 'critical': score -= 15; break;
      case 'high':     score -= 8;  break;
      case 'medium':   score -= 3;  break;
      case 'low':      score -= 1;  break;
    }
  }

  // Stale Module 3 sections — compiled output that doesn't reflect current
  // source objects. Soft penalty per stale section, capped so it can't
  // sink an otherwise compliant project on its own.
  score -= Math.min(cmc.staleSectionCount * 2, 10);

  return Math.max(0, Math.min(100, Math.round(score)));
}

function computeRoutingScore(payload: CrossObjectReasoningPayload): number {
  const total = payload.documents.length;
  if (total === 0) return 0;

  const routed = payload.documents.filter((d) => d.isRouted).length;
  return Math.round((routed / total) * 100);
}

/**
 * Cross-reference alignment as a pass rate over the checks that applied, or
 * `null` when none applied. A project with nothing routed and nothing promoted
 * has had no consistency check run against it; before WO-16C finding 58 that
 * case returned `50`, which reads as a half-passing alignment score.
 */
function computeConsistencyScore(payload: CrossObjectReasoningPayload): number | null {
  // Cross-reference alignment — check for:
  // 1. All promoted artifacts have validations
  // 2. All routed documents are validated
  // 3. No conflicting statuses
  let checks = 0;
  let passed = 0;

  const validatedIds = new Set(payload.validations.map((v) => v.documentId));

  for (const doc of payload.documents) {
    if (doc.isRouted) {
      checks++;
      if (validatedIds.has(doc.id)) passed++;
    }
  }

  for (const art of payload.artifacts) {
    if (art.isPromoted) {
      checks++;
      if (validatedIds.has(art.id)) passed++;
    }
  }

  if (checks === 0) return null; // no check applied — see unassessedDimensions
  return Math.round((passed / checks) * 100);
}

// ---------------------------------------------------------------------------
// Module Breakdown
// ---------------------------------------------------------------------------

function computeModuleBreakdown(
  payload: CrossObjectReasoningPayload
): ModuleReadinessItem[] {
  const EXPECTED_DOCS: Record<string, number> = {
    'Module 1': 3,
    'Module 2': 5,
    'Module 3': 4,
    'Module 4': 3,
    'Module 5': 4,
  };

  const MODULE_LABELS: Record<string, string> = {
    'Module 1': 'Administrative Information',
    'Module 2': 'CTD Summaries',
    'Module 3': 'Quality (CMC)',
    'Module 4': 'Nonclinical Reports',
    'Module 5': 'Clinical Reports',
  };

  const validatedIds = new Set(payload.validations.map((v) => v.documentId));

  return payload.moduleMap
    .filter((m) => m.module !== 'Unassigned')
    .map((m) => {
      const expected = EXPECTED_DOCS[m.module] || 3;
      const docs = payload.documents.filter((d) => d.module === m.module || d.routedTo?.startsWith(m.module.replace('Module ', '')));
      const validated = docs.filter((d) => validatedIds.has(d.id)).length;
      const score = Math.round(
        (m.documentCount / expected) * 50 +
        (validated / Math.max(1, m.documentCount)) * 30 +
        (m.completenessPercent / 100) * 20
      );

      const status = deriveStatus(Math.min(100, score), []);
      const blockerCount = payload.validations
        .filter((v) => docs.some((d) => d.id === v.documentId) && v.criticalCount > 0)
        .length;

      return {
        module: m.module,
        label: MODULE_LABELS[m.module] || m.module,
        score: Math.min(100, score),
        status,
        documentCount: m.documentCount,
        expectedDocumentCount: expected,
        validatedCount: validated,
        routedCount: docs.filter((d) => d.isRouted).length,
        missingItems: m.missingItems,
        blockerCount,
      };
    });
}

// ---------------------------------------------------------------------------
// Document Inventory
// ---------------------------------------------------------------------------

function computeDocumentInventory(
  payload: CrossObjectReasoningPayload
): DocumentReadinessItem[] {
  const validatedMap = new Map<number, { score: number; critical: number }>();
  for (const v of payload.validations) {
    validatedMap.set(v.documentId, {
      score: v.complianceScore,
      critical: v.criticalCount,
    });
  }

  const staleThreshold = new Date();
  staleThreshold.setDate(staleThreshold.getDate() - 30);

  return payload.documents.map((d) => {
    const val = validatedMap.get(d.id);
    return {
      documentId: d.id,
      title: d.title,
      type: d.type,
      status: d.status,
      module: d.module,
      isDrafted: d.status !== 'draft',
      isValidated: !!val,
      isRouted: d.isRouted,
      isApproved: d.status === 'approved' || d.status === 'published',
      isExportReady: d.status === 'approved' || d.status === 'published',
      validationScore: val?.score,
      criticalFindings: val?.critical ?? 0,
      lastModified: d.lastModified,
      isStale: d.lastModified ? new Date(d.lastModified) < staleThreshold : false,
    };
  });
}

// ---------------------------------------------------------------------------
// Blockers
// ---------------------------------------------------------------------------

function computeBlockers(
  payload: CrossObjectReasoningPayload
): ReadinessBlocker[] {
  const blockers: ReadinessBlocker[] = [];

  // Critical validation failures
  for (const v of payload.validations) {
    if (v.criticalCount > 0) {
      blockers.push({
        severity: 'critical',
        category: 'validation_failure',
        message: `${v.documentTitle} has ${v.criticalCount} critical validation finding(s)`,
        targetType: 'document',
        targetId: v.documentId,
        targetTitle: v.documentTitle,
        suggestedResolution: 'Run AI-assisted refinement to address critical findings',
      });
    }
  }

  // Empty modules
  for (const m of payload.moduleMap) {
    if (m.module !== 'Unassigned' && m.documentCount === 0) {
      blockers.push({
        severity: 'major',
        category: 'missing_document',
        message: `${m.module} has no documents assigned`,
        targetType: 'module',
        targetId: m.module,
        targetTitle: m.module,
        module: m.module,
        suggestedResolution: `Draft or route content to ${m.module}`,
      });
    }
  }

  // Unrouted non-draft documents
  const unrouted = payload.documents.filter(
    (d) => !d.isRouted && d.status !== 'draft' && d.status !== 'archived'
  );
  if (unrouted.length > 0) {
    blockers.push({
      severity: 'major',
      category: 'unrouted_content',
      message: `${unrouted.length} document(s) not assigned to any CTD module`,
      targetType: 'project',
      targetId: payload.scope.projectId,
      suggestedResolution: 'Route documents to appropriate CTD modules',
    });
  }

  // Stale approved content
  const staleThreshold = new Date();
  staleThreshold.setDate(staleThreshold.getDate() - 60);
  const staleApproved = payload.documents.filter(
    (d) =>
      (d.status === 'approved' || d.status === 'published') &&
      d.lastModified &&
      new Date(d.lastModified) < staleThreshold
  );
  if (staleApproved.length > 0) {
    blockers.push({
      severity: 'minor',
      category: 'stale_content',
      message: `${staleApproved.length} approved document(s) may be stale (>60 days since last update)`,
      targetType: 'project',
      targetId: payload.scope.projectId,
      suggestedResolution: 'Review approved documents for currency',
    });
  }

  // Blocked tasks
  const blocked = payload.tasks.filter((t) => t.isBlocked);
  if (blocked.length > 0) {
    blockers.push({
      severity: 'major',
      category: 'blocked_task',
      message: `${blocked.length} task(s) are blocked`,
      targetType: 'project',
      targetId: payload.scope.projectId,
      suggestedResolution: 'Resolve task dependencies or reassign blocked work',
    });
  }

  // CMC contradictions — open critical/high become readiness blockers.
  // These are produced by `cmc-impact-contradiction-engine` and reflect
  // real Module 3 quality issues (batch rejected, comparability risk,
  // open change controls, spec conflicts, etc.).
  for (const c of payload.cmcSignals.contradictions) {
    const status = c.status.toLowerCase();
    if (status === 'resolved' || status === 'closed') continue;
    if (c.severity !== 'critical' && c.severity !== 'high') continue;
    const sections = c.impactedSections.length > 0
      ? ` (sections ${c.impactedSections.slice(0, 3).join(', ')})`
      : '';
    blockers.push({
      severity: c.severity === 'critical' ? 'critical' : 'major',
      category: 'validation_failure',
      message: `CMC ${c.contradictionType.replace(/_/g, ' ')}${sections}: ${c.details}`,
      targetType: 'cmc_contradiction',
      targetId: c.id,
      module: 'Module 3',
      suggestedResolution: 'Resolve the underlying CMC source data or close the change control before promoting Module 3 sections',
    });
  }

  // Sort by severity
  const sevOrder = { critical: 0, major: 1, minor: 2 };
  blockers.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  return blockers;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveStatus(score: number, blockers: ReadinessBlocker[]): ReadinessStatus {
  const hasCritical = blockers.some((b) => b.severity === 'critical');
  if (hasCritical) return 'at_risk';
  if (score >= 90) return 'ready';
  if (score >= 70) return 'on_track';
  if (score >= 40) return 'needs_attention';
  if (score > 0) return 'in_progress';
  return 'not_started';
}
