import express from 'express';
import { getPool } from '../../db';
import { z } from 'zod';
import { writeThroughSpecification } from '../../services/cmc-write-through';
import { recordGovernedAction, verifyReauth } from '../../routes/c2c/actions';

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

// Governed approval: high-risk e-signature. Approval can ONLY happen here, not
// via the ungoverned PUT path.
const approveSpecSchema = z.object({
  reason: z.string().min(8, 'A reason of at least 8 characters is required.'),
  reauth: z
    .object({
      password: z.string().optional(),
      totp: z.string().optional(),
    })
    .optional(),
  idempotencyKey: z.string().optional(),
});

function resolveActorUserId(req: express.Request): number {
  const r = req as any;
  const raw = r.userId ?? r.user?.id ?? 0;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

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
    // Write-through: upsert canonical source object for Module 3
    if (spec.project_id) {
      writeThroughSpecification(Number(tenantId), spec.project_id, String(spec.id), spec).catch(() => {});
    }

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

    // approvalStatus is intentionally excluded: approval can ONLY happen via the
    // governed POST /:id/approve endpoint, never through this ungoverned PUT.
    const fieldMap: Record<string, string> = {
      materialType: 'material_type',
      materialName: 'material_name',
      testParameters: 'test_parameters',
      acceptanceCriteria: 'acceptance_criteria',
      testMethods: 'test_methods',
      justification: 'justification',
      regulatoryBasis: 'regulatory_basis',
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
    // Write-through: upsert canonical source object for Module 3
    if (updatedSpec?.project_id) {
      writeThroughSpecification(Number(tenantId), updatedSpec.project_id, String(id), updatedSpec).catch(() => {});
    }

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

// POST /api/cmc/specifications/:id/approve - Governed e-signature approval
// (high-risk sign). The ONLY path to approval; routed through the
// mutation-primitives ledger (audit_logs + c2c_ana_actions).
router.post('/:id/approve', async (req, res) => {
  const { id } = req.params;
  const validationResult = approveSpecSchema.safeParse(req.body);
  if (!validationResult.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid input data',
      details: validationResult.error.errors,
    });
  }
  const { reason, reauth, idempotencyKey } = validationResult.data;

  const tenantRaw = (req as any).tenantId || (req as any).tenantContext?.organizationId;
  const orgId = typeof tenantRaw === 'string' ? parseInt(tenantRaw, 10) : Number(tenantRaw);
  if (!Number.isFinite(orgId) || orgId <= 0) {
    return res.status(401).json({ error: 'Tenant context required' });
  }
  const userId = resolveActorUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'AUTH_REQUIRED' });
  }

  // Re-auth gate FIRST (high-risk).
  const reauthResult = await verifyReauth(userId, reauth);
  if (!reauthResult.ok) {
    res.setHeader('WWW-Authenticate', 'ReAuth required');
    return res.status(401).json({ error: reauthResult.error ?? 'REAUTH_REQUIRED' });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify the spec exists for this tenant.
    const current = await client.query(
      `SELECT * FROM quality_specifications WHERE id = $1 AND (tenant_id = $2 OR tenant_id IS NULL)`,
      [id, orgId],
    );
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Specification not found' });
    }

    const updateResult = await client.query(
      `UPDATE quality_specifications
       SET approval_status = 'approved', updated_at = NOW()
       WHERE id = $1 AND (tenant_id = $2 OR tenant_id IS NULL)
       RETURNING *`,
      [id, orgId],
    );
    const updatedSpec = updateResult.rows[0];

    const governance = await recordGovernedAction(client, {
      orgId,
      userId,
      command: 'sign',
      target: `specification:${id}`,
      reason,
      payload: { meaning: 'approval' },
      domain: 'biopharma',
      surface: 'cmc-specifications',
      idempotencyKey: idempotencyKey ?? null,
    });

    // Keep the existing specification_audit_log trail.
    await client.query(
      `INSERT INTO specification_audit_log (specification_id, action, changed_by, previous_values, new_values)
       VALUES ($1, 'approved', $2, $3, $4)`,
      [id, String(userId), JSON.stringify(current.rows[0]), JSON.stringify(updatedSpec)],
    );

    await client.query('COMMIT');

    // Write-through canonical source object for Module 3.
    if (updatedSpec?.project_id) {
      writeThroughSpecification(orgId, updatedSpec.project_id, String(id), updatedSpec).catch(() => {});
    }

    return res.json({
      success: true,
      data: updatedSpec,
      governance: { actionId: governance.actionId, sha256Chain: governance.sha256Chain },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    console.error('[CMC Specs] Error approving specification:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to approve specification',
      message: 'Operation failed',
    });
  } finally {
    client.release();
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
