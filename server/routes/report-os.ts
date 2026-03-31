import { Router, Request, Response } from 'express';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  reportProgramGroups,
  reportProgramGroupProjects,
  reportProgramGroupSnapshots,
  reportRuns,
  reportSnapshots,
  reportRunDependencies,
  reportTypeRegistry,
  reportScopeEnum,
  type ReportScope,
} from '@shared/schema/report-os';
import { projects } from '@shared/schema';
import { createHash } from 'crypto';
import { z } from 'zod';
import { REPORT_TYPE_SEED } from '../services/report-os/taxonomy';
import { resolveScope } from '../services/report-os/scope-model';
import { computeInitialRun } from '../services/report-os/orchestrator';
import { authMiddleware } from '../auth';

const router = Router();
router.use(authMiddleware);
const canSeedTaxonomy = () =>
  process.env.NODE_ENV !== 'production' ||
  (process.env.REPORT_OS_ALLOW_SEED === 'true' &&
    !!process.env.REPORT_OS_SEED_KEY &&
    process.env.REPORT_OS_SEED_KEY.length > 8);

const createProgramGroupSchema = z.object({
  organizationId: z.number().int().positive(),
  clientWorkspaceId: z.number().int().positive().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  projectIds: z.array(z.number().int().positive()).min(1),
  createdBy: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const createProgramSnapshotSchema = z.object({
  organizationId: z.number().int().positive(),
  snapshotLabel: z.string().optional(),
  snapshotReason: z.string().optional(),
  createdBy: z.number().int().positive().optional(),
});

const createRunSchema = z.object({
  organizationId: z.number().int().positive(),
  clientWorkspaceId: z.number().int().positive().optional(),
  scopeType: z.enum(reportScopeEnum),
  scopeId: z.string().min(1),
  reportTypeId: z.string().min(1),
  requestedBy: z.number().int().positive().optional(),
});

router.get('/scopes', (_req: Request, res: Response) => {
  res.json({ data: reportScopeEnum });
});

router.post('/taxonomy/seed', async (_req: Request, res: Response) => {
  if (!canSeedTaxonomy()) {
    return res.status(403).json({ error: 'taxonomy seeding is disabled in this environment' });
  }
  if (process.env.REPORT_OS_SEED_KEY) {
    const providedKey = _req.headers['x-report-os-seed-key'];
    if (!providedKey || providedKey !== process.env.REPORT_OS_SEED_KEY) {
      return res.status(403).json({ error: 'Invalid seed key' });
    }
  }
  try {
    for (const row of REPORT_TYPE_SEED) {
      await db
        .insert(reportTypeRegistry)
        .values(row)
        .onConflictDoUpdate({
          target: reportTypeRegistry.typeId,
          set: {
            label: row.label,
            family: row.family,
            allowedScopes: row.allowedScopes,
            allowedPersonas: row.allowedPersonas,
            allowedClientSegments: row.allowedClientSegments,
            dataDependencies: row.dataDependencies,
            artifactDependencies: row.artifactDependencies,
            workflowDependencies: row.workflowDependencies,
            anaModules: row.anaModules,
            exportTemplate: row.exportTemplate,
            governanceRequirements: row.governanceRequirements,
            truthfulnessRules: row.truthfulnessRules,
            updatedAt: new Date(),
          },
        });
    }
    return res.json({ success: true, seeded: REPORT_TYPE_SEED.length });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/taxonomy', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(reportTypeRegistry)
      .where(eq(reportTypeRegistry.enabled, true));
    return res.json({ data: rows });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/program-groups', async (req: Request, res: Response) => {
  try {
    const organizationId = Number(req.query.organizationId);
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(400).json({ error: 'organizationId query parameter is required' });
    }
    const includeArchived = req.query.includeArchived === 'true';
    const groups = await db
      .select()
      .from(reportProgramGroups)
      .where(
        includeArchived
          ? eq(reportProgramGroups.organizationId, organizationId)
          : and(
              eq(reportProgramGroups.organizationId, organizationId),
              eq(reportProgramGroups.status, 'active')
            )
      )
      .orderBy(desc(reportProgramGroups.updatedAt));

    const groupIds = groups.map(g => g.id);
    const members =
      groupIds.length > 0
        ? await db
            .select({
              groupId: reportProgramGroupProjects.programGroupId,
              projectId: reportProgramGroupProjects.projectId,
              projectName: projects.name,
              projectType: projects.type,
            })
            .from(reportProgramGroupProjects)
            .innerJoin(projects, eq(projects.id, reportProgramGroupProjects.projectId))
            .where(inArray(reportProgramGroupProjects.programGroupId, groupIds))
        : [];

    const byGroup = new Map<number, any[]>();
    for (const m of members) {
      byGroup.set(m.groupId, [...(byGroup.get(m.groupId) || []), m]);
    }

    return res.json({
      data: groups.map(g => ({
        ...g,
        projects: byGroup.get(g.id) || [],
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/program-groups', async (req: Request, res: Response) => {
  try {
    const parsed = createProgramGroupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const {
      organizationId,
      clientWorkspaceId,
      name,
      description,
      projectIds,
      createdBy,
      metadata,
    } = parsed.data;
    const orgId = organizationId;

    const [group] = await db
      .insert(reportProgramGroups)
      .values({
        organizationId: orgId,
        clientWorkspaceId,
        name,
        description,
        createdBy,
        updatedBy: createdBy,
        metadata,
      })
      .returning();

    const uniqueProjectIds = [
      ...new Set(projectIds.map((id: any) => Number(id)).filter(Number.isFinite)),
    ];
    if (uniqueProjectIds.length > 0) {
      await db.insert(reportProgramGroupProjects).values(
        uniqueProjectIds.map(projectId => ({
          programGroupId: group.id,
          projectId,
          addedBy: createdBy,
        }))
      );
    }

    return res.status(201).json({ data: group });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.patch('/program-groups/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { name, description, status, projectIds, updatedBy, metadata } = req.body;

    const [updated] = await db
      .update(reportProgramGroups)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(metadata !== undefined ? { metadata } : {}),
        ...(status === 'archived' ? { archivedAt: new Date() } : {}),
        updatedBy,
        updatedAt: new Date(),
      })
      .where(eq(reportProgramGroups.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Program group not found' });

    if (Array.isArray(projectIds)) {
      await db
        .delete(reportProgramGroupProjects)
        .where(eq(reportProgramGroupProjects.programGroupId, id));
      const uniqueProjectIds = [
        ...new Set(projectIds.map((v: any) => Number(v)).filter(Number.isFinite)),
      ];
      if (uniqueProjectIds.length > 0) {
        await db.insert(reportProgramGroupProjects).values(
          uniqueProjectIds.map(projectId => ({
            programGroupId: id,
            projectId,
            addedBy: updatedBy,
          }))
        );
      }
    }

    return res.json({ data: updated });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/program-groups/:id/snapshots', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const organizationId = Number(req.query.organizationId);
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(400).json({ error: 'organizationId query parameter is required' });
    }
    const rows = await db
      .select()
      .from(reportProgramGroupSnapshots)
      .where(
        and(
          eq(reportProgramGroupSnapshots.programGroupId, id),
          eq(reportProgramGroupSnapshots.organizationId, organizationId)
        )
      )
      .orderBy(desc(reportProgramGroupSnapshots.asOf));

    return res.json({ data: rows });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/program-groups/:id/snapshots', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const parsed = createProgramSnapshotSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { organizationId: orgId, snapshotLabel, snapshotReason, createdBy } = parsed.data;

    const memberships = await db
      .select({ projectId: reportProgramGroupProjects.projectId })
      .from(reportProgramGroupProjects)
      .innerJoin(
        reportProgramGroups,
        eq(reportProgramGroups.id, reportProgramGroupProjects.programGroupId)
      )
      .where(
        and(
          eq(reportProgramGroupProjects.programGroupId, id),
          eq(reportProgramGroups.organizationId, orgId)
        )
      );

    const projectIds = memberships.map(m => m.projectId).sort((a, b) => a - b);
    const projectSetHash = createHash('sha256').update(JSON.stringify(projectIds)).digest('hex');

    const [snapshot] = await db
      .insert(reportProgramGroupSnapshots)
      .values({
        programGroupId: id,
        organizationId: orgId,
        snapshotLabel,
        snapshotReason,
        projectIds,
        projectSetHash,
        createdBy,
      })
      .returning();

    return res.status(201).json({ data: snapshot });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/runs', async (req: Request, res: Response) => {
  try {
    const parsed = createRunSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const {
      organizationId: orgId,
      clientWorkspaceId,
      scopeType,
      scopeId,
      reportTypeId,
      requestedBy,
    } = parsed.data;

    const type = await db
      .select()
      .from(reportTypeRegistry)
      .where(eq(reportTypeRegistry.typeId, reportTypeId))
      .limit(1);
    if (!type[0]) {
      return res.status(404).json({ error: `Unknown reportTypeId: ${reportTypeId}` });
    }

    if (!(type[0].allowedScopes as ReportScope[]).includes(scopeType)) {
      return res.status(400).json({
        error: `Report type ${reportTypeId} does not allow scope ${scopeType}`,
        allowedScopes: type[0].allowedScopes,
      });
    }

    const scope = resolveScope({ scopeType, scopeId, organizationId: orgId });
    let programProjectIds: number[] | undefined;
    if (scopeType === 'program') {
      const memberships = await db
        .select({ projectId: reportProgramGroupProjects.projectId })
        .from(reportProgramGroupProjects)
        .innerJoin(
          reportProgramGroups,
          eq(reportProgramGroups.id, reportProgramGroupProjects.programGroupId)
        )
        .where(
          and(
            eq(reportProgramGroupProjects.programGroupId, Number(scopeId)),
            eq(reportProgramGroups.organizationId, orgId)
          )
        );
      programProjectIds = memberships.map(m => m.projectId);
    }

    const computed = await computeInitialRun(orgId, scopeType, scopeId, {
      programProjectIds,
    });

    const [run] = await db
      .insert(reportRuns)
      .values({
        organizationId: orgId,
        clientWorkspaceId,
        scopeType,
        scopeId,
        reportTypeId,
        requestedBy,
        status: computed.blockers.length > 0 ? 'partial' : 'completed',
        dependencySummary: {
          providers: computed.providers,
          scopeLineage: scope.lineage,
        },
        blockers: computed.blockers,
        confidence: computed.confidence,
        freshness: {
          generatedAt: new Date().toISOString(),
          freshnessBudgetMs: scope.freshnessBudgetMs,
        },
        completedAt: new Date(),
      })
      .returning();

    const [snapshot] = await db
      .insert(reportSnapshots)
      .values({
        runId: run.id,
        organizationId: orgId,
        scopeType,
        scopeId,
        snapshotVersion: 1,
        isLatest: true,
        snapshotMetadata: {
          reportTypeId,
          providers: computed.providers,
          summary: computed.summary,
          confidence: computed.confidence,
        },
        createdBy: requestedBy,
      })
      .returning();

    if (computed.providers.length > 0) {
      await db.insert(reportRunDependencies).values(
        computed.providers.map(p => ({
          runId: run.id,
          organizationId: orgId,
          provider: p.provider,
          status: p.status,
          blocker: p.blocker,
          observedAt: new Date(p.observedAt),
          payload: {
            scopeType,
            scopeId,
          },
        }))
      );
    }

    return res.status(201).json({
      data: {
        run,
        snapshot,
        blockers: computed.blockers,
        confidence: computed.confidence,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/runs/:id/dependencies', async (req: Request, res: Response) => {
  try {
    const runId = Number(req.params.id);
    const organizationId = Number(req.query.organizationId);
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(400).json({ error: 'organizationId query parameter is required' });
    }
    const rows = await db
      .select()
      .from(reportRunDependencies)
      .where(
        and(
          eq(reportRunDependencies.runId, runId),
          eq(reportRunDependencies.organizationId, organizationId)
        )
      )
      .orderBy(desc(reportRunDependencies.observedAt));

    return res.json({ data: rows });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/runs', async (req: Request, res: Response) => {
  try {
    const organizationId = Number(req.query.organizationId);
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(400).json({ error: 'organizationId query parameter is required' });
    }
    const scopeType = req.query.scopeType as string | undefined;
    const scopeId = req.query.scopeId as string | undefined;

    const rows = await db
      .select()
      .from(reportRuns)
      .where(
        scopeType && scopeId
          ? and(
              eq(reportRuns.organizationId, organizationId),
              eq(reportRuns.scopeType, scopeType),
              eq(reportRuns.scopeId, scopeId)
            )
          : eq(reportRuns.organizationId, organizationId)
      )
      .orderBy(desc(reportRuns.createdAt))
      .limit(100);

    return res.json({ data: rows });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/health', async (_req: Request, res: Response) => {
  try {
    const [groupCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reportProgramGroups);
    const [typeCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reportTypeRegistry);
    const [runCount] = await db.select({ count: sql<number>`count(*)::int` }).from(reportRuns);
    const [snapshotCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reportSnapshots);
    const [dependencyCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reportRunDependencies);
    return res.json({
      data: {
        groups: groupCount?.count ?? 0,
        taxonomyTypes: typeCount?.count ?? 0,
        runs: runCount?.count ?? 0,
        snapshots: snapshotCount?.count ?? 0,
        dependencies: dependencyCount?.count ?? 0,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
