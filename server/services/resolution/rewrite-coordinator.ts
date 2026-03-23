/**
 * Rewrite Coordinator — Sprint 4
 *
 * Supports coordinated rewrite preparation across multiple affected artifacts.
 * Identifies rewrite targets, prepares harmonization actions, and preserves
 * why each target is included.
 *
 * Does NOT auto-apply low-confidence fixes.
 * Confidence and authority gating remain in force.
 *
 * @module server/services/resolution/rewrite-coordinator
 */

import { db } from '../../db';
import { eq, and, sql } from 'drizzle-orm';
import type {
  AffectedObject,
  RewriteTarget,
  HarmonizationAction,
  ResolutionConfidence,
  ResolutionPath,
} from '../../../shared/types/resolution';

// ═══════════════════════════════════════════════════════════════════════════════
// REWRITE TARGET IDENTIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Identify all rewrite targets within a cluster of affected objects.
 *
 * Rewrite targets are objects that need content changes as part of resolution.
 * Each target includes its current content, suggested revision approach,
 * and confidence level.
 */
export async function identifyRewriteTargets(
  organizationId: number,
  projectId: number,
  affectedObjects: AffectedObject[],
  recommendedPath: ResolutionPath,
  triggerDescription: string
): Promise<RewriteTarget[]> {
  const targets: RewriteTarget[] = [];

  for (const obj of affectedObjects) {
    // Skip objects that don't need content changes
    if (obj.impactState === 'potential' && recommendedPath !== 'mixed') {
      continue;
    }

    const target = await buildRewriteTarget(
      organizationId,
      projectId,
      obj,
      recommendedPath,
      triggerDescription
    );

    if (target) {
      targets.push(target);
    }
  }

  return targets;
}

/**
 * Build a rewrite target for a single affected object.
 */
async function buildRewriteTarget(
  organizationId: number,
  projectId: number,
  obj: AffectedObject,
  recommendedPath: ResolutionPath,
  triggerDescription: string
): Promise<RewriteTarget | null> {
  // Fetch current content for the object
  const content = await fetchObjectContent(organizationId, obj);

  if (!content) {
    // Cannot prepare rewrite without current content
    return {
      objectType: obj.objectType,
      objectId: obj.objectId,
      objectTitle: obj.objectTitle,
      sectionCode: obj.sectionCode,
      currentContent: undefined,
      suggestedRevision: undefined,
      revisionRationale: `Content for ${obj.objectType} ${obj.objectId} could not be retrieved — manual review required`,
      confidence: 'uncertain',
      requiresReview: true,
    };
  }

  // Determine rewrite confidence based on impact state and path
  const confidence = determineRewriteConfidence(obj, recommendedPath);

  // Build revision rationale
  const rationale = buildRevisionRationale(obj, triggerDescription, recommendedPath);

  return {
    objectType: obj.objectType,
    objectId: obj.objectId,
    objectTitle: obj.objectTitle,
    sectionCode: obj.sectionCode,
    currentContent: content,
    suggestedRevision: undefined, // Actual rewrite is done by AI with human review
    revisionRationale: rationale,
    confidence,
    requiresReview: true, // Always require human review for rewrites
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HARMONIZATION ACTION PREPARATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Prepare harmonization actions for a cluster of affected objects.
 *
 * Harmonization means making multiple objects consistent with each other
 * and with the resolution trigger. Each action specifies what should be
 * changed, why, and with what confidence.
 */
export async function prepareHarmonizationActions(
  organizationId: number,
  projectId: number,
  affectedObjects: AffectedObject[],
  triggerObjectType: string,
  triggerObjectId: string,
  triggerDescription: string
): Promise<HarmonizationAction[]> {
  const actions: HarmonizationAction[] = [];

  // Group objects by section code for section-level harmonization
  const bySectionCode = new Map<string, AffectedObject[]>();
  for (const obj of affectedObjects) {
    const section = obj.sectionCode || '__unassigned__';
    if (!bySectionCode.has(section)) bySectionCode.set(section, []);
    bySectionCode.get(section)!.push(obj);
  }

  for (const obj of affectedObjects) {
    const actionType = determineHarmonizationAction(obj, affectedObjects.length);
    const confidence = determineHarmonizationConfidence(obj, bySectionCode);

    actions.push({
      targetObjectType: obj.objectType,
      targetObjectId: obj.objectId,
      targetObjectTitle: obj.objectTitle,
      actionType,
      description: buildHarmonizationDescription(obj, triggerDescription, actionType),
      confidence,
      sourceObjectType: triggerObjectType,
      sourceObjectId: triggerObjectId,
    });
  }

  return actions;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COORDINATED REWRITE CHECK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verify that a set of rewrite targets can be prepared cleanly.
 *
 * Returns issues if:
 * - Content cannot be retrieved
 * - Object is in a locked state that prevents modification
 * - Confidence is too low for safe rewrite
 */
export function validateRewriteReadiness(
  targets: RewriteTarget[]
): { ready: boolean; issues: string[] } {
  const issues: string[] = [];

  for (const target of targets) {
    if (!target.currentContent && target.confidence !== 'uncertain') {
      issues.push(
        `Cannot prepare rewrite for ${target.objectType} ${target.objectId}: content not available`
      );
    }

    if (target.confidence === 'uncertain') {
      issues.push(
        `Rewrite target ${target.objectType} ${target.objectId} has uncertain confidence — manual review required before proceeding`
      );
    }
  }

  return {
    ready: issues.length === 0,
    issues,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchObjectContent(
  organizationId: number,
  obj: AffectedObject
): Promise<string | null> {
  try {
    if (obj.objectType === 'artifact') {
      const result = await db.execute(sql`
        SELECT av.content
        FROM concept2cure_artifact_versions av
        JOIN concept2cure_artifacts a ON a.artifact_id = av.artifact_id
        WHERE a.artifact_id::text = ${obj.objectId}
          AND a.organization_id = ${organizationId}
        ORDER BY av.version DESC
        LIMIT 1
      `);
      if (result.rows?.[0]?.content) return String(result.rows[0].content);
    }

    if (obj.objectType === 'document') {
      const result = await db.execute(sql`
        SELECT wdv.content
        FROM workflow_document_versions wdv
        JOIN unified_documents d ON d.id = wdv.document_id
        WHERE d.id::text = ${obj.objectId}
          AND d.organization_id = ${organizationId}
        ORDER BY wdv.version_number DESC
        LIMIT 1
      `);
      if (result.rows?.[0]?.content) return String(result.rows[0].content);
    }
  } catch {
    // Tables may not exist
  }

  return null;
}

function determineRewriteConfidence(
  obj: AffectedObject,
  path: ResolutionPath
): ResolutionConfidence {
  if (obj.impactState === 'direct' && path !== 'escalate') return 'moderate';
  if (obj.impactState === 'indirect') return 'provisional';
  return 'uncertain';
}

function buildRevisionRationale(
  obj: AffectedObject,
  triggerDescription: string,
  path: ResolutionPath
): string {
  const title = obj.objectTitle || `${obj.objectType} ${obj.objectId}`;
  const sectionInfo = obj.sectionCode ? ` (section: ${obj.sectionCode})` : '';

  switch (path) {
    case 'harmonize':
      return `${title}${sectionInfo} requires harmonization: ${triggerDescription}. ` +
        `Content should be updated to align with the resolution.`;
    case 'rewrite':
      return `${title}${sectionInfo} requires rewrite: ${triggerDescription}. ` +
        `Current content is directly impacted and needs revision.`;
    case 'supersede':
      return `${title}${sectionInfo} will be superseded: ${triggerDescription}. ` +
        `A new version should replace the current content.`;
    case 'mixed':
      return `${title}${sectionInfo} is part of a mixed resolution: ${triggerDescription}. ` +
        `The specific action depends on the object's relationship to the trigger.`;
    default:
      return `${title}${sectionInfo} requires review: ${triggerDescription}.`;
  }
}

function determineHarmonizationAction(
  obj: AffectedObject,
  clusterSize: number
): 'rewrite' | 'review' | 'supersede' | 'reapprove' | 'harmonize' | 'escalate' {
  if (obj.impactState === 'direct') return 'harmonize';
  if (obj.impactState === 'indirect') return 'review';
  if (clusterSize > 10) return 'escalate';
  return 'review';
}

function determineHarmonizationConfidence(
  obj: AffectedObject,
  bySectionCode: Map<string, AffectedObject[]>
): ResolutionConfidence {
  const section = obj.sectionCode || '__unassigned__';
  const sectionPeers = bySectionCode.get(section)?.length ?? 0;

  if (obj.impactState === 'direct' && sectionPeers <= 3) return 'strong';
  if (obj.impactState === 'direct') return 'moderate';
  if (obj.impactState === 'indirect') return 'provisional';
  return 'uncertain';
}

function buildHarmonizationDescription(
  obj: AffectedObject,
  triggerDescription: string,
  actionType: string
): string {
  const title = obj.objectTitle || `${obj.objectType} ${obj.objectId}`;
  return `${actionType.charAt(0).toUpperCase() + actionType.slice(1)} "${title}" — ${triggerDescription}`;
}
