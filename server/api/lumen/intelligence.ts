import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { z, ZodError } from 'zod';
import rateLimit from 'express-rate-limit';
import { Parser } from 'json2csv';
import { authenticate } from '../../middleware/authAdapter.js';
import { requireRoles } from '../../middleware/auth.js';

// ── AUTHENTICATION MIDDLEWARE ──
const authMiddleware = [authenticate, requireRoles('admin', 'data_scientist')];

// ── DATABASE ──
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
});

// ── RATE LIMITING ──
const searchLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Rate limit exceeded. Please try again in 1 minute.',
  },
});

// ── VALIDATION SCHEMAS ──
const QueryFiltersSchema = z.object({
  // Basic filters
  submission_id: z.string().optional(),
  study_id: z.string().optional(),
  drug_name: z.string().optional(),
  indication: z.string().optional(),
  phase: z.enum(['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4']).optional(),
  regulatory_agency: z.enum(['FDA', 'EMA', 'Health Canada', 'PMDA', 'NMPA']).optional(),

  // Data presence filters
  has_pk_data: z.boolean().optional(),
  has_sae_data: z.boolean().optional(),
  has_protocol_deviations: z.boolean().optional(),

  // Quality filters
  confidence_min: z.number().min(0).max(1).optional().default(0.75),
  confidence_max: z.number().min(0).max(1).optional().default(1.0),
  completeness_min: z.number().min(0).max(1).optional().default(0.6),

  // Pagination
  limit: z.number().min(1).max(1000).optional().default(100),
  offset: z.number().min(0).optional().default(0),

  // Sorting
  sort_by: z
    .enum(['extraction_confidence_score', 'completeness_score', 'created_at', 'randomized_n'])
    .optional()
    .default('extraction_confidence_score'),
  sort_order: z.enum(['ASC', 'DESC']).optional().default('DESC'),

  // Search mode
  search_mode: z.enum(['fuzzy', 'exact']).optional().default('fuzzy'),
});

const JSONPathQuerySchema = z.object({
  submission_id: z.string(),
  json_path: z.string().regex(/^[a-zA-Z0-9_.\[\]]+$/),
  return_type: z.enum(['value', 'object']).optional().default('value'),
});

const SafetySignalSchema = z.object({
  preferred_term: z.string().min(2),
  grade: z.enum(['3_4', '5']).optional().default('3_4'),
  min_percentage: z.number().min(0).max(100).optional().default(0.1),
  max_percentage: z.number().min(0).max(100).optional().default(100),
  regulatory_agency: z.string().optional(),
  phase: z.string().optional(),
});

const BulkExportSchema = z.object({
  submission_ids: z.array(z.string()).max(1000),
  include_sections: z
    .array(
      z.enum([
        'regulatory',
        'protocol',
        'population',
        'safety',
        'efficacy',
        'sites',
        'pharmacokinetics',
      ])
    )
    .optional(),
  format: z.enum(['json', 'csv']).optional().default('json'),
});

const router = Router();

router.use((req, res, next) => {
  if (!res.locals.startTime) {
    res.locals.startTime = Date.now();
  }
  next();
});

// ── HELPER FUNCTIONS ──

/**
 * Build dynamic WHERE clause from filters
 */
function buildWhereClause(filters: any): { sql: string; params: any[] } {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  // Text search with trigram or exact match
  if (filters.drug_name) {
    if (filters.search_mode === 'exact') {
      conditions.push(`drug_name ILIKE $${paramIndex}`);
      params.push(filters.drug_name);
    } else {
      // Use pg_trgm similarity (requires pg_trgm extension)
      conditions.push(`drug_name % $${paramIndex}`);
      params.push(filters.drug_name);
    }
    paramIndex++;
  }

  if (filters.indication) {
    conditions.push(`deep_data -> 'regulatory' ->> 'indication' ILIKE $${paramIndex}`);
    params.push(`%${filters.indication}%`);
    paramIndex++;
  }

  // Enum filters
  if (filters.phase) {
    conditions.push(`phase = $${paramIndex}`);
    params.push(filters.phase);
    paramIndex++;
  }

  if (filters.regulatory_agency) {
    conditions.push(`regulatory_agency = $${paramIndex}`);
    params.push(filters.regulatory_agency);
    paramIndex++;
  }

  // Boolean presence filters
  if (filters.has_pk_data !== undefined) {
    conditions.push(`has_pk_data = $${paramIndex}`);
    params.push(filters.has_pk_data);
    paramIndex++;
  }

  if (filters.has_sae_data !== undefined) {
    conditions.push(`has_sae_data = $${paramIndex}`);
    params.push(filters.has_sae_data);
    paramIndex++;
  }

  // Range filters
  if (filters.confidence_min !== undefined) {
    conditions.push(`extraction_confidence_score >= $${paramIndex}`);
    params.push(filters.confidence_min);
    paramIndex++;
  }

  if (filters.confidence_max !== undefined) {
    conditions.push(`extraction_confidence_score <= $${paramIndex}`);
    params.push(filters.confidence_max);
    paramIndex++;
  }

  if (filters.completeness_min !== undefined) {
    conditions.push(`completeness_score >= $${paramIndex}`);
    params.push(filters.completeness_min);
    paramIndex++;
  }

  // Complex JSONB filters (e.g., enrollment size)
  if (filters.randomized_n_min) {
    conditions.push(
      `CAST(deep_data #>> '{population,enrollment,randomized_n}' AS INTEGER) >= $${paramIndex}`
    );
    params.push(filters.randomized_n_min);
    paramIndex++;
  }

  const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { sql: whereSQL, params };
}

/**
 * Parse JSON path string to PostgreSQL JSONB path syntax
 */
function parseJSONPath(jsonPath: string): string {
  const parts = jsonPath.split('.');
  return parts
    .map((part) => {
      if (part.includes('[')) {
        const [key, index] = part.split('[');
        const cleanIndex = index.replace(']', '');
        return `'${key}', '${cleanIndex}'`;
      }
      return `'${part}'`;
    })
    .join(', ');
}

/**
 * Build ORDER BY clause with JSONB field support
 */
function buildOrderBy(sortBy: string, sortOrder: string): string {
  if (sortBy.includes('.')) {
    const path = parseJSONPath(sortBy);
    return `ORDER BY jsonb_extract_path(deep_data, ${path}) ${sortOrder}`;
  }
  return `ORDER BY ${sortBy} ${sortOrder}`;
}

// ── ROUTE HANDLERS ──

/**
 * @route   GET /api/vault/intelligence
 * @desc    Query CSR vault with advanced filters and pagination
 * @access  Private (Admin/Data Scientist)
 */
router.get('/intelligence', authMiddleware, searchLimit, async (req: Request, res: Response) => {
  try {
    const filters = QueryFiltersSchema.parse(req.query);
    const { sql: whereClause, params } = buildWhereClause(filters);
    const orderByClause = buildOrderBy(filters.sort_by, filters.sort_order);

    const query = `
      SELECT 
        csr_id,
        regulatory_agency,
        submission_id,
        study_id,
        drug_name,
        indication,
        phase,
        extraction_confidence_score,
        completeness_score,
        has_pk_data,
        has_sae_data,
        has_protocol_deviations,
        missing_sections,
        pdf_url,
        deep_data,
        created_at,
        updated_at
      FROM csr_deep_vault
      ${whereClause}
      ${orderByClause}
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `;

    params.push(filters.limit, filters.offset);

    const result = await db.query(query, params);

    const countQuery = `
      SELECT COUNT(*) as total
      FROM csr_deep_vault
      ${whereClause}
    `;
    const countResult = await db.query(countQuery, params.slice(0, -2));

    res.json({
      status: 'success',
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        limit: filters.limit,
        offset: filters.offset,
        page: Math.floor(filters.offset / filters.limit) + 1,
        totalPages: Math.ceil(parseInt(countResult.rows[0].total) / filters.limit),
      },
      meta: {
        executionTimeMs: Date.now() - res.locals.startTime,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid query parameters',
        details: error.errors.map((item) => ({
          field: item.path.join('.'),
          message: item.message,
        })),
      });
    }

    console.error('Intelligence API Error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
    });
  }
});

/**
 * @route   GET /api/vault/intelligence/:submission_id
 * @desc    Get single CSR by submission ID with optional field filtering
 * @access  Private (Admin/Data Scientist)
 */
router.get('/intelligence/:submission_id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { submission_id } = req.params;
    const { fields } = req.query;

    let selectClause = '*';
    if (typeof fields === 'string' && fields.length > 0) {
      const allowedFields = [
        'csr_id',
        'submission_id',
        'study_id',
        'regulatory_agency',
        'drug_name',
        'indication',
        'phase',
        'deep_data',
        'extraction_confidence_score',
        'completeness_score',
        'has_pk_data',
        'has_sae_data',
        'pdf_url',
      ];

      const requestedFields = fields
        .split(',')
        .map((field) => field.trim())
        .filter((field) => allowedFields.includes(field));

      if (requestedFields.length > 0) {
        selectClause = requestedFields.join(', ');
      }
    }

    const query = `
      SELECT ${selectClause}
      FROM csr_deep_vault
      WHERE submission_id = $1
         OR csr_id::text = $1
    `;

    const result = await db.query(query, [submission_id]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'CSR not found',
      });
    }

    res.json({
      status: 'success',
      data: result.rows[0],
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
});

/**
 * @route   GET /api/vault/intelligence/path
 * @desc    Extract specific JSON path from CSR deep_data
 * @access  Private (Admin/Data Scientist)
 */
router.get('/intelligence/path', authMiddleware, async (req: Request, res: Response) => {
  try {
    const validation = JSONPathQuerySchema.safeParse(req.query);

    if (!validation.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid parameters',
        details: validation.error.errors,
      });
    }

    const { submission_id, json_path, return_type } = validation.data;
    const pathParts = parseJSONPath(json_path);

    const query = `
      SELECT 
        submission_id,
        drug_name,
        jsonb_extract_path(deep_data, ${pathParts}) as extracted_value
      FROM csr_deep_vault
      WHERE submission_id = $1
        AND jsonb_extract_path(deep_data, ${pathParts}) IS NOT NULL
    `;

    const result = await db.query(query, [submission_id]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'CSR not found or path does not exist',
      });
    }

    let responseData = result.rows[0].extracted_value;

    if (return_type === 'value' && typeof responseData === 'object') {
      responseData = JSON.stringify(responseData, null, 2);
    }

    res.json({
      status: 'success',
      path: json_path,
      value: responseData,
      type: typeof responseData,
      is_array: Array.isArray(responseData),
      is_null: responseData === null,
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: 'Path extraction failed',
      details: error.message,
    });
  }
});

/**
 * @route   POST /api/vault/intelligence/safety-signal
 * @desc    Search for safety signals across CSRs (Cross-trial analysis)
 * @access  Private (Admin/Data Scientist)
 */
router.post('/intelligence/safety-signal', authMiddleware, async (req: Request, res: Response) => {
  try {
    const validation = SafetySignalSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid signal parameters',
        details: validation.error.errors,
      });
    }

    const {
      preferred_term,
      grade,
      min_percentage,
      max_percentage,
      regulatory_agency,
      phase,
    } = validation.data;

    const gradeField = `grade_${grade}`;

    let query = `
      SELECT 
        csr.submission_id,
        csr.drug_name,
        csr.phase,
        csr.regulatory_agency,
        csr.extraction_confidence_score,
        soc.soc as system_organ_class,
        pt.preferred_term,
        pt.${gradeField} ->> 'percentage' as event_percentage,
        pt.${gradeField} ->> 'count' as event_count,
        (pt.${gradeField} ->> 'percentage')::float as percentage_numeric
      FROM csr_deep_vault csr,
           jsonb_array_elements(csr.deep_data -> 'safety' -> 'adverse_events' -> 'by_system_organ_class') soc,
           jsonb_array_elements(soc -> 'preferred_terms') pt
      WHERE pt ->> 'preferred_term' ILIKE $1
        AND (pt.${gradeField} ->> 'percentage')::float BETWEEN $2 AND $3
        AND csr.extraction_confidence_score >= 0.75
    `;

    const params: any[] = [`%${preferred_term}%`, min_percentage, max_percentage];
    let paramIndex = 4;

    if (regulatory_agency) {
      query += ` AND csr.regulatory_agency = $${paramIndex}`;
      params.push(regulatory_agency);
      paramIndex++;
    }

    if (phase) {
      query += ` AND csr.phase ILIKE $${paramIndex}`;
      params.push(`%${phase}%`);
    }

    query += ` ORDER BY percentage_numeric DESC LIMIT 500`;

    const result = await db.query(query, params);

    res.json({
      status: 'success',
      signal: {
        preferred_term,
        grade,
        min_percentage,
        max_percentage,
      },
      matches: result.rows,
      total_matches: result.rowCount,
      summary: {
        unique_drugs: new Set(result.rows.map((row: any) => row.drug_name)).size,
        agencies: new Set(result.rows.map((row: any) => row.regulatory_agency)).size,
      },
    });
  } catch (error: any) {
    console.error('Safety signal error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Safety signal search failed',
      details: error.message,
    });
  }
});

/**
 * @route   POST /api/vault/intelligence/bulk-export
 * @desc    Export multiple CSRs in specified format
 * @access  Private (Admin/Data Scientist)
 */
router.post('/intelligence/bulk-export', authMiddleware, async (req: Request, res: Response) => {
  try {
    const validation = BulkExportSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid export parameters',
        details: validation.error.errors,
      });
    }

    const { submission_ids, include_sections, format } = validation.data;

    if (submission_ids.length > 1000) {
      return res.status(400).json({
        status: 'error',
        message: 'Maximum 1000 submission_ids allowed',
      });
    }

    let selectFields;
    if (include_sections && include_sections.length > 0) {
      const projection = include_sections.map((section) => `'${section}', deep_data -> '${section}'`).join(', ');
      selectFields = `
        submission_id, 
        drug_name, 
        phase,
        regulatory_agency,
        extraction_confidence_score,
        jsonb_build_object(${projection}) as deep_data
      `;
    } else {
      selectFields =
        'csr_id, submission_id, study_id, drug_name, phase, regulatory_agency, deep_data, extraction_confidence_score';
    }

    const query = `
      SELECT ${selectFields}
      FROM csr_deep_vault
      WHERE submission_id = ANY($1)
      ORDER BY submission_id
    `;

    const result = await db.query(query, [submission_ids]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'No CSRs found for provided submission_ids',
      });
    }

    const timestamp = new Date().toISOString().split('T')[0];

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="lumen-deep-intelligence-${timestamp}.json"`);

      if (result.rows.length > 100) {
        res.write('[');
        result.rows.forEach((row: any, index: number) => {
          res.write(JSON.stringify(row));
          if (index < result.rows.length - 1) res.write(',');
        });
        res.write(']');
        return res.end();
      }

      return res.json(result.rows);
    }

    if (format === 'csv') {
      const flattened = result.rows.map((row: any) => ({
        submission_id: row.submission_id,
        drug_name: row.drug_name,
        phase: row.phase,
        regulatory_agency: row.regulatory_agency,
        confidence_score: row.extraction_confidence_score,
        ...flattenDeepData(row.deep_data, include_sections),
      }));

      const parser = new Parser();
      const csv = parser.parse(flattened);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="lumen-deep-intelligence-${timestamp}.csv"`);
      return res.send(csv);
    }

    res.status(400).json({
      status: 'error',
      message: 'Unsupported format',
    });
  } catch (error: any) {
    console.error('Bulk export error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Bulk export failed',
      details: error.message,
    });
  }
});

/**
 * Helper: Flatten nested JSON for CSV export
 */
function flattenDeepData(deepData: any, sections?: string[]): any {
  const flat: any = {};

  (sections || Object.keys(deepData)).forEach((section) => {
    if (deepData[section]) {
      Object.keys(deepData[section]).forEach((key) => {
        const value = deepData[section][key];
        flat[`${section}_${key}`] = typeof value === 'object' ? JSON.stringify(value) : value;
      });
    }
  });

  return flat;
}

/**
 * @route   GET /api/vault/intelligence/summary
 * @desc    Get aggregated statistics for dashboard
 * @access  Private (Admin/Data Scientist)
 */
router.get('/intelligence/summary', authMiddleware, async (req: Request, res: Response) => {
  try {
    const summary = await db.query(`
      SELECT *
      FROM mv_deep_intelligence_summary
      ORDER BY regulatory_agency, phase
    `);

    const totals = await db.query(`
      SELECT 
        COUNT(*) as total_csrs,
        AVG(extraction_confidence_score) as overall_confidence,
        AVG(completeness_score) as overall_completeness,
        COUNT(DISTINCT regulatory_agency) as agencies,
        COUNT(DISTINCT drug_name) as unique_drugs,
        COUNT(CASE WHEN has_pk_data THEN 1 END) as csrs_with_pk
      FROM csr_deep_vault
      WHERE extraction_confidence_score >= 0.75
    `);

    const recent = await db.query(`
      SELECT 
        DATE_TRUNC('day', extraction_date) as date,
        COUNT(*) as csrs_added,
        AVG(extraction_confidence_score) as avg_confidence
      FROM csr_deep_vault
      WHERE extraction_date > NOW() - INTERVAL '30 days'
      GROUP BY date
      ORDER BY date DESC
      LIMIT 30
    `);

    res.json({
      status: 'success',
      summary: summary.rows,
      totals: totals.rows[0],
      recent_activity: recent.rows,
      last_updated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Summary error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Summary generation failed',
    });
  }
});

/**
 * @route   PATCH /api/vault/intelligence/:submission_id/flag
 * @desc    Flag extraction quality issues for manual review
 * @access  Private (Admin)
 */
router.patch('/intelligence/:submission_id/flag', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { submission_id } = req.params;
    const { flag_type, notes } = req.body;

    const flagTypes = ['low_confidence', 'missing_critical_data', 'schema_violation', 'duplicate'];

    if (!flagTypes.includes(flag_type)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid flag type. Must be one of: ${flagTypes.join(', ')}`,
      });
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS csr_extraction_flags (
        flag_id SERIAL PRIMARY KEY,
        submission_id VARCHAR(100) REFERENCES csr_deep_vault(submission_id) ON DELETE CASCADE,
        flag_type VARCHAR(50) NOT NULL,
        notes TEXT,
        flagged_by VARCHAR(255),
        flagged_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(submission_id, flag_type)
      )
    `);

    const userId = (req as any).user?.id || 'system';

    await db.query(
      `
      INSERT INTO csr_extraction_flags (submission_id, flag_type, notes, flagged_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (submission_id, flag_type) 
      DO UPDATE SET 
        notes = EXCLUDED.notes,
        flagged_by = EXCLUDED.flagged_by,
        flagged_at = NOW()
    `,
      [submission_id, flag_type, notes, userId]
    );

    res.json({
      status: 'success',
      message: 'CSR flagged for review',
      submission_id,
      flag_type,
      flagged_by: userId,
    });
  } catch (error: any) {
    console.error('Flag error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Flagging failed',
    });
  }
});

/**
 * @route   GET /api/vault/intelligence/flags
 * @desc    Get all flagged CSRs for review queue
 * @access  Private (Admin)
 */
router.get('/intelligence/flags', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT 
        f.flag_id,
        f.submission_id,
        csr.drug_name,
        f.flag_type,
        f.notes,
        f.flagged_by,
        f.flagged_at,
        csr.extraction_confidence_score,
        csr.completeness_score
      FROM csr_extraction_flags f
      JOIN csr_deep_vault csr ON f.submission_id = csr.submission_id
      ORDER BY f.flagged_at DESC
    `);

    res.json({
      status: 'success',
      flags: result.rows,
      total: result.rowCount,
      pending_review: result.rowCount,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch flags',
    });
  }
});

export default router;
