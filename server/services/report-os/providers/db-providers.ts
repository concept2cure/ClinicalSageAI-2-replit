import { db } from '../../../db';
import { concept2cureArtifacts } from '@shared/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { confidenceFromBlockers, deriveLifecycleStatus } from './helpers';
import { registerProvider } from './registry';
import type { InsightProvider, InsightProviderContext, InsightValue } from './types';

/** Default freshness budget for governed-lifecycle insights (5 minutes). */
const LIFECYCLE_FRESHNESS_BUDGET_MS = 5 * 60_000;

interface LifecycleCounts {
  total: number;
  approvedOrLocked: number;
  review: number;
  draft: number;
}

const EMPTY_LIFECYCLE: LifecycleCounts = { total: 0, approvedOrLocked: 0, review: 0, draft: 0 };

/**
 * Resolves the project ids in scope from a provider context. Project-like scopes
 * (project/submission/document/program) carry a numeric project id in scopeId.
 * Returns an empty array when the scope cannot be resolved to a numeric project id.
 */
function resolveProjectIds(ctx: InsightProviderContext): number[] {
  const projectId = Number(ctx.scopeId);
  if (Number.isFinite(projectId) && projectId > 0) return [projectId];
  return [];
}

/**
 * Aggregates governed-artifact counts for the given org + project ids, grouped by
 * status. Mirrors the orchestrator's lifecycle bucketing (approved/locked,
 * review, draft) so dashboards and reports derive identical evidence.
 */
async function collectLifecycle(
  organizationId: number,
  projectIds: number[]
): Promise<LifecycleCounts> {
  if (projectIds.length === 0) return { ...EMPTY_LIFECYCLE };

  const rows = await db
    .select({
      status: concept2cureArtifacts.status,
      count: sql<number>`count(*)::int`,
    })
    .from(concept2cureArtifacts)
    .where(
      and(
        eq(concept2cureArtifacts.organizationId, organizationId),
        inArray(concept2cureArtifacts.projectId, projectIds)
      )
    )
    .groupBy(concept2cureArtifacts.status);

  const counts: LifecycleCounts = { ...EMPTY_LIFECYCLE };
  for (const row of rows) {
    const status = (row.status || '').toLowerCase();
    const count = row.count ?? 0;
    counts.total += count;
    if (status === 'approved' || status === 'locked') counts.approvedOrLocked += count;
    else if (status === 'review' || status === 'in_review' || status === 'in-review')
      counts.review += count;
    else counts.draft += count;
  }
  return counts;
}

/** Builds a 'missing' InsightValue carrying a single blocker (used on resolve/DB failure). */
function missingValue(blocker: string, observedAt: string): InsightValue {
  return {
    value: 0,
    status: 'missing',
    confidence: confidenceFromBlockers(1),
    blockers: [blocker],
    atoms: [],
    observedAt,
  };
}

const LIFECYCLE_ATOMS: InsightValue['atoms'] = [
  { sourceTable: 'concept2cure_artifacts', transformation: 'aggregation' },
];

/**
 * Artifact availability. For project-like scopes, counts governed artifacts in
 * scope (org + project scoped). Ready when any artifact exists, otherwise missing.
 */
export const artifactStateProvider: InsightProvider = {
  id: 'artifact_state',
  label: 'Artifact Availability',
  scopes: ['project', 'submission', 'document', 'program'],
  freshnessBudgetMs: LIFECYCLE_FRESHNESS_BUDGET_MS,
  async compute(ctx: InsightProviderContext): Promise<InsightValue> {
    const observedAt = (ctx.asOf ?? new Date()).toISOString();
    const projectIds = resolveProjectIds(ctx);
    if (projectIds.length === 0) {
      return missingValue('No governed artifacts discovered for this scope', observedAt);
    }

    try {
      const counts = await collectLifecycle(ctx.organizationId, projectIds);
      const blockers: string[] =
        counts.total > 0 ? [] : ['No governed artifacts discovered for this scope'];
      return {
        value: counts.total,
        status: counts.total > 0 ? 'ready' : 'missing',
        confidence: confidenceFromBlockers(blockers.length),
        blockers,
        atoms: LIFECYCLE_ATOMS,
        observedAt,
      };
    } catch (err) {
      return missingValue(
        `Failed to read artifact lifecycle: ${err instanceof Error ? err.message : String(err)}`,
        observedAt
      );
    }
  },
};

/**
 * Submission readiness. Ready when approved/locked artifacts exist, partial when
 * artifacts exist but none approved/locked, otherwise missing. Confidence reflects
 * the gap (blocker) count.
 */
export const submissionReadinessProvider: InsightProvider = {
  id: 'submission_readiness',
  label: 'Submission Readiness',
  scopes: ['project', 'submission', 'document', 'program'],
  freshnessBudgetMs: LIFECYCLE_FRESHNESS_BUDGET_MS,
  async compute(ctx: InsightProviderContext): Promise<InsightValue> {
    const observedAt = (ctx.asOf ?? new Date()).toISOString();
    const projectIds = resolveProjectIds(ctx);
    if (projectIds.length === 0) {
      return missingValue('No artifacts available to compute readiness', observedAt);
    }

    try {
      const counts = await collectLifecycle(ctx.organizationId, projectIds);
      const status = deriveLifecycleStatus(counts.approvedOrLocked, counts.total);
      const blockers: string[] =
        status === 'ready'
          ? []
          : status === 'partial'
            ? ['No approved or locked artifacts in current scope']
            : ['No artifacts available to compute readiness'];
      return {
        value: counts.approvedOrLocked,
        status,
        confidence: confidenceFromBlockers(blockers.length),
        blockers,
        atoms: LIFECYCLE_ATOMS,
        observedAt,
      };
    } catch (err) {
      return missingValue(
        `Failed to read submission readiness: ${err instanceof Error ? err.message : String(err)}`,
        observedAt
      );
    }
  },
};

/**
 * Compliance/audit posture derived from governed lifecycle evidence. Ready when
 * approved/locked artifacts exist, partial when artifacts are in review, otherwise
 * missing.
 */
export const complianceAuditProvider: InsightProvider = {
  id: 'compliance_audit',
  label: 'Compliance Audit Posture',
  scopes: ['project', 'submission', 'document', 'program'],
  freshnessBudgetMs: LIFECYCLE_FRESHNESS_BUDGET_MS,
  async compute(ctx: InsightProviderContext): Promise<InsightValue> {
    const observedAt = (ctx.asOf ?? new Date()).toISOString();
    const projectIds = resolveProjectIds(ctx);
    if (projectIds.length === 0) {
      return missingValue('No governed artifacts available for compliance evidence', observedAt);
    }

    try {
      const counts = await collectLifecycle(ctx.organizationId, projectIds);
      const status: InsightValue['status'] =
        counts.approvedOrLocked > 0 ? 'ready' : counts.review > 0 ? 'partial' : 'missing';
      const blockers: string[] =
        status === 'ready'
          ? []
          : status === 'partial'
            ? ['Artifacts are in review but not approved/locked for regulated audit posture']
            : ['No governed artifacts available for compliance evidence'];
      return {
        value: counts.approvedOrLocked,
        status,
        confidence: confidenceFromBlockers(blockers.length),
        blockers,
        atoms: LIFECYCLE_ATOMS,
        observedAt,
      };
    } catch (err) {
      return missingValue(
        `Failed to read compliance evidence: ${err instanceof Error ? err.message : String(err)}`,
        observedAt
      );
    }
  },
};

/** The core DB-backed insight providers, mirroring the orchestrator's evidence logic. */
export const CORE_DB_PROVIDERS: InsightProvider[] = [
  artifactStateProvider,
  submissionReadinessProvider,
  complianceAuditProvider,
];

/** Registers every core DB-backed provider into the shared registry. */
export function registerCoreProviders(): void {
  for (const provider of CORE_DB_PROVIDERS) {
    registerProvider(provider);
  }
}
