import express from 'express';
import { getPool } from '../../db';
import { z } from 'zod';

const router = express.Router();

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
        project_id, tenant_id, batch_number, product_name, batch_size,
        manufacturing_date, expiry_date, manufacturing_site,
        status, process_parameters, in_process_controls,
        yield_data, deviations
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        data.projectId || null,
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

    res.json({
      success: true,
      data: updateResult.rows[0],
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

// POST /api/cmc/batch-records/:id/release - Release testing and batch disposition
router.post('/:id/release', async (req, res) => {
  try {
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
    const updateResult = await pool.query(
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

    console.log(`[CMC Batch] Release testing for batch ${id}: ${releaseStatus}`);

    res.json({
      success: true,
      data: {
        batchRecord: updateResult.rows[0],
        releaseEvaluation: releaseRecord,
      },
      message: `Batch ${releaseStatus === 'released' ? 'released' : 'release decision recorded'} successfully`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC Batch] Error processing release:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process batch release',
      message: 'Operation failed',
    });
  }
});

export default router;
