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
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { db, pool } from '../db';
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
import { getProjectSignals, analyzeCrossArtifactIntelligence } from '../services/intelligence/index.js';
import { readCanonicalDueSoonAndWorkload } from '../services/regulatory-correspondence/operating-layer';
import { buildECTDZip } from '../src/services/ectd';
import { recordGovernedAction } from './c2c/actions';
import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import {
  renderMarkdownToPDF,
  mapSectionToECTDPath,
} from '../services/documentExportService';
import {
  isBundleStorageEnabled,
  bundleStorageBucket,
  bundleStorageKey,
  putBundle,
} from '../services/submission-bundle-storage';
import { validateEctdLeafs } from '../services/submission-gateways/ectd-structural-validator';

const router = Router();

// Middleware: extract orgId from auth context
function getOrgId(req: Request): number {
  const orgId = (req as any).organizationId ?? (req as any).user?.organizationId;
  if (!orgId) throw new Error('Organization context required');
  return orgId;
}

function getUserId(req: Request): number {
  const userId = (req as any).user?.id ?? (req as any).userId;
  if (!userId || userId <= 0) throw new Error('Authenticated user context required');
  return userId;
}

// ============================================================
// ZOD VALIDATION SCHEMAS
// ============================================================

const createPackageSchema = z.object({
  projectId: z.number({ required_error: 'projectId is required' }),
  packageFamily: z.string({ required_error: 'packageFamily is required' }).min(1, 'packageFamily must not be empty'),
  title: z.string({ required_error: 'title is required' }).min(1, 'title must not be empty'),
  description: z.string().optional(),
  targetDate: z.string().optional(),
  sections: z.array(z.object({
    key: z.string(),
    label: z.string(),
  })).optional(),
});

const createArtifactSectionMapSchema = z.object({
  artifactId: z.number({ required_error: 'artifactId is required' }),
  sectionDbId: z.number({ required_error: 'sectionDbId is required' }),
  documentFamily: z.string().optional(),
  ownerUserId: z.number().optional(),
  ownerRole: z.string().optional(),
  ownerFunction: z.string().optional(),
  ownershipType: z.string().optional(),
});

const createMilestoneSchema = z.object({
  title: z.string({ required_error: 'title is required' }).min(1, 'title must not be empty'),
  description: z.string().optional(),
  targetDate: z.string().optional(),
  sectionIds: z.array(z.number()).optional(),
});

const createPolicySchema = z.object({
  packageFamily: z.string().nullish(),
  sectionKey: z.string().nullish(),
  documentFamily: z.string().nullish(),
  ownerFunction: z.string().nullish(),
  reviewerClass: z.string().nullish(),
  ownershipType: z.string().nullish(),
  reviewDueHours: z.number().nullish(),
  dueSoonThresholdHours: z.number().nullish(),
  overdueThresholdHours: z.number().nullish(),
  escalationThresholdHours: z.number().nullish(),
  fallbackRole: z.string().nullish(),
  requiredReviewerClasses: z.any().nullish(),
  requiredApprovals: z.number().nullish(),
  blockOnOpenCritical: z.boolean().optional().default(true),
  blockPublishOnOpenCritical: z.boolean().optional().default(true),
  requireSectionReadyForGate: z.boolean().optional().default(true),
  ruleDescription: z.string().nullish(),
  priority: z.number().optional().default(0),
});

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
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

router.post('/packages', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);

    const parsed = createPackageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    }
    const { projectId, packageFamily, title, description, targetDate, sections } = parsed.data;

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
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
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
          eq(c2cSubmissionPackages.packageId, String(req.params.packageId)),
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
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
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
          eq(c2cSubmissionPackages.packageId, String(req.params.packageId)),
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
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

// ============================================================
// ARTIFACT-SECTION MAPPING
// ============================================================

router.post('/artifact-section-map', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const actorUserId = getUserId(req);

    const parsed = createArtifactSectionMapSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    }
    const {
      artifactId,
      sectionDbId,
      documentFamily,
      ownerUserId,
      ownerRole,
      ownerFunction,
      ownershipType,
    } = parsed.data;

    const [artifact] = await db
      .select({
        id: concept2cureArtifacts.id,
        projectId: concept2cureArtifacts.projectId,
      })
      .from(concept2cureArtifacts)
      .where(and(eq(concept2cureArtifacts.id, artifactId), eq(concept2cureArtifacts.organizationId, orgId)));
    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found for organization' });
    }

    const [section] = await db
      .select({
        id: c2cPackageSections.id,
        packageDbId: c2cPackageSections.packageDbId,
      })
      .from(c2cPackageSections)
      .innerJoin(
        c2cSubmissionPackages,
        and(
          eq(c2cSubmissionPackages.id, c2cPackageSections.packageDbId),
          eq(c2cSubmissionPackages.orgId, orgId)
        )
      )
      .where(eq(c2cPackageSections.id, sectionDbId));
    if (!section) {
      return res.status(404).json({ error: 'Section not found for organization' });
    }

    const [pkg] = await db
      .select({
        id: c2cSubmissionPackages.id,
        projectId: c2cSubmissionPackages.projectId,
      })
      .from(c2cSubmissionPackages)
      .where(and(eq(c2cSubmissionPackages.id, section.packageDbId), eq(c2cSubmissionPackages.orgId, orgId)));
    if (!pkg) {
      return res.status(404).json({ error: 'Package not found for section' });
    }

    if (artifact.projectId !== pkg.projectId) {
      return res
        .status(400)
        .json({ error: 'Artifact and target section package must belong to the same project' });
    }

    const [mapping] = await db
      .insert(c2cArtifactSectionMap)
      .values({
        orgId,
        artifactId,
        sectionDbId,
        documentFamily,
        ownerUserId: ownerUserId || actorUserId || null,
        ownerRole,
        ownerFunction,
        ownershipType,
      })
      .returning();

    res.status(201).json({ data: mapping });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
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
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
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
          eq(c2cSubmissionPackages.packageId, String(req.params.packageId)),
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
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
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
          eq(c2cSubmissionPackages.packageId, String(req.params.packageId)),
          eq(c2cSubmissionPackages.orgId, orgId)
        )
      );

    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const parsed = createMilestoneSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    }
    const { title, description, targetDate, sectionIds } = parsed.data;

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
        const [section] = await db
          .select({ id: c2cPackageSections.id })
          .from(c2cPackageSections)
          .where(and(eq(c2cPackageSections.id, sId), eq(c2cPackageSections.packageDbId, pkg.id)));
        if (!section) {
          return res
            .status(400)
            .json({ error: `sectionId ${sId} does not belong to package ${(String(req.params.packageId ?? ""))}` });
        }
        await db.insert(c2cMilestoneSections).values({
          milestoneDbId: milestone.id,
          sectionDbId: sId,
        });
      }
    }

    res.status(201).json({ data: milestone });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
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
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

router.post('/policies', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);

    const parsed = createPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    }
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
    } = parsed.data;

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
        blockOnOpenCritical,
        blockPublishOnOpenCritical,
        requireSectionReadyForGate,
        ruleDescription: ruleDescription || null,
        priority,
        createdById: userId,
      })
      .returning();

    res.status(201).json({ data: policy });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

router.put('/policies/:policyId', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    // SECURITY: Whitelist allowed update fields to prevent field injection
    const {
      packageFamily, sectionKey, documentFamily, ownerFunction, reviewerClass,
      ownershipType, reviewDueHours, dueSoonThresholdHours, overdueThresholdHours,
      escalationThresholdHours, fallbackRole, requiredReviewerClasses, requiredApprovals,
      blockOnOpenCritical, blockPublishOnOpenCritical, requireSectionReadyForGate,
      ruleDescription, priority, enabled,
    } = req.body;
    const updates = Object.fromEntries(
      Object.entries({
        packageFamily, sectionKey, documentFamily, ownerFunction, reviewerClass,
        ownershipType, reviewDueHours, dueSoonThresholdHours, overdueThresholdHours,
        escalationThresholdHours, fallbackRole, requiredReviewerClasses, requiredApprovals,
        blockOnOpenCritical, blockPublishOnOpenCritical, requireSectionReadyForGate,
        ruleDescription, priority, enabled,
      }).filter(([, v]) => v !== undefined)
    );

    const [updated] = await db
      .update(c2cSubmissionPolicies)
      .set({ ...updates, updatedAt: new Date() })
      .where(
        and(
          eq(c2cSubmissionPolicies.policyId, String(req.params.policyId)),
          eq(c2cSubmissionPolicies.orgId, orgId)
        )
      )
      .returning();

    if (!updated) return res.status(404).json({ error: 'Policy not found' });
    res.json({ data: updated });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

router.delete('/policies/:policyId', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const [deleted] = await db
      .delete(c2cSubmissionPolicies)
      .where(
        and(
          eq(c2cSubmissionPolicies.policyId, String(req.params.policyId)),
          eq(c2cSubmissionPolicies.orgId, orgId)
        )
      )
      .returning();

    if (!deleted) return res.status(404).json({ error: 'Policy not found' });
    res.json({ data: { deleted: true } });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

router.post('/policies/resolve', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const ctx = { orgId, ...req.body };
    const resolved = await resolvePolicy(ctx);
    const all = await resolveAllPolicies(ctx);
    res.json({ data: { resolved, allMatching: all } });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
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
          eq(c2cSubmissionPackages.packageId, String(req.params.packageId)),
          eq(c2cSubmissionPackages.orgId, orgId)
        )
      );

    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const readiness = await computePackageReadiness(orgId, pkg.id);

    // Enrich with RIM signal summary (non-blocking, best-effort)
    let rimSignals = null;
    let rimCrossArtifact = null;
    try {
      rimSignals = getProjectSignals(orgId, pkg.id);
      const crossArtifact = analyzeCrossArtifactIntelligence(orgId, pkg.id);
      if (crossArtifact.totalIssues > 0) {
        rimCrossArtifact = crossArtifact;
      }
    } catch {
      // RIM enrichment is non-critical
    }

    /* Surface a flat transmit-gate map at the root so the kit's submission
       detail hook (useSubmissionDetail) renders gate counts without having
       to peek into readiness.totalBlockers et al. The mapping:
         errs  ← totalBlockers          (hard fails — open blockers)
         warns ← totalOverdue           (soft fails — overdue items)
         ok    ← ready_artifacts share  (passed validations)
       This is the "validation gate" the user sees in the kit's submissions
       row, computed live rather than read from program.metadata.gate*. */
    const okCount = Math.max(
      0,
      Math.round(
        (readiness.overallReadinessPercent / 100) *
          readiness.sections.reduce((s, r) => s + r.totalArtifacts, 0),
      ),
    );

    res.json({
      data: readiness,
      errs:  readiness.totalBlockers,
      warns: readiness.totalOverdue,
      ok:    okCount,
      rimSignals,
      rimCrossArtifact,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
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
          eq(c2cSubmissionPackages.packageId, String(req.params.packageId)),
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
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
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
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
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
      .where(and(eq(c2cBlockers.blockerId, String(req.params.blockerId)), eq(c2cBlockers.orgId, orgId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Blocker not found' });
    res.json({ data: updated });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
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
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

// ============================================================
// OWNERSHIP / WORKLOAD
// ============================================================

router.get('/workload', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;
    const canonical = await readCanonicalDueSoonAndWorkload({ orgId, projectId });
    res.json({ data: canonical.workload, source: 'c2c_project_work_items' });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
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
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
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
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
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
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

router.get('/automation/runs/:runId/actions', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const [run] = await db
      .select()
      .from(c2cAutomationRuns)
      .where(
        and(eq(c2cAutomationRuns.runId, String(req.params.runId)), eq(c2cAutomationRuns.orgId, orgId))
      );

    if (!run) return res.status(404).json({ error: 'Run not found' });

    const actions = await db
      .select()
      .from(c2cAutomationActions)
      .where(eq(c2cAutomationActions.runId, run.id))
      .orderBy(asc(c2cAutomationActions.createdAt));

    res.json({ data: actions });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

// ============================================================
// DUE SOON / TIMELINE
// ============================================================

router.get('/due-soon', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;
    const canonical = await readCanonicalDueSoonAndWorkload({ orgId, projectId });

    res.json({
      data: {
        canonicalTasks: canonical.dueSoon,
      },
      source: 'c2c_project_work_items',
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
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
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

router.post('/digests/:digestId/read', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const [updated] = await db
      .update(c2cDigests)
      .set({ status: 'read', readAt: new Date() })
      .where(and(eq(c2cDigests.digestId, String(req.params.digestId)), eq(c2cDigests.orgId, orgId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Digest not found' });
    res.json({ data: updated });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
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

    const unresolvedCorrespondenceResult = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM c2c_correspondence_issues i
      JOIN c2c_correspondence c ON c.id = i.correspondence_id
      WHERE c.organization_id = ${orgId}
        AND c.project_id = ${projectId}
        AND i.resolution_status IN ('open','in_progress')
    `);
    const unresolvedCorrespondence =
      (unresolvedCorrespondenceResult as any).rows?.[0] ?? (unresolvedCorrespondenceResult as any)?.[0];

    res.json({
      data: {
        projectId,
        packages: packageSummaries,
        totalOpenBlockers: projectBlockerCount?.count ?? 0,
        totalOverdue: overdueCount?.count ?? 0,
        unresolvedCorrespondenceIssues: Number((unresolvedCorrespondence as any)?.count ?? 0),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
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
          eq(c2cSubmissionPackages.packageId, String(req.params.packageId)),
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
    const readiness = await computePackageReadiness(orgId, pkg.id);
    const readinessThreshold = 80;

    if (readiness.overallReadinessPercent < readinessThreshold) {
      return res.status(409).json({
        error: `Package readiness score ${readiness.overallReadinessPercent}% is below the ${readinessThreshold}% threshold`,
        gate: 'readiness',
        readinessScore: readiness.overallReadinessPercent,
        threshold: readinessThreshold,
        details: readiness,
      });
    }

    // Gate 4: unresolved critical/high correspondence issues block publish
    const unresolvedCorrespondenceGate = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM c2c_correspondence_issues i
      JOIN c2c_correspondence c ON c.id = i.correspondence_id
      WHERE c.organization_id = ${orgId}
        AND c.project_id = ${pkg.projectId}
        AND i.resolution_status IN ('open','in_progress')
        AND i.severity IN ('critical','high')
    `);
    const unresolvedCount = Number((unresolvedCorrespondenceGate.rows[0] as any)?.count ?? 0);
    if (unresolvedCount > 0) {
      return res.status(409).json({
        error: `Cannot publish: ${unresolvedCount} unresolved critical/high correspondence issue(s) remain open`,
        gate: 'correspondence_risk',
        unresolvedCount,
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
    await (db.insert(c2cReadinessSnapshots) as any).values({
      snapshotId: `snap_${randomUUID()}`,
      orgId,
      packageDbId: pkg.id,
      readinessPercent: readiness.overallReadinessPercent,
      overallState: readiness.overallState,
      computedAt: new Date(),
    });

    res.json({
      success: true,
      message: 'Package locked for submission',
      data: updated,
      readiness,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

// ============================================================
// BUNDLE ASSEMBLY
// ============================================================

/**
 * Root directory under which assembled submission bundles are persisted.
 * Configurable via SUBMISSION_BUNDLE_DIR. Defaults to a repo-/cwd-local
 * `uploads/submission-bundles` directory, matching the repo's existing
 * `uploads/` file convention (see server/pdf-processor.ts, data-importer.ts).
 */
const BUNDLE_DIR = process.env.SUBMISSION_BUNDLE_DIR
  ? path.resolve(process.env.SUBMISSION_BUNDLE_DIR)
  : path.resolve(process.cwd(), 'uploads', 'submission-bundles');

const SUBMISSION_FORMATS = ['ectd', 'estar', 'eudamed_register', 'pmda_ectd'] as const;
type SubmissionFormatTag = typeof SUBMISSION_FORMATS[number];

/**
 * Derive an eCTD region (for the backbone) and a transmit `format` tag from the
 * package family. Conservative defaults: FDA / 'ectd'. Medtech families map to
 * eSTAR / EUDAMED register; PMDA families map to pmda_ectd.
 */
function deriveRegionAndFormat(
  packageFamily: string,
): { region: 'FDA' | 'EMA' | 'PMDA'; format: SubmissionFormatTag } {
  const fam = (packageFamily || '').toLowerCase();
  if (fam.includes('estar') || fam === '510k' || fam.includes('510')) {
    return { region: 'FDA', format: 'estar' };
  }
  if (fam.includes('eudamed') || fam.includes('ivdr') || fam.includes('mdr') || fam.includes('cer')) {
    return { region: 'EMA', format: 'eudamed_register' };
  }
  if (fam.includes('pmda') || fam.includes('jnda')) {
    return { region: 'PMDA', format: 'pmda_ectd' };
  }
  return { region: 'FDA', format: 'ectd' };
}

/** Deterministic, filesystem-safe slug for a section's leaf path. */
function leafSlug(value: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'section';
}

/**
 * Best-effort ICH module (1–5) for a c2c_package_sections sectionKey. These
 * keys are semantic (e.g. `module3_cmc`, `labeling`, `cer`), not ICH-numeric,
 * so we derive the module from, in order: an explicit module-N prefix, an
 * ICH-numeric leading digit, or well-known content keywords. Returns null when
 * nothing matches (caller defaults to module 1 / regional).
 */
function moduleForSectionKey(sectionKey: string): 1 | 2 | 3 | 4 | 5 | null {
  const k = (sectionKey || '').toLowerCase();
  const prefix = k.match(/(?:^|[^a-z0-9])(?:module|mod|m)[\s_-]?([1-5])(?:[^0-9]|$)/);
  if (prefix) return Number(prefix[1]) as 1 | 2 | 3 | 4 | 5;
  const numeric = k.match(/^\s*([1-5])\./);
  if (numeric) return Number(numeric[1]) as 1 | 2 | 3 | 4 | 5;
  // Order matters: module-2 "overview/summary" before the broad clinical
  // keywords; "nonclinical" (m4) is matched before "clinical" (m5).
  if (/(cover|admin|labeling|label|user-?fee|1571|1572|3674|\bform\b|regional)/.test(k)) return 1;
  if (/(qos|quality-overall|overall-summary|overview|\bsummary\b)/.test(k)) return 2;
  if (/(cmc|quality|drug-substance|drug-product|stability|specification|manufactur)/.test(k)) return 3;
  if (/(nonclinical|pharmacolog|toxicolog|pharmacokinetic|\bpk\b|\badme\b)/.test(k)) return 4;
  if (/(clinical|efficacy|safety|\bcsr\b|\bcer\b|study-report)/.test(k)) return 5;
  return null;
}

/**
 * Map a sectionKey to an eCTD leaf path. ICH-numeric keys keep the canonical
 * documentExportService mapping; semantic keys are routed by module via
 * moduleForSectionKey. Module 1 (regional) is nested under the region code.
 */
function sectionKeyToEctdPath(sectionKey: string, regionCode: string): string {
  if (/^\s*[1-5](\.|\s*$)/.test(sectionKey || '')) {
    return mapSectionToECTDPath(sectionKey, regionCode);
  }
  const mod = moduleForSectionKey(sectionKey) ?? 1;
  const slug = leafSlug(sectionKey);
  return mod === 1 ? `m1/${regionCode}/${slug}.pdf` : `m${mod}/${slug}.pdf`;
}

/**
 * Renders a single eCTD leaf as a real PDF: a bold title line followed by the
 * section markdown rendered via the canonical pdfkit markdown renderer. Resolves
 * a `%PDF`-prefixed Buffer. Mirrors the buffer pattern in documentExportService.
 */
async function buildLeafPdf(title: string, markdown: string): Promise<Buffer> {
  const doc: any = new (PDFDocument as any)({
    size: 'A4',
    margins: { top: 72, right: 72, bottom: 72, left: 72 },
    bufferPages: true,
  });

  const chunks: Buffer[] = [];
  const bufferStream = new PassThrough();
  bufferStream.on('data', (chunk: Buffer) => chunks.push(chunk));
  doc.pipe(bufferStream);

  doc.fontSize(14).font('Helvetica-Bold').text(title);
  doc.moveDown();
  doc.fontSize(11).font('Helvetica');
  renderMarkdownToPDF(doc, markdown, 11);

  doc.end();

  return new Promise<Buffer>((resolve) => {
    bufferStream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

const assembleBody = z.object({
  // Optional explicit overrides; otherwise derived from packageFamily.
  region: z.enum(['FDA', 'EMA', 'PMDA']).optional(),
  format: z.enum(SUBMISSION_FORMATS).optional(),
  sequence: z.string().max(20).optional(),
  reason: z.string().min(8).optional(),
});

/**
 * POST /api/submission-ops/packages/:packageId/assemble
 *
 * Assembles a real eCTD zip bundle from the package's sections + their mapped
 * artifact content, persists it to disk, computes a bundle-level SHA-256, and
 * records a `bundle` descriptor on the package's metadata JSONB. The transmit
 * endpoint (mdx-submission-gateway) consumes this descriptor.
 *
 * Gating: the package MUST be `locked` (published) before assembly. This keeps
 * the bundle hash bound to a frozen package. Re-assembling overwrites (idempotent
 * per content); no confirmation header is required.
 */
router.post('/packages/:packageId/assemble', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);

    const parsed = assembleBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    }

    // Resolve package (tenant-scoped).
    const [pkg] = await db
      .select()
      .from(c2cSubmissionPackages)
      .where(
        and(
          eq(c2cSubmissionPackages.packageId, String(req.params.packageId)),
          eq(c2cSubmissionPackages.orgId, orgId),
        ),
      );

    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    // Gate: only locked (published) packages may be assembled for transmit.
    if (pkg.status !== 'locked') {
      return res.status(409).json({
        error: `Package must be locked (published) before assembly; current status: ${pkg.status}`,
        gate: 'not_locked',
        status: pkg.status,
      });
    }

    // Load sections (same query as the sections route).
    const sections = await db
      .select()
      .from(c2cPackageSections)
      .where(eq(c2cPackageSections.packageDbId, pkg.id))
      .orderBy(asc(c2cPackageSections.sortOrder));

    // Resolve region/format up front so leaf paths can be routed to the correct
    // ICH module region directory.
    const { region, format } = (() => {
      const derived = deriveRegionAndFormat(pkg.packageFamily);
      return {
        region: parsed.data.region ?? derived.region,
        format: parsed.data.format ?? derived.format,
      };
    })();
    const sequence = parsed.data.sequence ?? '0000';

    // Region code used in m1/<region>/.. leaf paths (per ICH M4 / regional M1).
    const regionCode = region === 'EMA' ? 'eu' : region === 'PMDA' ? 'jp' : 'us';

    // Build eCTD leafs from section content. Section content is sourced from the
    // artifacts mapped to each section (c2c_artifact_section_map -> concept2cure
    // artifacts.content). Each leaf is a real PDF placed at an ICH module path.
    // An empty section produces an explicitly-empty PDF leaf.
    const seenPaths = new Set<string>();
    const leafs: { path: string; mediaType: string; content: Buffer }[] = [];
    const emptyLeafPaths: string[] = [];
    let emptyLeafCount = 0;

    for (const section of sections) {
      const mapped = await db
        .select({
          artifactDbId: concept2cureArtifacts.id,
          artifactId: concept2cureArtifacts.artifactId,
          title: concept2cureArtifacts.title,
          content: concept2cureArtifacts.content,
          version: concept2cureArtifacts.version,
        })
        .from(c2cArtifactSectionMap)
        .innerJoin(
          concept2cureArtifacts,
          eq(concept2cureArtifacts.id, c2cArtifactSectionMap.artifactId),
        )
        .where(
          and(
            eq(c2cArtifactSectionMap.sectionDbId, section.id),
            eq(c2cArtifactSectionMap.orgId, orgId),
          ),
        )
        .orderBy(asc(concept2cureArtifacts.id));

      // Deterministic leaf path at an ICH module path; de-dupe collisions by
      // inserting the section db id BEFORE the .pdf extension.
      let leafPath = sectionKeyToEctdPath(section.sectionKey, regionCode);
      if (seenPaths.has(leafPath)) {
        leafPath = leafPath.replace(/\.pdf$/, `-${section.id}.pdf`);
      }
      seenPaths.add(leafPath);

      let markdown: string;
      if (mapped.length === 0) {
        // No artifact content mapped — emit an explicitly empty placeholder leaf.
        markdown = `[EMPTY SECTION] ${section.sectionLabel} (${section.sectionKey})\n`;
        emptyLeafCount += 1;
        emptyLeafPaths.push(leafPath);
      } else {
        // Serialize mapped artifact content deterministically. Real content only —
        // no fabrication.
        markdown = mapped
          .map(
            (a) =>
              `### ${a.title} (${a.artifactId} v${a.version})\n\n${a.content ?? ''}\n`,
          )
          .join('\n');
      }

      const leafTitle = `${section.sectionLabel} (${section.sectionKey})`;
      leafs.push({
        path: leafPath,
        mediaType: 'application/pdf',
        content: await buildLeafPdf(leafTitle, markdown),
      });
    }

    // Internal eCTD structural validation (pre-flight). Findings are stored on
    // the descriptor and surfaced to the UI; transmit hard-blocks on errors.
    // This is INTERNAL structural validation only — NOT an agency validator.
    const validation = validateEctdLeafs(leafs, { region, emptyLeafPaths });

    // Assemble the real zip buffer.
    const zipBuffer = await buildECTDZip({
      region,
      sequence,
      operation: 'new',
      leafs,
    });
    const zip: Buffer = Buffer.isBuffer(zipBuffer) ? zipBuffer : Buffer.from(zipBuffer as Uint8Array);

    // Bundle-level SHA-256 over the full zip + size.
    const sha256 = createHash('sha256').update(zip).digest('hex');
    const sizeBytes = zip.length;

    // Persist to disk at a deterministic path keyed by packageId + content hash.
    await fs.promises.mkdir(BUNDLE_DIR, { recursive: true });
    const fileName = `${leafSlug(pkg.packageId)}-${sha256.slice(0, 16)}.zip`;
    const bundlePath = path.join(BUNDLE_DIR, fileName);
    await fs.promises.writeFile(bundlePath, zip);

    // Optionally persist a durable copy to S3 (env-gated). The local file is the
    // primary and is already written above; a durable-archive failure must NOT
    // fail assembly, so we fall back to provider:'local' on any error.
    let storage: { provider: 'local' } | { provider: 's3'; bucket: string; key: string } = {
      provider: 'local',
    };
    if (isBundleStorageEnabled()) {
      const key = bundleStorageKey(pkg.packageId, sha256);
      try {
        await putBundle(key, zip);
        storage = { provider: 's3', bucket: bundleStorageBucket(), key };
      } catch (storageErr) {
        console.error(
          '[submission-ops] assemble-durable-storage-failed (falling back to local)',
          storageErr instanceof Error ? storageErr.message : storageErr,
        );
        storage = { provider: 'local' };
      }
    }

    const assembledAt = new Date().toISOString();
    const descriptor = {
      path: bundlePath,
      sha256,
      sizeBytes,
      format,
      leafCount: leafs.length,
      emptyLeafCount,
      storage,
      validation: {
        errorCount: validation.errorCount,
        warningCount: validation.warningCount,
        infoCount: validation.infoCount,
        findings: validation.findings,
      },
      assembledAt,
      assembledBy: userId,
    };

    // Store the descriptor under metadata.bundle (JSONB) and bump updated_at.
    const existingMetadata =
      pkg.metadata && typeof pkg.metadata === 'object' ? (pkg.metadata as Record<string, unknown>) : {};
    await db
      .update(c2cSubmissionPackages)
      .set({
        metadata: { ...existingMetadata, bundle: descriptor },
        updatedAt: new Date(),
      })
      .where(eq(c2cSubmissionPackages.id, pkg.id));

    // Audit: medium-risk governed transition (no reauth). Written in its own
    // transaction via the shared ledger primitive.
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await recordGovernedAction(client as any, {
          orgId,
          userId,
          command: 'transition',
          target: `submission:${pkg.id}`,
          reason: parsed.data.reason ?? 'eCTD bundle assembled',
          payload: { sha256, sizeBytes, format, leafCount: leafs.length },
          domain: 'mdx',
          surface: 'submission-gateway',
        });
        await client.query('COMMIT');
      } catch (ledgerErr) {
        try { await client.query('ROLLBACK'); } catch { /* noop */ }
        throw ledgerErr;
      } finally {
        client.release();
      }
    } catch (ledgerErr) {
      // The bundle is persisted; an audit-write failure must not lose the
      // descriptor. Log and continue (mirrors the transmit route's fallback).
      console.error(
        '[submission-ops] assemble-ledger-write-failed',
        ledgerErr instanceof Error ? ledgerErr.message : ledgerErr,
      );
    }

    return res.json({
      success: true,
      data: {
        packageId: pkg.packageId,
        bundle: {
          path: descriptor.path,
          sha256: descriptor.sha256,
          sizeBytes: descriptor.sizeBytes,
          format: descriptor.format,
          leafCount: descriptor.leafCount,
          storage: { provider: descriptor.storage.provider },
          validation: {
            errorCount: descriptor.validation.errorCount,
            warningCount: descriptor.validation.warningCount,
            infoCount: descriptor.validation.infoCount,
          },
          assembledAt: descriptor.assembledAt,
        },
      },
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

export default router;
