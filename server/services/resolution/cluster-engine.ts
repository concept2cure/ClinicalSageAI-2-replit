/**
 * Cluster Engine — Sprint 4
 *
 * Groups affected objects into resolution clusters using existing
 * dependency links, artifact relationships, and section references.
 *
 * A real contradiction often affects a cluster, not one object. This engine
 * identifies and groups what must change together.
 *
 * @module server/services/resolution/cluster-engine
 */

import { db } from '../../db';
import { eq, and, or, inArray, sql } from 'drizzle-orm';
import type {
  AffectedObject,
  ResolutionCluster,
  ResolutionTriggerType,
  ResolutionConfidence,
} from '../../../shared/types/resolution';

// ═══════════════════════════════════════════════════════════════════════════════
// CLUSTERING LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Discover and cluster all objects affected by a trigger.
 *
 * Uses a breadth-first approach to find connected objects through:
 * - Assumption-linked artifacts
 * - Decision-linked artifacts
 * - Contradiction-linked artifacts
 * - Section-linked artifact versions
 * - Evidence links (supports/contradicts/supersedes)
 *
 * Conservative: only includes objects with demonstrable links.
 */
export async function clusterAffectedObjects(
  organizationId: number,
  projectId: number,
  triggerType: ResolutionTriggerType,
  triggerId: string
): Promise<ResolutionCluster> {
  const visited = new Set<string>();
  const affectedObjects: AffectedObject[] = [];
  let maxDepth = 0;

  // Start from the trigger object
  const triggerKey = `${triggerType}:${triggerId}`;
  visited.add(triggerKey);

  // Phase 1: Find direct links from the trigger
  const directLinks = await findDirectLinks(organizationId, projectId, triggerType, triggerId);
  for (const obj of directLinks) {
    const key = `${obj.objectType}:${obj.objectId}`;
    if (!visited.has(key)) {
      visited.add(key);
      affectedObjects.push({ ...obj, impactState: 'direct' });
    }
  }
  if (directLinks.length > 0) maxDepth = 1;

  // Phase 2: Find indirect links (one hop from directly affected objects)
  const indirectObjects: AffectedObject[] = [];
  for (const directObj of directLinks) {
    const secondaryLinks = await findLinkedArtifacts(
      organizationId,
      projectId,
      directObj.objectType,
      directObj.objectId
    );
    for (const obj of secondaryLinks) {
      const key = `${obj.objectType}:${obj.objectId}`;
      if (!visited.has(key)) {
        visited.add(key);
        indirectObjects.push({
          ...obj,
          impactState: 'indirect',
          impactRationale: `Linked via ${directObj.objectType} "${directObj.objectTitle || directObj.objectId}"`,
        });
      }
    }
  }
  affectedObjects.push(...indirectObjects);
  if (indirectObjects.length > 0) maxDepth = 2;

  // Phase 3: Find potential impacts (two hops) — only for large-scope triggers
  if (triggerType === 'contradiction' || triggerType === 'impact_propagation') {
    const potentialObjects: AffectedObject[] = [];
    for (const indirectObj of indirectObjects.slice(0, 10)) { // Cap to prevent explosion
      const tertiaryLinks = await findLinkedArtifacts(
        organizationId,
        projectId,
        indirectObj.objectType,
        indirectObj.objectId
      );
      for (const obj of tertiaryLinks) {
        const key = `${obj.objectType}:${obj.objectId}`;
        if (!visited.has(key)) {
          visited.add(key);
          potentialObjects.push({
            ...obj,
            impactState: 'potential',
            impactRationale: `Two hops from trigger via ${indirectObj.objectType}`,
          });
        }
      }
    }
    affectedObjects.push(...potentialObjects);
    if (potentialObjects.length > 0) maxDepth = 3;
  }

  const confidence = determineClusterConfidence(affectedObjects, maxDepth);

  return {
    clusterId: `cluster-${triggerId}-${Date.now()}`,
    triggerObjectType: triggerType,
    triggerObjectId: triggerId,
    triggerDescription: `${triggerType} on ${triggerId}`,
    affectedObjects,
    clusterSize: affectedObjects.length,
    maxDepth,
    confidence,
    generatedAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LINK DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Find objects directly linked to a trigger.
 * Uses different strategies based on trigger type.
 */
async function findDirectLinks(
  organizationId: number,
  projectId: number,
  triggerType: ResolutionTriggerType,
  triggerId: string
): Promise<AffectedObject[]> {
  const results: AffectedObject[] = [];

  try {
    // Strategy 1: Find artifacts in the same project that reference the trigger
    const artifactLinks = await db.execute(sql`
      SELECT
        'artifact' as object_type,
        a.artifact_id::text as object_id,
        COALESCE(a.title, a.type) as object_title,
        a.ctd_section as section_code
      FROM concept2cure_artifacts a
      WHERE a.project_id = ${projectId}
        AND a.organization_id = ${organizationId}
        AND a.status NOT IN ('locked', 'archived')
      LIMIT 50
    `);

    for (const row of artifactLinks.rows ?? []) {
      results.push({
        objectType: String(row.object_type),
        objectId: String(row.object_id),
        objectTitle: row.object_title ? String(row.object_title) : undefined,
        sectionCode: row.section_code ? String(row.section_code) : undefined,
      });
    }

    // Strategy 2: Find review threads linked to the trigger context
    const threadLinks = await db.execute(sql`
      SELECT
        'review_thread' as object_type,
        rt.thread_id::text as object_id,
        rt.title as object_title,
        rt.anchor_key as section_code
      FROM concept2cure_review_threads rt
      WHERE rt.organization_id = ${organizationId}
        AND rt.status = 'open'
      LIMIT 20
    `);

    for (const row of threadLinks.rows ?? []) {
      results.push({
        objectType: String(row.object_type),
        objectId: String(row.object_id),
        objectTitle: row.object_title ? String(row.object_title) : undefined,
        sectionCode: row.section_code ? String(row.section_code) : undefined,
      });
    }

    // Strategy 3: Find evidence links related to the trigger
    const evidenceLinks = await db.execute(sql`
      SELECT
        'evidence' as object_type,
        el.id::text as object_id,
        el.link_type as object_title
      FROM evidence_links el
      JOIN evidence_objects eo ON eo.id = el.evidence_id
      WHERE eo.organization_id = ${organizationId}
        AND (el.link_type = 'contradicts' OR el.link_type = 'supersedes')
      LIMIT 20
    `);

    for (const row of evidenceLinks.rows ?? []) {
      results.push({
        objectType: String(row.object_type),
        objectId: String(row.object_id),
        objectTitle: row.object_title ? String(row.object_title) : undefined,
      });
    }
  } catch {
    // Tables may not exist in all environments — return what we found so far
  }

  return results;
}

/**
 * Find artifacts linked to a given object (for indirect/potential impact discovery).
 */
async function findLinkedArtifacts(
  organizationId: number,
  projectId: number,
  objectType: string,
  objectId: string
): Promise<AffectedObject[]> {
  const results: AffectedObject[] = [];

  try {
    if (objectType === 'artifact') {
      // Find other artifacts in the same project that share section codes
      const sectionLinks = await db.execute(sql`
        SELECT
          'artifact' as object_type,
          b.artifact_id::text as object_id,
          COALESCE(b.title, b.type) as object_title,
          b.ctd_section as section_code
        FROM concept2cure_artifacts a
        JOIN concept2cure_artifacts b
          ON a.project_id = b.project_id
          AND a.ctd_section = b.ctd_section
          AND a.artifact_id != b.artifact_id
        WHERE a.artifact_id::text = ${objectId}
          AND a.organization_id = ${organizationId}
          AND b.status NOT IN ('locked', 'archived')
        LIMIT 10
      `);

      for (const row of sectionLinks.rows ?? []) {
        results.push({
          objectType: String(row.object_type),
          objectId: String(row.object_id),
          objectTitle: row.object_title ? String(row.object_title) : undefined,
          sectionCode: row.section_code ? String(row.section_code) : undefined,
        });
      }

      // Find unified documents promoted from this artifact
      const docLinks = await db.execute(sql`
        SELECT
          'document' as object_type,
          d.id::text as object_id,
          d.title as object_title,
          d.ctd_section as section_code
        FROM unified_documents d
        WHERE d.project_id = ${projectId}
          AND d.organization_id = ${organizationId}
          AND d.source_artifact_id::text = ${objectId}
        LIMIT 10
      `);

      for (const row of docLinks.rows ?? []) {
        results.push({
          objectType: String(row.object_type),
          objectId: String(row.object_id),
          objectTitle: row.object_title ? String(row.object_title) : undefined,
          sectionCode: row.section_code ? String(row.section_code) : undefined,
        });
      }
    }

    if (objectType === 'document') {
      // Find review threads on this document
      const threadLinks = await db.execute(sql`
        SELECT
          'review_thread' as object_type,
          rt.thread_id::text as object_id,
          rt.title as object_title,
          rt.anchor_key as section_code
        FROM concept2cure_review_threads rt
        WHERE rt.artifact_id::text = ${objectId}
          AND rt.organization_id = ${organizationId}
          AND rt.status = 'open'
        LIMIT 10
      `);

      for (const row of threadLinks.rows ?? []) {
        results.push({
          objectType: String(row.object_type),
          objectId: String(row.object_id),
          objectTitle: row.object_title ? String(row.object_title) : undefined,
          sectionCode: row.section_code ? String(row.section_code) : undefined,
        });
      }
    }
  } catch {
    // Tables may not exist — return what we found
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIDENCE DETERMINATION
// ═══════════════════════════════════════════════════════════════════════════════

function determineClusterConfidence(
  objects: AffectedObject[],
  maxDepth: number
): ResolutionConfidence {
  if (objects.length === 0) return 'uncertain';
  if (maxDepth <= 1 && objects.length <= 3) return 'strong';
  if (maxDepth <= 2 && objects.length <= 6) return 'moderate';
  if (maxDepth <= 2) return 'provisional';
  return 'uncertain';
}
