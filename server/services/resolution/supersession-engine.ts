/**
 * Supersession Engine — Sprint 4
 *
 * Handles formal supersession of assumptions, decisions, and artifacts.
 * When objects are replaced as part of a resolution, the old object
 * remains traceable and the new object is linked as successor.
 *
 * @module server/services/resolution/supersession-engine
 */

import { db } from '../../db';
import { eq, and, or, desc } from 'drizzle-orm';
import {
  supersessionRecords,
  type SupersessionRecord,
  type NewSupersessionRecord,
} from '../../../shared/schema/resolution';
import type {
  CreateSupersessionRequest,
  SupersessionState,
} from '../../../shared/types/resolution';

// ═══════════════════════════════════════════════════════════════════════════════
// SUPERSESSION CREATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Record a supersession: the old object is replaced by the new object.
 * Both objects remain in the system with a formal lineage link.
 */
export async function recordSupersession(
  organizationId: number,
  userId: number,
  request: CreateSupersessionRequest
): Promise<SupersessionRecord> {
  // Validate: cannot supersede itself
  if (
    request.supersededObjectType === request.successorObjectType &&
    request.supersededObjectId === request.successorObjectId
  ) {
    throw new Error('An object cannot supersede itself');
  }

  // Check for circular supersession
  const existingChain = await getSupersessionChain(
    organizationId,
    request.successorObjectType,
    request.successorObjectId
  );
  const wouldCreateCycle = existingChain.some(
    r => r.supersededObjectType === request.supersededObjectType &&
         r.supersededObjectId === request.supersededObjectId
  );
  if (wouldCreateCycle) {
    throw new Error('Supersession would create a circular reference');
  }

  // Check if already superseded by the same successor
  const existing = await db
    .select()
    .from(supersessionRecords)
    .where(and(
      eq(supersessionRecords.organizationId, organizationId),
      eq(supersessionRecords.supersededObjectType, request.supersededObjectType),
      eq(supersessionRecords.supersededObjectId, request.supersededObjectId),
      eq(supersessionRecords.successorObjectType, request.successorObjectType),
      eq(supersessionRecords.successorObjectId, request.successorObjectId),
      eq(supersessionRecords.state, 'proposed')
    ))
    .limit(1);

  if (existing.length > 0) {
    throw new Error('Supersession already exists for this object pair');
  }

  const record: NewSupersessionRecord = {
    organizationId,
    projectId: request.projectId,
    supersededObjectType: request.supersededObjectType,
    supersededObjectId: request.supersededObjectId,
    supersededObjectTitle: request.supersededObjectTitle,
    successorObjectType: request.successorObjectType,
    successorObjectId: request.successorObjectId,
    successorObjectTitle: request.successorObjectTitle,
    state: 'proposed',
    rationale: request.rationale,
    resolutionPlanId: request.resolutionPlanId,
    bundleId: request.bundleId,
    createdById: userId,
  };

  const [result] = await db.insert(supersessionRecords).values(record).returning();
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUPERSESSION STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Confirm a supersession — marks it as authoritative.
 */
export async function confirmSupersession(
  organizationId: number,
  userId: number,
  supersessionId: string
): Promise<SupersessionRecord> {
  const [record] = await db
    .select()
    .from(supersessionRecords)
    .where(and(
      eq(supersessionRecords.id, supersessionId),
      eq(supersessionRecords.organizationId, organizationId)
    ))
    .limit(1);

  if (!record) {
    throw new Error(`Supersession record ${supersessionId} not found`);
  }
  if (record.state !== 'proposed') {
    throw new Error(`Cannot confirm supersession in state ${record.state}`);
  }

  const [updated] = await db
    .update(supersessionRecords)
    .set({
      state: 'confirmed' as const,
      confirmedById: userId,
      confirmedAt: new Date(),
    })
    .where(eq(supersessionRecords.id, supersessionId))
    .returning();

  return updated;
}

/**
 * Revert a supersession — the old object becomes active again.
 */
export async function revertSupersession(
  organizationId: number,
  userId: number,
  supersessionId: string,
  reason: string
): Promise<SupersessionRecord> {
  const [record] = await db
    .select()
    .from(supersessionRecords)
    .where(and(
      eq(supersessionRecords.id, supersessionId),
      eq(supersessionRecords.organizationId, organizationId)
    ))
    .limit(1);

  if (!record) {
    throw new Error(`Supersession record ${supersessionId} not found`);
  }
  if (record.state === 'reverted') {
    throw new Error('Supersession is already reverted');
  }

  const [updated] = await db
    .update(supersessionRecords)
    .set({
      state: 'reverted' as const,
      rationale: record.rationale + `\n\n[REVERTED] ${reason}`,
    })
    .where(eq(supersessionRecords.id, supersessionId))
    .returning();

  return updated;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUPERSESSION QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all supersession records for a specific object (as superseded or successor).
 */
export async function getObjectSupersessions(
  organizationId: number,
  objectType: string,
  objectId: string
): Promise<{ asSuperseded: SupersessionRecord[]; asSuccessor: SupersessionRecord[] }> {
  const asSuperseded = await db
    .select()
    .from(supersessionRecords)
    .where(and(
      eq(supersessionRecords.organizationId, organizationId),
      eq(supersessionRecords.supersededObjectType, objectType),
      eq(supersessionRecords.supersededObjectId, objectId)
    ))
    .orderBy(desc(supersessionRecords.createdAt));

  const asSuccessor = await db
    .select()
    .from(supersessionRecords)
    .where(and(
      eq(supersessionRecords.organizationId, organizationId),
      eq(supersessionRecords.successorObjectType, objectType),
      eq(supersessionRecords.successorObjectId, objectId)
    ))
    .orderBy(desc(supersessionRecords.createdAt));

  return { asSuperseded, asSuccessor };
}

/**
 * Get the full supersession chain for an object (walk backwards to find all ancestors).
 */
export async function getSupersessionChain(
  organizationId: number,
  objectType: string,
  objectId: string,
  maxDepth: number = 20
): Promise<SupersessionRecord[]> {
  const chain: SupersessionRecord[] = [];
  let currentType = objectType;
  let currentId = objectId;

  for (let depth = 0; depth < maxDepth; depth++) {
    const [predecessor] = await db
      .select()
      .from(supersessionRecords)
      .where(and(
        eq(supersessionRecords.organizationId, organizationId),
        eq(supersessionRecords.successorObjectType, currentType),
        eq(supersessionRecords.successorObjectId, currentId),
        eq(supersessionRecords.state, 'confirmed')
      ))
      .limit(1);

    if (!predecessor) break;

    chain.push(predecessor);
    currentType = predecessor.supersededObjectType;
    currentId = predecessor.supersededObjectId;
  }

  return chain;
}

/**
 * Check if an object is currently superseded (has a confirmed successor).
 */
export async function isSuperseded(
  organizationId: number,
  objectType: string,
  objectId: string
): Promise<{ superseded: boolean; successorId?: string; successorType?: string }> {
  const [record] = await db
    .select()
    .from(supersessionRecords)
    .where(and(
      eq(supersessionRecords.organizationId, organizationId),
      eq(supersessionRecords.supersededObjectType, objectType),
      eq(supersessionRecords.supersededObjectId, objectId),
      eq(supersessionRecords.state, 'confirmed')
    ))
    .limit(1);

  if (record) {
    return {
      superseded: true,
      successorId: record.successorObjectId,
      successorType: record.successorObjectType,
    };
  }
  return { superseded: false };
}

/**
 * Get the current (non-superseded) version of an object.
 * Walks forward through the supersession chain to find the latest.
 */
export async function getCurrentVersion(
  organizationId: number,
  objectType: string,
  objectId: string,
  maxDepth: number = 20
): Promise<{ objectType: string; objectId: string }> {
  let currentType = objectType;
  let currentId = objectId;

  for (let depth = 0; depth < maxDepth; depth++) {
    const [successor] = await db
      .select()
      .from(supersessionRecords)
      .where(and(
        eq(supersessionRecords.organizationId, organizationId),
        eq(supersessionRecords.supersededObjectType, currentType),
        eq(supersessionRecords.supersededObjectId, currentId),
        eq(supersessionRecords.state, 'confirmed')
      ))
      .limit(1);

    if (!successor) break;

    currentType = successor.successorObjectType;
    currentId = successor.successorObjectId;
  }

  return { objectType: currentType, objectId: currentId };
}

/**
 * Get project supersession records.
 */
export async function getProjectSupersessions(
  organizationId: number,
  projectId: number,
  stateFilter?: SupersessionState
): Promise<SupersessionRecord[]> {
  const conditions = [
    eq(supersessionRecords.organizationId, organizationId),
    eq(supersessionRecords.projectId, projectId),
  ];
  if (stateFilter) {
    conditions.push(eq(supersessionRecords.state, stateFilter));
  }
  return db
    .select()
    .from(supersessionRecords)
    .where(and(...conditions))
    .orderBy(desc(supersessionRecords.createdAt));
}
