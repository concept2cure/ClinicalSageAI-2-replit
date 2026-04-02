// server/routes/license-routes.js
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { db } from '../db';

const router = Router();

// Generate a unique private URL for a client
function generatePrivateUrl(clientId, baseUrl) {
  const token = crypto.randomBytes(32).toString('hex');
  return `${baseUrl}/client-access/${clientId}/${token}`;
}

// Generate a license key
function generateLicenseKey() {
  const segments = [];
  for (let i = 0; i < 4; i++) {
    segments.push(crypto.randomBytes(2).toString('hex').toUpperCase());
  }
  return segments.join('-');
}

// Convert snake_case to camelCase for consistent API responses
function toCamelCase(obj) {
  if (!obj) return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (typeof obj !== 'object') return obj;
  
  const converted = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    // Keep values as-is for primitives and dates
    converted[camelKey] = value instanceof Date || value === null || typeof value !== 'object' 
      ? value 
      : toCamelCase(value);
  }
  return converted;
}

// Get license for a specific client
router.get('/api/licenses/client/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const orgId = req.tenantId || req.tenantContext?.organizationId || req.user?.organizationId;

    console.log('Fetching license for client:', clientId, 'org:', orgId);

    // Verify the client belongs to the requesting organization
    if (orgId) {
      const clientCheck = await db.query(`
        SELECT organization_id FROM client_workspaces WHERE id = $1
      `, [clientId]);
      
      if (clientCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Client not found' });
      }
      
      if (clientCheck.rows[0].organization_id !== parseInt(orgId)) {
        return res.status(403).json({ error: 'Access denied to this client' });
      }
    }
    
    const result = await db.query(`
      SELECT 
        l.*,
        COALESCE(COUNT(DISTINCT lu.user_id), 0) as active_users,
        COALESCE(COUNT(DISTINCT s.id), 0) as submissions_used,
        COALESCE(SUM(CASE WHEN s.submission_type = '510k' THEN 1 ELSE 0 END), 0) as fda_510k_count,
        COALESCE(SUM(CASE WHEN s.submission_type = 'PMA' THEN 1 ELSE 0 END), 0) as pma_count,
        COALESCE(SUM(CASE WHEN s.submission_type = 'CER' THEN 1 ELSE 0 END), 0) as cer_count
      FROM licenses l
      LEFT JOIN license_users lu ON l.id = lu.license_id AND lu.active = true
      LEFT JOIN submissions s ON l.id = s.license_id 
        AND s.created_at >= DATE_TRUNC('month', CURRENT_DATE)
      WHERE l.client_id = $1
      GROUP BY l.id
      LIMIT 1
    `, [clientId]);
    
    if (result.rows.length === 0) {
      console.log('No license found for client:', clientId);
      return res.json({ license: null, message: 'No license found for this client' });
    }
    
    const license = result.rows[0];
    console.log('Found license:', license.id, 'for client:', clientId);
    
    // Convert snake_case to camelCase for consistent API response
    const camelLicense = toCamelCase(license);
    
    res.json({ 
      license: {
        ...camelLicense,
        privateUrl: `${req.protocol}://${req.get('host')}/client-access/${clientId}/${license.access_token}`,
        activeUsers: parseInt(license.active_users) || 0,
        submissionsUsed: parseInt(license.submissions_used) || 0,
        fda510kCount: parseInt(license.fda_510k_count) || 0,
        pmaCount: parseInt(license.pma_count) || 0,
        cerCount: parseInt(license.cer_count) || 0,
      }
    });
  } catch (error) {
    console.error('Error fetching client license - Full error:', error.message, error.stack);
    res.status(500).json({ 
      error: 'Failed to fetch client license',
      details: error.message 
    });
  }
});

// Get usage statistics for a client's license
router.get('/api/licenses/client/:clientId/usage', async (req, res) => {
  try {
    const { clientId } = req.params;
    const orgId = req.tenantId || req.tenantContext?.organizationId || req.user?.organizationId;

    console.log('Fetching usage for client:', clientId, 'org:', orgId);

    // Verify the client belongs to the requesting organization
    if (orgId) {
      const clientCheck = await db.query(`
        SELECT organization_id FROM client_workspaces WHERE id = $1
      `, [clientId]);
      
      if (clientCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Client not found' });
      }
      
      if (clientCheck.rows[0].organization_id !== parseInt(orgId)) {
        return res.status(403).json({ error: 'Access denied to this client' });
      }
    }
    
    // First get the license ID for this client
    const licenseResult = await db.query(`
      SELECT id FROM licenses WHERE client_id = $1 LIMIT 1
    `, [clientId]);
    
    if (licenseResult.rows.length === 0) {
      console.log('No license found for client usage:', clientId);
      return res.json({ 
        usage: {
          activeUsers: 0,
          totalSubmissions: 0,
          monthlySubmissions: 0,
          dailySubmissions: 0,
          totalStorageUsedMB: 0,
          totalStorageUsedGB: 0,
          activeProjects: 0,
          fda510kCount: 0,
          pmaCount: 0,
          cerCount: 0,
        },
        message: 'No license found for this client' 
      });
    }
    
    const licenseId = licenseResult.rows[0].id;
    console.log('Found license for usage:', licenseId);
    
    const usageResult = await db.query(`
      SELECT 
        COALESCE(COUNT(DISTINCT lu.user_id), 0) as active_users,
        COALESCE(COUNT(DISTINCT s.id), 0) as total_submissions,
        COALESCE(SUM(CASE WHEN s.created_at >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 ELSE 0 END), 0) as monthly_submissions,
        COALESCE(SUM(CASE WHEN s.submission_type = '510k' THEN 1 ELSE 0 END), 0) as fda510k_count,
        COALESCE(SUM(CASE WHEN s.submission_type = 'PMA' THEN 1 ELSE 0 END), 0) as pma_count,
        COALESCE(SUM(CASE WHEN s.submission_type = 'CER' THEN 1 ELSE 0 END), 0) as cer_count,
        COALESCE(SUM(CASE WHEN s.created_at >= DATE_TRUNC('day', CURRENT_DATE) THEN 1 ELSE 0 END), 0) as daily_submissions,
        COALESCE(SUM(s.file_size_mb), 0) as total_storage_used_mb,
        COALESCE(COUNT(DISTINCT p.id), 0) as active_projects
      FROM licenses l
      LEFT JOIN license_users lu ON l.id = lu.license_id AND lu.active = true
      LEFT JOIN submissions s ON l.id = s.license_id
      LEFT JOIN projects p ON l.id = p.license_id AND p.status = 'active'
      WHERE l.id = $1
      GROUP BY l.id
    `, [licenseId]);
    
    // Default values if no result
    const defaultUsage = {
      activeUsers: 0,
      totalSubmissions: 0,
      monthlySubmissions: 0,
      dailySubmissions: 0,
      totalStorageUsedMB: 0,
      totalStorageUsedGB: 0,
      activeProjects: 0,
      fda510kCount: 0,
      pmaCount: 0,
      cerCount: 0,
    };
    
    if (usageResult.rows.length === 0) {
      return res.json({ usage: defaultUsage });
    }
    
    const usage = usageResult.rows[0];
    
    res.json({
      usage: {
        activeUsers: parseInt(usage.active_users) || 0,
        totalSubmissions: parseInt(usage.total_submissions) || 0,
        monthlySubmissions: parseInt(usage.monthly_submissions) || 0,
        dailySubmissions: parseInt(usage.daily_submissions) || 0,
        totalStorageUsedMB: parseFloat(usage.total_storage_used_mb) || 0,
        totalStorageUsedGB: (parseFloat(usage.total_storage_used_mb) || 0) / 1024,
        activeProjects: parseInt(usage.active_projects) || 0,
        fda510kCount: parseInt(usage.fda510k_count) || 0,
        pmaCount: parseInt(usage.pma_count) || 0,
        cerCount: parseInt(usage.cer_count) || 0,
      }
    });
  } catch (error) {
    console.error('Error fetching client license usage - Full error:', error.message, error.stack);
    res.status(500).json({ 
      error: 'Failed to fetch client license usage',
      details: error.message 
    });
  }
});

// Get all licenses for the organization
router.get('/api/licenses', async (req, res) => {
  try {
    const orgId = req.tenantId || req.tenantContext?.organizationId || req.user?.organizationId;

    if (!orgId) {
      return res.status(403).json({ error: 'Organization context required' });
    }

    // Build query with organization filtering (cast client_id to match integer type)
    const query = `
      SELECT 
        l.*,
        COUNT(DISTINCT lu.user_id) as active_users,
        COUNT(DISTINCT s.id) as submissions_used
      FROM licenses l
      INNER JOIN client_workspaces cw ON l.client_id::integer = cw.id
      LEFT JOIN license_users lu ON l.id = lu.license_id AND lu.active = true
      LEFT JOIN submissions s ON l.id = s.license_id 
        AND s.created_at >= DATE_TRUNC('month', CURRENT_DATE)
      WHERE cw.organization_id = $1
      GROUP BY l.id
      ORDER BY l.created_at DESC
    `;
    
    const result = await db.query(query, [parseInt(orgId)]);
    
    res.json({ 
      licenses: result.rows.map(license => ({
        ...license,
        privateUrl: `${req.protocol}://${req.get('host')}/client-access/${license.id}/${license.access_token}`,
        activeUsers: parseInt(license.active_users) || 0,
        submissionsUsed: parseInt(license.submissions_used) || 0,
      }))
    });
  } catch (error) {
    console.error('Error fetching licenses:', error);
    res.status(500).json({ error: 'Failed to fetch licenses' });
  }
});

// Get license by ID (with organization validation)
router.get('/api/licenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.tenantId || req.tenantContext?.organizationId || req.user?.organizationId;

    if (!orgId) {
      return res.status(403).json({ error: 'Organization context required' });
    }

    const result = await db.query(`
      SELECT
        l.*,
        COUNT(DISTINCT lu.user_id) as active_users,
        COUNT(DISTINCT s.id) as submissions_used,
        SUM(CASE WHEN s.created_at >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 ELSE 0 END) as monthly_submissions,
        SUM(CASE WHEN s.created_at >= DATE_TRUNC('week', CURRENT_DATE) THEN 1 ELSE 0 END) as weekly_submissions
      FROM licenses l
      INNER JOIN client_workspaces cw ON l.client_id::integer = cw.id
      LEFT JOIN license_users lu ON l.id = lu.license_id AND lu.active = true
      LEFT JOIN submissions s ON l.id = s.license_id
      WHERE l.id = $1 AND cw.organization_id = $2
      GROUP BY l.id
    `, [id, parseInt(orgId)]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'License not found' });
    }
    
    const license = result.rows[0];
    res.json({ 
      license: {
        ...license,
        privateUrl: `${req.protocol}://${req.get('host')}/client-access/${license.id}/${license.access_token}`,
        activeUsers: parseInt(license.active_users) || 0,
        submissionsUsed: parseInt(license.submissions_used) || 0,
        monthlySubmissions: parseInt(license.monthly_submissions) || 0,
        weeklySubmissions: parseInt(license.weekly_submissions) || 0,
      }
    });
  } catch (error) {
    console.error('Error fetching license:', error);
    res.status(500).json({ error: 'Failed to fetch license' });
  }
});

// Create new license
router.post('/api/licenses', async (req, res) => {
  try {
    const {
      clientId,
      clientName,
      companyName,
      contactEmail,
      licenseType = 'professional',
      maxUsers = 10,
      maxSubmissions = 100,
      maxStorageGB = 100,
      maxProjects = 50,
      features = {},
      validFrom,
      validUntil,
      ipRestrictions,
      notes,
    } = req.body;
    
    const orgId = req.tenantId || req.tenantContext?.organizationId || req.user?.organizationId;

    console.log('Creating license with data:', {
      clientId,
      clientName,
      companyName,
      licenseType,
      maxUsers,
      maxSubmissions,
      maxProjects,
      orgId
    });
    
    // Verify the client belongs to the requesting organization
    if (orgId && clientId) {
      const clientCheck = await db.query(`
        SELECT organization_id FROM client_workspaces WHERE id = $1
      `, [clientId]);
      
      if (clientCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Client not found' });
      }
      
      if (clientCheck.rows[0].organization_id !== parseInt(orgId)) {
        return res.status(403).json({ error: 'Access denied to this client' });
      }
    }
    
    // Ensure numeric values are properly parsed and not NaN
    const parsedMaxUsers = parseInt(maxUsers) || 10;
    const parsedMaxSubmissions = parseInt(maxSubmissions) || 100;
    const parsedMaxProjects = parseInt(maxProjects) || 50;
    const parsedMaxStorageGB = parseInt(maxStorageGB) || 100;
    
    // Ensure dates are properly formatted
    const formattedValidFrom = validFrom || new Date().toISOString().split('T')[0];
    const formattedValidUntil = validUntil || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const licenseId = uuidv4();
    const licenseKey = generateLicenseKey();
    const accessToken = crypto.randomBytes(32).toString('hex');
    const privateUrl = `${req.protocol}://${req.get('host')}/client-access/${clientId}/${accessToken}`;
    
    const result = await db.query(`
      INSERT INTO licenses (
        id, client_id, client_name, company_name, contact_email,
        license_type, license_key, access_token,
        max_users, max_submissions, max_storage_gb, max_projects,
        features, valid_from, valid_until,
        ip_restrictions, notes, status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
      ) RETURNING *
    `, [
      licenseId, clientId, clientName, companyName, contactEmail,
      licenseType, licenseKey, accessToken,
      parsedMaxUsers, parsedMaxSubmissions, parsedMaxStorageGB, parsedMaxProjects,
      JSON.stringify(features), formattedValidFrom, formattedValidUntil,
      ipRestrictions, notes, 'active', new Date(), new Date()
    ]);
    
    console.log('License created successfully:', licenseId);
    
    res.status(201).json({ 
      license: {
        ...result.rows[0],
        privateUrl,
        licenseKey,
        accessToken,
      },
      message: 'License created successfully'
    });
  } catch (error) {
    console.error('Error creating license - Full error:', error.message, error.stack);
    res.status(500).json({ 
      error: 'Failed to create license',
      details: error.message 
    });
  }
});

// Update license (with organization validation)
router.put('/api/licenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.tenantId || req.tenantContext?.organizationId || req.user?.organizationId;
    const updates = req.body;

    if (!orgId) {
      return res.status(403).json({ error: 'Organization context required' });
    }

    // First verify the license belongs to this organization (cast client_id to integer)
    const ownershipCheck = await db.query(`
      SELECT l.id 
      FROM licenses l
      INNER JOIN client_workspaces cw ON l.client_id::integer = cw.id
      WHERE l.id = $1 AND cw.organization_id = $2
    `, [id, parseInt(orgId)]);
    
    if (ownershipCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this license' });
    }
    
    // Build dynamic update query
    const updateFields = [];
    const values = [];
    let paramCount = 1;
    
    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at' && key !== 'access_token') {
        updateFields.push(`${key} = $${paramCount}`);
        values.push(key === 'features' ? JSON.stringify(value) : value);
        paramCount++;
      }
    });
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    values.push(id);
    const query = `
      UPDATE licenses 
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await db.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'License not found' });
    }
    
    res.json({ 
      license: result.rows[0],
      message: 'License updated successfully'
    });
  } catch (error) {
    console.error('Error updating license:', error);
    res.status(500).json({ error: 'Failed to update license' });
  }
});

// Revoke license
router.post('/api/licenses/:id/revoke', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(`
      UPDATE licenses 
      SET status = 'revoked', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'License not found' });
    }
    
    res.json({ 
      message: 'License revoked successfully',
      license: result.rows[0]
    });
  } catch (error) {
    console.error('Error revoking license:', error);
    res.status(500).json({ error: 'Failed to revoke license' });
  }
});

// Regenerate access key
router.post('/api/licenses/:id/regenerate-key', async (req, res) => {
  try {
    const { id } = req.params;
    const newAccessToken = crypto.randomBytes(32).toString('hex');
    
    const result = await db.query(`
      UPDATE licenses 
      SET access_token = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [newAccessToken, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'License not found' });
    }
    
    const license = result.rows[0];
    const privateUrl = `${req.protocol}://${req.get('host')}/client-access/${license.id}/${newAccessToken}`;
    
    res.json({ 
      message: 'Access key regenerated successfully',
      license: {
        ...license,
        privateUrl,
      }
    });
  } catch (error) {
    console.error('Error regenerating access key:', error);
    res.status(500).json({ error: 'Failed to regenerate access key' });
  }
});

// Get license usage statistics
router.get('/api/licenses/:id/usage', async (req, res) => {
  try {
    const { id } = req.params;
    
    const usageResult = await db.query(`
      SELECT 
        COUNT(DISTINCT lu.user_id) as active_users,
        COUNT(DISTINCT s.id) as total_submissions,
        SUM(CASE WHEN s.created_at >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 ELSE 0 END) as monthly_submissions,
        SUM(CASE WHEN s.created_at >= DATE_TRUNC('day', CURRENT_DATE) THEN 1 ELSE 0 END) as daily_submissions,
        COALESCE(SUM(s.file_size_mb), 0) as total_storage_used_mb,
        COUNT(DISTINCT p.id) as active_projects
      FROM licenses l
      LEFT JOIN license_users lu ON l.id = lu.license_id AND lu.active = true
      LEFT JOIN submissions s ON l.id = s.license_id
      LEFT JOIN projects p ON l.id = p.license_id AND p.status = 'active'
      WHERE l.id = $1
      GROUP BY l.id
    `, [id]);
    
    if (usageResult.rows.length === 0) {
      return res.status(404).json({ error: 'License not found' });
    }
    
    const usage = usageResult.rows[0];
    
    // Get daily usage trend for the last 30 days
    const trendResult = await db.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as submissions
      FROM submissions
      WHERE license_id = $1 
        AND created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [id]);
    
    res.json({
      usage: {
        activeUsers: parseInt(usage.active_users) || 0,
        totalSubmissions: parseInt(usage.total_submissions) || 0,
        monthlySubmissions: parseInt(usage.monthly_submissions) || 0,
        dailySubmissions: parseInt(usage.daily_submissions) || 0,
        totalStorageUsedMB: parseFloat(usage.total_storage_used_mb) || 0,
        totalStorageUsedGB: (parseFloat(usage.total_storage_used_mb) || 0) / 1024,
        activeProjects: parseInt(usage.active_projects) || 0,
        dailyTrend: trendResult.rows,
      }
    });
  } catch (error) {
    console.error('Error fetching license usage:', error);
    res.status(500).json({ error: 'Failed to fetch license usage' });
  }
});

// Validate client access with license key and token
router.post('/api/licenses/validate-access', async (req, res) => {
  try {
    const { licenseId, accessToken, ipAddress } = req.body;
    
    const result = await db.query(`
      SELECT id, client_id, client_name, company_name, contact_email,
             license_type, license_key, access_token,
             max_users, max_submissions, max_storage_gb, max_projects,
             features, valid_from, valid_until,
             ip_restrictions, notes, status, created_at, updated_at
      FROM licenses
      WHERE id = $1 AND access_token = $2 AND status = 'active'
    `, [licenseId, accessToken]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        valid: false, 
        error: 'Invalid license or access token' 
      });
    }
    
    const license = result.rows[0];
    const now = new Date();
    const validFrom = new Date(license.valid_from);
    const validUntil = new Date(license.valid_until);
    
    // Check if license is within valid date range
    if (now < validFrom || now > validUntil) {
      return res.status(401).json({ 
        valid: false, 
        error: 'License expired or not yet valid' 
      });
    }
    
    // Check IP restrictions if configured
    if (license.ip_restrictions) {
      const allowedIPs = license.ip_restrictions.split('\n').filter(ip => ip.trim());
      if (allowedIPs.length > 0 && !allowedIPs.includes(ipAddress)) {
        return res.status(401).json({ 
          valid: false, 
          error: 'Access denied from this IP address' 
        });
      }
    }
    
    // Log access
    await db.query(`
      INSERT INTO license_access_logs (license_id, ip_address, accessed_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
    `, [licenseId, ipAddress]);
    
    res.json({ 
      valid: true,
      license: {
        id: license.id,
        clientName: license.client_name,
        companyName: license.company_name,
        licenseType: license.license_type,
        features: license.features,
        maxUsers: license.max_users,
        maxSubmissions: license.max_submissions,
        maxProjects: license.max_projects,
        maxStorageGB: license.max_storage_gb,
        validUntil: license.valid_until,
      }
    });
  } catch (error) {
    console.error('Error validating license access:', error);
    res.status(500).json({ error: 'Failed to validate license access' });
  }
});

export default router;