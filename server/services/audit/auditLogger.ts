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
import auditService from '../auditService';

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

// In-memory cache, used ONLY as a fallback for queryAuditEvents when the
// durable store is unavailable. The system of record is the persistent
// auditService (audit_logs + tamper-proof hash-chain log), which every event is
// forwarded to; queryAuditEvents reads from there first. This array is bounded
// and lost on restart — never the authoritative source.
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

  // Cache in memory for fast queries
  auditStore.push(auditEvent);

  // Log to console for debugging
  logger.info(`[AUDIT] ${event.category}:${event.action}`, {
    userId: event.userId,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    success: event.success,
  });

  // Trim cache if too large (keep last 10000 events in memory)
  if (auditStore.length > 10000) {
    auditStore.splice(0, auditStore.length - 10000);
  }

  // Persist through the canonical store so the event survives a restart and is
  // queryable + tamper-evident (21 CFR Part 11 §11.10(e)). auditService.logAction
  // writes audit_logs + the tamper-proof hash-chain log. The forward is
  // best-effort — a persistence failure is logged but never propagated to the
  // caller (an audit-trail outage must not break the user action it records).
  // resourceType is required there; fall back to the event category when a
  // resource is not named.
  try {
    await auditService.logAction({
      action: `${event.category}.${event.action}`,
      resourceType: event.resourceType ?? event.category,
      resourceId: event.resourceId,
      organizationId: event.organizationId,
      userId: event.userId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      details: {
        ...(event.metadata ?? {}),
        category: event.category,
        severity: event.severity,
        success: event.success,
        ...(event.previousValue !== undefined ? { previousValue: event.previousValue } : {}),
        ...(event.newValue !== undefined ? { newValue: event.newValue } : {}),
        ...(event.errorMessage ? { errorMessage: event.errorMessage } : {}),
      },
    });
  } catch (err) {
    logger.error('Failed to persist audit event to canonical store', err);
  }

  return auditEvent.id;
}

/**
 * Map a persisted canonical audit_logs row (as returned by
 * auditService.getAuditLog) back to the AuditEvent shape this module exposes.
 * logAuditEvent stores the combined `category.action` in `action` and the
 * category/severity/success inside the details (newValues) blob.
 */
function rowToAuditEvent(row: any): AuditEvent {
  const details: Record<string, unknown> = (row?.newValues as Record<string, unknown>) ?? {};
  const combinedAction: string = String(row?.action ?? '');
  const dotIdx = combinedAction.indexOf('.');
  const category =
    (details.category as AuditCategory | undefined) ??
    ((dotIdx > 0 ? combinedAction.slice(0, dotIdx) : 'system') as AuditCategory);
  const bareAction = dotIdx > 0 ? combinedAction.slice(dotIdx + 1) : combinedAction;
  return {
    id: String(row?.id ?? ''),
    timestamp: row?.createdAt ? new Date(row.createdAt) : new Date(0),
    category,
    severity: (details.severity as AuditSeverity | undefined) ?? 'info',
    action: bareAction || combinedAction,
    userId: row?.userId != null ? String(row.userId) : '',
    organizationId: row?.tenantId != null ? String(row.tenantId) : '',
    resourceType: row?.tableName ?? undefined,
    resourceId: row?.recordId ?? undefined,
    previousValue: row?.oldValues ?? undefined,
    newValue: details.newValue ?? undefined,
    metadata: details,
    ipAddress: row?.ipAddress ?? undefined,
    userAgent: row?.userAgent ?? undefined,
    success: details.success !== false,
    errorMessage: (details.errorMessage as string | undefined) ?? undefined,
  };
}

// Upper bound on rows pulled from the durable store for a single query window.
// The persistent store is the system of record; this caps the working set we
// filter/paginate in memory so a query can't pull an unbounded table.
const PERSISTENT_QUERY_WINDOW = 2000;

/**
 * Query audit events with filters.
 *
 * Reads from the DURABLE canonical store (audit_logs via auditService) so that
 * retrieval survives restarts and is not limited to the volatile in-memory
 * cache (21 CFR Part 11 — the audit trail must be inspectable, not just the
 * last N events held in memory). Falls back to the in-memory cache only when
 * the persistent store is unavailable.
 */
export async function queryAuditEvents(filters: {
  organizationId?: string;
  userId?: string;
  category?: AuditCategory;
  resourceType?: string;
  resourceId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}): Promise<{ events: AuditEvent[]; total: number }> {
  const offset = filters.offset || 0;
  const limit = filters.limit || 100;

  let results: AuditEvent[] | null = null;

  // --- Primary: durable canonical store ---
  try {
    const rows = await auditService.getAuditLog({
      userId: filters.userId,
      resourceType: filters.resourceType,
      resourceId: filters.resourceId,
      organizationId: filters.organizationId != null ? Number(filters.organizationId) : undefined,
      fromDate: filters.startDate,
      toDate: filters.endDate,
      // category is a prefix of the stored `action`, so it can't be pushed into
      // the SQL filter; over-fetch a bounded window and filter in memory.
      limit: filters.category ? PERSISTENT_QUERY_WINDOW : Math.min(offset + limit, PERSISTENT_QUERY_WINDOW),
    });
    if (Array.isArray(rows)) {
      results = rows.map(rowToAuditEvent);
      // category filter (prefix of action) applied post-hoc
      if (filters.category) {
        results = results.filter(e => e.category === filters.category);
      }
    }
  } catch (err) {
    logger.error('queryAuditEvents: durable store query failed; falling back to in-memory cache', err);
  }

  // --- Fallback: in-memory cache (DB unavailable) ---
  if (results == null) {
    results = [...auditStore];
    if (filters.organizationId) results = results.filter(e => e.organizationId === filters.organizationId);
    if (filters.userId) results = results.filter(e => e.userId === filters.userId);
    if (filters.category) results = results.filter(e => e.category === filters.category);
    if (filters.resourceType) results = results.filter(e => e.resourceType === filters.resourceType);
    if (filters.resourceId) results = results.filter(e => e.resourceId === filters.resourceId);
    if (filters.startDate) results = results.filter(e => e.timestamp >= filters.startDate!);
    if (filters.endDate) results = results.filter(e => e.timestamp <= filters.endDate!);
  }

  // Sort by timestamp descending
  results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const total = results.length;
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
 * API. Delegates to {@link logAuditEvent}, which both caches the event in memory
 * and persists it through the canonical auditService (audit_logs + tamper-proof
 * hash-chain log) for 21 CFR Part 11 durability.
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
