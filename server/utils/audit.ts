import { sql } from 'drizzle-orm';
import { db } from '../db';
import { cerv2AuditEvents } from '../../shared/schema';

/**
 * Audit Event Types - Append-Only Trail
 * 
 * CRITICAL: Never update or delete audit events. Emit new events for corrections.
 */
export type AuditType =
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

export interface AuditEvent {
  programId: string;
  organizationId: number;
  type: AuditType;
  actorUserId?: number | null;
  entityType?: string | null;
  entityId?: string | null;
  diffSummary?: string | null;
  payload?: Record<string, any> | null;
}

/**
 * Emit Audit Event - Centralized Append-Only Logger
 * 
 * This is the ONLY way to create audit events.
 * Benefits:
 * 1. Type safety for audit event types
 * 2. Consistent structure
 * 3. No one-off db.insert() calls scattered everywhere
 * 4. Easy to add hooks (webhooks, analytics, compliance exports)
 * 
 * @param event Audit event to emit
 * @returns Created audit event record
 */
export async function emitAudit(event: AuditEvent) {
  if (!db) {
    throw new Error('Database not available for audit logging');
  }

  const [created] = await db.insert(cerv2AuditEvents).values({
    organizationId: event.organizationId,
    programId: event.programId,
    actorId: event.actorUserId ?? null,
    action: event.type,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    diffSummary: event.diffSummary ?? null,
    metadata: event.payload ?? {},
  }).returning();

  return created;
}

/**
 * List Audit Events with Pagination
 * 
 * @param programId Program to filter by
 * @param organizationId Organization to filter by
 * @param options Pagination and filtering options
 * @returns Array of audit events
 */
export async function listAuditEvents(
  programId: string,
  organizationId: number,
  options: {
    limit?: number;
    cursor?: number; // audit event ID to paginate from
    type?: AuditType;
    entityType?: string;
  } = {}
) {
  if (!db) {
    throw new Error('Database not available');
  }

  const limit = Math.min(options.limit || 50, 200); // cap at 200
  
  let query = db
    .select()
    .from(cerv2AuditEvents)
    .where(sql`${cerv2AuditEvents.organizationId} = ${organizationId} AND ${cerv2AuditEvents.programId} = ${programId}`);

  if (options.cursor) {
    query = query.where(sql`${cerv2AuditEvents.id} < ${options.cursor}`);
  }

  if (options.type) {
    query = query.where(sql`${cerv2AuditEvents.action} = ${options.type}`);
  }

  if (options.entityType) {
    query = query.where(sql`${cerv2AuditEvents.entityType} = ${options.entityType}`);
  }

  const rows = await query
    .orderBy(sql`${cerv2AuditEvents.createdAt} DESC`)
    .limit(limit);

  return rows;
}
