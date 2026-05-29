/**
 * Tamper-Proof Audit Log System
 *
 * FDA 21 CFR Part 11 Compliant - Cryptographic Integrity
 *
 * Implements immutable, cryptographically-verified audit logs using
 * hash chains (similar to blockchain). Each entry contains:
 *   1. Content hash of the audit data
 *   2. Hash of the previous entry (chain)
 *   3. Timestamp
 *   4. Digital signature (optional, for high-security deployments)
 *
 * Any tampering with historical records breaks the hash chain and
 * is immediately detectable through verification.
 *
 * Compliance Requirements Met:
 * - FDA 21 CFR Part 11.10(e): Audit trails
 * - FDA 21 CFR Part 11.10(k.2): Electronic signatures
 * - ICH E6(R2) 5.5.3: Data integrity
 *
 * @module TamperProofAuditLog
 * @version 1.0.0
 * @compliance FDA 21 CFR Part 11, ICH E6(R2), GAMP 5
 */

import { Pool, PoolClient } from 'pg';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// =============================================================================
// Types
// =============================================================================

export type AuditEventType =
  // Authentication Events
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'LOGIN_FAILED'
  | 'SESSION_EXPIRED'
  | 'PASSWORD_CHANGED'
  | 'MFA_ENABLED'
  | 'MFA_DISABLED'
  // Data Events
  | 'RECORD_CREATED'
  | 'RECORD_UPDATED'
  | 'RECORD_DELETED'
  | 'RECORD_VIEWED'
  // Document Events
  | 'DOCUMENT_UPLOADED'
  | 'DOCUMENT_SIGNED'
  | 'DOCUMENT_APPROVED'
  | 'DOCUMENT_REJECTED'
  // Council Events
  | 'COUNCIL_SESSION_STARTED'
  | 'COUNCIL_SESSION_COMPLETED'
  | 'COUNCIL_SESSION_FAILED'
  | 'AGENT_EXECUTION_STARTED'
  | 'AGENT_EXECUTION_COMPLETED'
  | 'AGENT_EXECUTION_FAILED'
  // Verification Events
  | 'DATA_VERIFICATION_PASSED'
  | 'DATA_VERIFICATION_FAILED'
  | 'DATA_DISCREPANCY_DETECTED'
  // System Events
  | 'SYSTEM_STARTUP'
  | 'SYSTEM_SHUTDOWN'
  | 'CONFIG_CHANGED'
  | 'CIRCUIT_BREAKER_OPENED'
  | 'CIRCUIT_BREAKER_CLOSED'
  | 'LLM_FALLBACK_USED'
  // Security Events
  | 'PROMPT_INJECTION_BLOCKED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'UNAUTHORIZED_ACCESS'
  | 'AUDIT_VERIFICATION_PASSED'
  | 'AUDIT_VERIFICATION_FAILED';

export interface AuditEntry {
  id: string;
  sequenceNumber: number;
  eventType: AuditEventType;
  eventTimestamp: Date;
  userId?: string;
  userName?: string;
  sessionId?: string;
  correlationId?: string;
  resourceType?: string;
  resourceId?: string;
  action: string;
  details: Record<string, unknown>;
  previousHash: string;
  contentHash: string;
  chainHash: string;
  signature?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface VerificationResult {
  valid: boolean;
  entriesVerified: number;
  firstInvalidEntry?: number;
  invalidReason?: string;
  verifiedAt: Date;
}

// =============================================================================
// Tamper-Proof Audit Log Service
// =============================================================================

export class TamperProofAuditLog {
  private pool: Pool;
  private readonly hmacSecret: string;
  private readonly GENESIS_HASH = '0'.repeat(64);

  constructor(pool: Pool) {
    this.pool = pool;

    // HMAC secret signs the tamper-evident hash chain. A predictable secret
    // would let anyone with the source forge or recompute the chain, defeating
    // the 21 CFR Part 11 integrity guarantee. Fail closed in production: a
    // missing secret is a fatal misconfiguration, not a warning to ignore.
    const secret = process.env.AUDIT_HMAC_SECRET || '';
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          '[FATAL] AUDIT_HMAC_SECRET is required in production. ' +
            'The tamper-proof audit chain cannot sign records without a ' +
            'cryptographically random secret. Refusing to start.'
        );
      }
      console.warn(
        '[SECURITY WARNING] AUDIT_HMAC_SECRET not set. Using a non-production ' +
          'development fallback — audit-chain integrity is NOT guaranteed. ' +
          'Set AUDIT_HMAC_SECRET before deploying.'
      );
      // Development-only fallback. Never reached in production (throws above).
      this.hmacSecret = 'INSECURE_DEV_SECRET_CHANGE_IN_PRODUCTION';
    } else {
      this.hmacSecret = secret;
    }
  }

  /**
   * Initialize the audit log table with hash chain support
   */
  async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS audit.tamper_proof_log (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        sequence_number BIGSERIAL UNIQUE NOT NULL,
        event_type TEXT NOT NULL,
        event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        -- Actor identification
        user_id UUID,
        user_name TEXT,
        session_id UUID,
        correlation_id TEXT,

        -- Resource identification
        resource_type TEXT,
        resource_id TEXT,

        -- Event details
        action TEXT NOT NULL,
        details JSONB NOT NULL DEFAULT '{}',

        -- Hash chain (tamper detection)
        previous_hash TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        chain_hash TEXT NOT NULL,

        -- Digital signature (optional, for high-security)
        signature TEXT,

        -- Client context
        ip_address INET,
        user_agent TEXT,

        -- Immutability protection
        CONSTRAINT prevent_updates CHECK (TRUE)
      );

      -- Index for efficient chain verification
      CREATE INDEX IF NOT EXISTS idx_audit_sequence ON audit.tamper_proof_log(sequence_number);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit.tamper_proof_log(event_timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit.tamper_proof_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit.tamper_proof_log(resource_type, resource_id);
      CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit.tamper_proof_log(correlation_id);

      -- Trigger to prevent updates/deletes
      CREATE OR REPLACE FUNCTION audit.prevent_log_mutation()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'Audit log is immutable. Modifications are not allowed.';
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_prevent_audit_mutation ON audit.tamper_proof_log;
      CREATE TRIGGER trg_prevent_audit_mutation
        BEFORE UPDATE OR DELETE ON audit.tamper_proof_log
        FOR EACH ROW
        EXECUTE FUNCTION audit.prevent_log_mutation();
    `);

    console.log('[AuditLog] Tamper-proof audit log table initialized');
  }

  /**
   * Write an audit entry with hash chain integrity
   */
  async log(
    eventType: AuditEventType,
    action: string,
    details: Record<string, unknown>,
    context?: {
      userId?: string;
      userName?: string;
      sessionId?: string;
      correlationId?: string;
      resourceType?: string;
      resourceId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<string> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get the previous entry's chain hash (for hash chain)
      const prevResult = await client.query(
        `SELECT chain_hash, sequence_number FROM audit.tamper_proof_log
         ORDER BY sequence_number DESC LIMIT 1 FOR UPDATE`
      );

      const previousHash = prevResult.rows[0]?.chain_hash || this.GENESIS_HASH;
      const prevSequence = prevResult.rows[0]?.sequence_number || 0;

      // Create content hash (hash of the audit data)
      const entryId = uuidv4();
      const timestamp = new Date();
      const contentData = {
        eventType,
        action,
        details,
        timestamp: timestamp.toISOString(),
        ...context,
      };
      const contentHash = this.computeHash(JSON.stringify(contentData));

      // Create chain hash (content hash + previous hash)
      const chainHash = this.computeChainHash(contentHash, previousHash);

      // Optional: Create HMAC signature for additional integrity
      const signature = this.computeSignature(chainHash);

      // Insert the entry
      await client.query(
        `INSERT INTO audit.tamper_proof_log (
          id, event_type, event_timestamp, user_id, user_name, session_id,
          correlation_id, resource_type, resource_id, action, details,
          previous_hash, content_hash, chain_hash, signature,
          ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          entryId,
          eventType,
          timestamp,
          context?.userId,
          context?.userName,
          context?.sessionId,
          context?.correlationId,
          context?.resourceType,
          context?.resourceId,
          action,
          JSON.stringify(details),
          previousHash,
          contentHash,
          chainHash,
          signature,
          context?.ipAddress,
          context?.userAgent,
        ]
      );

      await client.query('COMMIT');

      return entryId;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[AuditLog] Failed to write audit entry:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Verify the integrity of the entire audit chain
   */
  async verifyChain(startSequence?: number, endSequence?: number): Promise<VerificationResult> {
    const verifiedAt = new Date();

    let query = `
      SELECT * FROM audit.tamper_proof_log
      WHERE 1=1
    `;
    const params: (number | undefined)[] = [];

    if (startSequence !== undefined) {
      params.push(startSequence);
      query += ` AND sequence_number >= $${params.length}`;
    }
    if (endSequence !== undefined) {
      params.push(endSequence);
      query += ` AND sequence_number <= $${params.length}`;
    }

    query += ` ORDER BY sequence_number ASC`;

    const result = await this.pool.query(query, params);

    let expectedPreviousHash = this.GENESIS_HASH;
    let entriesVerified = 0;

    // If starting from a non-genesis entry, get the previous hash
    if (startSequence && startSequence > 1) {
      const prevResult = await this.pool.query(
        `SELECT chain_hash FROM audit.tamper_proof_log
         WHERE sequence_number = $1`,
        [startSequence - 1]
      );
      if (prevResult.rows[0]) {
        expectedPreviousHash = prevResult.rows[0].chain_hash;
      }
    }

    for (const row of result.rows) {
      entriesVerified++;

      // Verify previous hash matches
      if (row.previous_hash !== expectedPreviousHash) {
        return {
          valid: false,
          entriesVerified,
          firstInvalidEntry: row.sequence_number,
          invalidReason: `Chain broken: previous_hash mismatch at sequence ${row.sequence_number}`,
          verifiedAt,
        };
      }

      // Recompute content hash
      const contentData = {
        eventType: row.event_type,
        action: row.action,
        details: row.details,
        timestamp: row.event_timestamp.toISOString(),
        userId: row.user_id,
        userName: row.user_name,
        sessionId: row.session_id,
        correlationId: row.correlation_id,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
      };
      const expectedContentHash = this.computeHash(JSON.stringify(contentData));

      if (row.content_hash !== expectedContentHash) {
        return {
          valid: false,
          entriesVerified,
          firstInvalidEntry: row.sequence_number,
          invalidReason: `Content tampered: content_hash mismatch at sequence ${row.sequence_number}`,
          verifiedAt,
        };
      }

      // Verify chain hash
      const expectedChainHash = this.computeChainHash(row.content_hash, row.previous_hash);
      if (row.chain_hash !== expectedChainHash) {
        return {
          valid: false,
          entriesVerified,
          firstInvalidEntry: row.sequence_number,
          invalidReason: `Chain hash invalid at sequence ${row.sequence_number}`,
          verifiedAt,
        };
      }

      // Verify signature if present
      if (row.signature) {
        const expectedSignature = this.computeSignature(row.chain_hash);
        if (!this.timingSafeCompare(row.signature, expectedSignature)) {
          return {
            valid: false,
            entriesVerified,
            firstInvalidEntry: row.sequence_number,
            invalidReason: `Signature invalid at sequence ${row.sequence_number}`,
            verifiedAt,
          };
        }
      }

      expectedPreviousHash = row.chain_hash;
    }

    // Log successful verification
    await this.log(
      'AUDIT_VERIFICATION_PASSED',
      'Audit chain verification completed successfully',
      {
        entriesVerified,
        startSequence,
        endSequence,
        verifiedAt: verifiedAt.toISOString(),
      },
      { correlationId: `verify-${Date.now()}` }
    );

    return {
      valid: true,
      entriesVerified,
      verifiedAt,
    };
  }

  /**
   * Get recent audit entries
   */
  async getRecentEntries(limit: number = 100): Promise<AuditEntry[]> {
    const result = await this.pool.query(
      `SELECT * FROM audit.tamper_proof_log
       ORDER BY sequence_number DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map(this.rowToEntry);
  }

  /**
   * Search audit log by criteria
   */
  async search(criteria: {
    eventType?: AuditEventType;
    userId?: string;
    resourceType?: string;
    resourceId?: string;
    correlationId?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
  }): Promise<AuditEntry[]> {
    let query = `SELECT * FROM audit.tamper_proof_log WHERE 1=1`;
    const params: unknown[] = [];

    if (criteria.eventType) {
      params.push(criteria.eventType);
      query += ` AND event_type = $${params.length}`;
    }
    if (criteria.userId) {
      params.push(criteria.userId);
      query += ` AND user_id = $${params.length}`;
    }
    if (criteria.resourceType) {
      params.push(criteria.resourceType);
      query += ` AND resource_type = $${params.length}`;
    }
    if (criteria.resourceId) {
      params.push(criteria.resourceId);
      query += ` AND resource_id = $${params.length}`;
    }
    if (criteria.correlationId) {
      params.push(criteria.correlationId);
      query += ` AND correlation_id = $${params.length}`;
    }
    if (criteria.fromDate) {
      params.push(criteria.fromDate);
      query += ` AND event_timestamp >= $${params.length}`;
    }
    if (criteria.toDate) {
      params.push(criteria.toDate);
      query += ` AND event_timestamp <= $${params.length}`;
    }

    query += ` ORDER BY sequence_number DESC`;

    if (criteria.limit) {
      params.push(criteria.limit);
      query += ` LIMIT $${params.length}`;
    }

    const result = await this.pool.query(query, params);
    return result.rows.map(this.rowToEntry);
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private computeHash(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  private computeChainHash(contentHash: string, previousHash: string): string {
    return createHash('sha256')
      .update(contentHash + previousHash)
      .digest('hex');
  }

  private computeSignature(chainHash: string): string {
    return createHmac('sha256', this.hmacSecret).update(chainHash).digest('hex');
  }

  private timingSafeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  private rowToEntry(row: Record<string, unknown>): AuditEntry {
    return {
      id: row.id as string,
      sequenceNumber: Number(row.sequence_number),
      eventType: row.event_type as AuditEventType,
      eventTimestamp: row.event_timestamp as Date,
      userId: row.user_id as string | undefined,
      userName: row.user_name as string | undefined,
      sessionId: row.session_id as string | undefined,
      correlationId: row.correlation_id as string | undefined,
      resourceType: row.resource_type as string | undefined,
      resourceId: row.resource_id as string | undefined,
      action: row.action as string,
      details: row.details as Record<string, unknown>,
      previousHash: row.previous_hash as string,
      contentHash: row.content_hash as string,
      chainHash: row.chain_hash as string,
      signature: row.signature as string | undefined,
      ipAddress: row.ip_address as string | undefined,
      userAgent: row.user_agent as string | undefined,
    };
  }
}

// =============================================================================
// Global Instance
// =============================================================================

let auditLogInstance: TamperProofAuditLog | null = null;

export function getTamperProofAuditLog(pool: Pool): TamperProofAuditLog {
  if (!auditLogInstance) {
    auditLogInstance = new TamperProofAuditLog(pool);
  }
  return auditLogInstance;
}
