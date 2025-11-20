import express from 'express';
import rbacService from '../../services/roleBasedAccess.js';
import auditService from '../../services/auditService.js';

const router = express.Router();

// Middleware to extract tenant and user info
const extractTenantUser = (req, res, next) => {
  req.tenantId = req.headers['x-tenant-id'] || req.query.tenantId || 1;
  req.userId = req.headers['x-user-id'] || req.query.userId || 1;
  next();
};

router.use(extractTenantUser);

// Get all available roles with hierarchy
router.get('/roles', async (req, res) => {
  try {
    const roles = await rbacService.getAllRoles();

    // Group roles by hierarchy level
    const hierarchy = roles.reduce((acc, role) => {
      const category = role.is_global
        ? 'Platform Roles'
        : role.is_external
          ? 'External Roles'
          : 'Organization Roles';

      if (!acc[category]) acc[category] = [];
      acc[category].push(role);
      return acc;
    }, {});

    res.json({
      roles,
      hierarchy,
      total: roles.length,
    });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ error: 'Failed to retrieve roles' });
  }
});

// Get role details with permissions breakdown
router.get('/roles/:roleId', async (req, res) => {
  try {
    const { roleId } = req.params;

    const result = await rbacService.pool.query(
      `
      SELECT 
        r.*,
        COUNT(ur.id) as active_users
      FROM roles r
      LEFT JOIN user_roles ur ON r.id = ur.role_id AND ur.is_active = true
      WHERE r.id = $1
      GROUP BY r.id
    `,
      [roleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    const role = result.rows[0];
    role.permissions = role.permissions || [];

    // Get permission breakdown by category
    const permissionCategories = {};
    role.permissions.forEach(perm => {
      const [resource, action] = perm.split(':');
      if (!permissionCategories[resource]) {
        permissionCategories[resource] = [];
      }
      permissionCategories[resource].push(action);
    });

    res.json({
      role: {
        ...role,
        permissions: role.permissions,
        permission_categories: permissionCategories,
      },
    });
  } catch (error) {
    console.error('Get role details error:', error);
    res.status(500).json({ error: 'Failed to retrieve role details' });
  }
});

// Assign role with advanced options
router.post('/assign', rbacService.requirePermission('users', 'update'), async (req, res) => {
  try {
    const { userId, roleName, expiresAt, scope, conditions, delegationLevel, reason } = req.body;

    if (!userId || !roleName) {
      return res.status(400).json({ error: 'userId and roleName are required' });
    }

    const options = {
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      scope,
      conditions,
      delegationLevel: delegationLevel || 0,
    };

    const result = await rbacService.assignRole(
      userId,
      roleName,
      req.tenantId,
      req.userId,
      options
    );

    await auditService.logAction({
      tenantId: req.tenantId,
      userId: req.userId,
      action: auditService.constructor.ACTIONS.USER_UPDATED,
      resourceType: auditService.constructor.RESOURCE_TYPES.USER,
      resourceId: userId.toString(),
      details: {
        action: 'role_assigned',
        roleName,
        expiresAt,
        scope,
        conditions,
        reason: reason || 'Role assignment',
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({
      success: true,
      result,
      message: `Role '${roleName}' assigned successfully`,
    });
  } catch (error) {
    console.error('Role assignment error:', error);
    res.status(500).json({
      error: 'Failed to assign role',
      details: error.message,
    });
  }
});

// Bulk role assignment
router.post('/assign-bulk', rbacService.requirePermission('users', 'update'), async (req, res) => {
  try {
    const { assignments } = req.body; // Array of {userId, roleName, options}

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ error: 'assignments array is required' });
    }

    const results = [];
    const errors = [];

    for (const assignment of assignments) {
      try {
        const { userId, roleName, ...options } = assignment;
        const result = await rbacService.assignRole(
          userId,
          roleName,
          req.tenantId,
          req.userId,
          options
        );

        results.push({ userId, roleName, success: true, result });

        await auditService.logAction({
          tenantId: req.tenantId,
          userId: req.userId,
          action: 'role.bulk_assigned',
          resourceType: auditService.constructor.RESOURCE_TYPES.USER,
          resourceId: userId.toString(),
          details: { roleName, bulk_assignment: true },
        });
      } catch (error) {
        errors.push({
          userId: assignment.userId,
          roleName: assignment.roleName,
          error: error.message,
        });
      }
    }

    res.json({
      success: true,
      results,
      errors,
      total_processed: assignments.length,
      successful: results.length,
      failed: errors.length,
    });
  } catch (error) {
    console.error('Bulk role assignment error:', error);
    res.status(500).json({ error: 'Bulk assignment failed' });
  }
});

// Revoke role
router.post('/revoke', rbacService.requirePermission('users', 'update'), async (req, res) => {
  try {
    const { userId, roleName, reason } = req.body;

    if (!userId || !roleName) {
      return res.status(400).json({ error: 'userId and roleName are required' });
    }

    const success = await rbacService.revokeRole(userId, roleName, req.tenantId);

    if (success) {
      await auditService.logAction({
        tenantId: req.tenantId,
        userId: req.userId,
        action: 'role.revoked',
        resourceType: auditService.constructor.RESOURCE_TYPES.USER,
        resourceId: userId.toString(),
        details: {
          roleName,
          reason: reason || 'Role revocation',
        },
      });
    }

    res.json({
      success,
      message: success
        ? `Role '${roleName}' revoked successfully`
        : 'Role not found or already inactive',
    });
  } catch (error) {
    console.error('Role revocation error:', error);
    res.status(500).json({ error: 'Failed to revoke role' });
  }
});

// Get user roles with detailed information
router.get(
  '/user/:userId/roles',
  rbacService.requirePermission('users', 'read'),
  async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const roles = await rbacService.getUserRoles(userId, req.tenantId);
      const permissions = await rbacService.getUserPermissions(userId, req.tenantId);

      // Calculate effective permissions
      const permissionMap = {};
      permissions.forEach(perm => {
        const [resource, action] = perm.split(':');
        if (!permissionMap[resource]) permissionMap[resource] = [];
        permissionMap[resource].push(action);
      });

      res.json({
        userId,
        roles,
        permissions,
        effective_permissions: permissionMap,
        total_roles: roles.length,
        total_permissions: permissions.length,
      });
    } catch (error) {
      console.error('Get user roles error:', error);
      res.status(500).json({ error: 'Failed to get user roles' });
    }
  }
);

// Create custom role
router.post(
  '/roles/custom',
  rbacService.requirePermission('organization', 'manage'),
  async (req, res) => {
    try {
      const roleData = req.body;

      const result = await rbacService.createCustomRole(roleData, req.userId, req.tenantId);

      await auditService.logAction({
        tenantId: req.tenantId,
        userId: req.userId,
        action: 'role.created',
        resourceType: 'role',
        resourceId: result.id.toString(),
        details: {
          roleName: result.name,
          permissions: roleData.permissions,
        },
      });

      res.json({
        success: true,
        role: result,
        message: 'Custom role created successfully',
      });
    } catch (error) {
      console.error('Create custom role error:', error);
      res.status(500).json({
        error: 'Failed to create custom role',
        details: error.message,
      });
    }
  }
);

// Get role assignment history
router.get('/history/:userId', rbacService.requirePermission('audit', 'read'), async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    const history = await auditService.getAuditTrail(req.tenantId, {
      resourceType: 'user',
      resourceId: userId.toString(),
      action: ['role.assigned', 'role.revoked', 'role.updated'],
    });

    res.json({
      userId,
      history,
      total: history.length,
    });
  } catch (error) {
    console.error('Get role history error:', error);
    res.status(500).json({ error: 'Failed to get role history' });
  }
});

// Permission check endpoint
router.post('/check-permission', async (req, res) => {
  try {
    const { userId, resource, action } = req.body;

    if (!userId || !resource || !action) {
      return res.status(400).json({
        error: 'userId, resource, and action are required',
      });
    }

    const hasPermission = await rbacService.hasPermission(userId, req.tenantId, resource, action);

    res.json({
      userId,
      resource,
      action,
      hasPermission,
      tenantId: req.tenantId,
    });
  } catch (error) {
    console.error('Permission check error:', error);
    res.status(500).json({ error: 'Permission check failed' });
  }
});

// Get organization role statistics
router.get('/stats', rbacService.requirePermission('audit', 'read'), async (req, res) => {
  try {
    const stats = await rbacService.pool.query(
      `
      SELECT 
        r.name as role_name,
        r.level,
        r.color_code,
        COUNT(ur.id) as user_count,
        COUNT(CASE WHEN ur.expires_at IS NOT NULL AND ur.expires_at > NOW() THEN 1 END) as temporary_assignments
      FROM roles r
      LEFT JOIN user_roles ur ON r.id = ur.role_id 
        AND ur.tenant_id = $1 
        AND ur.is_active = true
      GROUP BY r.id, r.name, r.level, r.color_code
      ORDER BY r.level ASC
    `,
      [req.tenantId]
    );

    const totalUsers = await rbacService.pool.query(
      `
      SELECT COUNT(DISTINCT user_id) as total
      FROM user_roles 
      WHERE tenant_id = $1 AND is_active = true
    `,
      [req.tenantId]
    );

    res.json({
      role_distribution: stats.rows,
      total_users: totalUsers.rows[0].total,
      organization_id: req.tenantId,
    });
  } catch (error) {
    console.error('Get RBAC stats error:', error);
    res.status(500).json({ error: 'Failed to get RBAC statistics' });
  }
});

export default router;
