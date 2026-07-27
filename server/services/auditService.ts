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
import { computeAuditChainSealed, hashPayload } from './audit/chain.js';
import { randomUUID } from 'crypto';

const logger = createScopedLogger('audit-service');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditLogEntry {
  tenantId?: string | number;
  userId?: string | number;
  action: string;
  /**
   * What was audited. Optional because `tableName` is an accepted alias for it
   * (see below) — logAction resolves whichever was supplied and falls back to
   * 'unknown' only when neither is.
   */
  resourceType?: string;
  resourceId?: string | number;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  /** Alias accepted by callers that use "organizationId" instead of tenantId */
  organizationId?: string | number;
  /**
   * Aliases for callers that name the audited object by its table and row.
   *
   * Sixteen call sites across the routes pass `tableName` / `recordId` rather
   * than `resourceType` / `resourceId`. They were not accepted here and were
   * not read by logAction, so on every one of those calls the audit row
   * recorded resourceType 'unknown' and resourceId 'unknown' — the WHAT of a
   * Part 11 record, silently dropped, while the call itself looked correct at
   * the call site and compiled everywhere the object was widened to `any`.
   * (`server/routes/onboarding-proposals.ts` is where it finally surfaced as a
   * type error, which is how it was found.)
   *
   * Accepted and mapped rather than removed: the call sites read naturally and
   * changing sixteen of them across several in-flight branches would conflict
   * for no behavioural gain. `resourceType` still wins when both are given.
   */
  tableName?: string;
  recordId?: string | number;
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
    ensureInitialized().catch((err) => {
      logger.error('AUDIT SERVICE INITIALIZATION FAILED — audit trail may be non-functional', { error: err.message });
    });
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
    // ...and the audited object from either naming. Without the tableName /
    // recordId fallbacks these resolved to 'unknown' on every call that used
    // them, which is most of the data_modify audit trail.
    const resolvedResourceType = entry.resourceType || entry.tableName || 'unknown';
    const resolvedResourceId =
      entry.resourceId?.toString() ||
      entry.recordId?.toString() ||
      entry.details?.resourceId?.toString() ||
      'unknown';
    // Normalised in place so every persistence path below sees the resolved
    // values rather than each having to repeat the fallback.
    entry.resourceType = resolvedResourceType;
    entry.resourceId = resolvedResourceId;

    // Always log to structured console for observability
    logger.info(`[AUDIT] ${entry.action} ${entry.resourceType}`, {
      userId: entry.userId,
      tenantId: resolvedTenantId,
      resourceId: resolvedResourceId,
    });

    // -----------------------------------------------------------------------
    // 1. Persist to the canonical audit_logs table — sha256-CHAINED + HMAC-SEALED
    //    (21 CFR Part 11 §11.10(e)/§11.70). Every audit row is committed into the
    //    append-only chain in one transaction holding the SELECT FOR UPDATE on
    //    the prior row (computeAuditChainSealed), so the queryable mirror is
    //    tamper-evident — not just the C2C governed subset. The chain columns
    //    already exist (migrations 20260527 + 20260609). A persistence failure is
    //    logged, never propagated: an audit-trail outage must not break the user
    //    action it records.
    // -----------------------------------------------------------------------
    try {
      const { pool } = await import('../db');
      if (pool) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const occurredAt = new Date().toISOString();
          const actorId =
            entry.userId != null && Number.isFinite(Number(entry.userId)) ? Number(entry.userId) : null;
          const tenantId = Number.isFinite(Number(resolvedTenantId)) ? Number(resolvedTenantId) : 0;
          const newValues = entry.details ?? entry.metadata ?? null;
          const target = `${entry.resourceType ?? 'unknown'}:${resolvedResourceId}`;
          const payloadHash = hashPayload(newValues ?? { action: entry.action, target });
          const { sha256Chain, hmacSeal } = await computeAuditChainSealed(client as any, {
            action: entry.action,
            actor_id: actorId,
            target,
            payload_hash: payloadHash,
            occurred_at: occurredAt,
          });
          await client.query(
            `INSERT INTO audit_logs
               (id, tenant_id, user_id, action, table_name, record_id,
                actor_id, target, payload_hash, sha256_chain, occurred_at, hmac_seal,
                old_values, new_values, ip_address, user_agent)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::json,$15,$16)`,
            [
              randomUUID(),
              tenantId,
              actorId,
              entry.action,
              entry.resourceType || 'unknown',
              resolvedResourceId,
              actorId,
              target,
              payloadHash,
              sha256Chain,
              occurredAt,
              hmacSeal,
              null,
              newValues == null ? null : JSON.stringify(newValues),
              entry.ipAddress ?? null,
              entry.userAgent ?? null,
            ],
          );
          await client.query('COMMIT');
        } catch (txErr) {
          try {
            await client.query('ROLLBACK');
          } catch {
            /* ignore rollback failure */
          }
          throw txErr;
        } finally {
          client.release();
        }
      }
    } catch (error) {
      // Non-fatal: audit write failure should not crash the request
      logger.error('Failed to write chained audit_logs row', error);
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
