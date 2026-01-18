import { db } from '../db';
import { cerv2AuditEvents } from '../../shared/schema';

/**
 * CERv2 Audit Event Types
 * 
 * Comprehensive event types for regulatory traceability.
 * All events are append-only (never update/delete).
 */
export type Cerv2AuditType =
  | 'EVIDENCE_UPLOADED'
  | 'EVIDENCE_UPDATED'
  | 'EVIDENCE_DELETED'
  | 'EVIDENCE_DOWNLOADED'
  | 'EVIDENCE_LINKED'
  | 'EVIDENCE_LINKED_BULK'
  | 'EVIDENCE_UNLINKED'
  | 'EVIDENCE_UNLINKED_BULK'
  | 'CLAIM_CREATED'
  | 'CLAIM_UPDATED'
  | 'CLAIM_DELETED'
  | 'STANDARD_CREATED'
  | 'STANDARD_UPDATED'
  | 'STANDARD_DELETED'
  | 'OUTCOME_CREATED'
  | 'OUTCOME_UPDATED'
  | 'OUTCOME_DELETED'
  | 'STATUS_UPDATED'
  | 'EXPORT_GENERATED'
  | 'EXPORT_DOWNLOADED'
  | 'IMPACT_REVIEW_REQUIRED';

export type Cerv2EntityType = 'claim' | 'standard' | 'outcome' | 'evidence' | 'export' | null;

/**
 * Emit CERv2 Audit Event
 * 
 * Centralized audit writer. All workbench actions MUST emit audit events.
 * Events are append-only (never update/delete) for regulatory compliance.
 * 
 * @param event - Audit event details
 * @returns Created audit event record
 */
export async function emitCerv2Audit(event: {
  organizationId: number;
  programId: string;
  type: Cerv2AuditType;
  actorUserId?: number | null;
  entityType?: Cerv2EntityType;
  entityId?: string | null;
  diffSummary?: string | null;
  payload?: Record<string, unknown> | null;
}): Promise<void> {
  if (!db) {
    console.error('[AUDIT] Database not initialized, skipping audit event:', event.type);
    return;
  }

  await db.insert(cerv2AuditEvents).values({
    organizationId: event.organizationId,
    programId: event.programId,
    action: event.type,
    actorId: event.actorUserId ?? null,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    diffSummary: event.diffSummary ?? null,
    metadata: event.payload ?? {},
  });
}

/**
 * Get audit events with pagination
 * 
 * @param organizationId - Organization ID for multi-tenant isolation
 * @param programId - Program ID
 * @param options - Pagination options
 * @returns Audit events
 */
export async function getAuditEvents(
  organizationId: number,
  programId: string,
  options: {
    cursor?: number;
    limit?: number;
    type?: Cerv2AuditType;
    entityType?: Cerv2EntityType;
  } = {}
) {
  const { cursor, limit = 50, type, entityType } = options;

  const conditions: any[] = [];
  
  if (cursor) {
    conditions.push(sql`${cerv2AuditEvents.id} < ${cursor}`);
  }
  
  if (type) {
    conditions.push(sql`${cerv2AuditEvents.action} = ${type}`);
  }
  
  if (entityType) {
    conditions.push(sql`${cerv2AuditEvents.entityType} = ${entityType}`);
  }

  const where = conditions.length > 0 
    ? and(
        eq(cerv2AuditEvents.organizationId, organizationId),
        eq(cerv2AuditEvents.programId, programId),
        ...conditions
      )
    : and(
        eq(cerv2AuditEvents.organizationId, organizationId),
        eq(cerv2AuditEvents.programId, programId)
      );

  const events = await db
    .select()
    .from(cerv2AuditEvents)
    .where(where)
    .orderBy(desc(cerv2AuditEvents.createdAt))
    .limit(limit);

  return {
    data: events,
    nextCursor: events.length === limit ? events[events.length - 1].id : null,
  };
}

// Re-export for convenience
import { eq, and, desc, sql } from 'drizzle-orm';
