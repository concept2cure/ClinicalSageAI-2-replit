/**
 * TrialSage Security Service
 *
 * This service provides enterprise-grade security features for the TrialSage platform:
 * - User security settings management
 * - Comprehensive audit logging
 * - Document integrity verification
 * - Security policy enforcement
 * - User activity monitoring
 */

const crypto = require('crypto');
const { storage } = require('../storage');
const { v4: uuidv4 } = require('uuid');
const securityMiddleware = require('../middleware/security');

// Default security settings for users
const DEFAULT_SECURITY_SETTINGS = {
  mfaEnabled: false,
  mfaMethod: 'none', // 'none', 'app', 'sms', 'email'
  sessionTimeout: 3600000, // 1 hour
  ipRestrictions: [], // List of allowed IP addresses/ranges
  lastPasswordChange: null,
  passwordExpiryDays: 90,
  documentAccessLevel: 'standard', // 'restricted', 'standard', 'elevated'
  allowExternalSharing: false,
  documentWatermarking: true,
  auditLoggingLevel: 'standard', // 'minimal', 'standard', 'verbose'
  autoLogoutOnInactivity: true,
  securityNotifications: true,
  apiAccessEnabled: false,
};

/**
 * Get user security settings
 *
 * @param {number} userId - User ID
 * @returns {Promise<Object>} - User security settings
 */
async function getUserSecuritySettings(userId) {
  try {
    // In a real implementation, fetch from database
    // For this example, we'll return default settings

    // Create log entry
    securityMiddleware.auditLog('SECURITY_SETTINGS_ACCESSED', {
      userId,
      timestamp: new Date().toISOString(),
    });

    return {
      ...DEFAULT_SECURITY_SETTINGS,
      userId,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Failed to get user security settings:', error);
    throw new Error('Failed to get user security settings');
  }
}

/**
 * Update user security settings
 *
 * @param {number} userId - User ID
 * @param {Object} settings - New security settings
 * @returns {Promise<Object>} - Updated security settings
 */
async function updateUserSecuritySettings(userId, settings) {
  try {
    // Validate settings
    const validatedSettings = validateSecuritySettings(settings);

    // In a real implementation, update in database
    // For this example, we'll just return the validated settings

    // Create log entry for the update
    securityMiddleware.auditLog('SECURITY_SETTINGS_UPDATED', {
      userId,
      timestamp: new Date().toISOString(),
      changes: Object.keys(settings).join(', '),
    });

    return {
      ...validatedSettings,
      userId,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Failed to update user security settings:', error);
    throw new Error('Failed to update user security settings: ' + error.message);
  }
}

/**
 * Validate security settings
 *
 * @param {Object} settings - Security settings to validate
 * @returns {Object} - Validated security settings
 */
function validateSecuritySettings(settings) {
  const validatedSettings = { ...DEFAULT_SECURITY_SETTINGS };

  // Validate each setting
  if (settings.mfaEnabled !== undefined) {
    validatedSettings.mfaEnabled = Boolean(settings.mfaEnabled);
  }

  if (settings.mfaMethod) {
    if (!['none', 'app', 'sms', 'email'].includes(settings.mfaMethod)) {
      throw new Error('Invalid MFA method');
    }
    validatedSettings.mfaMethod = settings.mfaMethod;
  }

  if (settings.sessionTimeout !== undefined) {
    const timeout = parseInt(settings.sessionTimeout);
    if (isNaN(timeout) || timeout < 300000 || timeout > 86400000) {
      throw new Error('Session timeout must be between 5 minutes and 24 hours');
    }
    validatedSettings.sessionTimeout = timeout;
  }

  if (settings.passwordExpiryDays !== undefined) {
    const days = parseInt(settings.passwordExpiryDays);
    if (isNaN(days) || days < 0 || days > 365) {
      throw new Error('Password expiry days must be between 0 and 365');
    }
    validatedSettings.passwordExpiryDays = days;
  }

  if (settings.documentAccessLevel) {
    if (!['restricted', 'standard', 'elevated'].includes(settings.documentAccessLevel)) {
      throw new Error('Invalid document access level');
    }
    validatedSettings.documentAccessLevel = settings.documentAccessLevel;
  }

  if (settings.allowExternalSharing !== undefined) {
    validatedSettings.allowExternalSharing = Boolean(settings.allowExternalSharing);
  }

  if (settings.documentWatermarking !== undefined) {
    validatedSettings.documentWatermarking = Boolean(settings.documentWatermarking);
  }

  if (settings.auditLoggingLevel) {
    if (!['minimal', 'standard', 'verbose'].includes(settings.auditLoggingLevel)) {
      throw new Error('Invalid audit logging level');
    }
    validatedSettings.auditLoggingLevel = settings.auditLoggingLevel;
  }

  if (settings.autoLogoutOnInactivity !== undefined) {
    validatedSettings.autoLogoutOnInactivity = Boolean(settings.autoLogoutOnInactivity);
  }

  if (settings.securityNotifications !== undefined) {
    validatedSettings.securityNotifications = Boolean(settings.securityNotifications);
  }

  if (settings.apiAccessEnabled !== undefined) {
    validatedSettings.apiAccessEnabled = Boolean(settings.apiAccessEnabled);
  }

  return validatedSettings;
}

/**
 * Get user audit logs
 *
 * @param {number} userId - User ID
 * @param {Object} options - Query options
 * @param {number} options.limit - Maximum number of logs to return
 * @param {number} options.offset - Number of logs to skip
 * @param {string} options.startDate - Start date filter (ISO string)
 * @param {string} options.endDate - End date filter (ISO string)
 * @param {string} options.eventType - Filter by event type
 * @returns {Promise<Array>} - User audit logs
 */
async function getUserAuditLogs(userId, options = {}) {
  try {
    // Default options
    const queryOptions = {
      limit: options.limit || 100,
      offset: options.offset || 0,
      startDate: options.startDate || null,
      endDate: options.endDate || null,
      eventType: options.eventType || null,
    };

    // In a real implementation, fetch from database
    // For this example, we'll return example logs

    // Log the audit logs access
    securityMiddleware.auditLog('AUDIT_LOGS_ACCESSED', {
      userId,
      queryOptions,
      timestamp: new Date().toISOString(),
    });

    // Generate sample logs for demonstration
    const sampleLogs = [];
    const eventTypes = [
      'LOGIN_SUCCESS',
      'DOCUMENT_VIEW',
      'DOCUMENT_EDIT',
      'SECURITY_SETTINGS_UPDATED',
      'PASSWORD_CHANGED',
      'DOCUMENT_DOWNLOAD',
      'DOCUMENT_SHARE',
      'DOCUMENT_UPLOAD',
    ];

    // Filter by event type if specified
    const filteredEventTypes = queryOptions.eventType
      ? eventTypes.filter(et => et === queryOptions.eventType)
      : eventTypes;

    // Generate logs
    for (let i = 0; i < 10; i++) {
      const timestamp = new Date();
      timestamp.setHours(timestamp.getHours() - i);

      sampleLogs.push({
        id: uuidv4(),
        userId,
        eventType: filteredEventTypes[i % filteredEventTypes.length],
        timestamp: timestamp.toISOString(),
        ipAddress: '192.168.1.' + (i + 1),
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        details: {
          // Different details based on event type
          documentId: eventTypes[i % eventTypes.length].includes('DOCUMENT')
            ? 'doc-' + (1000 + i)
            : undefined,
          action: eventTypes[i % eventTypes.length].includes('DOCUMENT') ? 'view' : undefined,
        },
      });
    }

    // Apply date filters
    let filteredLogs = sampleLogs;
    if (queryOptions.startDate) {
      const startDate = new Date(queryOptions.startDate);
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= startDate);
    }
    if (queryOptions.endDate) {
      const endDate = new Date(queryOptions.endDate);
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= endDate);
    }

    // Apply pagination
    const paginatedLogs = filteredLogs.slice(
      queryOptions.offset,
      queryOptions.offset + queryOptions.limit
    );

    return {
      logs: paginatedLogs,
      total: filteredLogs.length,
      limit: queryOptions.limit,
      offset: queryOptions.offset,
    };
  } catch (error) {
    console.error('Failed to get user audit logs:', error);
    throw new Error('Failed to get user audit logs');
  }
}

/**
 * Get document access logs
 *
 * @param {string} documentId - Document ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} - Document access logs
 */
async function getDocumentAccessLogs(documentId, options = {}) {
  try {
    // Same implementation as getUserAuditLogs but filtered by document
    const queryOptions = {
      limit: options.limit || 100,
      offset: options.offset || 0,
      startDate: options.startDate || null,
      endDate: options.endDate || null,
    };

    // Log the document access logs retrieval
    securityMiddleware.auditLog('DOCUMENT_LOGS_ACCESSED', {
      documentId,
      queryOptions,
      timestamp: new Date().toISOString(),
    });

    // Generate sample logs for demonstration
    const sampleLogs = [];
    const actions = ['view', 'download', 'edit', 'share', 'print'];
    const userIds = [101, 102, 103, 104, 105];

    // Generate logs
    for (let i = 0; i < 10; i++) {
      const timestamp = new Date();
      timestamp.setHours(timestamp.getHours() - i);

      sampleLogs.push({
        id: uuidv4(),
        documentId,
        userId: userIds[i % userIds.length],
        userEmail: `user${userIds[i % userIds.length]}@example.com`,
        action: actions[i % actions.length],
        timestamp: timestamp.toISOString(),
        ipAddress: '192.168.1.' + (i + 1),
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      });
    }

    // Apply date filters
    let filteredLogs = sampleLogs;
    if (queryOptions.startDate) {
      const startDate = new Date(queryOptions.startDate);
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= startDate);
    }
    if (queryOptions.endDate) {
      const endDate = new Date(queryOptions.endDate);
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= endDate);
    }

    // Apply pagination
    const paginatedLogs = filteredLogs.slice(
      queryOptions.offset,
      queryOptions.offset + queryOptions.limit
    );

    return {
      logs: paginatedLogs,
      total: filteredLogs.length,
      limit: queryOptions.limit,
      offset: queryOptions.offset,
    };
  } catch (error) {
    console.error('Failed to get document access logs:', error);
    throw new Error('Failed to get document access logs');
  }
}

/**
 * Verify document integrity
 *
 * @param {string} documentId - Document ID
 * @param {string} contentHash - SHA-256 hash of document content
 * @returns {Promise<boolean>} - Whether document integrity is verified
 */
async function verifyDocumentIntegrity(documentId, contentHash) {
  try {
    // In a real implementation, fetch the stored hash from database
    // For this example, we'll simulate verification

    // Log the document integrity verification
    securityMiddleware.auditLog('DOCUMENT_INTEGRITY_CHECK', {
      documentId,
      contentHash: contentHash.substring(0, 10) + '...',
      timestamp: new Date().toISOString(),
    });

    // Simulate verification (always true for demo)
    return true;
  } catch (error) {
    console.error('Failed to verify document integrity:', error);
    throw new Error('Failed to verify document integrity');
  }
}

/**
 * Set up security routes
 *
 * @param {Express} app - Express app
 */
function setupSecurityServiceRoutes(app) {
  // Get user security settings
  app.get('/api/security/settings/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);

      if (isNaN(userId)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid user ID',
        });
      }

      const settings = await getUserSecuritySettings(userId);

      res.json(settings);
    } catch (error) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  });

  // Update user security settings
  app.put('/api/security/settings/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);

      if (isNaN(userId)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid user ID',
        });
      }

      const settings = await updateUserSecuritySettings(userId, req.body);

      res.json(settings);
    } catch (error) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  });

  // Get user audit logs
  app.get('/api/security/audit-logs/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);

      if (isNaN(userId)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid user ID',
        });
      }

      const options = {
        limit: parseInt(req.query.limit) || 100,
        offset: parseInt(req.query.offset) || 0,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        eventType: req.query.eventType,
      };

      const logs = await getUserAuditLogs(userId, options);

      res.json(logs);
    } catch (error) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  });

  // Get document access logs
  app.get('/api/security/document-logs/:documentId', async (req, res) => {
    try {
      const documentId = req.params.documentId;

      if (!documentId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid document ID',
        });
      }

      const options = {
        limit: parseInt(req.query.limit) || 100,
        offset: parseInt(req.query.offset) || 0,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      };

      const logs = await getDocumentAccessLogs(documentId, options);

      res.json(logs);
    } catch (error) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  });

  // Verify document integrity
  app.post('/api/security/verify-document', async (req, res) => {
    try {
      const { documentId, contentHash } = req.body;

      if (!documentId || !contentHash) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Missing required fields: documentId, contentHash',
        });
      }

      const verified = await verifyDocumentIntegrity(documentId, contentHash);

      res.json({
        documentId,
        verified,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  });
}

module.exports = {
  getUserSecuritySettings,
  updateUserSecuritySettings,
  getUserAuditLogs,
  getDocumentAccessLogs,
  verifyDocumentIntegrity,
  setupSecurityServiceRoutes,
  DEFAULT_SECURITY_SETTINGS,
};
