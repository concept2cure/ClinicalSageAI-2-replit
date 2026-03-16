/**
 * Phase 15 — Automation Runner (Idempotent)
 *
 * Scans packages for policy violations, missing assignments, overdue items,
 * and handoff stalls. Creates blockers, escalations, and notifications.
 * All runs are idempotent — same window key produces no duplicate actions.
 */
import { db } from '../db';
import {
  concept2cureArtifacts,
  concept2cureReviewThreads,
  concept2cureReviewTasks,
  concept2cureReviewAssignments,
  concept2cureNotifications,
  c2cSubmissionPackages,
  c2cPackageSections,
  c2cArtifactSectionMap,
  c2cBlockers,
  c2cAutomationRuns,
  c2cAutomationActions,
  c2cMilestones,
  c2cMilestoneSections,
  c2cReadinessSnapshots,
} from '../../shared/schema';
import { eq, and, sql, count, inArray, lt } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { resolvePolicy } from './policy-engine';
import { computePackageReadiness, saveReadinessSnapshots } from './readiness-engine';

interface AutomationResult {
  runId: string;
  actionsCreated: number;
  blockersFound: number;
  escalationsTriggered: number;
  readinessUpdated: boolean;
  actions: { actionType: string; description: string }[];
}

/**
 * Run the full automation sweep for a package.
 * Idempotent: uses a window key (org_project_package_type_hourWindow) to prevent duplicates.
 */
export async function runAutomationSweep(
  orgId: number,
  projectId: number,
  packageDbId: number
): Promise<AutomationResult> {
  const now = new Date();
  const hourWindow = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
  const idempotencyKey = `${orgId}_${projectId}_${packageDbId}_full_sweep_${hourWindow}`;

  // Check idempotency
  const [existing] = await db
    .select()
    .from(c2cAutomationRuns)
    .where(eq(c2cAutomationRuns.idempotencyKey, idempotencyKey))
    .limit(1);

  if (existing) {
    return {
      runId: existing.runId,
      actionsCreated: existing.actionsCreated ?? 0,
      blockersFound: existing.blockersFound ?? 0,
      escalationsTriggered: existing.escalationsTriggered ?? 0,
      readinessUpdated: existing.readinessUpdated ?? false,
      actions: [],
    };
  }

  const runId = `run_${randomUUID()}`;
  await db.insert(c2cAutomationRuns).values({
    runId,
    orgId,
    projectId,
    packageDbId,
    runType: 'full_sweep',
    status: 'running',
    idempotencyKey,
  });

  const actions: { actionType: string; description: string }[] = [];
  let blockersFound = 0;
  let escalationsTriggered = 0;

  try {
    // 1. Detect missing reviewer assignments on review-stage artifacts
    const reviewArtifacts = await db
      .select({ id: concept2cureArtifacts.id, title: concept2cureArtifacts.title })
      .from(concept2cureArtifacts)
      .innerJoin(
        c2cArtifactSectionMap,
        eq(c2cArtifactSectionMap.artifactId, concept2cureArtifacts.id)
      )
      .innerJoin(c2cPackageSections, eq(c2cPackageSections.id, c2cArtifactSectionMap.sectionDbId))
      .where(
        and(
          eq(concept2cureArtifacts.organizationId, orgId),
          eq(concept2cureArtifacts.status, 'review'),
          eq(c2cPackageSections.packageDbId, packageDbId)
        )
      );

    for (const art of reviewArtifacts) {
      const [assignmentCount] = await db
        .select({ count: count() })
        .from(concept2cureReviewAssignments)
        .where(
          and(
            eq(concept2cureReviewAssignments.artifactId, art.id),
            eq(concept2cureReviewAssignments.organizationId, orgId)
          )
        );

      if ((assignmentCount?.count ?? 0) === 0) {
        // Create blocker for missing reviewer
        await createBlockerIfNotExists(
          orgId,
          projectId,
          packageDbId,
          art.id,
          'reviewer_unassigned',
          `No reviewers assigned for "${art.title}"`,
          'high'
        );
        actions.push({
          actionType: 'routing_issue_flagged',
          description: `No reviewers assigned for "${art.title}" — artifact in review state`,
        });
        blockersFound++;
      }
    }

    // 2. Detect overdue items
    const overdueThreads = await db
      .select({
        id: concept2cureReviewThreads.id,
        title: concept2cureReviewThreads.title,
        artifactId: concept2cureReviewThreads.artifactId,
        assigneeId: concept2cureReviewThreads.assigneeId,
        dueAt: concept2cureReviewThreads.dueAt,
      })
      .from(concept2cureReviewThreads)
      .innerJoin(
        c2cArtifactSectionMap,
        eq(c2cArtifactSectionMap.artifactId, concept2cureReviewThreads.artifactId)
      )
      .innerJoin(c2cPackageSections, eq(c2cPackageSections.id, c2cArtifactSectionMap.sectionDbId))
      .where(
        and(
          eq(concept2cureReviewThreads.orgId, orgId),
          eq(concept2cureReviewThreads.status, 'open'),
          eq(c2cPackageSections.packageDbId, packageDbId),
          sql`${concept2cureReviewThreads.dueAt} < ${now}`
        )
      );

    for (const thread of overdueThreads) {
      await createBlockerIfNotExists(
        orgId,
        projectId,
        packageDbId,
        thread.artifactId,
        'open_critical_thread',
        `Overdue thread: "${thread.title || 'Untitled'}"`,
        'high'
      );
      blockersFound++;
    }

    // 3. Detect overdue tasks
    const overdueTasks = await db
      .select({
        id: concept2cureReviewTasks.id,
        title: concept2cureReviewTasks.title,
        artifactId: concept2cureReviewTasks.artifactId,
        assignedToId: concept2cureReviewTasks.assignedToId,
      })
      .from(concept2cureReviewTasks)
      .innerJoin(
        c2cArtifactSectionMap,
        eq(c2cArtifactSectionMap.artifactId, concept2cureReviewTasks.artifactId)
      )
      .innerJoin(c2cPackageSections, eq(c2cPackageSections.id, c2cArtifactSectionMap.sectionDbId))
      .where(
        and(
          eq(concept2cureReviewTasks.orgId, orgId),
          inArray(concept2cureReviewTasks.status, ['open', 'in_progress']),
          eq(c2cPackageSections.packageDbId, packageDbId),
          sql`${concept2cureReviewTasks.dueAt} < ${now}`
        )
      );

    for (const task of overdueTasks) {
      actions.push({
        actionType: 'escalation_triggered',
        description: `Overdue task: "${task.title}" — escalation triggered`,
      });
      escalationsTriggered++;
    }

    // 4. Detect approved-but-not-publishable docs (open critical findings block publish)
    const approvedArtifacts = await db
      .select({ id: concept2cureArtifacts.id, title: concept2cureArtifacts.title })
      .from(concept2cureArtifacts)
      .innerJoin(
        c2cArtifactSectionMap,
        eq(c2cArtifactSectionMap.artifactId, concept2cureArtifacts.id)
      )
      .innerJoin(c2cPackageSections, eq(c2cPackageSections.id, c2cArtifactSectionMap.sectionDbId))
      .where(
        and(
          eq(concept2cureArtifacts.organizationId, orgId),
          eq(concept2cureArtifacts.status, 'approved'),
          eq(c2cPackageSections.packageDbId, packageDbId)
        )
      );

    for (const art of approvedArtifacts) {
      const [criticalCount] = await db
        .select({ count: count() })
        .from(concept2cureReviewThreads)
        .where(
          and(
            eq(concept2cureReviewThreads.orgId, orgId),
            eq(concept2cureReviewThreads.artifactId, art.id),
            eq(concept2cureReviewThreads.status, 'open'),
            eq(concept2cureReviewThreads.priority, 'high')
          )
        );

      if ((criticalCount?.count ?? 0) > 0) {
        await createBlockerIfNotExists(
          orgId,
          projectId,
          packageDbId,
          art.id,
          'publish_prerequisite',
          `"${art.title}" approved but has open critical findings — cannot publish`,
          'critical'
        );
        actions.push({
          actionType: 'blocker_created',
          description: `"${art.title}" approved but blocked from publish — open critical findings`,
        });
        blockersFound++;
      }
    }

    // 5. Update readiness snapshots
    const readiness = await computePackageReadiness(orgId, packageDbId);
    const [runRecord] = await db
      .select({ id: c2cAutomationRuns.id })
      .from(c2cAutomationRuns)
      .where(eq(c2cAutomationRuns.runId, runId));

    await saveReadinessSnapshots(orgId, packageDbId, readiness, runRecord?.id);
    actions.push({
      actionType: 'readiness_snapshot_updated',
      description: `Readiness snapshot updated: ${readiness.overallReadinessPercent}% (${readiness.overallState})`,
    });

    // 6. Check milestone gates
    const milestones = await db
      .select()
      .from(c2cMilestones)
      .where(and(eq(c2cMilestones.orgId, orgId), eq(c2cMilestones.packageDbId, packageDbId)));

    for (const milestone of milestones) {
      const milestoneSections = await db
        .select({ sectionDbId: c2cMilestoneSections.sectionDbId })
        .from(c2cMilestoneSections)
        .where(eq(c2cMilestoneSections.milestoneDbId, milestone.id));

      const blockReasons: string[] = [];
      for (const ms of milestoneSections) {
        const section = readiness.sections.find(s => s.sectionDbId === ms.sectionDbId);
        if (section && section.overallState === 'blocked') {
          blockReasons.push(`${section.sectionLabel}: blocked`);
        } else if (section && section.openCriticalFindings > 0) {
          blockReasons.push(
            `${section.sectionLabel}: ${section.openCriticalFindings} critical findings`
          );
        }
      }

      const newGateStatus = blockReasons.length > 0 ? 'blocked' : 'open';
      if (milestone.gateStatus !== newGateStatus) {
        await db
          .update(c2cMilestones)
          .set({
            gateStatus: newGateStatus,
            blockReasons: blockReasons.length > 0 ? blockReasons : null,
            updatedAt: now,
          })
          .where(eq(c2cMilestones.id, milestone.id));

        actions.push({
          actionType: 'milestone_gate_updated',
          description: `Milestone "${milestone.title}" gate: ${newGateStatus}${blockReasons.length > 0 ? ` (${blockReasons.length} block reasons)` : ''}`,
        });
      }
    }

    // Finalize run
    const [updatedRun] = await db
      .select({ id: c2cAutomationRuns.id })
      .from(c2cAutomationRuns)
      .where(eq(c2cAutomationRuns.runId, runId));

    // Save individual actions
    for (const action of actions) {
      await db.insert(c2cAutomationActions).values({
        actionId: `action_${randomUUID()}`,
        runId: updatedRun.id,
        orgId,
        actionType: action.actionType,
        description: action.description,
      });
    }

    await db
      .update(c2cAutomationRuns)
      .set({
        status: 'completed',
        actionsCreated: actions.length,
        blockersFound,
        escalationsTriggered,
        readinessUpdated: true,
        completedAt: now,
        summary: { actions: actions.map(a => a.description) },
      })
      .where(eq(c2cAutomationRuns.runId, runId));

    return {
      runId,
      actionsCreated: actions.length,
      blockersFound,
      escalationsTriggered,
      readinessUpdated: true,
      actions,
    };
  } catch (error: any) {
    await db
      .update(c2cAutomationRuns)
      .set({ status: 'failed', errorMessage: error.message, completedAt: now })
      .where(eq(c2cAutomationRuns.runId, runId));

    throw error;
  }
}

/**
 * Create a blocker if one doesn't already exist for this artifact + type.
 */
async function createBlockerIfNotExists(
  orgId: number,
  projectId: number,
  packageDbId: number,
  artifactId: number,
  blockerType: string,
  title: string,
  severity: string
): Promise<void> {
  const [existing] = await db
    .select({ id: c2cBlockers.id })
    .from(c2cBlockers)
    .where(
      and(
        eq(c2cBlockers.orgId, orgId),
        eq(c2cBlockers.artifactId, artifactId),
        eq(c2cBlockers.blockerType, blockerType),
        eq(c2cBlockers.status, 'open')
      )
    )
    .limit(1);

  if (existing) return;

  await db.insert(c2cBlockers).values({
    blockerId: `blk_${randomUUID()}`,
    orgId,
    projectId,
    packageDbId,
    artifactId,
    blockerType,
    severity,
    title,
    status: 'open',
  });
}
