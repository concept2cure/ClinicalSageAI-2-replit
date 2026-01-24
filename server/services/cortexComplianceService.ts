/**
 * Cortex Prime Compliance Service
 * 
 * 21 CFR Part 11 compliant wrapper for Cortex Prime operations.
 * Provides audit trail, electronic signatures, and access controls.
 * 
 * @module server/services/cortexComplianceService
 * 
 * ⚠️ DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE
 */

import { Pool, PoolClient } from 'pg';
import { getPool } from '../db/pool';
import crypto from 'crypto';

// ============================================================================
// COMPLIANCE TYPES
// ============================================================================

export interface AuditContext {
  userId: string;
  userName: string;
  userRole: string;
  orgId: string;
  sessionId: string;
  ipAddress: string;
  userAgent?: string;
}

export interface AuditEntry {
  id: string;
  orgId: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  recordType: string;
  recordId: string;
  previousState?: Record<string, any>;
  newState?: Record<string, any>;
  fieldChanges?: Record<string, any>[];
  reason?: string;
  ipAddress: string;
  userAgent?: string;
  sessionId: string;
  gxpRelevant: boolean;
  regulatoryImpact?: string;
  recordHash: string;
  chainHash: string;
  createdAt: Date;
}

export interface ElectronicSignature {
  id: string;
  orgId: string;
  signerId: string;
  signerName: string;
  signerTitle: string;
  signatureDateTime: Date;
  signatureMeaning: string;
  recordType: string;
  recordId: string;
  recordHash: string;
  authenticationMethod: string;
  isValid: boolean;
  validatedAt?: Date;
  createdAt: Date;
}

export interface AccessControlDecision {
  allowed: boolean;
  reason?: string;
  requiredRole?: string;
  requiredPermission?: string;
  auditEntryId?: string;
}

export interface DataIntegrityCheck {
  id: string;
  tableName: string;
  recordId: string;
  expectedHash: string;
  actualHash: string;
  isValid: boolean;
  discrepancies?: Record<string, any>[];
  checkedAt: Date;
}

// Signature meanings per 21 CFR 11.50
export enum SignatureMeaning {
  AUTHORSHIP = 'AUTHORSHIP',           // Created the record
  APPROVAL = 'APPROVAL',               // Approved the record
  REVIEW = 'REVIEW',                   // Reviewed the record
  VERIFICATION = 'VERIFICATION',        // Verified accuracy
  RESPONSIBILITY = 'RESPONSIBILITY',    // Taking responsibility
  WITNESSED = 'WITNESSED',             // Witnessed by
  REJECTION = 'REJECTION',             // Rejected the record
  MODIFICATION = 'MODIFICATION'        // Modified the record
}

// GxP relevant actions requiring audit
export enum GxPAction {
  CREATE = 'CREATE',
  READ = 'READ',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  SUBMIT = 'SUBMIT',
  SIGN = 'SIGN',
  EXPORT = 'EXPORT',
  ARCHIVE = 'ARCHIVE',
  RESTORE = 'RESTORE',
  AI_PREDICTION = 'AI_PREDICTION',
  AI_RECOMMENDATION = 'AI_RECOMMENDATION'
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class CortexComplianceService {
  private pool: Pool;
  private readonly GXP_RELEVANT_TABLES = [
    'cortex_prime.unified_brain',
    'cortex_prime.brain_connections',
    'cortex_prime.regulatory_intuition',
    'cortex_prime.epistemic_intelligence',
    'cortex_prime.causal_inference',
    'cortex_prime.self_evolution',
    'cortex_prime.cross_domain_transfer'
  ];

  constructor(pool?: Pool) {
    this.pool = pool || getPool();
  }

  // ============================================================================
  // AUDIT TRAIL OPERATIONS
  // ============================================================================

  /**
   * Write an immutable audit entry for any operation
   * Implements 21 CFR 11.10(e) - Secure, computer-generated audit trails
   */
  async writeAuditEntry(
    context: AuditContext,
    action: GxPAction | string,
    recordType: string,
    recordId: string,
    options: {
      previousState?: Record<string, any>;
      newState?: Record<string, any>;
      reason?: string;
      regulatoryImpact?: string;
      fieldChanges?: Record<string, any>[];
    } = {}
  ): Promise<AuditEntry> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const isGxpRelevant = this.isGxPRelevant(recordType, action);
      
      const result = await client.query(
        `SELECT * FROM compliance.write_audit_entry(
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13, $14
        )`,
        [
          context.orgId,
          context.userId,
          context.userName,
          context.userRole,
          action,
          recordType,
          recordId,
          options.previousState ? JSON.stringify(options.previousState) : null,
          options.newState ? JSON.stringify(options.newState) : null,
          options.fieldChanges ? JSON.stringify(options.fieldChanges) : null,
          options.reason || null,
          context.ipAddress,
          context.userAgent || null,
          context.sessionId
        ]
      );

      await client.query('COMMIT');
      
      return this.mapAuditEntry(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieve audit trail for a specific record
   * Used for FDA inspection and compliance review
   */
  async getRecordAuditTrail(
    recordType: string,
    recordId: string,
    context: AuditContext
  ): Promise<AuditEntry[]> {
    // Log the audit trail access (audit the audit)
    await this.writeAuditEntry(
      context,
      'READ',
      'audit_trail',
      recordId,
      { reason: 'Audit trail review' }
    );

    const result = await this.pool.query(
      `SELECT * FROM compliance.audit_trail
       WHERE record_type = $1 AND record_id = $2
       ORDER BY created_at DESC`,
      [recordType, recordId]
    );

    return result.rows.map(row => this.mapAuditEntry(row));
  }

  /**
   * Get full audit trail for organization
   */
  async getOrganizationAuditTrail(
    orgId: string,
    context: AuditContext,
    options: {
      startDate?: Date;
      endDate?: Date;
      actions?: string[];
      userId?: string;
      limit?: number;
    } = {}
  ): Promise<AuditEntry[]> {
    let query = `
      SELECT * FROM compliance.audit_trail
      WHERE org_id = $1
    `;
    const params: any[] = [orgId];
    let paramIdx = 2;

    if (options.startDate) {
      query += ` AND created_at >= $${paramIdx++}`;
      params.push(options.startDate);
    }
    if (options.endDate) {
      query += ` AND created_at <= $${paramIdx++}`;
      params.push(options.endDate);
    }
    if (options.actions && options.actions.length > 0) {
      query += ` AND action = ANY($${paramIdx++})`;
      params.push(options.actions);
    }
    if (options.userId) {
      query += ` AND user_id = $${paramIdx++}`;
      params.push(options.userId);
    }

    query += ` ORDER BY created_at DESC`;
    
    if (options.limit) {
      query += ` LIMIT $${paramIdx++}`;
      params.push(options.limit);
    }

    const result = await this.pool.query(query, params);
    return result.rows.map(row => this.mapAuditEntry(row));
  }

  /**
   * Export audit trail for FDA inspection
   * Implements 21 CFR 11.10(b) - Ability to generate accurate and complete copies
   */
  async exportAuditTrail(
    orgId: string,
    context: AuditContext,
    options: {
      startDate?: Date;
      endDate?: Date;
      format?: 'json' | 'csv' | 'xml';
      includeVerification?: boolean;
    } = {}
  ): Promise<{
    data: string;
    format: string;
    recordCount: number;
    exportDate: Date;
    exportedBy: string;
    verificationHash?: string;
  }> {
    // Get the audit trail
    const entries = await this.getOrganizationAuditTrail(orgId, context, options);

    // Log the export
    await this.writeAuditEntry(
      context,
      'EXPORT',
      'audit_trail_export',
      crypto.randomUUID(),
      {
        reason: 'Audit trail export for compliance review',
        newState: {
          recordCount: entries.length,
          dateRange: {
            start: options.startDate,
            end: options.endDate
          }
        }
      }
    );

    let data: string;
    const format = options.format || 'json';

    switch (format) {
      case 'csv':
        data = this.convertToCsv(entries);
        break;
      case 'xml':
        data = this.convertToXml(entries);
        break;
      default:
        data = JSON.stringify(entries, null, 2);
    }

    const result: any = {
      data,
      format,
      recordCount: entries.length,
      exportDate: new Date(),
      exportedBy: context.userName
    };

    if (options.includeVerification) {
      result.verificationHash = this.generateHash(data);
    }

    return result;
  }

  // ============================================================================
  // ELECTRONIC SIGNATURE OPERATIONS
  // ============================================================================

  /**
   * Create an electronic signature
   * Implements 21 CFR 11.50, 11.70, 11.100
   */
  async createElectronicSignature(
    context: AuditContext,
    recordType: string,
    recordId: string,
    signatureMeaning: SignatureMeaning,
    authenticationMethod: string,
    signerTitle?: string
  ): Promise<ElectronicSignature> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get the record to calculate hash
      const recordResult = await client.query(
        `SELECT * FROM ${this.escapeTableName(recordType)} WHERE id = $1`,
        [recordId]
      );

      if (recordResult.rows.length === 0) {
        throw new Error(`Record not found: ${recordType}/${recordId}`);
      }

      const recordHash = this.generateHash(JSON.stringify(recordResult.rows[0]));

      // Create signature
      const result = await client.query(
        `SELECT * FROM compliance.create_electronic_signature(
          $1, $2, $3, $4, $5, $6, $7, $8
        )`,
        [
          context.userId,
          context.userName,
          signerTitle || context.userRole,
          signatureMeaning,
          recordType,
          recordId,
          recordHash,
          authenticationMethod
        ]
      );

      // Write audit entry for signature
      await this.writeAuditEntry(
        context,
        'SIGN',
        recordType,
        recordId,
        {
          reason: `Electronic signature applied: ${signatureMeaning}`,
          newState: {
            signatureId: result.rows[0].id,
            signatureMeaning,
            recordHash
          }
        }
      );

      await client.query('COMMIT');
      return this.mapSignature(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Verify an electronic signature
   */
  async verifySignature(
    signatureId: string,
    context: AuditContext
  ): Promise<{
    isValid: boolean;
    signature: ElectronicSignature;
    recordIntact: boolean;
    validationDetails: Record<string, any>;
  }> {
    const sigResult = await this.pool.query(
      `SELECT * FROM compliance.electronic_signatures WHERE id = $1`,
      [signatureId]
    );

    if (sigResult.rows.length === 0) {
      throw new Error(`Signature not found: ${signatureId}`);
    }

    const signature = this.mapSignature(sigResult.rows[0]);

    // Get current record and compare hash
    const recordResult = await this.pool.query(
      `SELECT * FROM ${this.escapeTableName(signature.recordType)} WHERE id = $1`,
      [signature.recordId]
    );

    const currentHash = recordResult.rows.length > 0
      ? this.generateHash(JSON.stringify(recordResult.rows[0]))
      : null;

    const recordIntact = currentHash === signature.recordHash;

    // Log verification
    await this.writeAuditEntry(
      context,
      'VERIFICATION',
      'electronic_signature',
      signatureId,
      {
        reason: 'Signature verification',
        newState: {
          isValid: signature.isValid,
          recordIntact,
          verifiedBy: context.userName
        }
      }
    );

    return {
      isValid: signature.isValid && recordIntact,
      signature,
      recordIntact,
      validationDetails: {
        signatureValid: signature.isValid,
        recordHashMatch: recordIntact,
        originalHash: signature.recordHash,
        currentHash,
        signerVerified: true
      }
    };
  }

  /**
   * Get all signatures for a record
   */
  async getRecordSignatures(
    recordType: string,
    recordId: string
  ): Promise<ElectronicSignature[]> {
    const result = await this.pool.query(
      `SELECT * FROM compliance.electronic_signatures
       WHERE record_type = $1 AND record_id = $2
       ORDER BY signature_date_time DESC`,
      [recordType, recordId]
    );

    return result.rows.map(row => this.mapSignature(row));
  }

  // ============================================================================
  // ACCESS CONTROL OPERATIONS
  // ============================================================================

  /**
   * Check if user has access to perform action
   * Implements 21 CFR 11.10(d) - Limiting system access
   */
  async checkAccess(
    context: AuditContext,
    action: string,
    resourceType: string,
    resourceId?: string
  ): Promise<AccessControlDecision> {
    const result = await this.pool.query(
      `SELECT * FROM compliance.check_access(
        $1, $2, $3, $4
      )`,
      [context.userId, action, resourceType, resourceId || null]
    );

    const decision: AccessControlDecision = {
      allowed: result.rows[0]?.allowed || false,
      reason: result.rows[0]?.reason,
      requiredRole: result.rows[0]?.required_role,
      requiredPermission: result.rows[0]?.required_permission
    };

    // Log access check (especially denials)
    if (!decision.allowed) {
      await this.writeAuditEntry(
        context,
        'ACCESS_DENIED',
        resourceType,
        resourceId || 'N/A',
        {
          reason: decision.reason,
          newState: {
            requestedAction: action,
            denialReason: decision.reason
          }
        }
      );
    }

    return decision;
  }

  /**
   * Grant access control permission
   */
  async grantAccess(
    context: AuditContext,
    targetUserId: string,
    resourceType: string,
    permission: string,
    expiresAt?: Date
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO compliance.access_controls (
        org_id, user_id, resource_type, permission, granted_by, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [context.orgId, targetUserId, resourceType, permission, context.userId, expiresAt || null]
    );

    await this.writeAuditEntry(
      context,
      'GRANT_ACCESS',
      'access_control',
      targetUserId,
      {
        reason: 'Access granted',
        newState: {
          targetUser: targetUserId,
          resourceType,
          permission,
          expiresAt
        }
      }
    );
  }

  /**
   * Revoke access control permission
   */
  async revokeAccess(
    context: AuditContext,
    targetUserId: string,
    resourceType: string,
    permission: string
  ): Promise<void> {
    await this.pool.query(
      `UPDATE compliance.access_controls
       SET is_active = FALSE, revoked_at = NOW(), revoked_by = $5
       WHERE user_id = $1 AND resource_type = $2 AND permission = $3 AND org_id = $4`,
      [targetUserId, resourceType, permission, context.orgId, context.userId]
    );

    await this.writeAuditEntry(
      context,
      'REVOKE_ACCESS',
      'access_control',
      targetUserId,
      {
        reason: 'Access revoked',
        newState: {
          targetUser: targetUserId,
          resourceType,
          permission
        }
      }
    );
  }

  // ============================================================================
  // DATA INTEGRITY OPERATIONS
  // ============================================================================

  /**
   * Verify data integrity using hash chain
   * Implements 21 CFR 11.10(c) - Ensuring record integrity
   */
  async verifyAuditChainIntegrity(
    orgId: string,
    context: AuditContext,
    limitRows?: number
  ): Promise<{
    isValid: boolean;
    checkedRecords: number;
    firstInvalidRecord?: string;
    verificationTime: Date;
  }> {
    const result = await this.pool.query(
      `SELECT compliance.verify_audit_chain($1)`,
      [limitRows || 1000]
    );

    const isValid = result.rows[0]?.verify_audit_chain || false;

    // Log verification
    await this.writeAuditEntry(
      context,
      'INTEGRITY_CHECK',
      'audit_chain',
      orgId,
      {
        reason: 'Audit chain integrity verification',
        newState: {
          isValid,
          checkedRecords: limitRows || 1000
        }
      }
    );

    return {
      isValid,
      checkedRecords: limitRows || 1000,
      verificationTime: new Date()
    };
  }

  /**
   * Check integrity of a specific record
   */
  async verifyRecordIntegrity(
    tableName: string,
    recordId: string,
    context: AuditContext
  ): Promise<DataIntegrityCheck> {
    const client = await this.pool.connect();
    try {
      // Get the record
      const recordResult = await client.query(
        `SELECT * FROM ${this.escapeTableName(tableName)} WHERE id = $1`,
        [recordId]
      );

      if (recordResult.rows.length === 0) {
        throw new Error(`Record not found: ${tableName}/${recordId}`);
      }

      // Get stored hash from integrity checks table
      const storedHashResult = await client.query(
        `SELECT * FROM compliance.data_integrity_checks
         WHERE table_name = $1 AND record_id = $2
         ORDER BY checked_at DESC LIMIT 1`,
        [tableName, recordId]
      );

      const actualHash = this.generateHash(JSON.stringify(recordResult.rows[0]));
      const expectedHash = storedHashResult.rows[0]?.expected_hash || actualHash;
      const isValid = expectedHash === actualHash;

      // Store new integrity check
      const checkResult = await client.query(
        `INSERT INTO compliance.data_integrity_checks (
          org_id, table_name, record_id, expected_hash, actual_hash, is_valid
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [context.orgId, tableName, recordId, expectedHash, actualHash, isValid]
      );

      return {
        id: checkResult.rows[0].id,
        tableName,
        recordId,
        expectedHash,
        actualHash,
        isValid,
        discrepancies: isValid ? undefined : [{ type: 'hash_mismatch' }],
        checkedAt: new Date()
      };
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // COMPLIANT CRUD WRAPPERS
  // ============================================================================

  /**
   * Create record with full audit trail
   */
  async auditedCreate<T>(
    context: AuditContext,
    tableName: string,
    data: Record<string, any>,
    insertQuery: string,
    insertParams: any[]
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Execute insert
      const result = await client.query(insertQuery, insertParams);
      const record = result.rows[0];

      // Write audit entry
      await this.writeAuditEntry(
        context,
        GxPAction.CREATE,
        tableName,
        record.id,
        {
          newState: data,
          regulatoryImpact: this.assessRegulatoryImpact(tableName, GxPAction.CREATE)
        }
      );

      await client.query('COMMIT');
      return record as T;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update record with full audit trail
   */
  async auditedUpdate<T>(
    context: AuditContext,
    tableName: string,
    recordId: string,
    previousState: Record<string, any>,
    newData: Record<string, any>,
    updateQuery: string,
    updateParams: any[],
    reason?: string
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Calculate field changes
      const fieldChanges = this.calculateFieldChanges(previousState, newData);

      // Execute update
      const result = await client.query(updateQuery, updateParams);
      const record = result.rows[0];

      // Write audit entry
      await this.writeAuditEntry(
        context,
        GxPAction.UPDATE,
        tableName,
        recordId,
        {
          previousState,
          newState: newData,
          fieldChanges,
          reason,
          regulatoryImpact: this.assessRegulatoryImpact(tableName, GxPAction.UPDATE)
        }
      );

      await client.query('COMMIT');
      return record as T;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete record with full audit trail (soft delete)
   */
  async auditedDelete(
    context: AuditContext,
    tableName: string,
    recordId: string,
    previousState: Record<string, any>,
    reason: string
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Execute soft delete
      const result = await client.query(
        `UPDATE ${this.escapeTableName(tableName)}
         SET is_active = FALSE, updated_at = NOW()
         WHERE id = $1`,
        [recordId]
      );

      // Write audit entry
      await this.writeAuditEntry(
        context,
        GxPAction.DELETE,
        tableName,
        recordId,
        {
          previousState,
          reason,
          regulatoryImpact: this.assessRegulatoryImpact(tableName, GxPAction.DELETE)
        }
      );

      await client.query('COMMIT');
      return (result.rowCount || 0) > 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Audit AI prediction operations
   */
  async auditAIPrediction(
    context: AuditContext,
    predictionType: string,
    input: Record<string, any>,
    output: Record<string, any>,
    confidence: number,
    modelInfo: Record<string, any>
  ): Promise<AuditEntry> {
    return this.writeAuditEntry(
      context,
      GxPAction.AI_PREDICTION,
      `ai_${predictionType}`,
      crypto.randomUUID(),
      {
        newState: {
          predictionType,
          input,
          output,
          confidence,
          modelInfo,
          disclaimer: 'AI-generated prediction - requires human review',
          timestamp: new Date().toISOString()
        },
        regulatoryImpact: 'AI prediction - must be validated by qualified personnel'
      }
    );
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private isGxPRelevant(recordType: string, action: string): boolean {
    const gxpActions = ['CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'SUBMIT', 'SIGN'];
    return this.GXP_RELEVANT_TABLES.some(t => recordType.includes(t)) ||
           gxpActions.includes(action);
  }

  private assessRegulatoryImpact(tableName: string, action: string): string {
    if (tableName.includes('regulatory_intuition')) {
      return 'HIGH - Regulatory prediction system modification';
    }
    if (tableName.includes('unified_brain')) {
      return 'MEDIUM - Knowledge base modification';
    }
    if (action === 'DELETE') {
      return 'HIGH - Data deletion may affect audit trail';
    }
    return 'LOW - Standard operation';
  }

  private calculateFieldChanges(
    previous: Record<string, any>,
    current: Record<string, any>
  ): Record<string, any>[] {
    const changes: Record<string, any>[] = [];
    
    for (const key of new Set([...Object.keys(previous), ...Object.keys(current)])) {
      if (JSON.stringify(previous[key]) !== JSON.stringify(current[key])) {
        changes.push({
          field: key,
          previousValue: previous[key],
          newValue: current[key],
          changedAt: new Date().toISOString()
        });
      }
    }
    
    return changes;
  }

  private generateHash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private escapeTableName(tableName: string): string {
    // Only allow alphanumeric, underscores, and dots
    if (!/^[a-zA-Z0-9_.]+$/.test(tableName)) {
      throw new Error(`Invalid table name: ${tableName}`);
    }
    return tableName;
  }

  private convertToCsv(entries: AuditEntry[]): string {
    if (entries.length === 0) return '';
    
    const headers = Object.keys(entries[0]).join(',');
    const rows = entries.map(entry =>
      Object.values(entry).map(v => 
        typeof v === 'object' ? JSON.stringify(v) : String(v)
      ).join(',')
    );
    
    return [headers, ...rows].join('\n');
  }

  private convertToXml(entries: AuditEntry[]): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<auditTrail>\n';
    
    for (const entry of entries) {
      xml += '  <entry>\n';
      for (const [key, value] of Object.entries(entry)) {
        const escapedValue = typeof value === 'object'
          ? JSON.stringify(value)
          : String(value).replace(/[&<>"']/g, c => ({
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&apos;'
            }[c] || c));
        xml += `    <${key}>${escapedValue}</${key}>\n`;
      }
      xml += '  </entry>\n';
    }
    
    xml += '</auditTrail>';
    return xml;
  }

  private mapAuditEntry(row: any): AuditEntry {
    return {
      id: row.id,
      orgId: row.org_id,
      userId: row.user_id,
      userName: row.user_name,
      userRole: row.user_role,
      action: row.action,
      recordType: row.record_type,
      recordId: row.record_id,
      previousState: row.previous_state,
      newState: row.new_state,
      fieldChanges: row.field_changes,
      reason: row.reason,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      sessionId: row.session_id,
      gxpRelevant: row.gxp_relevant,
      regulatoryImpact: row.regulatory_impact,
      recordHash: row.record_hash,
      chainHash: row.chain_hash,
      createdAt: new Date(row.created_at)
    };
  }

  private mapSignature(row: any): ElectronicSignature {
    return {
      id: row.id,
      orgId: row.org_id,
      signerId: row.signer_id,
      signerName: row.signer_name,
      signerTitle: row.signer_title,
      signatureDateTime: new Date(row.signature_date_time),
      signatureMeaning: row.signature_meaning,
      recordType: row.record_type,
      recordId: row.record_id,
      recordHash: row.record_hash,
      authenticationMethod: row.authentication_method,
      isValid: row.is_valid,
      validatedAt: row.validated_at ? new Date(row.validated_at) : undefined,
      createdAt: new Date(row.created_at)
    };
  }
}

// Export singleton instance
let instance: CortexComplianceService | null = null;

export function getCortexComplianceService(): CortexComplianceService {
  if (!instance) {
    instance = new CortexComplianceService();
  }
  return instance;
}

export default CortexComplianceService;
