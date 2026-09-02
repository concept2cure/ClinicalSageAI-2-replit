/**
 * Manufacturing Module API Routes
 *
 * Endpoints for:
 *   - Manufacturing overview / KPI dashboard
 *   - Equipment registry (Plug & Produce)
 *   - Batch execution records (EBR)
 *   - Deviations and quality test results
 *   - AI-driven rule review and deficiency simulation
 *   - Regulatory responses management
 *   - Batch release readiness checks
 *
 * Uses the actual migration-066 schema (manufacturing.*) with parameterized SQL.
 * Falls back gracefully when tables do not yet exist.
 *
 * @module routes/manufacturing-routes
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';

// ─── Zod Schemas for Manufacturing Input Validation ──────────────────────────

const equipmentSchema = z.object({
  equipmentCode: z.string().min(1, 'equipmentCode is required'),
  equipmentName: z.string().min(1, 'equipmentName is required'),
  equipmentClass: z.string().min(1, 'equipmentClass is required'),
  manufacturer: z.string().min(1, 'manufacturer is required'),
  modelNumber: z.string().optional(),
  serialNumber: z.string().optional(),
  status: z.enum(['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'RETIRED']).default('AVAILABLE'),
  capabilities: z.record(z.unknown()).default({}),
  building: z.string().optional(),
  room: z.string().optional(),
  cleanRoomClass: z.string().optional(),
  nextCalibrationDue: z.string().optional(),
  nextMaintenanceDue: z.string().optional(),
});

const batchSchema = z.object({
  batchNumber: z.string().min(1, 'batchNumber is required'),
  productName: z.string().min(1, 'productName is required'),
  recipeId: z.string().optional(),
  recipeVersion: z.string().optional(),
  scheduledStart: z.string().optional(),
  plannedQuantity: z.number().positive().optional(),
  quantityUnit: z.string().optional(),
  masterBatchRecordRef: z.string().optional(),
});

const batchStatusSchema = z.object({
  status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'QUARANTINE']),
  actualStart: z.string().optional(),
  actualEnd: z.string().optional(),
  actualQuantity: z.number().positive().optional(),
});

const deviationSchema = z.object({
  title: z.string().min(1, 'title is required'),
  description: z.string().optional().default(''),
  severity: z.enum(['MINOR', 'MAJOR', 'CRITICAL']).default('MINOR'),
  category: z.string().optional(),
  relatedCpp: z.string().nullish(),
  reportedBy: z.string().optional().default('system'),
});

const testResultSchema = z.object({
  testCode: z.string().min(1, 'testCode is required'),
  testName: z.string().min(1, 'testName is required'),
  testMethod: z.string().nullish(),
  sampleId: z.string().optional(),
  sampleType: z.string().optional().default('RELEASE'),
  resultValue: z.number().nullish(),
  resultString: z.string().nullish(),
  resultUnit: z.string().nullish(),
  specLowerLimit: z.number().nullish(),
  specUpperLimit: z.number().nullish(),
  specTargetValue: z.number().nullish(),
  performedBy: z.string().optional().default('system'),
});

const responseSchema = z.object({
  id: z.string().optional(),
  findingId: z.string().min(1, 'findingId is required'),
  section: z.string().nullish(),
  text: z.string().min(1, 'text is required'),
  evidenceIds: z.array(z.string()).default([]),
});

// ---------- AI reviewer (ESM) -- loaded lazily to avoid hard crash ----------
let reviewManufacturing: ((snapshot: any, opts?: any) => Promise<any[]>) | null = null;
let simulateDeficiency: ((snapshot: any, opts?: any) => Promise<any>) | null = null;

async function loadReviewer() {
  if (reviewManufacturing) return;
  try {
    // manufacturingReviewer is an untyped .js module (allowJs is off, so it
    // resolves to the ambient `*.js` wildcard that only exposes `default`).
    // Cast to the known runtime export shape at this JS-module boundary.
    const mod = (await import('../src/services/ai/manufacturingReviewer.js')) as unknown as {
      reviewManufacturing: (snapshot: any, opts?: any) => Promise<any[]>;
      simulateDeficiency: (snapshot: any, opts?: any) => Promise<any>;
    };
    reviewManufacturing = mod.reviewManufacturing;
    simulateDeficiency = mod.simulateDeficiency;
  } catch (err) {
    console.warn('[Manufacturing] manufacturingReviewer not available:', (err as Error).message);
  }
}

// ---------- Seed data -- loaded lazily for overview defaults ----------------
let seedData: any = null;
function getSeedData(): any {
  if (seedData) return seedData;
  try {
    seedData = require('../src/services/manufacturing/seed.json');
  } catch {
    seedData = {};
  }
  return seedData;
}

export default function createManufacturingRoutes(pool: Pool): Router {
  const router = Router();

  // ── Helpers ────────────────────────────────────────────────────────────────

  // The manufacturing.* tables key tenancy on a uuid `org_id`. The authenticated
  // org identity rides on req.user.organizationId (the same field the working
  // regulatory_intel routes filter on) / organizationUuid; req.tenantId is the
  // integer org id and was never populated on this mount, which is why every
  // query here silently ran UNSCOPED (cross-tenant). Derive the real org, and —
  // because org_id is uuid — return it ONLY when it is a valid uuid, so a token
  // carrying an integer org identity fails closed (no rows) rather than
  // type-erroring or leaking. A non-uuid / absent org means "no tenant scope".
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function getOrgId(req: Request): string | null {
    const raw =
      (req as any).user?.organizationUuid ??
      (req as any).user?.organizationId ??
      (req as any).tenantContext?.organizationUuid ??
      (req as any).tenantContext?.organizationId ??
      (req as any).tenantId ??
      null;
    const orgId = raw != null ? String(raw) : null;
    if (!orgId || !UUID_RE.test(orgId)) {
      console.warn('[Manufacturing] No uuid tenant scope on request — org-scoped queries return empty rather than cross-tenant data');
      return null;
    }
    return orgId;
  }

  /**
   * The tenant scope, or a refusal. Handlers must use THIS, not `getOrgId`.
   *
   * ── The defect ──────────────────────────────────────────────────────────────
   * `getOrgId` returns null when the request carries no UUID tenant scope, and
   * its own warning says the consequence is that "org-scoped queries return
   * empty rather than cross-tenant data". That was true of `/overview`, which
   * fails closed at the top of this file, and false everywhere else: ten sites
   * wrote the predicate as
   *
   *     if (orgId) { where += ` AND org_id = $n`; params.push(orgId); }
   *
   * so a null scope did not narrow the query to nothing — it removed the
   * boundary and returned EVERY tenant's rows. An optional predicate is not a
   * filter, it is a default, and the default was "all tenants".
   *
   * What is behind it: GMP batch execution records with yields and deviations,
   * equipment qualification state, quality test dispositions, and drafted
   * responses to regulatory deficiency findings.
   *
   * Three INSERTs had the mirror-image bug — `orgId || null` wrote rows with a
   * NULL `org_id`, and the RLS policy on these tables carries an
   * `OR org_id IS NULL` arm, so an unscoped write was permanently readable by
   * every tenant.
   *
   * ── Why 403 and not an empty list ───────────────────────────────────────────
   * An empty list is a claim: "your organization has no batch records". A
   * request that could not establish which organization is asking has not
   * earned that claim. `/overview` degrades to empty KPIs because a dashboard
   * with no numbers is legible; a record list is not, and a scientist reading
   * an empty deviation log would draw the wrong conclusion from it.
   *
   * Returns null and HAS ALREADY ANSWERED when there is no scope — callers must
   * `return` immediately without writing to `res` again.
   */
  function requireOrgId(req: Request, res: Response): string | null {
    const orgId = getOrgId(req);
    if (!orgId) {
      res.status(403).json({
        error: {
          code: 'MFG_NO_TENANT_SCOPE',
          message:
            'This request carries no organization scope, so manufacturing records cannot be read or written. Sign in again, or contact your administrator if the problem persists.',
        },
      });
      return null;
    }
    return orgId;
  }

  function safeError(
    res: Response,
    error: any,
    code: string,
    label: string
  ): Response {
    if (error?.code === '42P01' || error?.code === '3F000') {
      console.warn(`[Manufacturing] ${label}: table/schema not found — run migration 066`);
      return res.status(503).json({
        error: 'Manufacturing tables not yet provisioned — run migration 066',
        code: 'MFG_NOT_PROVISIONED',
      });
    }
    console.error(`[Manufacturing] ${label}:`, error);
    return res.status(500).json({
      error: `${label} failed`,
      code,
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 1. GET /overview — KPI snapshot
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/overview', async (req: Request, res: Response) => {
    try {
      // Attempt real DB aggregation; report honest zeros/nulls + dataAvailable:false on failure
      let equipmentCount = 0;
      let batchCount = 0;
      let deviationRate = 0;
      let batchesWithDeviations = 0;
      let oee = 0;
      let releaseTimeDays: number | null = null;
      let qualityPassRate = 0;
      let ppqCompletedRuns = 0;
      let ppqTargetRuns = 3;
      let readinessPercent = 0;
      let dataAvailable = true;

      // These KPI aggregates MUST be org-scoped. Unscoped, they returned platform-
      // wide counts to any authenticated caller — a cross-tenant metadata leak.
      // With no resolvable uuid tenant scope, report honest zeros rather than
      // another tenant's (or every tenant's) numbers.
      /* This handler alone keeps `getOrgId` and degrades to empty KPIs rather
         than refusing: a dashboard with no numbers is legible, and it already
         fails closed into that path at the `throw` below. Every OTHER handler
         returns records, where an empty list would be read as "your
         organization has none" — see requireOrgId. */
      const orgId = getOrgId(req);
      if (!orgId) {
        dataAvailable = false;
      }

      try {
        if (!orgId) throw new Error('no-tenant-scope'); // fail closed into the empty-KPI path
        const [eqRes, batchRes, devRes, qualRes] = await Promise.all([
          pool.query(`SELECT COUNT(*) AS cnt FROM manufacturing.equipment_registry WHERE status != 'DECOMMISSIONED' AND org_id = $1`, [orgId]),
          pool.query(`SELECT COUNT(*) AS cnt,
                             COUNT(*) FILTER (WHERE status = 'RELEASED') AS released,
                             AVG(EXTRACT(EPOCH FROM (released_at - actual_start)) / 86400.0)
                               FILTER (WHERE released_at IS NOT NULL AND actual_start IS NOT NULL) AS avg_release_days
                      FROM manufacturing.batch_execution_records WHERE org_id = $1`, [orgId]),
          pool.query(`SELECT COUNT(*) AS cnt FROM manufacturing.batch_execution_records WHERE deviation_count > 0 AND org_id = $1`, [orgId]),
          pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE disposition = 'PASS') AS passed FROM manufacturing.quality_test_results WHERE org_id = $1`, [orgId]),
        ]);

        equipmentCount = parseInt(eqRes.rows[0].cnt, 10);
        batchCount = parseInt(batchRes.rows[0].cnt, 10);
        const releasedBatches = parseInt(batchRes.rows[0].released, 10);
        batchesWithDeviations = parseInt(devRes.rows[0].cnt, 10);
        deviationRate = batchCount > 0 ? Math.round((batchesWithDeviations / batchCount) * 100) : 0;
        const totalTests = parseInt(qualRes.rows[0].total, 10);
        const passedTests = parseInt(qualRes.rows[0].passed, 10);
        qualityPassRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 100;
        oee = batchCount > 0 ? Math.round((releasedBatches / batchCount) * 100) : 0;
        // Real mean release cycle time (days) from batch timestamps; null when unmeasurable
        const avgReleaseDays = batchRes.rows[0].avg_release_days;
        releaseTimeDays = avgReleaseDays != null ? Math.round(Number(avgReleaseDays)) : null;

        // Estimate readiness from completeness of equipment qualification + batch completion + quality
        const qualificationScore = equipmentCount > 0 ? 25 : 0;
        const batchScore = batchCount > 0 ? 25 : 0;
        const qualityScore = qualityPassRate >= 80 ? 25 : (qualityPassRate / 80) * 25;
        const ppqScore = ppqCompletedRuns >= ppqTargetRuns ? 25 : (ppqCompletedRuns / ppqTargetRuns) * 25;
        readinessPercent = Math.round(qualificationScore + batchScore + qualityScore + ppqScore);
      } catch {
        // DB aggregation failed (e.g. tables not provisioned) — report honest
        // empty KPIs with an error flag; never fabricate canned numbers.
        dataAvailable = false;
      }

      return res.json({
        readinessPercent,
        ppq: { completedRuns: ppqCompletedRuns, targetRuns: ppqTargetRuns },
        deviationRate,
        oee,
        releaseTimeDays,
        qualityPassRate,
        aiCompliance: {
          rulesLoaded: reviewManufacturing !== null,
          lastCheckAt: new Date().toISOString(),
        },
        equipmentCount,
        batchCount,
        dataAvailable,
      });
    } catch (error: any) {
      return safeError(res, error, 'MFG_OVERVIEW_ERROR', 'Manufacturing overview');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. GET /equipment — List equipment with calibration/maintenance alerts
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/equipment', async (req: Request, res: Response) => {
    try {
      const orgId = requireOrgId(req, res);
      if (!orgId) return;
      const status = req.query.status as string | undefined;
      const needsCalibration = req.query.needsCalibration === 'true';

      let whereClause = 'WHERE 1=1';
      const params: unknown[] = [];
      let idx = 1;

      whereClause += ` AND org_id = $${idx++}`;
      params.push(orgId);
      if (status) {
        whereClause += ` AND status = $${idx++}`;
        params.push(status);
      }
      if (needsCalibration) {
        whereClause += ` AND next_calibration_due <= NOW() + INTERVAL '30 days'`;
      }

      const result = await pool.query(
        `SELECT id, equipment_code, equipment_name, equipment_class, manufacturer,
                model_number, serial_number, status,
                iq_completed, oq_completed, pq_completed,
                calibration_status, last_calibration_date, next_calibration_due,
                last_maintenance_date, next_maintenance_due,
                building, room, clean_room_class,
                capabilities, metadata, created_at, updated_at
         FROM manufacturing.equipment_registry
         ${whereClause}
         ORDER BY equipment_name
         LIMIT 200`,
        params
      );

      // Compute alerts for each piece of equipment
      const now = new Date();
      const equipment = result.rows.map((row: any) => {
        const alerts: string[] = [];
        if (row.next_calibration_due && new Date(row.next_calibration_due) <= now) {
          alerts.push('CALIBRATION_OVERDUE');
        } else if (
          row.next_calibration_due &&
          new Date(row.next_calibration_due).getTime() - now.getTime() < 30 * 86400000
        ) {
          alerts.push('CALIBRATION_DUE_SOON');
        }
        if (row.next_maintenance_due && new Date(row.next_maintenance_due) <= now) {
          alerts.push('MAINTENANCE_OVERDUE');
        }
        if (!row.pq_completed) alerts.push('PQ_INCOMPLETE');
        if (!row.oq_completed) alerts.push('OQ_INCOMPLETE');
        if (!row.iq_completed) alerts.push('IQ_INCOMPLETE');
        return { ...row, alerts };
      });

      return res.json({ equipment, total: equipment.length });
    } catch (error: any) {
      return safeError(res, error, 'MFG_EQUIPMENT_LIST_ERROR', 'List equipment');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. POST /equipment — Register new equipment (Plug & Produce)
  // ═══════════════════════════════════════════════════════════════════════════

  router.post('/equipment', async (req: Request, res: Response) => {
    try {
      const orgId = requireOrgId(req, res);
      if (!orgId) return;
      const parsed = equipmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      }

      const {
        equipmentCode,
        equipmentName,
        equipmentClass,
        manufacturer,
        modelNumber,
        serialNumber,
        status,
        capabilities,
        building,
        room,
        cleanRoomClass,
        nextCalibrationDue,
        nextMaintenanceDue,
      } = parsed.data;

      const result = await pool.query(
        `INSERT INTO manufacturing.equipment_registry (
           equipment_code, equipment_name, equipment_class, manufacturer,
           model_number, serial_number, status, capabilities,
           building, room, clean_room_class,
           next_calibration_due, next_maintenance_due, org_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [
          equipmentCode,
          equipmentName,
          equipmentClass,
          manufacturer,
          modelNumber || null,
          serialNumber || null,
          status || 'AVAILABLE',
          JSON.stringify(capabilities || {}),
          building || null,
          room || null,
          cleanRoomClass || null,
          nextCalibrationDue || null,
          nextMaintenanceDue || null,
          orgId,
        ]
      );

      return res.status(201).json({ equipment: result.rows[0] });
    } catch (error: any) {
      if (error?.code === '23505') {
        return res.status(409).json({
          error: 'Equipment with this code already exists',
          code: 'MFG_EQUIPMENT_DUPLICATE',
        });
      }
      return safeError(res, error, 'MFG_EQUIPMENT_CREATE_ERROR', 'Register equipment');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. GET /batches — List batch execution records
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/batches', async (req: Request, res: Response) => {
    try {
      const orgId = requireOrgId(req, res);
      if (!orgId) return;
      const status = req.query.status as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
      const offset = parseInt(req.query.offset as string, 10) || 0;

      let whereClause = 'WHERE 1=1';
      const params: unknown[] = [];
      let idx = 1;

      whereClause += ` AND org_id = $${idx++}`;
      params.push(orgId);
      if (status) {
        whereClause += ` AND status = $${idx++}`;
        params.push(status);
      }

      params.push(limit, offset);

      const [countRes, dataRes] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) AS cnt FROM manufacturing.batch_execution_records ${whereClause}`,
          params.slice(0, idx - 1)
        ),
        pool.query(
          `SELECT id, batch_number, product_name, status, recipe_id, recipe_version,
                  scheduled_start, actual_start, actual_end,
                  planned_quantity, actual_quantity, quantity_unit, yield_percentage,
                  quality_status, deviation_count, deviations,
                  release_method, released_at,
                  metadata, created_at, updated_at
           FROM manufacturing.batch_execution_records
           ${whereClause}
           ORDER BY created_at DESC
           LIMIT $${idx++} OFFSET $${idx}`,
          params
        ),
      ]);

      return res.json({
        batches: dataRes.rows,
        total: parseInt(countRes.rows[0].cnt, 10),
        limit,
        offset,
      });
    } catch (error: any) {
      return safeError(res, error, 'MFG_BATCH_LIST_ERROR', 'List batches');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. POST /batches — Create batch execution record
  // ═══════════════════════════════════════════════════════════════════════════

  router.post('/batches', async (req: Request, res: Response) => {
    try {
      const orgId = requireOrgId(req, res);
      if (!orgId) return;
      const parsed = batchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      }

      const {
        batchNumber,
        productName,
        recipeId,
        recipeVersion,
        scheduledStart,
        plannedQuantity,
        quantityUnit,
        masterBatchRecordRef,
      } = parsed.data;

      const result = await pool.query(
        `INSERT INTO manufacturing.batch_execution_records (
           batch_number, product_name, recipe_id, recipe_version,
           scheduled_start, planned_quantity, quantity_unit,
           master_batch_record_ref, status, org_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'SCHEDULED',$9)
         RETURNING *`,
        [
          batchNumber,
          productName,
          recipeId || null,
          recipeVersion || null,
          scheduledStart || null,
          plannedQuantity || null,
          quantityUnit || null,
          masterBatchRecordRef || null,
          orgId,
        ]
      );

      return res.status(201).json({ batch: result.rows[0] });
    } catch (error: any) {
      if (error?.code === '23505') {
        return res.status(409).json({
          error: 'Batch with this number already exists',
          code: 'MFG_BATCH_DUPLICATE',
        });
      }
      return safeError(res, error, 'MFG_BATCH_CREATE_ERROR', 'Create batch');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. PUT /batches/:id/status — Update batch status
  // ═══════════════════════════════════════════════════════════════════════════

  router.put('/batches/:id/status', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, actualStart, actualEnd, actualQuantity, yieldPercentage } = req.body;

      const validStatuses = [
        'SCHEDULED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED',
        'RELEASED', 'REJECTED', 'QUARANTINE',
      ];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({
          error: `status must be one of: ${validStatuses.join(', ')}`,
        });
      }

      let setClauses = 'status = $1, updated_at = NOW()';
      const params: unknown[] = [status, id];
      let idx = 3;

      if (actualStart) {
        setClauses += `, actual_start = $${idx++}`;
        params.push(actualStart);
      }
      if (actualEnd) {
        setClauses += `, actual_end = $${idx++}`;
        params.push(actualEnd);
      }
      if (actualQuantity != null) {
        setClauses += `, actual_quantity = $${idx++}`;
        params.push(actualQuantity);
      }
      if (yieldPercentage != null) {
        setClauses += `, yield_percentage = $${idx++}`;
        params.push(yieldPercentage);
      }

      // Add org_id guard to prevent cross-tenant access
      const orgId = requireOrgId(req, res);
      if (!orgId) return;
      let whereClause = 'WHERE id = $2';
      whereClause += ` AND org_id = $${idx}`;
      params.push(orgId);

      const result = await pool.query(
        `UPDATE manufacturing.batch_execution_records
         SET ${setClauses}
         ${whereClause}
         RETURNING *`,
        params
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Batch not found' });
      }

      return res.json({ batch: result.rows[0] });
    } catch (error: any) {
      return safeError(res, error, 'MFG_BATCH_STATUS_ERROR', 'Update batch status');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. POST /batches/:id/deviation — Record deviation on a batch
  // ═══════════════════════════════════════════════════════════════════════════

  router.post('/batches/:id/deviation', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const parsed = deviationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      }
      const { severity, title, description, relatedCpp, reportedBy } = parsed.data;

      const deviation = {
        id: `DEV-${Date.now().toString(36).toUpperCase()}`,
        severity,
        title,
        description: description || '',
        relatedCpp: relatedCpp || null,
        reportedBy: reportedBy || 'system',
        reportedAt: new Date().toISOString(),
        state: 'Investigating',
      };

      const orgId = requireOrgId(req, res);
      if (!orgId) return;
      const devParams: unknown[] = [JSON.stringify([deviation]), id];
      let devWhere = 'WHERE id = $2';
      devParams.push(orgId);
      devWhere += ` AND org_id = $${devParams.length}`;

      const result = await pool.query(
        `UPDATE manufacturing.batch_execution_records
         SET deviations = COALESCE(deviations, '[]'::jsonb) || $1::jsonb,
             deviation_count = COALESCE(deviation_count, 0) + 1,
             quality_status = 'DEVIATION',
             updated_at = NOW()
         ${devWhere}
         RETURNING *`,
        devParams
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Batch not found' });
      }

      return res.status(201).json({ deviation, batch: result.rows[0] });
    } catch (error: any) {
      return safeError(res, error, 'MFG_DEVIATION_ERROR', 'Record deviation');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. POST /batches/:id/test-result — Record quality test result
  // ═══════════════════════════════════════════════════════════════════════════

  router.post('/batches/:id/test-result', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const parsed = testResultSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      }
      const {
        sampleId,
        sampleType,
        testCode,
        testName,
        testMethod,
        resultValue,
        resultString,
        resultUnit,
        specLowerLimit,
        specUpperLimit,
        specTargetValue,
        performedBy,
      } = parsed.data;

      // Auto-compute disposition based on spec limits
      let disposition = 'PENDING';
      if (resultValue != null && (specLowerLimit != null || specUpperLimit != null)) {
        const val = Number(resultValue);
        const lower = specLowerLimit != null ? Number(specLowerLimit) : -Infinity;
        const upper = specUpperLimit != null ? Number(specUpperLimit) : Infinity;
        disposition = val >= lower && val <= upper ? 'PASS' : 'OOS';
      }

      // Fetch batch_number for reference (with org_id guard)
      const orgId = requireOrgId(req, res);
      if (!orgId) return;
      const batchParams: unknown[] = [id];
      let batchWhere = 'WHERE id = $1';
      batchParams.push(orgId);
      batchWhere += ` AND org_id = $${batchParams.length}`;
      const batchRow = await pool.query(
        `SELECT batch_number FROM manufacturing.batch_execution_records ${batchWhere}`,
        batchParams
      );
      if (batchRow.rows.length === 0) {
        return res.status(404).json({ error: 'Batch not found' });
      }

      const result = await pool.query(
        `INSERT INTO manufacturing.quality_test_results (
           sample_id, sample_type, batch_id, batch_number,
           test_code, test_name, test_method,
           result_value, result_string, result_unit, result_date,
           spec_lower_limit, spec_upper_limit, spec_target_value,
           disposition, performed_by, performed_at, org_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),$11,$12,$13,$14,$15,NOW(),$16)
         RETURNING *`,
        [
          sampleId || `SMP-${Date.now().toString(36).toUpperCase()}`,
          sampleType || 'RELEASE',
          id,
          batchRow.rows[0].batch_number,
          testCode,
          testName,
          testMethod || null,
          resultValue != null ? resultValue : null,
          resultString || null,
          resultUnit || null,
          specLowerLimit != null ? specLowerLimit : null,
          specUpperLimit != null ? specUpperLimit : null,
          specTargetValue != null ? specTargetValue : null,
          disposition,
          performedBy || 'system',
          getOrgId(req as Request) || null,
        ]
      );

      return res.status(201).json({ testResult: result.rows[0] });
    } catch (error: any) {
      return safeError(res, error, 'MFG_TEST_RESULT_ERROR', 'Record test result');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. GET /ai/review — Run deterministic rule checks
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/ai/review', async (req: Request, res: Response) => {
    try {
      await loadReviewer();

      // Build snapshot from DB or fall back to seed data
      let snapshot: any;
      try {
        const [eqRows, batchRows, devRows] = await Promise.all([
          pool.query(
            `SELECT equipment_code AS id,
                    (equipment_class IN ('BIOREACTOR','CHROMATOGRAPHY','FILTRATION','FILLING','ANALYTICAL')) AS critical,
                    next_calibration_due AS "calibrationDue",
                    pq_completed AS pq
             FROM manufacturing.equipment_registry
             WHERE status != 'DECOMMISSIONED'`
          ),
          pool.query(
            `SELECT id, batch_number, status, deviation_count, deviations
             FROM manufacturing.batch_execution_records
             ORDER BY created_at DESC LIMIT 50`
          ),
          pool.query(
            `SELECT COUNT(*) FILTER (WHERE status NOT IN ('COMPLETED','APPROVED')) AS incomplete
             FROM manufacturing.quality_test_results`
          ),
        ]);

        snapshot = {
          equipment: eqRows.rows.map((r: any) => ({
            id: r.id,
            critical: r.critical,
            calibrationDue: r.calibrationDue,
            pq: r.pq,
          })),
          validation: getSeedData().validation || { ppq: { completedRuns: 0, targetRuns: 3 } },
          process: getSeedData().process || { cppCqaMatrix: [] },
          ebr: { incompleteSteps: parseInt(devRows.rows[0]?.incomplete || '0', 10) },
          stability: getSeedData().stability || { longTermMonths: 0, claimMonths: 0 },
          changeControls: getSeedData().changeControls || [],
        };
      } catch {
        snapshot = getSeedData();
      }

      if (reviewManufacturing) {
        const findings = await reviewManufacturing(snapshot, { useLLM: false });
        return res.json({
          findings,
          totalFindings: findings.length,
          checkedAt: new Date().toISOString(),
          source: 'deterministic_rules',
        });
      }

      // Fallback: run inline basic checks when reviewer unavailable
      return res.json({
        findings: [],
        totalFindings: 0,
        checkedAt: new Date().toISOString(),
        source: 'fallback',
        warning: 'Manufacturing reviewer module not loaded',
      });
    } catch (error: any) {
      return safeError(res, error, 'MFG_AI_REVIEW_ERROR', 'AI review');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. POST /ai/simulate-deficiency — Generate deficiency letter + responses
  // ═══════════════════════════════════════════════════════════════════════════

  router.post('/ai/simulate-deficiency', async (req: Request, res: Response) => {
    try {
      await loadReviewer();

      const snapshot = req.body.snapshot || getSeedData();

      if (simulateDeficiency) {
        const result = await simulateDeficiency(snapshot, { useLLM: false });
        return res.json({
          letter: result.letter,
          responses: result.responses,
          generatedAt: new Date().toISOString(),
        });
      }

      return res.json({
        letter: [],
        responses: [],
        generatedAt: new Date().toISOString(),
        warning: 'Manufacturing reviewer module not loaded',
      });
    } catch (error: any) {
      return safeError(res, error, 'MFG_DEFICIENCY_ERROR', 'Simulate deficiency');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. GET /responses — List stored responses
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/responses', async (req: Request, res: Response) => {
    try {
      const orgId = requireOrgId(req, res);
      if (!orgId) return;

      let query = `SELECT * FROM manufacturing.responses`;
      const params: unknown[] = [];
      query += ` WHERE org_id = $1`;
      params.push(orgId);
      query += ` ORDER BY updated_at DESC`;

      const result = await pool.query(query, params);

      // Return real rows only — honest empty [] when there are none. Never serve seed data as live.
      return res.json({ responses: result.rows, source: 'database' });
    } catch (error: any) {
      return safeError(res, error, 'MFG_RESPONSES_LIST_ERROR', 'List responses');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. POST /response — Create or update a response
  // ═══════════════════════════════════════════════════════════════════════════

  router.post('/response', async (req: Request, res: Response) => {
    try {
      const orgId = requireOrgId(req, res);
      if (!orgId) return;
      const parsed = responseSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      }
      const { id, findingId, section, text, evidenceIds } = parsed.data;

      // Upsert: if id is provided, update; otherwise insert
      if (id) {
        // Org_id guard on update to prevent cross-tenant modification
        const updateParams: unknown[] = [findingId, section || null, text, JSON.stringify(evidenceIds || []), id];
        let updateWhere = 'WHERE id = $5';
        updateParams.push(orgId);
        updateWhere += ` AND org_id = $${updateParams.length}`;
        const result = await pool.query(
          `UPDATE manufacturing.responses
           SET finding_id = $1, section = $2, response_text = $3,
               evidence_ids = $4, updated_at = NOW()
           ${updateWhere}
           RETURNING *`,
          updateParams
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Response not found' });
        }
        return res.json({ response: result.rows[0] });
      }

      const result = await pool.query(
        `INSERT INTO manufacturing.responses (finding_id, section, response_text, evidence_ids, org_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [findingId, section || null, text, JSON.stringify(evidenceIds || []), orgId]
      );

      return res.status(201).json({ response: result.rows[0] });
    } catch (error: any) {
      return safeError(res, error, 'MFG_RESPONSE_SAVE_ERROR', 'Save response');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. GET /batch-release/:batchId — Check batch release readiness
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/batch-release/:batchId', async (req: Request, res: Response) => {
    try {
      const { batchId } = req.params;

      // Fetch batch (with org_id guard)
      const orgId = requireOrgId(req, res);
      if (!orgId) return;
      const releaseParams: unknown[] = [batchId];
      let releaseWhere = 'WHERE id = $1';
      releaseParams.push(orgId);
      releaseWhere += ` AND org_id = $${releaseParams.length}`;
      const batchRes = await pool.query(
        `SELECT * FROM manufacturing.batch_execution_records ${releaseWhere}`,
        releaseParams
      );
      if (batchRes.rows.length === 0) {
        return res.status(404).json({ error: 'Batch not found' });
      }
      const batch = batchRes.rows[0];

      // Fetch quality test summary
      const testRes = await pool.query(
        `SELECT disposition, COUNT(*) AS cnt
         FROM manufacturing.quality_test_results
         WHERE batch_id = $1
         GROUP BY disposition`,
        [batchId]
      );

      const issues: string[] = [];
      let pendingTests = 0;
      let failedTests = 0;
      let totalTests = 0;

      for (const row of testRes.rows) {
        const count = parseInt(row.cnt, 10);
        totalTests += count;
        switch (row.disposition) {
          case 'PENDING':
            pendingTests = count;
            issues.push(`${count} test(s) pending`);
            break;
          case 'FAIL':
          case 'OOS':
            failedTests += count;
            issues.push(`${count} test(s) ${row.disposition}`);
            break;
          case 'OOT':
          case 'ATYPICAL':
            issues.push(`${count} test(s) ${row.disposition} — review recommended`);
            break;
        }
      }

      // Check open deviations
      const deviations = batch.deviations || [];
      const openDeviations = Array.isArray(deviations)
        ? deviations.filter((d: any) => d.state !== 'Resolved' && d.state !== 'Closed').length
        : 0;
      if (openDeviations > 0) {
        issues.push(`${openDeviations} open deviation(s)`);
      }

      // Check batch status
      if (batch.status !== 'COMPLETED' && batch.status !== 'RELEASED') {
        issues.push(`Batch status is '${batch.status}', expected COMPLETED`);
      }

      // Check qualification of equipment if available
      if (batch.equipment_ids && Array.isArray(batch.equipment_ids) && batch.equipment_ids.length > 0) {
        const eqRes = await pool.query(
          `SELECT COUNT(*) FILTER (WHERE NOT pq_completed) AS unqualified
           FROM manufacturing.equipment_registry
           WHERE id = ANY($1)`,
          [batch.equipment_ids]
        );
        const unqualified = parseInt(eqRes.rows[0]?.unqualified || '0', 10);
        if (unqualified > 0) {
          issues.push(`${unqualified} equipment item(s) not PQ-qualified`);
        }
      }

      const ready = issues.length === 0;

      return res.json({
        batchId,
        batchNumber: batch.batch_number,
        ready,
        pendingTests,
        failedTests,
        totalTests,
        openDeviations,
        batchStatus: batch.status,
        issues,
        checkedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      return safeError(res, error, 'MFG_RELEASE_CHECK_ERROR', 'Batch release readiness');
    }
  });

  return router;
}
