import express from 'express';
import { getPool } from '../../db';
import { z } from 'zod';

const router = express.Router();

// Validation schemas
const createStudySchema = z.object({
  projectId: z.string().uuid().optional(),
  studyName: z.string().min(1, 'Study name is required'),
  studyType: z.string().optional(), // Long-term, Accelerated, Stress
  storageCondition: z.string().optional(),
  duration: z.string().optional(),
  timePoints: z.string().optional(),
  containerClosure: z.string().optional(),
  testParameters: z.string().optional(),
  status: z.string().optional().default('planned'),
  startedDate: z.string().optional(),
  completedDate: z.string().optional(),
  results: z.any().optional(),
});

const updateStudySchema = z.object({
  studyName: z.string().optional(),
  studyType: z.string().optional(),
  storageCondition: z.string().optional(),
  duration: z.string().optional(),
  timePoints: z.string().optional(),
  containerClosure: z.string().optional(),
  testParameters: z.string().optional(),
  status: z.string().optional(),
  startedDate: z.string().optional(),
  completedDate: z.string().optional(),
  results: z.any().optional(),
});

// GET /api/cmc/stability/:projectId - List stability studies for a project
router.get('/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const tenantId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }
    const pool = getPool();


    const result = await pool.query(
      `SELECT * FROM stability_studies
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
    console.error('[CMC Stability] Error fetching studies:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stability studies',
      message: 'Operation failed',
    });
  }
});

// POST /api/cmc/stability - Create stability study
router.post('/', async (req, res) => {
  try {
    const validationResult = createStudySchema.safeParse(req.body);

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
      `INSERT INTO stability_studies (
        project_id, tenant_id, study_name, study_type, storage_condition,
        duration, time_points, container_closure, test_parameters,
        status, started_date, completed_date, results
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        data.projectId || null,
        tenantId,
        data.studyName,
        data.studyType || null,
        data.storageCondition || null,
        data.duration || null,
        data.timePoints || null,
        data.containerClosure || null,
        data.testParameters || null,
        data.status || 'planned',
        data.startedDate || null,
        data.completedDate || null,
        JSON.stringify(data.results || null),
      ]
    );

    const study = result.rows[0];
    console.log(`[CMC Stability] Created study ${study.id}: ${data.studyName}`);

    res.status(201).json({
      success: true,
      data: study,
      message: 'Stability study created successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC Stability] Error creating study:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create stability study',
      message: 'Operation failed',
    });
  }
});

// PUT /api/cmc/stability/:id - Update stability study
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const validationResult = updateStudySchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data',
        details: validationResult.error.errors,
      });
    }

    const data = validationResult.data;
    const pool = getPool();


    // Verify study exists
    const existing = await pool.query(
      `SELECT * FROM stability_studies WHERE id = $1`, [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Study not found' });
    }

    // Build dynamic update
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      studyName: 'study_name',
      studyType: 'study_type',
      storageCondition: 'storage_condition',
      duration: 'duration',
      timePoints: 'time_points',
      containerClosure: 'container_closure',
      testParameters: 'test_parameters',
      status: 'status',
      startedDate: 'started_date',
      completedDate: 'completed_date',
      results: 'results',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if ((data as any)[key] !== undefined) {
        updates.push(`${col} = $${paramIndex}`);
        const val = (data as any)[key];
        if (key === 'results' && typeof val === 'object') {
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
      UPDATE stability_studies
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const updateResult = await pool.query(updateQuery, values);

    console.log(`[CMC Stability] Updated study ${id}`);

    res.json({
      success: true,
      data: updateResult.rows[0],
      message: 'Stability study updated successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC Stability] Error updating study:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update stability study',
      message: 'Operation failed',
    });
  }
});

// GET /api/cmc/stability/:id/projections - Shelf-life projection (Arrhenius model)
router.get('/:id/projections', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getPool();


    const result = await pool.query(
      `SELECT * FROM stability_studies WHERE id = $1`, [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Study not found' });
    }

    const study = result.rows[0];
    const results = study.results || {};

    // Arrhenius-based shelf-life projection
    // k = A * exp(-Ea / (R * T))
    // R = 8.314 J/(mol*K), Ea typical for pharmaceuticals: 80-120 kJ/mol

    const R = 8.314; // J/(mol*K)
    const Ea = 83000; // J/mol (typical activation energy for degradation)

    // Parse storage condition for temperature
    let tempC = 25; // default long-term
    const condition = (study.storage_condition || '').toLowerCase();
    if (condition.includes('40')) tempC = 40;
    else if (condition.includes('30')) tempC = 30;
    else if (condition.includes('5') || condition.includes('refriger')) tempC = 5;
    else if (condition.includes('25')) tempC = 25;

    const tempK = tempC + 273.15;
    const tempRef = 25 + 273.15; // reference temperature (25C)

    // Acceleration factor from Arrhenius equation
    const accelerationFactor = Math.exp(
      (Ea / R) * (1 / tempRef - 1 / tempK)
    );

    // Parse duration for time data
    let durationMonths = 24; // default
    const durationStr = study.duration || '';
    const durationMatch = durationStr.match(/(\d+)/);
    if (durationMatch) durationMonths = parseInt(durationMatch[1]);

    // Project shelf-life at 25C based on accelerated data
    const projectedShelfLifeMonths = Math.round(durationMonths * accelerationFactor);

    // ICH guideline shelf-life limits
    const ichLimits: Record<string, number> = {
      'long-term': 36,    // ICH Q1A: 12-36 months typical
      'accelerated': 6,   // ICH Q1A: 6 months minimum
      'stress': 1,        // Short-term stress
    };

    const studyType = (study.study_type || 'long-term').toLowerCase();
    const ichMinimum = ichLimits[studyType] || 6;

    // Degradation rate estimate
    const degradationRatePerMonth = tempC > 25
      ? 0.5 / accelerationFactor  // % per month at 25C
      : 0.3; // nominal rate for long-term

    // Generate time-point projections
    const timePointProjections: any[] = [];
    const timePointsArr = (study.time_points || '0,3,6,9,12,18,24,36').split(',').map((t: string) => parseInt(t.trim())).filter((t: number) => !isNaN(t));

    for (const tp of timePointsArr) {
      const purityProjected = Math.max(95, 100 - degradationRatePerMonth * tp);
      timePointProjections.push({
        month: tp,
        projectedPurity: parseFloat(purityProjected.toFixed(2)),
        degradation: parseFloat((degradationRatePerMonth * tp).toFixed(2)),
        withinSpec: purityProjected >= 95,
      });
    }

    const projection = {
      studyId: study.id,
      studyName: study.study_name,
      studyType: study.study_type,
      storageCondition: study.storage_condition,
      arrheniusModel: {
        activationEnergy: Ea / 1000, // kJ/mol
        referenceTemperature: '25C',
        testTemperature: `${tempC}C`,
        accelerationFactor: parseFloat(accelerationFactor.toFixed(2)),
      },
      projectedShelfLife: {
        months: projectedShelfLifeMonths,
        confidence: tempC > 25 ? 'moderate' : 'high',
        basis: tempC > 25 ? 'Arrhenius extrapolation from accelerated data' : 'Direct long-term data',
      },
      ichCompliance: {
        minimumRequired: ichMinimum,
        projectedMeets: projectedShelfLifeMonths >= ichMinimum,
        guideline: 'ICH Q1A(R2) / Q1E',
      },
      degradationProfile: {
        ratePerMonth: parseFloat(degradationRatePerMonth.toFixed(4)),
        mechanism: 'First-order kinetics (assumed)',
        timePointProjections,
      },
      recommendations: [
        projectedShelfLifeMonths < 24
          ? 'Consider reformulation or improved packaging to extend shelf life'
          : 'Projected shelf life meets typical commercial requirements',
        tempC > 25
          ? 'Confirm projections with long-term data at 25C/60% RH per ICH Q1A'
          : 'Continue monitoring at established time points',
        'File statistical analysis per ICH Q1E for regulatory submission',
      ],
    };

    res.json({
      success: true,
      data: projection,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC Stability] Error generating projections:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate shelf-life projections',
      message: 'Operation failed',
    });
  }
});

export default router;
