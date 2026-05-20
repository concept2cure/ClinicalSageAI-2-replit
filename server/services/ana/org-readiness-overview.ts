/**
 * Org-wide project readiness overview.
 *
 * Runs the project readiness aggregator against every project in an
 * organization (with a concurrency cap to avoid stampeding) and returns
 * a single overview the org admin can poll:
 *
 *   - per-project readiness rows sorted worst-first (lowest score first;
 *     filing-blocked bubbles to the top)
 *   - org-level rollup: averageScore, projectCount, projectsAtRisk,
 *     projectsFilingBlocked, severity counters across categories
 *   - top urgent actions across the org — deduplicated, ranked
 *
 * Pure helper deriveOrgReadinessOverview(): testable from pre-fetched
 * aggregates. Live entry getOrgReadinessOverview(): pulls every project
 * + runs aggregates in parallel.
 *
 * Tenant-scoped: caller's org is the only org scanned.
 *
 * @module server/services/ana/org-readiness-overview
 */
import { getPool } from '../../db/runtime.js';
import {
  getProjectReadinessAggregate,
  type ProjectReadinessAggregate,
  type ReadinessNextAction,
} from './project-readiness-aggregator.js';

export interface OrgProjectReadinessRow {
  projectId: number;
  projectName: string | null;
  projectCode: string | null;
  projectStatus: string | null;
  therapeuticArea: string | null;
  score: number;
  filingBlocking: boolean;
  componentScores: {
    sectionCoverage: number;
    citationQuality: number;
    consistency: number;
    guidance: number;
    therapeuticContext: number;
  };
  topActionMessage: string | null;
  topActionScoreImpact: number | null;
  /** Failed = the per-project aggregate threw. Caller can retry. */
  status: 'ok' | 'failed';
  errorMessage?: string;
}

export interface OrgReadinessOverview {
  organizationId: number;
  asOf: string;
  /** Number of projects considered (active + at-risk + ready). */
  projectCount: number;
  /** average of `score` across successfully-aggregated projects. */
  averageScore: number;
  /** Projects below the at-risk threshold (default 60). */
  projectsAtRisk: number;
  /** Projects with filingBlocking=true. */
  projectsFilingBlocked: number;
  /** Projects whose aggregate failed (network / DB hiccup). */
  projectsFailed: number;
  /** Critical-severity action counts grouped by category. */
  criticalActionsByCategory: {
    section_coverage: number;
    citation_quality: number;
    consistency: number;
    guidance: number;
    therapeutic_area: number;
  };
  /** Top 10 urgent actions across every project. */
  topActions: Array<
    ReadinessNextAction & { projectId: number; projectName: string | null }
  >;
  projects: OrgProjectReadinessRow[];
}

const DEFAULT_AT_RISK_THRESHOLD = 60;
const DEFAULT_CONCURRENCY = 4;
const TOP_ACTIONS_CAP = 10;

export interface OrgReadinessOverviewOptions {
  /** Score threshold below which a project is "at risk". Default 60. */
  atRiskThreshold?: number;
  /** Parallel aggregate fetches. Default 4, capped 8. */
  concurrency?: number;
  /** When set, restrict to projects whose status matches. */
  projectStatus?: string;
  /** When true, exclude archived projects (status='archived'). Default true. */
  excludeArchived?: boolean;
  /** Submission type passed through to each aggregate. */
  submissionType?: 'IND' | 'NDA' | 'BLA' | 'ALL';
}

interface ProjectMeta {
  projectId: number;
  projectName: string | null;
  projectCode: string | null;
  projectStatus: string | null;
  therapeuticArea: string | null;
}

/**
 * Pure: derive the overview from per-project aggregates. Caller does
 * the parallel fetches + handles failures.
 */
export function deriveOrgReadinessOverview(
  organizationId: number,
  rows: Array<{
    meta: ProjectMeta;
    aggregate: ProjectReadinessAggregate | null;
    error?: string;
  }>,
  options: OrgReadinessOverviewOptions = {}
): OrgReadinessOverview {
  const atRiskThreshold = options.atRiskThreshold ?? DEFAULT_AT_RISK_THRESHOLD;
  const projects: OrgProjectReadinessRow[] = [];
  let scoreSum = 0;
  let scoreCount = 0;
  let projectsAtRisk = 0;
  let projectsFilingBlocked = 0;
  let projectsFailed = 0;
  const criticalActionsByCategory = {
    section_coverage: 0,
    citation_quality: 0,
    consistency: 0,
    guidance: 0,
    therapeutic_area: 0,
  };
  const allActions: Array<
    ReadinessNextAction & { projectId: number; projectName: string | null }
  > = [];

  for (const row of rows) {
    if (!row.aggregate) {
      projectsFailed += 1;
      projects.push({
        projectId: row.meta.projectId,
        projectName: row.meta.projectName,
        projectCode: row.meta.projectCode,
        projectStatus: row.meta.projectStatus,
        therapeuticArea: row.meta.therapeuticArea,
        score: 0,
        filingBlocking: false,
        componentScores: {
          sectionCoverage: 0,
          citationQuality: 0,
          consistency: 0,
          guidance: 0,
          therapeuticContext: 0,
        },
        topActionMessage: null,
        topActionScoreImpact: null,
        status: 'failed',
        errorMessage: row.error,
      });
      continue;
    }
    const a = row.aggregate;
    scoreSum += a.score;
    scoreCount += 1;
    if (a.score < atRiskThreshold) projectsAtRisk += 1;
    if (a.filingBlocking) projectsFilingBlocked += 1;

    for (const action of a.nextActions) {
      if (action.severity === 'critical') {
        criticalActionsByCategory[action.category] += 1;
      }
      allActions.push({
        ...action,
        projectId: a.projectId,
        projectName: row.meta.projectName,
      });
    }
    const top = a.nextActions[0] ?? null;
    projects.push({
      projectId: row.meta.projectId,
      projectName: row.meta.projectName,
      projectCode: row.meta.projectCode,
      projectStatus: row.meta.projectStatus,
      therapeuticArea: row.meta.therapeuticArea,
      score: a.score,
      filingBlocking: a.filingBlocking,
      componentScores: {
        sectionCoverage: a.components.sectionCoverage.score,
        citationQuality: a.components.citationQuality.score,
        consistency: a.components.consistency.score,
        guidance: a.components.guidance.score,
        therapeuticContext: a.components.therapeuticContext.score,
      },
      topActionMessage: top?.message ?? null,
      topActionScoreImpact: top?.scoreImpact ?? null,
      status: 'ok',
    });
  }

  // Sort projects: filing-blocked first, then ascending score (worst-first),
  // then alphabetical by projectName for stability.
  projects.sort((a, b) => {
    if (a.filingBlocking !== b.filingBlocking) return a.filingBlocking ? -1 : 1;
    if (a.score !== b.score) return a.score - b.score;
    return (a.projectName ?? '').localeCompare(b.projectName ?? '');
  });

  // Top actions across the org: critical first, then by scoreImpact desc,
  // dedupe by message+projectId so we don't surface the same action twice.
  const SEVERITY_RANK: Record<ReadinessNextAction['severity'], number> = {
    critical: 0,
    major: 1,
    minor: 2,
    info: 3,
  };
  allActions.sort((a, b) => {
    if (a.severity !== b.severity)
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (a.scoreImpact !== b.scoreImpact) return b.scoreImpact - a.scoreImpact;
    return (a.message ?? '').localeCompare(b.message ?? '');
  });
  const seenKeys = new Set<string>();
  const topActions: typeof allActions = [];
  for (const action of allActions) {
    const key = `${action.projectId}|${action.id}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    topActions.push(action);
    if (topActions.length >= TOP_ACTIONS_CAP) break;
  }

  const averageScore =
    scoreCount === 0 ? 0 : Math.round((scoreSum / scoreCount) * 10) / 10;

  return {
    organizationId,
    asOf: new Date().toISOString(),
    projectCount: projects.length,
    averageScore,
    projectsAtRisk,
    projectsFilingBlocked,
    projectsFailed,
    criticalActionsByCategory,
    topActions,
    projects,
  };
}

/**
 * Live entry: pull the org's projects, run aggregates in parallel
 * (bounded), derive overview. Tenant-scoped.
 */
export async function getOrgReadinessOverview(
  organizationId: number,
  options: OrgReadinessOverviewOptions = {}
): Promise<OrgReadinessOverview> {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? DEFAULT_CONCURRENCY, 8));
  const excludeArchived = options.excludeArchived !== false;

  // 1. Pull project metadata.
  const filters: string[] = ['organization_id = $1'];
  const params: any[] = [organizationId];
  if (excludeArchived) {
    filters.push(`status <> 'archived'`);
  }
  if (options.projectStatus) {
    params.push(options.projectStatus);
    filters.push(`status = $${params.length}`);
  }
  const where = `WHERE ${filters.join(' AND ')}`;

  let metas: ProjectMeta[] = [];
  try {
    const { rows } = await getPool().query(
      `SELECT id, name, code, status, therapeutic_area
         FROM projects
         ${where}
        ORDER BY updated_at DESC`,
      params
    );
    metas = rows.map((r: any) => ({
      projectId: r.id,
      projectName: r.name ?? null,
      projectCode: r.code ?? null,
      projectStatus: r.status ?? null,
      therapeuticArea: r.therapeutic_area ?? null,
    }));
  } catch (err: any) {
    if (err?.code === '42P01' || err?.code === '42703') {
      return deriveOrgReadinessOverview(organizationId, [], options);
    }
    throw err;
  }

  // 2. Run aggregates with bounded concurrency. Per-project failures
  // are recorded but don't fail the overview.
  const results: Array<{
    meta: ProjectMeta;
    aggregate: ProjectReadinessAggregate | null;
    error?: string;
  }> = new Array(metas.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < metas.length) {
      const idx = cursor++;
      const meta = metas[idx];
      try {
        const aggregate = await getProjectReadinessAggregate(
          meta.projectId,
          organizationId,
          { submissionType: options.submissionType }
        );
        results[idx] = { meta, aggregate };
      } catch (err: any) {
        results[idx] = {
          meta,
          aggregate: null,
          error: err?.message || String(err),
        };
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return deriveOrgReadinessOverview(organizationId, results, options);
}
