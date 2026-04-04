/**
 * csr-analytics.ts
 *
 * Extracted from server/index.ts — CSR real-data analytics endpoints.
 * Database-backed queries against csr_reports table.
 *
 * Routes:
 *   GET /api/csr-real-data/all    — paginated list of CSR reports
 *   GET /api/csr-real-data/stats  — dashboard metrics (phases, indications, sponsors)
 */

import { Router, type Request, type Response } from 'express';
import { getPool } from '../db';

const router = Router();
const pool = getPool();

const debugLog = (message: string, data?: any) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[CSR-Analytics] ${message}`, data ? JSON.stringify(data).slice(0, 200) : '');
  }
};

/** GET /api/csr-real-data/all — paginated CSR report listing */
router.get('/all', async (req: Request, res: Response) => {
  try {
    const { limit = 10 } = req.query;
    debugLog('CSR real data all endpoint called', { limit });

    const limitNum = Math.min(Math.max(parseInt(limit as string, 10) || 10, 1), 100);

    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM csr_reports WHERE deleted_at IS NULL'
    );
    const total = countResult.rows[0]?.total ?? 0;

    const dataResult = await pool.query(
      `SELECT id, report_id AS "reportId", report_title AS title, indication, phase,
              sponsor, sample_size, duration_weeks, status, study_id AS "studyId",
              upload_date AS "uploadDate"
       FROM csr_reports WHERE deleted_at IS NULL
       ORDER BY upload_date DESC NULLS LAST
       LIMIT $1`,
      [limitNum]
    );

    debugLog('CSR real data all response', { count: dataResult.rows.length, total });
    res.json({
      success: true,
      data: dataResult.rows,
      count: dataResult.rows.length,
      total,
      source: 'database',
    });
  } catch (error) {
    console.error('Error in CSR real data all:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch CSR data',
    });
  }
});

/** GET /api/csr-real-data/stats — CSR dashboard metrics */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    debugLog('CSR real data stats endpoint called');

    const totalResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM csr_reports WHERE deleted_at IS NULL'
    );
    const totalReports = totalResult.rows[0]?.total ?? 0;

    const processedResult = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM csr_reports WHERE deleted_at IS NULL AND status IN ('approved', 'submitted')"
    );
    const processedReports = processedResult.rows[0]?.cnt ?? 0;

    const indicationCountResult = await pool.query(
      'SELECT COUNT(DISTINCT indication)::int AS cnt FROM csr_reports WHERE deleted_at IS NULL AND indication IS NOT NULL'
    );
    const uniqueIndications = indicationCountResult.rows[0]?.cnt ?? 0;

    const sponsorCountResult = await pool.query(
      'SELECT COUNT(DISTINCT sponsor)::int AS cnt FROM csr_reports WHERE deleted_at IS NULL AND sponsor IS NOT NULL'
    );
    const uniqueSponsors = sponsorCountResult.rows[0]?.cnt ?? 0;

    const phasesResult = await pool.query(
      'SELECT DISTINCT phase FROM csr_reports WHERE deleted_at IS NULL AND phase IS NOT NULL ORDER BY phase'
    );
    const phases = phasesResult.rows.map((r: any) => r.phase);

    // Top indications
    const topIndicationsResult = await pool.query(
      `SELECT indication AS name, COUNT(*)::int AS count,
              (SELECT phase FROM csr_reports cr2 WHERE cr2.indication = cr.indication AND cr2.deleted_at IS NULL AND cr2.phase IS NOT NULL GROUP BY phase ORDER BY COUNT(*) DESC LIMIT 1) AS phase
       FROM csr_reports cr WHERE deleted_at IS NULL AND indication IS NOT NULL
       GROUP BY indication ORDER BY count DESC LIMIT 5`
    );

    // Phase distribution
    const phaseDistResult = await pool.query(
      `SELECT COALESCE(phase, 'Unknown') AS phase, COUNT(*)::int AS count
       FROM csr_reports WHERE deleted_at IS NULL AND phase IS NOT NULL
       GROUP BY phase ORDER BY count DESC`
    );
    const phaseDistribution = phaseDistResult.rows.map((r: any) => ({
      phase: r.phase,
      count: r.count,
      percentage: totalReports > 0 ? Math.round((r.count / totalReports) * 100) : 0,
    }));

    // Therapeutic areas (by indication)
    const taResult = await pool.query(
      `SELECT COALESCE(indication, 'Unknown') AS area, COUNT(*)::int AS count
       FROM csr_reports WHERE deleted_at IS NULL AND indication IS NOT NULL
       GROUP BY indication ORDER BY count DESC LIMIT 10`
    );
    const therapeuticAreas = taResult.rows.map((r: any) => ({
      area: r.area,
      count: r.count,
      percentage: totalReports > 0 ? Math.round((r.count / totalReports) * 100) : 0,
    }));

    const statsData = {
      success: true,
      data: {
        overview: {
          total_reports: totalReports,
          processed_reports: processedReports,
          unique_indications: uniqueIndications,
          unique_sponsors: uniqueSponsors,
          phases,
        },
        topIndications: topIndicationsResult.rows,
        phaseDistribution,
        therapeuticAreas,
      },
      source: 'database',
      lastUpdated: new Date().toISOString(),
    };

    debugLog('CSR stats response generated', statsData);
    res.json(statsData);
  } catch (error) {
    console.error('Error getting CSR stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve CSR statistics',
    });
  }
});

export default router;
