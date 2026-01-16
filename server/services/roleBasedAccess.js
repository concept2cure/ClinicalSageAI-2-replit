import { Pool } from 'pg';

class RoleBasedAccessService {
  constructor() {
    this.enabled = Boolean(process.env.DATABASE_URL);
    this.pool = this.enabled
      ? new Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        })
      : null;

    if (!this.enabled) {
      console.log('ℹ️ RBAC disabled (no DATABASE_URL)');
      return;
    }

    this.initializeTables();
  }

  async initializeTables() {
    if (!this.pool) return;
    try {
      // Create roles table with enhanced structure
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS roles (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) UNIQUE NOT NULL,
          description TEXT,
          permissions JSONB DEFAULT '{}',
          is_system_role BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Add new columns if they don't exist
      try {
        await this.pool.query(`
          ALTER TABLE roles 
          ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 10,
          ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT false,
          ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT false,
          ADD COLUMN IF NOT EXISTS color_code VARCHAR(7) DEFAULT '#6B7280',
          ADD COLUMN IF NOT EXISTS icon VARCHAR(50);
        `);
      } catch (error) {
        console.log('Columns already exist or migration not needed:', error.message);
      }

      // Create user_roles table with enhanced structure
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS user_roles (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          role_id INTEGER NOT NULL REFERENCES roles(id),
          tenant_id INTEGER NOT NULL,
          assigned_by INTEGER,
          assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP,
          is_active BOOLEAN DEFAULT true,
          UNIQUE(user_id, role_id, tenant_id)
        );
      `);

      // Add new columns if they don't exist
      try {
        await this.pool.query(`
          ALTER TABLE user_roles 
          ADD COLUMN IF NOT EXISTS scope JSONB DEFAULT '{}',
          ADD COLUMN IF NOT EXISTS conditions JSONB DEFAULT '{}',
          ADD COLUMN IF NOT EXISTS delegation_level INTEGER DEFAULT 0;
        `);
      } catch (error) {
        console.log('Columns already exist or migration not needed:', error.message);
      }

      // Create permissions table for granular control
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS permissions (
          id SERIAL PRIMARY KEY,
          resource VARCHAR(100) NOT NULL,
          action VARCHAR(100) NOT NULL,
          description TEXT,
          is_system_permission BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(resource, action)
        );
      `);

      // Create indexes
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_roles_user_tenant ON user_roles(user_id, tenant_id);
        CREATE INDEX IF NOT EXISTS idx_user_roles_active ON user_roles(is_active, expires_at);
      `);

      // Insert default roles and permissions
      await this.seedDefaultRolesAndPermissions();

      console.log('✅ Role-based access control tables initialized');
    } catch (error) {
      console.error('❌ Failed to initialize RBAC tables:', error);
    }
  }

  async seedDefaultRolesAndPermissions() {
    if (!this.pool) return;
    try {
      // Insert default permissions
      const defaultPermissions = [
        // Document permissions
        { resource: 'documents', action: 'create', description: 'Create new documents' },
        { resource: 'documents', action: 'read', description: 'View documents' },
        { resource: 'documents', action: 'update', description: 'Edit documents' },
        { resource: 'documents', action: 'delete', description: 'Delete documents' },
        { resource: 'documents', action: 'export', description: 'Export documents' },
        { resource: 'documents', action: 'share', description: 'Share documents' },
        { resource: 'documents', action: 'review', description: 'Review documents' },
        { resource: 'documents', action: 'approve', description: 'Approve documents' },
        { resource: 'documents', action: 'publish', description: 'Publish documents' },

        // Regulatory permissions
        { resource: 'regulatory', action: 'analyze', description: 'Run regulatory analysis' },
        { resource: 'regulatory', action: 'enhance', description: 'Enhance regulatory content' },
        { resource: 'regulatory', action: 'approve', description: 'Approve regulatory content' },
        { resource: 'regulatory', action: 'submit', description: 'Submit regulatory documents' },
        {
          resource: 'regulatory',
          action: 'validate',
          description: 'Validate regulatory compliance',
        },

        // Medical writing permissions
        { resource: 'medical', action: 'create', description: 'Create medical documents' },
        { resource: 'medical', action: 'review', description: 'Review medical content' },
        { resource: 'medical', action: 'approve', description: 'Approve medical documents' },

        // Clinical permissions
        { resource: 'clinical', action: 'create', description: 'Create clinical documents' },
        { resource: 'clinical', action: 'analyze', description: 'Analyze clinical data' },
        { resource: 'clinical', action: 'report', description: 'Generate clinical reports' },

        // Quality permissions
        { resource: 'quality', action: 'review', description: 'Quality review documents' },
        { resource: 'quality', action: 'audit', description: 'Conduct quality audits' },
        { resource: 'quality', action: 'approve', description: 'Quality approval' },

        // User management permissions
        { resource: 'users', action: 'create', description: 'Create new users' },
        { resource: 'users', action: 'read', description: 'View user information' },
        { resource: 'users', action: 'update', description: 'Edit user information' },
        { resource: 'users', action: 'delete', description: 'Delete users' },
        { resource: 'users', action: 'invite', description: 'Invite new users' },
        { resource: 'users', action: 'suspend', description: 'Suspend user accounts' },

        // Organization permissions
        { resource: 'organization', action: 'read', description: 'View organization settings' },
        { resource: 'organization', action: 'update', description: 'Update organization settings' },
        { resource: 'organization', action: 'manage', description: 'Full organization management' },
        { resource: 'organization', action: 'billing', description: 'Access billing information' },

        // Project permissions
        { resource: 'projects', action: 'create', description: 'Create new projects' },
        { resource: 'projects', action: 'read', description: 'View projects' },
        { resource: 'projects', action: 'update', description: 'Edit projects' },
        { resource: 'projects', action: 'delete', description: 'Delete projects' },
        { resource: 'projects', action: 'manage', description: 'Full project management' },

        // Template permissions
        { resource: 'templates', action: 'create', description: 'Create new templates' },
        { resource: 'templates', action: 'read', description: 'View templates' },
        { resource: 'templates', action: 'update', description: 'Edit templates' },
        { resource: 'templates', action: 'delete', description: 'Delete templates' },
        { resource: 'templates', action: 'use', description: 'Use templates' },

        // Audit permissions
        { resource: 'audit', action: 'read', description: 'View audit logs' },
        { resource: 'audit', action: 'export', description: 'Export audit logs' },
        { resource: 'audit', action: 'analyze', description: 'Analyze audit data' },

        // Compliance permissions
        { resource: 'compliance', action: 'read', description: 'View compliance data' },
        { resource: 'compliance', action: 'audit', description: 'Conduct compliance audits' },
        { resource: 'compliance', action: 'report', description: 'Generate compliance reports' },

        // Analytics permissions
        { resource: 'analytics', action: 'read', description: 'View analytics' },
        { resource: 'analytics', action: 'export', description: 'Export analytics data' },
        { resource: 'analytics', action: 'configure', description: 'Configure analytics' },

        // Billing permissions
        { resource: 'billing', action: 'read', description: 'View billing information' },
        { resource: 'billing', action: 'manage', description: 'Manage billing and subscriptions' },

        // System permissions
        { resource: 'system', action: 'admin', description: 'System administration' },
        { resource: 'system', action: 'configure', description: 'System configuration' },
        { resource: 'system', action: 'monitor', description: 'System monitoring' },

        // Organizations management (for platform admins)
        { resource: 'organizations', action: 'create', description: 'Create organizations' },
        { resource: 'organizations', action: 'read', description: 'View organizations' },
        { resource: 'organizations', action: 'update', description: 'Update organizations' },
        { resource: 'organizations', action: 'delete', description: 'Delete organizations' },
      ];

      for (const perm of defaultPermissions) {
        await this.pool.query(
          `
          INSERT INTO permissions (resource, action, description, is_system_permission)
          VALUES ($1, $2, $3, true)
          ON CONFLICT (resource, action) DO NOTHING
        `,
          [perm.resource, perm.action, perm.description]
        );
      }

      // Insert default roles with enhanced enterprise hierarchy
      const defaultRoles = [
        {
          name: 'Super Admin',
          description: 'Full system access across all organizations',
          permissions: ['*:*'], // All permissions
          level: 1,
          is_global: true,
        },
        {
          name: 'Platform Admin',
          description: 'Cross-organizational platform management',
          permissions: [
            'system:*',
            'organizations:*',
            'users:*',
            'audit:*',
            'analytics:*',
            'billing:*',
            'compliance:*',
          ],
          level: 2,
          is_global: true,
        },
        {
          name: 'Organization Owner',
          description: 'Full organizational control and billing access',
          permissions: [
            'documents:*',
            'users:*',
            'organization:*',
            'regulatory:*',
            'audit:*',
            'billing:*',
            'projects:*',
            'templates:*',
          ],
          level: 3,
          is_global: false,
        },
        {
          name: 'Organization Admin',
          description: 'Organization-level administration without billing',
          permissions: [
            'documents:*',
            'users:create',
            'users:read',
            'users:update',
            'organization:read',
            'organization:update',
            'regulatory:*',
            'audit:read',
            'projects:*',
            'templates:*',
          ],
          level: 4,
          is_global: false,
        },
        {
          name: 'Compliance Officer',
          description: 'Regulatory compliance oversight and audit access',
          permissions: [
            'documents:read',
            'documents:approve',
            'regulatory:*',
            'audit:*',
            'compliance:*',
            'users:read',
            'projects:read',
          ],
          level: 5,
          is_global: false,
        },
        {
          name: 'Regulatory Manager',
          description: 'Regulatory document management and team oversight',
          permissions: [
            'documents:*',
            'regulatory:*',
            'users:read',
            'audit:read',
            'projects:*',
            'templates:read',
            'templates:use',
          ],
          level: 6,
          is_global: false,
        },
        {
          name: 'Senior Regulatory Writer',
          description: 'Advanced regulatory writing with template creation',
          permissions: [
            'documents:create',
            'documents:read',
            'documents:update',
            'documents:delete',
            'documents:export',
            'documents:share',
            'regulatory:analyze',
            'regulatory:enhance',
            'templates:create',
            'templates:update',
            'projects:read',
            'projects:update',
          ],
          level: 7,
          is_global: false,
        },
        {
          name: 'Regulatory Writer',
          description: 'Create and edit regulatory documents',
          permissions: [
            'documents:create',
            'documents:read',
            'documents:update',
            'documents:export',
            'documents:share',
            'regulatory:analyze',
            'templates:read',
            'templates:use',
            'projects:read',
          ],
          level: 8,
          is_global: false,
        },
        {
          name: 'Medical Writer',
          description: 'Medical and clinical documentation specialist',
          permissions: [
            'documents:create',
            'documents:read',
            'documents:update',
            'documents:export',
            'medical:*',
            'clinical:*',
            'templates:read',
            'templates:use',
          ],
          level: 9,
          is_global: false,
        },
        {
          name: 'Quality Reviewer',
          description: 'Quality assurance and document review',
          permissions: [
            'documents:read',
            'documents:review',
            'documents:approve',
            'documents:export',
            'regulatory:analyze',
            'quality:*',
            'audit:read',
          ],
          level: 10,
          is_global: false,
        },
        {
          name: 'External Reviewer',
          description: 'External consultant with limited review access',
          permissions: ['documents:read', 'documents:review', 'documents:export'],
          level: 11,
          is_global: false,
          is_external: true,
        },
        {
          name: 'Viewer',
          description: 'Read-only access to assigned documents',
          permissions: ['documents:read'],
          level: 12,
          is_global: false,
        },
      ];

      for (const role of defaultRoles) {
        const colorCodes = {
          'Super Admin': '#DC2626',
          'Platform Admin': '#7C2D12',
          'Organization Owner': '#1D4ED8',
          'Organization Admin': '#2563EB',
          'Compliance Officer': '#059669',
          'Regulatory Manager': '#7C3AED',
          'Senior Regulatory Writer': '#C2410C',
          'Regulatory Writer': '#EA580C',
          'Medical Writer': '#0891B2',
          'Quality Reviewer': '#65A30D',
          'External Reviewer': '#6B7280',
          Viewer: '#9CA3AF',
        };

        const icons = {
          'Super Admin': 'crown',
          'Platform Admin': 'settings',
          'Organization Owner': 'building',
          'Organization Admin': 'users',
          'Compliance Officer': 'shield-check',
          'Regulatory Manager': 'clipboard-list',
          'Senior Regulatory Writer': 'edit-3',
          'Regulatory Writer': 'edit',
          'Medical Writer': 'stethoscope',
          'Quality Reviewer': 'check-circle',
          'External Reviewer': 'external-link',
          Viewer: 'eye',
        };

        await this.pool.query(
          `
          INSERT INTO roles (name, description, permissions, level, is_system_role, is_global, is_external, color_code, icon)
          VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8)
          ON CONFLICT (name) DO UPDATE SET 
            description = EXCLUDED.description,
            permissions = EXCLUDED.permissions,
            level = EXCLUDED.level,
            is_global = EXCLUDED.is_global,
            is_external = EXCLUDED.is_external,
            color_code = EXCLUDED.color_code,
            icon = EXCLUDED.icon
        `,
          [
            role.name,
            role.description,
            JSON.stringify(role.permissions),
            role.level,
            role.is_global || false,
            role.is_external || false,
            colorCodes[role.name] || '#6B7280',
            icons[role.name] || 'user',
          ]
        );
      }
    } catch (error) {
      console.error('Failed to seed default roles:', error);
    }
  }

  async assignRole(userId, roleName, tenantId, assignedBy = null, options = {}) {
    try {
      const { expiresAt, scope, conditions, delegationLevel } = options;

      const roleResult = await this.pool.query(
        'SELECT id, level, is_global FROM roles WHERE name = $1',
        [roleName]
      );

      if (roleResult.rows.length === 0) {
        throw new Error(`Role '${roleName}' not found`);
      }

      const role = roleResult.rows[0];

      // Check if assignedBy has permission to assign this role
      if (assignedBy) {
        const canAssign = await this.canAssignRole(assignedBy, tenantId, role.level);
        if (!canAssign) {
          throw new Error('Insufficient permissions to assign this role');
        }
      }

      const result = await this.pool.query(
        `
        INSERT INTO user_roles (
          user_id, role_id, tenant_id, assigned_by, expires_at, 
          scope, conditions, delegation_level
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (user_id, role_id, tenant_id) 
        DO UPDATE SET 
          assigned_by = EXCLUDED.assigned_by,
          assigned_at = CURRENT_TIMESTAMP,
          expires_at = EXCLUDED.expires_at,
          scope = EXCLUDED.scope,
          conditions = EXCLUDED.conditions,
          delegation_level = EXCLUDED.delegation_level,
          is_active = true
        RETURNING id
      `,
        [
          userId,
          role.id,
          tenantId,
          assignedBy,
          expiresAt,
          JSON.stringify(scope || {}),
          JSON.stringify(conditions || {}),
          delegationLevel || 0,
        ]
      );

      return result.rows[0];
    } catch (error) {
      console.error('Failed to assign role:', error);
      throw error;
    }
  }

  async canAssignRole(assignerId, tenantId, targetRoleLevel) {
    try {
      const assignerRoles = await this.pool.query(
        `
        SELECT r.level, r.is_global
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = $1 
          AND ur.tenant_id = $2 
          AND ur.is_active = true
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        ORDER BY r.level ASC
        LIMIT 1
      `,
        [assignerId, tenantId]
      );

      if (assignerRoles.rows.length === 0) return false;

      const assignerRole = assignerRoles.rows[0];

      // Can only assign roles with higher level numbers (lower authority)
      return assignerRole.level < targetRoleLevel;
    } catch (error) {
      console.error('Failed to check role assignment permission:', error);
      return false;
    }
  }

  async getUserPermissions(userId, tenantId) {
    try {
      const result = await this.pool.query(
        `
        SELECT DISTINCT r.permissions
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = $1 
          AND ur.tenant_id = $2 
          AND ur.is_active = true
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      `,
        [userId, tenantId]
      );

      const allPermissions = new Set();

      for (const row of result.rows) {
        const permissions = row.permissions || [];
        permissions.forEach(perm => allPermissions.add(perm));
      }

      return Array.from(allPermissions);
    } catch (error) {
      console.error('Failed to get user permissions:', error);
      throw error;
    }
  }

  async hasPermission(userId, tenantId, resource, action) {
    try {
      const permissions = await this.getUserPermissions(userId, tenantId);

      // Check for wildcard permissions
      if (permissions.includes('*:*')) return true;
      if (permissions.includes(`${resource}:*`)) return true;
      if (permissions.includes(`*:${action}`)) return true;
      if (permissions.includes(`${resource}:${action}`)) return true;

      return false;
    } catch (error) {
      console.error('Permission check failed:', error);
      return false;
    }
  }

  async getUserRoles(userId, tenantId) {
    try {
      const result = await this.pool.query(
        `
        SELECT 
          r.id, r.name, r.description, r.level, r.color_code, r.icon,
          r.is_global, r.is_external, ur.assigned_at, ur.expires_at,
          ur.scope, ur.conditions, ur.delegation_level
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = $1 
          AND ur.tenant_id = $2 
          AND ur.is_active = true
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        ORDER BY r.level ASC
      `,
        [userId, tenantId]
      );

      return result.rows.map(row => ({
        ...row,
        scope: row.scope || {},
        conditions: row.conditions || {},
      }));
    } catch (error) {
      console.error('Failed to get user roles:', error);
      throw error;
    }
  }

  async getAllRoles() {
    try {
      const result = await this.pool.query(`
        SELECT 
          id, name, description, level, color_code, icon,
          is_global, is_external, permissions
        FROM roles
        ORDER BY level ASC
      `);

      return result.rows.map(row => ({
        ...row,
        permissions: row.permissions || [],
      }));
    } catch (error) {
      console.error('Failed to get all roles:', error);
      throw error;
    }
  }

  async createCustomRole(roleData, createdBy, tenantId) {
    try {
      const { name, description, permissions, level, scope } = roleData;

      // Validate that creator can create roles at this level
      const canCreate = await this.canAssignRole(createdBy, tenantId, level);
      if (!canCreate) {
        throw new Error('Insufficient permissions to create role at this level');
      }

      const result = await this.pool.query(
        `
        INSERT INTO roles (
          name, description, permissions, level, is_system_role,
          color_code, icon
        ) VALUES ($1, $2, $3, $4, false, $5, $6)
        RETURNING id, name, description, level
      `,
        [
          name,
          description,
          JSON.stringify(permissions),
          level,
          '#4F46E5', // Default purple for custom roles
          'users',
        ]
      );

      return result.rows[0];
    } catch (error) {
      console.error('Failed to create custom role:', error);
      throw error;
    }
  }

  async revokeRole(userId, roleName, tenantId) {
    try {
      const result = await this.pool.query(
        `
        UPDATE user_roles 
        SET is_active = false 
        WHERE user_id = $1 
          AND role_id = (SELECT id FROM roles WHERE name = $2)
          AND tenant_id = $3
        RETURNING id
      `,
        [userId, roleName, tenantId]
      );

      return result.rows.length > 0;
    } catch (error) {
      console.error('Failed to revoke role:', error);
      throw error;
    }
  }

  // Middleware function for Express routes
  requirePermission(resource, action) {
    return async (req, res, next) => {
      try {
        const userId = req.user?.id;
        const tenantId = req.tenant?.id || req.headers['x-tenant-id'];

        if (!userId || !tenantId) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const hasAccess = await this.hasPermission(userId, tenantId, resource, action);

        if (!hasAccess) {
          return res.status(403).json({
            error: 'Insufficient permissions',
            required: `${resource}:${action}`,
          });
        }

        next();
      } catch (error) {
        console.error('Permission middleware error:', error);
        res.status(500).json({ error: 'Permission check failed' });
      }
    };
  }

  // Resource and action constants
  static RESOURCES = {
    DOCUMENTS: 'documents',
    REGULATORY: 'regulatory',
    USERS: 'users',
    ORGANIZATION: 'organization',
    AUDIT: 'audit',
    SYSTEM: 'system',
  };

  static ACTIONS = {
    CREATE: 'create',
    READ: 'read',
    UPDATE: 'update',
    DELETE: 'delete',
    EXPORT: 'export',
    SHARE: 'share',
    ANALYZE: 'analyze',
    APPROVE: 'approve',
    SUBMIT: 'submit',
    MANAGE: 'manage',
    BILLING: 'billing',
    ADMIN: 'admin',
  };
}

export default new RoleBasedAccessService();
