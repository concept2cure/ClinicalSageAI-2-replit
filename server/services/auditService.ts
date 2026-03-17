/**
 * Audit Service — FDA 21 CFR Part 11 Compliant
 *
 * Dual-write audit pipeline:
 *   1. INSERT into the Drizzle `audit_logs` table (queryable via ORM)
 *   2. Delegate to TamperProofAuditLog (hash-chain, HMAC, immutability triggers)
 *
 * Falls back to structured console logging when DB pool is unavailable
 * so startup and non-DB contexts still get audit coverage.
 *
 * Compliance: FDA 21 CFR Part 11 §11.10(e) — independent, time-stamped,
 * tamper-evident audit trail for every create / read / update / delete.
 */

import {
  TamperProofAuditLog,
  getTamperProofAuditLog,
  AuditEventType,
} from '../lib/tamper-proof-audit';
import { createScopedLogger } from '../utils/logger';
import { auditLogs } from '../../shared/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

const logger = createScopedLogger('audit-service');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditLogEntry {
  tenantId?: string | number;
  userId?: string | number;
  action: string;
  resourceType: string;
  resourceId?: string | number;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  /** Alias accepted by callers that use "organizationId" instead of tenantId */
  organizationId?: string | number;
  /** Optional metadata blob — stored in newValues column */
  metadata?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTIONS = {
  REGULATORY_ANALYSIS: 'regulatory_analysis',
  GENERATE_DOCUMENT: 'generate_document',
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  DATA_ACCESS: 'data_access',
  DATA_MODIFY: 'data_modify',
  SIGNATURE_APPLY: 'signature_apply',
};

const RESOURCE_TYPES = {
  ANALYSIS: 'analysis',
  DOCUMENT: 'document',
  USER: 'user',
  PROJECT: 'project',
  SUBMISSION: 'submission',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map action strings to TamperProofAuditLog event types */
function mapEventType(action: string): AuditEventType {
  const mapping: Record<string, AuditEventType> = {
    user_login: 'USER_LOGIN',
    user_logout: 'USER_LOGOUT',
    data_access: 'RECORD_VIEWED',
    data_modify: 'RECORD_UPDATED',
    generate_document: 'DOCUMENT_UPLOADED',
    signature_apply: 'DOCUMENT_SIGNED',
    regulatory_analysis: 'COUNCIL_SESSION_COMPLETED',
    create: 'RECORD_CREATED',
    read: 'RECORD_VIEWED',
    update: 'RECORD_UPDATED',
    delete: 'RECORD_DELETED',
  };
  return mapping[action] || 'RECORD_UPDATED';
}

// ---------------------------------------------------------------------------
// Lazy initialization
// ---------------------------------------------------------------------------

let tamperProofLog: TamperProofAuditLog | null = null;
let initPromise: Promise<void> | null = null;

/** Lazily resolve the Drizzle db instance (avoids circular imports). */
async function getDrizzle() {
  try {
    const { db } = await import('../db');
    return db ?? null;
  } catch {
    return null;
  }
}

/**
 * Lazily initialize the tamper-proof audit log.
 * Safe to call multiple times — only initializes once.
 */
async function ensureInitialized(): Promise<TamperProofAuditLog | null> {
  if (tamperProofLog) return tamperProofLog;

  try {
    const { pool } = await import('../db');
    if (!pool) {
      logger.warn('Database pool not available — audit logging to console only');
      return null;
    }

    tamperProofLog = getTamperProofAuditLog(pool);

    if (!initPromise) {
      initPromise = tamperProofLog.initialize().catch(err => {
        logger.error('Failed to initialize tamper-proof audit table (non-fatal):', err);
      });
    }
    await initPromise;
    return tamperProofLog;
  } catch (error) {
    logger.warn('Tamper-proof audit unavailable — fallback to console', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// AuditService
// ---------------------------------------------------------------------------

class AuditService {
  static ACTIONS = ACTIONS;
  static RESOURCE_TYPES = RESOURCE_TYPES;

  constructor() {
    // Trigger lazy initialization on first import
    ensureInitialized().catch(() => {});
  }

  /**
   * Write an audit entry.
   *
   * Dual-write:
   *   1. Drizzle `audit_logs` table  (standard queryable table)
   *   2. TamperProofAuditLog          (hash-chain immutable log)
   *
   * Supports two call signatures for backward compatibility:
   *   - logAction({ ... })                      (object form)
   *   - logAction(tenantId, userId, action, ...) (positional form)
   */
  async logAction(
    entryOrTenantId: AuditLogEntry | string | number,
    userId?: string | number,
    action?: string,
    resourceType?: string,
    resourceId?: string | number,
    details?: Record<string, any>
  ): Promise<void> {
    const entry: AuditLogEntry =
      typeof entryOrTenantId === 'object'
        ? entryOrTenantId
        : {
            tenantId: entryOrTenantId,
            userId,
            action: action || 'unknown',
            resourceType: resourceType || 'unknown',
            resourceId,
            details,
          };

    // Resolve tenantId from either field name
    const resolvedTenantId = entry.tenantId ?? entry.organizationId;
    const resolvedResourceId =
      entry.resourceId?.toString() ||
      entry.details?.resourceId?.toString() ||
      'unknown';

    // Always log to structured console for observability
    logger.info(`[AUDIT] ${entry.action} ${entry.resourceType}`, {
      userId: entry.userId,
      tenantId: resolvedTenantId,
      resourceId: resolvedResourceId,
    });

    // -----------------------------------------------------------------------
    // 1. Persist to Drizzle audit_logs table
    // -----------------------------------------------------------------------
    try {
      const db = await getDrizzle();
      if (db) {
        await db.insert(auditLogs).values({
          tenantId: Number(resolvedTenantId) || 0,
          userId: entry.userId != null ? Number(entry.userId) : null,
          action: entry.action,
          tableName: entry.resourceType || 'unknown',
          recordId: resolvedResourceId,
          oldValues: null,
          newValues: entry.details ?? entry.metadata ?? null,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent ?? null,
        });
      }
    } catch (error) {
      // Non-fatal: audit write failure should not crash the request
      logger.error('Failed to write audit_logs row', error);
    }

    // -----------------------------------------------------------------------
    // 2. Persist to tamper-proof hash-chain log
    // -----------------------------------------------------------------------
    try {
      const tpLog = await ensureInitialized();
      if (tpLog) {
        await tpLog.log(
          mapEventType(entry.action),
          entry.action,
          {
            tenantId: resolvedTenantId,
            resourceType: entry.resourceType,
            ...(entry.details || {}),
          },
          {
            userId: entry.userId?.toString(),
            resourceType: entry.resourceType,
            resourceId: resolvedResourceId,
            ipAddress: entry.ipAddress,
            userAgent: entry.userAgent,
          }
        );
      }
    } catch (error) {
      logger.error('Failed to write tamper-proof audit entry', error);
    }
  }

  /**
   * Query audit log entries with filtering.
   *
   * Reads from the Drizzle `audit_logs` table first (fast, indexed).
   * Falls back to TamperProofAuditLog search if Drizzle is unavailable.
   */
  async getAuditLog(filters?: {
    userId?: string | number;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    tenantId?: number;
    organizationId?: number;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
  }): Promise<any[]> {
    const maxRows = filters?.limit || 100;

    // --- Try Drizzle audit_logs first ---
    try {
      const db = await getDrizzle();
      if (db) {
        const conditions: ReturnType<typeof eq>[] = [];

        if (filters?.userId != null) {
          conditions.push(eq(auditLogs.userId, Number(filters.userId)));
        }
        if (filters?.action) {
          conditions.push(eq(auditLogs.action, filters.action));
        }
        if (filters?.resourceType) {
          conditions.push(eq(auditLogs.tableName, filters.resourceType));
        }
        if (filters?.resourceId) {
          conditions.push(eq(auditLogs.recordId, filters.resourceId));
        }
        const orgId = filters?.tenantId ?? filters?.organizationId;
        if (orgId != null) {
          conditions.push(eq(auditLogs.tenantId, orgId));
        }
        if (filters?.fromDate) {
          conditions.push(gte(auditLogs.createdAt, filters.fromDate));
        }
        if (filters?.toDate) {
          conditions.push(lte(auditLogs.createdAt, filters.toDate));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const rows = await db
          .select()
          .from(auditLogs)
          .where(whereClause)
          .orderBy(desc(auditLogs.createdAt))
          .limit(maxRows);

        return rows;
      }
    } catch (error) {
      logger.error('Failed to query audit_logs table', error);
    }

    // --- Fallback: TamperProofAuditLog ---
    try {
      const tpLog = await ensureInitialized();
      if (tpLog) {
        return await tpLog.search({
          userId: filters?.userId?.toString(),
          resourceType: filters?.resourceType,
          fromDate: filters?.fromDate,
          toDate: filters?.toDate,
          limit: maxRows,
        });
      }
    } catch (error) {
      logger.error('Failed to fetch tamper-proof audit log', error);
    }

    return [];
  }

  /**
   * Verify the integrity of the tamper-proof audit chain.
   * Returns verification result with pass/fail and detail.
   */
  async verifyChain(): Promise<{ valid: boolean; entriesVerified: number }> {
    try {
      const tpLog = await ensureInitialized();
      if (tpLog) {
        return await tpLog.verifyChain();
      }
    } catch (error) {
      logger.error('Audit chain verification failed', error);
    }
    return { valid: false, entriesVerified: 0 };
  }
}

// ---------------------------------------------------------------------------
// Singleton & exports
// ---------------------------------------------------------------------------

const auditService = new AuditService();

/**
 * Convenience function for JS middleware (auditLogger.js) that calls
 * `auditLog(entry)` directly.
 */
function auditLog(entry: Record<string, any>): void {
  auditService
    .logAction({
      tenantId: entry.tenantId,
      userId: entry.userId,
      action: entry.action || 'API_REQUEST',
      resourceType: entry.resource || 'api',
      resourceId: entry.resourceId,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      details: entry,
    })
    .catch(err => logger.error('auditLog() fire-and-forget failed', err));
}

export default auditService;
export { AuditService, ACTIONS, RESOURCE_TYPES, auditLog };
