/**
 * Reapproval Engine — Sprint 4
 *
 * Determines when a resolution plan or changed object should require
 * review, reapproval, or remain blocked from promotion until resolved.
 *
 * Uses the existing authority/boundary model (artifact status lifecycle)
 * to make determinations.
 *
 * @module server/services/resolution/reapproval-engine
 */

import { db } from '../../db';
import { eq, and, sql } from 'drizzle-orm';
import type {
  AffectedObject,
  ReapprovalDetermination,
  ResolutionConfidence,
} from '../../../shared/types/resolution';

// ═══════════════════════════════════════════════════════════════════════════════
// REAPPROVAL DETERMINATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Determine reapproval requirements for a set of affected objects.
 *
 * Rules:
 * 1. Approved/locked artifacts impacted by changed assumptions → reapproval required
 * 2. Approved/locked artifacts impacted by contradictions → reapproval required
 * 3. Decisions whose approved state is invalidated → review + potential reapproval
 * 4. Draft artifacts → review only (no reapproval needed)
 * 5. Objects with "potential" impact → review only
 */
export async function determineReapprovalRequirements(
  organizationId: number,
  projectId: number,
  affectedObjects: AffectedObject[],
  triggerType: string,
  confidence: ResolutionConfidence
): Promise<ReapprovalDetermination[]> {
  const determinations: ReapprovalDetermination[] = [];

  for (const obj of affectedObjects) {
    const determination = await determineObjectReapproval(
      organizationId,
      projectId,
      obj,
      triggerType,
      confidence
    );
    determinations.push(determination);
  }

  return determinations;
}

/**
 * Determine reapproval for a single object.
 */
async function determineObjectReapproval(
  organizationId: number,
  projectId: number,
  obj: AffectedObject,
  triggerType: string,
  confidence: ResolutionConfidence
): Promise<ReapprovalDetermination> {
  // Fetch the object's current authority state
  const authorityState = await fetchAuthorityState(organizationId, obj);

  // Objects with only potential impact → review only
  if (obj.impactState === 'potential') {
    return {
      objectType: obj.objectType,
      objectId: obj.objectId,
      objectTitle: obj.objectTitle,
      requiresReview: true,
      requiresReapproval: false,
      requiresEscalation: false,
      reason: `Potential impact detected — review recommended to confirm whether changes affect this ${obj.objectType}`,
      currentAuthorityState: authorityState,
      impactSeverity: 'minor',
    };
  }

  // Draft objects → review only
  if (authorityState === 'draft' || authorityState === 'needs_review') {
    return {
      objectType: obj.objectType,
      objectId: obj.objectId,
      objectTitle: obj.objectTitle,
      requiresReview: true,
      requiresReapproval: false,
      requiresEscalation: false,
      reason: `${obj.objectType} is in ${authorityState} state — review is sufficient, no reapproval needed`,
      currentAuthorityState: authorityState,
      impactSeverity: 'minor',
    };
  }

  // Approved or locked objects with direct impact → reapproval required
  if (
    (authorityState === 'approved' || authorityState === 'locked' || authorityState === 'published') &&
    obj.impactState === 'direct'
  ) {
    const isHighImpactTrigger = ['contradiction', 'assumption_change', 'decision_update'].includes(triggerType);
    const needsEscalation = authorityState === 'locked' || confidence === 'uncertain';

    return {
      objectType: obj.objectType,
      objectId: obj.objectId,
      objectTitle: obj.objectTitle,
      requiresReview: true,
      requiresReapproval: true,
      requiresEscalation: needsEscalation,
      reason: isHighImpactTrigger
        ? `${obj.objectType} is ${authorityState} but directly impacted by ${triggerType.replace(/_/g, ' ')} — reapproval required`
        : `${obj.objectType} is ${authorityState} and directly impacted — reapproval recommended`,
      currentAuthorityState: authorityState,
      impactSeverity: needsEscalation ? 'critical' : 'major',
    };
  }

  // In-review objects with direct impact → review continues, flag impact
  if (authorityState === 'review' || authorityState === 'in_review') {
    return {
      objectType: obj.objectType,
      objectId: obj.objectId,
      objectTitle: obj.objectTitle,
      requiresReview: true,
      requiresReapproval: false,
      requiresEscalation: false,
      reason: `${obj.objectType} is currently in review — existing review should incorporate this impact`,
      currentAuthorityState: authorityState,
      impactSeverity: 'major',
    };
  }

  // Indirect impact on approved objects → review, conditional reapproval
  if (
    (authorityState === 'approved' || authorityState === 'locked') &&
    obj.impactState === 'indirect'
  ) {
    return {
      objectType: obj.objectType,
      objectId: obj.objectId,
      objectTitle: obj.objectTitle,
      requiresReview: true,
      requiresReapproval: confidence !== 'strong',
      requiresEscalation: false,
      reason: `${obj.objectType} is ${authorityState} with indirect impact — review required, reapproval may be needed`,
      currentAuthorityState: authorityState,
      impactSeverity: 'major',
    };
  }

  // Default: review required
  return {
    objectType: obj.objectType,
    objectId: obj.objectId,
    objectTitle: obj.objectTitle,
    requiresReview: true,
    requiresReapproval: false,
    requiresEscalation: false,
    reason: `Review recommended for ${obj.objectType}`,
    currentAuthorityState: authorityState,
    impactSeverity: 'minor',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROMOTION BLOCKING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if an object should be blocked from promotion due to unresolved
 * resolution plans affecting it.
 */
export async function checkPromotionBlock(
  organizationId: number,
  objectType: string,
  objectId: string
): Promise<{ blocked: boolean; reason?: string; planIds?: string[] }> {
  try {
    const result = await db.execute(sql`
      SELECT rp.id, rp.trigger_description, rp.state, rp.confidence
      FROM resolution_plans rp
      WHERE rp.organization_id = ${organizationId}
        AND rp.state IN ('unresolved', 'proposed_resolution', 'in_resolution')
        AND rp.affected_objects::jsonb @> ${JSON.stringify([{ objectType, objectId }])}::jsonb
      LIMIT 10
    `);

    const plans = result.rows ?? [];
    if (plans.length === 0) {
      return { blocked: false };
    }

    const planIds = plans.map(p => String(p.id));
    const reasons = plans.map(
      p => `${p.trigger_description} (${p.state}, confidence: ${p.confidence})`
    );

    return {
      blocked: true,
      reason: `Promotion blocked by ${plans.length} unresolved resolution plan(s): ${reasons.join('; ')}`,
      planIds,
    };
  } catch {
    // Table may not exist yet — don't block
    return { blocked: false };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHORITY STATE LOOKUP
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch the current authority state of an object.
 * Uses existing artifact/document status fields.
 */
async function fetchAuthorityState(
  organizationId: number,
  obj: AffectedObject
): Promise<string> {
  try {
    if (obj.objectType === 'artifact') {
      const result = await db.execute(sql`
        SELECT status FROM concept2cure_artifacts
        WHERE artifact_id::text = ${obj.objectId}
          AND organization_id = ${organizationId}
        LIMIT 1
      `);
      if (result.rows?.[0]) return String(result.rows[0].status);
    }

    if (obj.objectType === 'document') {
      const result = await db.execute(sql`
        SELECT status FROM unified_documents
        WHERE id::text = ${obj.objectId}
          AND organization_id = ${organizationId}
        LIMIT 1
      `);
      if (result.rows?.[0]) return String(result.rows[0].status);
    }

    if (obj.objectType === 'evidence') {
      const result = await db.execute(sql`
        SELECT is_verified FROM evidence_objects
        WHERE id::text = ${obj.objectId}
          AND organization_id = ${organizationId}
        LIMIT 1
      `);
      if (result.rows?.[0]) {
        return result.rows[0].is_verified ? 'approved' : 'draft';
      }
    }
  } catch {
    // Table may not exist
  }

  return 'unknown';
}
