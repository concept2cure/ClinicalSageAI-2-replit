import express from 'express';
import { getPool } from '../../db';
import { z } from 'zod';

const router = express.Router();

// Validation schemas
const createSpecSchema = z.object({
  projectId: z.string().uuid().optional(),
  materialType: z.string().min(1, 'Material type is required'),
  materialName: z.string().min(1, 'Material name is required'),
  testParameters: z.any().optional(),
  acceptanceCriteria: z.any().optional(),
  testMethods: z.any().optional(),
  justification: z.string().optional(),
  regulatoryBasis: z.any().optional(),
  approvalStatus: z.string().optional().default('draft'),
});

const updateSpecSchema = z.object({
  materialType: z.string().optional(),
  materialName: z.string().optional(),
  testParameters: z.any().optional(),
  acceptanceCriteria: z.any().optional(),
  testMethods: z.any().optional(),
  justification: z.string().optional(),
  regulatoryBasis: z.any().optional(),
  approvalStatus: z.string().optional(),
  changedBy: z.string().optional(),
});

// GET /api/cmc/specifications/:projectId - List specs for a project
router.get('/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const tenantId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }
    const pool = getPool();


    const result = await pool.query(
      `SELECT * FROM quality_specifications
       WHERE project_id = $1 AND (tenant_id = $2 OR tenant_id IS NULL)
       ORDER BY created_at DESC`,
      [projectId, tenantId]
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC Specs] Error fetching specifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch specifications',
      message: 'Operation failed',
    });
  }
});

// POST /api/cmc/specifications - Create specification
router.post('/', async (req, res) => {
  try {
    const validationResult = createSpecSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data',
        details: validationResult.error.errors,
      });
    }

    const data = validationResult.data;
    const pool = getPool();
    const tenantId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }


    const result = await pool.query(
      `INSERT INTO quality_specifications (
        project_id, tenant_id, material_type, material_name,
        test_parameters, acceptance_criteria, test_methods,
        justification, regulatory_basis, approval_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        data.projectId || null,
        tenantId,
        data.materialType,
        data.materialName,
        JSON.stringify(data.testParameters || null),
        JSON.stringify(data.acceptanceCriteria || null),
        JSON.stringify(data.testMethods || null),
        data.justification || null,
        JSON.stringify(data.regulatoryBasis || null),
        data.approvalStatus || 'draft',
      ]
    );

    const spec = result.rows[0];

    // Log audit trail
    await pool.query(
      `INSERT INTO specification_audit_log (specification_id, action, changed_by, new_values)
       VALUES ($1, 'created', $2, $3)`,
      [spec.id, 'system', JSON.stringify(spec)]
    );

    console.log(`[CMC Specs] Created specification ${spec.id} for ${data.materialName}`);

    res.status(201).json({
      success: true,
      data: spec,
      message: 'Specification created successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC Specs] Error creating specification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create specification',
      message: 'Operation failed',
    });
  }
});

// PUT /api/cmc/specifications/:id - Update specification
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const validationResult = updateSpecSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data',
        details: validationResult.error.errors,
      });
    }

    const data = validationResult.data;
    const pool = getPool();
    const tenantId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }


    // Get current spec for audit trail (with tenant filter)
    const currentResult = await pool.query(
      `SELECT * FROM quality_specifications WHERE id = $1 AND (tenant_id = $2 OR tenant_id IS NULL)`,
      [id, tenantId]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Specification not found',
      });
    }

    const currentSpec = currentResult.rows[0];

    // Build dynamic update
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      materialType: 'material_type',
      materialName: 'material_name',
      testParameters: 'test_parameters',
      acceptanceCriteria: 'acceptance_criteria',
      testMethods: 'test_methods',
      justification: 'justification',
      regulatoryBasis: 'regulatory_basis',
      approvalStatus: 'approval_status',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if ((data as any)[key] !== undefined) {
        updates.push(`${col} = $${paramIndex}`);
        const val = (data as any)[key];
        values.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No updates provided' });
    }

    values.push(id);
    const updateQuery = `
      UPDATE quality_specifications
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const updateResult = await pool.query(updateQuery, values);
    const updatedSpec = updateResult.rows[0];

    // Log audit trail
    await pool.query(
      `INSERT INTO specification_audit_log (specification_id, action, changed_by, previous_values, new_values)
       VALUES ($1, 'updated', $2, $3, $4)`,
      [id, data.changedBy || 'system', JSON.stringify(currentSpec), JSON.stringify(updatedSpec)]
    );

    console.log(`[CMC Specs] Updated specification ${id}`);

    res.json({
      success: true,
      data: updatedSpec,
      message: 'Specification updated successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC Specs] Error updating specification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update specification',
      message: 'Operation failed',
    });
  }
});

// GET /api/cmc/specifications/:id/history - Audit trail for a specification
router.get('/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: 'Tenant context required' });
    }
    const pool = getPool();


    const result = await pool.query(
      `SELECT sal.* FROM specification_audit_log sal
       JOIN quality_specifications qs ON qs.id = sal.specification_id
       WHERE sal.specification_id = $1 AND (qs.tenant_id = $2 OR qs.tenant_id IS NULL)
       ORDER BY sal.created_at DESC`,
      [id, tenantId]
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC Specs] Error fetching specification history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch specification history',
      message: 'Operation failed',
    });
  }
});

export default router;
