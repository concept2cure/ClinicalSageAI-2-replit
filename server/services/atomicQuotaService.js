/**
 * Atomic Quota Enforcement Service
 *
 * Transactional quota enforcement for the two governed "create" paths that
 * consume a per-organization ceiling: projects and members. Each function
 * locks the organization row (SELECT … FOR UPDATE), counts inside the same
 * transaction, and inserts only when the count is under the ceiling, so two
 * concurrent requests cannot both squeeze under the same limit.
 *
 * The ceilings are organizations.max_projects and organizations.max_users —
 * the values the tenant's plan writes and install-fresh / signup seed, and the
 * same values server/services/license-manager.ts reports as LicenseInfo.
 *
 * History, because it explains the shape of this file: every function here
 * used to lock a row in `licenses` keyed by organization_id and answer
 * NO_LICENSE when it found none. Nothing ever wrote an organization-keyed
 * licence row — `licenses` was the consultant → client-workspace licence,
 * keyed by client_id, and its only writer (a router whose every handler called
 * `db.query` on a Drizzle instance and threw) never ran. The member path then
 * counted seats in `license_users`, a table no migration creates. So on every
 * install, fresh or paying, POST /api/projects and POST /api/tenant-users
 * answered 400 NO_LICENSE, verified live against a fully provisioned database.
 * Purchased-seat enforcement (organizations.seats_purchased) is a separate,
 * stricter ceiling owned by server/services/seat-licensing.ts; the route
 * applies it before calling here.
 */

import { pool } from '../db.js';
import { unusableInvitePasswordHash } from './password-setup-token.js';

/**
 * Fallbacks for a NULL ceiling. They match the column defaults in
 * shared/schema.ts (organizations.max_users / max_projects) and the values
 * license-manager.ts substitutes, so a NULL means the same thing everywhere.
 */
const DEFAULT_MAX_PROJECTS = 10;
const DEFAULT_MAX_USERS = 5;

/**
 * Lock the organization row and return its ceilings, or null when the
 * organization does not exist. Must run inside the caller's transaction.
 */
async function lockOrganization(client, organizationId) {
  const result = await client.query(
    `SELECT max_projects, max_users FROM organizations WHERE id = $1 FOR UPDATE`,
    [organizationId]
  );
  return result.rows[0] ?? null;
}

async function countMembers(client, organizationId) {
  const result = await client.query(
    `SELECT COUNT(*) as count FROM organization_users WHERE organization_id = $1`,
    [organizationId]
  );
  return parseInt(result.rows[0].count, 10);
}

function quotaExceeded(kind, currentCount, maximum) {
  return {
    success: false,
    error: 'QUOTA_EXCEEDED',
    message: `${kind} quota exceeded. Current: ${currentCount}, Maximum: ${maximum}`,
    details: { current: currentCount, maximum, remaining: 0 },
  };
}

const ORGANIZATION_NOT_FOUND = Object.freeze({
  success: false,
  error: 'ORGANIZATION_NOT_FOUND',
  message: 'Organization not found',
});

/**
 * Atomically check and consume project quota.
 *
 * @param {number} organizationId - Organization to check
 * @param {object} projectData - Project data to create if quota available
 * @returns {object} Result with success, data, and error details
 */
export async function atomicCreateProject(organizationId, projectData) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const organization = await lockOrganization(client, organizationId);
    if (!organization) {
      await client.query('ROLLBACK');
      return { ...ORGANIZATION_NOT_FOUND };
    }

    const countResult = await client.query(
      `SELECT COUNT(*) as count FROM projects WHERE organization_id = $1`,
      [organizationId]
    );
    const currentCount = parseInt(countResult.rows[0].count, 10);
    const maxProjects = organization.max_projects || DEFAULT_MAX_PROJECTS;

    if (currentCount >= maxProjects) {
      await client.query('ROLLBACK');
      return quotaExceeded('Project', currentCount, maxProjects);
    }

    // created_by_id / owner_id record WHO created the project — the attribution
    // an audit reader expects on a governed object. The route passes the
    // authenticated user's id; null only when the caller has no numeric id.
    const createdById = projectData.createdById ?? null;
    const projectResult = await client.query(
      `INSERT INTO projects (
        name, description, type, priority, target_end_date,
        organization_id, client_workspace_id, status,
        created_by_id, owner_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *`,
      [
        projectData.name,
        projectData.description,
        projectData.type,
        projectData.priority || 'medium',
        projectData.dueDate || null,
        organizationId,
        projectData.clientWorkspaceId,
        projectData.status || 'active',
        createdById,
        projectData.ownerId ?? createdById,
      ]
    );

    await client.query('COMMIT');

    return {
      success: true,
      data: projectResult.rows[0],
      quotaInfo: {
        used: currentCount + 1,
        maximum: maxProjects,
        remaining: maxProjects - currentCount - 1,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    // The driver's message names tables and columns; it belongs in the log,
    // never in the response.
    console.error('Atomic project creation failed:', error);
    return {
      success: false,
      error: 'DATABASE_ERROR',
      message: 'Failed to create project atomically',
    };
  } finally {
    client.release();
  }
}

/**
 * Atomically check and consume member quota, then create the user and their
 * membership — or, for a user who already belongs to another organization, a
 * pending invitation that needs their consent.
 *
 * @param {number} organizationId - Organization to check
 * @param {object} userData - User data to create if quota available
 * @returns {object} Result with success, data, and error details
 */
export async function atomicCreateUser(organizationId, userData) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const organization = await lockOrganization(client, organizationId);
    if (!organization) {
      await client.query('ROLLBACK');
      return { ...ORGANIZATION_NOT_FOUND };
    }

    const currentCount = await countMembers(client, organizationId);
    const maxUsers = organization.max_users || DEFAULT_MAX_USERS;

    if (currentCount >= maxUsers) {
      await client.query('ROLLBACK');
      return quotaExceeded('User', currentCount, maxUsers);
    }

    // Check if user already exists
    // tenant-isolation-safe: pre-membership identity resolution — users is a global identity keyed by email; org membership lives in organization_users and cross-org joins require a consented invitation (below).
    const existingUserResult = await client.query('SELECT id FROM users WHERE email = $1', [
      userData.email,
    ]);

    let userId;
    let createdNewUser = false;

    if (existingUserResult.rows.length > 0) {
      userId = existingUserResult.rows[0].id;

      // Check if already in this organization
      const existingOrgUserResult = await client.query(
        'SELECT id FROM organization_users WHERE user_id = $1 AND organization_id = $2',
        [userId, organizationId]
      );

      if (existingOrgUserResult.rows.length > 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'USER_EXISTS',
          message: 'User is already a member of this organization',
        };
      }

      // Existing user in ANOTHER organization: do NOT silently add a
      // membership. Memberships require the user's consent, so create (or
      // reuse) a PENDING invitation instead (decision-register item 12,
      // issue #727). The organization_users row is only created when the
      // invited user accepts via atomicAcceptInvitation().
      // Also: never overwrite their global profile from an invite — the
      // inviting org has no authority over a user record that may belong to
      // other organizations. Title/department apply only on user creation.
      const existingInviteResult = await client.query(
        `SELECT id FROM organization_invitations
         WHERE organization_id = $1 AND lower(email) = lower($2) AND status = 'pending'`,
        [organizationId, userData.email]
      );

      let invitationId;
      if (existingInviteResult.rows.length > 0) {
        // Idempotent: a pending invitation for this org+email already exists.
        invitationId = existingInviteResult.rows[0].id;
      } else {
        const inviteInsertResult = await client.query(
          `INSERT INTO organization_invitations
             (organization_id, user_id, email, role, invited_by_id, status, created_at)
           VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [
            organizationId,
            userId,
            userData.email,
            userData.role || 'member',
            userData.invitedById || null,
          ]
        );
        if (inviteInsertResult.rows.length > 0) {
          invitationId = inviteInsertResult.rows[0].id;
        } else {
          // Lost a race against a concurrent invite — reuse the winner's row.
          const raced = await client.query(
            `SELECT id FROM organization_invitations
             WHERE organization_id = $1 AND lower(email) = lower($2) AND status = 'pending'`,
            [organizationId, userData.email]
          );
          invitationId = raced.rows[0]?.id;
        }
      }

      await client.query('COMMIT');

      return {
        success: true,
        pendingInvitation: true,
        data: {
          invitationId,
          email: userData.email,
          role: userData.role || 'member',
          status: 'pending',
        },
        message:
          'User already belongs to another organization. A pending invitation requiring their consent was created; membership will be added when they accept.',
      };
    } else {
      // Create new user.
      //
      // password_hash is NOT NULL and an invitee has no password yet, so the
      // row carries an UNUSABLE hash (`invite:<uuid>`, the SCIM/SAML
      // convention — bcrypt.compare can never match it) and
      // must_change_password. The route then mints a password-setup token
      // and sends the invitation; until it is redeemed this account cannot
      // sign in. Before this the INSERT omitted password_hash and every
      // invitation of a new address died on the NOT NULL constraint.
      //
      // tenant-isolation-safe: user creation is org-less by design — a users row is a global identity; org membership is added separately via organization_users after the quota check above.
      const createUserResult = await client.query(
        `INSERT INTO users (
           email, name, title, department, status,
           password_hash, must_change_password, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
         RETURNING id`,
        [
          userData.email,
          userData.name,
          userData.title || null,
          userData.department || null,
          'active',
          unusableInvitePasswordHash(),
        ]
      );
      userId = createUserResult.rows[0].id;
      createdNewUser = true;
    }

    // Add user to organization
    await client.query(
      `INSERT INTO organization_users (user_id, organization_id, role, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())`,
      [userId, organizationId, userData.role || 'member']
    );

    await client.query('COMMIT');

    return {
      success: true,
      data: {
        id: userId,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        // True when this call created the users row (and so an activation
        // token is needed); false when an existing account was added.
        createdNewUser,
      },
      quotaInfo: {
        used: currentCount + 1,
        maximum: maxUsers,
        remaining: maxUsers - currentCount - 1,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Atomic user creation failed:', error);
    return {
      success: false,
      error: 'DATABASE_ERROR',
      message: 'Failed to create user atomically',
    };
  } finally {
    client.release();
  }
}

/**
 * Atomically accept a pending cross-org invitation (decision-register item
 * 12, issue #727). Self-only: the caller must BE the invited user. Creates
 * the organization_users membership inside the same transaction that marks
 * the invitation accepted, re-checking the member quota with the same
 * SELECT...FOR UPDATE discipline as atomicCreateUser.
 *
 * @param {number} invitationId - Invitation to accept
 * @param {number} callerUserId - Session user id (must equal invitation.user_id)
 * @returns {object} Result with success, data, and error details
 */
export async function atomicAcceptInvitation(invitationId, callerUserId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const inviteResult = await client.query(
      `SELECT id, organization_id, user_id, email, role, status
       FROM organization_invitations
       WHERE id = $1
       FOR UPDATE`,
      [invitationId]
    );

    if (inviteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'NOT_FOUND', message: 'Invitation not found' };
    }

    const invitation = inviteResult.rows[0];

    if (Number(invitation.user_id) !== Number(callerUserId)) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: 'FORBIDDEN',
        message: 'Only the invited user may respond to this invitation',
      };
    }

    if (invitation.status !== 'pending') {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: 'NOT_PENDING',
        message: `Invitation has already been ${invitation.status}`,
      };
    }

    const organizationId = invitation.organization_id;

    // Re-check quota at accept time — the invite path does not consume it.
    const organization = await lockOrganization(client, organizationId);
    if (!organization) {
      await client.query('ROLLBACK');
      return { ...ORGANIZATION_NOT_FOUND };
    }

    const currentCount = await countMembers(client, organizationId);
    const maxUsers = organization.max_users || DEFAULT_MAX_USERS;

    if (currentCount >= maxUsers) {
      await client.query('ROLLBACK');
      return quotaExceeded('User', currentCount, maxUsers);
    }

    // Consent given: create the membership now.
    await client.query(
      `INSERT INTO organization_users (organization_id, user_id, role, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (user_id, organization_id) DO NOTHING`,
      [organizationId, invitation.user_id, invitation.role || 'member']
    );

    await client.query(
      `UPDATE organization_invitations
       SET status = 'accepted', responded_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [invitationId, organizationId]
    );

    await client.query('COMMIT');

    return {
      success: true,
      data: {
        invitationId,
        organizationId,
        userId: invitation.user_id,
        role: invitation.role || 'member',
        status: 'accepted',
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Atomic invitation accept failed:', error);
    return {
      success: false,
      error: 'DATABASE_ERROR',
      message: 'Failed to accept invitation atomically',
    };
  } finally {
    client.release();
  }
}
