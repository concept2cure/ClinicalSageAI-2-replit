/**
 * Audit Service - Stub for deprecated auditService.js
 * Provides backward compatibility for services that import auditService
 */

interface AuditLogEntry {
  tenantId?: string | number;
  userId?: string | number;
  action: string;
  resourceType: string;
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
  SIGNATURE_APPLY: 'signature_apply'
};

const RESOURCE_TYPES = {
  ANALYSIS: 'analysis',
  DOCUMENT: 'document',
  USER: 'user',
  PROJECT: 'project',
  SUBMISSION: 'submission'
};

class AuditService {
  static ACTIONS = ACTIONS;
  static RESOURCE_TYPES = RESOURCE_TYPES;
  
  constructor() {
    // Stub constructor
  }
  
  async logAction(entry: AuditLogEntry): Promise<void> {
    console.log('[AUDIT]', entry.action, entry.resourceType, entry.details || {});
  }
  
  async getAuditLog(filters?: any): Promise<any[]> {
    return [];
  }
}

const auditService = new AuditService();
export default auditService;
export { AuditService, ACTIONS, RESOURCE_TYPES };
