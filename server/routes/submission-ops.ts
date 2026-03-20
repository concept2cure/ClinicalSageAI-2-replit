/**
 * Phase 15 — Submission Operations Command Center API Routes
 *
 * /api/submission-ops/...
 *
 * Provides APIs for:
 * - Packages CRUD
 * - Sections CRUD
 * - Artifact-section mapping
 * - Milestones & gates
 * - Policy CRUD
 * - Readiness queries
 * - Blockers queries
 * - Automation trigger
 * - Digests
 * - Approval bottlenecks
 * - Ownership / workload
 * - Command center aggregates
 */
import { Router, Request, Response } from 'express';
import { db } from '../db';
import {
  c2cSubmissionPackages,
  c2cPackageSections,
  c2cArtifactSectionMap,
  c2cMilestones,
  c2cMilestoneSections,
  c2cSubmissionPolicies,
  c2cReadinessSnapshots,
  c2cBlockers,
  c2cAutomationRuns,
  c2cAutomationActions,
  c2cDigests,
  concept2cureArtifacts,
  concept2cureReviewThreads,
  concept2cureReviewTasks,
  concept2cureReviewAssignments,
  concept2cureNotifications,
} from '../../shared/schema';
import { eq, and, desc, sql, count, inArray, isNull, asc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { resolvePolicy, resolveAllPolicies } from '../submission-ops/policy-engine';
import { computePackageReadiness } from '../submission-ops/readiness-engine';
import { runAutomationSweep } from '../submission-ops/automation-runner';

const router = Router();

// Middleware: extract orgId from auth context
function getOrgId(req: Request): number {
  const orgId = (req as any).organizationId ?? (req as any).user?.organizationId;
  if (!orgId) throw new Error('Organization context required');
  return orgId;
}

function getUserId(req: Request): number {
  return (req as any).user?.id ?? (req as any).userId ?? 0;
}

// ============================================================
// PACKAGES
// ============================================================

router.get('/packages', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;

    const conditions = [eq(c2cSubmissionPackages.orgId, orgId)];
    if (projectId) conditions.push(eq(c2cSubmissionPackages.projectId, projectId));

    const packages = await db
      .select()
      .from(c2cSubmissionPackages)
      .where(and(...conditions))
      .orderBy(desc(c2cSubmissionPackages.createdAt));

    res.json({ data: packages });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/packages', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { projectId, packageFamily, title, description, targetDate, sections } = req.body;

    if (!projectId || !packageFamily || !title) {
      return res.status(400).json({ error: 'projectId, packageFamily, and title required' });
    }

    const packageId = `pkg_${randomUUID()}`;
    const [pkg] = await db
      .insert(c2cSubmissionPackages)
      .values({
        packageId,
        orgId,
        projectId,
        packageFamily,
        title,
        description,
        targetDate: targetDate ? new Date(targetDate) : null,
        createdById: userId,
      })
      .returning();

    // Auto-create sections if provided
    if (Array.isArray(sections)) {
      for (let i = 0; i < sections.length; i++) {
        const sec = sections[i];
        await db.insert(c2cPackageSections).values({
          sectionId: `sec_${randomUUID()}`,
          orgId,
          packageDbId: pkg.id,
          sectionKey: sec.key,
          sectionLabel: sec.label,
          sortOrder: i,
        });
      }
    }

    res.status(201).json({ data: pkg });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/packages/:packageId', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const [pkg] = await db
      .select()
      .from(c2cSubmissionPackages)
      .where(
        and(
          eq(c2cSubmissionPackages.packageId, req.params.packageId),
          eq(c2cSubmissionPackages.orgId, orgId)
        )
      );

    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const sections = await db
      .select()
      .from(c2cPackageSections)
      .where(eq(c2cPackageSections.packageDbId, pkg.id))
      .orderBy(asc(c2cPackageSections.sortOrder));

    res.json({ data: { ...pkg, sections } });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// SECTIONS
// ============================================================

router.get('/packages/:packageId/sections', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const [pkg] = await db
      .select()
      .from(c2cSubmissionPackages)
      .where(
        and(
          eq(c2cSubmissionPackages.packageId, req.params.packageId),
          eq(c2cSubmissionPackages.orgId, orgId)
        )
      );

    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const sections = await db
      .select()
      .from(c2cPackageSections)
      .where(eq(c2cPackageSections.packageDbId, pkg.id))
      .orderBy(asc(c2cPackageSections.sortOrder));

    res.json({ data: sections });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// ARTIFACT-SECTION MAPPING
// ============================================================

router.post('/artifact-section-map', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const {
      artifactId,
      sectionDbId,
      documentFamily,
      ownerUserId,
      ownerRole,
      ownerFunction,
      ownershipType,
    } = req.body;

    if (!artifactId || !sectionDbId) {
      return res.status(400).json({ error: 'artifactId and sectionDbId required' });
    }

    const [mapping] = await db
      .insert(c2cArtifactSectionMap)
      .values({
        orgId,
        artifactId,
        sectionDbId,
        documentFamily,
        ownerUserId,
        ownerRole,
        ownerFunction,
        ownershipType,
      })
      .returning();

    res.status(201).json({ data: mapping });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/sections/:sectionDbId/artifacts', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const sectionDbId = Number(req.params.sectionDbId);

    const mappings = await db
      .select({
        mapping: c2cArtifactSectionMap,
        artifact: concept2cureArtifacts,
      })
      .from(c2cArtifactSectionMap)
      .innerJoin(
        concept2cureArtifacts,
        eq(concept2cureArtifacts.id, c2cArtifactSectionMap.artifactId)
      )
      .where(
        and(
          eq(c2cArtifactSectionMap.sectionDbId, sectionDbId),
          eq(c2cArtifactSectionMap.orgId, orgId)
        )
      );

    res.json({
      data: mappings.map(m => ({
        ...m.mapping,
        artifact: {
          id: m.artifact.id,
          artifactId: m.artifact.artifactId,
          title: m.artifact.title,
          status: m.artifact.status,
          version: m.artifact.version,
          ctdSection: m.artifact.ctdSection,
        },
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// MILESTONES
// ============================================================

router.get('/packages/:packageId/milestones', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const [pkg] = await db
      .select()
      .from(c2cSubmissionPackages)
      .where(
        and(
          eq(c2cSubmissionPackages.packageId, req.params.packageId),
          eq(c2cSubmissionPackages.orgId, orgId)
        )
      );

    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const milestones = await db
      .select()
      .from(c2cMilestones)
      .where(eq(c2cMilestones.packageDbId, pkg.id))
      .orderBy(asc(c2cMilestones.sortOrder));

    // Attach sections for each milestone
    const result = await Promise.all(
      milestones.map(async (m: any) => {
        const sections = await db
          .select({
            sectionDbId: c2cMilestoneSections.sectionDbId,
            required: c2cMilestoneSections.required,
            sectionLabel: c2cPackageSections.sectionLabel,
            sectionKey: c2cPackageSections.sectionKey,
          })
          .from(c2cMilestoneSections)
          .innerJoin(
            c2cPackageSections,
            eq(c2cPackageSections.id, c2cMilestoneSections.sectionDbId)
          )
          .where(eq(c2cMilestoneSections.milestoneDbId, m.id));

        return { ...m, sections };
      })
    );

    res.json({ data: result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/packages/:packageId/milestones', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const [pkg] = await db
      .select()
      .from(c2cSubmissionPackages)
      .where(
        and(
          eq(c2cSubmissionPackages.packageId, req.params.packageId),
          eq(c2cSubmissionPackages.orgId, orgId)
        )
      );

    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const { title, description, targetDate, sectionIds } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });

    const [milestone] = await db
      .insert(c2cMilestones)
      .values({
        milestoneId: `ms_${randomUUID()}`,
        orgId,
        packageDbId: pkg.id,
        title,
        description,
        targetDate: targetDate ? new Date(targetDate) : null,
        createdById: userId,
      })
      .returning();

    // Link sections
    if (Array.isArray(sectionIds)) {
      for (const sId of sectionIds) {
        await db.insert(c2cMilestoneSections).values({
          milestoneDbId: milestone.id,
          sectionDbId: sId,
        });
      }
    }

    res.status(201).json({ data: milestone });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// POLICIES
// ============================================================

router.get('/policies', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const policies = await db
      .select()
      .from(c2cSubmissionPolicies)
      .where(eq(c2cSubmissionPolicies.orgId, orgId))
      .orderBy(desc(c2cSubmissionPolicies.priority));

    res.json({ data: policies });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/policies', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const {
      packageFamily,
      sectionKey,
      documentFamily,
      ownerFunction,
      reviewerClass,
      ownershipType,
      reviewDueHours,
      dueSoonThresholdHours,
      overdueThresholdHours,
      escalationThresholdHours,
      fallbackRole,
      requiredReviewerClasses,
      requiredApprovals,
      blockOnOpenCritical,
      blockPublishOnOpenCritical,
      requireSectionReadyForGate,
      ruleDescription,
      priority,
    } = req.body;

    const [policy] = await db
      .insert(c2cSubmissionPolicies)
      .values({
        policyId: `pol_${randomUUID()}`,
        orgId,
        packageFamily: packageFamily || null,
        sectionKey: sectionKey || null,
        documentFamily: documentFamily || null,
        ownerFunction: ownerFunction || null,
        reviewerClass: reviewerClass || null,
        ownershipType: ownershipType || null,
        reviewDueHours: reviewDueHours ?? null,
        dueSoonThresholdHours: dueSoonThresholdHours ?? null,
        overdueThresholdHours: overdueThresholdHours ?? null,
        escalationThresholdHours: escalationThresholdHours ?? null,
        fallbackRole: fallbackRole || null,
        requiredReviewerClasses: requiredReviewerClasses || null,
        requiredApprovals: requiredApprovals || null,
        blockOnOpenCritical: blockOnOpenCritical ?? true,
        blockPublishOnOpenCritical: blockPublishOnOpenCritical ?? true,
        requireSectionReadyForGate: requireSectionReadyForGate ?? true,
        ruleDescription: ruleDescription || null,
        priority: priority ?? 0,
        createdById: userId,
      })
      .returning();

    res.status(201).json({ data: policy });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/policies/:policyId', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const { ...updates } = req.body;

    const [updated] = await db
      .update(c2cSubmissionPolicies)
      .set({ ...updates, updatedAt: new Date() })
      .where(
        and(
          eq(c2cSubmissionPolicies.policyId, req.params.policyId),
          eq(c2cSubmissionPolicies.orgId, orgId)
        )
      )
      .returning();

    if (!updated) return res.status(404).json({ error: 'Policy not found' });
    res.json({ data: updated });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/policies/:policyId', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const [deleted] = await db
      .delete(c2cSubmissionPolicies)
      .where(
        and(
          eq(c2cSubmissionPolicies.policyId, req.params.policyId),
          eq(c2cSubmissionPolicies.orgId, orgId)
        )
      )
      .returning();

    if (!deleted) return res.status(404).json({ error: 'Policy not found' });
    res.json({ data: { deleted: true } });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/policies/resolve', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const ctx = { orgId, ...req.body };
    const resolved = await resolvePolicy(ctx);
    const all = await resolveAllPolicies(ctx);
    res.json({ data: { resolved, allMatching: all } });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// READINESS
// ============================================================

router.get('/packages/:packageId/readiness', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const [pkg] = await db
      .select()
      .from(c2cSubmissionPackages)
      .where(
        and(
          eq(c2cSubmissionPackages.packageId, req.params.packageId),
          eq(c2cSubmissionPackages.orgId, orgId)
        )
      );

    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const readiness = await computePackageReadiness(orgId, pkg.id);
    res.json({ data: readiness });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/packages/:packageId/readiness-history', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const [pkg] = await db
      .select()
      .from(c2cSubmissionPackages)
      .where(
        and(
          eq(c2cSubmissionPackages.packageId, req.params.packageId),
          eq(c2cSubmissionPackages.orgId, orgId)
        )
      );

    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const snapshots = await db
      .select()
      .from(c2cReadinessSnapshots)
      .where(
        and(eq(c2cReadinessSnapshots.packageDbId, pkg.id), eq(c2cReadinessSnapshots.orgId, orgId))
      )
      .orderBy(desc(c2cReadinessSnapshots.computedAt))
      .limit(limit);

    res.json({ data: snapshots });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// BLOCKERS
// ============================================================

router.get('/blockers', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const { projectId, packageId, status, severity, blockerType, ownerFunction, ownershipType } =
      req.query;

    const conditions = [eq(c2cBlockers.orgId, orgId)];
    if (projectId) conditions.push(eq(c2cBlockers.projectId, Number(projectId)));
    if (status) conditions.push(eq(c2cBlockers.status, status as string));
    else conditions.push(eq(c2cBlockers.status, 'open'));
    if (severity) conditions.push(eq(c2cBlockers.severity, severity as string));
    if (blockerType) conditions.push(eq(c2cBlockers.blockerType, blockerType as string));
    if (ownerFunction) conditions.push(eq(c2cBlockers.ownerFunction, ownerFunction as string));
    if (ownershipType) conditions.push(eq(c2cBlockers.ownershipType, ownershipType as string));

    // If packageId filter, resolve to db id
    if (packageId) {
      const [pkg] = await db
        .select({ id: c2cSubmissionPackages.id })
        .from(c2cSubmissionPackages)
        .where(
          and(
            eq(c2cSubmissionPackages.packageId, packageId as string),
            eq(c2cSubmissionPackages.orgId, orgId)
          )
        );
      if (pkg) conditions.push(eq(c2cBlockers.packageDbId, pkg.id));
    }

    const blockers = await db
      .select()
      .from(c2cBlockers)
      .where(and(...conditions))
      .orderBy(
        sql`CASE ${c2cBlockers.severity}
          WHEN 'critical' THEN 4 WHEN 'high' THEN 3
          WHEN 'medium' THEN 2 WHEN 'low' THEN 1
          ELSE 0 END DESC`,
        desc(c2cBlockers.createdAt)
      );

    res.json({ data: blockers });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/blockers/:blockerId', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const { status, nextAction, resolvedById } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (status) updates.status = status;
    if (nextAction !== undefined) updates.nextAction = nextAction;
    if (status === 'resolved') {
      updates.resolvedAt = new Date();
      updates.resolvedById = resolvedById || getUserId(req);
    }

    const [updated] = await db
      .update(c2cBlockers)
      .set(updates)
      .where(and(eq(c2cBlockers.blockerId, req.params.blockerId), eq(c2cBlockers.orgId, orgId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Blocker not found' });
    res.json({ data: updated });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// APPROVAL BOTTLENECKS
// ============================================================

router.get('/approval-bottlenecks', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;

    const conditions = [
      eq(concept2cureReviewAssignments.organizationId, orgId),
      eq(concept2cureReviewAssignments.status, 'pending'),
    ];

    const pendingAssignments = await db
      .select({
        assignment: concept2cureReviewAssignments,
        artifactTitle: concept2cureArtifacts.title,
        artifactStatus: concept2cureArtifacts.status,
        artifactId: concept2cureArtifacts.artifactId,
        approvedVersionId: concept2cureArtifacts.approvedVersionId,
        publishedVersionId: concept2cureArtifacts.publishedVersionId,
      })
      .from(concept2cureReviewAssignments)
      .innerJoin(
        concept2cureArtifacts,
        eq(concept2cureArtifacts.id, concept2cureReviewAssignments.artifactId)
      )
      .where(and(...conditions))
      .orderBy(asc(concept2cureReviewAssignments.dueDate));

    const now = new Date();
    const bottlenecks = pendingAssignments.map((pa: any) => {
      const waitingMs = now.getTime() - new Date(pa.assignment.createdAt).getTime();
      const waitingHours = Math.round(waitingMs / (1000 * 60 * 60));

      return {
        assignmentId: pa.assignment.assignmentId,
        artifactId: pa.artifactId,
        artifactTitle: pa.artifactTitle,
        artifactStatus: pa.artifactStatus,
        reviewerId: pa.assignment.reviewerId,
        reviewRound: pa.assignment.reviewRound,
        dueDate: pa.assignment.dueDate,
        waitingHours,
        hasApprovedVersion: !!pa.approvedVersionId,
        publishBlocked: pa.artifactStatus === 'approved' && !pa.publishedVersionId,
      };
    });

    res.json({ data: bottlenecks });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// OWNERSHIP / WORKLOAD
// ============================================================

router.get('/workload', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;
    const now = new Date();

    // Count open tasks by assignee
    const taskLoad = await db
      .select({
        assignedToId: concept2cureReviewTasks.assignedToId,
        assignedToName: concept2cureReviewTasks.assignedToName,
        totalTasks: count(),
      })
      .from(concept2cureReviewTasks)
      .where(
        and(
          eq(concept2cureReviewTasks.orgId, orgId),
          inArray(concept2cureReviewTasks.status, ['open', 'in_progress']),
          ...(projectId ? [eq(concept2cureReviewTasks.projectId, projectId)] : [])
        )
      )
      .groupBy(concept2cureReviewTasks.assignedToId, concept2cureReviewTasks.assignedToName);

    // Count overdue tasks by assignee
    const overdueLoad = await db
      .select({
        assignedToId: concept2cureReviewTasks.assignedToId,
        overdueCount: count(),
      })
      .from(concept2cureReviewTasks)
      .where(
        and(
          eq(concept2cureReviewTasks.orgId, orgId),
          inArray(concept2cureReviewTasks.status, ['open', 'in_progress']),
          sql`${concept2cureReviewTasks.dueAt} < ${now}`,
          ...(projectId ? [eq(concept2cureReviewTasks.projectId, projectId)] : [])
        )
      )
      .groupBy(concept2cureReviewTasks.assignedToId);

    // Count pending reviews by reviewer
    const reviewLoad = await db
      .select({
        reviewerId: concept2cureReviewAssignments.reviewerId,
        pendingReviews: count(),
      })
      .from(concept2cureReviewAssignments)
      .where(
        and(
          eq(concept2cureReviewAssignments.organizationId, orgId),
          eq(concept2cureReviewAssignments.status, 'pending')
        )
      )
      .groupBy(concept2cureReviewAssignments.reviewerId);

    // Merge into workload by person
    const workloadMap = new Map<number, any>();
    for (const t of taskLoad) {
      if (!t.assignedToId) continue;
      workloadMap.set(t.assignedToId, {
        userId: t.assignedToId,
        name: t.assignedToName,
        openTasks: t.totalTasks,
        overdueTasks: 0,
        pendingReviews: 0,
      });
    }
    for (const o of overdueLoad) {
      if (!o.assignedToId) continue;
      const entry = workloadMap.get(o.assignedToId) || {
        userId: o.assignedToId,
        name: '',
        openTasks: 0,
        overdueTasks: 0,
        pendingReviews: 0,
      };
      entry.overdueTasks = o.overdueCount;
      workloadMap.set(o.assignedToId, entry);
    }
    for (const r of reviewLoad) {
      const entry = workloadMap.get(r.reviewerId) || {
        userId: r.reviewerId,
        name: '',
        openTasks: 0,
        overdueTasks: 0,
        pendingReviews: 0,
      };
      entry.pendingReviews = r.pendingReviews;
      workloadMap.set(r.reviewerId, entry);
    }

    res.json({ data: Array.from(workloadMap.values()) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// HOTSPOT / DENSITY
// ============================================================

router.get('/hotspots', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const packageId = req.query.packageId as string;

    if (!packageId) return res.status(400).json({ error: 'packageId required' });

    const [pkg] = await db
      .select()
      .from(c2cSubmissionPackages)
      .where(
        and(eq(c2cSubmissionPackages.packageId, packageId), eq(c2cSubmissionPackages.orgId, orgId))
      );

    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    // Get sections with blocker counts
    const sections = await db
      .select()
      .from(c2cPackageSections)
      .where(eq(c2cPackageSections.packageDbId, pkg.id))
      .orderBy(asc(c2cPackageSections.sortOrder));

    const hotspots = await Promise.all(
      sections.map(async (section: any) => {
        const [blockerCount] = await db
          .select({ count: count() })
          .from(c2cBlockers)
          .where(
            and(
              eq(c2cBlockers.orgId, orgId),
              eq(c2cBlockers.sectionDbId, section.id),
              eq(c2cBlockers.status, 'open')
            )
          );

        const [criticalCount] = await db
          .select({ count: count() })
          .from(c2cBlockers)
          .where(
            and(
              eq(c2cBlockers.orgId, orgId),
              eq(c2cBlockers.sectionDbId, section.id),
              eq(c2cBlockers.status, 'open'),
              inArray(c2cBlockers.severity, ['high', 'critical'])
            )
          );

        return {
          sectionId: section.sectionId,
          sectionKey: section.sectionKey,
          sectionLabel: section.sectionLabel,
          totalBlockers: blockerCount?.count ?? 0,
          criticalBlockers: criticalCount?.count ?? 0,
          heatLevel:
            (criticalCount?.count ?? 0) > 0
              ? 'critical'
              : (blockerCount?.count ?? 0) > 2
                ? 'high'
                : (blockerCount?.count ?? 0) > 0
                  ? 'medium'
                  : 'none',
        };
      })
    );

    res.json({ data: hotspots });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// AUTOMATION
// ============================================================

router.post('/automation/run', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const { projectId, packageDbId } = req.body;

    if (!projectId || !packageDbId) {
      return res.status(400).json({ error: 'projectId and packageDbId required' });
    }

    const result = await runAutomationSweep(orgId, projectId, packageDbId);
    res.json({ data: result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/automation/runs', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;

    const conditions = [eq(c2cAutomationRuns.orgId, orgId)];
    if (projectId) conditions.push(eq(c2cAutomationRuns.projectId, projectId));

    const runs = await db
      .select()
      .from(c2cAutomationRuns)
      .where(and(...conditions))
      .orderBy(desc(c2cAutomationRuns.startedAt))
      .limit(50);

    res.json({ data: runs });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/automation/runs/:runId/actions', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const [run] = await db
      .select()
      .from(c2cAutomationRuns)
      .where(
        and(eq(c2cAutomationRuns.runId, req.params.runId), eq(c2cAutomationRuns.orgId, orgId))
      );

    if (!run) return res.status(404).json({ error: 'Run not found' });

    const actions = await db
      .select()
      .from(c2cAutomationActions)
      .where(eq(c2cAutomationActions.runId, run.id))
      .orderBy(asc(c2cAutomationActions.createdAt));

    res.json({ data: actions });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// DUE SOON / TIMELINE
// ============================================================

router.get('/due-soon', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;
    const now = new Date();

    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const next48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const next7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Threads due soon
    const threadConditions = [
      eq(concept2cureReviewThreads.orgId, orgId),
      eq(concept2cureReviewThreads.status, 'open'),
      sql`${concept2cureReviewThreads.dueAt} <= ${next7d}`,
    ];
    if (projectId) threadConditions.push(eq(concept2cureReviewThreads.projectId, projectId));

    const dueThreads = await db
      .select()
      .from(concept2cureReviewThreads)
      .where(and(...threadConditions))
      .orderBy(asc(concept2cureReviewThreads.dueAt));

    // Tasks due soon
    const taskConditions = [
      eq(concept2cureReviewTasks.orgId, orgId),
      inArray(concept2cureReviewTasks.status, ['open', 'in_progress']),
      sql`${concept2cureReviewTasks.dueAt} <= ${next7d}`,
    ];
    if (projectId) taskConditions.push(eq(concept2cureReviewTasks.projectId, projectId));

    const dueTasks = await db
      .select()
      .from(concept2cureReviewTasks)
      .where(and(...taskConditions))
      .orderBy(asc(concept2cureReviewTasks.dueAt));

    // Pending reviews due soon
    const reviewConditions = [
      eq(concept2cureReviewAssignments.organizationId, orgId),
      eq(concept2cureReviewAssignments.status, 'pending'),
      sql`${concept2cureReviewAssignments.dueDate} <= ${next7d}`,
    ];

    const dueReviews = await db
      .select()
      .from(concept2cureReviewAssignments)
      .where(and(...reviewConditions))
      .orderBy(asc(concept2cureReviewAssignments.dueDate));

    // Categorize into buckets
    const categorize = (dueAt: Date | null) => {
      if (!dueAt) return '7d';
      if (dueAt < now) return 'overdue';
      if (dueAt <= next24h) return '24h';
      if (dueAt <= next48h) return '48h';
      return '7d';
    };

    res.json({
      data: {
        threads: dueThreads.map((t: any) => ({ ...t, bucket: categorize(t.dueAt) })),
        tasks: dueTasks.map((t: any) => ({ ...t, bucket: categorize(t.dueAt) })),
        reviews: dueReviews.map(r => ({ ...r, bucket: categorize(r.dueDate) })),
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// DIGESTS
// ============================================================

router.get('/digests', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { projectId, digestType } = req.query;

    const conditions = [eq(c2cDigests.orgId, orgId)];
    if (projectId) conditions.push(eq(c2cDigests.projectId, Number(projectId)));
    if (digestType) conditions.push(eq(c2cDigests.digestType, digestType as string));
    if (userId) conditions.push(eq(c2cDigests.recipientUserId, userId));

    const digests = await db
      .select()
      .from(c2cDigests)
      .where(and(...conditions))
      .orderBy(desc(c2cDigests.generatedAt))
      .limit(20);

    res.json({ data: digests });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/digests/:digestId/read', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const [updated] = await db
      .update(c2cDigests)
      .set({ status: 'read', readAt: new Date() })
      .where(and(eq(c2cDigests.digestId, req.params.digestId), eq(c2cDigests.orgId, orgId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Digest not found' });
    res.json({ data: updated });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// COMMAND CENTER AGGREGATE
// ============================================================

router.get('/command-center', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;

    if (!projectId) return res.status(400).json({ error: 'projectId required' });

    // Get all packages for project
    const packages = await db
      .select()
      .from(c2cSubmissionPackages)
      .where(
        and(eq(c2cSubmissionPackages.orgId, orgId), eq(c2cSubmissionPackages.projectId, projectId))
      );

    // For each package, get latest readiness snapshot
    const packageSummaries = await Promise.all(
      packages.map(async pkg => {
        const [latestSnapshot] = await db
          .select()
          .from(c2cReadinessSnapshots)
          .where(
            and(
              eq(c2cReadinessSnapshots.packageDbId, pkg.id),
              eq(c2cReadinessSnapshots.orgId, orgId),
              isNull(c2cReadinessSnapshots.sectionDbId)
            )
          )
          .orderBy(desc(c2cReadinessSnapshots.computedAt))
          .limit(1);

        const [blockerCount] = await db
          .select({ count: count() })
          .from(c2cBlockers)
          .where(
            and(
              eq(c2cBlockers.packageDbId, pkg.id),
              eq(c2cBlockers.orgId, orgId),
              eq(c2cBlockers.status, 'open')
            )
          );

        const [latestRun] = await db
          .select()
          .from(c2cAutomationRuns)
          .where(and(eq(c2cAutomationRuns.packageDbId, pkg.id), eq(c2cAutomationRuns.orgId, orgId)))
          .orderBy(desc(c2cAutomationRuns.startedAt))
          .limit(1);

        return {
          ...pkg,
          readiness: latestSnapshot
            ? {
                readinessPercent: latestSnapshot.readinessPercent,
                overallState: latestSnapshot.overallState,
                trend: latestSnapshot.trend,
                openThreads: latestSnapshot.openThreads,
                openTasks: latestSnapshot.openTasks,
                overdueItems: latestSnapshot.overdueItems,
                missingApprovals: latestSnapshot.missingApprovals,
                openCriticalFindings: latestSnapshot.openCriticalFindings,
                computedAt: latestSnapshot.computedAt,
              }
            : null,
          openBlockers: blockerCount?.count ?? 0,
          lastAutomationRun: latestRun
            ? {
                runId: latestRun.runId,
                status: latestRun.status,
                startedAt: latestRun.startedAt,
                actionsCreated: latestRun.actionsCreated,
              }
            : null,
        };
      })
    );

    // Get overall project-level counters
    const [projectBlockerCount] = await db
      .select({ count: count() })
      .from(c2cBlockers)
      .where(
        and(
          eq(c2cBlockers.orgId, orgId),
          eq(c2cBlockers.projectId, projectId),
          eq(c2cBlockers.status, 'open')
        )
      );

    const now = new Date();
    const [overdueCount] = await db
      .select({ count: count() })
      .from(concept2cureReviewTasks)
      .where(
        and(
          eq(concept2cureReviewTasks.orgId, orgId),
          eq(concept2cureReviewTasks.projectId, projectId),
          inArray(concept2cureReviewTasks.status, ['open', 'in_progress']),
          sql`${concept2cureReviewTasks.dueAt} < ${now}`
        )
      );

    res.json({
      data: {
        projectId,
        packages: packageSummaries,
        totalOpenBlockers: projectBlockerCount?.count ?? 0,
        totalOverdue: overdueCount?.count ?? 0,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// PACKAGE PUBLISH / LOCK (CRITICAL SAFETY GATE)
// ============================================================

/**
 * POST /api/submission-ops/packages/:packageId/publish
 *
 * Locks a submission package for regulatory export.
 * SAFETY GATES:
 * 1. All critical/high blockers must be resolved
 * 2. Readiness score must meet threshold
 * 3. Requires explicit confirmation header
 * 4. Creates audit trail entry
 */
router.post('/packages/:packageId/publish', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);

    // Gate 1: Require explicit confirmation header
    const confirmation = req.headers['x-confirm-publish'] as string;
    if (confirmation !== 'confirmed') {
      return res.status(400).json({
        error: 'Publication requires explicit confirmation',
        hint: 'Set header x-confirm-publish: confirmed',
        gate: 'confirmation',
      });
    }

    // Resolve package
    const [pkg] = await db
      .select()
      .from(c2cSubmissionPackages)
      .where(
        and(
          eq(c2cSubmissionPackages.packageId, req.params.packageId),
          eq(c2cSubmissionPackages.orgId, orgId)
        )
      );

    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    // Gate 2: Check for open critical/high blockers
    const [criticalBlockers] = await db
      .select({ count: count() })
      .from(c2cBlockers)
      .where(
        and(
          eq(c2cBlockers.packageDbId, pkg.id),
          eq(c2cBlockers.orgId, orgId),
          eq(c2cBlockers.status, 'open'),
          inArray(c2cBlockers.severity, ['critical', 'high'])
        )
      );

    if ((criticalBlockers?.count ?? 0) > 0) {
      return res.status(409).json({
        error: `Cannot publish: ${criticalBlockers.count} critical/high blocker(s) remain open`,
        gate: 'blockers',
        openBlockers: criticalBlockers.count,
      });
    }

    // Gate 3: Check readiness (compute fresh)
    const readiness = await computePackageReadiness(db, pkg.id, orgId);
    const readinessThreshold = 80;

    if (readiness.overallScore < readinessThreshold) {
      return res.status(409).json({
        error: `Package readiness score ${readiness.overallScore}% is below the ${readinessThreshold}% threshold`,
        gate: 'readiness',
        readinessScore: readiness.overallScore,
        threshold: readinessThreshold,
        details: readiness,
      });
    }

    // All gates passed — lock the package
    const [updated] = await db
      .update(c2cSubmissionPackages)
      .set({
        status: 'locked',
        updatedAt: new Date(),
      })
      .where(eq(c2cSubmissionPackages.id, pkg.id))
      .returning();

    // Create audit trail snapshot
    await db.insert(c2cReadinessSnapshots).values({
      snapshotId: `snap_${randomUUID()}`,
      orgId,
      packageDbId: pkg.id,
      overallScore: readiness.overallScore,
      sectionScores: readiness.sectionScores || {},
      computedAt: new Date(),
      computedById: userId,
    });

    res.json({
      success: true,
      message: 'Package locked for submission',
      data: updated,
      readiness,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
