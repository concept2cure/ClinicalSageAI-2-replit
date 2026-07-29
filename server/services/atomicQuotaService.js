/**
 * Atomic Quota Enforcement Service
 *
 * Production-grade quota enforcement with transaction safety
 * Prevents race conditions through database-level locking
 * Ensures concurrent requests cannot exceed licensed limits
 */

import { pool } from '../db.js';

/**
 * Atomically check and consume project quota
 * Uses SELECT...FOR UPDATE to prevent concurrent violations
 *
 * @param {number} organizationId - Organization to check
 * @param {object} projectData - Project data to create if quota available
 * @returns {object} Result with success, data, and error details
 */
export async function atomicCreateProject(organizationId, projectData) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock the license row to prevent concurrent reads
    const licenseResult = await client.query(
      `SELECT * FROM licenses
       WHERE organization_id = $1 AND status = 'active'
       FOR UPDATE`,
      [organizationId]
    );

    if (licenseResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: 'NO_LICENSE',
        message: 'No active license found for this organization',
      };
    }

    const license = licenseResult.rows[0];

    // Count current projects within the same transaction
    const countResult = await client.query(
      `SELECT COUNT(*) as count
       FROM projects
       WHERE organization_id = $1`,
      [organizationId]
    );

    const currentCount = parseInt(countResult.rows[0].count);
    const maxProjects = license.max_projects || 20;

    if (currentCount >= maxProjects) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: 'QUOTA_EXCEEDED',
        message: `Project quota exceeded. Current: ${currentCount}, Maximum: ${maxProjects}`,
        details: {
          current: currentCount,
          maximum: maxProjects,
          remaining: 0,
        },
      };
    }

    // Create the project within the same transaction
    const projectResult = await client.query(
      `INSERT INTO projects (
        name, description, type, priority, target_end_date,
        organization_id, client_workspace_id, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
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
    console.error('Atomic project creation failed:', error);
    return {
      success: false,
      error: 'DATABASE_ERROR',
      message: 'Failed to create project atomically',
      details: error.message,
    };
  } finally {
    client.release();
  }
}

/**
 * Atomically check and consume user quota
 * Uses SELECT...FOR UPDATE to prevent concurrent violations
 *
 * @param {number} organizationId - Organization to check
 * @param {object} userData - User data to create if quota available
 * @returns {object} Result with success, data, and error details
 */
export async function atomicCreateUser(organizationId, userData) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock the license row to prevent concurrent reads
    const licenseResult = await client.query(
      `SELECT * FROM licenses
       WHERE organization_id = $1 AND status = 'active'
       FOR UPDATE`,
      [organizationId]
    );

    if (licenseResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: 'NO_LICENSE',
        message: 'No active license found for this organization',
      };
    }

    const license = licenseResult.rows[0];

    // Count current users within the same transaction
    const countResult = await client.query(
      `SELECT COUNT(*) as count
       FROM license_users
       WHERE license_id = $1`,
      [license.id]
    );

    const currentCount = parseInt(countResult.rows[0].count);
    const maxUsers = license.max_users || 10;

    if (currentCount >= maxUsers) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: 'QUOTA_EXCEEDED',
        message: `User quota exceeded. Current: ${currentCount}, Maximum: ${maxUsers}`,
        details: {
          current: currentCount,
          maximum: maxUsers,
          remaining: 0,
        },
      };
    }

    // Check if user already exists
    const existingUserResult = await client.query('SELECT id FROM users WHERE email = $1', [
      userData.email,
    ]);

    let userId;

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
      // Create new user
      const createUserResult = await client.query(
        `INSERT INTO users (email, name, title, department, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING id`,
        [
          userData.email,
          userData.name,
          userData.title || null,
          userData.department || null,
          'active',
        ]
      );
      userId = createUserResult.rows[0].id;
    }

    // Add user to organization
    await client.query(
      `INSERT INTO organization_users (user_id, organization_id, role, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())`,
      [userId, organizationId, userData.role || 'member']
    );

    // Add to license_users for quota tracking
    await client.query(
      `INSERT INTO license_users (license_id, user_id, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (license_id, user_id) DO NOTHING`,
      [license.id, userId]
    );

    await client.query('COMMIT');

    return {
      success: true,
      data: {
        id: userId,
        email: userData.email,
        name: userData.name,
        role: userData.role,
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
      details: error.message,
    };
  } finally {
    client.release();
  }
}

/**
 * Atomically accept a pending cross-org invitation (decision-register item
 * 12, issue #727). Self-only: the caller must BE the invited user. Creates
 * the organization_users membership (and license_users quota row) inside the
 * same transaction that marks the invitation accepted, re-checking the user
 * quota with the same SELECT...FOR UPDATE discipline as atomicCreateUser.
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

    // Re-check quota at accept time — the invite path no longer consumes it.
    const licenseResult = await client.query(
      `SELECT * FROM licenses
       WHERE organization_id = $1 AND status = 'active'
       FOR UPDATE`,
      [organizationId]
    );

    if (licenseResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: 'NO_LICENSE',
        message: 'No active license found for this organization',
      };
    }

    const license = licenseResult.rows[0];

    const countResult = await client.query(
      `SELECT COUNT(*) as count
       FROM license_users
       WHERE license_id = $1`,
      [license.id]
    );

    const currentCount = parseInt(countResult.rows[0].count);
    const maxUsers = license.max_users || 10;

    if (currentCount >= maxUsers) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: 'QUOTA_EXCEEDED',
        message: `User quota exceeded. Current: ${currentCount}, Maximum: ${maxUsers}`,
        details: { current: currentCount, maximum: maxUsers, remaining: 0 },
      };
    }

    // Consent given: create the membership now.
    await client.query(
      `INSERT INTO organization_users (organization_id, user_id, role, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (user_id, organization_id) DO NOTHING`,
      [organizationId, invitation.user_id, invitation.role || 'member']
    );

    await client.query(
      `INSERT INTO license_users (license_id, user_id, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (license_id, user_id) DO NOTHING`,
      [license.id, invitation.user_id]
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
      details: error.message,
    };
  } finally {
    client.release();
  }
}

/**
 * Atomically check and consume submission quota
 * Uses SELECT...FOR UPDATE to prevent concurrent violations
 *
 * @param {number} organizationId - Organization to check
 * @param {object} submissionData - Submission data to create if quota available
 * @returns {object} Result with success, data, and error details
 */
export async function atomicCreateSubmission(organizationId, submissionData) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock the license row to prevent concurrent reads
    const licenseResult = await client.query(
      `SELECT l.*
       FROM licenses l
       INNER JOIN client_workspaces cw ON CAST(l.client_id AS INTEGER) = cw.id
       WHERE cw.organization_id = $1 AND l.status = 'active'
       FOR UPDATE`,
      [organizationId]
    );

    if (licenseResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: 'NO_LICENSE',
        message: 'No active license found for this organization',
      };
    }

    const license = licenseResult.rows[0];

    // Count current month's submissions within the same transaction
    const currentDate = new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);

    const countResult = await client.query(
      `SELECT COUNT(*) as count
       FROM submissions
       WHERE license_id = $1
       AND created_at >= $2
       AND created_at < $3`,
      [license.id, startOfMonth, endOfMonth]
    );

    const currentCount = parseInt(countResult.rows[0].count);
    const maxSubmissions = license.max_submissions || 50;

    if (currentCount >= maxSubmissions) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: 'QUOTA_EXCEEDED',
        message: `Monthly submission quota exceeded. Current: ${currentCount}, Maximum: ${maxSubmissions}`,
        details: {
          current: currentCount,
          maximum: maxSubmissions,
          remaining: 0,
          resetDate: endOfMonth.toISOString(),
        },
      };
    }

    // Create the submission within the same transaction
    const submissionResult = await client.query(
      `INSERT INTO submissions (
        license_id, submission_type, device_name,
        regulatory_body, status, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *`,
      [
        license.id,
        submissionData.type,
        submissionData.deviceName,
        submissionData.regulatoryBody || 'FDA',
        submissionData.status || 'draft',
        JSON.stringify(submissionData.metadata || {}),
      ]
    );

    await client.query('COMMIT');

    return {
      success: true,
      data: submissionResult.rows[0],
      quotaInfo: {
        used: currentCount + 1,
        maximum: maxSubmissions,
        remaining: maxSubmissions - currentCount - 1,
        resetDate: endOfMonth.toISOString(),
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Atomic submission creation failed:', error);
    return {
      success: false,
      error: 'DATABASE_ERROR',
      message: 'Failed to create submission atomically',
      details: error.message,
    };
  } finally {
    client.release();
  }
}

/**
 * Add database constraints as a safety net
 * These should be run once during setup to enforce quotas at DB level
 */
export async function createQuotaConstraints() {
  const client = await pool.connect();

  try {
    // Create a function to check project quotas
    await client.query(`
      CREATE OR REPLACE FUNCTION check_project_quota()
      RETURNS TRIGGER AS $$
      DECLARE
        project_count INTEGER;
        max_projects INTEGER;
      BEGIN
        SELECT COUNT(*) INTO project_count
        FROM projects
        WHERE organization_id = NEW.organization_id;

        SELECT l.max_projects INTO max_projects
        FROM licenses l
        INNER JOIN client_workspaces cw ON l.id = cw.license_id
        WHERE cw.organization_id = NEW.organization_id
        LIMIT 1;

        IF project_count >= COALESCE(max_projects, 20) THEN
          RAISE EXCEPTION 'Project quota exceeded for organization %', NEW.organization_id;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger for project quota
    await client.query(`
      DROP TRIGGER IF EXISTS enforce_project_quota ON projects;
      CREATE TRIGGER enforce_project_quota
      BEFORE INSERT ON projects
      FOR EACH ROW
      EXECUTE FUNCTION check_project_quota();
    `);

    console.log('✅ Database-level quota constraints created successfully');
  } catch (error) {
    console.error('Failed to create quota constraints:', error);
    throw error;
  } finally {
    client.release();
  }
}
