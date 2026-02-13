/**
 * Audit Service — FDA 21 CFR Part 11 Compliant
 *
 * CRIT-02 FIX: Replaced console.log stub with delegation to
 * TamperProofAuditLog (hash-chain, HMAC, immutability triggers).
 *
 * Falls back to structured console logging when DB pool is unavailable
 * so startup and non-DB contexts still get audit coverage.
 */

import {
  TamperProofAuditLog,
  getTamperProofAuditLog,
  AuditEventType,
} from '../lib/tamper-proof-audit';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('audit-service');

interface AuditLogEntry {
  tenantId?: string | number;
  userId?: string | number;
  action: string;
  resourceType: string;
  resourceId?: string | number;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

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
  };
  return mapping[action] || 'RECORD_UPDATED';
}

let tamperProofLog: TamperProofAuditLog | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Lazily initialize the tamper-proof audit log.
 * Safe to call multiple times — only initializes once.
 */
async function ensureInitialized(): Promise<TamperProofAuditLog | null> {
  if (tamperProofLog) return tamperProofLog;

  try {
    // Dynamic import to avoid circular dependency at module load time
    const { pool } = await import('../db');
    if (!pool) {
      logger.warn('Database pool not available — audit logging to console only');
      return null;
    }

    tamperProofLog = getTamperProofAuditLog(pool);

    if (!initPromise) {
      initPromise = tamperProofLog.initialize().catch(err => {
        logger.error('Failed to initialize tamper-proof audit table (non-fatal):', err);
        // Table may already exist — continue operating
      });
    }
    await initPromise;
    return tamperProofLog;
  } catch (error) {
    logger.warn('Tamper-proof audit unavailable — fallback to console', error);
    return null;
  }
}

class AuditService {
  static ACTIONS = ACTIONS;
  static RESOURCE_TYPES = RESOURCE_TYPES;

  constructor() {
    // Trigger lazy initialization on first import
    ensureInitialized().catch(() => {});
  }

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
            details: { ...details, resourceId },
          };

    // Always log to structured console for observability
    logger.info(`[AUDIT] ${entry.action} ${entry.resourceType}`, {
      userId: entry.userId,
      tenantId: entry.tenantId,
      details: entry.details,
    });

    // Persist to tamper-proof hash-chain log
    try {
      const tpLog = await ensureInitialized();
      if (tpLog) {
        await tpLog.log(
          mapEventType(entry.action),
          entry.action,
          {
            tenantId: entry.tenantId,
            resourceType: entry.resourceType,
            ...(entry.details || {}),
          },
          {
            userId: entry.userId?.toString(),
            resourceType: entry.resourceType,
            resourceId: entry.details?.resourceId?.toString() || resourceId?.toString(),
            ipAddress: entry.ipAddress,
            userAgent: entry.userAgent,
          }
        );
      }
    } catch (error) {
      // Non-fatal: audit write failure should not crash the request
      logger.error('Failed to write tamper-proof audit entry', error);
    }
  }

  async getAuditLog(filters?: {
    userId?: string;
    resourceType?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
  }): Promise<any[]> {
    try {
      const tpLog = await ensureInitialized();
      if (tpLog) {
        return await tpLog.search({
          userId: filters?.userId,
          resourceType: filters?.resourceType,
          fromDate: filters?.fromDate,
          toDate: filters?.toDate,
          limit: filters?.limit || 100,
        });
      }
    } catch (error) {
      logger.error('Failed to fetch audit log', error);
    }
    return [];
  }

  /**
   * Verify the integrity of the audit chain.
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

const auditService = new AuditService();
export default auditService;
export { AuditService, ACTIONS, RESOURCE_TYPES };
