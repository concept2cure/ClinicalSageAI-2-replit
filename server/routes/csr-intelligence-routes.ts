import { Router } from 'express';
import type { Request, Response } from 'express';
import type { Pool } from 'pg';

export function createCsrIntelligenceRoutes(pool: Pool, csrSearchService: any): Router {
  const router = Router();

  // CSR search endpoint
  router.get('/csr/search', async (req: Request, res: Response) => {
    try {
      const { query, limit = 10 } = req.query;

      const queryText = typeof query === 'string' ? query.trim() : '';
      const limitNum = Math.max(1, Math.min(100, parseInt(String(limit), 10) || 10));
      const searchResult = await csrSearchService.searchCSRs({
        query_text: queryText,
        limit: limitNum,
      });
      const results = (searchResult.csrs || []).map((csr: any) => ({
        id: csr.id || csr.csr_id || null,
        title: csr.title || 'Untitled CSR',
        indication: csr.indication || null,
        phase: csr.phase || null,
        sponsor: csr.sponsor || null,
        sample_size: csr.sample_size ?? null,
        outcome: csr.outcome || null,
        relevance:
          typeof csr.relevance_score === 'number'
            ? csr.relevance_score
            : typeof csr.similarity === 'number'
            ? csr.similarity
            : null,
        summary: csr.summary || csr.context_summary || null,
        source: 'csr_search_service',
      }));

      res.json({
        success: true,
        results: results,
        total: results.length,
        query: query || '',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error in CSR search:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to search CSR data',
      });
    }
  });

  // CSR Intelligence base endpoint
  router.get('/csr-intelligence', (req: Request, res: Response) => {
    res.json({ message: 'CSR Intelligence API available', timestamp: new Date() });
  });

  // CSR Intelligence analytics endpoint - real database queries
  router.get('/csr-intelligence/analytics', async (req: Request, res: Response) => {
    try {
      const { type = 'dashboard' } = req.query;

      // Query real counts from csr_reports table
      const totalResult = await pool.query(
        'SELECT COUNT(*)::int AS total FROM csr_reports WHERE deleted_at IS NULL'
      );
      const totalCSRs = totalResult.rows[0]?.total ?? 0;

      const todayResult = await pool.query(
        'SELECT COUNT(*)::int AS cnt FROM csr_reports WHERE deleted_at IS NULL AND upload_date >= CURRENT_DATE'
      );
      const processedToday = todayResult.rows[0]?.cnt ?? 0;

      // Therapeutic area breakdown from real data
      const taResult = await pool.query(
        `SELECT COALESCE(indication, 'Unknown') AS area, COUNT(*)::int AS count
         FROM csr_reports WHERE deleted_at IS NULL AND indication IS NOT NULL
         GROUP BY indication ORDER BY count DESC LIMIT 10`
      );
      const therapeuticAreas: Record<string, { count: number }> = {};
      for (const row of taResult.rows) {
        therapeuticAreas[row.area] = { count: row.count };
      }

      // Phase breakdown
      const phaseResult = await pool.query(
        `SELECT COALESCE(phase, 'Unknown') AS phase, COUNT(*)::int AS count
         FROM csr_reports WHERE deleted_at IS NULL AND phase IS NOT NULL
         GROUP BY phase ORDER BY count DESC`
      );
      const phaseBreakdown = phaseResult.rows.map((r: any) => ({
        phase: r.phase,
        count: r.count,
        percentage: totalCSRs > 0 ? Math.round((r.count / totalCSRs) * 1000) / 10 : 0,
      }));

      const analyticsData = {
        success: true,
        data: {
          dashboard: {
            totalCSRs,
            processedToday,
            avgProcessingTime: 0,
            successRate: 0,
            criticalInsights: 0,
            activeAnalyses: 0,
          },
          temporalTrends: {},
          therapeuticAreas,
          biomarkerAnalysis: {},
          qualityMetrics: {
            dataCompleteness: 0,
            dataConsistency: 0,
            dataAccuracy: 0,
            processingEfficiency: 0,
          },
          phaseBreakdown,
        },
        source: 'database',
        timestamp: new Date().toISOString(),
      };

      res.json(analyticsData);
    } catch (error) {
      console.error('Error getting CSR intelligence analytics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve CSR intelligence analytics',
      });
    }
  });

  // CSR Intelligence stats endpoint - real database queries
  router.get('/csr-intelligence/stats', async (req: Request, res: Response) => {
    try {
      const totalResult = await pool.query(
        'SELECT COUNT(*)::int AS total FROM csr_reports WHERE deleted_at IS NULL'
      );
      const csrCount = totalResult.rows[0]?.total ?? 0;

      const taCountResult = await pool.query(
        'SELECT COUNT(DISTINCT indication)::int AS cnt FROM csr_reports WHERE deleted_at IS NULL AND indication IS NOT NULL'
      );
      const therapeuticAreaCount = taCountResult.rows[0]?.cnt ?? 0;

      const sponsorCountResult = await pool.query(
        'SELECT COUNT(DISTINCT sponsor)::int AS cnt FROM csr_reports WHERE deleted_at IS NULL AND sponsor IS NOT NULL'
      );
      const uniqueSponsors = sponsorCountResult.rows[0]?.cnt ?? 0;

      // Phase breakdown from real data
      const phaseResult = await pool.query(
        `SELECT COALESCE(phase, 'Unknown') AS phase, COUNT(*)::int AS count
         FROM csr_reports WHERE deleted_at IS NULL AND phase IS NOT NULL
         GROUP BY phase ORDER BY count DESC`
      );
      const phaseBreakdown = phaseResult.rows.map((r: any) => ({
        phase: r.phase,
        count: r.count,
        percentage: csrCount > 0 ? Math.round((r.count / csrCount) * 1000) / 10 : 0,
      }));

      // Therapeutic area breakdown from real data
      const taResult = await pool.query(
        `SELECT COALESCE(indication, 'Unknown') AS area, COUNT(*)::int AS count
         FROM csr_reports WHERE deleted_at IS NULL AND indication IS NOT NULL
         GROUP BY indication ORDER BY count DESC LIMIT 10`
      );
      const therapeuticAreas = taResult.rows.map((r: any) => ({
        area: r.area,
        count: r.count,
        percentage: csrCount > 0 ? Math.round((r.count / csrCount) * 1000) / 10 : 0,
      }));

      const completedResult = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM csr_reports WHERE deleted_at IS NULL AND status = 'approved'"
      );
      const completedReviews = completedResult.rows[0]?.cnt ?? 0;

      const statsData = {
        success: true,
        data: {
          overview: {
            csrCount,
            therapeuticAreas: therapeuticAreaCount,
            protocolsOptimized: 0,
            benchmarks: 0,
            aiModels: 0,
            totalStudies: csrCount,
            activeAnalyses: 0,
            completedReviews,
            uniqueSponsors,
          },
          analytics: {
            successRate: 0,
            avgProcessingTime: 0,
            dataQuality: 0,
            automationLevel: 0,
          },
          distribution: {
            phaseBreakdown,
            therapeuticAreas,
          },
          quality: {
            completeness: 0,
            consistency: 0,
            accuracy: 0,
            timeliness: 0,
          },
          performance: {
            avgAnalysisTime: '0 minutes',
            processingEfficiency: 0,
            errorRate: 0,
            uptime: 0,
          },
        },
        source: 'database',
        timestamp: new Date().toISOString(),
      };

      res.json(statsData);
    } catch (error) {
      console.error('Error getting CSR intelligence stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve CSR intelligence statistics',
      });
    }
  });

  // CSR Intelligence factual insights endpoint - real database queries
  router.get('/csr-intelligence/factual-insights', async (req: Request, res: Response) => {
    try {
      // Aggregate real insights from csr_reports
      const avgSampleResult = await pool.query(
        'SELECT AVG(sample_size)::int AS avg_sample, AVG(duration_weeks)::int AS avg_duration FROM csr_reports WHERE deleted_at IS NULL AND sample_size IS NOT NULL'
      );
      const avgSample = avgSampleResult.rows[0]?.avg_sample ?? 0;
      const avgDurationWeeks = avgSampleResult.rows[0]?.avg_duration ?? 0;

      // Top indications by count
      const topIndicationsResult = await pool.query(
        `SELECT COALESCE(indication, 'Unknown') AS area, COUNT(*)::int AS studies, AVG(sample_size)::int AS avg_sample
         FROM csr_reports WHERE deleted_at IS NULL AND indication IS NOT NULL
         GROUP BY indication ORDER BY studies DESC LIMIT 5`
      );
      const indicationInsights: Record<string, { studies: number; avgSampleSize: number }> = {};
      for (const row of topIndicationsResult.rows) {
        indicationInsights[row.area] = { studies: row.studies, avgSampleSize: row.avg_sample ?? 0 };
      }

      // Most common phase
      const topPhaseResult = await pool.query(
        `SELECT phase, COUNT(*)::int AS cnt FROM csr_reports WHERE deleted_at IS NULL AND phase IS NOT NULL
         GROUP BY phase ORDER BY cnt DESC LIMIT 1`
      );
      const mostCommonPhase = topPhaseResult.rows[0]?.phase ?? 'N/A';

      const factualInsights = {
        studyDesignPatterns: {
          mostCommonPhase,
          averageSampleSize: avgSample,
          averageStudyDurationWeeks: avgDurationWeeks,
        },
        therapeuticAreaInsights: indicationInsights,
        riskFactors: {
          lowSuccessRateIndicators: [],
          commonAEPatterns: [],
          enrollmentChallenges: [],
          regulatoryRisks: [],
        },
        dataQualityAssessment: {
          completenessScore: 0,
          consistencyScore: 0,
          accuracyScore: 0,
          dataSource: 'csr_reports_table',
          lastVerified: new Date().toISOString(),
        },
      };

      res.json({
        success: true,
        data: factualInsights,
        source: 'database',
      });
    } catch (error) {
      console.error('Error getting factual insights:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve factual insights',
      });
    }
  });

  return router;
}

export default createCsrIntelligenceRoutes;
