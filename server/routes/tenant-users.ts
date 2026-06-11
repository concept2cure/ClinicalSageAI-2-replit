import { Router } from 'express';
import { randomUUID } from 'crypto';
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
 * Authorize the caller against the *target* organization (the org named in the
 * route/body), not just their own JWT org. Previously these handlers trusted
 * organizationId from the request body/params, so any authenticated user could
 * list, create, re-role, or remove users in any organization. A platform
 * super_admin is allowed anywhere; otherwise the caller must belong to the
 * target org (membership for reads, admin/owner for mutations).
 */
async function authorizeOrgAccess(
  req: any,
  res: any,
  targetOrgId: number,
  opts: { requireAdmin: boolean }
): Promise<boolean> {
  const callerId = Number(req.user?.id ?? req.userId);
  const callerRole = req.userRole ?? req.user?.role;
  if (!callerId || Number.isNaN(callerId)) {
    res.status(401).json({ error: 'Authentication required' });
    return false;
  }
  if (callerRole === 'super_admin') return true;
  const membership = await pool.query(
    'SELECT role FROM organization_users WHERE user_id = $1 AND organization_id = $2 LIMIT 1',
    [callerId, targetOrgId]
  );
  const role = membership.rows[0]?.role;
  if (!role) {
    res.status(403).json({ error: 'You do not have access to this organization' });
    return false;
  }
  if (opts.requireAdmin && role !== 'admin' && role !== 'owner') {
    res.status(403).json({ error: 'Admin of the target organization required' });
    return false;
  }
  return true;
}

/** Resolve the authenticated user's id from the request (set upstream). */
function getCallerId(req: any): number | null {
  const callerId = Number(req.user?.id ?? req.userId);
  return callerId && !Number.isNaN(callerId) ? callerId : null;
}

/**
 * GET /api/tenant-users/invitations/mine
 * List the session user's PENDING cross-org invitations (decision-register
 * item 12, #727). Self-only by construction: scoped to the caller's user_id.
 *
 * NOTE: must be registered before GET /:tenantId so "invitations" is not
 * swallowed by the tenantId param route.
 */
router.get('/invitations/mine', async (req, res) => {
  try {
    if (!pool) {
      log.error('Database pool not available');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const callerId = getCallerId(req);
    if (!callerId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = await pool.query(
      `SELECT
         id,
         organization_id as "organizationId",
         email,
         role,
         status,
         invited_by_id as "invitedById",
         created_at as "createdAt"
       FROM organization_invitations
       WHERE user_id = $1 AND status = 'pending'
       ORDER BY created_at DESC`,
      [callerId]
    );

    res.json(result.rows);
  } catch (error) {
    log.error('Error retrieving pending invitations', error);
    res.status(500).json({ error: 'Failed to retrieve pending invitations' });
  }
});

/**
 * POST /api/tenant-users/invitations/:invitationId/accept
 * Accept a pending invitation. Self-only: the session user must BE the
 * invited user. Creates the organization_users membership atomically (with
 * quota re-check) and marks the invitation accepted.
 */
router.post('/invitations/:invitationId/accept', async (req, res) => {
  try {
    if (!pool) {
      log.error('Database pool not available');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const callerId = getCallerId(req);
    if (!callerId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const invitationId = parseInt(req.params.invitationId);
    if (isNaN(invitationId)) {
      return res.status(400).json({ error: 'Invalid invitation ID' });
    }

    const atomicQuotaService = (await import(
      '../services/atomicQuotaService.js'
    )) as unknown as {
      atomicAcceptInvitation: (
        invitationId: number,
        callerUserId: number,
      ) => Promise<{
        success: boolean;
        error?: string;
        message?: string;
        details?: unknown;
        data?: unknown;
      }>;
    };

    const result = await atomicQuotaService.atomicAcceptInvitation(invitationId, callerId);

    if (!result.success) {
      const statusByError: Record<string, number> = {
        NOT_FOUND: 404,
        FORBIDDEN: 403,
        NOT_PENDING: 409,
        QUOTA_EXCEEDED: 403,
        NO_LICENSE: 400,
      };
      return res.status(statusByError[result.error ?? ''] ?? 400).json({
        success: false,
        error: result.error,
        message: result.message,
        details: result.details,
      });
    }

    log.debug('Invitation accepted:', result.data);
    res.json({ success: true, message: 'Invitation accepted', data: result.data });
  } catch (error) {
    log.error('Error accepting invitation', error);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

/**
 * POST /api/tenant-users/invitations/:invitationId/decline
 * Decline a pending invitation. Self-only: the session user must BE the
 * invited user. No membership is created; the row is kept as an audit record.
 */
router.post('/invitations/:invitationId/decline', async (req, res) => {
  try {
    if (!pool) {
      log.error('Database pool not available');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const callerId = getCallerId(req);
    if (!callerId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const invitationId = parseInt(req.params.invitationId);
    if (isNaN(invitationId)) {
      return res.status(400).json({ error: 'Invalid invitation ID' });
    }

    const inviteResult = await pool.query(
      `SELECT id, organization_id, user_id, status
       FROM organization_invitations
       WHERE id = $1`,
      [invitationId]
    );

    if (inviteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    const invitation = inviteResult.rows[0];

    if (Number(invitation.user_id) !== callerId) {
      return res
        .status(403)
        .json({ error: 'Only the invited user may respond to this invitation' });
    }

    if (invitation.status !== 'pending') {
      return res.status(409).json({ error: `Invitation has already been ${invitation.status}` });
    }

    await pool.query(
      `UPDATE organization_invitations
       SET status = 'declined', responded_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND user_id = $3 AND status = 'pending'`,
      [invitationId, invitation.organization_id, callerId]
    );

    log.debug(`Invitation ${invitationId} declined by user ${callerId}`);
    res.json({ success: true, message: 'Invitation declined' });
  } catch (error) {
    log.error('Error declining invitation', error);
    res.status(500).json({ error: 'Failed to decline invitation' });
  }
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

    if (!(await authorizeOrgAccess(req, res, tenantId, { requireAdmin: false }))) return;

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

    if (!(await authorizeOrgAccess(req, res, organizationId, { requireAdmin: true }))) return;

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
        pendingInvitation?: boolean;
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
      invitedById: getCallerId(req),
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

    if (result.pendingInvitation) {
      // Existing user in another org: consent required — a pending invitation
      // was created instead of a membership (decision-register item 12, #727).
      log.debug('Cross-org invite resulted in pending invitation:', result.data);
      return res.status(202).json({
        success: true,
        pendingInvitation: true,
        message: result.message,
        data: result.data,
      });
    }

    log.debug('Created user atomically:', result.data);
    log.debug('Quota info:', result.quotaInfo);

    // Return the created user with quota info. result.data is typed unknown by
    // the dynamic-import shim, so narrow to an object before spreading.
    const createdUser =
      result.data && typeof result.data === 'object'
        ? (result.data as Record<string, unknown>)
        : {};
    res.status(201).json({
      ...createdUser,
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

    if (!(await authorizeOrgAccess(req, res, organizationId, { requireAdmin: true }))) return;

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

      // Existing user: do NOT overwrite their global profile. The inviter's
      // org has no authority over a user record that may belong to other
      // organizations — title/department from the invite form apply only when
      // the user is created here. (organization_users carries no per-org
      // profile fields today; add them there if org-specific titles are needed.)
      if (validatedData.title || validatedData.department) {
        log.debug(
          `Invite for existing user ${userId}: ignoring title/department from invite form (cross-org profile is not overwritten)`
        );
      }

      // Existing user in ANOTHER organization: membership requires the user's
      // consent, so create (or reuse) a PENDING invitation instead of adding
      // them to organization_users (decision-register item 12, #727).
      const existingInviteResult = await pool.query(
        `SELECT id FROM organization_invitations
         WHERE organization_id = $1 AND lower(email) = lower($2) AND status = 'pending'`,
        [organizationId, validatedData.email]
      );

      let invitationId;
      if (existingInviteResult.rows.length > 0) {
        invitationId = existingInviteResult.rows[0].id;
      } else {
        const inviteInsertResult = await pool.query(
          `INSERT INTO organization_invitations
             (organization_id, user_id, email, role, invited_by_id, status, created_at)
           VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [organizationId, userId, validatedData.email, validatedData.role, getCallerId(req)]
        );
        invitationId = inviteInsertResult.rows[0]?.id;
      }

      return res.status(202).json({
        success: true,
        pendingInvitation: true,
        message:
          'User already belongs to another organization. A pending invitation requiring their consent was created; membership will be added when they accept.',
        data: {
          invitationId,
          email: validatedData.email,
          role: validatedData.role,
          status: 'pending',
        },
      });
    } else {
      // Create new user
      const createUserQuery = `
        INSERT INTO users (email, name, title, department, password_hash, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING id
      `;

      // Unguessable sentinel — not a valid bcrypt hash, so it can never
      // authenticate; the user must complete password setup/reset.
      const tempPasswordHash = 'invited_' + randomUUID();

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

    if (!(await authorizeOrgAccess(req, res, organizationId, { requireAdmin: true }))) return;

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

    if (!(await authorizeOrgAccess(req, res, organizationId, { requireAdmin: true }))) return;

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
