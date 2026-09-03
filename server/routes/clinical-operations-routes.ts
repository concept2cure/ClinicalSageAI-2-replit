/**
 * Clinical Operations Module API Routes
 *
 * Full lifecycle API for clinical trial management:
 *   - Study portfolio overview & KPIs
 *   - Study CRUD with protocol tracking
 *   - Site management & performance
 *   - Enrollment tracking & forecasting
 *   - Monitoring visit scheduling
 *   - Protocol deviation tracking
 *   - Milestone & timeline management
 *
 * All SQL uses parameterized queries. Falls back gracefully when tables
 * are not yet provisioned.
 *
 * @module routes/clinical-operations-routes
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const studySchema = z.object({
  name: z.string().min(1).max(500),
  protocol: z.string().min(1).max(100),
  phase: z.enum(['Phase 1', 'Phase 1/2', 'Phase 2', 'Phase 2/3', 'Phase 3', 'Phase 4', 'Observational']),
  status: z.enum(['planning', 'recruiting', 'active', 'follow_up', 'completed', 'paused', 'terminated']),
  indication: z.string().min(1).max(500),
  targetEnrollment: z.number().int().positive(),
  sites: z.number().int().nonnegative().default(0),
  sponsorName: z.string().optional(),
  therapeuticArea: z.string().optional(),
  startDate: z.string().optional(),
  estimatedEndDate: z.string().optional(),
});

const siteSchema = z.object({
  studyId: z.string().uuid(),
  name: z.string().min(1).max(500),
  location: z.string().min(1).max(500),
  principalInvestigator: z.string().min(1).max(200),
  targetEnrollment: z.number().int().positive(),
  status: z.enum(['selected', 'initiated', 'enrolling', 'active', 'closed', 'inactive']).default('selected'),
  contactEmail: z.string().email().optional(),
  irbApprovalDate: z.string().optional(),
});

const enrollmentSchema = z.object({
  studyId: z.string().uuid(),
  siteId: z.string().uuid().optional(),
  period: z.string().min(1), // e.g. "2025-Q1" or "2025-03"
  targetCount: z.number().int().nonnegative(),
  actualCount: z.number().int().nonnegative(),
  screenFailures: z.number().int().nonnegative().default(0),
});

const monitoringVisitSchema = z.object({
  studyId: z.string().uuid(),
  siteId: z.string().uuid(),
  visitType: z.enum(['pre_study', 'initiation', 'interim', 'close_out', 'for_cause']),
  scheduledDate: z.string(),
  monitorName: z.string().min(1).max(200),
  notes: z.string().max(5000).optional(),
});

const deviationSchema = z.object({
  studyId: z.string().uuid(),
  siteId: z.string().uuid().optional(),
  subjectId: z.string().optional(),
  category: z.enum(['major', 'minor', 'administrative']),
  description: z.string().min(1).max(5000),
  detectedDate: z.string(),
  correctiveAction: z.string().max(5000).optional(),
});

const milestoneSchema = z.object({
  studyId: z.string().uuid(),
  name: z.string().min(1).max(500),
  targetDate: z.string(),
  category: z.enum(['regulatory', 'enrollment', 'data', 'safety', 'operational']).default('operational'),
});

// ─── Router Factory ───────────────────────────────────────────────────────────

export default function createClinicalOperationsRoutes(pool: Pool): Router {
  const router = Router();

  /**
   * The caller's organization, as the INTEGER clinical_ops.studies.org_id is.
   *
   * It was read as an opaque string and compared with `($1::INT IS NULL OR
   * org_id = $1)` against a TEXT column. The column is INTEGER now — every
   * other tenant key in this database is, the RLS predicate casts to ::INT,
   * and regulatory-programs.service.ts already writes `org_id::text = $2`,
   * which only makes sense against a non-text column. A value that is not a
   * positive integer resolves to null, which the queries read as "no tenant
   * filter" exactly as before.
   */
  function getOrgId(req: Request): number | null {
    const raw = (req as any).tenantId ?? (req as any).tenantContext?.organizationId;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  function safeError(res: Response, error: any, code: string, label: string): Response {
    // The schema is provisioned by db/migrations/20260902_clinical_ops_schema.sql
    // now, not by this router at request time. That DDL ran as the request's
    // own role and failed 42501 ("permission denied for database") wherever the
    // application is not a schema owner — which is every deployment that uses
    // the non-superuser runtime role — so the whole surface 500'd on every
    // call. This branch still answers honestly for a database that has not had
    // the migration applied yet: the tables are missing, which is a
    // provisioning state, not a request the caller got wrong.
    if (error?.code === '42P01' || error?.code === '3F000') {
      console.warn(`[ClinicalOps] ${label}: table/schema not found`);
      return res.status(503).json({
        error: 'Clinical operations tables not yet provisioned',
        code: 'CLINOPS_NOT_PROVISIONED',
      });
    }
    console.error(`[ClinicalOps] ${label}:`, error);
    return res.status(500).json({ error: `${label} failed`, code });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // OVERVIEW / DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/clinical-operations/overview
   * Portfolio KPI snapshot
   */
  router.get('/overview', async (_req: Request, res: Response) => {
    try {
      const orgId = getOrgId(_req);

      const studiesResult = await pool.query(
        `SELECT status, COUNT(*) as count, SUM(enrolled) as enrolled, SUM(target_enrollment) as target
         FROM clinical_ops.studies WHERE ($1::INT IS NULL OR org_id = $1)
         GROUP BY status`,
        [orgId],
      );

      const deviationsResult = await pool.query(
        `SELECT category, COUNT(*) as count FROM clinical_ops.deviations
         WHERE status = 'open' AND study_id IN (
           SELECT id FROM clinical_ops.studies WHERE ($1::INT IS NULL OR org_id = $1)
         ) GROUP BY category`,
        [orgId],
      );

      const upcomingVisits = await pool.query(
        `SELECT COUNT(*) as count FROM clinical_ops.monitoring_visits
         WHERE status = 'scheduled' AND scheduled_date <= (CURRENT_DATE + INTERVAL '30 days')
         AND study_id IN (
           SELECT id FROM clinical_ops.studies WHERE ($1::INT IS NULL OR org_id = $1)
         )`,
        [orgId],
      );

      const statusMap: Record<string, { count: number; enrolled: number; target: number }> = {};
      let totalStudies = 0;
      let totalEnrolled = 0;
      let totalTarget = 0;

      for (const row of studiesResult.rows) {
        statusMap[row.status] = {
          count: parseInt(row.count),
          enrolled: parseInt(row.enrolled || '0'),
          target: parseInt(row.target || '0'),
        };
        totalStudies += parseInt(row.count);
        totalEnrolled += parseInt(row.enrolled || '0');
        totalTarget += parseInt(row.target || '0');
      }

      const deviationsByCategory: Record<string, number> = {};
      for (const row of deviationsResult.rows) {
        deviationsByCategory[row.category] = parseInt(row.count);
      }

      res.json({
        success: true,
        data: {
          kpis: {
            totalStudies,
            activeStudies: (statusMap['recruiting']?.count || 0) + (statusMap['active']?.count || 0),
            totalEnrolled,
            totalTarget,
            enrollmentRate: totalTarget > 0 ? Math.round((totalEnrolled / totalTarget) * 100) : 0,
            openDeviations: Object.values(deviationsByCategory).reduce((a, b) => a + b, 0),
            majorDeviations: deviationsByCategory['major'] || 0,
            upcomingVisits30d: parseInt(upcomingVisits.rows[0]?.count || '0'),
          },
          studiesByStatus: statusMap,
          deviationsByCategory,
        },
      });
    } catch (error) {
      return safeError(res, error, 'CLINOPS_OVERVIEW_FAIL', 'overview');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STUDIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/clinical-operations/studies
   */
  router.get('/studies', async (req: Request, res: Response) => {
    try {
      const orgId = getOrgId(req);
      const { status, phase } = req.query;

      // Projected to the v2 studies-and-enrollment display contract
      // ({ studyId, id, phase, design, n, target, status, note }). `id` is the
      // human protocol code; n/target come from enrolled/target_enrollment.
      //
      // `studyId` is the row's real primary key, and it is here because without
      // it the org-wide clinical-ops board could address no study at all: every
      // other endpoint in this router that records something — deviations,
      // sites, monitoring visits, milestones — is study-scoped and takes this
      // uuid. A board that can only see the protocol CODE can display a study
      // and never write against it, which is exactly how "Log deviation" came to
      // mean "add a row to React state".
      let sql = `SELECT id                  AS "studyId",
                        protocol            AS id,
                        phase,
                        design,
                        enrolled            AS n,
                        target_enrollment   AS target,
                        status,
                        note
                   FROM clinical_ops.studies WHERE ($1::INT IS NULL OR org_id = $1)`;
      const params: any[] = [orgId];

      if (status) {
        params.push(status);
        sql += ` AND status = $${params.length}`;
      }
      if (phase) {
        params.push(phase);
        sql += ` AND phase = $${params.length}`;
      }

      sql += ` ORDER BY updated_at DESC`;
      const result = await pool.query(sql, params);

      res.json({ success: true, data: result.rows, total: result.rows.length });
    } catch (error) {
      return safeError(res, error, 'CLINOPS_STUDIES_FAIL', 'list studies');
    }
  });

  /**
   * POST /api/clinical-operations/studies
   */
  router.post('/studies', async (req: Request, res: Response) => {
    try {
      const parsed = studySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.issues });
      }

      const d = parsed.data;
      const orgId = getOrgId(req);

      const result = await pool.query(
        `INSERT INTO clinical_ops.studies
         (org_id, name, protocol, phase, status, indication, target_enrollment, sites, sponsor_name, therapeutic_area, start_date, estimated_end_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [orgId, d.name, d.protocol, d.phase, d.status, d.indication, d.targetEnrollment, d.sites,
         d.sponsorName || null, d.therapeuticArea || null, d.startDate || null, d.estimatedEndDate || null],
      );

      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      return safeError(res, error, 'CLINOPS_STUDY_CREATE_FAIL', 'create study');
    }
  });

  /**
   * GET /api/clinical-operations/studies/:id
   */
  router.get('/studies/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const orgId = getOrgId(req);
      const result = await pool.query(
        `SELECT * FROM clinical_ops.studies WHERE id = $1 AND ($2::INT IS NULL OR org_id = $2)`,
        [id, orgId],
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Study not found' });
      }
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      return safeError(res, error, 'CLINOPS_STUDY_GET_FAIL', 'get study');
    }
  });

  /**
   * PUT /api/clinical-operations/studies/:id
   */
  router.put('/studies/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const parsed = studySchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.issues });
      }

      const d = parsed.data;
      const setClauses: string[] = [];
      const params: any[] = [id];

      if (d.name !== undefined) { params.push(d.name); setClauses.push(`name = $${params.length}`); }
      if (d.protocol !== undefined) { params.push(d.protocol); setClauses.push(`protocol = $${params.length}`); }
      if (d.phase !== undefined) { params.push(d.phase); setClauses.push(`phase = $${params.length}`); }
      if (d.status !== undefined) { params.push(d.status); setClauses.push(`status = $${params.length}`); }
      if (d.indication !== undefined) { params.push(d.indication); setClauses.push(`indication = $${params.length}`); }
      if (d.targetEnrollment !== undefined) { params.push(d.targetEnrollment); setClauses.push(`target_enrollment = $${params.length}`); }

      if (setClauses.length === 0) {
        return res.status(400).json({ success: false, error: 'No fields to update' });
      }

      setClauses.push(`updated_at = NOW()`);
      // Add org_id guard
      const orgId = getOrgId(req);
      let whereClause = 'WHERE id = $1';
      if (orgId) {
        params.push(orgId);
        whereClause += ` AND org_id = $${params.length}`;
      }
      const result = await pool.query(
        `UPDATE clinical_ops.studies SET ${setClauses.join(', ')} ${whereClause} RETURNING *`,
        params,
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Study not found' });
      }
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      return safeError(res, error, 'CLINOPS_STUDY_UPDATE_FAIL', 'update study');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SITES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/clinical-operations/studies/:studyId/sites
   */
  router.get('/studies/:studyId/sites', async (req: Request, res: Response) => {
    try {
      const { studyId } = req.params;
      const orgId = getOrgId(req);
      // Verify studyId belongs to the user's org before returning sites
      const result = await pool.query(
        `SELECT s.* FROM clinical_ops.sites s
         INNER JOIN clinical_ops.studies st ON s.study_id = st.id
         WHERE s.study_id = $1 AND ($2::INT IS NULL OR st.org_id = $2)
         ORDER BY s.name`,
        [studyId, orgId],
      );
      res.json({ success: true, data: result.rows, total: result.rows.length });
    } catch (error) {
      return safeError(res, error, 'CLINOPS_SITES_FAIL', 'list sites');
    }
  });

  /**
   * POST /api/clinical-operations/sites
   */
  router.post('/sites', async (req: Request, res: Response) => {
    try {
      const parsed = siteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.issues });
      }

      const d = parsed.data;
      const orgId = getOrgId(req);

      const result = await pool.query(
        `INSERT INTO clinical_ops.sites
         (study_id, org_id, name, location, principal_investigator, target_enrollment, status, contact_email, irb_approval_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [d.studyId, orgId, d.name, d.location, d.principalInvestigator, d.targetEnrollment, d.status,
         d.contactEmail || null, d.irbApprovalDate || null],
      );

      // Increment site count on the study
      await pool.query(
        `UPDATE clinical_ops.studies SET sites = sites + 1, active_sites = active_sites + 1, updated_at = NOW() WHERE id = $1`,
        [d.studyId],
      );

      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      return safeError(res, error, 'CLINOPS_SITE_CREATE_FAIL', 'create site');
    }
  });

  /**
   * PUT /api/clinical-operations/sites/:id/status
   */
  router.put('/sites/:id/status', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const validStatuses = ['selected', 'initiated', 'enrolling', 'active', 'closed', 'inactive'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ success: false, error: `status must be one of: ${validStatuses.join(', ')}` });
      }

      const orgId = getOrgId(req);
      const siteParams: any[] = [id, status];
      let siteWhere = 'WHERE id = $1';
      if (orgId) {
        siteParams.push(orgId);
        siteWhere += ` AND org_id = $${siteParams.length}`;
      }
      const result = await pool.query(
        `UPDATE clinical_ops.sites SET status = $2, last_activity = NOW() ${siteWhere} RETURNING *`,
        siteParams,
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Site not found' });
      }
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      return safeError(res, error, 'CLINOPS_SITE_STATUS_FAIL', 'update site status');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ENROLLMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/clinical-operations/studies/:studyId/enrollment
   */
  router.get('/studies/:studyId/enrollment', async (req: Request, res: Response) => {
    try {
      const { studyId } = req.params;
      const result = await pool.query(
        `SELECT * FROM clinical_ops.enrollment_records
         WHERE study_id = $1
           AND study_id IN (SELECT s.id FROM clinical_ops.studies s WHERE ($2::INT IS NULL OR s.org_id = $2))
         ORDER BY period`,
        [studyId, getOrgId(req)],
      );

      // Calculate rates
      const records = result.rows;
      const totalActual = records.reduce((s: number, r: any) => s + (r.actual_count || 0), 0);
      const totalTarget = records.reduce((s: number, r: any) => s + (r.target_count || 0), 0);
      const periods = records.length || 1;

      res.json({
        success: true,
        data: records,
        summary: {
          totalActual,
          totalTarget,
          currentRate: Math.round(totalActual / periods),
          targetRate: Math.round(totalTarget / periods),
          onTrack: totalActual >= totalTarget * 0.9,
        },
      });
    } catch (error) {
      return safeError(res, error, 'CLINOPS_ENROLLMENT_FAIL', 'enrollment data');
    }
  });

  /**
   * POST /api/clinical-operations/enrollment
   */
  router.post('/enrollment', async (req: Request, res: Response) => {
    try {
      const parsed = enrollmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.issues });
      }

      const d = parsed.data;
      const result = await pool.query(
        `INSERT INTO clinical_ops.enrollment_records (study_id, site_id, period, target_count, actual_count, screen_failures)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [d.studyId, d.siteId || null, d.period, d.targetCount, d.actualCount, d.screenFailures],
      );

      // Update study enrolled count
      await pool.query(
        `UPDATE clinical_ops.studies SET enrolled = enrolled + $2, updated_at = NOW() WHERE id = $1`,
        [d.studyId, d.actualCount],
      );

      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      return safeError(res, error, 'CLINOPS_ENROLLMENT_CREATE_FAIL', 'record enrollment');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MONITORING VISITS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/clinical-operations/studies/:studyId/monitoring-visits
   */
  router.get('/studies/:studyId/monitoring-visits', async (req: Request, res: Response) => {
    try {
      const { studyId } = req.params;
      const { status } = req.query;

      let sql = `SELECT * FROM clinical_ops.monitoring_visits
        WHERE study_id = $1
          AND study_id IN (SELECT s.id FROM clinical_ops.studies s WHERE ($2::INT IS NULL OR s.org_id = $2))`;
      const params: any[] = [studyId, getOrgId(req)];

      if (status) {
        params.push(status);
        sql += ` AND status = $${params.length}`;
      }

      sql += ` ORDER BY scheduled_date`;
      const result = await pool.query(sql, params);
      res.json({ success: true, data: result.rows, total: result.rows.length });
    } catch (error) {
      return safeError(res, error, 'CLINOPS_VISITS_FAIL', 'list monitoring visits');
    }
  });

  /**
   * POST /api/clinical-operations/monitoring-visits
   */
  router.post('/monitoring-visits', async (req: Request, res: Response) => {
    try {
      const parsed = monitoringVisitSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.issues });
      }

      const d = parsed.data;
      const result = await pool.query(
        `INSERT INTO clinical_ops.monitoring_visits (study_id, site_id, visit_type, scheduled_date, monitor_name, notes)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [d.studyId, d.siteId, d.visitType, d.scheduledDate, d.monitorName, d.notes || null],
      );

      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      return safeError(res, error, 'CLINOPS_VISIT_CREATE_FAIL', 'schedule monitoring visit');
    }
  });

  /**
   * PUT /api/clinical-operations/monitoring-visits/:id/complete
   */
  router.put('/monitoring-visits/:id/complete', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { findingsCount, notes } = req.body;

      // Verify ownership via study → org chain
      const result = await pool.query(
        `UPDATE clinical_ops.monitoring_visits mv
         SET status = 'completed', completed_date = CURRENT_DATE,
             findings_count = COALESCE($2, mv.findings_count),
             notes = COALESCE($3, mv.notes)
         WHERE mv.id = $1
           AND mv.study_id IN (SELECT s.id FROM clinical_ops.studies s WHERE ($4::INT IS NULL OR s.org_id = $4))
         RETURNING *`,
        [id, findingsCount ?? null, notes ?? null, getOrgId(req)],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Monitoring visit not found' });
      }
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      return safeError(res, error, 'CLINOPS_VISIT_COMPLETE_FAIL', 'complete monitoring visit');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROTOCOL DEVIATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/clinical-operations/studies/:studyId/deviations
   */
  router.get('/studies/:studyId/deviations', async (req: Request, res: Response) => {
    try {
      const { studyId } = req.params;
      const { category, status: devStatus } = req.query;

      let sql = `SELECT * FROM clinical_ops.deviations
        WHERE study_id = $1
          AND study_id IN (SELECT s.id FROM clinical_ops.studies s WHERE ($2::INT IS NULL OR s.org_id = $2))`;
      const params: any[] = [studyId, getOrgId(req)];

      if (category) {
        params.push(category);
        sql += ` AND category = $${params.length}`;
      }
      if (devStatus) {
        params.push(devStatus);
        sql += ` AND status = $${params.length}`;
      }

      sql += ` ORDER BY detected_date DESC`;
      const result = await pool.query(sql, params);
      res.json({ success: true, data: result.rows, total: result.rows.length });
    } catch (error) {
      return safeError(res, error, 'CLINOPS_DEVIATIONS_FAIL', 'list deviations');
    }
  });

  /**
   * POST /api/clinical-operations/deviations
   */
  router.post('/deviations', async (req: Request, res: Response) => {
    try {
      const parsed = deviationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.issues });
      }

      const d = parsed.data;
      const result = await pool.query(
        `INSERT INTO clinical_ops.deviations (study_id, site_id, subject_id, category, description, detected_date, corrective_action)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [d.studyId, d.siteId || null, d.subjectId || null, d.category, d.description, d.detectedDate, d.correctiveAction || null],
      );

      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      return safeError(res, error, 'CLINOPS_DEVIATION_CREATE_FAIL', 'report deviation');
    }
  });

  /**
   * PUT /api/clinical-operations/deviations/:id/resolve
   */
  router.put('/deviations/:id/resolve', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { correctiveAction } = req.body;

      const result = await pool.query(
        `UPDATE clinical_ops.deviations d
         SET status = 'resolved', resolution_date = CURRENT_DATE,
             corrective_action = COALESCE($2, d.corrective_action)
         WHERE d.id = $1
           AND d.study_id IN (SELECT s.id FROM clinical_ops.studies s WHERE ($3::INT IS NULL OR s.org_id = $3))
         RETURNING *`,
        [id, correctiveAction ?? null, getOrgId(req)],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Deviation not found' });
      }
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      return safeError(res, error, 'CLINOPS_DEVIATION_RESOLVE_FAIL', 'resolve deviation');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MILESTONES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/clinical-operations/studies/:studyId/milestones
   */
  router.get('/studies/:studyId/milestones', async (req: Request, res: Response) => {
    try {
      const { studyId } = req.params;
      const result = await pool.query(
        `SELECT * FROM clinical_ops.milestones
         WHERE study_id = $1
           AND study_id IN (SELECT s.id FROM clinical_ops.studies s WHERE ($2::INT IS NULL OR s.org_id = $2))
         ORDER BY target_date`,
        [studyId, getOrgId(req)],
      );
      res.json({ success: true, data: result.rows, total: result.rows.length });
    } catch (error) {
      return safeError(res, error, 'CLINOPS_MILESTONES_FAIL', 'list milestones');
    }
  });

  /**
   * POST /api/clinical-operations/milestones
   */
  router.post('/milestones', async (req: Request, res: Response) => {
    try {
      const parsed = milestoneSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.issues });
      }

      const d = parsed.data;
      const result = await pool.query(
        `INSERT INTO clinical_ops.milestones (study_id, name, target_date, category)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [d.studyId, d.name, d.targetDate, d.category],
      );

      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      return safeError(res, error, 'CLINOPS_MILESTONE_CREATE_FAIL', 'create milestone');
    }
  });

  /**
   * PUT /api/clinical-operations/milestones/:id/complete
   */
  router.put('/milestones/:id/complete', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const result = await pool.query(
        `UPDATE clinical_ops.milestones m
         SET status = 'completed', actual_date = CURRENT_DATE
         WHERE m.id = $1
           AND m.study_id IN (SELECT s.id FROM clinical_ops.studies s WHERE ($2::INT IS NULL OR s.org_id = $2))
         RETURNING *`,
        [id, getOrgId(req)],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Milestone not found' });
      }
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      return safeError(res, error, 'CLINOPS_MILESTONE_COMPLETE_FAIL', 'complete milestone');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ENROLLMENT FORECAST
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/clinical-operations/studies/:studyId/enrollment-forecast
   * Simple linear forecast based on historical enrollment data
   */
  router.get('/studies/:studyId/enrollment-forecast', async (req: Request, res: Response) => {
    try {
      const { studyId } = req.params;

      const orgId = getOrgId(req);
      const [studyResult, enrollmentResult] = await Promise.all([
        pool.query(
          `SELECT target_enrollment, enrolled, start_date FROM clinical_ops.studies
           WHERE id = $1 AND ($2::INT IS NULL OR org_id = $2)`,
          [studyId, orgId],
        ),
        pool.query(
          `SELECT period, actual_count FROM clinical_ops.enrollment_records
           WHERE study_id = $1
             AND study_id IN (SELECT s.id FROM clinical_ops.studies s WHERE ($2::INT IS NULL OR s.org_id = $2))
           ORDER BY period`,
          [studyId, orgId],
        ),
      ]);

      if (studyResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Study not found' });
      }

      const study = studyResult.rows[0];
      const records = enrollmentResult.rows;
      const remaining = study.target_enrollment - study.enrolled;

      if (records.length === 0) {
        return res.json({
          success: true,
          data: {
            currentEnrolled: study.enrolled,
            targetEnrollment: study.target_enrollment,
            remaining,
            averageMonthlyRate: 0,
            estimatedCompletionMonths: null,
            confidence: 'insufficient_data',
          },
        });
      }

      const totalActual = records.reduce((s: number, r: any) => s + r.actual_count, 0);
      const avgRate = totalActual / records.length;
      const monthsToComplete = avgRate > 0 ? Math.ceil(remaining / avgRate) : null;

      res.json({
        success: true,
        data: {
          currentEnrolled: study.enrolled,
          targetEnrollment: study.target_enrollment,
          remaining,
          averageMonthlyRate: Math.round(avgRate * 10) / 10,
          estimatedCompletionMonths: monthsToComplete,
          confidence: records.length >= 6 ? 'high' : records.length >= 3 ? 'moderate' : 'low',
          historicalPeriods: records.length,
        },
      });
    } catch (error) {
      return safeError(res, error, 'CLINOPS_FORECAST_FAIL', 'enrollment forecast');
    }
  });

  return router;
}
