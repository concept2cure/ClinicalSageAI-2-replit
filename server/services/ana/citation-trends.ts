/**
 * Citation engine trend dashboard.
 *
 * Time-bucketed aggregation over `ana_artifact_citation_runs` so a
 * dashboard can ask "how have gap counts and readiness deltas evolved
 * over the last N days?". Buckets by day, week, or month using PG's
 * date_trunc; returns one row per bucket with averaged counts and a
 * peak filing-blocked-artifact count.
 *
 * Tenant-scoped via organization_id + project_id.
 *
 * @module server/services/ana/citation-trends
 */
import { getPool } from '../../db/runtime.js';

export type TrendBucket = 'day' | 'week' | 'month';

export interface CitationTrendBucket {
  bucketStart: string;
  bucketEnd: string;
  runCount: number;
  /** Average gap_count across the runs in this bucket. */
  avgGapsPerArtifact: number;
  /** Average total_readiness_delta across the runs (negative). */
  avgReadinessDelta: number;
  /** Distinct artifacts whose run in this bucket was filing-blocked. */
  filingBlockedArtifactCount: number;
  /** Sum of gap_count across runs (raw — useful for absolute totals). */
  totalGapCount: number;
  /** Sum of total_readiness_delta across runs. */
  totalReadinessDelta: number;
  /** Distinct artifacts that ran in this bucket. */
  artifactsRun: number;
}

export interface ProjectCitationTrend {
  projectId: number;
  organizationId: number;
  windowDays: number;
  bucket: TrendBucket;
  asOf: string;
  buckets: CitationTrendBucket[];
}

const TRUNC_SQL: Record<TrendBucket, string> = {
  day: "date_trunc('day', created_at)",
  week: "date_trunc('week', created_at)",
  month: "date_trunc('month', created_at)",
};

const BUCKET_INTERVAL_SQL: Record<TrendBucket, string> = {
  day: "INTERVAL '1 day'",
  week: "INTERVAL '7 days'",
  month: "INTERVAL '1 month'",
};

const MIN_WINDOW_DAYS = 1;
const MAX_WINDOW_DAYS = 365;

export async function getProjectCitationTrend(
  projectId: number,
  organizationId: number,
  options: { windowDays?: number; bucket?: TrendBucket } = {}
): Promise<ProjectCitationTrend> {
  const windowDays = Math.max(
    MIN_WINDOW_DAYS,
    Math.min(options.windowDays ?? 30, MAX_WINDOW_DAYS)
  );
  const bucket: TrendBucket = options.bucket ?? 'day';
  const trunc = TRUNC_SQL[bucket];
  const interval = BUCKET_INTERVAL_SQL[bucket];

  const sql = `
    SELECT
      ${trunc}                                                  AS bucket_start,
      ${trunc} + ${interval}                                     AS bucket_end,
      COUNT(*)::int                                              AS run_count,
      AVG(gap_count)::float                                      AS avg_gaps_per_artifact,
      AVG(total_readiness_delta)::float                          AS avg_readiness_delta,
      COUNT(DISTINCT CASE WHEN filing_blocked THEN artifact_id END)::int
                                                                AS filing_blocked_artifact_count,
      SUM(gap_count)::int                                        AS total_gap_count,
      SUM(total_readiness_delta)::int                            AS total_readiness_delta,
      COUNT(DISTINCT artifact_id)::int                           AS artifacts_run
    FROM ana_artifact_citation_runs
    WHERE organization_id = $2
      AND project_id      = $1
      AND created_at >= NOW() - ($3::int * INTERVAL '1 day')
    GROUP BY ${trunc}
    ORDER BY ${trunc} ASC
  `;

  let rows: any[] = [];
  try {
    const result = await getPool().query(sql, [projectId, organizationId, windowDays]);
    rows = result.rows;
  } catch (err: any) {
    if (err?.code !== '42P01') {
      console.warn('[citation-trends] query failed:', err?.message);
    }
  }

  const buckets: CitationTrendBucket[] = rows.map((r: any) => ({
    bucketStart: new Date(r.bucket_start).toISOString(),
    bucketEnd: new Date(r.bucket_end).toISOString(),
    runCount: Number(r.run_count) || 0,
    avgGapsPerArtifact: Number(r.avg_gaps_per_artifact) || 0,
    avgReadinessDelta: Number(r.avg_readiness_delta) || 0,
    filingBlockedArtifactCount: Number(r.filing_blocked_artifact_count) || 0,
    totalGapCount: Number(r.total_gap_count) || 0,
    totalReadinessDelta: Number(r.total_readiness_delta) || 0,
    artifactsRun: Number(r.artifacts_run) || 0,
  }));

  return {
    projectId,
    organizationId,
    windowDays,
    bucket,
    asOf: new Date().toISOString(),
    buckets,
  };
}
