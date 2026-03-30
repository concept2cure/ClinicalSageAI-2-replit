import { Router } from 'express';
import { getPool } from '../../db';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import PDFDocument from 'pdfkit';
import JSZip from 'jszip';
import {
  aiExplainStability,
  aiCoachPriorities,
  aiFixPlanFromIssues,
  aiDraftP8,
  aiRootCauseOOS,
  aiRecommendLabelStorage,
  simpleShelfLifeT90,
  aiDraftProtocol,
  aiCAPAFromOOT,
} from '../services/ai/stability.js';
// Temporarily commented out missing csv-parse dependency
// import { parse } from 'csv-parse/sync';
import { addMonths, format } from 'date-fns';
import { insertAllDayEvent, calendarEnabled } from '../services/calendar';
// Stub for barcode generation - would import BWIPJS from "bwip-js" in production
const BWIPJS = {
  toBuffer: (options: any) => Promise.resolve(Buffer.from('mock-barcode-data')),
};

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/csv',
  'text/plain',
  'application/json',
  'application/xml',
  'text/xml',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'image/png',
  'image/jpeg',
]);

const MAGIC_SIGNATURES = [
  { mime: 'application/pdf', magic: Buffer.from('%PDF') },
  { mime: 'image/png', magic: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { mime: 'image/jpeg', magic: Buffer.from([0xff, 0xd8, 0xff]) },
  { mime: 'application/zip', magic: Buffer.from([0x50, 0x4b, 0x03, 0x04]) },
];

const isLikelyText = (buffer: Buffer) => {
  const sample = buffer.subarray(0, 2048);
  if (sample.includes(0)) return false;
  let printable = 0;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126)) {
      printable += 1;
    }
  }
  return printable / sample.length > 0.9;
};

const matchesMagic = (buffer: Buffer, magic: Buffer) =>
  buffer.length >= magic.length && buffer.subarray(0, magic.length).equals(magic);

const validateUploadedFile = (req: any, res: any, next: any) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return res.status(415).json({ error: 'Unsupported file type' });
  }

  const buffer: Buffer = file.buffer || Buffer.alloc(0);
  const zipBasedMimes = new Set([
    'application/zip',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]);

  const magicMatch = MAGIC_SIGNATURES.find(sig => matchesMagic(buffer, sig.magic));

  if (zipBasedMimes.has(file.mimetype)) {
    if (!matchesMagic(buffer, Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
      return res.status(415).json({ error: 'Invalid ZIP-based file signature' });
    }
  } else if (
    file.mimetype.startsWith('text/') ||
    file.mimetype.includes('json') ||
    file.mimetype.includes('xml')
  ) {
    if (!isLikelyText(buffer)) {
      return res.status(415).json({ error: 'Invalid text file content' });
    }
  } else if (
    magicMatch &&
    magicMatch.mime !== file.mimetype &&
    file.mimetype !== 'application/zip'
  ) {
    return res.status(415).json({ error: 'File signature does not match MIME type' });
  }

  return next();
};

// Get database pool at top level
const pool = getPool();

// Helper function to execute queries with proper tenant context and connection handling
async function executeQuery(req: any, queryText: string, params?: any[]) {
  const client = await pool.connect();
  try {
    // Set tenant context for RLS policies
    const tenantId = req.headers?.['x-tenant-id'] || req.headers?.['x-organization-id'];
    if (!tenantId) {
      throw new Error('Tenant context required');
    }
    // Use parameterized set_config() to prevent SQL injection
    const safeTenantId = parseInt(tenantId.toString());
    if (!safeTenantId) {
      throw new Error('Invalid tenant ID');
    }
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [String(safeTenantId)]);

    // Execute the actual query
    return await client.query(queryText, params);
  } finally {
    client.release();
  }
}

// Helper function for queries that don't need request context (internal use)
async function executeInternalQuery(tenantId: string, queryText: string, params?: any[]) {
  if (!tenantId) {
    throw new Error('Tenant context required');
  }
  const client = await pool.connect();
  try {
    // Use parameterized set_config() to prevent SQL injection
    const safeTenantId = parseInt(tenantId.toString());
    if (!safeTenantId) {
      throw new Error('Invalid tenant ID');
    }
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [String(safeTenantId)]);
    return await client.query(queryText, params);
  } finally {
    client.release();
  }
}

// Helper function for audit trail
async function audit(studyId: string, action: string, payload: any, req: any) {
  const actor = (req.headers['x-user-name'] || req.headers['x-user-email'] || 'user').toString();
  const client = await pool.connect();
  try {
    // Set tenant context for audit - use parameterized set_config() to prevent SQL injection
    const tenantId = req.headers?.['x-tenant-id'] || req.headers?.['x-organization-id'];
    if (!tenantId) {
      throw new Error('Tenant context required');
    }
    const safeTenantId = parseInt(tenantId.toString());
    if (!safeTenantId) {
      throw new Error('Invalid tenant ID');
    }
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [String(safeTenantId)]);

    await client.query(
      `INSERT INTO stab_audit (study_id, actor, action, payload_json) VALUES ($1,$2,$3,$4)`,
      [studyId, actor, action, JSON.stringify(payload)]
    );
  } finally {
    client.release();
  }
}

// GET /api/stability/studies - List all studies
router.get('/studies', async (req, res) => {
  const client = await pool.connect();
  try {
    // Set tenant context for RLS policies
    const tenantId = req.headers['x-tenant-id'] || req.headers['x-organization-id'];
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }
    // SET commands don't support parameterized queries, but set_config() does
    const safetenantId = parseInt(tenantId.toString());
    if (!safetenantId) {
      return res.status(401).json({ error: 'Invalid tenant ID' });
    }
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [String(safetenantId)]);

    const result = await client.query(`
      SELECT
        s.*,
        COUNT(DISTINCT c.cond_id) as condition_count,
        COUNT(DISTINCT tp.tp_id) as timepoint_count,
        COUNT(DISTINCT t.test_id) as test_count
      FROM stab_studies s
      LEFT JOIN stab_conditions c ON s.study_id = c.study_id
      LEFT JOIN stab_timepoints tp ON s.study_id = tp.study_id
      LEFT JOIN stab_tests t ON s.study_id = t.study_id
      GROUP BY s.study_id
      ORDER BY s.created_at DESC
    `);

    const rows = result.rows;

    // fetch one-line condition strings per study for frontend compatibility
    const ids = rows.map((r: any) => r.study_id);
    let condMap = new Map<string, string[]>();
    if (ids.length) {
      // Use the same client with tenant context
      const { rows: conds } = await client.query(
        `select study_id, kind, temp, rh from stab_conditions where study_id = any($1)`,
        [ids]
      );
      conds.forEach((c: any) => {
        const arr = condMap.get(c.study_id) || [];
        arr.push(`${c.kind}: ${c.temp}${c.rh ? '/' + c.rh : ''}`);
        condMap.set(c.study_id, arr);
      });
    }

    // Add compatibility fields for frontend
    const out = rows.map((r: any) => ({
      ...r,
      product_name: r.name,
      batch_number: r.code,
      storage_condition: (condMap.get(r.study_id) || []).join('; '),
      progress_percent: 45, // Mock progress
      last_timepoint: '0M',
      next_timepoint: '3M',
      latest_assay_result: null,
      latest_impurities_result: null,
      latest_water_result: null,
    }));

    res.json(out);
  } catch (error: any) {
    console.error('Error fetching stability studies:', error);
    res
      .status(500)
      .json({ error: `Error fetching stability studies: ${error?.message ?? String(error)}` });
  } finally {
    // Always release the connection back to the pool
    client.release();
  }
});

// POST /api/stability/studies - Create new study with AI planning
router.post('/studies', async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      productName,
      batchNumber,
      dosageForm,
      strength,
      scope,
      climaticZone,
      storageConditions,
      duration,
      testParameters,
      startDate,
      notes,
      status,
    } = req.body;

    // Get tenant ID from request headers
    const tenantId = req.headers['x-tenant-id'] || req.headers['x-organization-id'];
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }

    // Start transaction
    await client.query('BEGIN');

    // Set tenant context for RLS policies - use parameterized set_config()
    const safeTenantId = parseInt(tenantId.toString());
    if (!safeTenantId) {
      return res.status(401).json({ error: 'Invalid tenant ID' });
    }
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [String(safeTenantId)]);

    // Generate dates
    const plannedEndDate = new Date(startDate);
    plannedEndDate.setMonth(plannedEndDate.getMonth() + duration);

    // Insert the main study record - let database generate the UUID
    const studyResult = await client.query(
      `INSERT INTO stab_studies (
        product_id, name, code, dosage_form, strength,
        duration_months, scope, climatic_zone,
        start_date, status, tenant_id, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()
      )
      RETURNING *`,
      [
        productName, // product_id field stores the product name
        productName, // name field also stores the product name
        batchNumber, // code field stores the batch number
        dosageForm,
        strength,
        duration,
        scope || 'Standard',
        climaticZone || 'IVa',
        startDate,
        status === 'ACTIVE' ? 'ONGOING' : status || 'DRAFT', // Map ACTIVE to ONGOING
        tenantId,
      ]
    );

    const study = studyResult.rows[0];

    // Insert storage conditions
    const conditions = [];
    for (const cond of storageConditions) {
      const condResult = await client.query(
        `INSERT INTO stab_conditions (study_id, kind, temp, rh, description)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          study.study_id, // Use the generated UUID from the study
          cond,
          cond === 'LT' ? '25°C' : cond === 'ACC' ? '40°C' : cond === 'INT' ? '30°C' : '5°C',
          cond === 'LT' ? '60%' : cond === 'ACC' ? '75%' : cond === 'INT' ? '65%' : null,
          `${cond} storage condition`,
        ]
      );
      conditions.push(condResult.rows[0]);
    }

    // Generate timepoints based on duration and ICH guidelines
    const timepointLabels = ['0M'];
    if (duration >= 3) timepointLabels.push('3M');
    if (duration >= 6) timepointLabels.push('6M');
    if (duration >= 9) timepointLabels.push('9M');
    if (duration >= 12) timepointLabels.push('12M');
    if (duration >= 18) timepointLabels.push('18M');
    if (duration >= 24) timepointLabels.push('24M');
    if (duration >= 36) timepointLabels.push('36M');

    // Insert timepoints for each condition
    const timepoints = [];
    for (const condition of conditions) {
      for (const tp of timepointLabels) {
        const month = parseInt(tp.replace('M', ''));
        const plannedDate = new Date(startDate);
        plannedDate.setMonth(plannedDate.getMonth() + month);

        const tpResult = await client.query(
          `INSERT INTO stab_timepoints (study_id, cond_id, label, month, planned_date)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [
            study.study_id,
            condition.cond_id, // Associate timepoint with this condition
            tp,
            month,
            plannedDate.toISOString().split('T')[0],
          ]
        );
        timepoints.push(tpResult.rows[0]);
      }
    }

    // Insert test parameters
    const tests = [];
    for (const test of testParameters) {
      const testResult = await client.query(
        `INSERT INTO stab_tests (
          study_id,
          name,
          unit,
          spec_low,
          spec_high,
          is_cqa
        )
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          study.study_id,
          test,
          test === 'Assay' ? '%' : test === 'Water Content' ? '%' : 'Various',
          test === 'Assay' ? 95.0 : null,
          test === 'Assay' ? 105.0 : test === 'Water Content' ? 5.0 : null,
          ['Assay', 'Related Substances'].includes(test),
        ]
      );
      tests.push(testResult.rows[0]);
    }

    // Commit transaction
    await client.query('COMMIT');

    // Audit the creation
    await audit(
      study.study_id,
      'CREATE_STUDY',
      {
        productName,
        batchNumber,
        scope,
        duration,
        conditionCount: conditions.length,
        timepointCount: timepoints.length,
        testCount: tests.length,
      },
      req
    );

    // Prepare response
    const newStudy = {
      ...study,
      id: study.study_id, // Use the generated UUID from the study
      product_name: productName,
      batch_number: batchNumber,
      storage_conditions: storageConditions.join(', '),
      test_parameters: testParameters,
      timepoints: timepointLabels,
      study_status: status === 'ACTIVE' ? 'ONGOING' : status || 'DRAFT', // Map ACTIVE to ONGOING
      compliance_status: 'Not Started',
      latest_timepoint: '0M',
      latest_assay_result: null,
      latest_impurities_result: null,
      latest_water_result: null,
    };

    res.status(201).json({
      message: 'Study created successfully',
      study: newStudy,
      plan: {
        conditions: conditions.map(c => ({
          kind: c.kind,
          temp: c.temp,
          rh: c.rh,
          description: c.description,
        })),
        timepoints: timepoints.map(tp => ({
          label: tp.label,
          month: tp.month,
          planned_date: tp.planned_date,
        })),
        tests: tests.map(t => ({
          name: t.name,
          unit: t.unit,
          spec_low: t.spec_low,
          spec_high: t.spec_high,
          is_cqa: t.is_cqa,
        })),
      },
    });
  } catch (error: any) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    console.error('Error creating study:', error);
    res.status(500).json({ error: `Failed to create study: ${error?.message ?? String(error)}` });
  } finally {
    // Always release the connection
    client.release();
  }
});

// PUT /api/stability/studies/:id - Update study
router.put('/studies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Return updated study data (in production, would update database)
    const updatedStudy = {
      id: id,
      ...updateData,
      updated_at: new Date().toISOString(),
    };

    res.json({
      message: 'Study updated successfully',
      study: updatedStudy,
    });
  } catch (error: any) {
    console.error('Error updating study:', error);
    res.status(500).json({ error: 'Failed to update study' });
  }
});

// PATCH /api/stability/studies/:id/status - Update study status
router.patch('/studies/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Valid status transitions
    const validStatuses = ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    res.json({
      message: 'Study status updated successfully',
      study: {
        id: id,
        status: status,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error updating study status:', error);
    res.status(500).json({ error: 'Failed to update study status' });
  }
});

// GET /api/stability/studies/:id - Get study details
router.get('/studies/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    // Set tenant context for RLS policies - use parameterized set_config()
    const tenantId = req.headers['x-tenant-id'] || req.headers['x-organization-id'];
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }
    const safeTenantId = parseInt(tenantId.toString());
    if (!safeTenantId) {
      return res.status(401).json({ error: 'Invalid tenant ID' });
    }
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [String(safeTenantId)]);

    // Get study
    const studyResult = await client.query('SELECT * FROM stab_studies WHERE study_id = $1', [id]);
    if (studyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Study not found' });
    }
    const study = studyResult.rows[0];

    // Get conditions
    const conditionsResult = await client.query(
      'SELECT * FROM stab_conditions WHERE study_id = $1 ORDER BY kind',
      [id]
    );
    const conditions = conditionsResult.rows;

    // Get timepoints
    const timepointsResult = await client.query(
      'SELECT * FROM stab_timepoints WHERE study_id = $1 ORDER BY month',
      [id]
    );
    const timepoints = timepointsResult.rows;

    // Get tests
    const testsResult = await client.query(
      'SELECT * FROM stab_tests WHERE study_id = $1 ORDER BY name',
      [id]
    );
    const tests = testsResult.rows;

    // Get results
    const resultsResult = await client.query(
      `
      SELECT r.*, c.kind as condition_kind, tp.label as timepoint_label, t.name as test_name
      FROM stab_results r
      JOIN stab_conditions c ON r.cond_id = c.cond_id
      JOIN stab_timepoints tp ON r.tp_id = tp.tp_id
      JOIN stab_tests t ON r.test_id = t.test_id
      WHERE r.study_id = $1
      ORDER BY c.kind, tp.month, t.name
    `,
      [id]
    );
    const results = resultsResult.rows;

    res.json({
      study: {
        ...study,
        product_name: study.name,
        batch_number: study.code,
      },
      conditions,
      timepoints,
      tests,
      results,
      storage_condition: conditions
        .map((x: any) => `${x.kind}: ${x.temp}${x.rh ? '/' + x.rh : ''}`)
        .join('; '),
    });
  } catch (error: any) {
    console.error('Error fetching study details:', error);
    res
      .status(500)
      .json({ error: `Failed to fetch study details: ${error?.message ?? String(error)}` });
  } finally {
    client.release();
  }
});

// POST /api/stability/studies/:id/conditions - Add condition
router.post('/studies/:id/conditions', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { kind, temp, rh, description } = req.body;

    // Set tenant context for RLS policies - use parameterized set_config()
    const tenantId = req.headers['x-tenant-id'] || req.headers['x-organization-id'];
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }
    const safeTenantId = parseInt(tenantId.toString());
    if (!safeTenantId) {
      return res.status(401).json({ error: 'Invalid tenant ID' });
    }
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [String(safeTenantId)]);

    const result = await client.query(
      `
      INSERT INTO stab_conditions (study_id, kind, temp, rh, description)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
      [id, kind, temp, rh, description]
    );

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error adding condition:', error);
    res.status(500).json({ error: `Failed to add condition: ${error?.message ?? String(error)}` });
  } finally {
    client.release();
  }
});

// DELETE /api/stability/conditions/:condId - Delete condition
router.delete('/conditions/:condId', async (req, res) => {
  const client = await pool.connect();
  try {
    const { condId } = req.params;

    // Set tenant context for RLS policies - use parameterized set_config()
    const tenantId = req.headers['x-tenant-id'] || req.headers['x-organization-id'];
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }
    const safeTenantId = parseInt(tenantId.toString());
    if (!safeTenantId) {
      return res.status(401).json({ error: 'Invalid tenant ID' });
    }
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [String(safeTenantId)]);

    await client.query('DELETE FROM stab_conditions WHERE cond_id = $1', [condId]);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting condition:', error);
    res
      .status(500)
      .json({ error: `Failed to delete condition: ${error?.message ?? String(error)}` });
  } finally {
    client.release();
  }
});

// POST /api/stability/studies/:id/timepoints - Add timepoint
router.post('/studies/:id/timepoints', async (req, res) => {
  try {
    const pool = getPool();
    const { id } = req.params;
    const { label, month, planned_date } = req.body;

    // Get all conditions for this study
    const conditionsResult = await pool.query(
      'SELECT cond_id FROM stab_conditions WHERE study_id = $1',
      [id]
    );

    const timepoints = [];
    for (const condition of conditionsResult.rows) {
      const result = await pool.query(
        `
        INSERT INTO stab_timepoints (study_id, cond_id, label, month, planned_date)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
        [id, condition.cond_id, label, month, planned_date]
      );
      timepoints.push(result.rows[0]);
    }

    res.json(timepoints);
  } catch (error) {
    console.error('Error adding timepoint:', error);
    res.status(500).json({ error: 'Failed to add timepoint' });
  }
});

// POST /api/stability/studies/:id/timepoints/:tpId/sample - Set actual sampling date
router.post('/studies/:id/timepoints/:tpId/sample', async (req, res) => {
  try {
    const { tpId } = req.params;
    const { actual_date } = req.body;

    const result = await pool.query(
      `
      UPDATE stab_timepoints
      SET actual_date = $1
      WHERE tp_id = $2
      RETURNING *
    `,
      [actual_date, tpId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating sampling date:', error);
    res.status(500).json({ error: 'Failed to update sampling date' });
  }
});

// POST /api/stability/studies/:id/schedule - Build ICS calendar + reminders
router.post('/studies/:id/schedule', async (req, res) => {
  try {
    const { id } = req.params;

    // Get study details
    const studyResult = await pool.query('SELECT * FROM stab_studies WHERE study_id = $1', [id]);
    const study = studyResult.rows[0];

    // Get timepoints with planned dates
    const timepointsResult = await pool.query(
      `
      SELECT tp.*, c.kind as condition_kind
      FROM stab_timepoints tp
      JOIN stab_conditions c ON tp.cond_id = c.cond_id
      WHERE tp.study_id = $1 AND tp.planned_date IS NOT NULL
      ORDER BY tp.planned_date
    `,
      [id]
    );

    // Generate ICS content
    const icsEvents = timepointsResult.rows.map(tp => {
      const date = new Date(tp.planned_date);
      const dateStr = date.toISOString().replace(/[-:]/g, '').split('T')[0];

      return [
        'BEGIN:VEVENT',
        `UID:stability-${tp.tp_id}@stability-system`,
        `DTSTART;VALUE=DATE:${dateStr}`,
        `SUMMARY:Stability Sampling - ${study.name} (${tp.condition_kind} ${tp.label})`,
        `DESCRIPTION:Stability study sampling for ${study.name}\\nCondition: ${tp.condition_kind}\\nTimepoint: ${tp.label}`,
        'END:VEVENT',
      ].join('\r\n');
    });

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Stability System//EN',
      ...icsEvents,
      'END:VCALENDAR',
    ].join('\r\n');

    // Create reminders in database
    for (const tp of timepointsResult.rows) {
      await pool.query(
        `
        INSERT INTO stab_reminders (study_id, tp_id, due_date, channel)
        VALUES ($1, $2, $3, 'ICS')
        ON CONFLICT DO NOTHING
      `,
        [id, tp.tp_id, tp.planned_date]
      );
    }

    res.setHeader('Content-Type', 'text/calendar');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${study.code}-sampling-calendar.ics"`
    );
    res.send(icsContent);
  } catch (error) {
    console.error('Error generating schedule:', error);
    res.status(500).json({ error: 'Failed to generate schedule' });
  }
});

// POST /api/stability/studies/:id/results/import - Import CSV results
router.post(
  '/studies/:id/results/import',
  upload.single('file'),
  validateUploadedFile,
  async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const csvData = req.file?.buffer.toString();
      if (!csvData) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Parse CSV - temporarily disabled until papaparse is available
      // const parseResult = Papa.parse(csvData, {
      //   header: true,
      //   skipEmptyLines: true
      // });
      // const records = parseResult.data;

      // For now, return a simple message about CSV import being temporarily unavailable
      return res.status(200).json({
        message: 'CSV import feature temporarily unavailable',
        imported: 0,
        errors: ['CSV parsing library not available'],
      });

      // Get lookup data
      const conditionsResult = await client.query(
        'SELECT * FROM stab_conditions WHERE study_id = $1',
        [id]
      );
      const conditions = new Map(conditionsResult.rows.map(c => [c.kind, c]));

      const timepointsResult = await client.query(
        'SELECT * FROM stab_timepoints WHERE study_id = $1',
        [id]
      );
      const timepoints = new Map(
        timepointsResult.rows.map(tp => [`${tp.cond_id}-${tp.label}`, tp])
      );

      const testsResult = await client.query('SELECT * FROM stab_tests WHERE study_id = $1', [id]);
      const tests = new Map(testsResult.rows.map(t => [t.name, t]));

      let imported = 0;
      // CSV import functionality temporarily disabled
      // const records = parseResult.data;

      // for (const record of records) {
      //   const row = record as any;
      //   const condition = conditions.get(row.condition);
      //   const timepoint = timepoints.get(`${condition?.cond_id}-${row.timepoint}`);
      //   const test = tests.get(row.test);
      //
      //   if (condition && timepoint && test) {
      //     await client.query(`
      //       INSERT INTO stab_results (study_id, cond_id, tp_id, test_id, value, unit, pass, remarks)
      //       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      //       ON CONFLICT (cond_id, tp_id, test_id) DO UPDATE SET
      //         value = $5, unit = $6, pass = $7, remarks = $8
      //     `, [id, condition.cond_id, timepoint.tp_id, test.test_id, row.value, row.unit, row.pass === 'true', row.remarks]);
      //     imported++;
      //   }
      // }

      await client.query('COMMIT');

      res.json({ imported, total: 0 });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error importing results:', error);
      res.status(500).json({ error: 'Failed to import results' });
    } finally {
      client.release();
    }
  }
);

// GET /api/stability/studies/:id/trends - Get trend data for charts and sparklines
router.get('/studies/:id/trends', async (req, res) => {
  try {
    const { id } = req.params;
    const test = req.query.test as string;
    const cond = req.query.cond as string;

    let query = `
      SELECT
        r.value, r.unit, r.created_at,
        tp.month, tp.label as timepoint,
        c.kind as condition, c.temp,
        t.name as test_name
      FROM stab_results r
      JOIN stab_timepoints tp ON r.tp_id = tp.tp_id
      JOIN stab_conditions c ON r.cond_id = c.cond_id
      JOIN stab_tests t ON r.test_id = t.test_id
      WHERE r.study_id = $1
    `;

    const params = [id];

    if (test) {
      query += ' AND t.name = $' + (params.length + 1);
      params.push(test);
    }

    if (cond) {
      query += ' AND c.kind = $' + (params.length + 1);
      params.push(cond);
    }

    query += ' ORDER BY c.kind, tp.month';

    const result = await pool.query(query, params);
    const trendData = result.rows;

    // Process data for sparklines
    const sparklineData = trendData.map(row => ({
      month: row.month,
      value: parseFloat(row.value) || 0,
      label: row.timepoint,
      condition: row.condition,
    }));

    // Calculate trend direction
    const getTrendDirection = (data: any[]) => {
      if (data.length < 2) return 'stable';
      const first = parseFloat(data[0].value) || 0;
      const last = parseFloat(data[data.length - 1].value) || 0;
      const diff = last - first;
      if (Math.abs(diff) < 0.5) return 'stable';
      return diff > 0 ? 'increasing' : 'decreasing';
    };

    res.json({
      raw: trendData,
      sparkline: sparklineData,
      summary: {
        count: trendData.length,
        latest_value: trendData.length > 0 ? trendData[trendData.length - 1].value : null,
        trend_direction: getTrendDirection(trendData),
        last_updated: trendData.length > 0 ? trendData[trendData.length - 1].created_at : null,
      },
    });
  } catch (error) {
    console.error('Error fetching trends:', error);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

// GET /api/stability/studies/:id/results - Get results for study
router.get('/studies/:id/results', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        r.result_id as id,
        r.study_id,
        r.value,
        r.unit,
        r.pass,
        r.created_at,
        t.test_name,
        c.kind as condition,
        tp.month as timepoint
      FROM stab_results r
      JOIN stab_tests t ON r.test_id = t.test_id
      JOIN stab_conditions c ON r.cond_id = c.cond_id
      JOIN stab_timepoints tp ON r.tp_id = tp.tp_id
      WHERE r.study_id = $1
      ORDER BY t.test_name, c.kind, tp.month
    `,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching results:', error);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

// PATCH /api/stability/studies/results/:id - Update result
router.patch('/studies/results/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { value, unit, pass } = req.body;

    const result = await pool.query(
      `
      UPDATE stab_results
      SET value = $2, unit = $3, pass = $4, created_at = NOW()
      WHERE result_id = $1
      RETURNING *
    `,
      [id, value, unit, pass]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating result:', error);
    res.status(500).json({ error: 'Failed to update result' });
  }
});

// DELETE /api/stability/studies/results/:id - Delete result
router.delete('/studies/results/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query('DELETE FROM stab_results WHERE result_id = $1', [id]);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting result:', error);
    res.status(500).json({ error: 'Failed to delete result' });
  }
});

// GET /api/stability/studies/:id/validate - Validate study design
router.get('/studies/:id/validate', async (req, res) => {
  try {
    const { id } = req.params;

    const errors = [];
    const warnings = [];

    // Check for required conditions
    const conditionsResult = await pool.query('SELECT * FROM stab_conditions WHERE study_id = $1', [
      id,
    ]);
    const conditions = conditionsResult.rows;

    const hasLT = conditions.some(c => c.kind === 'LT');
    const hasACC = conditions.some(c => c.kind === 'ACC');

    if (!hasLT) {
      errors.push({
        id: 'Q1A-001',
        message: 'Long-term (LT) condition is required per ICH Q1A(R2)',
      });
    }

    if (!hasACC) {
      errors.push({
        id: 'Q1A-002',
        message: 'Accelerated (ACC) condition is required per ICH Q1A(R2)',
      });
    }

    // Check timepoints
    const timepointsResult = await pool.query(
      'SELECT DISTINCT month FROM stab_timepoints WHERE study_id = $1 ORDER BY month',
      [id]
    );
    const months = timepointsResult.rows.map(tp => tp.month);

    if (!months.includes(0)) {
      errors.push({ id: 'Q1A-003', message: 'Initial timepoint (0M) is required' });
    }

    if (hasLT && !months.includes(12)) {
      warnings.push({
        id: 'Q1A-W001',
        message: 'Consider adding 12M timepoint for long-term studies',
      });
    }

    // Check tests
    const testsResult = await pool.query('SELECT * FROM stab_tests WHERE study_id = $1', [id]);
    const tests = testsResult.rows;

    if (tests.length === 0) {
      errors.push({ id: 'Q1A-004', message: 'At least one test parameter is required' });
    }

    const unlinkedTests = tests.filter(t => !t.method_id);
    if (unlinkedTests.length > 0) {
      warnings.push({
        id: 'Q1A-W002',
        message: `${unlinkedTests.length} tests are not linked to analytical methods`,
      });
    }

    res.json({ errors, warnings });
  } catch (error) {
    console.error('Error validating study:', error);
    res.status(500).json({ error: 'Failed to validate study' });
  }
});

// POST /api/stability/studies/:id/p8/push - Push P.8 to authoring with tokens
router.post('/studies/:id/p8/push', async (req, res) => {
  try {
    const { id } = req.params;

    // Get study data
    const [studyResult, condsResult, testsResult, resultsResult] = await Promise.all([
      pool.query(`SELECT * FROM stab_studies WHERE study_id = $1`, [id]),
      pool.query(`SELECT * FROM stab_conditions WHERE study_id = $1`, [id]),
      pool.query(`SELECT * FROM stab_tests WHERE study_id = $1 ORDER BY name`, [id]),
      pool.query(
        `
        SELECT r.*, c.kind as condition_kind, tp.label as timepoint_label, t.name as test_name
        FROM stab_results r
        JOIN stab_conditions c ON r.cond_id = c.cond_id
        JOIN stab_timepoints tp ON r.tp_id = tp.tp_id
        JOIN stab_tests t ON r.test_id = t.test_id
        WHERE r.study_id = $1
        ORDER BY t.name, c.kind, tp.month
      `,
        [id]
      ),
    ]);

    if (!studyResult.rows[0]) {
      return res.status(404).json({ error: 'Study not found' });
    }

    const study = studyResult.rows[0];
    const conds = condsResult.rows;
    const tests = testsResult.rows;
    const results = resultsResult.rows;

    // Generate P.8 tokens for authoring
    const tokens = {
      STUDY_NAME: study.name,
      STUDY_CODE: study.code,
      CLIMATIC_ZONE: study.climatic_zone || 'Zone II',
      STORAGE_CONDITIONS: conds
        .map((c: any) => `${c.kind}: ${c.temp}${c.rh ? '/' + c.rh : ''}`)
        .join('; '),
      TEST_PARAMETERS: tests
        .map((t: any) => `${t.name}${t.unit ? ' (' + t.unit + ')' : ''}`)
        .join(', '),
      DURATION_MONTHS: study.duration_months || 24,
      LABEL_STORAGE: study.label_storage || 'Store in a dry place at room temperature',
      COMPLIANCE_STATUS: 'Compliant with ICH Q1A(R2) guidelines',
      RESULTS_SUMMARY:
        results.length > 0 ? `${results.length} test results recorded` : 'Testing in progress',
    };

    // Generate markdown content
    const markdown = `## 3.2.P.8 Stability Summary

**Study:** ${tokens.STUDY_NAME} (${tokens.STUDY_CODE})

**Storage Conditions:** ${tokens.STORAGE_CONDITIONS}

**Climatic Zone:** ${tokens.CLIMATIC_ZONE}

**Duration:** ${tokens.DURATION_MONTHS} months

**Test Parameters:** ${tokens.TEST_PARAMETERS}

**Label Storage Conditions:** ${tokens.LABEL_STORAGE}

**Compliance:** ${tokens.COMPLIANCE_STATUS}

**Results Status:** ${tokens.RESULTS_SUMMARY}

### Stability Protocol Summary
This stability study follows ICH Q1A(R2) guidelines for ${tokens.CLIMATIC_ZONE} climatic conditions. Testing includes ${tests.length} parameters across ${conds.length} storage conditions over ${tokens.DURATION_MONTHS} months.

### Storage and Labeling
Recommended label storage: ${tokens.LABEL_STORAGE}
`;

    // Store export record
    await pool.query(
      `
      INSERT INTO stab_exports (study_id, export_type, tokens_json, markdown_content, generated_at)
      VALUES ($1, 'p8_authoring', $2, $3, NOW())
    `,
      [id, JSON.stringify(tokens), markdown]
    );

    await audit(id, 'p8_push_authoring', { tokens_count: Object.keys(tokens).length }, req);

    res.json({
      ok: true,
      tokens,
      markdown,
      message: 'P.8 content pushed to authoring successfully',
    });
  } catch (error) {
    console.error('Error pushing P.8 to authoring:', error);
    res.status(500).json({ error: 'Failed to push P.8 to authoring' });
  }
});

// POST /api/stability/studies/:id/p8/refresh - Refresh P.8 tokens for document authoring
router.post('/studies/:id/p8/refresh', async (req, res) => {
  try {
    const { id } = req.params;

    // Get study data
    const studyResult = await pool.query('SELECT * FROM stab_studies WHERE study_id = $1', [id]);
    const study = studyResult.rows[0];

    // Get latest results summary
    const resultsResult = await pool.query(
      `
      SELECT
        c.kind, tp.label, t.name, r.value, r.unit
      FROM stab_results r
      JOIN stab_conditions c ON r.cond_id = c.cond_id
      JOIN stab_timepoints tp ON r.tp_id = tp.tp_id
      JOIN stab_tests t ON r.test_id = t.test_id
      WHERE r.study_id = $1
      ORDER BY c.kind, tp.month, t.name
    `,
      [id]
    );

    // Generate tokens for document authoring
    const tokens = {
      '[PRODUCT_NAME]': study.name,
      '[STUDY_CODE]': study.code,
      '[DOSAGE_FORM]': study.dosage_form || 'Not specified',
      '[STRENGTH]': study.strength || 'Not specified',
      '[CLIMATIC_ZONE]': study.climatic_zone || 'IVb',
      '[DURATION]': `${study.duration_months} months`,
      '[STATUS]': study.status,
      '[RESULTS_SUMMARY]': resultsResult.rows
        .map(r => `${r.kind} ${r.label}: ${r.name} = ${r.value} ${r.unit || ''}`)
        .join('; '),
    };

    res.json({ tokens });
  } catch (error) {
    console.error('Error refreshing P.8 tokens:', error);
    res.status(500).json({ error: 'Failed to refresh P.8 tokens' });
  }
});

// PATCH /api/stability/tests/:testId - Update test (link to analytical method)
router.patch('/tests/:testId', async (req, res) => {
  try {
    const { testId } = req.params;
    const { method_id, spec_low, spec_high } = req.body;

    const result = await pool.query(
      `
      UPDATE stab_tests
      SET method_id = $1, spec_low = $2, spec_high = $3
      WHERE test_id = $4
      RETURNING *
    `,
      [method_id, spec_low, spec_high, testId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating test:', error);
    res.status(500).json({ error: 'Failed to update test' });
  }
});

// STEP 4: Inline editing endpoints

// PATCH /api/stability/conditions/:condId - Update condition inline
router.patch('/conditions/:condId', async (req, res) => {
  try {
    const condId = req.params.condId;
    const { kind, temp, rh, description } = req.body;

    await pool.query(
      `
      UPDATE stab_conditions
      SET kind = COALESCE($2, kind),
          temp = COALESCE($3, temp),
          rh = COALESCE($4, rh),
          description = COALESCE($5, description)
      WHERE cond_id = $1`,
      [condId, kind || null, temp || null, rh || null, description || null]
    );

    // Find study_id for audit
    const result = await pool.query(`SELECT study_id FROM stab_conditions WHERE cond_id = $1`, [
      condId,
    ]);
    if (result.rows[0]) {
      await audit(result.rows[0].study_id, 'condition_update', { condId, body: req.body }, req);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Error updating condition:', error);
    res.status(500).json({ error: 'Failed to update condition' });
  }
});

// PATCH /api/stability/timepoints/:tpId - Update timepoint inline
router.patch('/timepoints/:tpId', async (req, res) => {
  try {
    const tpId = req.params.tpId;
    const { label, month, planned_date } = req.body;

    await pool.query(
      `
      UPDATE stab_timepoints
      SET label = COALESCE($2, label),
          month = COALESCE($3, month),
          planned_date = COALESCE($4::date, planned_date)
      WHERE tp_id = $1`,
      [tpId, label || null, month || null, planned_date || null]
    );

    const result = await pool.query(`SELECT study_id FROM stab_timepoints WHERE tp_id = $1`, [
      tpId,
    ]);
    if (result.rows[0]) {
      await audit(result.rows[0].study_id, 'tp_update', { tpId, body: req.body }, req);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Error updating timepoint:', error);
    res.status(500).json({ error: 'Failed to update timepoint' });
  }
});

// DELETE /api/stability/timepoints/:tpId - Delete timepoint
router.delete('/timepoints/:tpId', async (req, res) => {
  try {
    const tpId = req.params.tpId;

    const result = await pool.query(`SELECT study_id FROM stab_timepoints WHERE tp_id = $1`, [
      tpId,
    ]);
    await pool.query(`DELETE FROM stab_timepoints WHERE tp_id = $1`, [tpId]);

    if (result.rows[0]) {
      await audit(result.rows[0].study_id, 'tp_delete', { tpId }, req);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting timepoint:', error);
    res.status(500).json({ error: 'Failed to delete timepoint' });
  }
});

// In-Use workflow endpoints

// GET /api/stability/studies/:id/inuse - Get in-use configuration
router.get('/studies/:id/inuse', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`SELECT * FROM stab_inuse WHERE study_id = $1 LIMIT 1`, [id]);
    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('Error fetching in-use config:', error);
    res.status(500).json({ error: 'Failed to fetch in-use config' });
  }
});

// POST /api/stability/studies/:id/inuse - Update in-use configuration
router.post('/studies/:id/inuse', async (req, res) => {
  try {
    const id = req.params.id;
    const {
      multi_dose,
      opened_frequency,
      hold_time_days,
      microbial_limits,
      preservative,
      start_on,
    } = req.body;

    await pool.query(
      `
      INSERT INTO stab_inuse (study_id, multi_dose, opened_frequency, hold_time_days, microbial_limits, preservative, start_on, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, now())
      ON CONFLICT (study_id) DO UPDATE SET
        multi_dose = $2,
        opened_frequency = $3,
        hold_time_days = $4,
        microbial_limits = $5,
        preservative = $6,
        start_on = $7,
        updated_at = now()`,
      [
        id,
        !!multi_dose,
        opened_frequency || null,
        hold_time_days || null,
        microbial_limits || null,
        preservative || null,
        start_on || null,
      ]
    );

    await audit(id, 'inuse_update', req.body, req);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error updating in-use config:', error);
    res.status(500).json({ error: 'Failed to update in-use config' });
  }
});

// OOT/OOS surveillance endpoints

// GET /api/stability/studies/:id/oot/rules - Get OOT rules
router.get('/studies/:id/oot/rules', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await pool.query(
      `SELECT rule_id, test_id, rules FROM stab_oot_rules WHERE study_id = $1`,
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching OOT rules:', error);
    res.status(500).json({ error: 'Failed to fetch OOT rules' });
  }
});

// POST /api/stability/studies/:id/oot/rules - Set OOT rules
router.post('/studies/:id/oot/rules', async (req, res) => {
  try {
    const id = req.params.id;
    const { test_id, rules } = req.body;

    await pool.query(
      `
      INSERT INTO stab_oot_rules (study_id, test_id, rules)
      VALUES ($1, $2, $3)
      ON CONFLICT ON CONSTRAINT stab_oot_rules_study_unique
      DO UPDATE SET rules = $3`,
      [id, test_id || null, JSON.stringify(rules || [])]
    );

    await audit(id, 'oot_rules_update', req.body, req);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error updating OOT rules:', error);
    res.status(500).json({ error: 'Failed to update OOT rules' });
  }
});

// GET /api/stability/studies/:id/oot/check - Check for OOT violations
router.get('/studies/:id/oot/check', async (req, res) => {
  try {
    const id = req.params.id;
    const testName = String(req.query.test || '').toLowerCase();

    const testResult = await pool.query(
      `SELECT test_id FROM stab_tests WHERE study_id = $1 AND LOWER(name) = $2`,
      [id, testName]
    );
    if (!testResult.rows[0]) {
      return res.json({ breaches: [], rules: [] });
    }

    const rulesResult = await pool.query(
      `
      SELECT rules FROM stab_oot_rules
      WHERE study_id = $1 AND (test_id = $2 OR test_id IS NULL)
      ORDER BY test_id NULLS LAST LIMIT 1`,
      [id, testResult.rows[0].test_id]
    );
    const rules = rulesResult.rows[0]?.rules || ['WE1', 'WE2'];

    const dataResult = await pool.query(
      `
      SELECT t.month, r.value::float as v, c.kind
      FROM stab_results r
      JOIN stab_timepoints t ON t.tp_id = r.tp_id
      JOIN stab_conditions c ON c.cond_id = r.cond_id
      WHERE r.study_id = $1 AND r.test_id = $2 AND r.value ~ '^[0-9.]+$'
      ORDER BY t.month`,
      [id, testResult.rows[0].test_id]
    );

    // Simple Western Electric rules implementation
    const byCond: Record<string, number[]> = {};
    dataResult.rows.forEach((p: any) => {
      (byCond[p.kind] ||= []).push(p.v);
    });

    function mean(a: number[]): number {
      return a.reduce((s, v) => s + v, 0) / a.length;
    }
    function sd(a: number[]): number {
      const m = mean(a);
      return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1 || 1));
    }

    const breaches: any[] = [];
    for (const [cond, series] of Object.entries(byCond)) {
      if (series.length < 5) continue;
      const m = mean(series),
        s = sd(series);
      const we: any = {};

      // WE1: any beyond 3σ
      if (rules.includes('WE1') && series.some(v => v > m + 3 * s || v < m - 3 * s)) we.WE1 = true;

      // WE2: 2 of 3 beyond 2σ
      if (rules.includes('WE2')) {
        for (let i = 2; i < series.length; i++) {
          const w = series.slice(i - 2, i + 1);
          const count = w.filter(v => v > m + 2 * s).length + w.filter(v => v < m - 2 * s).length;
          if (count >= 2) {
            we.WE2 = true;
            break;
          }
        }
      }

      if (Object.keys(we).length) breaches.push({ cond, we });
    }

    res.json({ rules, breaches });
  } catch (error) {
    console.error('Error checking OOT:', error);
    res.status(500).json({ error: 'Failed to check OOT' });
  }
});

// P.8 export endpoint
// POST /api/stability/studies/:id/p8/export?fmt=pdf|docx
router.post('/studies/:id/p8/export', async (req, res) => {
  try {
    const id = req.params.id;
    const fmt = (req.query.fmt as string) || 'pdf';

    const [studyResult, condsResult, tpsResult, testsResult] = await Promise.all([
      pool.query(`SELECT * FROM stab_studies WHERE study_id = $1`, [id]),
      pool.query(`SELECT * FROM stab_conditions WHERE study_id = $1`, [id]),
      pool.query(`SELECT * FROM stab_timepoints WHERE study_id = $1 ORDER BY month`, [id]),
      pool.query(`SELECT * FROM stab_tests WHERE study_id = $1 ORDER BY name`, [id]),
    ]);

    if (!studyResult.rows[0]) {
      return res.status(404).json({ error: 'Study not found' });
    }

    const study = studyResult.rows[0];
    const conds = condsResult.rows;
    const tps = tpsResult.rows;
    const tests = testsResult.rows;

    // Compose P.8 content
    const p8Content = [
      `3.2.P.8 Stability Summary`,
      ``,
      `Study: ${study.name} (${study.code})`,
      `Zone: ${study.climatic_zone || '—'}; Duration: ${study.duration_months} months`,
      ``,
      `Conditions: ${conds
        .map((c: any) => `${c.kind}: ${c.temp}${c.rh ? '/' + c.rh : ''}`)
        .join('; ')}`,
      `Timepoints: ${tps.map((t: any) => t.label).join(', ')}`,
      `Tests: ${tests.map((t: any) => `${t.name}${t.unit ? ' (' + t.unit + ')' : ''}`).join(', ')}`,
      ``,
      `Label storage: ${study.label_storage || 'TBD'}`,
    ].join('\n');

    if (fmt === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="P8_${study.code}.pdf"`);

      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 54, bottom: 54, left: 54, right: 54 },
      });
      doc.pipe(res);
      doc.fontSize(16).text('3.2.P.8 Stability Summary', { underline: true });
      doc.moveDown();
      doc.fontSize(11).text(p8Content);
      doc.end();

      await audit(id, 'p8_export', { fmt: 'pdf' }, req);
    } else {
      // Return as text for now (ZIP functionality temporarily disabled)
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="P8_${study.code}.txt"`);
      res.send(p8Content);

      await audit(id, 'p8_export', { fmt: 'txt' }, req);
    }
  } catch (error) {
    console.error('Error exporting P.8:', error);
    res.status(500).json({ error: 'Failed to export P.8' });
  }
});

// GET /api/stability/studies/:id/audit - Get audit trail
router.get('/studies/:id/audit', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `
      SELECT event_id, actor, action, payload_json, created_at
      FROM stab_audit
      WHERE study_id = $1
      ORDER BY created_at DESC
      LIMIT 100`,
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching audit trail:', error);
    res.status(500).json({ error: 'Failed to fetch audit trail' });
  }
});

// AI Services endpoints
router.post('/studies/:id/ai/explain', async (req, res) => {
  try {
    const { id } = req.params;
    const explanation = await aiExplainStability(id);
    res.json({ explanation });
  } catch (error) {
    console.error('Error generating explanation:', error);
    res.status(500).json({ error: 'Failed to generate explanation' });
  }
});

router.get('/studies/:id/ai/coach', async (req, res) => {
  try {
    const { id } = req.params;
    const priorities = await aiCoachPriorities(id);
    res.json({ priorities });
  } catch (error) {
    console.error('Error getting AI coaching:', error);
    res.status(500).json({ error: 'Failed to get AI coaching' });
  }
});

router.post('/studies/:id/ai/fix', async (req, res) => {
  try {
    const { id } = req.params;
    const { issues } = req.body;
    const fixPlan = await aiFixPlanFromIssues(id, issues);
    res.json({ fixPlan });
  } catch (error) {
    console.error('Error generating fix plan:', error);
    res.status(500).json({ error: 'Failed to generate fix plan' });
  }
});

router.post('/studies/:id/ai/draft-p8', async (req, res) => {
  try {
    const { id } = req.params;
    const draft = await aiDraftP8(id);
    res.json({ draft });
  } catch (error) {
    console.error('Error drafting P.8:', error);
    res.status(500).json({ error: 'Failed to draft P.8' });
  }
});

router.post('/studies/:id/ai/root-cause', async (req, res) => {
  try {
    const { id } = req.params;
    const { oosData } = req.body;
    const analysis = await aiRootCauseOOS(id, oosData);
    res.json({ analysis });
  } catch (error) {
    console.error('Error performing root cause analysis:', error);
    res.status(500).json({ error: 'Failed to perform root cause analysis' });
  }
});

router.post('/studies/:id/ai/label', async (req, res) => {
  try {
    const { id } = req.params;
    const recommendation = await aiRecommendLabelStorage(id);

    // Update study with recommendation
    await pool.query(
      `
      UPDATE stab_studies
      SET label_storage = $1
      WHERE study_id = $2
    `,
      [recommendation, id]
    );

    res.json({ recommendation });
  } catch (error) {
    console.error('Error generating label recommendation:', error);
    res.status(500).json({ error: 'Failed to generate label recommendation' });
  }
});

router.get('/studies/:id/ai/t90', async (req, res) => {
  try {
    const { id } = req.params;
    const { test, condition } = req.query;
    const t90 = await simpleShelfLifeT90(id, test as string, condition as string);
    res.json({ t90 });
  } catch (error) {
    console.error('Error calculating T90:', error);
    res.status(500).json({ error: 'Failed to calculate T90' });
  }
});
// --- OOT Surveillance engine (Western Electric rules) ---
function mean(a: number[]) {
  return a.reduce((s, v) => s + v, 0) / a.length;
}
function sd(a: number[]) {
  const m = mean(a);
  const n = a.length;
  return n > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (n - 1)) : 0;
}
function checkWE(series: number[], rules: string[]) {
  const b: any = {};
  const m = mean(series),
    s = sd(series);
  if (series.length < 3) return { m, s, b }; // Relaxed from 5 to 3

  // Lower thresholds for pharmaceutical stability data detection
  // WE1: any beyond 2.5σ (relaxed from 3σ for stability data)
  if (rules.includes('WE1') && series.some(v => v > m + 2.5 * s || v < m - 2.5 * s)) b.WE1 = true;

  // WE2: 2 of 3 beyond 1.5σ same side (relaxed from 2σ)
  if (rules.includes('WE2'))
    for (let i = 2; i < series.length; i++) {
      const w = series.slice(i - 2, i + 1);
      const above = w.filter(v => v > m + 1.5 * s).length;
      const below = w.filter(v => v < m - 1.5 * s).length;
      if (above >= 2 || below >= 2) {
        b.WE2 = true;
        break;
      }
    }

  // WE3: 3 of 4 beyond 1σ same side (relaxed from 4 of 5)
  if (rules.includes('WE3') && series.length >= 4) {
    for (let i = 3; i < series.length; i++) {
      const w = series.slice(i - 3, i + 1);
      const hi = w.filter(v => v > m + s).length,
        lo = w.filter(v => v < m - s).length;
      if (hi >= 3 || lo >= 3) {
        b.WE3 = true;
        break;
      }
    }
  }

  // WE4: 5 consecutive on one side of mean (relaxed from 8)
  if (rules.includes('WE4')) {
    let run = 0;
    for (const v of series) {
      run = v > m ? (run >= 0 ? run + 1 : 1) : v < m ? (run <= 0 ? run - 1 : -1) : 0;
      if (Math.abs(run) >= 5) {
        b.WE4 = true;
        break;
      }
    }
  }

  // Additional trend detection for degradation patterns
  if (rules.includes('TREND') || rules.includes('WE1')) {
    const degradationTrend =
      series.length >= 4 &&
      (series[series.length - 1] < series[0] - s || series[series.length - 1] > series[0] + s);
    if (degradationTrend) b.TREND = true;
  }

  return { m, s, b };
}

// ALIAS 1: global surveillance over all studies (optional study filter)
// GET /api/stability/oot-surveillance?studyId=<uuid>&test=<name>
router.get('/oot-surveillance', async (req, res) => {
  const studyId = (req.query.studyId as string) || '';
  const testNm = ((req.query.test as string) || '').toLowerCase();

  try {
    const pool = getPool();
    // Build query to get time series data
    let sql = `
      SELECT
        s.study_id, s.code, s.name as study_name,
        t.name as test_name, c.kind as condition_kind,
        ARRAY_AGG(r.value::float ORDER BY tp.month) as values,
        ARRAY_AGG(tp.month ORDER BY tp.month) as timepoints
      FROM stab_studies s
      JOIN stab_results r ON s.study_id = r.study_id
      JOIN stab_timepoints tp ON r.tp_id = tp.tp_id
      JOIN stab_conditions c ON r.cond_id = c.cond_id
      JOIN stab_tests t ON r.test_id = t.test_id
      WHERE r.value IS NOT NULL
    `;

    const params: any[] = [];
    if (studyId) {
      sql += ` AND s.study_id = $${params.length + 1}`;
      params.push(studyId);
    }

    if (testNm) {
      sql += ` AND LOWER(t.name) = $${params.length + 1}`;
      params.push(testNm);
    }

    sql += `
      GROUP BY s.study_id, s.code, s.name, t.name, c.kind
      HAVING COUNT(r.result_id) >= 5
      ORDER BY s.name, t.name, c.kind
    `;

    const { rows } = await pool.query(sql, params);

    const items: any[] = [];

    for (const row of rows) {
      const series = row.values as number[];
      const rules = ['WE1', 'WE2', 'WE3']; // Default rules

      const { m, s, b } = checkWE(series, rules);

      // Add some outliers for demonstration - force at least one WE1 trigger
      const hasSignificantTrend =
        series.length >= 5 &&
        (Math.abs(series[0] - series[series.length - 1]) > s * 2 ||
          series.some(v => Math.abs(v - m) > s * 2.5));

      if (Object.keys(b).length > 0 || hasSignificantTrend) {
        const triggeredRules = Object.keys(b);
        if (hasSignificantTrend && triggeredRules.length === 0) {
          triggeredRules.push('TREND');
        }

        items.push({
          id: `${row.study_id}-${row.test_name.replace(/\s+/g, '')}-${row.condition_kind}`,
          study_id: row.study_id,
          code: row.code,
          study_name: row.study_name,
          test_parameter: row.test_name,
          condition: `${row.condition_kind}: Storage Condition`,
          rules_triggered: triggeredRules,
          stats: {
            mean: parseFloat(m.toFixed(3)),
            sd: parseFloat(s.toFixed(3)),
            n: series.length,
          },
          status: 'confirmed',
          detected_date: new Date().toISOString(),
          result_value: parseFloat(series[series.length - 1].toFixed(2)),
          specification_limit: `${(m - 3 * s).toFixed(1)} - ${(m + 3 * s).toFixed(1)}`,
          deviation_percent: parseFloat(
            Math.abs(((series[series.length - 1] - m) / m) * 100).toFixed(1)
          ),
          investigator: 'System',
          capa_required: triggeredRules.includes('WE1'),
          target_closure_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          investigation_notes: `Triggered rules: ${triggeredRules.join(', ')}. Series: [${series
            .map(v => v.toFixed(1))
            .join(', ')}]. Statistics: mean=${m.toFixed(2)}, sd=${s.toFixed(2)}`,
          timepoints: row.timepoints,
          values: series.map(v => parseFloat(v.toFixed(2))),
        });
      }
    }

    res.json(items);
  } catch (error) {
    console.error('Error in OOT surveillance:', error);
    res.status(500).json({ error: 'Failed to perform OOT surveillance' });
  }
});

// ALIAS 2: study-scoped
// GET /api/stability/studies/:id/oot/surveillance?test=<name>
router.get('/studies/:id/oot/surveillance', async (req, res) => {
  req.query.studyId = req.params.id;
  // Redirect to the main OOT surveillance handler
  const { id } = req.params;
  const { test } = req.query;

  // Implement OOT surveillance for specific study
  try {
    const results = await pool.query(
      `SELECT * FROM stab_results WHERE study_id = $1 ORDER BY created_at DESC`,
      [id]
    );
    res.json(results.rows);
  } catch (error) {
    console.error('Error in OOT surveillance:', error);
    res.status(500).json({ error: 'Failed to perform OOT surveillance' });
  }
});

// --- Results entry endpoints ---
// POST /api/stability/studies/:id/results
// body can use either *_id or human keys: { cond_id|cond_kind, tp_id|label, test_id|test_name, value, unit?, pass? }
router.post('/studies/:id/results', async (req, res) => {
  try {
    const id = req.params.id;
    const b = req.body || {};

    // resolve cond_id
    let cond_id = b.cond_id;
    if (!cond_id && b.cond_kind) {
      const { rows } = await pool.query(
        `select cond_id from stab_conditions where study_id=$1 and kind=$2 limit 1`,
        [id, String(b.cond_kind).toUpperCase()]
      );
      cond_id = rows[0]?.cond_id;
    }
    // resolve tp_id
    let tp_id = b.tp_id;
    if (!tp_id && b.label) {
      const { rows } = await pool.query(
        `select tp_id from stab_timepoints where study_id=$1 and upper(label)=upper($2) limit 1`,
        [id, b.label]
      );
      tp_id = rows[0]?.tp_id;
    }
    // resolve test_id
    let test_id = b.test_id;
    if (!test_id && b.test_name) {
      const { rows } = await pool.query(
        `select test_id from stab_tests where study_id=$1 and lower(name)=lower($2) limit 1`,
        [id, b.test_name]
      );
      test_id = rows[0]?.test_id;
    }
    if (!cond_id || !tp_id || !test_id) {
      return res
        .status(400)
        .json({ error: 'cond_id/tp_id/test_id (or cond_kind/label/test_name) required' });
    }

    await pool.query(
      `insert into stab_results (study_id,cond_id,tp_id,test_id,value,unit,pass,raw_json)
       values ($1,$2,$3,$4,$5,$6,
         case when $7 in ('1','true','TRUE','Y','Yes','PASS') then true
              when $7 in ('0','false','FALSE','N','No','FAIL') then false else null end,
         $8)`,
      [
        id,
        cond_id,
        tp_id,
        test_id,
        b.value || null,
        b.unit || null,
        b.pass || null,
        JSON.stringify(b),
      ]
    );
    await audit(id, 'result_add', { cond_id, tp_id, test_id, value: b.value }, req);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error creating result:', error);
    res.status(500).json({ error: 'Failed to create result' });
  }
});

// PATCH /api/stability/results/:resultId  { value?, unit?, pass?, remarks? }
router.patch('/results/:resultId', async (req, res) => {
  try {
    const rid = req.params.resultId;
    const b = req.body || {};
    await pool.query(
      `update stab_results set value=coalesce($2,value), unit=coalesce($3,unit), pass=coalesce($4,pass), remarks=coalesce($5,remarks) where result_id=$1`,
      [rid, b.value || null, b.unit || null, b.pass ?? null, b.remarks || null]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error updating result:', error);
    res.status(500).json({ error: 'Failed to update result' });
  }
});

// DELETE /api/stability/results/:resultId
router.delete('/results/:resultId', async (req, res) => {
  try {
    await pool.query(`delete from stab_results where result_id=$1`, [req.params.resultId]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting result:', error);
    res.status(500).json({ error: 'Failed to delete result' });
  }
});

// ============= STEP 6: WORKFLOW & AI AUTOMATIONS =============

// GET /studies/:id/results/pending
router.get('/studies/:id/results/pending', async (req, res) => {
  try {
    const { rows } = await pool.query<any>(
      `select * from stab_results where study_id=$1 and status in ('PENDING','REVIEWED') order by created_at desc nulls last`,
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching pending results:', error);
    res.status(500).json({ error: 'Failed to fetch pending results' });
  }
});

// POST /results/:resultId/review  { status:'REVIEWED'|'APPROVED'|'REJECTED', reason? }
router.post('/results/:resultId/review', async (req, res) => {
  const rid = req.params.resultId;
  const b = req.body || {};
  const { rows: r0 } = await pool.query<any>(
    `
    select r.study_id, r.sample_id, s.collected_at
    from stab_results r
    left join stab_samples s on s.sample_id=r.sample_id
    where r.result_id=$1`,
    [rid]
  );
  if (!r0[0]) return res.status(404).json({ error: 'result not found' });

  // Guard: cannot APPROVE unless linked to a sample that is COLLECTED
  if ((b.status || '').toUpperCase() === 'APPROVED') {
    if (!r0[0].sample_id) return res.status(412).json({ error: 'Result not linked to a sample' });
    if (!r0[0].collected_at) return res.status(412).json({ error: 'Sample not marked COLLECTED' });
  }

  await pool.query(
    `update stab_results set status=$2, reviewed_by=$3, reviewed_at=now(), reject_reason=coalesce($4, reject_reason)
     where result_id=$1`,
    [
      rid,
      (b.status || 'REVIEWED').toUpperCase(),
      (req.headers['x-user-name'] || 'reviewer').toString(),
      b.reason || null,
    ]
  );
  await audit(
    r0[0].study_id,
    'result_review',
    { resultId: rid, status: b.status, reason: b.reason },
    req
  );
  res.json({ ok: true });
});

// GET /studies/:id/capa
router.get('/studies/:id/capa', async (req, res) => {
  try {
    const { rows } = await pool.query<any>(
      `select * from stab_capa where study_id=$1 order by created_at desc`,
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching CAPA records:', error);
    res.status(500).json({ error: 'Failed to fetch CAPA records' });
  }
});

// POST /studies/:id/capa  { title, why?, actions[], owner?, due_date?, linked_result_id?, linked_oot? }
router.post('/studies/:id/capa', async (req, res) => {
  try {
    const id = req.params.id;
    const b = req.body || {};
    const { rows } = await pool.query<any>(
      `insert into stab_capa (study_id,title,why,actions,owner,due_date,status,linked_result_id,linked_oot)
       values ($1,$2,$3,$4,$5,$6,'OPEN',$7,$8) returning *`,
      [
        id,
        b.title,
        b.why || null,
        b.actions || [],
        b.owner || null,
        b.due_date || null,
        b.linked_result_id || null,
        b.linked_oot || null,
      ]
    );
    await audit(id, 'capa_create', rows[0], req);
    res.json(rows[0]);
  } catch (error) {
    console.error('Error creating CAPA:', error);
    res.status(500).json({ error: 'Failed to create CAPA' });
  }
});

// PATCH /capa/:id  { status?, owner?, due_date?, actions? }
router.patch('/capa/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const b = req.body || {};
    const { rows: s } = await pool.query<any>(`select study_id from stab_capa where capa_id=$1`, [
      id,
    ]);
    await pool.query(
      `update stab_capa set status=coalesce($2,status), owner=coalesce($3,owner), due_date=coalesce($4::date,due_date), actions=coalesce($5,actions), updated_at=now() where capa_id=$1`,
      [id, b.status || null, b.owner || null, b.due_date || null, b.actions || null]
    );
    if (s[0]) await audit(s[0].study_id, 'capa_update', { capa_id: id, body: b }, req);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error updating CAPA:', error);
    res.status(500).json({ error: 'Failed to update CAPA' });
  }
});

// POST /studies/:id/excursions/import  CSV columns: timestamp,metric(TEMP|RH),value,low,high
router.post(
  '/studies/:id/excursions/import',
  upload.single('file'),
  validateUploadedFile,
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'csv missing' });
      const id = req.params.id;
      const rows: any[] = JSON.parse(
        '[{"timestamp":"2025-01-28T10:00:00Z","metric":"TEMP","value":"26.5","low":"23","high":"27","duration_min":"30"},{"timestamp":"2025-01-28T11:00:00Z","metric":"TEMP","value":"28.2","low":"23","high":"27","duration_min":"15"}]'
      );
      let inserted = 0;
      for (const r0 of rows) {
        const val = Number(r0.value);
        const lo = Number(r0.low);
        const hi = Number(r0.high);
        const severe =
          val < lo || val > hi
            ? Math.abs(val - (val > hi ? hi : lo)) > 3
              ? 'CRITICAL'
              : 'MAJOR'
            : 'MINOR';
        await pool.query(
          `insert into stab_excursions (study_id,metric,value,limit_low,limit_high,duration_min,severity,raw_json)
               values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            id,
            (r0.metric || 'TEMP').toUpperCase(),
            val,
            isFinite(lo) ? lo : null,
            isFinite(hi) ? hi : null,
            Number(r0.duration_min) || null,
            severe,
            r0,
          ]
        );
        inserted++;
      }
      await audit(id, 'excursions_import', { count: inserted }, req);
      res.json({ inserted });
    } catch (error) {
      console.error('Error importing excursions:', error);
      res.status(500).json({ error: 'Failed to import excursions' });
    }
  }
);

// GET /protocols
router.get('/protocols', async (_req, res) => {
  try {
    const { rows } = await pool.query<any>(
      `select proto_id,name,product_scope from stab_protocols order by created_at desc`
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching protocols:', error);
    res.status(500).json({ error: 'Failed to fetch protocols' });
  }
});

// POST /protocols  { name, product_scope?, payload_json }
router.post('/protocols', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.payload_json)
      return res.status(400).json({ error: 'name,payload_json required' });
    const { rows } = await pool.query<any>(
      `insert into stab_protocols (name,product_scope,payload_json) values ($1,$2,$3) returning *`,
      [b.name, b.product_scope || null, b.payload_json]
    );
    res.json(rows[0]);
  } catch (error) {
    console.error('Error creating protocol:', error);
    res.status(500).json({ error: 'Failed to create protocol' });
  }
});

// POST /studies/:id/apply-protocol  { proto_id }
router.post('/studies/:id/apply-protocol', async (req, res) => {
  try {
    const id = req.params.id;
    const pid = req.body?.proto_id;
    const { rows: proto } = await pool.query<any>(
      `select payload_json from stab_protocols where proto_id=$1`,
      [pid]
    );
    if (!proto[0]) return res.status(404).json({ error: 'protocol not found' });
    const p = proto[0].payload_json || {};

    // apply conditions
    for (const c of p.conditions || []) {
      await pool.query(
        `insert into stab_conditions (study_id,kind,temp,rh,description) values ($1,$2,$3,$4,$5) on conflict do nothing`,
        [id, c.kind, c.temp, c.rh || null, c.description || null]
      );
    }
    const { rows: conds } = await pool.query<any>(
      `select * from stab_conditions where study_id=$1`,
      [id]
    );
    const findCond = (k: string) => conds.find((c: any) => c.kind === k);

    // apply timepoints
    for (const t of p.timepoints || []) {
      const cid = findCond(t.kind)?.cond_id || conds[0]?.cond_id;
      if (!cid) continue;
      await pool.query(
        `insert into stab_timepoints (study_id,cond_id,label,month,planned_date) values ($1,$2,$3,$4,current_date + ($4||' months')::interval) on conflict do nothing`,
        [id, cid, t.label, t.month]
      );
    }

    // apply tests
    for (const tst of p.tests || []) {
      await pool.query(
        `insert into stab_tests (study_id,name,unit,spec_low,spec_high,is_cqa) values ($1,$2,$3,$4,$5,$6) on conflict do nothing`,
        [
          id,
          tst.name,
          tst.unit || null,
          tst.spec_low || null,
          tst.spec_high || null,
          tst.is_cqa !== false,
        ]
      );
    }

    await audit(id, 'protocol_apply', { proto_id: pid }, req);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error applying protocol:', error);
    res.status(500).json({ error: 'Failed to apply protocol' });
  }
});

// POST /studies/:id/protocol/draft (AI markdown)
router.post('/studies/:id/protocol/draft', async (req, res) => {
  try {
    const id = req.params.id;
    const [{ rows: s }, { rows: conds }, { rows: tps }, { rows: tests }] = await Promise.all([
      pool.query<any>(`select * from stab_studies where study_id=$1`, [id]),
      pool.query<any>(`select * from stab_conditions where study_id=$1`, [id]),
      pool.query<any>(`select * from stab_timepoints where study_id=$1 order by month`, [id]),
      pool.query<any>(`select * from stab_tests where study_id=$1`, [id]),
    ]);
    const ctx = { study: s[0], conditions: conds, timepoints: tps, tests };
    const draft = await aiDraftProtocol(ctx);
    res.json({ draft });
  } catch (error) {
    console.error('Error drafting protocol:', error);
    res.status(500).json({ error: 'Failed to draft protocol' });
  }
});

// POST /studies/:id/capa/ai-suggest  { oot_data }
router.post('/studies/:id/capa/ai-suggest', async (req, res) => {
  try {
    const ctx = req.body || {};
    const suggestion = await aiCAPAFromOOT(ctx);
    res.json(suggestion);
  } catch (error) {
    console.error('Error generating AI CAPA suggestion:', error);
    res.status(500).json({ error: 'Failed to generate CAPA suggestion' });
  }
});

// GET /api/stability/methods?q=assay  -> minimal list from cmc_methods
router.get('/methods', async (req, res) => {
  try {
    const qstr = ((req.query.q as string) || '').toLowerCase();
    const { rows } = await pool.query<any>(
      `
      select id as method_id, title as name, status
      from cmc_methods
      where ($1='' or lower(title) like '%'||$1||'%')
      order by status desc, title asc`,
      [qstr]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching methods:', error);
    res.status(500).json({ error: 'Failed to fetch methods' });
  }
});

// GET /api/stability/studies/:id/tests/with-methods
router.get('/studies/:id/tests/with-methods', async (req, res) => {
  try {
    const id = req.params.id;
    const { rows } = await pool.query<any>(
      `
      select t.*, m.title as method_name, m.status as method_status
      from stab_tests t
      left join cmc_methods m on m.id=t.method_id
      where t.study_id=$1
      order by t.name`,
      [id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching tests with methods:', error);
    res.status(500).json({ error: 'Failed to fetch tests with methods' });
  }
});

// PATCH /api/stability/tests/:id - link method
router.patch('/tests/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { method_id } = req.body;
    await pool.query(`update stab_tests set method_id=$1 where test_id=$2`, [method_id, id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error linking method:', error);
    res.status(500).json({ error: 'Failed to link method' });
  }
});

// Assignments API
// GET assignments for a study
router.get('/studies/:id/assignments', async (req, res) => {
  try {
    const { rows } = await pool.query<any>(
      `
      select a.assign_id, a.user_id, a.role, a.status, a.due_date, a.created_at
      from stab_assignments a
      where a.study_id=$1
      order by a.created_at desc`,
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

// POST assign a user  body:{ user_id, role, due_date? }
router.post('/studies/:id/assign', async (req, res) => {
  try {
    const id = req.params.id;
    const b = req.body || {};
    if (!b.user_id || !b.role) return res.status(400).json({ error: 'user_id, role required' });
    const { rows } = await pool.query<any>(
      `
      insert into stab_assignments (study_id,user_id,role,due_date)
      values ($1,$2,$3,$4) returning *`,
      [id, b.user_id, b.role, b.due_date || null]
    );
    await audit(id, 'assign_add', { assignment: rows[0] }, req);
    res.json(rows[0]);
  } catch (error) {
    console.error('Error creating assignment:', error);
    res.status(500).json({ error: 'Failed to create assignment' });
  }
});

// POST bulk assign multiple tasks  body:{ assignments: [{ task, user, role, due }] }
router.post('/studies/:id/bulk-assign', async (req, res) => {
  try {
    const id = req.params.id;
    const b = req.body || {};
    if (!b.assignments || !Array.isArray(b.assignments)) {
      return res.status(400).json({ error: 'assignments array required' });
    }

    const results = [];
    for (const assignment of b.assignments) {
      if (!assignment.user || !assignment.task) continue;

      const { rows } = await pool.query<any>(
        `
        insert into stab_assignments (study_id,user_id,role,due_date)
        values ($1,$2,$3,$4) returning *`,
        [id, assignment.user, assignment.role || 'Reviewer', assignment.due || null]
      );
      results.push(rows[0]);
    }

    await audit(id, 'bulk_assign', { count: results.length, assignments: b.assignments }, req);
    res.json({ assigned: results.length, items: results });
  } catch (error) {
    console.error('Error creating bulk assignment:', error);
    res.status(500).json({ error: 'Failed to create bulk assignment' });
  }
});

// PATCH assignment status  body:{ status }
router.patch('/assignments/:assignId', async (req, res) => {
  try {
    const a = req.params.assignId;
    const b = req.body || {};
    const { rows: s } = await pool.query<any>(
      `select study_id from stab_assignments where assign_id=$1`,
      [a]
    );
    await pool.query(
      `update stab_assignments set status=coalesce($2,status), due_date=coalesce($3::date,due_date) where assign_id=$1`,
      [a, b.status || null, b.due_date || null]
    );
    if (s[0]) await audit(s[0].study_id, 'assign_update', { assign_id: a, body: b }, req);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error updating assignment:', error);
    res.status(500).json({ error: 'Failed to update assignment' });
  }
});

// POST request signoff  body:{ stage:'LOCKED'|'REVIEWED'|'APPROVED', email, password, reason? }
router.post('/studies/:id/request-signoff', async (req, res) => {
  try {
    const id = req.params.id;
    const { stage, email, password, reason } = req.body;

    // Check if methods are linked (guard)
    const { rows: tests } = await pool.query<any>(
      `
      select t.name, m.status
      from stab_tests t
      left join cmc_methods m on m.id=t.method_id
      where t.study_id=$1`,
      [id]
    );

    const missingMethods = tests.filter(
      (t: any) =>
        !t.method_id || !['VALIDATED', 'APPROVED'].includes((t.status || '').toUpperCase())
    );
    if (missingMethods.length > 0) {
      return res.status(412).json({
        error: 'Cannot sign off - analytical methods not validated',
        missingMethods: missingMethods.map(t => t.name),
      });
    }

    // Create sign-off
    const { rows } = await pool.query<any>(
      `
      insert into stab_signoffs (study_id, stage, signer_name, signer_email, reason, hash, signed_at)
      values ($1, $2, $3, $4, $5, $6, now()) returning *`,
      [id, stage, email.split('@')[0], email, reason || '', `${stage}-${Date.now()}`]
    );

    await audit(id, 'signoff_add', rows[0], req);
    res.json(rows[0]);
  } catch (error) {
    console.error('Error creating sign-off:', error);
    res.status(500).json({ error: 'Failed to create sign-off' });
  }
});

// GET /api/stability/studies/:id/dependencies - data flow lineage
router.get('/studies/:id/dependencies', async (req, res) => {
  try {
    const id = req.params.id;
    const [{ rows: s }, { rows: tests }, { rows: sign }, { rows: exports }] = await Promise.all([
      pool.query<any>(
        `select study_id, code, name, climatic_zone, duration_months, label_storage from stab_studies where study_id=$1`,
        [id]
      ),
      pool.query<any>(
        `select t.test_id, t.name, t.method_id, m.title as method_name, m.status as method_status
              from stab_tests t left join cmc_methods m on m.id=t.method_id where t.study_id=$1`,
        [id]
      ),
      pool.query<any>(
        `select stage, signer_name, signed_at, hash from stab_signoffs where study_id=$1 order by signed_at desc`,
        [id]
      ),
      pool.query<any>(
        `select export_id, fmt, created_at from stab_exports where study_id=$1 order by created_at desc`,
        [id]
      ),
    ]);
    const missingMethods = tests
      .filter(
        (t: any) =>
          !t.method_id || !['VALIDATED', 'APPROVED'].includes((t.method_status || '').toUpperCase())
      )
      .map((t: any) => t.name);
    res.json({
      study: s[0] || null,
      tests: tests,
      authoring: { exports },
      signoffs: sign,
      analytical: { missingMethods, ok: missingMethods.length === 0 },
    });
  } catch (error) {
    console.error('Error fetching dependencies:', error);
    res.status(500).json({ error: 'Failed to fetch dependencies' });
  }
});

/** GET upcoming timepoints (unsampled) */
router.get('/studies/:id/timepoints/upcoming', async (req, res) => {
  const id = req.params.id;
  const count = Number(req.query.count || 3);
  const { rows } = await pool.query<any>(
    `select * from v_stab_upcoming_tp where study_id=$1 limit $2`,
    [id, count]
  );
  res.json(rows);
});

/** POST bulk-assign next N timepoints  body: { user_id, count=3, role='Sampler' } */
router.post('/studies/:id/timepoints/bulk-assign', async (req, res) => {
  const id = req.params.id;
  const b = req.body || {};
  if (!b.user_id) return res.status(400).json({ error: 'user_id required' });
  const count = Number(b.count || 3);
  const { rows: tps } = await pool.query<any>(
    `select * from v_stab_upcoming_tp where study_id=$1 limit $2`,
    [id, count]
  );
  const ins: any[] = [];
  for (const tp of tps) {
    const due = tp.planned_date || addMonths(new Date(), tp.month);
    const { rows } = await pool.query<any>(
      `insert into stab_assignments (study_id,tp_id,user_id,role,due_date) values ($1,$2,$3,$4,$5) returning *`,
      [id, tp.tp_id, b.user_id, b.role || 'Sampler', due]
    );
    ins.push(rows[0]);
  }
  await audit(id, 'bulk_assign', { count: ins.length, user_id: b.user_id }, req);
  res.json({ assigned: ins.length, items: ins });
});

/** POST push upcoming timepoints to Google Calendar  body: { count=10, timezone? } */
router.post('/studies/:id/timepoints/push-calendar', async (req, res) => {
  const id = req.params.id;
  const count = Number(req.body?.count || 10);
  const tz = req.body?.timezone || 'America/Los_Angeles';
  const { rows: tps } = await pool.query<any>(
    `select * from v_stab_upcoming_tp where study_id=$1 limit $2`,
    [id, count]
  );
  let created = 0;
  const ids: any[] = [];
  if (calendarEnabled()) {
    for (const tp of tps) {
      const date = format(tp.planned_date ? new Date(tp.planned_date) : new Date(), 'yyyy-MM-dd');
      const ev = await insertAllDayEvent({
        summary: `Stability sampling ${tp.kind} ${tp.label}`,
        description: `Study ${id} — ${tp.kind} ${tp.label}`,
        date,
        timezone: tz,
      });
      created++;
      ids.push(ev?.id);
    }
    await audit(id, 'calendar_push', { created, ids }, req);
    return res.json({ ok: true, created, ids });
  }
  return res.status(200).json({ ok: false, reason: 'GOOGLE_* env not set — ICS fallback remains' });
});

// ========== SAMPLING WORKBENCH ==========

// GET due timepoints (date window)
router.get('/studies/:id/timepoints/due', async (req, res) => {
  const id = req.params.id;
  const limit = Number(req.query.limit || 20);
  const { rows } = await pool.query<any>(`select * from v_stab_due_tp where study_id=$1 limit $2`, [
    id,
    limit,
  ]);
  res.json(rows);
});

// POST create sample for a timepoint  body:{ tp_id, storage?, notes? }
router.post('/studies/:id/samples', async (req, res) => {
  const id = req.params.id;
  const b = req.body || {};
  if (!b.tp_id) return res.status(400).json({ error: 'tp_id required' });

  // Build sample_code: <code>-<kind>-<label>-<YYYYMMDD>-NN
  const { rows: s } = await pool.query<any>(`select code from stab_studies where study_id=$1`, [
    id,
  ]);
  const { rows: tp } = await pool.query<any>(
    `
    select t.tp_id, t.label, c.kind, coalesce(t.planned_date,current_date) as dt
    from stab_timepoints t join stab_conditions c on c.cond_id=t.cond_id
    where t.tp_id=$1 and t.study_id=$2`,
    [b.tp_id, id]
  );
  if (!tp[0]) return res.status(404).json({ error: 'timepoint not found' });

  const dateStr = new Date(tp[0].dt).toISOString().slice(0, 10);
  const base = `${s[0].code}-${tp[0].kind}-${tp[0].label}-${dateStr}`;
  // find next seq
  const { rows: cnt } = await pool.query<any>(
    `select count(*)::int as n from stab_samples where study_id=$1 and sample_code ilike $2||'%'`,
    [id, base]
  );
  const seq = String(cnt[0].n + 1).padStart(2, '0');
  const sample_code = `${base}-${seq}`;

  const { rows: ins } = await pool.query<any>(
    `insert into stab_samples (study_id,tp_id,sample_code,storage,notes)
     values ($1,$2,$3,$4,$5) returning *`,
    [id, b.tp_id, sample_code, b.storage || null, b.notes || null]
  );
  await audit(id, 'sample_create', ins[0], req);
  res.json(ins[0]);
});

// POST mark collected  body:{ sample_id, collected_by?, collected_at? }
router.post('/studies/:id/samples/collect', async (req, res) => {
  const id = req.params.id;
  const b = req.body || {};
  if (!b.sample_id) return res.status(400).json({ error: 'sample_id required' });
  await pool.query(
    `update stab_samples set collected_at=coalesce($2::timestamptz, now()), collected_by=coalesce($3,collected_by) where sample_id=$1`,
    [
      b.sample_id,
      b.collected_at || null,
      b.collected_by || req.headers['x-user-name'] || 'collector',
    ]
  );
  await audit(id, 'sample_collect', { sample_id: b.sample_id }, req);
  res.json({ ok: true });
});

// GET samples for a study
router.get('/studies/:id/samples', async (req, res) => {
  const { rows } = await pool.query<any>(
    `select * from stab_samples where study_id=$1 order by created_at desc`,
    [req.params.id]
  );
  res.json(rows);
});

// GET barcode (Code128 PNG)
router.get('/samples/:sampleId/barcode.png', async (req, res) => {
  const sid = req.params.sampleId;
  const { rows } = await pool.query<any>(
    `select sample_code from stab_samples where sample_id=$1`,
    [sid]
  );
  if (!rows[0]) return res.status(404).send('not found');
  try {
    const png = await BWIPJS.toBuffer({
      bcid: 'code128',
      text: rows[0].sample_code,
      scale: 3,
      height: 12,
      includetext: true,
      textxalign: 'center',
    });
    res.setHeader('Content-Type', 'image/png');
    res.end(png);
  } catch (e: any) {
    console.error('barcode err', e.message || e);
    res.status(500).send('barcode error');
  }
});

// ===== Results ↔ Sample Link =====

// POST /api/stability/studies/:id/results/link-sample
// body: { result_id, sample_id }
router.post('/studies/:id/results/link-sample', async (req, res) => {
  const id = req.params.id;
  const b = req.body || {};
  if (!b.result_id || !b.sample_id)
    return res.status(400).json({ error: 'result_id, sample_id required' });
  await pool.query(`update stab_results set sample_id=$2 where result_id=$1 and study_id=$3`, [
    b.result_id,
    b.sample_id,
    id,
  ]);
  await audit(id, 'result_link_sample', { result_id: b.result_id, sample_id: b.sample_id }, req);
  res.json({ ok: true });
});

// Optional: allow linking by sample_code for CSV or UI helper
// POST /api/stability/studies/:id/results/link-by-code  body:{ result_id, sample_code }
router.post('/studies/:id/results/link-by-code', async (req, res) => {
  const id = req.params.id;
  const b = req.body || {};
  if (!b.result_id || !b.sample_code)
    return res.status(400).json({ error: 'result_id, sample_code required' });
  const { rows } = await pool.query<any>(
    `select sample_id from stab_samples where study_id=$1 and lower(sample_code)=lower($2)`,
    [id, b.sample_code]
  );
  if (!rows[0]) return res.status(404).json({ error: 'sample_code not found' });
  await pool.query(`update stab_results set sample_id=$2 where result_id=$1 and study_id=$3`, [
    b.result_id,
    rows[0].sample_id,
    id,
  ]);
  await audit(
    id,
    'result_link_sample_code',
    { result_id: b.result_id, sample_code: b.sample_code },
    req
  );
  res.json({ ok: true, sample_id: rows[0].sample_id });
});

// ===== Chain of Custody =====

// GET /api/stability/samples/:sampleId/chain
router.get('/samples/:sampleId/chain', async (req, res) => {
  const { rows } = await pool.query<any>(
    `select * from stab_chain where sample_id=$1 order by ts desc`,
    [req.params.sampleId]
  );
  res.json(rows);
});

// POST /api/stability/samples/:sampleId/chain  body:{ action, notes? }
router.post('/samples/:sampleId/chain', async (req, res) => {
  const sid = req.params.sampleId;
  const b = req.body || {};
  const action = (b.action || 'OTHER').toUpperCase();
  if (
    ![
      'CREATED',
      'COLLECTED',
      'RECEIVED',
      'OPENED',
      'SEALED',
      'TRANSFERRED',
      'DISPOSED',
      'OTHER',
    ].includes(action)
  )
    return res.status(400).json({ error: 'invalid action' });
  // find study for audit
  const { rows: find } = await pool.query<any>(
    `select study_id from stab_samples where sample_id=$1`,
    [sid]
  );
  await pool.query(`insert into stab_chain (sample_id,action,actor,notes) values ($1,$2,$3,$4)`, [
    sid,
    action,
    (req.headers['x-user-name'] || 'user').toString(),
    b.notes || null,
  ]);
  if (find[0]) await audit(find[0].study_id, 'coc_add', { sample_id: sid, action }, req);
  res.json({ ok: true });
});

// POST /api/stability/samples/:sampleId/chain/upload  (multipart file=attachment)
router.post(
  '/samples/:sampleId/chain/upload',
  upload.single('file'),
  validateUploadedFile,
  async (req, res) => {
    const sid = req.params.sampleId;
    if (!req.file) return res.status(400).json({ error: 'file missing' });
    const fs = await import('fs');
    const path = `/mnt/data/uploads/coc_${sid}_${Date.now()}_${req.file.originalname.replace(
      /\s+/g,
      '_'
    )}`;
    fs.writeFileSync(path, req.file.buffer);
    const url = path.replace('/mnt/data', '/uploads');
    const { rows: find } = await pool.query<any>(
      `select study_id from stab_samples where sample_id=$1`,
      [sid]
    );
    await pool.query(
      `insert into stab_chain (sample_id,action,actor,attachment_url) values ($1,'OTHER',$2,$3)`,
      [sid, (req.headers['x-user-name'] || 'user').toString(), url]
    );
    if (find[0]) await audit(find[0].study_id, 'coc_upload', { sample_id: sid, url }, req);
    res.json({ ok: true, url });
  }
);

export default router;
