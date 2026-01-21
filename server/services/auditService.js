import { pool } from '../lib/db.js';

class AuditService {
  constructor() {
    this.pool = pool;
    this.initializeTables();
  }

  async initializeTables() {
    try {
      // Create audit_logs table if it doesn't exist
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER NOT NULL,
          user_id INTEGER,
          action VARCHAR(255) NOT NULL,
          resource_type VARCHAR(100) NOT NULL,
          resource_id VARCHAR(255),
          details JSONB,
          ip_address INET,
          user_agent TEXT,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          session_id VARCHAR(255),
          severity VARCHAR(20) DEFAULT 'info'
        );
      `);

      // Ensure required columns exist on legacy tables before creating indexes
      await this.pool.query(`
        ALTER TABLE audit_logs
          ADD COLUMN IF NOT EXISTS tenant_id INTEGER,
          ADD COLUMN IF NOT EXISTS user_id INTEGER,
          ADD COLUMN IF NOT EXISTS action VARCHAR(255),
          ADD COLUMN IF NOT EXISTS resource_type VARCHAR(100),
          ADD COLUMN IF NOT EXISTS resource_id VARCHAR(255),
          ADD COLUMN IF NOT EXISTS details JSONB,
          ADD COLUMN IF NOT EXISTS ip_address INET,
          ADD COLUMN IF NOT EXISTS user_agent TEXT,
          ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          ADD COLUMN IF NOT EXISTS session_id VARCHAR(255),
          ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'info';
      `);
      await this.pool.query(`
        UPDATE audit_logs
        SET tenant_id = 1
        WHERE tenant_id IS NULL;
      `);
      await this.pool.query(`
        ALTER TABLE audit_logs
        ALTER COLUMN tenant_id SET NOT NULL;
      `);

      // Create indexes for performance
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_audit_tenant_timestamp ON audit_logs(tenant_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
        CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id);
      `);

      console.log('✅ Audit logging tables initialized');
    } catch (error) {
      console.error('❌ Failed to initialize audit tables:', error);
    }
  }

  async logAction({
    tenantId,
    userId,
    action,
    resourceType,
    resourceId = null,
    details = {},
    ipAddress = null,
    userAgent = null,
    sessionId = null,
    severity = 'info',
  }) {
    try {
      const result = await this.pool.query(
        `
        INSERT INTO audit_logs (
          tenant_id, user_id, action, resource_type, resource_id, 
          details, ip_address, user_agent, session_id, severity
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, timestamp
      `,
        [
          tenantId,
          userId,
          action,
          resourceType,
          resourceId,
          JSON.stringify(details),
          ipAddress,
          userAgent,
          sessionId,
          severity,
        ]
      );

      return result.rows[0];
    } catch (error) {
      console.error('Audit logging failed:', error);
      // Don't throw - audit failures shouldn't break the application
      return null;
    }
  }

  async getAuditTrail(tenantId, filters = {}) {
    try {
      let query = `
        SELECT id, user_id, action, resource_type, resource_id, details,
               ip_address, timestamp, severity
        FROM audit_logs 
        WHERE tenant_id = $1
      `;
      const params = [tenantId];
      let paramCount = 1;

      // Add filters
      if (filters.userId) {
        query += ` AND user_id = $${++paramCount}`;
        params.push(filters.userId);
      }

      if (filters.action) {
        query += ` AND action = $${++paramCount}`;
        params.push(filters.action);
      }

      if (filters.resourceType) {
        query += ` AND resource_type = $${++paramCount}`;
        params.push(filters.resourceType);
      }

      if (filters.startDate) {
        query += ` AND timestamp >= $${++paramCount}`;
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        query += ` AND timestamp <= $${++paramCount}`;
        params.push(filters.endDate);
      }

      query += ` ORDER BY timestamp DESC LIMIT ${filters.limit || 100}`;

      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Failed to retrieve audit trail:', error);
      throw error;
    }
  }

  async getAuditStats(tenantId, timeframe = '24 hours') {
    try {
      const result = await this.pool.query(
        `
        SELECT 
          action,
          COUNT(*) as count,
          MAX(timestamp) as last_occurrence
        FROM audit_logs 
        WHERE tenant_id = $1 
          AND timestamp >= NOW() - INTERVAL '${timeframe}'
        GROUP BY action
        ORDER BY count DESC
      `,
        [tenantId]
      );

      return result.rows;
    } catch (error) {
      console.error('Failed to get audit stats:', error);
      throw error;
    }
  }

  // Predefined audit actions for consistency
  static ACTIONS = {
    // Document actions
    DOCUMENT_CREATED: 'document.created',
    DOCUMENT_UPDATED: 'document.updated',
    DOCUMENT_DELETED: 'document.deleted',
    DOCUMENT_VIEWED: 'document.viewed',
    DOCUMENT_EXPORTED: 'document.exported',
    DOCUMENT_SHARED: 'document.shared',

    // User actions
    USER_LOGIN: 'user.login',
    USER_LOGOUT: 'user.logout',
    USER_CREATED: 'user.created',
    USER_UPDATED: 'user.updated',
    USER_DELETED: 'user.deleted',

    // Regulatory actions
    REGULATORY_ANALYSIS: 'regulatory.analysis',
    COMPLIANCE_CHECK: 'compliance.check',
    SUGGESTION_ACCEPTED: 'suggestion.accepted',
    SUGGESTION_REJECTED: 'suggestion.rejected',

    // System actions
    SYSTEM_BACKUP: 'system.backup',
    SYSTEM_RESTORE: 'system.restore',
    DATA_EXPORT: 'data.export',
    DATA_IMPORT: 'data.import',
  };

  static RESOURCE_TYPES = {
    DOCUMENT: 'document',
    USER: 'user',
    PROJECT: 'project',
    ORGANIZATION: 'organization',
    TEMPLATE: 'template',
    ANALYSIS: 'analysis',
    SYSTEM: 'system',
  };

  static SEVERITY = {
    LOW: 'low',
    INFO: 'info',
    WARN: 'warn',
    HIGH: 'high',
    CRITICAL: 'critical',
  };
}

export default new AuditService();
