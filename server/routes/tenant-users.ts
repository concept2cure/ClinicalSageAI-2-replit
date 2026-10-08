import { Router } from 'express';
import { z } from 'zod';
import { pool, transaction } from '../db';
import { inVerifiedOrgScope } from '../services/tenant/verified-org-scope';
import {
  ADMINISTRATOR_ROLES, changeMemberRole, memberChangeReason, LAST_ADMINISTRATOR_REFUSAL, removeMember,
  wouldLeaveNoAdministrator, type MembershipActor,
} from '../services/tenant/membership-change';
import { clientIpOf } from '../utils/client-ip';
import { ASSIGNABLE_ORG_ROLES } from '../../shared/constants/org-roles';
import { createScopedLogger } from '../utils/logger.js';
import { invalidateOrgMembershipCache } from '../middleware/auth';
import { holdsPlatformRole } from '../middleware/requirePlatformAdmin';
import {
  issueInvitation,
  reissueForUnredeemedInvitee,
  type InvitationDelivery,
} from '../services/tenant/invitation-delivery';
import {
  resolveAppBaseUrl,
  PublicOriginNotConfiguredError,
} from '../services/password-setup-token';

const log = createScopedLogger('tenant-users');

const router = Router();

// Schema for user creation
const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  // P-18: approver and reviewer are assignable (shared/constants/org-roles.ts).
  role: z.enum(ASSIGNABLE_ORG_ROLES),
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
  role: z.enum(ASSIGNABLE_ORG_ROLES),
  reason: memberChangeReason,
});

const removeMemberSchema = z.object({ reason: memberChangeReason });

/** 400 before anything is written: a membership change states its reason (21 CFR 11.10(e)). */
function reasonRequired(res: any, change: string) {
  return res.status(400).json({
    error: 'REASON_REQUIRED',
    message: `A reason is required to ${change}. Nothing was changed.`,
  });
}

/** Who is making a membership change, from where — for its audit row. */
function membershipActor(req: any): MembershipActor {
  return {
    userId: getCallerId(req),
    ipAddress: clientIpOf(req),
    userAgent: typeof req.get === 'function' ? req.get('user-agent') : undefined,
  };
}

/**
 * Authorize the caller against the *target* organization (the org named in the
 * route/body), not just their own JWT org. Previously these handlers trusted
 * organizationId from the request body/params, so any authenticated user could
 * list, create, re-role, or remove users in any organization. A platform
 * super_admin is allowed anywhere; otherwise the caller must belong to the
 * target org (membership for reads, admin/owner for mutations).
 * Returns the verified role in the target org (truthy), or false once answered.
 */
async function authorizeOrgAccess(
  req: any,
  res: any,
  targetOrgId: number,
  opts: { requireAdmin: boolean }
): Promise<string | false> {
  const callerId = Number(req.user?.id ?? req.userId);
  if (!callerId || Number.isNaN(callerId)) {
    res.status(401).json({ error: 'Authentication required' });
    return false;
  }
  // Platform staff: platform standing for super_admin (holdsPlatformRole),
  // never the request role. That is the tenant membership role behind
  // server/auth.ts, so until 2026-10-05 a membership row naming super_admin
  // administered every organization's users (D6,
  // docs/evidence/D6/2026-10-05-cross-tenant-staff/).
  if (await holdsPlatformRole(req, ['super_admin'])) return 'super_admin';
  const membership = await pool.query(
    'SELECT role FROM organization_users WHERE user_id = $1 AND organization_id = $2 LIMIT 1',
    [callerId, targetOrgId]
  );
  const role = membership.rows[0]?.role;
  if (!role) {
    res.status(403).json({ error: 'You do not have access to this organization' });
    return false;
  }
  if (opts.requireAdmin && !ADMINISTRATOR_ROLES.includes(role)) {
    res.status(403).json({ error: 'Admin of the target organization required' });
    return false;
  }
  return role;
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

/**
 * The caller's own invitation by id, whichever organization issued it, or
 * null — also null for another person's invitation, so its existence is not
 * disclosed. It lives in the inviting organization's rows, which the session's
 * tenant policy hides (migrations/20260928_invitations_for_member.sql).
 */
async function ownInvitation(
  callerId: number,
  invitationId: number
): Promise<{ organizationId: number; status: string } | null> {
  const { rows } = await pool.query(
    'SELECT organization_id, status FROM public.invitations_for_member($1) WHERE id = $2',
    [callerId, invitationId]
  );
  return rows[0] ? { organizationId: Number(rows[0].organization_id), status: String(rows[0].status) } : null;
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

    // The invitations naming the caller live in the INVITING organizations'
    // rows, which this scope's tenant policy hides; invitations_for_member
    // reads them for a member of this scope's organization and nobody else
    // (migrations/20260928_invitations_for_member.sql).
    const result = await pool.query(
      `SELECT
         id,
         organization_id as "organizationId",
         email,
         role,
         status,
         invited_by_id as "invitedById",
         created_at as "createdAt"
       FROM public.invitations_for_member($1)
       WHERE status = 'pending'
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

    // Only the caller's own invitation is found, whichever organization issued
    // it; the accept then runs in THAT organization's scope, where its tenant
    // policy admits the invitation, the membership write and the quota lock.
    const own = await ownInvitation(callerId, invitationId);
    if (!own) {
      return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Invitation not found' });
    }
    const result = await inVerifiedOrgScope(req, own.organizationId, 'member', () =>
      atomicQuotaService.atomicAcceptInvitation(invitationId, callerId)
    );

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

    // The caller's own invitation only (see accept); the decline is written in
    // the inviting organization's scope, and must reach the row it names.
    const invitation = await ownInvitation(callerId, invitationId);
    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    if (invitation.status !== 'pending') {
      return res.status(409).json({ error: `Invitation has already been ${invitation.status}` });
    }

    const declined = await inVerifiedOrgScope(req, invitation.organizationId, 'member', () =>
      pool.query(
        `UPDATE organization_invitations
         SET status = 'declined', responded_at = NOW()
         WHERE id = $1 AND organization_id = $2 AND user_id = $3 AND status = 'pending'`,
        [invitationId, invitation.organizationId, callerId]
      )
    );
    if (declined.rowCount !== 1) {
      return res.status(409).json({ error: 'Invitation is no longer pending' });
    }

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

    const verifiedRole = await authorizeOrgAccess(req, res, tenantId, { requireAdmin: false });
    if (!verifiedRole) return;

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

    // In the organization being listed: a tenant scope reads only its own
    // members' users rows (migrations/20260928_users_membership_rls.sql), so a
    // member of two organizations listing the other from their session's scope
    // would be shown an empty organization.
    const result = await inVerifiedOrgScope(req, tenantId, verifiedRole, () =>
      pool.query(query, [tenantId])
    );
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

    const verifiedRole = await authorizeOrgAccess(req, res, organizationId, { requireAdmin: true }); if (!verifiedRole) return;

    // The origin a new member's activation link is built on, resolved BEFORE
    // anything is created. In production it is APP_URL or nothing, never the
    // Host header (D6). Creating the account and then failing to issue its link
    // left a member who could not sign in, whose forgot-password was refused
    // for the same reason, and who could not be invited again (USER_EXISTS).
    let appBaseUrl: string;
    try {
      appBaseUrl = resolveAppBaseUrl(req);
    } catch (err) {
      if (!(err instanceof PublicOriginNotConfiguredError)) throw err;
      log.error('Member creation refused: no public origin configured', err);
      return res.status(503).json({
        error: 'PUBLIC_ORIGIN_NOT_CONFIGURED',
        message: 'Members cannot be added: this deployment has no public address configured (APP_URL), so no activation link can be sent.',
      });
    }

    // Inviting a member who never set a password again re-issues their setup
    // link (QA 2026-10-08, j9 finding 5): it was handed over once, and lost
    // with the clipboard. Before the seat gate: it adds no member and no seat.
    const reissued = await reissueForUnredeemedInvitee(req, {
      email: validatedData.email,
      organizationId,
      verifiedRole,
      callerId: getCallerId(req),
      appBaseUrl,
    });
    if (reissued) return res.status(reissued.status).json(reissued.body);

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
    const result = await inVerifiedOrgScope(req, organizationId, verifiedRole, () =>
      atomicQuotaService.atomicCreateUser(organizationId, {
        email: validatedData.email,
        name: validatedData.name,
        role: validatedData.role,
        title: validatedData.title,
        department: validatedData.department,
        invitedById: getCallerId(req),
      })
    );

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
          verifiedRole,
          callerId: getCallerId(req),
          appBaseUrl,
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
 * Update user role in organization. Body: { role, reason } — the reason is
 * required (400 REASON_REQUIRED otherwise) and recorded with the role before
 * and after in a chained audit row written in the change's transaction.
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

    const verifiedRole = await authorizeOrgAccess(req, res, organizationId, { requireAdmin: true }); if (!verifiedRole) return;

    // PR #973 port: an admin re-roling THEMSELVES can leave an organization
    // with no administrator and no one able to undo it. Checked after authZ so
    // a non-member still gets 403, not a disclosure.
    if (getCallerId(req) === userId) {
      return res.status(400).json({ error: 'You cannot change your own role', code: 'SELF_ROLE_CHANGE' });
    }

    const parsed = updateUserRoleSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      if (parsed.error.issues.every(i => i.path[0] === 'reason')) {
        return reasonRequired(res, "change a member's role");
      }
      return res.status(400).json({ error: 'Invalid role data', details: parsed.error.errors });
    }
    const { role, reason } = parsed.data;

    // The organization's administrators (locked), the role before (locked), the
    // change and its audit row: one transaction.
    const outcome = await inVerifiedOrgScope(req, organizationId, verifiedRole, () =>
      transaction(async client =>
        (await wouldLeaveNoAdministrator(client, { organizationId, userId, newRole: role }))
          ? ('last_admin' as const)
          : changeMemberRole(client, membershipActor(req), { organizationId, userId, role, reason })
      )
    );

    if (outcome === 'last_admin') return res.status(409).json(LAST_ADMINISTRATOR_REFUSAL);
    if (outcome === 'not_found') {
      return res.status(404).json({ error: 'User not found in organization' });
    }
    if (outcome === 'unchanged') {
      return res.json({ message: 'User role unchanged', unchanged: true });
    }

    // The role is cached for up to a minute per instance (orgMembership.ts);
    // a demotion must not outlive its audited change time by that minute.
    invalidateOrgMembershipCache(userId, organizationId);
    log.debug(`Updated role of user ${userId} in organization ${organizationId}`);
    res.json({ message: 'User role updated successfully' });
  } catch (error) {
    // Includes a refused audit row: the transaction rolled the change back.
    log.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

/**
 * DELETE /api/tenant-users/:organizationId/:userId
 * Remove user from organization. Body: { reason } — required (400
 * REASON_REQUIRED otherwise) and recorded with the role the member held in a
 * chained audit row written in the removal's transaction.
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

    const verifiedRole = await authorizeOrgAccess(req, res, organizationId, { requireAdmin: true }); if (!verifiedRole) return;

    // PR #973 port: self-removal — same lockout as a self re-role above.
    if (getCallerId(req) === userId) {
      return res.status(400).json({ error: 'You cannot remove yourself from an organization', code: 'SELF_REMOVAL' });
    }

    const parsed = removeMemberSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reasonRequired(res, 'remove a member');
    const { reason } = parsed.data;

    // The organization's administrators (locked), the removal and its audit
    // row: one transaction.
    const removed = await inVerifiedOrgScope(req, organizationId, verifiedRole, () =>
      transaction(async client =>
        (await wouldLeaveNoAdministrator(client, { organizationId, userId, newRole: null }))
          ? ('last_admin' as const)
          : removeMember(client, membershipActor(req), { organizationId, userId, reason })
      )
    );

    if (removed === 'last_admin') return res.status(409).json(LAST_ADMINISTRATOR_REFUSAL);
    if (!removed) {
      return res.status(404).json({ error: 'User not found in organization' });
    }

    // Revocation must take effect immediately, not after the auth
    // middleware's membership-cache TTL.
    invalidateOrgMembershipCache(userId, organizationId);

    log.debug(`Removed user ${userId} from organization ${organizationId}`);
    res.json({ message: 'User removed from organization successfully' });
  } catch (error) {
    // Includes a refused audit row: the transaction rolled the removal back.
    log.error('Error removing user from organization:', error);
    res.status(500).json({ error: 'Failed to remove user from organization' });
  }
});

export default router;
