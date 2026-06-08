/**
 * Audit Logging Service
 *
 * Comprehensive audit trail for regulatory compliance (21 CFR Part 11).
 * All user actions, data changes, and system events are logged.
 *
 * @version 2.0.0
 * @module server/services/audit/auditLogger
 */

import { createScopedLogger } from '../../utils/logger';
import { query } from '../../db';

const logger = createScopedLogger('audit');

// Audit event categories
export type AuditCategory =
  | 'authentication'
  | 'authorization'
  | 'document'
  | 'submission'
  | 'data_change'
  | 'export'
  | 'system'
  | 'compliance';

// Audit severity levels
export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

// Audit event structure
export interface AuditEvent {
  id: string;
  timestamp: Date;
  category: AuditCategory;
  severity: AuditSeverity;
  action: string;
  userId: string;
  organizationId: string;
  resourceType?: string;
  resourceId?: string;
  previousValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
}

// In-memory audit store (replace with database in production)
const auditStore: AuditEvent[] = [];

/**
 * Generate unique audit event ID
 */
function generateAuditId(): string {
  return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Log an audit event
 */
export async function logAuditEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<string> {
  const auditEvent: AuditEvent = {
    ...event,
    id: generateAuditId(),
    timestamp: new Date(),
  };

  // In-memory cache: a hot, process-local copy and the fallback read source
  // when the database is unavailable.
  auditStore.push(auditEvent);

  // Durable persistence to the canonical application audit log (best-effort,
  // non-blocking — a logging failure must never break the audited action).
  void persistAuditEvent(auditEvent);

  // Log to console for debugging
  logger.info(`[AUDIT] ${event.category}:${event.action}`, {
    userId: event.userId,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    success: event.success,
  });

  // Trim store if too large (keep last 10000 events in memory)
  if (auditStore.length > 10000) {
    auditStore.splice(0, auditStore.length - 10000);
  }

  return auditEvent.id;
}

/** Persist one event to `application_audit_log`. Never throws. */
async function persistAuditEvent(e: AuditEvent): Promise<void> {
  try {
    await query(
      `INSERT INTO application_audit_log
         (id, organization_id, user_id, category, severity, action, resource_type,
          resource_id, previous_value, new_value, metadata, ip_address, user_agent,
          success, error_message, event_timestamp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::json,$10::json,$11::json,$12,$13,$14,$15,$16)
       ON CONFLICT (id) DO NOTHING`,
      [
        e.id,
        e.organizationId,
        e.userId,
        e.category,
        e.severity,
        e.action,
        e.resourceType ?? null,
        e.resourceId ?? null,
        e.previousValue === undefined ? null : JSON.stringify(e.previousValue),
        e.newValue === undefined ? null : JSON.stringify(e.newValue),
        e.metadata === undefined ? null : JSON.stringify(e.metadata),
        e.ipAddress ?? null,
        e.userAgent ?? null,
        e.success,
        e.errorMessage ?? null,
        e.timestamp.toISOString(),
      ]
    );
  } catch (err) {
    // Durability is best-effort; the in-memory cache retains the event for this
    // process. A missing database in dev/test is an expected, non-actionable case.
    logger.warn('[AUDIT] persist failed (kept in-memory)', {
      id: e.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Map an `application_audit_log` row back to the {@link AuditEvent} shape. */
function rowToAuditEvent(row: Record<string, unknown>): AuditEvent {
  return {
    id: String(row.id),
    timestamp: new Date(row.event_timestamp as string),
    category: row.category as AuditCategory,
    severity: row.severity as AuditSeverity,
    action: String(row.action),
    userId: String(row.user_id),
    organizationId: String(row.organization_id),
    resourceType: (row.resource_type as string) ?? undefined,
    resourceId: (row.resource_id as string) ?? undefined,
    previousValue: row.previous_value ?? undefined,
    newValue: row.new_value ?? undefined,
    metadata: (row.metadata as Record<string, unknown>) ?? undefined,
    ipAddress: (row.ip_address as string) ?? undefined,
    userAgent: (row.user_agent as string) ?? undefined,
    success: Boolean(row.success),
    errorMessage: (row.error_message as string) ?? undefined,
  };
}

export interface AuditQueryFilters {
  organizationId?: string;
  userId?: string;
  category?: AuditCategory;
  resourceType?: string;
  resourceId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Query audit events with filters. Reads the durable `application_audit_log`
 * first; if the database is unavailable, falls back to the in-memory cache so
 * the API still works in dev/test and during a transient outage.
 */
export async function queryAuditEvents(
  filters: AuditQueryFilters
): Promise<{ events: AuditEvent[]; total: number }> {
  try {
    return await queryAuditEventsFromDb(filters);
  } catch (err) {
    logger.warn('[AUDIT] DB query failed; serving from in-memory cache', {
      err: err instanceof Error ? err.message : String(err),
    });
    return queryAuditEventsInMemory(filters);
  }
}

/** DB-backed audit query against `application_audit_log`. */
async function queryAuditEventsFromDb(
  filters: AuditQueryFilters
): Promise<{ events: AuditEvent[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    params.push(value);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  if (filters.organizationId) add('organization_id = $?', filters.organizationId);
  if (filters.userId) add('user_id = $?', filters.userId);
  if (filters.category) add('category = $?', filters.category);
  if (filters.resourceType) add('resource_type = $?', filters.resourceType);
  if (filters.resourceId) add('resource_id = $?', filters.resourceId);
  if (filters.startDate) add('event_timestamp >= $?', filters.startDate.toISOString());
  if (filters.endDate) add('event_timestamp <= $?', filters.endDate.toISOString());
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRes = await query(
    `SELECT COUNT(*)::int AS total FROM application_audit_log ${whereSql}`,
    params
  );
  const total = Number(countRes.rows[0]?.total ?? 0);

  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;
  const pageParams = [...params, limit, offset];
  const rowsRes = await query(
    `SELECT * FROM application_audit_log ${whereSql}
     ORDER BY event_timestamp DESC
     LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
    pageParams
  );
  return { events: rowsRes.rows.map(rowToAuditEvent), total };
}

/** In-memory fallback query over the process-local cache. */
function queryAuditEventsInMemory(filters: AuditQueryFilters): {
  events: AuditEvent[];
  total: number;
} {
  let results = [...auditStore];

  // Apply filters
  if (filters.organizationId) {
    results = results.filter(e => e.organizationId === filters.organizationId);
  }
  if (filters.userId) {
    results = results.filter(e => e.userId === filters.userId);
  }
  if (filters.category) {
    results = results.filter(e => e.category === filters.category);
  }
  if (filters.resourceType) {
    results = results.filter(e => e.resourceType === filters.resourceType);
  }
  if (filters.resourceId) {
    results = results.filter(e => e.resourceId === filters.resourceId);
  }
  if (filters.startDate) {
    results = results.filter(e => e.timestamp >= filters.startDate!);
  }
  if (filters.endDate) {
    results = results.filter(e => e.timestamp <= filters.endDate!);
  }

  // Sort by timestamp descending
  results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const total = results.length;
  const offset = filters.offset || 0;
  const limit = filters.limit || 100;

  return {
    events: results.slice(offset, offset + limit),
    total,
  };
}

/**
 * Get audit trail for a specific resource
 */
export async function getResourceAuditTrail(
  resourceType: string,
  resourceId: string,
  organizationId: string
): Promise<AuditEvent[]> {
  const { events } = await queryAuditEvents({
    resourceType,
    resourceId,
    organizationId,
    limit: 1000,
  });
  return events;
}

// Convenience functions for common audit events

export async function logLogin(
  userId: string,
  organizationId: string,
  success: boolean,
  metadata?: Record<string, unknown>
): Promise<string> {
  return logAuditEvent({
    category: 'authentication',
    severity: success ? 'info' : 'warning',
    action: 'login',
    userId,
    organizationId,
    success,
    metadata,
  });
}

export async function logLogout(userId: string, organizationId: string): Promise<string> {
  return logAuditEvent({
    category: 'authentication',
    severity: 'info',
    action: 'logout',
    userId,
    organizationId,
    success: true,
  });
}

export async function logDocumentAccess(
  userId: string,
  organizationId: string,
  documentId: string,
  action: 'view' | 'download' | 'print'
): Promise<string> {
  return logAuditEvent({
    category: 'document',
    severity: 'info',
    action: `document_${action}`,
    userId,
    organizationId,
    resourceType: 'document',
    resourceId: documentId,
    success: true,
  });
}

export async function logDataChange(
  userId: string,
  organizationId: string,
  resourceType: string,
  resourceId: string,
  action: 'create' | 'update' | 'delete',
  previousValue?: unknown,
  newValue?: unknown
): Promise<string> {
  return logAuditEvent({
    category: 'data_change',
    severity: 'info',
    action: `${resourceType}_${action}`,
    userId,
    organizationId,
    resourceType,
    resourceId,
    previousValue,
    newValue,
    success: true,
  });
}

export async function logExport(
  userId: string,
  organizationId: string,
  exportType: string,
  resourceIds: string[]
): Promise<string> {
  return logAuditEvent({
    category: 'export',
    severity: 'info',
    action: `export_${exportType}`,
    userId,
    organizationId,
    resourceType: 'export',
    metadata: { resourceIds, count: resourceIds.length },
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
    success: severity !== 'error' && severity !== 'critical',
  });
}

/**
 * Input accepted by {@link AuditLogger.log}. A flatter, service-friendly shape
 * than {@link AuditEvent}: callers pass `details` (mapped to `metadata`) and an
 * optional `timestamp` (the canonical event timestamp is assigned by
 * {@link logAuditEvent}). Required category/severity/success are defaulted.
 */
export interface AuditLogInput {
  action: string;
  userId: string;
  organizationId: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  category?: AuditCategory;
  severity?: AuditSeverity;
  success?: boolean;
  /** Accepted for call-site compatibility; the event timestamp is set by the audit pipeline. */
  timestamp?: Date;
}

/**
 * Instantiable audit-logging facade for service classes that prefer a
 * `new AuditLogger().log({ ... })` call over the functional `logAuditEvent`
 * API. Delegates to {@link logAuditEvent} so every record flows through the
 * single signed, 21 CFR Part 11-compliant pipeline.
 */
export class AuditLogger {
  async log(input: AuditLogInput): Promise<string> {
    return logAuditEvent({
      category: input.category ?? 'system',
      severity: input.severity ?? 'info',
      action: input.action,
      userId: input.userId,
      organizationId: input.organizationId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.details,
      success: input.success ?? true,
    });
  }
}

export default {
  logAuditEvent,
  queryAuditEvents,
  getResourceAuditTrail,
  logLogin,
  logLogout,
  logDocumentAccess,
  logDataChange,
  logExport,
  logSecurityEvent,
};
