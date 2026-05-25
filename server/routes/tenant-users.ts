import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('tenant-users');

const router = Router();

// Schema for user creation
const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  role: z.enum(['admin', 'manager', 'member', 'viewer']),
  title: z.string().optional(),
  department: z.string().optional(),
  organizationId: z
    .union([z.string(), z.number()])
    .transform(val => {
      return typeof val === 'string' ? parseInt(val, 10) : val;
    })
    .pipe(z.number().int().positive())
    .optional(), // Accept string or number, convert to number
});

// Schema for user role update
const updateUserRoleSchema = z.object({
  role: z.enum(['admin', 'manager', 'member', 'viewer']),
});

/**
 * GET /api/tenant-users/:tenantId
 * Get users for a specific tenant
 */
router.get('/:tenantId', async (req, res) => {
  try {
    if (!pool) {
      log.error('Database pool not available');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const tenantId = parseInt(req.params.tenantId);
    if (isNaN(tenantId)) {
      return res.status(400).json({ error: 'Invalid tenant ID' });
    }

    // Get users for this organization with their roles
    const query = `
      SELECT
        u.id,
        u.email,
        u.name,
        u.title,
        u.department,
        u.avatar,
        u.status,
        u.last_login as "lastLogin",
        u.created_at as "createdAt",
        ou.role,
        ou.created_at as "joinedAt"
      FROM users u
      INNER JOIN organization_users ou ON u.id = ou.user_id
      WHERE ou.organization_id = $1
      ORDER BY u.name ASC
    `;

    const result = await pool.query(query, [tenantId]);
    log.debug(`Retrieved ${result.rows.length} users for organization ${tenantId}`);
    res.json(result.rows);
  } catch (error) {
    log.error('Error retrieving tenant users', error);
    res.status(500).json({ error: 'Failed to retrieve tenant users' });
  }
});

/**
 * POST /api/tenant-users
 * Create a new user and add them to an organization
 */
router.post('/', async (req, res) => {
  try {
    if (!pool) {
      log.error('Database pool not available');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    log.debug('Create user request received');

    // Parse and validate the request body
    const validatedData = createUserSchema.parse(req.body);

    // Get organization ID from the validated data (already converted to number)
    const organizationId = validatedData.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    // Use atomic user creation with quota enforcement
    // atomicQuotaService is an untyped JS module; the global '*.js' shim only
    // surfaces a default export, so read the named function off the namespace.
    const atomicQuotaService = (await import(
      '../services/atomicQuotaService.js'
    )) as unknown as {
      atomicCreateUser: (
        organizationId: number,
        userData: Record<string, unknown>,
      ) => Promise<{
        success: boolean;
        error?: string;
        message?: string;
        details?: unknown;
        data?: unknown;
        quotaInfo?: unknown;
      }>;
    };
    const result = await atomicQuotaService.atomicCreateUser(organizationId, {
      email: validatedData.email,
      name: validatedData.name,
      role: validatedData.role,
      title: validatedData.title,
      department: validatedData.department,
    });

    if (!result.success) {
      if (result.error === 'QUOTA_EXCEEDED') {
        return res.status(403).json({
          success: false,
          error: 'Quota exceeded',
          message: result.message,
          details: result.details,
        });
      }
      if (result.error === 'USER_EXISTS') {
        return res.status(400).json({
          success: false,
          error: result.error,
          message: result.message,
        });
      }
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
      });
    }

    log.debug('Created user atomically:', result.data);
    log.debug('Quota info:', result.quotaInfo);

    // Return the created user with quota info
    res.status(201).json({
      ...result.data,
      quotaInfo: result.quotaInfo,
    });
  } catch (error) {
    log.error('Error creating user:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid user data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Original version of user creation (preserved for reference but NOT USED)
router.post('/legacy', async (req, res) => {
  try {
    if (!pool) {
      log.error('Database pool not available');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    log.debug('Create legacy user request received');

    // Parse and validate the request body
    const validatedData = createUserSchema.parse(req.body);

    // Get organization ID from the validated data (already converted to number)
    const organizationId = validatedData.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    // Check if user already exists
    const existingUserQuery = 'SELECT id FROM users WHERE email = $1';
    const existingUserResult = await pool.query(existingUserQuery, [validatedData.email]);

    let userId;

    if (existingUserResult.rows.length > 0) {
      // User exists, check if they're already in this organization
      userId = existingUserResult.rows[0].id;

      const existingOrgUserQuery =
        'SELECT id FROM organization_users WHERE user_id = $1 AND organization_id = $2';
      const existingOrgUserResult = await pool.query(existingOrgUserQuery, [
        userId,
        organizationId,
      ]);

      if (existingOrgUserResult.rows.length > 0) {
        return res.status(400).json({ error: 'User is already a member of this organization' });
      }

      // Update existing user's title and department if provided
      if (validatedData.title || validatedData.department) {
        const updateUserQuery = `
          UPDATE users
          SET title = $1, department = $2, updated_at = NOW()
          WHERE id = $3
        `;
        await pool.query(updateUserQuery, [
          validatedData.title || null,
          validatedData.department || null,
          userId,
        ]);
        log.debug(
          `Updated existing user ${userId} with title: ${validatedData.title}, department: ${validatedData.department}`
        );
      }
    } else {
      // Create new user
      const createUserQuery = `
        INSERT INTO users (email, name, title, department, password_hash, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING id
      `;

      // Generate a temporary password hash (in real app, this would be handled differently)
      const tempPasswordHash = 'temp_' + Math.random().toString(36).substring(2, 15);

      const createUserResult = await pool.query(createUserQuery, [
        validatedData.email,
        validatedData.name,
        validatedData.title || null,
        validatedData.department || null,
        tempPasswordHash,
        'active',
      ]);

      userId = createUserResult.rows[0].id;
    }

    // Add user to organization
    const addToOrgQuery = `
      INSERT INTO organization_users (organization_id, user_id, role, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING *
    `;

    await pool.query(addToOrgQuery, [organizationId, userId, validatedData.role]);

    // Get the full user data to return
    const getUserQuery = `
      SELECT
        u.id,
        u.email,
        u.name,
        u.title,
        u.department,
        u.avatar,
        u.status,
        u.last_login as "lastLogin",
        u.created_at as "createdAt",
        ou.role,
        ou.created_at as "joinedAt"
      FROM users u
      INNER JOIN organization_users ou ON u.id = ou.user_id
      WHERE u.id = $1 AND ou.organization_id = $2
    `;

    const userResult = await pool.query(getUserQuery, [userId, organizationId]);
    const newUser = userResult.rows[0];

    log.debug('Created user in organization:', newUser);
    res.status(201).json(newUser);
  } catch (error) {
    log.error('Error creating user:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid user data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

/**
 * PATCH /api/tenant-users/:organizationId/:userId
 * Update user role in organization
 */
router.patch('/:organizationId/:userId', async (req, res) => {
  try {
    if (!pool) {
      log.error('Database pool not available');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const organizationId = parseInt(req.params.organizationId);
    const userId = parseInt(req.params.userId);

    if (isNaN(organizationId) || isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid organization ID or user ID' });
    }

    const validatedData = updateUserRoleSchema.parse(req.body);

    const updateQuery = `
      UPDATE organization_users
      SET role = $1, updated_at = NOW()
      WHERE organization_id = $2 AND user_id = $3
      RETURNING *
    `;

    const result = await pool.query(updateQuery, [validatedData.role, organizationId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found in organization' });
    }

    log.debug('Updated user role:', result.rows[0]);
    res.json({ message: 'User role updated successfully' });
  } catch (error) {
    log.error('Error updating user role:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid role data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

/**
 * DELETE /api/tenant-users/:organizationId/:userId
 * Remove user from organization
 */
router.delete('/:organizationId/:userId', async (req, res) => {
  try {
    if (!pool) {
      log.error('Database pool not available');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const organizationId = parseInt(req.params.organizationId);
    const userId = parseInt(req.params.userId);

    if (isNaN(organizationId) || isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid organization ID or user ID' });
    }

    const deleteQuery = `
      DELETE FROM organization_users
      WHERE organization_id = $1 AND user_id = $2
      RETURNING *
    `;

    const result = await pool.query(deleteQuery, [organizationId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found in organization' });
    }

    log.debug('Removed user from organization:', result.rows[0]);
    res.json({ message: 'User removed from organization successfully' });
  } catch (error) {
    log.error('Error removing user from organization:', error);
    res.status(500).json({ error: 'Failed to remove user from organization' });
  }
});

export default router;
