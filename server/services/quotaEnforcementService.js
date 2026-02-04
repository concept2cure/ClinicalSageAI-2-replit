/**
 * Quota Enforcement Service
 *
 * Real-time usage tracking and quota enforcement for license management
 * Ensures clients stay within their subscription limits for:
 * - Monthly submissions (510k, PMA, CER, AI Defense)
 * - Maximum projects
 * - Maximum users
 * - Storage capacity
 */

import { pool as db } from '../utils/database.js';

/**
 * Get license information for an organization/client
 */
async function getLicenseForOrganization(organizationId) {
  try {
    const result = await db.query(
      `SELECT l.*
       FROM licenses l
       JOIN client_workspaces cw ON CAST(l.client_id AS INTEGER) = cw.id
       WHERE cw.organization_id = $1 AND l.status = 'active'
       LIMIT 1`,
      [organizationId]
    );

    if (result.rows.length === 0) {
      // No license found - check if there's a direct license by client_id match
      const directResult = await db.query(
        `SELECT * FROM licenses WHERE client_id = $1 AND status = 'active' LIMIT 1`,
        [String(organizationId)]
      );
      return directResult.rows[0] || null;
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error fetching license:', error);
    throw new Error('Failed to retrieve license information');
  }
}

export async function getActiveLicenseForOrganization(organizationId) {
  return getLicenseForOrganization(organizationId);
}

/**
 * Get current month's submission count for a license
 */
async function getMonthlySubmissionCount(licenseId) {
  try {
    const result = await db.query(
      `SELECT COUNT(*) as count
       FROM submissions
       WHERE license_id = $1
         AND created_at >= date_trunc('month', CURRENT_DATE)
         AND created_at < date_trunc('month', CURRENT_DATE) + interval '1 month'`,
      [licenseId]
    );

    return parseInt(result.rows[0]?.count || 0);
  } catch (error) {
    console.error('Error counting submissions:', error);
    throw new Error('Failed to count submissions');
  }
}

/**
 * Get current project count for a license
 * Counts from projects table via organization lookup
 */
async function getProjectCount(licenseId) {
  try {
    const result = await db.query(
      `SELECT COUNT(DISTINCT p.id) as count
       FROM projects p
       JOIN client_workspaces cw ON p.organization_id = cw.organization_id
       JOIN licenses l ON CAST(l.client_id AS INTEGER) = cw.id
       WHERE l.id = $1 AND p.status != 'deleted'`,
      [licenseId]
    );

    return parseInt(result.rows[0]?.count || 0);
  } catch (error) {
    console.error('Error counting projects:', error);
    throw new Error('Failed to count projects');
  }
}

/**
 * Get current user count for a license
 */
async function getUserCount(licenseId) {
  try {
    const result = await db.query(
      `SELECT COUNT(*) as count
       FROM license_users
       WHERE license_id = $1 AND active = true`,
      [licenseId]
    );

    return parseInt(result.rows[0]?.count || 0);
  } catch (error) {
    console.error('Error counting users:', error);
    throw new Error('Failed to count users');
  }
}

/**
 * Get total storage usage in GB for a license
 */
async function getStorageUsageGB(licenseId) {
  try {
    const result = await db.query(
      `SELECT COALESCE(SUM(file_size_mb), 0) / 1024.0 as storage_gb
       FROM submissions
       WHERE license_id = $1`,
      [licenseId]
    );

    return parseFloat(result.rows[0]?.storage_gb || 0);
  } catch (error) {
    console.error('Error calculating storage:', error);
    throw new Error('Failed to calculate storage usage');
  }
}

/**
 * Check if submission quota allows new submission
 */
export async function checkSubmissionQuota(organizationId) {
  const license = await getLicenseForOrganization(organizationId);

  if (!license) {
    return {
      allowed: false,
      reason: 'NO_LICENSE',
      message:
        'No active license found for this organization. Please contact support to obtain a license.',
      details: {
        organizationId,
      },
    };
  }

  const currentCount = await getMonthlySubmissionCount(license.id);
  const limit = license.max_submissions || 50;

  if (currentCount >= limit) {
    return {
      allowed: false,
      reason: 'QUOTA_EXCEEDED',
      message: `Monthly submission limit reached (${currentCount}/${limit}). Please upgrade your license or wait until next month.`,
      details: {
        licenseId: license.id,
        licenseType: license.license_type,
        currentCount,
        limit,
        nextResetDate: getNextMonthStart(),
      },
    };
  }

  return {
    allowed: true,
    license,
    usage: {
      currentCount,
      limit,
      remaining: limit - currentCount,
      percentUsed: Math.round((currentCount / limit) * 100),
    },
  };
}

/**
 * Check if project quota allows new project
 */
export async function checkProjectQuota(organizationId) {
  const license = await getLicenseForOrganization(organizationId);

  if (!license) {
    return {
      allowed: false,
      reason: 'NO_LICENSE',
      message: 'No active license found for this organization.',
      details: { organizationId },
    };
  }

  const currentCount = await getProjectCount(license.id);
  const limit = license.max_projects || 20;

  if (currentCount >= limit) {
    return {
      allowed: false,
      reason: 'QUOTA_EXCEEDED',
      message: `Maximum project limit reached (${currentCount}/${limit}). Please upgrade your license or delete unused projects.`,
      details: {
        licenseId: license.id,
        licenseType: license.license_type,
        currentCount,
        limit,
      },
    };
  }

  return {
    allowed: true,
    license,
    usage: {
      currentCount,
      limit,
      remaining: limit - currentCount,
      percentUsed: Math.round((currentCount / limit) * 100),
    },
  };
}

/**
 * Check if storage quota allows new file upload
 */
export async function checkStorageQuota(organizationId, fileSizeMB) {
  const license = await getLicenseForOrganization(organizationId);

  if (!license) {
    return {
      allowed: false,
      reason: 'NO_LICENSE',
      message: 'No active license found for this organization.',
      details: { organizationId },
    };
  }

  const currentUsageGB = await getStorageUsageGB(license.id);
  const fileSizeGB = fileSizeMB / 1024;
  const limit = license.max_storage_gb || 100;

  if (currentUsageGB + fileSizeGB > limit) {
    return {
      allowed: false,
      reason: 'QUOTA_EXCEEDED',
      message: `Storage limit would be exceeded (${(currentUsageGB + fileSizeGB).toFixed(2)}GB/${limit}GB). Please upgrade your license or delete old files.`,
      details: {
        licenseId: license.id,
        licenseType: license.license_type,
        currentUsageGB: currentUsageGB.toFixed(2),
        fileSizeGB: fileSizeGB.toFixed(2),
        limit,
      },
    };
  }

  return {
    allowed: true,
    license,
    usage: {
      currentUsageGB: currentUsageGB.toFixed(2),
      fileSizeGB: fileSizeGB.toFixed(2),
      limit,
      remaining: (limit - currentUsageGB).toFixed(2),
      percentUsed: Math.round((currentUsageGB / limit) * 100),
    },
  };
}

/**
 * Check if user quota allows adding a new user
 */
export async function checkUserQuota(organizationId) {
  const license = await getLicenseForOrganization(organizationId);

  if (!license) {
    return {
      allowed: false,
      reason: 'NO_LICENSE',
      message: 'No active license found for this organization.',
      details: { organizationId },
    };
  }

  const currentCount = await getUserCount(license.id);
  const limit = license.max_users || 10;

  if (currentCount >= limit) {
    return {
      allowed: false,
      reason: 'QUOTA_EXCEEDED',
      message: `User limit reached (${currentCount}/${limit}). Please upgrade your license or deactivate unused users.`,
      details: {
        licenseId: license.id,
        licenseType: license.license_type,
        currentCount,
        limit,
      },
    };
  }

  return {
    allowed: true,
    license,
    usage: {
      currentCount,
      limit,
      remaining: limit - currentCount,
      percentUsed: Math.round((currentCount / limit) * 100),
    },
  };
}

/**
 * Record a submission for usage tracking
 */
export async function recordSubmission(licenseId, submissionType, fileSizeMB, createdBy) {
  try {
    const result = await db.query(
      `INSERT INTO submissions (license_id, submission_type, file_size_mb, created_by, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       RETURNING id, created_at`,
      [licenseId, submissionType, fileSizeMB || 0, createdBy || 'system']
    );

    return result.rows[0];
  } catch (error) {
    console.error('Error recording submission:', error);
    throw new Error('Failed to record submission');
  }
}

/**
 * Get comprehensive usage statistics for a license
 */
export async function getUsageStatistics(organizationId) {
  const license = await getLicenseForOrganization(organizationId);

  if (!license) {
    return null;
  }

  const [monthlySubmissions, totalProjects, totalUsers, storageGB] = await Promise.all([
    getMonthlySubmissionCount(license.id),
    getProjectCount(license.id),
    getUserCount(license.id),
    getStorageUsageGB(license.id),
  ]);

  // Safe division with null/zero protection
  const submissionsLimit = license.max_submissions || 50;
  const projectsLimit = license.max_projects || 20;
  const usersLimit = license.max_users || 10;
  const storageLimit = license.max_storage_gb || 100;

  return {
    licenseId: license.id,
    licenseType: license.license_type,
    status: license.status,
    validUntil: license.valid_until,
    quotas: {
      submissions: {
        current: monthlySubmissions,
        limit: submissionsLimit,
        remaining: Math.max(0, submissionsLimit - monthlySubmissions),
        percentUsed:
          submissionsLimit > 0 ? Math.round((monthlySubmissions / submissionsLimit) * 100) : 0,
      },
      projects: {
        current: totalProjects,
        limit: projectsLimit,
        remaining: Math.max(0, projectsLimit - totalProjects),
        percentUsed: projectsLimit > 0 ? Math.round((totalProjects / projectsLimit) * 100) : 0,
      },
      users: {
        current: totalUsers,
        limit: usersLimit,
        remaining: Math.max(0, usersLimit - totalUsers),
        percentUsed: usersLimit > 0 ? Math.round((totalUsers / usersLimit) * 100) : 0,
      },
      storage: {
        currentGB: parseFloat(storageGB.toFixed(2)),
        limitGB: storageLimit,
        remainingGB: parseFloat((storageLimit - storageGB).toFixed(2)),
        percentUsed: storageLimit > 0 ? Math.round((storageGB / storageLimit) * 100) : 0,
      },
    },
    nextResetDate: getNextMonthStart(),
  };
}

/**
 * Express middleware to enforce submission quotas
 */
export function enforceSubmissionQuota(req, res, next) {
  const organizationId = req.organizationId || req.headers['x-organization-id'];

  if (!organizationId) {
    return res.status(400).json({
      success: false,
      error: 'Organization context required for quota enforcement',
    });
  }

  checkSubmissionQuota(organizationId)
    .then(result => {
      if (!result.allowed) {
        return res.status(403).json({
          success: false,
          error: 'Quota exceeded',
          reason: result.reason,
          message: result.message,
          details: result.details,
        });
      }

      // Attach license and usage info to request for downstream use
      req.license = result.license;
      req.quotaUsage = result.usage;
      next();
    })
    .catch(error => {
      console.error('Quota check error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check quota',
        message: error.message,
      });
    });
}

/**
 * Express middleware to enforce project quotas
 */
export function enforceProjectQuota(req, res, next) {
  const organizationId = req.organizationId || req.headers['x-organization-id'];

  if (!organizationId) {
    return res.status(400).json({
      success: false,
      error: 'Organization context required for quota enforcement',
    });
  }

  checkProjectQuota(organizationId)
    .then(result => {
      if (!result.allowed) {
        return res.status(403).json({
          success: false,
          error: 'Quota exceeded',
          reason: result.reason,
          message: result.message,
          details: result.details,
        });
      }

      req.license = result.license;
      req.quotaUsage = result.usage;
      next();
    })
    .catch(error => {
      console.error('Quota check error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check quota',
        message: error.message,
      });
    });
}

/**
 * Express middleware to enforce user quotas
 */
export function enforceUserQuota(req, res, next) {
  const organizationId = req.organizationId || req.headers['x-organization-id'];

  if (!organizationId) {
    return res.status(400).json({
      success: false,
      error: 'Organization context required for quota enforcement',
    });
  }

  checkUserQuota(organizationId)
    .then(result => {
      if (!result.allowed) {
        return res.status(403).json({
          success: false,
          error: 'Quota exceeded',
          reason: result.reason,
          message: result.message,
          details: result.details,
        });
      }

      req.license = result.license;
      req.quotaUsage = result.usage;
      next();
    })
    .catch(error => {
      console.error('Quota check error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check quota',
        message: error.message,
      });
    });
}

/**
 * Helper function to get next month's start date
 */
function getNextMonthStart() {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toISOString().split('T')[0];
}

export default {
  checkSubmissionQuota,
  checkProjectQuota,
  checkStorageQuota,
  checkUserQuota,
  recordSubmission,
  getUsageStatistics,
  enforceSubmissionQuota,
  enforceProjectQuota,
  enforceUserQuota,
  getLicenseForOrganization,
};
