/**
 * Phase 15 — Readiness Computation Engine
 *
 * Computes readiness state for packages, sections, and artifacts
 * by aggregating data from Stage 12/13 objects (threads, tasks,
 * review assignments, approvals, etc.)
 */
import { db } from '../db';
import {
  concept2cureArtifacts,
  concept2cureReviewThreads,
  concept2cureReviewTasks,
  concept2cureReviewAssignments,
  concept2cureReviewDecisions,
  concept2cureSignatures,
  c2cSubmissionPackages,
  c2cPackageSections,
  c2cArtifactSectionMap,
  c2cReadinessSnapshots,
  c2cBlockers,
} from '../../shared/schema';
import { eq, and, sql, count, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export interface SectionReadiness {
  sectionDbId: number;
  sectionKey: string;
  sectionLabel: string;
  totalArtifacts: number;
  readyArtifacts: number;
  readinessPercent: number;
  openThreads: number;
  openTasks: number;
  overdueItems: number;
  missingApprovals: number;
  openCriticalFindings: number;
  overallState: 'on_track' | 'at_risk' | 'blocked';
  maxBlockerSeverity: string | null;
}

export interface PackageReadiness {
  packageDbId: number;
  packageId: string;
  title: string;
  packageFamily: string;
  targetDate: Date | null;
  overallReadinessPercent: number;
  overallState: 'on_track' | 'at_risk' | 'blocked';
  sections: SectionReadiness[];
  totalBlockers: number;
  totalOverdue: number;
}

/**
 * Compute readiness for a single package and all its sections.
 */
export async function computePackageReadiness(
  orgId: number,
  packageDbId: number
): Promise<PackageReadiness> {
  // Get package
  const [pkg] = await db
    .select()
    .from(c2cSubmissionPackages)
    .where(and(eq(c2cSubmissionPackages.id, packageDbId), eq(c2cSubmissionPackages.orgId, orgId)));

  if (!pkg) throw new Error('Package not found');

  // Get sections
  const sections = await db
    .select()
    .from(c2cPackageSections)
    .where(eq(c2cPackageSections.packageDbId, packageDbId));

  const sectionReadiness: SectionReadiness[] = [];
  let totalBlockers = 0;
  let totalOverdue = 0;

  for (const section of sections) {
    const sr = await computeSectionReadiness(
      orgId,
      section.id,
      section.sectionKey,
      section.sectionLabel
    );
    sectionReadiness.push(sr);
    totalOverdue += sr.overdueItems;
  }

  // Count open blockers for this package
  const [blockerCount] = await db
    .select({ count: count() })
    .from(c2cBlockers)
    .where(
      and(
        eq(c2cBlockers.orgId, orgId),
        eq(c2cBlockers.packageDbId, packageDbId),
        eq(c2cBlockers.status, 'open')
      )
    );
  totalBlockers = blockerCount?.count ?? 0;

  // Compute overall
  const totalArtifacts = sectionReadiness.reduce((s, r) => s + r.totalArtifacts, 0);
  const readyArtifacts = sectionReadiness.reduce((s, r) => s + r.readyArtifacts, 0);
  const overallReadinessPercent =
    totalArtifacts > 0 ? Math.round((readyArtifacts / totalArtifacts) * 100) : 0;

  let overallState: 'on_track' | 'at_risk' | 'blocked' = 'on_track';
  if (sectionReadiness.some(s => s.overallState === 'blocked')) overallState = 'blocked';
  else if (sectionReadiness.some(s => s.overallState === 'at_risk')) overallState = 'at_risk';

  return {
    packageDbId,
    packageId: pkg.packageId,
    title: pkg.title,
    packageFamily: pkg.packageFamily,
    targetDate: pkg.targetDate,
    overallReadinessPercent,
    overallState,
    sections: sectionReadiness,
    totalBlockers,
    totalOverdue,
  };
}

/**
 * Compute readiness for a single section.
 */
async function computeSectionReadiness(
  orgId: number,
  sectionDbId: number,
  sectionKey: string,
  sectionLabel: string
): Promise<SectionReadiness> {
  const now = new Date();

  // Get artifacts in this section
  const artifactMappings = await db
    .select({ artifactId: c2cArtifactSectionMap.artifactId })
    .from(c2cArtifactSectionMap)
    .where(
      and(
        eq(c2cArtifactSectionMap.sectionDbId, sectionDbId),
        eq(c2cArtifactSectionMap.orgId, orgId)
      )
    );

  const artifactIds = artifactMappings.map(m => m.artifactId);
  if (artifactIds.length === 0) {
    return {
      sectionDbId,
      sectionKey,
      sectionLabel,
      totalArtifacts: 0,
      readyArtifacts: 0,
      readinessPercent: 0,
      openThreads: 0,
      openTasks: 0,
      overdueItems: 0,
      missingApprovals: 0,
      openCriticalFindings: 0,
      overallState: 'on_track',
      maxBlockerSeverity: null,
    };
  }

  // Count total and ready artifacts (approved or locked = ready)
  const artifacts = await db
    .select({ id: concept2cureArtifacts.id, status: concept2cureArtifacts.status })
    .from(concept2cureArtifacts)
    .where(
      and(eq(concept2cureArtifacts.organizationId, orgId), inArray(concept2cureArtifacts.id, artifactIds))
    );

  const totalArtifacts = artifacts.length;
  const readyArtifacts = artifacts.filter(
    a => a.status === 'approved' || a.status === 'locked'
  ).length;

  // Count open threads
  const [threadCount] = await db
    .select({ count: count() })
    .from(concept2cureReviewThreads)
    .where(
      and(
        eq(concept2cureReviewThreads.orgId, orgId),
        eq(concept2cureReviewThreads.status, 'open'),
        inArray(concept2cureReviewThreads.artifactId, artifactIds)
      )
    );

  // Count open tasks
  const [taskCount] = await db
    .select({ count: count() })
    .from(concept2cureReviewTasks)
    .where(
      and(
        eq(concept2cureReviewTasks.orgId, orgId),
        inArray(concept2cureReviewTasks.status, ['open', 'in_progress']),
        inArray(concept2cureReviewTasks.artifactId, artifactIds)
      )
    );

  // Count overdue items (threads + tasks past due)
  const [overdueThreads] = await db
    .select({ count: count() })
    .from(concept2cureReviewThreads)
    .where(
      and(
        eq(concept2cureReviewThreads.orgId, orgId),
        eq(concept2cureReviewThreads.status, 'open'),
        inArray(concept2cureReviewThreads.artifactId, artifactIds),
        sql`${concept2cureReviewThreads.dueAt} < ${now}`
      )
    );

  const [overdueTasks] = await db
    .select({ count: count() })
    .from(concept2cureReviewTasks)
    .where(
      and(
        eq(concept2cureReviewTasks.orgId, orgId),
        inArray(concept2cureReviewTasks.status, ['open', 'in_progress']),
        inArray(concept2cureReviewTasks.artifactId, artifactIds),
        sql`${concept2cureReviewTasks.dueAt} < ${now}`
      )
    );

  const overdueItems = (overdueThreads?.count ?? 0) + (overdueTasks?.count ?? 0);

  // Count missing approvals (pending review assignments)
  const [pendingApprovals] = await db
    .select({ count: count() })
    .from(concept2cureReviewAssignments)
    .where(
      and(
        eq(concept2cureReviewAssignments.organizationId, orgId),
        eq(concept2cureReviewAssignments.status, 'pending'),
        inArray(concept2cureReviewAssignments.artifactId, artifactIds)
      )
    );

  // Count open critical findings (high-priority open threads)
  const [criticalFindings] = await db
    .select({ count: count() })
    .from(concept2cureReviewThreads)
    .where(
      and(
        eq(concept2cureReviewThreads.orgId, orgId),
        eq(concept2cureReviewThreads.status, 'open'),
        eq(concept2cureReviewThreads.priority, 'high'),
        inArray(concept2cureReviewThreads.artifactId, artifactIds)
      )
    );

  // Max blocker severity for this section
  const [maxBlocker] = await db
    .select({ severity: c2cBlockers.severity })
    .from(c2cBlockers)
    .where(
      and(
        eq(c2cBlockers.orgId, orgId),
        eq(c2cBlockers.sectionDbId, sectionDbId),
        eq(c2cBlockers.status, 'open')
      )
    )
    .orderBy(
      sql`CASE ${c2cBlockers.severity}
      WHEN 'critical' THEN 4
      WHEN 'high' THEN 3
      WHEN 'medium' THEN 2
      WHEN 'low' THEN 1
      ELSE 0 END DESC`
    )
    .limit(1);

  const openThreads = threadCount?.count ?? 0;
  const openTasks = taskCount?.count ?? 0;
  const missingApprovals = pendingApprovals?.count ?? 0;
  const openCriticalFindings = criticalFindings?.count ?? 0;
  const readinessPercent =
    totalArtifacts > 0 ? Math.round((readyArtifacts / totalArtifacts) * 100) : 0;

  let overallState: 'on_track' | 'at_risk' | 'blocked' = 'on_track';
  if (openCriticalFindings > 0 || maxBlocker?.severity === 'critical') {
    overallState = 'blocked';
  } else if (overdueItems > 0 || missingApprovals > 0 || maxBlocker?.severity === 'high') {
    overallState = 'at_risk';
  }

  return {
    sectionDbId,
    sectionKey,
    sectionLabel,
    totalArtifacts,
    readyArtifacts,
    readinessPercent,
    openThreads,
    openTasks,
    overdueItems,
    missingApprovals,
    openCriticalFindings,
    overallState,
    maxBlockerSeverity: maxBlocker?.severity ?? null,
  };
}

/**
 * Save a readiness snapshot for each section of a package.
 */
export async function saveReadinessSnapshots(
  orgId: number,
  packageDbId: number,
  readiness: PackageReadiness,
  automationRunId?: number
): Promise<void> {
  // Get previous snapshots for trend comparison
  for (const section of readiness.sections) {
    const [previous] = await db
      .select({ readinessPercent: c2cReadinessSnapshots.readinessPercent })
      .from(c2cReadinessSnapshots)
      .where(
        and(
          eq(c2cReadinessSnapshots.orgId, orgId),
          eq(c2cReadinessSnapshots.packageDbId, packageDbId),
          eq(c2cReadinessSnapshots.sectionDbId, section.sectionDbId)
        )
      )
      .orderBy(sql`${c2cReadinessSnapshots.computedAt} DESC`)
      .limit(1);

    const prevPercent = previous?.readinessPercent ?? null;
    let trend: string | null = null;
    if (prevPercent !== null) {
      if (section.readinessPercent > prevPercent) trend = 'improving';
      else if (section.readinessPercent < prevPercent) trend = 'degrading';
      else trend = 'stable';
    }

    await db.insert(c2cReadinessSnapshots).values({
      snapshotId: `snap_${randomUUID()}`,
      orgId,
      packageDbId,
      sectionDbId: section.sectionDbId,
      totalArtifacts: section.totalArtifacts,
      readyArtifacts: section.readyArtifacts,
      readinessPercent: section.readinessPercent,
      openThreads: section.openThreads,
      openTasks: section.openTasks,
      overdueItems: section.overdueItems,
      missingApprovals: section.missingApprovals,
      openCriticalFindings: section.openCriticalFindings,
      overallState: section.overallState,
      maxBlockerSeverity: section.maxBlockerSeverity,
      previousReadinessPercent: prevPercent,
      trend,
      automationRunId: automationRunId ?? null,
    });
  }

  // Package-level snapshot (section_db_id = null)
  const totalArtifacts = readiness.sections.reduce((s, r) => s + r.totalArtifacts, 0);
  const readyArtifacts = readiness.sections.reduce((s, r) => s + r.readyArtifacts, 0);
  const pkgPercent = totalArtifacts > 0 ? Math.round((readyArtifacts / totalArtifacts) * 100) : 0;

  const [prevPkg] = await db
    .select({ readinessPercent: c2cReadinessSnapshots.readinessPercent })
    .from(c2cReadinessSnapshots)
    .where(
      and(
        eq(c2cReadinessSnapshots.orgId, orgId),
        eq(c2cReadinessSnapshots.packageDbId, packageDbId),
        sql`${c2cReadinessSnapshots.sectionDbId} IS NULL`
      )
    )
    .orderBy(sql`${c2cReadinessSnapshots.computedAt} DESC`)
    .limit(1);

  let pkgTrend: string | null = null;
  if (prevPkg?.readinessPercent !== undefined && prevPkg?.readinessPercent !== null) {
    if (pkgPercent > prevPkg.readinessPercent) pkgTrend = 'improving';
    else if (pkgPercent < prevPkg.readinessPercent) pkgTrend = 'degrading';
    else pkgTrend = 'stable';
  }

  await db.insert(c2cReadinessSnapshots).values({
    snapshotId: `snap_pkg_${randomUUID()}`,
    orgId,
    packageDbId,
    sectionDbId: null,
    totalArtifacts,
    readyArtifacts,
    readinessPercent: pkgPercent,
    openThreads: readiness.sections.reduce((s, r) => s + r.openThreads, 0),
    openTasks: readiness.sections.reduce((s, r) => s + r.openTasks, 0),
    overdueItems: readiness.totalOverdue,
    missingApprovals: readiness.sections.reduce((s, r) => s + r.missingApprovals, 0),
    openCriticalFindings: readiness.sections.reduce((s, r) => s + r.openCriticalFindings, 0),
    overallState: readiness.overallState,
    maxBlockerSeverity: null,
    previousReadinessPercent: prevPkg?.readinessPercent ?? null,
    trend: pkgTrend,
    automationRunId: automationRunId ?? null,
  });
}
