/**
 * Commitment Intelligence Hub API Routes
 *
 * Core API endpoints for the Commitment Intelligence Hub:
 * - POST /api/commitments (create new commitments)
 * - GET /api/commitments (retrieve with filtering/sorting)
 * - GET /api/commitments/:id (retrieve single commitment)
 * - PUT /api/commitments/:id (update existing commitment)
 * - DELETE /api/commitments/:id (delete commitment)
 * - POST /api/commitments/discover (proactive AI discovery)
 * - POST /api/commitments/:id/verify (automated compliance verification)
 * - POST /api/commitments/:id/remediate (generate remediation plan)
 * - GET /api/commitments/analytics (commitment analytics)
 */

import express from 'express';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import CommitmentIntelligenceService from '../services/CommitmentIntelligenceService.js';

const router = express.Router();

// Initialize database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Initialize Commitment Intelligence Service
const commitmentService = new CommitmentIntelligenceService();

/**
 * Helper function to extract tenant context
 */
function extractTenantContext(req) {
  return {
    tenantId: req.headers['x-tenant-id'] || 'default-tenant',
    userId: req.headers['x-user-id'] || 1,
    organizationId: req.headers['x-org-id'] || null,
    clientWorkspaceId: req.headers['x-client-id'] || null,
    module: req.headers['x-module'] || 'commitment-intelligence',
  };
}

/**
 * POST /api/commitments
 * Create new commitment
 */
router.post('/', async (req, res) => {
  try {
    const { tenantId, userId } = extractTenantContext(req);
    const {
      description,
      due_date,
      authority,
      priority,
      commitment_type,
      regulatory_section,
      risk_level,
      assigned_to_user_id,
      assigned_to_team_id,
      assigned_to_role,
      internal_notes,
      linked_entities,
      reminder_date,
      reminder_frequency,
      estimated_cost,
      estimated_hours,
      document_id,
      document_version,
    } = req.body;

    // Validate required fields
    if (!description) {
      return res.status(400).json({ error: 'Description is required' });
    }

    const commitmentId = uuidv4();

    const query = `
            INSERT INTO regulatory_commitments (
                id, description, due_date, authority, priority, commitment_type,
                regulatory_section, risk_level, assigned_to_user_id, assigned_to_team_id,
                assigned_to_role, internal_notes, linked_entities, reminder_date,
                reminder_frequency, estimated_cost, estimated_hours, document_id,
                document_version, tenant_id, created_by, status
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
            ) RETURNING *;
        `;

    const values = [
      commitmentId,
      description,
      due_date,
      authority,
      priority,
      commitment_type,
      regulatory_section,
      risk_level,
      assigned_to_user_id,
      assigned_to_team_id,
      assigned_to_role,
      internal_notes,
      JSON.stringify(linked_entities || []),
      reminder_date,
      reminder_frequency,
      estimated_cost,
      estimated_hours,
      document_id,
      document_version,
      tenantId,
      userId,
      'Active',
    ];

    const result = await pool.query(query, values);

    // Log audit event
    await commitmentService.logAuditEvent('COMMITMENT_CREATED', commitmentId, tenantId, userId, {
      source: 'Manual_Creation',
      commitmentType: commitment_type,
    });

    res.status(201).json({
      success: true,
      commitment: result.rows[0],
      message: 'Commitment created successfully',
    });
  } catch (error) {
    console.error('Create Commitment Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/commitments
 * Retrieve commitments with filtering and sorting
 */
router.get('/', async (req, res) => {
  try {
    const { tenantId } = extractTenantContext(req);
    const {
      status,
      priority,
      authority,
      commitment_type,
      assigned_to_user_id,
      risk_level,
      page = 1,
      limit = 50,
      sort_by = 'created_at',
      sort_order = 'DESC',
    } = req.query;

    // Build WHERE clause dynamically
    let whereClause = 'WHERE tenant_id = $1';
    const queryParams = [tenantId];
    let paramIndex = 2;

    if (status) {
      whereClause += ` AND status = $${paramIndex}`;
      queryParams.push(status);
      paramIndex++;
    }

    if (priority) {
      whereClause += ` AND priority = $${paramIndex}`;
      queryParams.push(priority);
      paramIndex++;
    }

    if (authority) {
      whereClause += ` AND authority = $${paramIndex}`;
      queryParams.push(authority);
      paramIndex++;
    }

    if (commitment_type) {
      whereClause += ` AND commitment_type = $${paramIndex}`;
      queryParams.push(commitment_type);
      paramIndex++;
    }

    if (assigned_to_user_id) {
      whereClause += ` AND assigned_to_user_id = $${paramIndex}`;
      queryParams.push(assigned_to_user_id);
      paramIndex++;
    }

    if (risk_level) {
      whereClause += ` AND risk_level = $${paramIndex}`;
      queryParams.push(risk_level);
      paramIndex++;
    }

    // Calculate offset
    const offset = (page - 1) * limit;

    // Main query
    const query = `
            SELECT 
                id, description, due_date, authority, priority, commitment_type,
                regulatory_section, risk_level, status, assigned_to_user_id,
                assigned_to_team_id, assigned_to_role, internal_notes,
                linked_entities, reminder_date, reminder_frequency,
                estimated_cost, estimated_hours, document_id, document_version,
                ai_discovery_confidence, ai_discovery_source, predictive_risk_score,
                automated_verification_status, created_at, updated_at
            FROM regulatory_commitments
            ${whereClause}
            ORDER BY ${sort_by} ${sort_order}
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

    queryParams.push(limit, offset);

    // Count query
    const countQuery = `
            SELECT COUNT(*) as total
            FROM regulatory_commitments
            ${whereClause}
        `;

    const [result, countResult] = await Promise.all([
      pool.query(query, queryParams),
      pool.query(countQuery, queryParams.slice(0, -2)), // Remove limit and offset
    ]);

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      commitments: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error('Get Commitments Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/commitments/metrics
 * Real-time Performance Metrics Dashboard
 */
router.get('/metrics', async (req, res) => {
  try {
    const { tenantId } = extractTenantContext(req);

    // Calculate real-time metrics
    const metricsQuery = `
            SELECT 
                COUNT(*) as total_commitments,
                COUNT(CASE WHEN priority = 'Critical' THEN 1 END) as critical_commitments,
                COUNT(CASE WHEN due_date IS NOT NULL AND due_date <= NOW() + INTERVAL '30 days' THEN 1 END) as upcoming_deadlines,
                COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed_commitments,
                COUNT(CASE WHEN status = 'Active' THEN 1 END) as active_commitments,
                COUNT(CASE WHEN status = 'In Progress' THEN 1 END) as in_progress_commitments,
                AVG(CASE WHEN risk_level = 'High' THEN 30 
                         WHEN risk_level = 'Medium' THEN 20 
                         ELSE 10 END) as avg_risk_score
            FROM regulatory_commitments 
            WHERE tenant_id = $1
        `;

    const result = await pool.query(metricsQuery, [tenantId]);
    const metrics = result.rows[0];

    // Calculate compliance score
    const totalCommitments = parseInt(metrics.total_commitments);
    const completedCommitments = parseInt(metrics.completed_commitments);
    const complianceScore =
      totalCommitments > 0 ? Math.round((completedCommitments / totalCommitments) * 100) : 0;

    res.json({
      success: true,
      totalCommitments: totalCommitments,
      criticalCommitments: parseInt(metrics.critical_commitments),
      upcomingDeadlines: parseInt(metrics.upcoming_deadlines),
      complianceScore: complianceScore,
      activeCommitments: parseInt(metrics.active_commitments),
      inProgressCommitments: parseInt(metrics.in_progress_commitments),
      completedCommitments: completedCommitments,
      avgRiskScore: parseFloat(metrics.avg_risk_score) || 0,
      riskLevel:
        parseFloat(metrics.avg_risk_score) > 25
          ? 'high'
          : parseFloat(metrics.avg_risk_score) > 15
            ? 'medium'
            : 'low',
    });
  } catch (error) {
    console.error('Metrics Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/commitments/:id
 * Retrieve single commitment
 */
router.get('/:id', async (req, res) => {
  try {
    const { tenantId } = extractTenantContext(req);
    const { id } = req.params;

    // Validate UUID format to prevent parsing errors
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid commitment ID format' });
    }

    const query = `
            SELECT * FROM regulatory_commitments
            WHERE id = $1 AND tenant_id = $2
        `;

    const result = await pool.query(query, [id, tenantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Commitment not found' });
    }

    res.json({
      success: true,
      commitment: result.rows[0],
    });
  } catch (error) {
    console.error('Get Commitment Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/commitments/:id
 * Update existing commitment
 */
router.put('/:id', async (req, res) => {
  try {
    const { tenantId, userId } = extractTenantContext(req);
    const { id } = req.params;
    const updateData = req.body;

    // Remove fields that shouldn't be updated directly
    delete updateData.id;
    delete updateData.tenant_id;
    delete updateData.created_at;
    delete updateData.created_by;

    // Add updated timestamp and user
    updateData.updated_at = new Date();
    updateData.updated_by = userId;

    // Build dynamic update query
    const updateFields = Object.keys(updateData);
    const setClause = updateFields.map((field, index) => `${field} = $${index + 3}`).join(', ');
    const values = [id, tenantId, ...updateFields.map(field => updateData[field])];

    const query = `
            UPDATE regulatory_commitments 
            SET ${setClause}
            WHERE id = $1 AND tenant_id = $2
            RETURNING *;
        `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Commitment not found' });
    }

    // Log audit event
    await commitmentService.logAuditEvent('COMMITMENT_UPDATED', id, tenantId, userId, {
      updatedFields: updateFields,
      previousStatus: result.rows[0].status,
    });

    res.json({
      success: true,
      commitment: result.rows[0],
      message: 'Commitment updated successfully',
    });
  } catch (error) {
    console.error('Update Commitment Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/commitments/:id
 * Delete commitment
 */
router.delete('/:id', async (req, res) => {
  try {
    const { tenantId, userId } = extractTenantContext(req);
    const { id } = req.params;

    const query = `
            DELETE FROM regulatory_commitments
            WHERE id = $1 AND tenant_id = $2
            RETURNING id, description;
        `;

    const result = await pool.query(query, [id, tenantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Commitment not found' });
    }

    // Log audit event
    await commitmentService.logAuditEvent('COMMITMENT_DELETED', id, tenantId, userId, {
      deletedCommitment: result.rows[0],
    });

    res.json({
      success: true,
      message: 'Commitment deleted successfully',
    });
  } catch (error) {
    console.error('Delete Commitment Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/commitments/discover
 * Proactive AI discovery of commitments from document
 */
router.post('/discover', async (req, res) => {
  try {
    const { tenantId, userId } = extractTenantContext(req);
    const { document_text, document_id } = req.body;

    if (!document_text) {
      return res.status(400).json({ error: 'Document text is required' });
    }

    const discoveryResult = await commitmentService.proactiveDiscovery(
      document_text,
      document_id,
      tenantId,
      userId
    );

    res.json({
      success: discoveryResult.success,
      commitments: discoveryResult.commitments,
      metadata: discoveryResult.discoveryMetadata,
      message: `Discovered ${discoveryResult.commitments.length} potential commitments`,
    });
  } catch (error) {
    console.error('Proactive Discovery Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/commitments/:id/verify
 * Automated compliance verification
 */
router.post('/:id/verify', async (req, res) => {
  try {
    const { tenantId, userId } = extractTenantContext(req);
    const { id } = req.params;

    const verificationResult = await commitmentService.verifyCompliance(id, tenantId);

    // Log audit event
    await commitmentService.logAuditEvent('COMMITMENT_VERIFIED', id, tenantId, userId, {
      verificationStatus: verificationResult.status,
      confidence: verificationResult.confidence,
    });

    res.json({
      success: true,
      verification: verificationResult,
      message: 'Compliance verification completed',
    });
  } catch (error) {
    console.error('Verification Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/commitments/:id/remediate
 * Generate AI-powered remediation plan
 */
router.post('/:id/remediate', async (req, res) => {
  try {
    const { tenantId, userId } = extractTenantContext(req);
    const { id } = req.params;

    const remediationPlan = await commitmentService.generateRemediationPlan(id, tenantId);

    // Log audit event
    await commitmentService.logAuditEvent('REMEDIATION_PLAN_GENERATED', id, tenantId, userId, {
      planConfidence: remediationPlan.confidence,
    });

    res.json({
      success: true,
      remediationPlan,
      message: 'Remediation plan generated successfully',
    });
  } catch (error) {
    console.error('Remediation Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/commitments/analytics
 * Get commitment analytics and statistics
 */
router.get('/analytics', async (req, res) => {
  try {
    const { tenantId } = extractTenantContext(req);

    const analytics = await commitmentService.getCommitmentAnalytics(tenantId);

    res.json({
      success: true,
      analytics,
      message: 'Analytics retrieved successfully',
    });
  } catch (error) {
    console.error('Analytics Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
