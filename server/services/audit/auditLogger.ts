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

  // Store event
  auditStore.push(auditEvent);

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

/**
 * Query audit events with filters
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
