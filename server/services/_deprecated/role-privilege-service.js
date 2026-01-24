/**
 * TrialSage Role and Privilege Management Service
 *
 * This service provides comprehensive role-based access control (RBAC) features:
 * - Role management (create, update, delete roles)
 * - Role assignment to users
 * - Permission management
 * - Module-specific privilege control
 * - Hierarchical privilege inheritance
 * - Staff oversight and permission auditing
 */

const { v4: uuidv4 } = require('uuid');
const { storage } = require('../storage');
const securityMiddleware = require('../middleware/security');

// System-defined roles with preset permissions
const SYSTEM_ROLES = {
  ADMINISTRATOR: {
    id: 'admin',
    name: 'Administrator',
    description: 'Full system access with all privileges',
    level: 100,
    systemDefined: true,
    permissions: [
      'ALL_PERMISSIONS',
      'MANAGE_USERS',
      'MANAGE_ROLES',
      'MANAGE_PERMISSIONS',
      'VIEW_AUDIT_LOGS',
      'MANAGE_DOCUMENTS',
      'MANAGE_SETTINGS',
      'MANAGE_SECURITY',
      'RUN_REPORTS',
      'GRANT_ADMIN_PRIVILEGES',
    ],
  },
  MANAGER: {
    id: 'manager',
    name: 'Manager',
    description: 'Department or team manager with oversight privileges',
    level: 80,
    systemDefined: true,
    permissions: [
      'MANAGE_USERS',
      'VIEW_AUDIT_LOGS',
      'MANAGE_DOCUMENTS',
      'MANAGE_SETTINGS',
      'RUN_REPORTS',
      'VIEW_TEAM_ACTIVITIES',
    ],
  },
  SUPERVISOR: {
    id: 'supervisor',
    name: 'Supervisor',
    description: 'Team supervisor with limited management capabilities',
    level: 70,
    systemDefined: true,
    permissions: [
      'VIEW_AUDIT_LOGS_LIMITED',
      'MANAGE_DOCUMENTS',
      'RUN_REPORTS_LIMITED',
      'VIEW_TEAM_ACTIVITIES',
    ],
  },
  DOCUMENT_REVIEWER: {
    id: 'document_reviewer',
    name: 'Document Reviewer',
    description: 'Can review and approve documents',
    level: 60,
    systemDefined: true,
    permissions: [
      'READ_DOCUMENTS',
      'APPROVE_DOCUMENTS',
      'COMMENT_DOCUMENTS',
      'VIEW_REPORTS_LIMITED',
    ],
  },
  STANDARD_USER: {
    id: 'standard_user',
    name: 'Standard User',
    description: 'Regular system user with basic privileges',
    level: 50,
    systemDefined: true,
    permissions: ['READ_DOCUMENTS', 'EDIT_OWN_DOCUMENTS', 'VIEW_OWN_REPORTS'],
  },
  EXTERNAL_REVIEWER: {
    id: 'external_reviewer',
    name: 'External Reviewer',
    description: 'External user with limited access for review purposes',
    level: 30,
    systemDefined: true,
    permissions: ['READ_ASSIGNED_DOCUMENTS', 'COMMENT_ASSIGNED_DOCUMENTS'],
  },
  READ_ONLY: {
    id: 'read_only',
    name: 'Read Only',
    description: 'Can only view documents, no editing capabilities',
    level: 20,
    systemDefined: true,
    permissions: ['READ_DOCUMENTS'],
  },
  GUEST: {
    id: 'guest',
    name: 'Guest',
    description: 'Minimal access for demonstration purposes',
    level: 10,
    systemDefined: true,
    permissions: ['VIEW_PUBLIC_DOCUMENTS'],
  },
};

// Module-specific permission groups
const MODULE_PERMISSIONS = {
  DOCUMENT_MANAGEMENT: {
    READ_DOCUMENTS: 'View all documents in the system',
    READ_ASSIGNED_DOCUMENTS: 'View only assigned documents',
    EDIT_OWN_DOCUMENTS: 'Edit documents created by self',
    EDIT_ALL_DOCUMENTS: 'Edit any document in the system',
    DELETE_OWN_DOCUMENTS: 'Delete documents created by self',
    DELETE_ALL_DOCUMENTS: 'Delete any document in the system',
    APPROVE_DOCUMENTS: 'Approve documents for publishing',
    PUBLISH_DOCUMENTS: 'Publish documents to production',
    MANAGE_DOCUMENTS: 'Full document lifecycle management',
    VIEW_DOCUMENT_HISTORY: 'View version history and changes',
    EXPORT_DOCUMENTS: 'Export documents to external formats',
    COMMENT_DOCUMENTS: 'Add comments to documents',
    COMMENT_ASSIGNED_DOCUMENTS: 'Add comments to assigned documents',
  },
  USER_MANAGEMENT: {
    VIEW_USERS: 'View user profiles and basic info',
    EDIT_OWN_PROFILE: 'Edit own user profile',
    EDIT_USER_PROFILES: 'Edit any user profile',
    CREATE_USERS: 'Create new user accounts',
    DEACTIVATE_USERS: 'Temporarily disable user accounts',
    DELETE_USERS: 'Permanently delete user accounts',
    RESET_PASSWORDS: 'Reset user passwords',
    MANAGE_USERS: 'Full user account management',
    ASSIGN_ROLES: 'Assign roles to users',
    MANAGE_ROLES: 'Create and manage role definitions',
    MANAGE_PERMISSIONS: 'Define and assign permissions',
  },
  SECURITY: {
    VIEW_SECURITY_SETTINGS: 'View security configuration',
    EDIT_SECURITY_SETTINGS: 'Modify security configuration',
    MANAGE_SECURITY: 'Full security system management',
    VIEW_OWN_AUDIT_LOGS: 'View own activity logs',
    VIEW_AUDIT_LOGS_LIMITED: 'View limited audit logs',
    VIEW_AUDIT_LOGS: 'View all system audit logs',
    EXPORT_AUDIT_LOGS: 'Export audit logs for compliance',
    GRANT_ADMIN_PRIVILEGES: 'Grant administrative privileges',
    SET_PASSWORD_POLICIES: 'Define password complexity rules',
  },
  REPORTING: {
    VIEW_OWN_REPORTS: 'View reports related to own activities',
    VIEW_TEAM_REPORTS: 'View reports for team members',
    VIEW_ALL_REPORTS: 'View all system reports',
    CREATE_REPORTS: 'Create custom reports',
    EXPORT_REPORTS: 'Export reports to external formats',
    SCHEDULE_REPORTS: 'Schedule automatic report generation',
    RUN_REPORTS_LIMITED: 'Run basic predefined reports',
    RUN_REPORTS: 'Run all available reports',
    VIEW_TEAM_ACTIVITIES: 'View activity reports for team members',
    VIEW_SYSTEM_DASHBOARD: 'View system performance dashboard',
  },
  ADMINISTRATION: {
    VIEW_SETTINGS: 'View system settings',
    EDIT_SETTINGS: 'Modify system settings',
    MANAGE_SETTINGS: 'Full system settings management',
    VIEW_SYSTEM_LOGS: 'View system operation logs',
    MANAGE_SYSTEM_LOGS: 'Manage system logging configuration',
    VIEW_API_KEYS: 'View API integration keys',
    MANAGE_API_KEYS: 'Create and manage API keys',
    BACKUP_DATA: 'Create system backups',
    RESTORE_DATA: 'Restore from system backups',
    MANAGE_TEMPLATES: 'Manage document templates',
    ALL_PERMISSIONS: 'Unrestricted access to all system features',
  },
};

// Flatten module permissions into a single list
const ALL_PERMISSIONS = Object.values(MODULE_PERMISSIONS).reduce((acc, group) => {
  return { ...acc, ...group };
}, {});

/**
 * Get all available roles in the system
 *
 * @returns {Promise<Array>} Array of role objects
 */
async function getAllRoles() {
  try {
    // In a real implementation, fetch custom roles from database
    // and merge with system-defined roles

    // For this example, we'll just return system roles
    return Object.values(SYSTEM_ROLES);
  } catch (error) {
    console.error('Failed to get roles:', error);
    throw new Error('Failed to retrieve roles');
  }
}

/**
 * Get role details by ID
 *
 * @param {string} roleId - Role identifier
 * @returns {Promise<Object>} Role object
 */
async function getRoleById(roleId) {
  try {
    // Check system roles first
    if (SYSTEM_ROLES[roleId.toUpperCase()]) {
      return SYSTEM_ROLES[roleId.toUpperCase()];
    }

    // In a real implementation, check database for custom roles
    // For this example, we'll return null if not found in system roles
    return null;
  } catch (error) {
    console.error(`Failed to get role ${roleId}:`, error);
    throw new Error(`Failed to retrieve role ${roleId}`);
  }
}

/**
 * Create a new custom role
 *
 * @param {Object} roleData - Role definition
 * @param {string} roleData.name - Role name
 * @param {string} roleData.description - Role description
 * @param {number} roleData.level - Role hierarchy level (1-100)
 * @param {Array<string>} roleData.permissions - List of permission codes
 * @returns {Promise<Object>} Created role object
 */
async function createRole(roleData) {
  try {
    // Validate role data
    if (!roleData.name) {
      throw new Error('Role name is required');
    }

    if (!roleData.level || roleData.level < 1 || roleData.level > 100) {
      throw new Error('Role level must be between 1 and 100');
    }

    if (!Array.isArray(roleData.permissions)) {
      throw new Error('Permissions must be an array');
    }

    // Validate permissions
    roleData.permissions.forEach(permission => {
      if (!ALL_PERMISSIONS[permission] && permission !== 'ALL_PERMISSIONS') {
        throw new Error(`Invalid permission: ${permission}`);
      }
    });

    // Create role object
    const newRole = {
      id: uuidv4(),
      name: roleData.name,
      description: roleData.description || '',
      level: roleData.level,
      systemDefined: false,
      permissions: roleData.permissions,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // In a real implementation, save to database

    // Log the role creation
    securityMiddleware.auditLog('ROLE_CREATED', {
      roleId: newRole.id,
      roleName: newRole.name,
      permissions: newRole.permissions,
    });

    return newRole;
  } catch (error) {
    console.error('Failed to create role:', error);
    throw new Error(`Failed to create role: ${error.message}`);
  }
}

/**
 * Update an existing role
 *
 * @param {string} roleId - Role identifier
 * @param {Object} roleData - Updated role data
 * @returns {Promise<Object>} Updated role object
 */
async function updateRole(roleId, roleData) {
  try {
    // Check if role exists and is not system-defined
    const existingRole = await getRoleById(roleId);

    if (!existingRole) {
      throw new Error(`Role ${roleId} not found`);
    }

    if (existingRole.systemDefined) {
      throw new Error('System-defined roles cannot be modified');
    }

    // In a real implementation, update role in database

    // Log the role update
    securityMiddleware.auditLog('ROLE_UPDATED', {
      roleId,
      roleName: roleData.name || existingRole.name,
      permissions: roleData.permissions || existingRole.permissions,
    });

    // Return updated role (mocked)
    return {
      ...existingRole,
      ...roleData,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Failed to update role ${roleId}:`, error);
    throw new Error(`Failed to update role: ${error.message}`);
  }
}

/**
 * Delete a custom role
 *
 * @param {string} roleId - Role identifier
 * @returns {Promise<boolean>} Success indicator
 */
async function deleteRole(roleId) {
  try {
    // Check if role exists and is not system-defined
    const existingRole = await getRoleById(roleId);

    if (!existingRole) {
      throw new Error(`Role ${roleId} not found`);
    }

    if (existingRole.systemDefined) {
      throw new Error('System-defined roles cannot be deleted');
    }

    // In a real implementation, delete role from database
    // and reassign users to a default role

    // Log the role deletion
    securityMiddleware.auditLog('ROLE_DELETED', {
      roleId,
      roleName: existingRole.name,
    });

    return true;
  } catch (error) {
    console.error(`Failed to delete role ${roleId}:`, error);
    throw new Error(`Failed to delete role: ${error.message}`);
  }
}

/**
 * Check if a user has a specific permission
 *
 * @param {number} userId - User identifier
 * @param {string} permission - Permission code to check
 * @returns {Promise<boolean>} Whether user has the permission
 */
async function hasPermission(userId, permission) {
  try {
    // Get user's roles
    const userRoles = await getUserRoles(userId);

    // Check if any role grants ALL_PERMISSIONS
    if (userRoles.some(role => role.permissions.includes('ALL_PERMISSIONS'))) {
      return true;
    }

    // Check if any role grants the specific permission
    return userRoles.some(role => role.permissions.includes(permission));
  } catch (error) {
    console.error(`Failed to check permission ${permission} for user ${userId}:`, error);
    return false;
  }
}

/**
 * Check if a user has permissions for a specific module
 *
 * @param {number} userId - User identifier
 * @param {string} module - Module name (e.g., 'DOCUMENT_MANAGEMENT')
 * @returns {Promise<Object>} Object with permission codes as keys and boolean values
 */
async function getModulePermissions(userId, module) {
  try {
    // Validate module
    if (!MODULE_PERMISSIONS[module]) {
      throw new Error(`Invalid module: ${module}`);
    }

    // Get user's roles
    const userRoles = await getUserRoles(userId);

    // Check if any role grants ALL_PERMISSIONS
    const hasAllPermissions = userRoles.some(role => role.permissions.includes('ALL_PERMISSIONS'));

    // If user has all permissions, return all module permissions as true
    if (hasAllPermissions) {
      return Object.keys(MODULE_PERMISSIONS[module]).reduce((acc, perm) => {
        acc[perm] = true;
        return acc;
      }, {});
    }

    // Otherwise, check each permission individually
    const permissions = {};

    // Flatten all role permissions
    const userPermissions = userRoles.reduce((acc, role) => {
      return [...acc, ...role.permissions];
    }, []);

    // Check each module permission
    for (const perm of Object.keys(MODULE_PERMISSIONS[module])) {
      permissions[perm] = userPermissions.includes(perm);
    }

    return permissions;
  } catch (error) {
    console.error(`Failed to get module permissions for user ${userId}:`, error);
    throw new Error(`Failed to get module permissions: ${error.message}`);
  }
}

/**
 * Get all roles assigned to a user
 *
 * @param {number} userId - User identifier
 * @returns {Promise<Array>} Array of role objects
 */
async function getUserRoles(userId) {
  try {
    // In a real implementation, fetch user roles from database
    // For this example, return a default role (standard user)
    return [SYSTEM_ROLES.STANDARD_USER];
  } catch (error) {
    console.error(`Failed to get roles for user ${userId}:`, error);
    throw new Error(`Failed to get user roles: ${error.message}`);
  }
}

/**
 * Assign roles to a user
 *
 * @param {number} userId - User identifier
 * @param {Array<string>} roleIds - Array of role identifiers
 * @returns {Promise<boolean>} Success indicator
 */
async function assignRolesToUser(userId, roleIds) {
  try {
    // Validate role IDs
    for (const roleId of roleIds) {
      const role = await getRoleById(roleId);
      if (!role) {
        throw new Error(`Role ${roleId} not found`);
      }
    }

    // In a real implementation, update user roles in database

    // Log the role assignment
    securityMiddleware.auditLog('ROLES_ASSIGNED', {
      userId,
      roleIds,
    });

    return true;
  } catch (error) {
    console.error(`Failed to assign roles to user ${userId}:`, error);
    throw new Error(`Failed to assign roles: ${error.message}`);
  }
}

/**
 * Get users with specific roles
 *
 * @param {Array<string>} roleIds - Array of role identifiers
 * @returns {Promise<Array>} Array of user objects with the specified roles
 */
async function getUsersByRoles(roleIds) {
  try {
    // In a real implementation, query database for users with the specified roles
    // For this example, return empty array
    return [];
  } catch (error) {
    console.error('Failed to get users by roles:', error);
    throw new Error(`Failed to get users by roles: ${error.message}`);
  }
}

/**
 * Generate a staff oversight report
 *
 * @param {Object} options - Report options
 * @param {string} options.reportType - Type of report to generate
 * @param {Array<string>} options.roles - Filter by roles
 * @param {string} options.startDate - Start date for report period
 * @param {string} options.endDate - End date for report period
 * @returns {Promise<Object>} Generated report
 */
async function generateStaffOversightReport(options) {
  try {
    // Validate options
    if (!options.reportType) {
      throw new Error('Report type is required');
    }

    // Log the report generation
    securityMiddleware.auditLog('REPORT_GENERATED', {
      reportType: options.reportType,
      filters: {
        roles: options.roles || [],
        startDate: options.startDate,
        endDate: options.endDate,
      },
    });

    // Generate different reports based on type
    switch (options.reportType) {
      case 'ROLE_DISTRIBUTION':
        return generateRoleDistributionReport(options);
      case 'PERMISSION_USAGE':
        return generatePermissionUsageReport(options);
      case 'USER_ACTIVITY':
        return generateUserActivityReport(options);
      case 'SECURITY_EVENTS':
        return generateSecurityEventsReport(options);
      default:
        throw new Error(`Unsupported report type: ${options.reportType}`);
    }
  } catch (error) {
    console.error('Failed to generate staff oversight report:', error);
    throw new Error(`Failed to generate report: ${error.message}`);
  }
}

/**
 * Generate role distribution report
 *
 * @param {Object} options - Report options
 * @returns {Promise<Object>} Generated report
 */
async function generateRoleDistributionReport(options) {
  // In a real implementation, query database for role distribution
  // For this example, return mock data
  return {
    reportType: 'ROLE_DISTRIBUTION',
    generatedAt: new Date().toISOString(),
    data: {
      totalUsers: 120,
      roleDistribution: [
        { roleId: 'admin', roleName: 'Administrator', userCount: 3, percentage: 2.5 },
        { roleId: 'manager', roleName: 'Manager', userCount: 12, percentage: 10 },
        { roleId: 'supervisor', roleName: 'Supervisor', userCount: 18, percentage: 15 },
        {
          roleId: 'document_reviewer',
          roleName: 'Document Reviewer',
          userCount: 25,
          percentage: 20.83,
        },
        { roleId: 'standard_user', roleName: 'Standard User', userCount: 47, percentage: 39.17 },
        {
          roleId: 'external_reviewer',
          roleName: 'External Reviewer',
          userCount: 10,
          percentage: 8.33,
        },
        { roleId: 'read_only', roleName: 'Read Only', userCount: 5, percentage: 4.17 },
      ],
    },
  };
}

/**
 * Generate permission usage report
 *
 * @param {Object} options - Report options
 * @returns {Promise<Object>} Generated report
 */
async function generatePermissionUsageReport(options) {
  // In a real implementation, query database for permission usage
  // For this example, return mock data
  return {
    reportType: 'PERMISSION_USAGE',
    generatedAt: new Date().toISOString(),
    period: {
      startDate: options.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: options.endDate || new Date().toISOString(),
    },
    data: {
      mostUsedPermissions: [
        { permission: 'READ_DOCUMENTS', count: 2450, percentOfTotal: 42.5 },
        { permission: 'EDIT_OWN_DOCUMENTS', count: 980, percentOfTotal: 17 },
        { permission: 'COMMENT_DOCUMENTS', count: 720, percentOfTotal: 12.5 },
        { permission: 'VIEW_AUDIT_LOGS', count: 350, percentOfTotal: 6.1 },
        { permission: 'APPROVE_DOCUMENTS', count: 210, percentOfTotal: 3.6 },
      ],
      leastUsedPermissions: [
        { permission: 'DELETE_ALL_DOCUMENTS', count: 5, percentOfTotal: 0.1 },
        { permission: 'RESTORE_DATA', count: 2, percentOfTotal: 0.03 },
        { permission: 'GRANT_ADMIN_PRIVILEGES', count: 1, percentOfTotal: 0.02 },
      ],
      unusedPermissions: ['BACKUP_DATA', 'MANAGE_API_KEYS'],
    },
  };
}

/**
 * Generate user activity report
 *
 * @param {Object} options - Report options
 * @returns {Promise<Object>} Generated report
 */
async function generateUserActivityReport(options) {
  // In a real implementation, query database for user activity
  // For this example, return mock data
  return {
    reportType: 'USER_ACTIVITY',
    generatedAt: new Date().toISOString(),
    period: {
      startDate: options.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: options.endDate || new Date().toISOString(),
    },
    data: {
      totalUsers: 120,
      activeUsers: 98,
      inactiveUsers: 22,
      averageSessionDuration: 45.2, // minutes
      peakActivityTime: '10:00-11:00',
      peakActivityDay: 'Wednesday',
      mostActiveUsers: [
        { userId: 105, username: 'emma.johnson', activityCount: 178, role: 'Manager' },
        { userId: 212, username: 'david.smith', activityCount: 156, role: 'Supervisor' },
        { userId: 118, username: 'sophia.garcia', activityCount: 143, role: 'Document Reviewer' },
      ],
      leastActiveUsers: [
        { userId: 423, username: 'robert.wilson', activityCount: 3, role: 'Standard User' },
        { userId: 319, username: 'olivia.brown', activityCount: 2, role: 'Standard User' },
        { userId: 562, username: 'william.miller', activityCount: 1, role: 'Read Only' },
      ],
    },
  };
}

/**
 * Generate security events report
 *
 * @param {Object} options - Report options
 * @returns {Promise<Object>} Generated report
 */
async function generateSecurityEventsReport(options) {
  // In a real implementation, query database for security events
  // For this example, return mock data
  return {
    reportType: 'SECURITY_EVENTS',
    generatedAt: new Date().toISOString(),
    period: {
      startDate: options.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: options.endDate || new Date().toISOString(),
    },
    data: {
      totalEvents: 452,
      eventTypes: {
        LOGIN_SUCCESS: 320,
        LOGIN_FAILED: 45,
        PASSWORD_CHANGED: 28,
        SECURITY_SETTINGS_UPDATED: 12,
        ROLE_CREATED: 3,
        ROLE_UPDATED: 8,
        ROLE_DELETED: 1,
        PERMISSION_GRANTED: 18,
        PERMISSION_REVOKED: 7,
        MFA_ENABLED: 10,
        MFA_DISABLED: 0,
      },
      suspiciousActivities: [
        {
          userId: 212,
          username: 'david.smith',
          events: [
            { type: 'LOGIN_FAILED', count: 5, timeWindow: '10 minutes' },
            { type: 'LOGIN_SUCCESS', timestamp: '2025-04-25T08:22:15Z', ipAddress: '192.168.1.45' },
            {
              type: 'PERMISSION_GRANTED',
              timestamp: '2025-04-25T08:25:30Z',
              details: 'Self-granted MANAGE_DOCUMENTS permission',
            },
          ],
          riskLevel: 'MEDIUM',
        },
      ],
    },
  };
}

/**
 * Get all available permissions
 *
 * @returns {Object} Object with module groups containing permission definitions
 */
function getAllPermissions() {
  return MODULE_PERMISSIONS;
}

/**
 * Register role and privilege management routes
 *
 * @param {Express} app - Express app
 */
function setupRolePrivilegeRoutes(app) {
  // Get all roles
  app.get('/api/security/roles', async (req, res) => {
    try {
      const roles = await getAllRoles();
      res.json(roles);
    } catch (error) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  });

  // Get role by ID
  app.get('/api/security/roles/:roleId', async (req, res) => {
    try {
      const role = await getRoleById(req.params.roleId);

      if (!role) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Role ${req.params.roleId} not found`,
        });
      }

      res.json(role);
    } catch (error) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  });

  // Create new role
  app.post('/api/security/roles', async (req, res) => {
    try {
      const role = await createRole(req.body);
      res.status(201).json(role);
    } catch (error) {
      res.status(400).json({
        error: 'Bad Request',
        message: error.message,
      });
    }
  });

  // Update role
  app.put('/api/security/roles/:roleId', async (req, res) => {
    try {
      const role = await updateRole(req.params.roleId, req.body);
      res.json(role);
    } catch (error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
      }

      res.status(400).json({
        error: 'Bad Request',
        message: error.message,
      });
    }
  });

  // Delete role
  app.delete('/api/security/roles/:roleId', async (req, res) => {
    try {
      await deleteRole(req.params.roleId);
      res.status(204).end();
    } catch (error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
      }

      res.status(400).json({
        error: 'Bad Request',
        message: error.message,
      });
    }
  });

  // Get all permissions
  app.get('/api/security/permissions', (req, res) => {
    res.json(getAllPermissions());
  });

  // Get user roles
  app.get('/api/security/users/:userId/roles', async (req, res) => {
    try {
      const roles = await getUserRoles(req.params.userId);
      res.json(roles);
    } catch (error) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  });

  // Assign roles to user
  app.post('/api/security/users/:userId/roles', async (req, res) => {
    try {
      const { roleIds } = req.body;

      if (!Array.isArray(roleIds)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'roleIds must be an array',
        });
      }

      await assignRolesToUser(req.params.userId, roleIds);
      res.status(204).end();
    } catch (error) {
      res.status(400).json({
        error: 'Bad Request',
        message: error.message,
      });
    }
  });

  // Check user permission
  app.get('/api/security/users/:userId/permissions/:permission', async (req, res) => {
    try {
      const hasPermissionResult = await hasPermission(req.params.userId, req.params.permission);
      res.json({ hasPermission: hasPermissionResult });
    } catch (error) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  });

  // Get user module permissions
  app.get('/api/security/users/:userId/modules/:module/permissions', async (req, res) => {
    try {
      const permissions = await getModulePermissions(
        req.params.userId,
        req.params.module.toUpperCase()
      );
      res.json(permissions);
    } catch (error) {
      if (error.message.includes('Invalid module')) {
        return res.status(400).json({
          error: 'Bad Request',
          message: error.message,
        });
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  });

  // Generate staff oversight report
  app.post('/api/security/reports/staff-oversight', async (req, res) => {
    try {
      const report = await generateStaffOversightReport(req.body);
      res.json(report);
    } catch (error) {
      res.status(400).json({
        error: 'Bad Request',
        message: error.message,
      });
    }
  });
}

module.exports = {
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  hasPermission,
  getModulePermissions,
  getUserRoles,
  assignRolesToUser,
  getUsersByRoles,
  generateStaffOversightReport,
  getAllPermissions,
  setupRolePrivilegeRoutes,
  SYSTEM_ROLES,
  MODULE_PERMISSIONS,
};
