import express from 'express';
import { getPool } from '../../db';
import { z } from 'zod';
import { writeThroughBatchRecord } from '../../services/cmc-write-through';
import { recordGovernedAction, verifyReauth } from '../../routes/c2c/actions';
import { createScopedLogger } from '../../utils/logger';
import * as metricsModule from '../../metrics.js';
import { resolveActorUserId } from './governance';

const router = express.Router();
const logger = createScopedLogger('cmc-batch');

/**
 * Observe a failed canonical write-through to the Module 3 submission source
 * object. The 201/200 primary response is intentionally NOT blocked on this —
 * but the failure MUST be observable (logged + metered) rather than silently
 * swallowed.
 * TODO(GA): consider retry/queue for guaranteed write-through.
 */
function observeWriteThroughFailure(recordId: string | number, err: unknown): void {
  logger.error('Module 3 canonical write-through failed (batch record)', {
    recordId: String(recordId),
    propagation: 'writeThroughBatchRecord',
    error: err instanceof Error ? err.message : String(err),
  });
  try {
    (metricsModule as any).metrics.concept2cureErrors.inc({
      operation: 'cmc_write_through_batch',
      error_type: 'propagation_failed',
    });
  } catch {
    /* metric increment must never affect request flow */
  }
}


// Validation schemas
const createBatchSchema = z.object({
  projectId: z.string().uuid().optional(),
  batchNumber: z.string().min(1, 'Batch number is required'),
  productName: z.string().min(1, 'Product name is required'),
  batchSize: z.string().optional(),
  manufacturingDate: z.string().optional(),
  expiryDate: z.string().optional(),
  manufacturingSite: z.string().optional(),
  status: z.string().optional().default('in-progress'),
  processParameters: z.any().optional(),
  inProcessControls: z.any().optional(),
  yieldData: z.any().optional(),
  deviations: z.any().optional(),
});

const updateBatchSchema = z.object({
  batchNumber: z.string().optional(),
  productName: z.string().optional(),
  batchSize: z.string().optional(),
  manufacturingDate: z.string().optional(),
  expiryDate: z.string().optional(),
  manufacturingSite: z.string().optional(),
  status: z.string().optional(),
  processParameters: z.any().optional(),
  inProcessControls: z.any().optional(),
  yieldData: z.any().optional(),
  deviations: z.any().optional(),
  releaseTesting: z.any().optional(),
});

const releaseSchema = z.object({
  releaseTesting: z.any(),
  releasedBy: z.string().min(1, 'Released by is required'),
  decision: z.enum(['approved', 'rejected', 'conditional']),
  comments: z.string().optional(),
  reason: z.string().min(8, 'A reason of at least 8 characters is required.'),
  reauth: z
    .object({
      password: z.string().optional(),
      totp: z.string().optional(),
    })
    .optional(),
  idempotencyKey: z.string().optional(),
});

// GET /api/cmc/batch-records/:projectId - List batch records
router.get('/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const tenantId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }
    const pool = getPool();


    const result = await pool.query(
      `SELECT * FROM cmc_batch_records
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
    console.error('[CMC Batch] Error fetching batch records:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch batch records',
      message: 'Operation failed',
    });
  }
});

// POST /api/cmc/batch-records - Create batch record
router.post('/', async (req, res) => {
  try {
    const validationResult = createBatchSchema.safeParse(req.body);

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
      `INSERT INTO cmc_batch_records (
        project_id, tenant_id, organization_id, batch_number, product_name, batch_size,
        manufacturing_date, expiry_date, manufacturing_site,
        status, process_parameters, in_process_controls,
        yield_data, deviations
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        data.projectId || null,
        tenantId,
        // organization_id is NOT NULL on the provisioned table (migrations/0006)
        // and IS the tenant — the same value, written to both columns so reads
        // scoped by either agree.
        tenantId,
        data.batchNumber,
        data.productName,
        data.batchSize || null,
        data.manufacturingDate || null,
        data.expiryDate || null,
        data.manufacturingSite || null,
        data.status || 'in-progress',
        JSON.stringify(data.processParameters || null),
        JSON.stringify(data.inProcessControls || null),
        JSON.stringify(data.yieldData || null),
        JSON.stringify(data.deviations || null),
      ]
    );

    const batch = result.rows[0];
    console.log(`[CMC Batch] Created batch record ${batch.id}: ${data.batchNumber}`);
    // Write-through: upsert canonical source object for Module 3
    if (batch.project_id) {
      writeThroughBatchRecord(Number(tenantId), batch.project_id, String(batch.id), batch).catch(err =>
        observeWriteThroughFailure(batch.id, err)
      );
    }

    res.status(201).json({
      success: true,
      data: batch,
      message: 'Batch record created successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC Batch] Error creating batch record:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create batch record',
      message: 'Operation failed',
    });
  }
});

// PUT /api/cmc/batch-records/:id - Update batch record
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const validationResult = updateBatchSchema.safeParse(req.body);

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
      return res.status(401).json({ success: false, error: 'Tenant context required' });
    }

    // Verify record exists and belongs to tenant
    const existing = await pool.query(
      `SELECT * FROM cmc_batch_records WHERE id = $1 AND (tenant_id = $2 OR tenant_id IS NULL)`, [id, tenantId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Batch record not found' });
    }

    // Build dynamic update
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      batchNumber: 'batch_number',
      productName: 'product_name',
      batchSize: 'batch_size',
      manufacturingDate: 'manufacturing_date',
      expiryDate: 'expiry_date',
      manufacturingSite: 'manufacturing_site',
      status: 'status',
      processParameters: 'process_parameters',
      inProcessControls: 'in_process_controls',
      yieldData: 'yield_data',
      deviations: 'deviations',
      releaseTesting: 'release_testing',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if ((data as any)[key] !== undefined) {
        updates.push(`${col} = $${paramIndex}`);
        const val = (data as any)[key];
        if (typeof val === 'object' && val !== null) {
          values.push(JSON.stringify(val));
        } else {
          values.push(val);
        }
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No updates provided' });
    }

    values.push(id);
    const updateQuery = `
      UPDATE cmc_batch_records
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const updateResult = await pool.query(updateQuery, values);

    console.log(`[CMC Batch] Updated batch record ${id}`);
    // Write-through: upsert canonical source object for Module 3
    const updatedBatch = updateResult.rows[0];
    if (updatedBatch?.project_id) {
      writeThroughBatchRecord(Number(tenantId), updatedBatch.project_id, String(id), updatedBatch).catch(err =>
        observeWriteThroughFailure(id, err)
      );
    }

    res.json({
      success: true,
      data: updatedBatch,
      message: 'Batch record updated successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC Batch] Error updating batch record:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update batch record',
      message: 'Operation failed',
    });
  }
});

// POST /api/cmc/batch-records/:id/release - Release testing and batch disposition.
// High-risk governed sign: re-auth gate, then UPDATE + ledger write in one
// transaction (audit_logs + c2c_ana_actions). The governed ledger is the
// signature of record for batch release (no document-scoped electronic_signatures).
router.post('/:id/release', async (req, res) => {
  const { id } = req.params;
  const validationResult = releaseSchema.safeParse(req.body);

  if (!validationResult.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid input data',
      details: validationResult.error.errors,
    });
  }

  const data = validationResult.data;
  const pool = getPool();
  const tenantRaw = (req as any).tenantId || (req as any).tenantContext?.organizationId;
  const orgId = typeof tenantRaw === 'string' ? parseInt(tenantRaw, 10) : Number(tenantRaw);
  if (!Number.isFinite(orgId) || orgId <= 0) {
    return res.status(401).json({ success: false, error: 'Tenant context required' });
  }
  const userId = resolveActorUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'AUTH_REQUIRED' });
  }

  // Re-auth gate FIRST (high-risk).
  const reauthResult = await verifyReauth(userId, data.reauth);
  if (!reauthResult.ok) {
    res.setHeader('WWW-Authenticate', 'ReAuth required');
    return res.status(401).json({ error: reauthResult.error ?? 'REAUTH_REQUIRED' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify record exists and belongs to tenant
    const existing = await client.query(
      `SELECT * FROM cmc_batch_records WHERE id = $1 AND (tenant_id = $2 OR tenant_id IS NULL)`, [id, orgId]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Batch record not found' });
    }

    const batch = existing.rows[0];

    // Perform release testing evaluation
    const releaseTestingData = data.releaseTesting || {};
    const testResults: any[] = [];
    let allPassed = true;

    // Evaluate each test parameter against specifications
    if (typeof releaseTestingData === 'object') {
      for (const [testName, testValue] of Object.entries(releaseTestingData)) {
        const passed = testValue !== null && testValue !== undefined && testValue !== 'fail';
        testResults.push({
          test: testName,
          result: testValue,
          passed,
          evaluatedAt: new Date().toISOString(),
        });
        if (!passed) allPassed = false;
      }
    }

    // Determine release status
    let releaseStatus: string;
    if (data.decision === 'rejected') {
      releaseStatus = 'rejected';
    } else if (data.decision === 'conditional') {
      releaseStatus = 'conditional-release';
    } else if (allPassed) {
      releaseStatus = 'released';
    } else {
      releaseStatus = 'pending-review';
    }

    const releaseRecord = {
      decision: data.decision,
      releasedBy: data.releasedBy,
      comments: data.comments || null,
      testResults,
      allTestsPassed: allPassed,
      releaseStatus,
      releasedAt: new Date().toISOString(),
    };

    // Update batch record with release data
    const updateResult = await client.query(
      `UPDATE cmc_batch_records
       SET release_testing = $1,
           release_status = $2,
           released_by = $3,
           released_at = NOW(),
           status = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        JSON.stringify(releaseRecord),
        releaseStatus,
        data.releasedBy,
        releaseStatus === 'released' ? 'completed' : batch.status,
        id,
      ]
    );

    const governance = await recordGovernedAction(client, {
      orgId,
      userId,
      command: 'sign',
      target: `batch:${id}`,
      reason: data.reason,
      payload: { meaning: 'release', decision: data.decision, releaseStatus },
      domain: 'biopharma',
      surface: 'cmc-batch',
      idempotencyKey: data.idempotencyKey ?? null,
    });

    await client.query('COMMIT');

    console.log(`[CMC Batch] Release testing for batch ${id}: ${releaseStatus}`);
    // Write-through: upsert canonical source object for Module 3
    const releasedBatch = updateResult.rows[0];
    if (releasedBatch?.project_id) {
      writeThroughBatchRecord(orgId, releasedBatch.project_id, String(id), releasedBatch).catch(err =>
        observeWriteThroughFailure(id, err)
      );
    }

    return res.json({
      success: true,
      data: {
        batchRecord: releasedBatch,
        releaseEvaluation: releaseRecord,
      },
      governance: { actionId: governance.actionId, sha256Chain: governance.sha256Chain },
      message: `Batch ${releaseStatus === 'released' ? 'released' : 'release decision recorded'} successfully`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    console.error('[CMC Batch] Error processing release:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process batch release',
      message: 'Operation failed',
    });
  } finally {
    client.release();
  }
});

export default router;
