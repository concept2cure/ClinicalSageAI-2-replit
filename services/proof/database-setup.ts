/**
 * Proof System Database Setup
 * 
 * Configures database persistence for the proof audit system.
 * MUST be called during application startup for 21 CFR Part 11 compliance.
 */

import { db } from '../../server/db';
import { proofAuditLogs } from '../../shared/schema';
import { ProofAuditService, ProofAuditEntry } from './ProofAuditService';
import logger from '../../server/utils/logger';

/**
 * Initialize proof system database persistence.
 * Call this during application startup.
 */
export async function initializeProofDatabasePersistence(): Promise<void> {
  const auditService = ProofAuditService.getInstance();
  
  // Configure database persister
  auditService.setDatabasePersister(async (entry: ProofAuditEntry) => {
    try {
      await db.insert(proofAuditLogs).values({
        entryId: entry.id,
        organizationId: entry.organizationId ? parseInt(entry.organizationId, 10) : null,
        workflowRunId: entry.workflowRunId,
        eventType: entry.eventType,
        actorId: entry.actorId,
        actorRole: entry.actorRole,
        details: entry.details,
        previousHash: entry.previousHash,
        hashChain: entry.hashChain,
        timestampSource: 'server', // TODO: Implement NTP verification
      });
      
      logger.debug('proof.audit.persisted', { entryId: entry.id, eventType: entry.eventType });
    } catch (error) {
      logger.error('proof.audit.persistence_failed', {
        entryId: entry.id,
        error: error instanceof Error ? error.message : 'unknown_error',
      });
      throw error;
    }
  });
  
  logger.info('proof.system.initialized', { message: 'Database persistence configured for proof audit system' });
}

/**
 * Initialize tenant-specific audit persistence.
 * Call this when a new tenant is activated.
 */
export function initializeTenantProofPersistence(tenantId: string): void {
  const auditService = ProofAuditService.getInstanceForTenant(tenantId);
  
  auditService.setDatabasePersister(async (entry: ProofAuditEntry) => {
    try {
      await db.insert(proofAuditLogs).values({
        entryId: entry.id,
        organizationId: parseInt(tenantId, 10),
        workflowRunId: entry.workflowRunId,
        eventType: entry.eventType,
        actorId: entry.actorId,
        actorRole: entry.actorRole,
        details: entry.details,
        previousHash: entry.previousHash,
        hashChain: entry.hashChain,
        timestampSource: 'server',
      });
    } catch (error) {
      logger.error('proof.audit.tenant_persistence_failed', {
        tenantId,
        entryId: entry.id,
        error: error instanceof Error ? error.message : 'unknown_error',
      });
      throw error;
    }
  });
  
  logger.info('proof.tenant.initialized', { tenantId });
}

/**
 * Retry persisting any failed audit entries.
 * Call this periodically or on demand.
 */
export async function retryFailedPersistence(): Promise<{ success: number; failed: number }> {
  const auditService = ProofAuditService.getInstance();
  const result = await auditService.retryPersistence();
  
  if (result.failed > 0) {
    logger.warn('proof.audit.retry_incomplete', result);
  } else if (result.success > 0) {
    logger.info('proof.audit.retry_complete', result);
  }
  
  return result;
}

/**
 * Verify audit chain integrity from database.
 * For external audit verification.
 */
export async function verifyDatabaseAuditChain(organizationId?: number): Promise<{
  valid: boolean;
  totalEntries: number;
  brokenAt?: string;
}> {
  try {
    const entries = await db
      .select()
      .from(proofAuditLogs)
      .where(organizationId ? { organizationId } : undefined)
      .orderBy(proofAuditLogs.timestamp);
    
    let prevHash: string | null = null;
    for (const entry of entries) {
      if (entry.previousHash !== prevHash) {
        return {
          valid: false,
          totalEntries: entries.length,
          brokenAt: entry.entryId,
        };
      }
      prevHash = entry.hashChain;
    }
    
    return { valid: true, totalEntries: entries.length };
  } catch (error) {
    logger.error('proof.audit.chain_verification_failed', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    throw error;
  }
}

export default {
  initializeProofDatabasePersistence,
  initializeTenantProofPersistence,
  retryFailedPersistence,
  verifyDatabaseAuditChain,
};
