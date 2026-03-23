/**
 * Resolution Planner — Sprint 4
 *
 * Creates structured resolution plans from triggers (contradictions,
 * assumption changes, decision updates, impact propagation, etc.).
 *
 * Uses existing cross-object resolver for context and readiness engine
 * for determining impact severity.
 *
 * @module server/services/resolution/resolution-planner
 */

import { db } from '../../db';
import { eq, and, desc } from 'drizzle-orm';
import {
  resolutionPlans,
  type ResolutionPlan,
  type NewResolutionPlan,
  type AffectedObject,
} from '../../../shared/schema/resolution';
import type {
  CreateResolutionPlanRequest,
  ResolutionTriggerType,
  ResolutionPath,
  ResolutionConfidence,
  ResolutionState,
} from '../../../shared/types/resolution';
import { clusterAffectedObjects } from './cluster-engine';

// ═══════════════════════════════════════════════════════════════════════════════
// RESOLUTION PLAN CREATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new resolution plan from a trigger event.
 *
 * If autoCluster is true (default), automatically discovers affected objects
 * using the cluster engine. Otherwise uses the provided affectedObjects list.
 */
export async function createResolutionPlan(
  organizationId: number,
  userId: number,
  request: CreateResolutionPlanRequest
): Promise<ResolutionPlan> {
  // Discover affected objects if auto-clustering is requested
  let affectedObjects: AffectedObject[] = request.affectedObjects ?? [];

  if (request.autoCluster !== false && affectedObjects.length === 0) {
    const cluster = await clusterAffectedObjects(
      organizationId,
      request.projectId,
      request.triggerType,
      request.triggerId
    );
    affectedObjects = cluster.affectedObjects;
  }

  // Determine recommended path if not explicitly provided
  const recommendedPath = request.recommendedPath ??
    determineRecommendedPath(request.triggerType, affectedObjects);

  // Determine confidence if not explicitly provided
  const confidence = request.confidence ??
    determineConfidence(request.triggerType, affectedObjects);

  // Determine review/reapproval requirements
  const { requiresReview, requiresReapproval, requiresEscalation } =
    determineRequirements(recommendedPath, confidence, affectedObjects);

  // Build rationale
  const rationale = request.rationale ??
    buildRationale(request.triggerType, request.triggerDescription, affectedObjects, recommendedPath);

  const newPlan: NewResolutionPlan = {
    organizationId,
    projectId: request.projectId,
    triggerType: request.triggerType,
    triggerId: request.triggerId,
    triggerDescription: request.triggerDescription,
    state: 'unresolved',
    affectedObjects,
    recommendedPath,
    alternativePaths: computeAlternativePaths(recommendedPath, request.triggerType),
    confidence,
    requiresReview,
    requiresReapproval,
    requiresEscalation,
    rationale,
    createdById: userId,
  };

  const [plan] = await db.insert(resolutionPlans).values(newPlan).returning();
  return plan;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESOLUTION PLAN QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

export async function getResolutionPlan(
  organizationId: number,
  planId: string
): Promise<ResolutionPlan | undefined> {
  const [plan] = await db
    .select()
    .from(resolutionPlans)
    .where(and(
      eq(resolutionPlans.id, planId),
      eq(resolutionPlans.organizationId, organizationId)
    ))
    .limit(1);
  return plan;
}

export async function getProjectResolutionPlans(
  organizationId: number,
  projectId: number,
  stateFilter?: ResolutionState
): Promise<ResolutionPlan[]> {
  const conditions = [
    eq(resolutionPlans.organizationId, organizationId),
    eq(resolutionPlans.projectId, projectId),
  ];
  if (stateFilter) {
    conditions.push(eq(resolutionPlans.state, stateFilter));
  }
  return db
    .select()
    .from(resolutionPlans)
    .where(and(...conditions))
    .orderBy(desc(resolutionPlans.createdAt));
}

export async function getUnresolvedPlans(
  organizationId: number,
  projectId: number
): Promise<ResolutionPlan[]> {
  return db
    .select()
    .from(resolutionPlans)
    .where(and(
      eq(resolutionPlans.organizationId, organizationId),
      eq(resolutionPlans.projectId, projectId),
      eq(resolutionPlans.state, 'unresolved')
    ))
    .orderBy(desc(resolutionPlans.createdAt));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATH DETERMINATION LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

function determineRecommendedPath(
  triggerType: ResolutionTriggerType,
  affectedObjects: AffectedObject[]
): ResolutionPath {
  const directImpacts = affectedObjects.filter(o => o.impactState === 'direct');
  const objectCount = affectedObjects.length;

  // Single object, simple trigger → review only
  if (objectCount <= 1 && triggerType === 'validation_failure') {
    return 'review_only';
  }

  // Assumption or decision change with many affected objects → harmonize
  if ((triggerType === 'assumption_change' || triggerType === 'decision_update') && objectCount > 2) {
    return 'harmonize';
  }

  // Contradiction with direct impacts → mixed (harmonize + rewrite)
  if (triggerType === 'contradiction' && directImpacts.length > 1) {
    return 'mixed';
  }

  // Impact propagation → harmonize
  if (triggerType === 'impact_propagation') {
    return 'harmonize';
  }

  // Stale dependency → supersede or rewrite
  if (triggerType === 'stale_dependency') {
    return objectCount > 3 ? 'supersede' : 'rewrite';
  }

  // Default: review_only for small, escalate for large
  return objectCount > 5 ? 'escalate' : 'review_only';
}

function determineConfidence(
  triggerType: ResolutionTriggerType,
  affectedObjects: AffectedObject[]
): ResolutionConfidence {
  const objectCount = affectedObjects.length;
  const directCount = affectedObjects.filter(o => o.impactState === 'direct').length;

  // High confidence when trigger is clear and scope is small
  if (directCount <= 2 && objectCount <= 3) {
    return 'strong';
  }

  // Moderate when we have clear triggers but wider impact
  if (triggerType === 'contradiction' || triggerType === 'assumption_change') {
    return objectCount <= 5 ? 'moderate' : 'provisional';
  }

  // Manual triggers get moderate (human chose this)
  if (triggerType === 'manual') {
    return 'moderate';
  }

  // Impact propagation may be uncertain when chain is deep
  if (triggerType === 'impact_propagation' && objectCount > 3) {
    return 'uncertain';
  }

  return 'moderate';
}

function determineRequirements(
  path: ResolutionPath,
  confidence: ResolutionConfidence,
  affectedObjects: AffectedObject[]
): { requiresReview: boolean; requiresReapproval: boolean; requiresEscalation: boolean } {
  const hasApprovedObjects = affectedObjects.some(
    o => o.impactState === 'direct'
  );

  return {
    // Always require review unless confidence is strong and path is review_only
    requiresReview: !(confidence === 'strong' && path === 'review_only'),
    // Require reapproval when approved objects are directly impacted or path is supersede
    requiresReapproval: hasApprovedObjects || path === 'supersede',
    // Escalate when confidence is low/uncertain or many objects affected
    requiresEscalation: confidence === 'uncertain' || path === 'escalate' || affectedObjects.length > 10,
  };
}

function computeAlternativePaths(
  recommended: ResolutionPath,
  triggerType: ResolutionTriggerType
): string[] {
  const allPaths: ResolutionPath[] = ['harmonize', 'supersede', 'rewrite', 'review_only', 'escalate', 'mixed'];
  const alternatives = allPaths.filter(p => p !== recommended);

  // Limit to 3 most relevant alternatives
  if (triggerType === 'contradiction') {
    return alternatives.filter(p => ['harmonize', 'supersede', 'escalate'].includes(p));
  }
  if (triggerType === 'assumption_change') {
    return alternatives.filter(p => ['rewrite', 'supersede', 'review_only'].includes(p));
  }
  return alternatives.slice(0, 3);
}

function buildRationale(
  triggerType: ResolutionTriggerType,
  triggerDescription: string,
  affectedObjects: AffectedObject[],
  path: ResolutionPath
): string {
  const objectCount = affectedObjects.length;
  const directCount = affectedObjects.filter(o => o.impactState === 'direct').length;

  const triggerLabel = triggerType.replace(/_/g, ' ');
  const pathLabel = path.replace(/_/g, ' ');

  return [
    `Resolution plan created for ${triggerLabel}: ${triggerDescription}.`,
    `${objectCount} object(s) affected (${directCount} direct, ${objectCount - directCount} indirect/potential).`,
    `Recommended path: ${pathLabel}.`,
    affectedObjects.length > 0
      ? `Affected object types: ${[...new Set(affectedObjects.map(o => o.objectType))].join(', ')}.`
      : '',
  ].filter(Boolean).join(' ');
}
