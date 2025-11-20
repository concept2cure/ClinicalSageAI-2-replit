/**
 * eCTD Audit Service
 * 
 * Provides 21 CFR Part 11 compliant audit trail logging for eCTD/CCMS operations.
 * Tracks component modifications, priority updates, cross-sequence references, 
 * and all regulatory-critical operations with full traceability.
 */

import { Pool } from 'pg';

class ECTDAuditService {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }

  /**
   * Creates an audit trail entry for eCTD/CCMS operations
   * Satisfies 21 CFR Part 11 requirements for electronic records
   * 
   * @param {Object} auditData - Audit trail data
   * @param {number} auditData.documentId - Related document ID (optional)
   * @param {string} auditData.nodeId - eCTD node identifier (optional)
   * @param {string} auditData.action - Action performed (e.g., 'PRIORITY_UPDATE', 'CROSS_REFERENCE_ADDED')
   * @param {string} auditData.performedBy - User who performed the action
   * @param {string} auditData.ipAddress - IP address of the user
   * @param {string} auditData.userAgent - User agent string
   * @param {Object} auditData.details - Detailed information about the change
   * @returns {Promise<Object>} Created audit record
   */
  async createAuditEntry({
    documentId = null,
    nodeId = null,
    action,
    performedBy,
    ipAddress = null,
    userAgent = null,
    details = {},
    organizationId = null
  }) {
    try {
      const result = await this.pool.query(
        `
        INSERT INTO ectd_audit_trail (
          document_id, 
          node_id, 
          action, 
          performed_by,
          ip_address,
          user_agent,
          details,
          performed_at,
          organization_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
        RETURNING *
        `,
        [
          documentId,
          nodeId,
          action,
          performedBy,
          ipAddress,
          userAgent,
          JSON.stringify(details),
          organizationId || details.organizationId
        ]
      );

      return result.rows[0];
    } catch (error) {
      console.error('Failed to create eCTD audit entry:', error);
      // Don't throw - audit failures shouldn't break the application
      // but log the failure for compliance monitoring
      return null;
    }
  }

  /**
   * Log component priority number update
   * Tracks changes to priority numbers which affect document display order
   */
  async logPriorityUpdate(componentId, udi, oldPriority, newPriority, userId, req) {
    return this.createAuditEntry({
      nodeId: udi,
      action: 'COMPONENT_PRIORITY_UPDATE',
      performedBy: userId || 'system',
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.headers?.['user-agent'],
      details: {
        componentId,
        udi,
        previousPriority: oldPriority,
        newPriority: newPriority,
        displayOrder: newPriority,
        organizationId: req?.headers?.['x-organization-id'],
        timestamp: new Date().toISOString(),
        changeType: '21CFR11_PRIORITY_MODIFICATION'
      }
    });
  }

  /**
   * Log bulk component reordering
   * Tracks mass priority updates from drag-and-drop operations
   */
  async logBulkReorder(componentOrders, userId, req) {
    return this.createAuditEntry({
      action: 'COMPONENT_BULK_REORDER',
      performedBy: userId || 'system',
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.headers?.['user-agent'],
      details: {
        componentsAffected: componentOrders.length,
        reorderData: componentOrders.map(item => ({
          componentId: item.componentId,
          newOrder: item.displayOrder,
          newPriority: item.priorityNumber
        })),
        organizationId: req?.headers?.['x-organization-id'],
        timestamp: new Date().toISOString(),
        changeType: '21CFR11_BULK_PRIORITY_MODIFICATION'
      }
    });
  }

  /**
   * Log cross-sequence reference creation
   * Critical for tracking component reuse across submission sequences
   */
  async logCrossSequenceReference(componentId, udi, sequenceNumber, referenceData, userId, req) {
    return this.createAuditEntry({
      nodeId: udi,
      action: 'CROSS_SEQUENCE_REFERENCE_ADDED',
      performedBy: userId || 'system',
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.headers?.['user-agent'],
      details: {
        componentId,
        udi,
        sequenceNumber,
        submissionId: referenceData.submissionId,
        applicationNumber: referenceData.applicationNumber,
        documentTitle: referenceData.documentTitle,
        moduleContext: referenceData.moduleContext,
        sectionNumber: referenceData.sectionNumber,
        ectdOperation: referenceData.ectdOperation || 'new',
        replacedUdi: referenceData.replacedUdi,
        reusedFromSequence: referenceData.reusedFromSequence,
        firstUseInSequence: referenceData.firstUseInSequence,
        organizationId: req?.headers?.['x-organization-id'],
        timestamp: new Date().toISOString(),
        changeType: '21CFR11_CROSS_REFERENCE_TRACKING'
      }
    });
  }

  /**
   * Log component lifecycle management state changes
   * Tracks new/replace/delete operations for regulatory compliance
   */
  async logLifecycleStateChange(componentId, udi, oldState, newState, userId, req) {
    return this.createAuditEntry({
      nodeId: udi,
      action: 'COMPONENT_LIFECYCLE_STATE_CHANGE',
      performedBy: userId || 'system',
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.headers?.['user-agent'],
      details: {
        componentId,
        udi,
        previousState: oldState,
        newState: newState,
        lifecycleOperation: newState,
        organizationId: req?.headers?.['x-organization-id'],
        timestamp: new Date().toISOString(),
        changeType: '21CFR11_LIFECYCLE_MANAGEMENT'
      }
    });
  }

  /**
   * Log Context of Use (COU) changes
   * Tracks regulatory context modifications for components
   */
  async logContextOfUseChange(componentId, udi, oldContext, newContext, userId, req) {
    return this.createAuditEntry({
      nodeId: udi,
      action: 'COMPONENT_CONTEXT_OF_USE_CHANGE',
      performedBy: userId || 'system',
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.headers?.['user-agent'],
      details: {
        componentId,
        udi,
        previousContext: oldContext,
        newContext: newContext,
        regulatoryPurpose: newContext,
        organizationId: req?.headers?.['x-organization-id'],
        timestamp: new Date().toISOString(),
        changeType: '21CFR11_CONTEXT_MODIFICATION'
      }
    });
  }

  /**
   * Retrieve audit trail for specific component
   * Returns complete history for 21 CFR Part 11 compliance review
   */
  async getComponentAuditTrail(udi, limit = 100) {
    try {
      const result = await this.pool.query(
        `
        SELECT * FROM ectd_audit_trail
        WHERE node_id = $1
          OR details->>'udi' = $1
        ORDER BY performed_at DESC
        LIMIT $2
        `,
        [udi, limit]
      );

      return result.rows;
    } catch (error) {
      console.error('Failed to retrieve component audit trail:', error);
      throw error;
    }
  }

  /**
   * Get audit trail statistics for compliance reporting
   */
  async getAuditStatistics(organizationId, startDate, endDate) {
    try {
      const result = await this.pool.query(
        `
        SELECT 
          action,
          COUNT(*) as count,
          COUNT(DISTINCT performed_by) as unique_users,
          MIN(performed_at) as first_occurrence,
          MAX(performed_at) as last_occurrence
        FROM ectd_audit_trail
        WHERE details->>'organizationId' = $1
          AND performed_at BETWEEN $2 AND $3
        GROUP BY action
        ORDER BY count DESC
        `,
        [organizationId.toString(), startDate, endDate]
      );

      return result.rows;
    } catch (error) {
      console.error('Failed to get audit statistics:', error);
      throw error;
    }
  }

  // Action type constants for consistency
  static ACTIONS = {
    // Component operations
    COMPONENT_CREATED: 'COMPONENT_CREATED',
    COMPONENT_UPDATED: 'COMPONENT_UPDATED',
    COMPONENT_DELETED: 'COMPONENT_DELETED',
    COMPONENT_VERSION_CREATED: 'COMPONENT_VERSION_CREATED',
    
    // Priority and ordering
    COMPONENT_PRIORITY_UPDATE: 'COMPONENT_PRIORITY_UPDATE',
    COMPONENT_BULK_REORDER: 'COMPONENT_BULK_REORDER',
    
    // Cross-sequence references
    CROSS_SEQUENCE_REFERENCE_ADDED: 'CROSS_SEQUENCE_REFERENCE_ADDED',
    CROSS_SEQUENCE_REFERENCE_REMOVED: 'CROSS_SEQUENCE_REFERENCE_REMOVED',
    
    // Lifecycle management
    COMPONENT_LIFECYCLE_STATE_CHANGE: 'COMPONENT_LIFECYCLE_STATE_CHANGE',
    COMPONENT_REPLACED: 'COMPONENT_REPLACED',
    
    // Context and metadata
    COMPONENT_CONTEXT_OF_USE_CHANGE: 'COMPONENT_CONTEXT_OF_USE_CHANGE',
    COMPONENT_METADATA_UPDATE: 'COMPONENT_METADATA_UPDATE',
    
    // Document operations
    COMPONENT_EXPORTED: 'COMPONENT_EXPORTED',
    COMPONENT_IMPORTED: 'COMPONENT_IMPORTED',
    
    // Validation and compliance
    COMPONENT_VALIDATED: 'COMPONENT_VALIDATED',
    COMPONENT_COMPLIANCE_CHECK: 'COMPONENT_COMPLIANCE_CHECK'
  };
}

// Create singleton instance
const ectdAuditService = new ECTDAuditService();

export default ectdAuditService;
export { ECTDAuditService };