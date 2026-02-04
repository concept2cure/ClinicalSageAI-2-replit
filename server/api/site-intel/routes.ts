/**
 * Site Intelligence API Routes
 *
 * Site scorecard, KPI amalgamation, risk scoring, and enrollment predictions.
 */
import { Router, Request, Response } from 'express';
import { getPool } from '../../db';

const router = Router();
const pool = getPool();

/**
 * GET /api/site-intel/sites
 * List sites with scores
 */
router.get('/sites', async (req: Request, res: Response) => {
  try {
    const {
      programId,
      projectId,
      country,
      status,
      minScore,
      sortBy = 'composite_score',
      sortDir = 'DESC',
      limit = 50,
      offset = 0,
    } = req.query;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (programId) {
      whereClause += ` AND program_id = $${paramIndex++}`;
      params.push(programId);
    }
    if (projectId) {
      whereClause += ` AND project_id = $${paramIndex++}`;
      params.push(projectId);
    }
    if (country) {
      whereClause += ` AND country = $${paramIndex++}`;
      params.push(country);
    }
    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (minScore) {
      whereClause += ` AND composite_score >= $${paramIndex++}`;
      params.push(minScore);
    }

    const validSortFields = [
      'composite_score',
      'enrollment_score',
      'quality_score',
      'operational_score',
      'created_at',
    ];
    const sortField = validSortFields.includes(sortBy as string) ? sortBy : 'composite_score';
    const sortDirection = sortDir === 'ASC' ? 'ASC' : 'DESC';

    params.push(limit, offset);

    const result = await pool.query(
      `
      SELECT *
      FROM site_intel.sites
      ${whereClause}
      ORDER BY ${sortField} ${sortDirection}
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `,
      params
    );

    const countResult = await pool.query(
      `
      SELECT COUNT(*) as total FROM site_intel.sites ${whereClause}
    `,
      params.slice(0, -2)
    );

    res.json({
      success: true,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      sites: result.rows,
    });
  } catch (error: any) {
    console.error('Error fetching sites:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/site-intel/sites
 * Create a new site
 */
router.post('/sites', async (req: Request, res: Response) => {
  try {
    const {
      programId,
      projectId,
      siteNumber,
      siteName,
      investigatorName,
      address,
      city,
      state,
      country,
      zipCode,
      phone,
      email,
      status = 'candidate',
      targetEnrollment,
      createdBy,
    } = req.body;

    if (!programId || !siteNumber || !siteName) {
      return res.status(400).json({
        success: false,
        error: 'programId, siteNumber, and siteName are required',
      });
    }

    const result = await pool.query(
      `
      INSERT INTO site_intel.sites (
        program_id, project_id, site_number, site_name,
        investigator_name, address, city, state, country,
        zip_code, phone, email, status, target_enrollment, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `,
      [
        programId,
        projectId,
        siteNumber,
        siteName,
        investigatorName,
        address,
        city,
        state,
        country,
        zipCode,
        phone,
        email,
        status,
        targetEnrollment,
        createdBy,
      ]
    );

    res.status(201).json({
      success: true,
      site: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error creating site:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/site-intel/sites/:id
 * Get site details with metrics
 */
router.get('/sites/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      includeMetrics = 'true',
      includeRisks = 'true',
      includePredictions = 'true',
    } = req.query;

    const siteResult = await pool.query(
      `
      SELECT * FROM site_intel.sites WHERE id = $1
    `,
      [id]
    );

    if (siteResult.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }

    const site = siteResult.rows[0];

    if (includeMetrics === 'true') {
      const metricsResult = await pool.query(
        `
        SELECT * FROM site_intel.site_metrics
        WHERE site_id = $1
        ORDER BY metric_date DESC
        LIMIT 30
      `,
        [id]
      );
      site.metrics = metricsResult.rows;
    }

    if (includeRisks === 'true') {
      const risksResult = await pool.query(
        `
        SELECT * FROM site_intel.site_risks
        WHERE site_id = $1 AND status IN ('open', 'monitoring')
        ORDER BY risk_score DESC
      `,
        [id]
      );
      site.risks = risksResult.rows;
    }

    if (includePredictions === 'true') {
      const predictionsResult = await pool.query(
        `
        SELECT * FROM site_intel.enrollment_predictions
        WHERE site_id = $1
        ORDER BY prediction_date DESC
        LIMIT 5
      `,
        [id]
      );
      site.predictions = predictionsResult.rows;
    }

    res.json({ success: true, site });
  } catch (error: any) {
    console.error('Error fetching site:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/site-intel/sites/:id/metrics
 * Record site metrics
 */
router.post('/sites/:id/metrics', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      metricDate,
      enrollmentActual,
      enrollmentTarget,
      screeningRate,
      screenFailRate,
      dropoutRate,
      queryRate,
      queryResolutionDays,
      protocolDeviations,
      saeCount,
      averageDataEntryDays,
      source,
    } = req.body;

    const result = await pool.query(
      `
      INSERT INTO site_intel.site_metrics (
        site_id, metric_date, enrollment_actual, enrollment_target,
        screening_rate, screen_fail_rate, dropout_rate, query_rate,
        query_resolution_days, protocol_deviations, sae_count,
        average_data_entry_days, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `,
      [
        id,
        metricDate || new Date(),
        enrollmentActual,
        enrollmentTarget,
        screeningRate,
        screenFailRate,
        dropoutRate,
        queryRate,
        queryResolutionDays,
        protocolDeviations,
        saeCount,
        averageDataEntryDays,
        source || 'manual',
      ]
    );

    // Trigger score recalculation
    await pool.query('SELECT site_intel.calculate_site_scores($1)', [id]);

    res.status(201).json({
      success: true,
      metrics: result.rows[0],
      message: 'Metrics recorded and scores recalculated',
    });
  } catch (error: any) {
    console.error('Error recording metrics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/site-intel/sites/:id/risks
 * Record a site risk
 */
router.post('/sites/:id/risks', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      riskCategory,
      riskDescription,
      likelihood,
      impact,
      mitigation,
      owner,
      dueDate,
      createdBy,
    } = req.body;

    if (!riskCategory || !riskDescription || !likelihood || !impact) {
      return res.status(400).json({
        success: false,
        error: 'riskCategory, riskDescription, likelihood, and impact are required',
      });
    }

    const riskScore = likelihood * impact;

    const result = await pool.query(
      `
      INSERT INTO site_intel.site_risks (
        site_id, risk_category, risk_description, likelihood, impact,
        risk_score, mitigation, owner, due_date, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `,
      [
        id,
        riskCategory,
        riskDescription,
        likelihood,
        impact,
        riskScore,
        mitigation,
        owner,
        dueDate,
        createdBy,
      ]
    );

    res.status(201).json({
      success: true,
      risk: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error recording risk:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/site-intel/sites/:id/risks/:riskId
 * Update a site risk
 */
router.patch('/sites/:id/risks/:riskId', async (req: Request, res: Response) => {
  try {
    const { id, riskId } = req.params;
    const updates = req.body;

    const allowedFields = ['status', 'mitigation', 'owner', 'due_date', 'resolution_notes'];
    const updateClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(snakeKey)) {
        updateClauses.push(`${snakeKey} = $${paramIndex++}`);
        values.push(value);
      }
    }

    if (updates.status === 'closed') {
      updateClauses.push(`resolved_at = NOW()`);
    }

    if (updateClauses.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid updates provided' });
    }

    values.push(riskId, id);

    const result = await pool.query(
      `
      UPDATE site_intel.site_risks
      SET ${updateClauses.join(', ')}
      WHERE id = $${paramIndex++} AND site_id = $${paramIndex}
      RETURNING *
    `,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Risk not found' });
    }

    res.json({
      success: true,
      risk: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error updating risk:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/site-intel/sites/:id/predictions
 * Record enrollment prediction
 */
router.post('/sites/:id/predictions', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { predictionDate, predictedEnrollment, confidenceInterval, modelVersion, factors } =
      req.body;

    const result = await pool.query(
      `
      INSERT INTO site_intel.enrollment_predictions (
        site_id, prediction_date, predicted_enrollment,
        confidence_interval, model_version, factors
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
      [
        id,
        predictionDate,
        predictedEnrollment,
        JSON.stringify(confidenceInterval),
        modelVersion,
        JSON.stringify(factors),
      ]
    );

    res.status(201).json({
      success: true,
      prediction: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error recording prediction:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/site-intel/recalculate-scores
 * Recalculate scores for all sites
 */
router.post('/recalculate-scores', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT site_intel.update_all_site_scores()');

    res.json({
      success: true,
      sitesUpdated: result.rows[0].update_all_site_scores,
    });
  } catch (error: any) {
    console.error('Error recalculating scores:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/site-intel/scorecard/:id
 * Get site scorecard view
 */
router.get('/scorecard/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT * FROM site_intel.site_scorecard WHERE id = $1
    `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }

    res.json({
      success: true,
      scorecard: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error fetching scorecard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/site-intel/stats
 * Get site intelligence statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { programId } = req.query;

    let whereClause = '';
    const params: any[] = [];

    if (programId) {
      whereClause = 'WHERE program_id = $1';
      params.push(programId);
    }

    const result = await pool.query(
      `
      SELECT
        (SELECT COUNT(*) FROM site_intel.sites ${whereClause}) as total_sites,
        (SELECT COUNT(*) FROM site_intel.sites ${whereClause ? whereClause + ' AND' : 'WHERE'} status = 'active') as active_sites,
        (SELECT AVG(composite_score) FROM site_intel.sites ${whereClause}) as avg_composite_score,
        (SELECT AVG(enrollment_score) FROM site_intel.sites ${whereClause}) as avg_enrollment_score,
        (SELECT AVG(quality_score) FROM site_intel.sites ${whereClause}) as avg_quality_score,
        (SELECT COUNT(*) FROM site_intel.site_risks r
         JOIN site_intel.sites s ON s.id = r.site_id
         ${whereClause ? whereClause + ' AND' : 'WHERE'} r.status = 'open') as open_risks,
        (SELECT COALESCE(SUM(enrollment_actual), 0) FROM site_intel.site_metrics) as total_enrollment
    `,
      params
    );

    res.json({
      success: true,
      stats: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
