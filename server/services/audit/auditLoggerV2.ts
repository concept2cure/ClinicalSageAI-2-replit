/**
 * Enterprise Audit Logging Service
 *
 * 21 CFR Part 11 compliant audit trail with database persistence,
 * cryptographic integrity, and comprehensive querying capabilities.
 *
 * @version 3.0.0
 * @module server/services/audit/auditLogger
 */

import { eq, and, gte, lte, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import crypto from 'crypto';

const logger = createScopedLogger('audit');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type AuditCategory =
  | 'authentication'
  | 'authorization'
  | 'document'
  | 'submission'
  | 'data_change'
  | 'export'
  | 'system'
  | 'compliance'
  | 'evidence'
  | 'program'
  | 'workflow';

export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface AuditEvent {
  id: string;
  timestamp: Date;
  category: AuditCategory;
  severity: AuditSeverity;
  action: string;
  userId: string;
  userName?: string;
  organizationId: string;
  workspaceId?: string;
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  previousValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  duration?: number;
  signature?: string; // Cryptographic signature for 21 CFR Part 11
}

export interface AuditQueryFilters {
  organizationId: string;
  userId?: string;
  category?: AuditCategory | AuditCategory[];
  severity?: AuditSeverity | AuditSeverity[];
  resourceType?: string;
  resourceId?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
  success?: boolean;
  limit?: number;
  offset?: number;
  includeSignature?: boolean;
}

export interface AuditQueryResult {
  events: AuditEvent[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const AUDIT_CONFIG = {
  // Secret key for HMAC signatures (in production, use env variable)
  signingKey: process.env.AUDIT_SIGNING_KEY || 'audit-signing-key-change-in-production',
  // Max events to return in a single query
  maxQueryLimit: 1000,
  // Default query limit
  defaultQueryLimit: 100,
  // Enable async logging for performance
  asyncLogging: true,
  // Retention period in days (for cleanup jobs)
  retentionDays: 2555, // ~7 years for regulatory compliance
};

// In-memory buffer for async logging
const auditBuffer: AuditEvent[] = [];
let flushTimeout: NodeJS.Timeout | null = null;

// ═══════════════════════════════════════════════════════════════════════════════
// CRYPTOGRAPHIC SIGNATURE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate cryptographic signature for audit event (21 CFR Part 11)
 */
function generateSignature(event: Omit<AuditEvent, 'id' | 'signature'>): string {
  const payload = JSON.stringify({
    timestamp: event.timestamp.toISOString(),
    category: event.category,
    action: event.action,
    userId: event.userId,
    organizationId: event.organizationId,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    success: event.success,
  });

  return crypto.createHmac('sha256', AUDIT_CONFIG.signingKey).update(payload).digest('hex');
}

/**
 * Verify signature of audit event
 */
export function verifySignature(event: AuditEvent): boolean {
  if (!event.signature) return false;
  const expectedSignature = generateSignature(event);
  return crypto.timingSafeEqual(Buffer.from(event.signature), Buffer.from(expectedSignature));
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORE LOGGING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate unique audit event ID
 */
function generateAuditId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(8).toString('hex');
  return `aud_${timestamp}_${random}`;
}

/**
 * Log an audit event with cryptographic signature
 */
export async function logAuditEvent(
  eventData: Omit<AuditEvent, 'id' | 'timestamp' | 'signature'>
): Promise<string> {
  const event: AuditEvent = {
    ...eventData,
    id: generateAuditId(),
    timestamp: new Date(),
    signature: '', // Will be set below
  };

  // Generate cryptographic signature
  event.signature = generateSignature(event);

  // Log immediately for critical/error events
  if (event.severity === 'critical' || event.severity === 'error') {
    await persistAuditEvent(event);
  } else if (AUDIT_CONFIG.asyncLogging) {
    // Buffer non-critical events for batch insert
    bufferAuditEvent(event);
  } else {
    await persistAuditEvent(event);
  }

  // Always log to structured logger
  logger.info(`[AUDIT] ${event.category}:${event.action}`, {
    auditId: event.id,
    userId: event.userId,
    organizationId: event.organizationId,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    success: event.success,
    severity: event.severity,
  });

  return event.id;
}

/**
 * Buffer event for batch insert
 */
function bufferAuditEvent(event: AuditEvent): void {
  auditBuffer.push(event);

  // Schedule flush if not already scheduled
  if (!flushTimeout) {
    flushTimeout = setTimeout(flushAuditBuffer, 1000);
  }

  // Flush immediately if buffer is large
  if (auditBuffer.length >= 100) {
    flushAuditBuffer();
  }
}

/**
 * Flush buffered events to database
 */
async function flushAuditBuffer(): Promise<void> {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }

  if (auditBuffer.length === 0) return;

  const events = auditBuffer.splice(0, auditBuffer.length);

  try {
    await persistAuditEvents(events);
  } catch (error) {
    logger.error('Failed to flush audit buffer', { error, eventCount: events.length });
    // Re-add events to buffer for retry
    auditBuffer.unshift(...events);
  }
}

/**
 * Persist single audit event to database
 * Aligns with existing audit_events schema in shared/schema.ts
 */
async function persistAuditEvent(event: AuditEvent): Promise<void> {
  try {
    const organizationId = parseInt(event.organizationId, 10);
    if (!Number.isFinite(organizationId)) {
      throw new Error('Invalid organizationId for audit event');
    }

    // Use raw SQL aligned with existing audit_events table schema
    await db.execute(sql`
      INSERT INTO audit_events (
        organization_id, event_type, entity_type, entity_id, user_name,
        user_role, session_id, ip_address, user_agent, timestamp, timestamp_utc,
        old_values, new_values, reason, comments, requires_signature,
        regulatory_significant, gxp_relevant, metadata
      ) VALUES (
        ${organizationId},
        ${event.action},
        ${event.resourceType || event.category},
        ${parseInt(event.resourceId || '0') || 0},
        ${event.userName || event.userId},
        ${event.metadata?.role || null},
        ${event.sessionId || null},
        ${event.ipAddress || null},
        ${event.userAgent || null},
        ${event.timestamp.toISOString()},
        ${event.timestamp.toISOString()},
        ${event.previousValue ? JSON.stringify(event.previousValue) : null},
        ${event.newValue ? JSON.stringify(event.newValue) : null},
        ${event.metadata?.reason || null},
        ${event.errorMessage || null},
        ${event.severity === 'critical'},
        ${event.category === 'compliance'},
        ${event.category === 'compliance' || event.category === 'document'},
        ${JSON.stringify({
          auditId: event.id,
          severity: event.severity,
          category: event.category,
          success: event.success,
          errorCode: event.errorCode,
          duration: event.duration,
          signature: event.signature,
          resourceName: event.resourceName,
          workspaceId: event.workspaceId,
          userId: event.userId,
          ...event.metadata,
        })}
      )
    `);
  } catch (error) {
    logger.error('Failed to persist audit event', { error, eventId: event.id });
    throw error;
  }
}

/**
 * Persist multiple audit events (batch insert)
 * Aligns with existing audit_events schema
 */
async function persistAuditEvents(events: AuditEvent[]): Promise<void> {
  if (events.length === 0) return;

  try {
    // Insert events one by one for safety and proper error handling
    for (const event of events) {
      await persistAuditEvent(event);
    }
  } catch (error) {
    logger.error('Failed to batch persist audit events', { error, eventCount: events.length });
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Query audit events with filters
 * Aligned with existing audit_events schema
 */
export async function queryAuditEvents(filters: AuditQueryFilters): Promise<AuditQueryResult> {
  const limit = Math.min(
    filters.limit || AUDIT_CONFIG.defaultQueryLimit,
    AUDIT_CONFIG.maxQueryLimit
  );
  const offset = filters.offset || 0;

  try {
    // Build WHERE conditions aligned with existing schema
    const conditions: string[] = [`organization_id = ${parseInt(filters.organizationId) || 0}`];

    if (filters.userId) {
      // metadata->userId stores our userId
      conditions.push(`metadata::text LIKE '%"userId":"${filters.userId}"%'`);
    }
    if (filters.category) {
      if (Array.isArray(filters.category)) {
        conditions.push(
          `(entity_type IN (${filters.category.map(c => `'${c}'`).join(',')}) OR metadata::text ~ '${filters.category.join('|')}')`
        );
      } else {
        conditions.push(
          `(entity_type = '${filters.category}' OR metadata::text LIKE '%"category":"${filters.category}"%')`
        );
      }
    }
    if (filters.severity) {
      if (Array.isArray(filters.severity)) {
        const severityPattern = filters.severity.join('|');
        conditions.push(`metadata::text ~ '"severity":"(${severityPattern})"'`);
      } else {
        conditions.push(`metadata::text LIKE '%"severity":"${filters.severity}"%'`);
      }
    }
    if (filters.resourceType) {
      conditions.push(`entity_type = '${filters.resourceType}'`);
    }
    if (filters.resourceId) {
      conditions.push(`entity_id = ${parseInt(filters.resourceId) || 0}`);
    }
    if (filters.action) {
      conditions.push(`event_type = '${filters.action}'`);
    }
    if (filters.startDate) {
      conditions.push(`timestamp >= '${filters.startDate.toISOString()}'`);
    }
    if (filters.endDate) {
      conditions.push(`timestamp <= '${filters.endDate.toISOString()}'`);
    }
    if (filters.success !== undefined) {
      conditions.push(`metadata::text LIKE '%"success":${filters.success}%'`);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await db.execute(
      sql.raw(`
      SELECT COUNT(*) as total FROM audit_events WHERE ${whereClause}
    `)
    );
    const total = Number((countResult.rows[0] as any)?.total || 0);

    // Get events
    const eventsResult = await db.execute(
      sql.raw(`
      SELECT * FROM audit_events
      WHERE ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ${limit} OFFSET ${offset}
    `)
    );

    const events: AuditEvent[] = (eventsResult.rows as any[]).map(row => {
      const metadata =
        typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {};
      return {
        id: metadata.auditId || `aud_${row.id}`,
        timestamp: new Date(row.timestamp),
        category: metadata.category || row.entity_type,
        severity: metadata.severity || 'info',
        action: row.event_type,
        userId: metadata.userId || row.user_name,
        userName: row.user_name,
        organizationId: String(row.organization_id),
        workspaceId: metadata.workspaceId,
        resourceType: row.entity_type,
        resourceId: String(row.entity_id),
        resourceName: metadata.resourceName,
        previousValue: row.old_values,
        newValue: row.new_values,
        metadata,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        sessionId: row.session_id,
        success: metadata.success ?? true,
        errorCode: metadata.errorCode,
        errorMessage: row.comments,
        duration: metadata.duration,
        signature: filters.includeSignature ? metadata.signature : undefined,
      };
    });

    return {
      events,
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      hasMore: offset + events.length < total,
    };
  } catch (error) {
    logger.error('Failed to query audit events', { error, filters });
    throw error;
  }
}

/**
 * Get complete audit trail for a resource
 */
export async function getResourceAuditTrail(
  resourceType: string,
  resourceId: string,
  organizationId: string
): Promise<AuditEvent[]> {
  const result = await queryAuditEvents({
    organizationId,
    resourceType,
    resourceId,
    limit: AUDIT_CONFIG.maxQueryLimit,
  });
  return result.events;
}

/**
 * Get user activity audit trail
 */
export async function getUserAuditTrail(
  userId: string,
  organizationId: string,
  startDate?: Date,
  endDate?: Date
): Promise<AuditEvent[]> {
  const result = await queryAuditEvents({
    organizationId,
    userId,
    startDate,
    endDate,
    limit: AUDIT_CONFIG.maxQueryLimit,
  });
  return result.events;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export async function logLogin(
  userId: string,
  organizationId: string,
  success: boolean,
  metadata?: Record<string, unknown>
): Promise<string> {
  return logAuditEvent({
    category: 'authentication',
    severity: success ? 'info' : 'warning',
    action: 'user_login',
    userId,
    organizationId,
    success,
    errorMessage: success ? undefined : 'Login failed',
    metadata,
  });
}

export async function logLogout(userId: string, organizationId: string): Promise<string> {
  return logAuditEvent({
    category: 'authentication',
    severity: 'info',
    action: 'user_logout',
    userId,
    organizationId,
    success: true,
  });
}

export async function logDocumentAccess(
  userId: string,
  organizationId: string,
  documentId: string,
  documentName: string,
  action: 'view' | 'download' | 'print' | 'edit'
): Promise<string> {
  return logAuditEvent({
    category: 'document',
    severity: 'info',
    action: `document_${action}`,
    userId,
    organizationId,
    resourceType: 'document',
    resourceId: documentId,
    resourceName: documentName,
    success: true,
  });
}

export async function logDataChange<T>(
  userId: string,
  organizationId: string,
  resourceType: string,
  resourceId: string,
  resourceName: string,
  action: 'create' | 'update' | 'delete',
  previousValue?: T,
  newValue?: T
): Promise<string> {
  return logAuditEvent({
    category: 'data_change',
    severity: action === 'delete' ? 'warning' : 'info',
    action: `${resourceType}_${action}`,
    userId,
    organizationId,
    resourceType,
    resourceId,
    resourceName,
    previousValue,
    newValue,
    success: true,
  });
}

export async function logExport(
  userId: string,
  organizationId: string,
  exportType: string,
  resourceIds: string[],
  metadata?: Record<string, unknown>
): Promise<string> {
  return logAuditEvent({
    category: 'export',
    severity: 'info',
    action: `export_${exportType}`,
    userId,
    organizationId,
    resourceType: 'export',
    metadata: { ...metadata, resourceIds, count: resourceIds.length },
    success: true,
  });
}

export async function logSecurityEvent(
  userId: string,
  organizationId: string,
  action: string,
  severity: AuditSeverity,
  metadata?: Record<string, unknown>
): Promise<string> {
  return logAuditEvent({
    category: 'authorization',
    severity,
    action,
    userId,
    organizationId,
    metadata,
    success: severity === 'info',
    errorMessage: severity !== 'info' ? `Security event: ${action}` : undefined,
  });
}

export async function logProgramActivity(
  userId: string,
  organizationId: string,
  programId: string,
  programName: string,
  action: string,
  metadata?: Record<string, unknown>
): Promise<string> {
  return logAuditEvent({
    category: 'program',
    severity: 'info',
    action,
    userId,
    organizationId,
    resourceType: 'program',
    resourceId: programId,
    resourceName: programName,
    metadata,
    success: true,
  });
}

export async function logEvidenceActivity(
  userId: string,
  organizationId: string,
  evidenceId: string,
  evidenceTitle: string,
  action: string,
  metadata?: Record<string, unknown>
): Promise<string> {
  return logAuditEvent({
    category: 'evidence',
    severity: 'info',
    action,
    userId,
    organizationId,
    resourceType: 'evidence',
    resourceId: evidenceId,
    resourceName: evidenceTitle,
    metadata,
    success: true,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLEANUP & MAINTENANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Archive old audit events (for compliance retention)
 * Aligned with existing schema
 */
export async function archiveOldEvents(
  daysOld: number = AUDIT_CONFIG.retentionDays
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  try {
    // In production, this would move to archive storage
    // For now, we just count what would be archived
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM audit_events
      WHERE timestamp < ${cutoffDate.toISOString()}
    `);
    return Number((result.rows[0] as any)?.count || 0);
  } catch (error) {
    logger.error('Failed to archive old events', { error });
    throw error;
  }
}

/**
 * Ensure graceful shutdown (flush buffer)
 */
export async function shutdown(): Promise<void> {
  await flushAuditBuffer();
}

export default {
  logAuditEvent,
  queryAuditEvents,
  getResourceAuditTrail,
  getUserAuditTrail,
  verifySignature,
  logLogin,
  logLogout,
  logDocumentAccess,
  logDataChange,
  logExport,
  logSecurityEvent,
  logProgramActivity,
  logEvidenceActivity,
  archiveOldEvents,
  shutdown,
};
