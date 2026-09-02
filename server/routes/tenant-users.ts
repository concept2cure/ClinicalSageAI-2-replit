import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { pool } from '../db';
import { createScopedLogger } from '../utils/logger.js';
import { invalidateOrgMembershipCache } from '../middleware/auth';
import auditService from '../services/auditService';
import { isEmailConfigured, sendInvitationEmail } from '../services/emailService';
import {
  INVITATION_TTL_MS,
  mintPasswordSetupToken,
  passwordSetupUrl,
  resolveAppBaseUrl,
} from '../services/password-setup-token';

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
 * The caller's session organization — what POST / falls back to when the
 * body names no organizationId. AdminAccess and the onboarding wizard rely on
 * this: the body is optional in createUserSchema, and the route used to
 * answer 400 "Organization ID is required" to the one screen whose job is
 * inviting members.
 */
function sessionOrganizationId(req: any): number | null {
  const raw = req.tenantId ?? req.tenantContext?.organizationId ?? req.user?.organizationId;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** What the admin is told about how the invitee will receive their link. */
interface InvitationDelivery {
  expiresAt: string | null;
  emailSent: boolean;
  /**
   * 'email' — the invitee has the link; 'link' — the admin must hand it over;
   * 'failed' — the account exists but no activation link could be issued.
   */
  delivery: 'email' | 'link' | 'failed';
  /** Present only when no email went out: the one copy of the setup link. */
  setupUrl?: string;
  /** Present when SMTP is configured but refused the message. */
  emailError?: string;
}

/**
 * Activate a NEWLY created account: mint a password-setup token (the same
 * token "forgot password" uses — server/services/password-setup-token.ts),
 * store its hash on the user row, and send the invitation. The account was
 * inserted with an unusable password hash, so this link is the only way in.
 *
 * Delivery is reported honestly. When SMTP is not configured (or refuses the
 * message) nothing was sent, and the response carries the setup link so the
 * org admin — who just created the account and is the only reader of this
 * response — can hand it over. Either way the audit trail records which.
 */
async function issueInvitation(
  req: any,
  args: { userId: number; email: string; role: string; organizationId: number }
): Promise<InvitationDelivery> {
  const setup = mintPasswordSetupToken(INVITATION_TTL_MS);
  // tenant-isolation-safe: users is a global identity table; this id is the row atomicCreateUser just created for the organization the caller was verified to administer (authorizeOrgAccess), inside this same request.
  await pool.query(
    `UPDATE users SET reset_token = $1, reset_token_expires_at = $2, updated_at = NOW() WHERE id = $3`,
    [setup.tokenHash, setup.expiresAt, args.userId]
  );
  const setupUrl = passwordSetupUrl(resolveAppBaseUrl(req), setup.token);

  const orgRow = await pool.query('SELECT name FROM organizations WHERE id = $1', [
    args.organizationId,
  ]);
  const orgName: string = orgRow.rows[0]?.name ?? 'your organization';
  const inviterName: string = req.user?.name || req.user?.email || 'An administrator';

  let emailSent = false;
  let emailError: string | undefined;
  if (isEmailConfigured()) {
    try {
      emailSent = await sendInvitationEmail(
        args.email,
        inviterName,
        orgName,
        setupUrl,
        setup.expiresAt
      );
    } catch (err) {
      log.error('Invitation email failed', err);
      emailError = 'The invitation email could not be sent';
    }
  }
  const delivery: InvitationDelivery['delivery'] = emailSent ? 'email' : 'link';

  const audit = await auditService.logAction({
    tenantId: args.organizationId,
    userId: getCallerId(req) ?? undefined,
    action: 'user_invited',
    resourceType: 'user',
    resourceId: String(args.userId),
    ipAddress: req.ip,
    userAgent: req.get?.('user-agent'),
    details: {
      email: args.email,
      role: args.role,
      delivery,
      emailSent,
      invitationExpiresAt: setup.expiresAt.toISOString(),
    },
  });
  if (!audit.persisted) {
    log.warn('Audit log write failed (non-fatal)', { action: 'user_invited', err: audit.error });
  }

  return {
    expiresAt: setup.expiresAt.toISOString(),
    emailSent,
    delivery,
    ...(emailSent ? {} : { setupUrl }),
    ...(emailError ? { emailError } : {}),
  };
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
        ORGANIZATION_NOT_FOUND: 404,
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

    // The target organization: named in the body, else the caller's session
    // tenant. authorizeOrgAccess below still requires the caller to be an
    // admin of whichever one it is.
    const organizationId = validatedData.organizationId ?? sessionOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    if (!(await authorizeOrgAccess(req, res, organizationId, { requireAdmin: true }))) return;

    // Seat-licensing gate: a new member/invitation consumes a purchased seat.
    // Report-only by default; blocks only when SEAT_LIMIT_ENFORCEMENT=enforce.
    {
      const { checkSeatAvailability, isSeatEnforcementOn } = await import('../services/seat-licensing.js');
      const seat = await checkSeatAvailability(organizationId, 1);
      res.setHeader('X-Seat-State', seat.state);
      res.setHeader('X-Seats-Purchased', String(seat.seatsPurchased));
      res.setHeader('X-Seats-Consumed', String(seat.seatsConsumed));
      if (!seat.allowed && isSeatEnforcementOn()) {
        return res.status(403).json({
          success: false,
          error: 'SEAT_LIMIT_EXCEEDED',
          message: `This organization has consumed all ${seat.seatsPurchased} purchased seats (${seat.seatsConsumed} in use, incl. pending invitations). Purchase more seats to add members.`,
          seats: seat,
        });
      }
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
      return res.status(result.error === 'ORGANIZATION_NOT_FOUND' ? 404 : 400).json({
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

    // A brand-new account has no password: activate it with a setup link.
    // The account and membership are already committed, so a failure here is
    // reported on the 201 rather than turned into a 500 that would claim the
    // member was not created.
    let invitation: InvitationDelivery | undefined;
    if (createdUser.createdNewUser === true && Number.isInteger(Number(createdUser.id))) {
      try {
        invitation = await issueInvitation(req, {
          userId: Number(createdUser.id),
          email: validatedData.email,
          role: validatedData.role,
          organizationId,
        });
      } catch (err) {
        log.error('Invitation could not be issued for the new member', err);
        invitation = {
          expiresAt: null,
          emailSent: false,
          delivery: 'failed',
          emailError: 'The account was created but no activation link could be issued',
        };
      }
    }

    res.status(201).json({
      ...createdUser,
      quotaInfo: result.quotaInfo,
      ...(invitation ? { invitation } : {}),
    });
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

    // Revocation must take effect immediately, not after the auth
    // middleware's membership-cache TTL.
    invalidateOrgMembershipCache(userId, organizationId);

    log.debug('Removed user from organization:', result.rows[0]);
    res.json({ message: 'User removed from organization successfully' });
  } catch (error) {
    log.error('Error removing user from organization:', error);
    res.status(500).json({ error: 'Failed to remove user from organization' });
  }
});

export default router;
