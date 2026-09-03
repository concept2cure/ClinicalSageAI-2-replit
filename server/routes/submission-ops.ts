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
import { loadUnifiedWork } from '../services/unified-work/unified-work-view';
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
  concept2cureReviewTasks,
  concept2cureReviewAssignments,
} from '../../shared/schema';
import { eq, and, desc, sql, count, inArray, isNull, asc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { resolvePolicy, resolveAllPolicies } from '../submission-ops/policy-engine';
import { computePackageReadiness } from '../submission-ops/readiness-engine';
import { runAutomationSweep } from '../submission-ops/automation-runner';
import { getProjectSignals, analyzeCrossArtifactIntelligence } from '../services/intelligence/index.js';
import { readCanonicalDueSoonAndWorkload } from '../services/regulatory-correspondence/operating-layer';
import * as os from 'os';
import { buildECTDZip } from '../src/services/ectd';
// The canonical eCTD packaging path — eCTD-format bundles are built by the SAME
// builder the compile/export/sign path uses, so the transmitted artifact is the
// conformant one (see server/services/ectd/package-leaf-bytes.ts).
import { packageLeafBytes } from '../services/ectd/package-leaf-bytes';
import { moduleForSectionKey, resolveArtifactPlacement } from '../services/ectd/section-to-ctd';
import {
  readRegulatoryIdentifiers,
  usableIdentifier,
  REGULATORY_IDENTIFIER_FIELDS,
} from '../services/ectd/regulatory-identifiers';
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
  readBundleBytes,
} from '../services/submission-bundle-storage';
import { validateEctdLeafs } from '../services/submission-gateways/ectd-structural-validator';
import type { EctdFinding } from '../services/submission-gateways/ectd-structural-validator';
import {
  VALIDATOR_REGISTRY,
  runHttpValidator,
} from '../services/submission-gateways/validator-registry';
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';

const router = Router();

const logger = createScopedLogger('submission-ops');

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
    return serverError(res, logger, 'loading packages', e);
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
    return serverError(res, logger, 'saving packages', e);
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
    return serverError(res, logger, 'loading packages', e);
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
    return serverError(res, logger, 'loading sections', e);
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
    return serverError(res, logger, 'saving artifact section map', e);
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
    return serverError(res, logger, 'loading artifacts', e);
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
    return serverError(res, logger, 'loading milestones', e);
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
    return serverError(res, logger, 'saving milestones', e);
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
    return serverError(res, logger, 'loading policies', e);
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
    return serverError(res, logger, 'saving policies', e);
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
    return serverError(res, logger, 'updating policies', e);
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
    return serverError(res, logger, 'deleting policies', e);
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
    return serverError(res, logger, 'resolving policies', e);
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
    return serverError(res, logger, 'loading readiness', e);
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
    return serverError(res, logger, 'loading readiness history', e);
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
    return serverError(res, logger, 'loading blockers', e);
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
    return serverError(res, logger, 'updating blockers', e);
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
    return serverError(res, logger, 'loading approval bottlenecks', e);
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
    return serverError(res, logger, 'loading workload', e);
  }
});

/**
 * GET /api/submission-ops/unified-work[?projectId=]
 *
 * The portfolio view across ALL THREE systems that track work independently —
 * schedule-of-events tasks (project_tasks), review + correspondence work items
 * (c2c_project_work_items), and tracked filings with their FDA review clock
 * (estar_submissions). /workload above returns only the second of those, which
 * is why a milestone slip or an agency hold never appeared beside a review
 * blocker.
 *
 * Read-only and additive: /workload is unchanged, so existing consumers keep
 * their exact shape. Blockers sort first, then soonest due; `summary` carries
 * the roll-up by status and by source.
 */
router.get('/unified-work', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const raw = req.query.projectId ? Number(req.query.projectId) : undefined;
    const projectId = Number.isInteger(raw) && (raw as number) > 0 ? raw : undefined;
    const view = await loadUnifiedWork({ organizationId: orgId, projectId });
    res.json({ ...view, sources: ['project_tasks', 'c2c_project_work_items', 'estar_submissions'] });
  } catch (e) {
    return serverError(res, logger, 'loading unified work', e);
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
    return serverError(res, logger, 'loading hotspots', e);
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
    return serverError(res, logger, 'running automation', e);
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
    return serverError(res, logger, 'loading runs', e);
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
    return serverError(res, logger, 'loading actions', e);
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
    return serverError(res, logger, 'loading due soon', e);
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
    return serverError(res, logger, 'loading digests', e);
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
    return serverError(res, logger, 'marking read digests', e);
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
    return serverError(res, logger, 'loading command center', e);
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
    return serverError(res, logger, 'publishing packages', e);
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
 * Compose `<base>-<disc>.pdf` within the eCTD file-name limit (FILENAME_PATTERN:
 * 64 characters including the extension), trimming the base — never the
 * discriminator — and appending a numeric tiebreaker only when the name is
 * already taken. The result always satisfies FILENAME_PATTERN.
 */
function ectdLeafFileName(base: string, disc: string, taken: Set<string>): string {
  const MAX = 64;
  const compose = (suffix: string): string => {
    const tail = `-${disc}${suffix}.pdf`;
    const head = base.slice(0, Math.max(1, MAX - tail.length)).replace(/-+$/, '') || 'leaf';
    return `${head}${tail}`;
  };
  let name = compose('');
  for (let n = 2; taken.has(name); n += 1) name = compose(`-${n}`);
  return name;
}

/**
 * Best-effort ICH module (1–5) for a c2c_package_sections sectionKey. These
 * keys are semantic (e.g. `module3_cmc`, `labeling`, `cer`), not ICH-numeric,
 * so we derive the module from, in order: an explicit module-N prefix, an
 * ICH-numeric leading digit, or well-known content keywords. Returns null when
 * nothing matches (caller defaults to module 1 / regional).
 */
// moduleForSectionKey is the SINGLE keyword table, imported from
// services/ectd/section-to-ctd — a verbatim copy used to live here and the two
// drifted (the copy filed clinical pharmacology under Module 4).

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
  // An eCTD sequence number is exactly four digits (ICH eCTD v3.2.2 §3.2). The
  // value becomes a filesystem path component in the canonical packager, so the
  // charset is enforced here — a free-form string was a path-traversal vector.
  sequence: z.string().regex(/^\d{4}$/, 'sequence must be exactly four digits (e.g. 0000)').optional(),
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
/**
 * PUT /packages/:packageId/regulatory-identifiers
 *
 * Record the agency application number and applicant identity the regional
 * Module 1 backbone must carry. The assemble route REFUSES to fabricate them
 * (REGULATORY-IDENTIFIER-MISSING blocks transmit), and the package model has no
 * columns for them, so this is the governed way to supply them:
 *   - the same charset contract as the assemble gate (shared module) — a value
 *     that cannot be carried safely in a filename / XML text is refused, never
 *     silently normalized;
 *   - allowed on a locked package (assembly requires the lock), but a bundle
 *     assembled under different identifiers is STALE (its backbone carries the
 *     old ones) and is cleared so the transmit gate cannot ship it;
 *   - recorded as a governed action with the caller's reason.
 */
const regulatoryIdentifiersBody = z.object({
  applicationNumber: z.string().min(1).max(64),
  applicantId: z.string().min(1).max(64),
  applicantName: z.string().min(1).max(200),
  reason: z.string().min(8, 'reason must be at least 8 characters'),
});

router.put('/packages/:packageId/regulatory-identifiers', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);

    const parsed = regulatoryIdentifiersBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    }
    const invalid = REGULATORY_IDENTIFIER_FIELDS.filter((f) => usableIdentifier(f, parsed.data[f]) === null);
    if (invalid.length > 0) {
      return res.status(400).json({
        error:
          `Identifier(s) do not meet the agency-identifier contract: ${invalid.join(', ')}. ` +
          'Application number and applicant id: letters, digits, ".", "_" or "-" (start alphanumeric, max 64). ' +
          'Applicant name: no control characters, max 200.',
        code: 'REGULATORY_IDENTIFIER_INVALID',
        fields: invalid,
      });
    }

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

    const existingMetadata =
      pkg.metadata && typeof pkg.metadata === 'object' ? (pkg.metadata as Record<string, unknown>) : {};
    const previous = readRegulatoryIdentifiers(existingMetadata).values;
    const next = {
      applicationNumber: usableIdentifier('applicationNumber', parsed.data.applicationNumber)!,
      applicantId: usableIdentifier('applicantId', parsed.data.applicantId)!,
      applicantName: usableIdentifier('applicantName', parsed.data.applicantName)!,
    };
    const changed = REGULATORY_IDENTIFIER_FIELDS.some((f) => previous[f] !== next[f]);
    const regulatory = { ...next, recordedAt: new Date().toISOString(), recordedBy: userId };

    // A bundle assembled under different identifiers carries the OLD ones in its
    // backbone. Clear it so the transmit gate cannot ship it; re-assemble.
    const { bundle: existingBundle, ...metadataWithoutBundle } = existingMetadata;
    const staleBundleCleared = changed && existingBundle !== undefined;
    const metadata = staleBundleCleared
      ? { ...metadataWithoutBundle, regulatory }
      : { ...existingMetadata, regulatory };

    await db
      .update(c2cSubmissionPackages)
      .set({ metadata, updatedAt: new Date() })
      .where(eq(c2cSubmissionPackages.id, pkg.id));

    // Governed action, same posture as assemble: the write is real and must not
    // be lost over an audit outage, but the caller is told when the ledger row
    // could not be written.
    let ledgerWriteFailed = false;
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await recordGovernedAction(client as any, {
          orgId,
          userId,
          command: 'transition',
          target: `submission:${pkg.id}`,
          reason: parsed.data.reason,
          payload: {
            change: 'regulatory-identifiers',
            applicationNumber: next.applicationNumber,
            applicantId: next.applicantId,
            applicantName: next.applicantName,
            changed,
            staleBundleCleared,
          },
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
      ledgerWriteFailed = true;
      console.error(
        '[submission-ops] regulatory-identifiers-ledger-write-failed',
        ledgerErr instanceof Error ? ledgerErr.message : ledgerErr,
      );
    }

    return res.json({
      success: true,
      data: { packageId: pkg.packageId, regulatory, changed, staleBundleCleared, ledgerWriteFailed },
    });
  } catch (e) {
    return serverError(res, logger, 'recording regulatory identifiers', e);
  }
});

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
      const resolvedRegion = parsed.data.region ?? derived.region;
      let resolvedFormat = parsed.data.format ?? derived.format;
      // A region override re-derives the eCTD format (PMDA ⇔ pmda_ectd) unless
      // the body pinned one explicitly — otherwise a PMDA package was persisted
      // labelled 'ectd' and downstream never cross-checked.
      if (!parsed.data.format && (resolvedFormat === 'ectd' || resolvedFormat === 'pmda_ectd')) {
        resolvedFormat = resolvedRegion === 'PMDA' ? 'pmda_ectd' : 'ectd';
      }
      return { region: resolvedRegion, format: resolvedFormat };
    })();
    // Every format pins its region: pmda_ectd ⇔ PMDA; ectd ⇔ FDA or EMA;
    // estar ⇔ FDA (an eSTAR is a CDRH form); eudamed_register ⇔ EMA. A body
    // override that contradicts the format is a 400 for device families too —
    // the check used to guard only the two eCTD formats, so {region:'PMDA'} on
    // a 510(k) built an 'estar' bundle with Japanese Module 1 paths.
    const requiredRegion =
      format === 'pmda_ectd' ? 'PMDA' : format === 'estar' ? 'FDA' : format === 'eudamed_register' ? 'EMA' : null;
    const regionFormatConsistent = requiredRegion
      ? region === requiredRegion
      : !(format === 'ectd' && region === 'PMDA');
    if (!regionFormatConsistent) {
      return res.status(400).json({
        error:
          `format '${format}' is inconsistent with region '${region}': ` +
          (requiredRegion ? `${format} is the ${requiredRegion} format.` : 'ectd is the FDA/EMA format; PMDA uses pmda_ectd.'),
        code: 'REGION_FORMAT_MISMATCH',
      });
    }
    const sequence = parsed.data.sequence ?? '0000';
    const existingMetadata =
      pkg.metadata && typeof pkg.metadata === 'object' ? (pkg.metadata as Record<string, unknown>) : {};

    // Region code used in m1/<region>/.. leaf paths (per ICH M4 / regional M1).
    const regionCode = region === 'EMA' ? 'eu' : region === 'PMDA' ? 'jp' : 'us';

    // Build eCTD leafs from section content. Section content is sourced from the
    // artifacts mapped to each section (c2c_artifact_section_map -> concept2cure
    // artifacts.content). Each leaf is a real PDF placed at an ICH module path.
    // An empty section produces an explicitly-empty PDF leaf.
    // eCTD formats go through the CANONICAL packager (placement by CTD section);
    // non-eCTD device families (eSTAR / EUDAMED register) keep the path-keyed
    // builder. Decided up front because the LEAF MODEL differs:
    //   eCTD  — one leaf per ARTIFACT, at that artifact's own placeable CTD
    //           section. Placement is a property of the artifact, never of the
    //           section: merging a section's artifacts into one leaf at one code
    //           silently misfiled content placed at different sections.
    //   other — one leaf per section at a module path (unchanged).
    // `leafs` is ALWAYS the set that ships — validation, counts and the ledger
    // are computed over it, never over a parallel list that can diverge.
    const isEctdFormat = format === 'ectd' || format === 'pmda_ectd';
    // Placement is region-aware: Module 1 headings are published per agency.
    const packagerRegion = region === 'EMA' ? 'ema' : region === 'PMDA' ? 'pmda' : 'fda';
    const seenPaths = new Set<string>();
    const leafs: { path: string; mediaType: string; content: Buffer }[] = [];
    const emptyLeafPaths: string[] = [];
    let emptyLeafCount = 0;
    const ctdLeaves: Array<{ ctdSection: string; fileName: string; bytes: Buffer; title: string }> = [];
    // Placement findings (unplaced / disagreement), merged into the validation
    // result below so the governed transmit gate sees them.
    const placementFindings: Array<{ severity: 'error' | 'warning'; ruleId: string; message: string }> = [];
    // An artifact ships as ONE leaf. The section map has no uniqueness on
    // (artifact, section), so a duplicate row — or the same artifact mapped
    // into two sections — used to ship a second copy under a suffixed name with
    // no finding. artifactDbId → the section label it shipped from.
    const shippedArtifacts = new Map<number, string>();

    for (const section of sections) {
      const mapped = await db
        .select({
          artifactDbId: concept2cureArtifacts.id,
          artifactId: concept2cureArtifacts.artifactId,
          title: concept2cureArtifacts.title,
          content: concept2cureArtifacts.content,
          version: concept2cureArtifacts.version,
          // The artifact's declared eCTD placement — the most specific evidence
          // for the leaf's real CTD section when the section key is a product label.
          ctdSection: concept2cureArtifacts.ctdSection,
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

      const sectionLabel = `${section.sectionLabel} (${section.sectionKey})`;

      if (!isEctdFormat) {
        // Non-eCTD: one path-keyed leaf per section; de-dupe collisions by
        // inserting the section db id BEFORE the .pdf extension.
        let leafPath = sectionKeyToEctdPath(section.sectionKey, regionCode);
        if (seenPaths.has(leafPath)) {
          leafPath = leafPath.replace(/\.pdf$/, `-${section.id}.pdf`);
        }
        seenPaths.add(leafPath);
        let markdown: string;
        if (mapped.length === 0) {
          markdown = `[EMPTY SECTION] ${sectionLabel}\n`;
          emptyLeafCount += 1;
          emptyLeafPaths.push(leafPath);
        } else {
          // Real content only — no fabrication.
          markdown = mapped
            .map((a) => `### ${a.title} (${a.artifactId} v${a.version})\n\n${a.content ?? ''}\n`)
            .join('\n');
        }
        leafs.push({ path: leafPath, mediaType: 'application/pdf', content: await buildLeafPdf(sectionLabel, markdown) });
        continue;
      }

      // eCTD: place each ARTIFACT at its own CTD section. An empty section is a
      // single placeholder unit placed from the section key alone. Every code is
      // gated to a placeable terminal heading; nothing is guessed — an unplaceable
      // unit becomes a blocking LEAF-UNPLACED finding so transmit refuses it.
      const units =
        mapped.length === 0
          ? [{ artifact: null, placement: resolveArtifactPlacement(section.sectionKey, null, packagerRegion) }]
          : mapped.map((a) => ({ artifact: a, placement: resolveArtifactPlacement(section.sectionKey, a.ctdSection, packagerRegion) }));

      for (const { artifact, placement } of units) {
        const unitLabel = artifact
          ? `${artifact.title} (${artifact.artifactId} v${artifact.version}) in ${sectionLabel}`
          : sectionLabel;
        if (artifact && shippedArtifacts.has(artifact.artifactDbId)) {
          placementFindings.push({
            severity: 'warning',
            ruleId: 'LEAF-DUPLICATE-MAPPING',
            message: `${unitLabel}: this artifact already ships as a leaf from ${shippedArtifacts.get(artifact.artifactDbId)}; an artifact is one leaf, so this mapping was skipped. Remove the duplicate mapping.`,
          });
          continue;
        }
        if (!placement.code) {
          const sectionModule = moduleForSectionKey(section.sectionKey);
          placementFindings.push({
            severity: 'error',
            ruleId: 'LEAF-UNPLACED',
            message: placement.unplaceableCode
              ? `${unitLabel}: declared CTD section '${placement.unplaceableCode}' is not a placeable ICH heading (a bare module or a non-existent code nests under a container element a regional validator rejects). Assign a terminal CTD section before transmitting.`
              : `${unitLabel}: no placeable CTD section is declared${sectionModule ? ` (its key names Module ${sectionModule}, but a bare module is not a heading a leaf can file under)` : ''}. Assign its CTD section before transmitting.`,
          });
          continue;
        }
        if (placement.unplaceableCode) {
          // Placed via a lower-precedence source, but the artifact's OWN declared
          // code was rejected — a data defect the author should see.
          placementFindings.push({
            severity: 'warning',
            ruleId: 'LEAF-DECLARED-CODE-REJECTED',
            message: `${unitLabel}: declared CTD section '${placement.unplaceableCode}' is not a placeable ICH heading and was ignored; the leaf is filed at ${placement.code} from its ${placement.source === 'section-key' ? 'section key' : 'section heading'}. Correct the artifact's CTD section.`,
          });
        }
        if (placement.moduleDisagreement) {
          placementFindings.push({
            severity: 'warning',
            ruleId: 'LEAF-MODULE-DISAGREEMENT',
            message: `${unitLabel}: filed at ${placement.code} (Module ${placement.moduleDisagreement.placedModule}) but its section names Module ${placement.moduleDisagreement.sectionModule}. Confirm the artifact's CTD section is intended — it is kept as declared, not overridden.`,
          });
        }

        // eCTD file names are lowercase [a-z0-9.-] and at most 64 characters
        // INCLUDING the extension (FILENAME_PATTERN). The section slug is cut to
        // the budget left after a discriminator — the artifact id's random
        // suffix, or the section id for a placeholder — so two artifacts in one
        // section never collide and a long section key cannot overflow the rule
        // (it used to reach 84 characters with no finding).
        const disc = artifact
          ? artifact.artifactId.replace(/^artifact_/, '').slice(-12).toLowerCase().replace(/[^a-z0-9]/g, '') || `a${artifact.artifactDbId}`
          : `s${section.id}`;
        const fileName = ectdLeafFileName(leafSlug(section.sectionKey), disc, seenPaths);
        seenPaths.add(fileName);
        // Module-level path for the internal structural validator (which checks
        // media type, %PDF magic, empty markers and Module 1 presence). The
        // packager derives the real in-package path from the CTD section.
        const modulePath = `m${placement.code.split('.')[0]}/${fileName}`;

        let markdown: string;
        if (!artifact) {
          markdown = `[EMPTY SECTION] ${sectionLabel}\n`;
          emptyLeafCount += 1;
          emptyLeafPaths.push(modulePath);
        } else {
          markdown = `### ${artifact.title} (${artifact.artifactId} v${artifact.version})\n\n${artifact.content ?? ''}\n`;
        }
        const title = artifact ? `${artifact.title} — ${sectionLabel}` : sectionLabel;
        const bytes = await buildLeafPdf(title, markdown);
        ctdLeaves.push({ ctdSection: placement.code, fileName, bytes, title });
        leafs.push({ path: modulePath, mediaType: 'application/pdf', content: bytes });
        if (artifact) shippedArtifacts.set(artifact.artifactDbId, sectionLabel);
      }
    }

    // Internal eCTD structural validation (pre-flight). Findings are stored on
    // the descriptor and surfaced to the UI; transmit hard-blocks on errors.
    // This is INTERNAL structural validation only — NOT an agency validator.
    const validation = validateEctdLeafs(leafs, { region, emptyLeafPaths, enforceFileNames: isEctdFormat });

    // Assemble the real zip buffer.
    //
    // eCTD formats go through the CANONICAL packager — the same builder the
    // compile/export/sign path uses — so the bytes that reach an agency carry a
    // conformant ICH <ectd:ectd> heading tree, the regional Module 1 backbone,
    // per-leaf MD5s and the root index-md5.txt. The legacy flat-<ectd:index>
    // builder produced none of that and would be rejected by a real validator.
    // Non-eCTD families (eSTAR / EUDAMED register) are NOT eCTD submissions and
    // keep their existing builder.
    // Evidence the canonical packager produces about its own output (PDF/A
    // grade, DTD self-containment, regional-backbone conformance, real format).
    // Persisted on the descriptor so the pre-transmit gate — which runs with the
    // TRANSMIT-time environment and the operator's ECTD_REQUIRE_* opt-ins — can
    // enforce against it. Assembly itself runs the packager in 'staging' so it
    // produces evidence instead of refusing; enforcement is the gate's job.
    let canonicalEvidence:
      | {
          format: typeof format;
          submissionGrade?: unknown;
          dtdStatus?: unknown;
          regionalBackbone?: unknown;
        }
      | undefined;
    let zip: Buffer;
    if (isEctdFormat) {
      // Placement findings: LEAF-UNPLACED is error-severity so the governed
      // transmit gate (which hard-blocks on errors) refuses until it is placed.
      for (const f of placementFindings) {
        validation.findings.push(f);
        if (f.severity === 'error') validation.errorCount += 1;
        else validation.warningCount += 1;
      }

      // Regulatory identifiers. The regional Module 1 backbone carries the
      // agency application number and applicant identity; the package model has
      // no columns for them, so they are read from package metadata. When absent
      // the package is STILL assembled (so the structure can be inspected) with
      // values that say UNASSIGNED, and a blocking finding is recorded — never
      // an internal id dressed up as an agency identifier. Both also become
      // filename components in the packager, so the charset is enforced.
      const identifiers = readRegulatoryIdentifiers(existingMetadata);
      const { applicationNumber, applicantId, applicantName } = identifiers.values;
      const missingIdentifiers = identifiers.missing;
      if (missingIdentifiers.length > 0) {
        validation.findings.push({
          severity: 'error',
          ruleId: 'REGULATORY-IDENTIFIER-MISSING',
          message: `The regional Module 1 backbone must carry the agency application number and applicant identity, and this package records none that are usable (missing or malformed package metadata: ${missingIdentifiers.join(', ')}). The assembled backbone carries UNASSIGNED placeholders for inspection only — record the real identifiers before transmitting.`,
        });
        validation.errorCount += 1;
      }

      const work = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'c2c-assemble-'));
      try {
        const canonical = await packageLeafBytes({
          region: packagerRegion,
          applicationId: applicationNumber ?? `UNASSIGNED-${leafSlug(pkg.packageId)}`,
          sequence,
          submissionType: 'original',
          sponsorId: applicantId ?? `UNASSIGNED-ORG-${orgId}`,
          sponsorName: applicantName ?? `UNASSIGNED (organization ${orgId})`,
          productName: pkg.title,
          outputDir: work,
          environment: 'staging',
          leaves: ctdLeaves,
        });
        zip = await fs.promises.readFile(canonical.path);
        canonicalEvidence = {
          format: canonical.format as typeof format,
          submissionGrade: canonical.submissionGrade,
          dtdStatus: canonical.dtdStatus,
          regionalBackbone: canonical.regionalBackbone,
        };
      } finally {
        await fs.promises.rm(work, { recursive: true, force: true }).catch(() => {});
      }
    } else {
      const zipBuffer = await buildECTDZip({
        region,
        sequence,
        operation: 'new',
        leafs,
      });
      zip = Buffer.isBuffer(zipBuffer) ? zipBuffer : Buffer.from(zipBuffer as Uint8Array);
    }

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
      // The format the package was actually BUILT as (the packager's own), so a
      // PMDA build can never be persisted labelled as FDA/EMA eCTD.
      format: canonicalEvidence?.format ?? format,
      // The region the bundle was BUILT for, so a downstream reader can detect a
      // contradiction without inferring it from the backbone.
      region,
      leafCount: leafs.length,
      emptyLeafCount,
      storage,
      // Packager evidence for the pre-transmit gate (undefined for non-eCTD).
      submissionGrade: canonicalEvidence?.submissionGrade,
      dtdStatus: canonicalEvidence?.dtdStatus,
      regionalBackbone: canonicalEvidence?.regionalBackbone,
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
    await db
      .update(c2cSubmissionPackages)
      .set({
        metadata: { ...existingMetadata, bundle: descriptor },
        updatedAt: new Date(),
      })
      .where(eq(c2cSubmissionPackages.id, pkg.id));

    // Audit: medium-risk governed transition (no reauth). Written in its own
    // transaction via the shared ledger primitive. The flag carries the outcome
    // out to the response — see the catch below.
    let ledgerWriteFailed = false;
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
      /* The bundle is persisted and must not be lost over an audit outage —
         that part was right. What was wrong is that the caller was never told:
         the catch logged to the server console and the handler then returned
         `success: true` with a descriptor indistinguishable from a fully
         audited assembly.

         recordGovernedAction writes the sha256-chained audit_logs row AND the
         c2c_ana_actions row. Losing both means an eCTD bundle exists for a
         regulatory submission with no governance record of who assembled it or
         why — and a tenant who cannot evidence an assembly cannot defend it.

         The transmit route was fixed the same way and for the same reason: the
         artefact is real, so it is still returned; the gap travels with it. */
      ledgerWriteFailed = true;
      console.error(
        '[submission-ops] assemble-ledger-write-failed',
        ledgerErr instanceof Error ? ledgerErr.message : ledgerErr,
      );
    }

    return res.json({
      success: true,
      ...(ledgerWriteFailed
        ? {
            ledgerWriteFailed: true,
            ledgerWarning:
              'The bundle was assembled, but its governed-action ledger entry could not be written. Record this assembly manually and raise it with your administrator before relying on the audit trail.',
          }
        : {}),
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
    return serverError(res, logger, 'saving assemble', e);
  }
});

// ============================================================
// PRE-FLIGHT VALIDATION
// ============================================================

/**
 * POST /api/submission-ops/packages/:packageId/preflight
 *
 * Runs the validator layer over a package's assembled bundle and returns the
 * combined findings, a per-validator configuration/run status, and a `blocking`
 * flag (true iff any error-severity finding exists). The UI calls this before
 * showing the e-sign / transmit affordance.
 *
 * Findings come from:
 *  - `internal` — the eCTD structural validator, already computed at assemble.
 *    We reuse the stored `metadata.bundle.validation` (do NOT recompute).
 *  - external agency validators (`fda_evalidator`, `ema_validator`,
 *    `pmda_precheck`) — only when CONFIGURED (their `*_VALIDATOR_URL` env is set).
 *    When unconfigured (the default) they contribute nothing and report
 *    `ran:false`. A configured validator that fails to run is recorded
 *    `ran:true` with an `error` AND adds an error-severity finding, so a failed
 *    validator never looks like a pass.
 *
 * Persistence: the run's summary (counts + per-validator status, no finding
 * bodies) is stored under the package's `metadata.preflight` JSONB — the same
 * pattern assemble uses for the `bundle` descriptor — so org-level rollups
 * (the CMC portfolio's `preflight_critical` column) can aggregate REAL
 * preflight outcomes instead of fabricating them. That write is a derived
 * cache of the run just performed, not a governed state transition, so no
 * governed action is recorded. Tenant-scoped.
 */
router.post('/packages/:packageId/preflight', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);

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

    const metadata =
      pkg.metadata && typeof pkg.metadata === 'object'
        ? (pkg.metadata as Record<string, any>)
        : {};
    const bundle = metadata.bundle as
      | {
          sha256?: string;
          sizeBytes?: number;
          format?: string;
          path?: string;
          storage?: { provider?: string; key?: string };
          validation?: {
            errorCount?: number;
            warningCount?: number;
            infoCount?: number;
            findings?: EctdFinding[];
          };
        }
      | undefined;

    if (!bundle) {
      return res.status(409).json({
        gate: 'not_assembled',
        error: 'No assembled bundle; call assemble first.',
      });
    }

    const validators: {
      id: string;
      label: string;
      configured: boolean;
      ran: boolean;
      errorCount: number;
      warningCount: number;
      error?: string;
    }[] = [];
    const findings: EctdFinding[] = [];

    // INTERNAL: reuse the structural findings computed at assemble.
    const internalFindings = Array.isArray(bundle.validation?.findings)
      ? bundle.validation!.findings!
      : [];
    findings.push(...internalFindings);
    const internalProvider = VALIDATOR_REGISTRY.find((v) => v.id === 'internal');
    validators.push({
      id: 'internal',
      label: internalProvider?.label ?? 'Internal structural',
      configured: true,
      ran: true,
      errorCount: bundle.validation?.errorCount ?? 0,
      warningCount: bundle.validation?.warningCount ?? 0,
    });

    // EXTERNAL: run each configured agency validator over the bundle bytes.
    const externalProviders = VALIDATOR_REGISTRY.filter((v) => v.id !== 'internal');
    const anyExternalConfigured = externalProviders.some((v) => v.configured());

    // Read the bundle bytes once, lazily, only if at least one external runs.
    let zipBytes: Buffer | null = null;
    let zipError: string | null = null;
    if (anyExternalConfigured) {
      try {
        zipBytes = await readBundleBytes({
          path: String(bundle.path ?? ''),
          storage: bundle.storage,
        });
      } catch (e) {
        zipError = e instanceof Error ? e.message : 'Failed to read bundle bytes';
      }
    }

    for (const provider of externalProviders) {
      if (!provider.configured()) {
        validators.push({
          id: provider.id,
          label: provider.label,
          configured: false,
          ran: false,
          errorCount: 0,
          warningCount: 0,
        });
        continue;
      }

      // Configured but could not read the bundle bytes — record as errored.
      if (!zipBytes) {
        const message = `Validator '${provider.id}' could not read the bundle: ${zipError ?? 'bundle bytes unavailable'}`;
        findings.push({ severity: 'error', ruleId: 'VALIDATOR-ERROR', message });
        validators.push({
          id: provider.id,
          label: provider.label,
          configured: true,
          ran: true,
          errorCount: 1,
          warningCount: 0,
          error: message,
        });
        continue;
      }

      try {
        const result = await runHttpValidator(provider.id, zipBytes, {
          sha256: String(bundle.sha256 ?? ''),
          format: String(bundle.format ?? ''),
        });
        findings.push(...result);
        let errs = 0;
        let warns = 0;
        for (const f of result) {
          if (f.severity === 'error') errs += 1;
          else if (f.severity === 'warning') warns += 1;
        }
        validators.push({
          id: provider.id,
          label: provider.label,
          configured: true,
          ran: true,
          errorCount: errs,
          warningCount: warns,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Validator failed';
        // A validator that fails to run must NOT look like a pass.
        findings.push({ severity: 'error', ruleId: 'VALIDATOR-ERROR', message });
        validators.push({
          id: provider.id,
          label: provider.label,
          configured: true,
          ran: true,
          errorCount: 1,
          warningCount: 0,
          error: message,
        });
      }
    }

    // Combined counts across all findings.
    let errorCount = 0;
    let warningCount = 0;
    for (const f of findings) {
      if (f.severity === 'error') errorCount += 1;
      else if (f.severity === 'warning') warningCount += 1;
    }

    // Persist the latest preflight summary under metadata.preflight (same
    // JSONB pattern as assemble's `bundle` descriptor). Summary only — the
    // finding bodies are already derivable (internal ones live on
    // metadata.bundle.validation; external ones are re-runnable). A failed
    // write must not lose the computed findings: log and still respond.
    const preflightSummary = {
      ranAt: new Date().toISOString(),
      ranBy: (req as any).user?.id ?? null,
      bundleSha256: bundle.sha256 ?? null,
      errorCount,
      warningCount,
      blocking: errorCount > 0,
      validators: validators.map(v => ({
        id: v.id,
        configured: v.configured,
        ran: v.ran,
        errorCount: v.errorCount,
        warningCount: v.warningCount,
        ...(v.error ? { error: v.error } : {}),
      })),
    };
    try {
      await db
        .update(c2cSubmissionPackages)
        .set({
          metadata: { ...metadata, preflight: preflightSummary },
          updatedAt: new Date(),
        })
        .where(eq(c2cSubmissionPackages.id, pkg.id));
    } catch (persistErr) {
      console.error(
        '[submission-ops] preflight-persist-failed',
        persistErr instanceof Error ? persistErr.message : persistErr,
      );
    }

    return res.json({
      success: true,
      data: {
        packageId: pkg.packageId,
        bundle: {
          sha256: bundle.sha256 ?? null,
          sizeBytes: bundle.sizeBytes ?? null,
          format: bundle.format ?? null,
        },
        validators,
        findings,
        blocking: errorCount > 0,
        errorCount,
        warningCount,
      },
    });
  } catch (e) {
    return serverError(res, logger, 'saving preflight', e);
  }
});

export default router;
