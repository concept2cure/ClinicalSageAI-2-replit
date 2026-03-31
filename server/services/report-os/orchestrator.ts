import { db } from '../../db';
import { concept2cureArtifacts } from '@shared/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { ReportScope } from '@shared/schema/report-os';

export interface ProviderResult {
  provider: string;
  observedAt: string;
  status: 'ready' | 'partial' | 'missing';
  blocker?: string;
}

export interface RunComputationResult {
  providers: ProviderResult[];
  confidence: number;
  blockers: string[];
  summary: Record<string, unknown>;
}

export async function computeInitialRun(
  organizationId: number,
  scopeType: ReportScope,
  scopeId: string,
  options?: { programProjectIds?: number[] }
): Promise<RunComputationResult> {
  const providers: ProviderResult[] = [];
  const blockers: string[] = [];

  // Provider 1: artifact availability
  let artifactCount = 0;
  let approvedOrLockedCount = 0;
  let reviewCount = 0;
  let draftCount = 0;
  const collectLifecycle = async (projectIds: number[]) => {
    if (projectIds.length === 0) return;
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

    for (const row of rows) {
      const status = (row.status || '').toLowerCase();
      const count = row.count ?? 0;
      artifactCount += count;
      if (status === 'approved' || status === 'locked') approvedOrLockedCount += count;
      else if (status === 'review' || status === 'in_review' || status === 'in-review') reviewCount += count;
      else draftCount += count;
    }
  };

  if (scopeType === 'project' || scopeType === 'submission' || scopeType === 'document') {
    const projectId = Number(scopeId);
    if (Number.isFinite(projectId)) {
      await collectLifecycle([projectId]);
    }
  }
  if (scopeType === 'program') {
    const projectIds = options?.programProjectIds ?? [];
    if (projectIds.length > 0) {
      await collectLifecycle(projectIds);
    }
  }

  if (artifactCount > 0) {
    providers.push({ provider: 'artifact_state', observedAt: new Date().toISOString(), status: 'ready' });
  } else {
    providers.push({ provider: 'artifact_state', observedAt: new Date().toISOString(), status: 'partial', blocker: 'No governed artifacts discovered for this scope' });
    blockers.push('No governed artifacts discovered for this scope');
  }

  const readinessStatus: ProviderResult['status'] =
    approvedOrLockedCount > 0 ? 'ready' : artifactCount > 0 ? 'partial' : 'missing';
  const readinessBlocker =
    readinessStatus === 'ready'
      ? undefined
      : readinessStatus === 'partial'
        ? 'No approved or locked artifacts in current scope'
        : 'No artifacts available to compute readiness';
  providers.push({
    provider: 'submission_readiness',
    observedAt: new Date().toISOString(),
    status: readinessStatus,
    blocker: readinessBlocker,
  });
  if (readinessBlocker) blockers.push(readinessBlocker);

  // Provider 3: compliance/audit provider is contract-only in slice 1
  providers.push({ provider: 'compliance_audit', observedAt: new Date().toISOString(), status: 'partial', blocker: 'Compliance aggregation pending provider adapter wiring' });
  blockers.push('Compliance provider in partial mode (slice-1)');

  const confidence = Math.max(25, Math.min(95, 95 - blockers.length * 20));

  return {
    providers,
    confidence,
    blockers,
    summary: {
      scopeType,
      scopeId,
      artifactCount,
      lifecycle: {
        approvedOrLockedCount,
        reviewCount,
        draftCount,
      },
    },
  };
}
