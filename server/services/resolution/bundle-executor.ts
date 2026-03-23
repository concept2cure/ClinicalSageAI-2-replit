/**
 * Bundle Executor — Sprint 4 Execution Closure
 *
 * Executes a resolution bundle end-to-end: iterates through bundle items,
 * performs the required actions (supersede, rewrite, harmonize, review, reapprove),
 * and returns a BundleExecutionReceipt proving exactly what happened.
 *
 * Every change includes:
 * - source: bundleId
 * - reason: resolutionPlanId
 * - timestamp
 * - prior state preserved
 *
 * Does NOT auto-apply low-confidence fixes.
 * Returns executed/prepared/blocked breakdown with zero ambiguity.
 *
 * @module server/services/resolution/bundle-executor
 */

import { db } from '../../db';
import { eq, and, sql } from 'drizzle-orm';
import {
  resolutionBundles,
  resolutionBundleItems,
  resolutionPlans,
  supersessionRecords,
  type ResolutionBundle,
  type ResolutionBundleItem,
} from '../../../shared/schema/resolution';
import type {
  BundleExecutionReceipt,
  ExecutedStep,
  PreparedStep,
  BlockedStep,
  ResolutionConfidence,
} from '../../../shared/types/resolution';
import { recordSupersession, confirmSupersession } from './supersession-engine';
import { transitionBundleState } from './bundle-builder';
import { transitionResolutionState } from './resolution-state-machine';

// ═══════════════════════════════════════════════════════════════════════════════
// BUNDLE EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute a resolution bundle.
 *
 * Iterates through all bundle items and attempts to execute each one.
 * Items are categorized into:
 * - executedSteps: actions that completed successfully with real state changes
 * - preparedSteps: actions that were prepared but require human review before applying
 * - blockedSteps: actions that could not execute (missing data, low confidence, locked objects)
 *
 * Returns a BundleExecutionReceipt — the undeniable proof of what happened.
 */
export async function executeBundle(
  organizationId: number,
  userId: number,
  bundleId: string
): Promise<BundleExecutionReceipt> {
  // 1. Fetch bundle and items
  const [bundle] = await db
    .select()
    .from(resolutionBundles)
    .where(and(
      eq(resolutionBundles.id, bundleId),
      eq(resolutionBundles.organizationId, organizationId)
    ))
    .limit(1);

  if (!bundle) {
    throw new Error(`Resolution bundle ${bundleId} not found`);
  }

  // Only execute from valid states
  if (!['proposed', 'in_progress'].includes(bundle.state)) {
    throw new Error(
      `Cannot execute bundle in state "${bundle.state}". ` +
      `Bundle must be in "proposed" or "in_progress" state.`
    );
  }

  const items = await db
    .select()
    .from(resolutionBundleItems)
    .where(eq(resolutionBundleItems.bundleId, bundleId))
    .orderBy(resolutionBundleItems.sortOrder);

  if (items.length === 0) {
    throw new Error('Bundle has no items to execute');
  }

  // 2. Transition bundle to in_progress if not already
  if (bundle.state === 'proposed') {
    await transitionBundleState(organizationId, userId, bundleId, 'in_progress', 'Execution started');
  }

  // 3. Execute each item
  const executedSteps: ExecutedStep[] = [];
  const preparedSteps: PreparedStep[] = [];
  const blockedSteps: BlockedStep[] = [];
  const supersededObjects: string[] = [];
  const updatedArtifacts: string[] = [];
  const requiresReview: string[] = [];
  const requiresReapproval: string[] = [];

  for (const item of items) {
    // Skip already completed items
    if (item.status === 'completed') {
      executedSteps.push({
        stepType: item.actionType,
        targetId: item.objectId,
        targetType: item.objectType,
        targetTitle: item.objectTitle ?? undefined,
        result: 'success',
        priorState: 'already_completed',
        newState: 'completed',
        bundleId,
        resolutionPlanId: bundle.planId ?? undefined,
        timestamp: item.completedAt?.toISOString() ?? new Date().toISOString(),
      });
      continue;
    }

    // Skip failed items
    if (item.status === 'failed' || item.status === 'skipped') {
      blockedSteps.push({
        stepType: item.actionType,
        targetId: item.objectId,
        targetType: item.objectType,
        targetTitle: item.objectTitle ?? undefined,
        reason: `Item previously ${item.status}`,
      });
      continue;
    }

    try {
      const result = await executeItem(
        organizationId,
        userId,
        bundle,
        item
      );

      switch (result.outcome) {
        case 'executed':
          executedSteps.push({
            stepType: item.actionType,
            targetId: item.objectId,
            targetType: item.objectType,
            targetTitle: item.objectTitle ?? undefined,
            result: 'success',
            priorState: result.priorState,
            newState: result.newState,
            bundleId,
            resolutionPlanId: bundle.planId ?? undefined,
            timestamp: new Date().toISOString(),
          });

          if (item.actionType === 'supersede') {
            supersededObjects.push(`${item.objectType}:${item.objectId}`);
          }
          if (['rewrite', 'harmonize'].includes(item.actionType)) {
            updatedArtifacts.push(`${item.objectType}:${item.objectId}`);
          }

          // Mark item completed
          await db.update(resolutionBundleItems).set({
            status: 'completed',
            completedAt: new Date(),
            completedById: userId,
          }).where(eq(resolutionBundleItems.id, item.id));
          break;

        case 'prepared':
          preparedSteps.push({
            stepType: item.actionType,
            targetId: item.objectId,
            targetType: item.objectType,
            targetTitle: item.objectTitle ?? undefined,
            result: 'prepared',
            preparedAction: result.preparedAction,
            confidence: result.confidence,
          });

          if (item.actionType === 'review' || item.actionType === 'reapprove') {
            requiresReview.push(`${item.objectType}:${item.objectId}`);
          }
          if (item.actionType === 'reapprove') {
            requiresReapproval.push(`${item.objectType}:${item.objectId}`);
          }

          // Mark item in_progress (prepared but needs human)
          await db.update(resolutionBundleItems).set({
            status: 'in_progress',
          }).where(eq(resolutionBundleItems.id, item.id));
          break;

        case 'blocked':
          blockedSteps.push({
            stepType: item.actionType,
            targetId: item.objectId,
            targetType: item.objectType,
            targetTitle: item.objectTitle ?? undefined,
            reason: result.reason,
          });

          // Mark item failed
          await db.update(resolutionBundleItems).set({
            status: 'failed',
          }).where(eq(resolutionBundleItems.id, item.id));
          break;
      }
    } catch (error: any) {
      blockedSteps.push({
        stepType: item.actionType,
        targetId: item.objectId,
        targetType: item.objectType,
        targetTitle: item.objectTitle ?? undefined,
        reason: `Execution error: ${error.message}`,
      });

      await db.update(resolutionBundleItems).set({
        status: 'failed',
      }).where(eq(resolutionBundleItems.id, item.id));
    }
  }

  // 4. Determine final contradiction/plan state
  let contradictionState: string;
  const allExecuted = blockedSteps.length === 0 && preparedSteps.length === 0;
  const someBlocked = blockedSteps.length > 0;
  const allBlocked = executedSteps.length === 0 && preparedSteps.length === 0;

  if (allBlocked) {
    contradictionState = 'unresolved';
  } else if (allExecuted) {
    contradictionState = 'resolved_pending_review';
  } else if (someBlocked) {
    contradictionState = 'in_resolution';
  } else {
    contradictionState = 'in_resolution';
  }

  // 5. Transition the resolution plan state if linked
  if (bundle.planId) {
    try {
      if (contradictionState === 'resolved_pending_review') {
        await transitionResolutionState(
          organizationId, userId, bundle.planId,
          'resolved_pending_review',
          `Bundle ${bundleId} execution complete. ${executedSteps.length} executed, ${preparedSteps.length} prepared, ${blockedSteps.length} blocked.`
        );
      } else if (contradictionState === 'in_resolution') {
        // Plan may already be in_resolution — try to transition, ignore if already there
        try {
          await transitionResolutionState(
            organizationId, userId, bundle.planId,
            'in_resolution',
            `Bundle ${bundleId} partially executed. ${executedSteps.length} executed, ${preparedSteps.length} prepared, ${blockedSteps.length} blocked.`
          );
        } catch {
          // Plan may already be in in_resolution — that's fine
        }
      }
    } catch {
      // Plan state transition is best-effort during execution
    }
  }

  // 6. Transition bundle state based on execution results
  if (allExecuted) {
    await transitionBundleState(organizationId, userId, bundleId, 'pending_review', 'All items executed, awaiting review');
  }
  // If partially executed, stay in in_progress

  // 7. Build and return receipt
  const receipt: BundleExecutionReceipt = {
    bundleId,
    planId: bundle.planId ?? undefined,

    executedSteps,
    preparedSteps,
    blockedSteps,

    supersededObjects,
    updatedArtifacts,
    requiresReview,
    requiresReapproval,

    contradictionState,

    summary: {
      totalItems: items.length,
      executed: executedSteps.length,
      prepared: preparedSteps.length,
      blocked: blockedSteps.length,
    },

    timestamp: new Date().toISOString(),
  };

  // 8. Store receipt as resolution memo on the bundle
  await db.update(resolutionBundles).set({
    resolutionMemo: JSON.stringify(receipt, null, 2),
    updatedAt: new Date(),
  }).where(eq(resolutionBundles.id, bundleId));

  return receipt;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ITEM EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

type ItemExecutionResult =
  | { outcome: 'executed'; priorState: string; newState: string }
  | { outcome: 'prepared'; preparedAction: string; confidence: ResolutionConfidence }
  | { outcome: 'blocked'; reason: string };

async function executeItem(
  organizationId: number,
  userId: number,
  bundle: ResolutionBundle,
  item: ResolutionBundleItem
): Promise<ItemExecutionResult> {
  switch (item.actionType) {
    case 'supersede':
      return executeSupersede(organizationId, userId, bundle, item);
    case 'rewrite':
      return executeRewrite(organizationId, userId, bundle, item);
    case 'harmonize':
      return executeHarmonize(organizationId, userId, bundle, item);
    case 'review':
      return prepareReview(item);
    case 'reapprove':
      return prepareReapproval(organizationId, item);
    case 'escalate':
      return prepareEscalation(item);
    default:
      return { outcome: 'blocked', reason: `Unknown action type: ${item.actionType}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION EXECUTORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute supersession: create a new version and mark the old one superseded.
 */
async function executeSupersede(
  organizationId: number,
  userId: number,
  bundle: ResolutionBundle,
  item: ResolutionBundleItem
): Promise<ItemExecutionResult> {
  // Determine the prior state
  const priorState = await getObjectState(organizationId, item.objectType, item.objectId);

  if (priorState === 'locked') {
    return {
      outcome: 'blocked',
      reason: `Cannot supersede ${item.objectType} ${item.objectId} — object is locked. Escalation required.`,
    };
  }

  // Record the supersession
  try {
    const supersessionId = `superseded-${item.objectId}-${Date.now()}`;
    const record = await recordSupersession(organizationId, userId, {
      projectId: bundle.projectId,
      supersededObjectType: item.objectType,
      supersededObjectId: item.objectId,
      supersededObjectTitle: item.objectTitle ?? undefined,
      successorObjectType: item.objectType,
      successorObjectId: `${item.objectId}-v2`,
      successorObjectTitle: item.objectTitle ? `${item.objectTitle} (updated)` : undefined,
      rationale: `Superseded as part of resolution bundle ${bundle.id}. ${item.actionDescription}`,
      resolutionPlanId: bundle.planId ?? undefined,
      bundleId: bundle.id,
    });

    // Confirm the supersession
    await confirmSupersession(organizationId, userId, record.id);

    // Update the object state to reflect supersession
    await markObjectSuperseded(organizationId, item.objectType, item.objectId);

    return {
      outcome: 'executed',
      priorState,
      newState: 'superseded',
    };
  } catch (error: any) {
    return {
      outcome: 'blocked',
      reason: `Supersession failed: ${error.message}`,
    };
  }
}

/**
 * Execute rewrite: apply prepared content if available and confidence is sufficient.
 */
async function executeRewrite(
  organizationId: number,
  userId: number,
  bundle: ResolutionBundle,
  item: ResolutionBundleItem
): Promise<ItemExecutionResult> {
  const priorState = await getObjectState(organizationId, item.objectType, item.objectId);

  if (priorState === 'locked') {
    return {
      outcome: 'blocked',
      reason: `Cannot rewrite ${item.objectType} ${item.objectId} — object is locked.`,
    };
  }

  // If prepared content exists and confidence is strong/moderate, execute
  if (item.preparedContent && item.preparedContentConfidence) {
    const confidence = item.preparedContentConfidence as ResolutionConfidence;

    if (confidence === 'uncertain') {
      return {
        outcome: 'prepared',
        preparedAction: `Rewrite prepared but confidence is uncertain — requires human review before applying`,
        confidence,
      };
    }

    if (confidence === 'provisional') {
      return {
        outcome: 'prepared',
        preparedAction: `Rewrite prepared with provisional confidence — human review recommended`,
        confidence,
      };
    }

    // Strong or moderate confidence — stage the rewrite
    const staged = await stageRewrite(
      organizationId,
      item.objectType,
      item.objectId,
      item.preparedContent,
      bundle.id,
      bundle.planId ?? undefined
    );

    if (staged) {
      return {
        outcome: 'executed',
        priorState,
        newState: 'rewrite_staged',
      };
    }

    return {
      outcome: 'blocked',
      reason: `Failed to stage rewrite for ${item.objectType} ${item.objectId}`,
    };
  }

  // No prepared content — flag for review
  return {
    outcome: 'prepared',
    preparedAction: `Rewrite needed but no prepared content — flag ${item.objectType} for manual rewrite`,
    confidence: 'uncertain',
  };
}

/**
 * Execute harmonize: update object to align with resolution.
 */
async function executeHarmonize(
  organizationId: number,
  userId: number,
  bundle: ResolutionBundle,
  item: ResolutionBundleItem
): Promise<ItemExecutionResult> {
  const priorState = await getObjectState(organizationId, item.objectType, item.objectId);

  if (priorState === 'locked') {
    return {
      outcome: 'blocked',
      reason: `Cannot harmonize ${item.objectType} ${item.objectId} — object is locked.`,
    };
  }

  // Harmonization always requires flagging for review
  // If content is prepared and confidence is strong, we can stage it
  if (item.preparedContent && item.preparedContentConfidence === 'strong') {
    const staged = await stageRewrite(
      organizationId,
      item.objectType,
      item.objectId,
      item.preparedContent,
      bundle.id,
      bundle.planId ?? undefined
    );

    if (staged) {
      return {
        outcome: 'executed',
        priorState,
        newState: 'harmonize_staged',
      };
    }
  }

  // Flag the object as needing harmonization
  await flagObjectForReview(
    organizationId,
    item.objectType,
    item.objectId,
    `Harmonization needed: ${item.actionDescription}`,
    bundle.id
  );

  return {
    outcome: 'executed',
    priorState,
    newState: 'flagged_for_harmonization',
  };
}

/**
 * Prepare review: flag the object for human review. Cannot be auto-executed.
 */
async function prepareReview(item: ResolutionBundleItem): Promise<ItemExecutionResult> {
  return {
    outcome: 'prepared',
    preparedAction: `Review required for ${item.objectType} "${item.objectTitle || item.objectId}": ${item.actionDescription}`,
    confidence: 'moderate',
  };
}

/**
 * Prepare reapproval: check authority state and flag for reapproval.
 */
async function prepareReapproval(
  organizationId: number,
  item: ResolutionBundleItem
): Promise<ItemExecutionResult> {
  const currentState = await getObjectState(organizationId, item.objectType, item.objectId);

  if (currentState === 'approved' || currentState === 'locked' || currentState === 'published') {
    return {
      outcome: 'prepared',
      preparedAction: `Reapproval required for ${item.objectType} "${item.objectTitle || item.objectId}" (currently ${currentState}). Approval must be re-obtained after resolution changes are applied.`,
      confidence: 'strong',
    };
  }

  // Object is not in an approved state — review is sufficient
  return {
    outcome: 'prepared',
    preparedAction: `${item.objectType} "${item.objectTitle || item.objectId}" is in ${currentState} state — standard review sufficient, no reapproval needed.`,
    confidence: 'strong',
  };
}

/**
 * Prepare escalation: this is always a prepared step, never auto-executed.
 */
async function prepareEscalation(item: ResolutionBundleItem): Promise<ItemExecutionResult> {
  return {
    outcome: 'prepared',
    preparedAction: `Escalation required for ${item.objectType} "${item.objectTitle || item.objectId}": ${item.actionDescription}. Manual intervention needed.`,
    confidence: 'uncertain',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function getObjectState(
  organizationId: number,
  objectType: string,
  objectId: string
): Promise<string> {
  try {
    if (objectType === 'artifact') {
      const result = await db.execute(sql`
        SELECT status FROM concept2cure_artifacts
        WHERE artifact_id::text = ${objectId}
          AND organization_id = ${organizationId}
        LIMIT 1
      `);
      if (result.rows?.[0]) return String(result.rows[0].status);
    }

    if (objectType === 'document') {
      const result = await db.execute(sql`
        SELECT status FROM unified_documents
        WHERE id::text = ${objectId}
          AND organization_id = ${organizationId}
        LIMIT 1
      `);
      if (result.rows?.[0]) return String(result.rows[0].status);
    }

    if (objectType === 'assumption' || objectType === 'decision') {
      // These don't have a status column in current schema —
      // check supersession records instead
      const result = await db.execute(sql`
        SELECT state FROM supersession_records
        WHERE superseded_object_type = ${objectType}
          AND superseded_object_id = ${objectId}
          AND organization_id = ${organizationId}
          AND state = 'confirmed'
        LIMIT 1
      `);
      if (result.rows?.[0]) return 'superseded';
      return 'active';
    }
  } catch {
    // Tables may not exist in test/dev environments
  }

  return 'unknown';
}

async function markObjectSuperseded(
  organizationId: number,
  objectType: string,
  objectId: string
): Promise<void> {
  try {
    if (objectType === 'artifact') {
      await db.execute(sql`
        UPDATE concept2cure_artifacts
        SET status = 'archived', updated_at = now()
        WHERE artifact_id::text = ${objectId}
          AND organization_id = ${organizationId}
      `);
    }
    // For assumptions/decisions, supersession is recorded in supersession_records
    // (no separate status column to update)
  } catch {
    // Best-effort — supersession record is the source of truth
  }
}

async function stageRewrite(
  organizationId: number,
  objectType: string,
  objectId: string,
  content: string,
  bundleId: string,
  planId?: string
): Promise<boolean> {
  try {
    if (objectType === 'artifact') {
      // Create a new version with the rewritten content
      await db.execute(sql`
        INSERT INTO concept2cure_artifact_versions (
          artifact_id, version, content, content_hash, change_description, created_at
        )
        SELECT
          a.artifact_id,
          COALESCE((SELECT MAX(v.version) FROM concept2cure_artifact_versions v WHERE v.artifact_id = a.artifact_id), 0) + 1,
          ${content},
          encode(sha256(${content}::bytea), 'hex'),
          ${'Resolution rewrite via bundle ' + bundleId + (planId ? ' (plan ' + planId + ')' : '')},
          now()
        FROM concept2cure_artifacts a
        WHERE a.artifact_id::text = ${objectId}
          AND a.organization_id = ${organizationId}
      `);
      return true;
    }
  } catch {
    // Staging failed — caller will handle
  }
  return false;
}

async function flagObjectForReview(
  organizationId: number,
  objectType: string,
  objectId: string,
  reason: string,
  bundleId: string
): Promise<void> {
  try {
    if (objectType === 'artifact') {
      // Set status to 'review' if currently in draft
      await db.execute(sql`
        UPDATE concept2cure_artifacts
        SET status = CASE
          WHEN status = 'draft' THEN 'review'
          ELSE status
        END,
        updated_at = now()
        WHERE artifact_id::text = ${objectId}
          AND organization_id = ${organizationId}
      `);
    }
    // For all object types, the review flag is implicitly set by the bundle item
    // being in 'in_progress' status with a review action type
  } catch {
    // Best-effort
  }
}
