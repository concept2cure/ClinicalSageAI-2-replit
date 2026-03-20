/**
 * IND KPI Routes — Database-backed KPI event recording and aggregation
 *
 * Replaces the in-memory kpiEvents[] array from ind-templates.ts with
 * persistent PostgreSQL storage, time-windowed aggregation, and derived metrics.
 *
 * @version 1.0.0
 * @module server/routes/ind-kpi.routes
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

/** Accepted event types (mirrors the legacy KpiEventName union). */
const SUPPORTED_EVENT_TYPES = new Set([
  'upload_started',
  'draft_generated',
  'section_accepted',
  'section_rewritten',
  'export_triggered',
]);

/**
 * Factory — returns a Router that uses the supplied pg Pool for all queries.
 */
export default function createINDKpiRoutes(pool: Pool): Router {
  const router = Router();

  // ---------------------------------------------------------------------------
  // Migration middleware — ensure table + indexes exist on first request
  // ---------------------------------------------------------------------------
  let migrated = false;

  router.use(async (_req, _res, next) => {
    if (migrated) return next();
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ind_kpi_events (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL,
          event_type VARCHAR(100) NOT NULL,
          submission_id VARCHAR(255),
          project_id VARCHAR(255),
          metadata JSONB DEFAULT '{}',
          user_id VARCHAR(255),
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_ind_kpi_events_org_type
        ON ind_kpi_events(organization_id, event_type)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_ind_kpi_events_created
        ON ind_kpi_events(created_at)
      `);
      migrated = true;
    } catch (_err) {
      // Don't block requests on migration failure — table may already exist
    }
    next();
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function getOrgId(req: Request): number {
    const tenantCtx = (req as any).tenantContext;
    if (tenantCtx?.organizationId) {
      const parsed = parseInt(tenantCtx.organizationId, 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    const header = req.headers['x-organization-id'];
    if (header) {
      const parsed = parseInt(header as string, 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return 1; // default org
  }

  function getUserId(req: Request): string | null {
    return (req.headers['x-user-id'] as string) || null;
  }

  function clampWindowDays(raw: unknown): number {
    const parsed = parseInt(String(raw || '7'), 10);
    if (!Number.isFinite(parsed)) return 7;
    return Math.min(Math.max(parsed, 1), 90);
  }

  function safePercent(numerator: number, denominator: number): number {
    if (!denominator || denominator <= 0) return 0;
    return Math.round((numerator / denominator) * 1000) / 10;
  }

  function sanitizeMetadata(payload: unknown): Record<string, any> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
    const entries = Object.entries(payload as Record<string, unknown>).slice(0, 25);
    const safe: Record<string, any> = {};
    for (const [key, value] of entries) {
      const safeKey = String(key).slice(0, 60);
      if (value === null || value === undefined) {
        safe[safeKey] = null;
      } else if (typeof value === 'string') {
        safe[safeKey] = value.slice(0, 500);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        safe[safeKey] = value;
      } else {
        safe[safeKey] = String(value).slice(0, 500);
      }
    }
    return safe;
  }

  // ---------------------------------------------------------------------------
  // POST /record-event — persist a KPI event
  // ---------------------------------------------------------------------------

  router.post('/record-event', async (req: Request, res: Response) => {
    try {
      const orgId = getOrgId(req);
      const userId = getUserId(req);

      const eventType = String(req.body?.eventType || req.body?.eventName || '').trim();
      if (!SUPPORTED_EVENT_TYPES.has(eventType)) {
        return res.status(400).json({
          error: `Unsupported eventType. Must be one of: ${[...SUPPORTED_EVENT_TYPES].join(', ')}`,
        });
      }

      const submissionId = req.body?.submissionId ? String(req.body.submissionId).slice(0, 255) : null;
      const projectId = req.body?.projectId ? String(req.body.projectId).slice(0, 255) : null;
      const metadata = sanitizeMetadata(req.body?.metadata || req.body?.payload);

      const result = await pool.query(
        `INSERT INTO ind_kpi_events (organization_id, event_type, submission_id, project_id, metadata, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, organization_id, event_type, submission_id, project_id, metadata, user_id, created_at`,
        [orgId, eventType, submissionId, projectId, JSON.stringify(metadata), userId]
      );

      return res.status(201).json({ success: true, event: result.rows[0] });
    } catch (error: any) {
      console.error('KPI record-event error:', error);
      return res.status(500).json({ error: 'Failed to record KPI event' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /aggregate — time-windowed aggregation with trends & derived metrics
  // ---------------------------------------------------------------------------

  router.get('/aggregate', async (req: Request, res: Response) => {
    try {
      const orgId = getOrgId(req);
      const windowDays = clampWindowDays(req.query.windowDays);

      // 1. Event counts within the window
      const countsResult = await pool.query(
        `SELECT event_type, COUNT(*)::int AS cnt
         FROM ind_kpi_events
         WHERE organization_id = $1
           AND created_at >= NOW() - ($2 || ' days')::INTERVAL
         GROUP BY event_type`,
        [orgId, String(windowDays)]
      );

      const eventCounts: Record<string, number> = {};
      let totalEvents = 0;
      for (const row of countsResult.rows) {
        eventCounts[row.event_type] = row.cnt;
        totalEvents += row.cnt;
      }

      // 2. Total submissions (from ind_submissions table if it exists)
      let totalSubmissions = 0;
      try {
        const subResult = await pool.query(
          `SELECT COUNT(*)::int AS cnt FROM ind_submissions WHERE organization_id = $1`,
          [orgId]
        );
        totalSubmissions = subResult.rows[0]?.cnt || 0;
      } catch (_e) {
        // Table may not exist yet — fall back to 0
      }

      // 3. Daily trend data grouped by day
      const trendsResult = await pool.query(
        `SELECT
           DATE(created_at AT TIME ZONE 'UTC') AS day,
           event_type,
           COUNT(*)::int AS cnt
         FROM ind_kpi_events
         WHERE organization_id = $1
           AND created_at >= NOW() - ($2 || ' days')::INTERVAL
         GROUP BY day, event_type
         ORDER BY day`,
        [orgId, String(windowDays)]
      );

      // Build a map of day -> { event_type: count }
      const dayMap: Record<string, Record<string, number>> = {};
      for (const row of trendsResult.rows) {
        const dayStr = new Date(row.day).toISOString().slice(0, 10);
        if (!dayMap[dayStr]) dayMap[dayStr] = {};
        dayMap[dayStr][row.event_type] = row.cnt;
      }

      // Fill in missing days to produce a continuous series
      const trends: Array<{
        date: string;
        uploadStarted: number;
        draftGenerated: number;
        sectionAccepted: number;
        sectionRewritten: number;
        exportTriggered: number;
      }> = [];

      for (let i = windowDays - 1; i >= 0; i--) {
        const d = new Date();
        d.setUTCHours(0, 0, 0, 0);
        d.setUTCDate(d.getUTCDate() - i);
        const dayStr = d.toISOString().slice(0, 10);
        const dayCounts = dayMap[dayStr] || {};
        trends.push({
          date: dayStr,
          uploadStarted: dayCounts['upload_started'] || 0,
          draftGenerated: dayCounts['draft_generated'] || 0,
          sectionAccepted: dayCounts['section_accepted'] || 0,
          sectionRewritten: dayCounts['section_rewritten'] || 0,
          exportTriggered: dayCounts['export_triggered'] || 0,
        });
      }

      // 4. Derived metrics
      const accepted = eventCounts['section_accepted'] || 0;
      const rewritten = eventCounts['section_rewritten'] || 0;
      const draftGenerated = eventCounts['draft_generated'] || 0;
      const exportTriggered = eventCounts['export_triggered'] || 0;

      const derived = {
        acceptanceRatio: safePercent(accepted, accepted + rewritten),
        draftToExportConversion: safePercent(exportTriggered, draftGenerated),
      };

      // 5. Previous-window comparison for deltas
      const prevCountsResult = await pool.query(
        `SELECT event_type, COUNT(*)::int AS cnt
         FROM ind_kpi_events
         WHERE organization_id = $1
           AND created_at >= NOW() - ($2 || ' days')::INTERVAL
           AND created_at < NOW() - ($3 || ' days')::INTERVAL
         GROUP BY event_type`,
        [orgId, String(windowDays * 2), String(windowDays)]
      );

      const prevCounts: Record<string, number> = {};
      for (const row of prevCountsResult.rows) {
        prevCounts[row.event_type] = row.cnt;
      }

      const prevAccepted = prevCounts['section_accepted'] || 0;
      const prevRewritten = prevCounts['section_rewritten'] || 0;
      const prevDraftGenerated = prevCounts['draft_generated'] || 0;
      const prevExportTriggered = prevCounts['export_triggered'] || 0;

      const prevAcceptanceRatio = safePercent(prevAccepted, prevAccepted + prevRewritten);
      const prevDraftToExport = safePercent(prevExportTriggered, prevDraftGenerated);

      const deltas = {
        acceptanceRatioDelta: Math.round((derived.acceptanceRatio - prevAcceptanceRatio) * 10) / 10,
        draftToExportConversionDelta:
          Math.round((derived.draftToExportConversion - prevDraftToExport) * 10) / 10,
      };

      return res.json({
        organizationId: orgId,
        windowDays,
        totalSubmissions,
        totalEvents,
        eventCounts,
        trends,
        derived,
        deltas,
      });
    } catch (error: any) {
      console.error('KPI aggregate error:', error);
      return res.status(500).json({ error: 'Failed to aggregate KPI data' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /success-rate — submission success rate from ind_submissions
  // ---------------------------------------------------------------------------

  router.get('/success-rate', async (req: Request, res: Response) => {
    try {
      const orgId = getOrgId(req);
      const windowDays = clampWindowDays(req.query.windowDays);

      // Count total and completed/submitted from ind_submissions
      let total = 0;
      let submitted = 0;
      let inProgress = 0;
      let draft = 0;

      try {
        const result = await pool.query(
          `SELECT
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE ind_wizard_status = 'completed')::int AS submitted,
             COUNT(*) FILTER (WHERE ind_wizard_status = 'in-progress')::int AS in_progress,
             COUNT(*) FILTER (WHERE ind_wizard_status = 'draft')::int AS draft
           FROM ind_submissions
           WHERE organization_id = $1
             AND created_at >= NOW() - ($2 || ' days')::INTERVAL`,
          [orgId, String(windowDays)]
        );

        total = result.rows[0]?.total || 0;
        submitted = result.rows[0]?.submitted || 0;
        inProgress = result.rows[0]?.in_progress || 0;
        draft = result.rows[0]?.draft || 0;
      } catch (_e) {
        // Table may not exist — fall back to event-based estimation
        try {
          const eventResult = await pool.query(
            `SELECT
               COUNT(*) FILTER (WHERE event_type = 'draft_generated')::int AS drafts,
               COUNT(*) FILTER (WHERE event_type = 'export_triggered')::int AS exports
             FROM ind_kpi_events
             WHERE organization_id = $1
               AND created_at >= NOW() - ($2 || ' days')::INTERVAL`,
            [orgId, String(windowDays)]
          );
          total = eventResult.rows[0]?.drafts || 0;
          submitted = eventResult.rows[0]?.exports || 0;
        } catch (_e2) {
          // both failed
        }
      }

      const successRate = safePercent(submitted, total);

      return res.json({
        organizationId: orgId,
        windowDays,
        total,
        submitted,
        inProgress,
        draft,
        successRate,
      });
    } catch (error: any) {
      console.error('KPI success-rate error:', error);
      return res.status(500).json({ error: 'Failed to calculate success rate' });
    }
  });

  return router;
}
