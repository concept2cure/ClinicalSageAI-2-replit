import { Router } from 'express';
import type { Request, Response } from 'express';
import type { Pool } from 'pg';

const ANALYTICS_CACHE_TTL_MS = 30_000;
const MAX_ANALYTICS_CACHE_ENTRIES = 500;

interface CacheEntry {
  expiresAt: number;
  payload: unknown;
}

const analyticsCache = new Map<string, CacheEntry>();

function getCachedPayload(cacheKey: string): unknown | null {
  const cached = analyticsCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    analyticsCache.delete(cacheKey);
    return null;
  }
  return cached.payload;
}

function setCachedPayload(cacheKey: string, payload: unknown): void {
  while (analyticsCache.size >= MAX_ANALYTICS_CACHE_ENTRIES) {
    const oldestKey = analyticsCache.keys().next().value;
    if (!oldestKey) break;
    analyticsCache.delete(oldestKey);
  }
  analyticsCache.set(cacheKey, {
    expiresAt: Date.now() + ANALYTICS_CACHE_TTL_MS,
    payload,
  });
}

function toSafeInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toPercentage(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

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
      const { type = 'dashboard', refresh = 'false' } = req.query;
      const cacheKey = `analytics:${String(type)}`;
      const bypassCache = String(refresh).toLowerCase() === 'true';

      if (!bypassCache) {
        const cached = getCachedPayload(cacheKey);
        if (cached) {
          res.setHeader('X-Cache', 'HIT');
          return res.json(cached);
        }
      }

      const [overviewResult, taResult, phaseResult] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE upload_date >= CURRENT_DATE)::int AS processed_today
           FROM csr_reports
           WHERE deleted_at IS NULL`
        ),
        pool.query(
          `SELECT COALESCE(indication, 'Unknown') AS area, COUNT(*)::int AS count
           FROM csr_reports WHERE deleted_at IS NULL AND indication IS NOT NULL
           GROUP BY indication ORDER BY count DESC LIMIT 10`
        ),
        pool.query(
          `SELECT COALESCE(phase, 'Unknown') AS phase, COUNT(*)::int AS count
           FROM csr_reports WHERE deleted_at IS NULL AND phase IS NOT NULL
           GROUP BY phase ORDER BY count DESC`
        ),
      ]);

      const totalCSRs = toSafeInt(overviewResult.rows[0]?.total);
      const processedToday = toSafeInt(overviewResult.rows[0]?.processed_today);

      const therapeuticAreas: Record<string, { count: number }> = {};
      for (const row of taResult.rows) {
        therapeuticAreas[String(row.area)] = { count: toSafeInt(row.count) };
      }

      const phaseBreakdown = phaseResult.rows.map((r: any) => {
        const count = toSafeInt(r.count);
        return {
          phase: r.phase,
          count,
          percentage: toPercentage(count, totalCSRs),
        };
      });

      const analyticsData: Record<string, unknown> = {
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

      setCachedPayload(cacheKey, analyticsData);
      res.setHeader('X-Cache', 'MISS');
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
      const { refresh = 'false' } = req.query;
      const cacheKey = 'stats:overview';
      const bypassCache = String(refresh).toLowerCase() === 'true';

      if (!bypassCache) {
        const cached = getCachedPayload(cacheKey);
        if (cached) {
          res.setHeader('X-Cache', 'HIT');
          return res.json(cached);
        }
      }

      const [overviewResult, phaseResult, taResult] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS total,
                  COUNT(DISTINCT indication)::int AS therapeutic_area_count,
                  COUNT(DISTINCT sponsor)::int AS unique_sponsors,
                  COUNT(*) FILTER (WHERE status = 'approved')::int AS completed_reviews
           FROM csr_reports
           WHERE deleted_at IS NULL`
        ),
        pool.query(
          `SELECT COALESCE(phase, 'Unknown') AS phase, COUNT(*)::int AS count
           FROM csr_reports WHERE deleted_at IS NULL AND phase IS NOT NULL
           GROUP BY phase ORDER BY count DESC`
        ),
        pool.query(
          `SELECT COALESCE(indication, 'Unknown') AS area, COUNT(*)::int AS count
           FROM csr_reports WHERE deleted_at IS NULL AND indication IS NOT NULL
           GROUP BY indication ORDER BY count DESC LIMIT 10`
        ),
      ]);

      const csrCount = toSafeInt(overviewResult.rows[0]?.total);
      const therapeuticAreaCount = toSafeInt(overviewResult.rows[0]?.therapeutic_area_count);
      const uniqueSponsors = toSafeInt(overviewResult.rows[0]?.unique_sponsors);
      const completedReviews = toSafeInt(overviewResult.rows[0]?.completed_reviews);

      const phaseBreakdown = phaseResult.rows.map((r: any) => {
        const count = toSafeInt(r.count);
        return {
          phase: r.phase,
          count,
          percentage: toPercentage(count, csrCount),
        };
      });

      const therapeuticAreas = taResult.rows.map((r: any) => {
        const count = toSafeInt(r.count);
        return {
          area: r.area,
          count,
          percentage: toPercentage(count, csrCount),
        };
      });

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

      setCachedPayload(cacheKey, statsData);
      res.setHeader('X-Cache', 'MISS');
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
      const { refresh = 'false' } = req.query;
      const cacheKey = 'insights:factual';
      const bypassCache = String(refresh).toLowerCase() === 'true';

      if (!bypassCache) {
        const cached = getCachedPayload(cacheKey);
        if (cached) {
          res.setHeader('X-Cache', 'HIT');
          return res.json(cached);
        }
      }

      // Aggregate real insights from csr_reports
      const [avgSampleResult, topIndicationsResult, topPhaseResult] = await Promise.all([
        pool.query(
          'SELECT AVG(sample_size)::int AS avg_sample, AVG(duration_weeks)::int AS avg_duration FROM csr_reports WHERE deleted_at IS NULL AND sample_size IS NOT NULL'
        ),
        pool.query(
          `SELECT COALESCE(indication, 'Unknown') AS area, COUNT(*)::int AS studies, AVG(sample_size)::int AS avg_sample
           FROM csr_reports WHERE deleted_at IS NULL AND indication IS NOT NULL
           GROUP BY indication ORDER BY studies DESC LIMIT 5`
        ),
        pool.query(
          `SELECT phase, COUNT(*)::int AS cnt FROM csr_reports WHERE deleted_at IS NULL AND phase IS NOT NULL
           GROUP BY phase ORDER BY cnt DESC LIMIT 1`
        ),
      ]);
      const avgSample = toSafeInt(avgSampleResult.rows[0]?.avg_sample);
      const avgDurationWeeks = toSafeInt(avgSampleResult.rows[0]?.avg_duration);

      const indicationInsights: Record<string, { studies: number; avgSampleSize: number }> = {};
      for (const row of topIndicationsResult.rows) {
        indicationInsights[row.area] = {
          studies: toSafeInt(row.studies),
          avgSampleSize: toSafeInt(row.avg_sample),
        };
      }

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

      const payload = {
        success: true,
        data: factualInsights,
        source: 'database',
      };

      setCachedPayload(cacheKey, payload);
      res.setHeader('X-Cache', 'MISS');
      res.json(payload);
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
