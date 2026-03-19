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

  function getOrgId(req: Request): string | null {
    return (
      (req as any).tenantId ||
      (req as any).tenantContext?.organizationId ||
      null
    );
  }

  function safeError(res: Response, error: any, code: string, label: string): Response {
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

  // Auto-create schema + tables when first accessed
  async function ensureTables(): Promise<void> {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS clinical_ops`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clinical_ops.studies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id TEXT,
        name TEXT NOT NULL,
        protocol TEXT NOT NULL,
        phase TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'planning',
        indication TEXT NOT NULL,
        target_enrollment INT NOT NULL,
        enrolled INT DEFAULT 0,
        sites INT DEFAULT 0,
        active_sites INT DEFAULT 0,
        sponsor_name TEXT,
        therapeutic_area TEXT,
        start_date DATE,
        estimated_end_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clinical_ops.sites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        study_id UUID NOT NULL,
        org_id TEXT,
        name TEXT NOT NULL,
        location TEXT NOT NULL,
        principal_investigator TEXT NOT NULL,
        target_enrollment INT NOT NULL,
        enrolled INT DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'selected',
        contact_email TEXT,
        irb_approval_date DATE,
        last_activity TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clinical_ops.enrollment_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        study_id UUID NOT NULL,
        site_id UUID,
        period TEXT NOT NULL,
        target_count INT NOT NULL,
        actual_count INT NOT NULL,
        screen_failures INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clinical_ops.monitoring_visits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        study_id UUID NOT NULL,
        site_id UUID NOT NULL,
        visit_type TEXT NOT NULL,
        scheduled_date DATE NOT NULL,
        completed_date DATE,
        monitor_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'scheduled',
        findings_count INT DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clinical_ops.deviations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        study_id UUID NOT NULL,
        site_id UUID,
        subject_id TEXT,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        detected_date DATE NOT NULL,
        resolution_date DATE,
        corrective_action TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clinical_ops.milestones (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        study_id UUID NOT NULL,
        name TEXT NOT NULL,
        target_date DATE NOT NULL,
        actual_date DATE,
        category TEXT NOT NULL DEFAULT 'operational',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
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
      await ensureTables();
      const orgId = getOrgId(_req);

      const studiesResult = await pool.query(
        `SELECT status, COUNT(*) as count, SUM(enrolled) as enrolled, SUM(target_enrollment) as target
         FROM clinical_ops.studies WHERE ($1::TEXT IS NULL OR org_id = $1)
         GROUP BY status`,
        [orgId],
      );

      const deviationsResult = await pool.query(
        `SELECT category, COUNT(*) as count FROM clinical_ops.deviations
         WHERE status = 'open' AND study_id IN (
           SELECT id FROM clinical_ops.studies WHERE ($1::TEXT IS NULL OR org_id = $1)
         ) GROUP BY category`,
        [orgId],
      );

      const upcomingVisits = await pool.query(
        `SELECT COUNT(*) as count FROM clinical_ops.monitoring_visits
         WHERE status = 'scheduled' AND scheduled_date <= (CURRENT_DATE + INTERVAL '30 days')
         AND study_id IN (
           SELECT id FROM clinical_ops.studies WHERE ($1::TEXT IS NULL OR org_id = $1)
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
      await ensureTables();
      const orgId = getOrgId(req);
      const { status, phase } = req.query;

      let sql = `SELECT * FROM clinical_ops.studies WHERE ($1::TEXT IS NULL OR org_id = $1)`;
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
      await ensureTables();
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
      await ensureTables();
      const { id } = req.params;
      const result = await pool.query(`SELECT * FROM clinical_ops.studies WHERE id = $1`, [id]);
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
      await ensureTables();
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
      const result = await pool.query(
        `UPDATE clinical_ops.studies SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
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
      await ensureTables();
      const { studyId } = req.params;
      const result = await pool.query(
        `SELECT * FROM clinical_ops.sites WHERE study_id = $1 ORDER BY name`,
        [studyId],
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
      await ensureTables();
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
      await ensureTables();
      const { id } = req.params;
      const { status } = req.body;

      const validStatuses = ['selected', 'initiated', 'enrolling', 'active', 'closed', 'inactive'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ success: false, error: `status must be one of: ${validStatuses.join(', ')}` });
      }

      const result = await pool.query(
        `UPDATE clinical_ops.sites SET status = $2, last_activity = NOW() WHERE id = $1 RETURNING *`,
        [id, status],
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
      await ensureTables();
      const { studyId } = req.params;
      const result = await pool.query(
        `SELECT * FROM clinical_ops.enrollment_records WHERE study_id = $1 ORDER BY period`,
        [studyId],
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
      await ensureTables();
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
      await ensureTables();
      const { studyId } = req.params;
      const { status } = req.query;

      let sql = `SELECT * FROM clinical_ops.monitoring_visits WHERE study_id = $1`;
      const params: any[] = [studyId];

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
      await ensureTables();
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
      await ensureTables();
      const { id } = req.params;
      const { findingsCount, notes } = req.body;

      const result = await pool.query(
        `UPDATE clinical_ops.monitoring_visits
         SET status = 'completed', completed_date = CURRENT_DATE,
             findings_count = COALESCE($2, findings_count),
             notes = COALESCE($3, notes)
         WHERE id = $1 RETURNING *`,
        [id, findingsCount ?? null, notes ?? null],
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
      await ensureTables();
      const { studyId } = req.params;
      const { category, status: devStatus } = req.query;

      let sql = `SELECT * FROM clinical_ops.deviations WHERE study_id = $1`;
      const params: any[] = [studyId];

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
      await ensureTables();
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
      await ensureTables();
      const { id } = req.params;
      const { correctiveAction } = req.body;

      const result = await pool.query(
        `UPDATE clinical_ops.deviations
         SET status = 'resolved', resolution_date = CURRENT_DATE,
             corrective_action = COALESCE($2, corrective_action)
         WHERE id = $1 RETURNING *`,
        [id, correctiveAction ?? null],
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
      await ensureTables();
      const { studyId } = req.params;
      const result = await pool.query(
        `SELECT * FROM clinical_ops.milestones WHERE study_id = $1 ORDER BY target_date`,
        [studyId],
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
      await ensureTables();
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
      await ensureTables();
      const { id } = req.params;

      const result = await pool.query(
        `UPDATE clinical_ops.milestones SET status = 'completed', actual_date = CURRENT_DATE WHERE id = $1 RETURNING *`,
        [id],
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
      await ensureTables();
      const { studyId } = req.params;

      const [studyResult, enrollmentResult] = await Promise.all([
        pool.query(`SELECT target_enrollment, enrolled, start_date FROM clinical_ops.studies WHERE id = $1`, [studyId]),
        pool.query(`SELECT period, actual_count FROM clinical_ops.enrollment_records WHERE study_id = $1 ORDER BY period`, [studyId]),
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
