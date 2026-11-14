/**
 * AI Sentinel API Routes
 *
 * Endpoints for the proactive monitoring system.
 *
 *   GET    /api/sentinel/status            — Health + summary stats
 *   GET    /api/sentinel/findings          — List findings (filterable)
 *   PATCH  /api/sentinel/findings/:id      — Update finding status
 *   POST   /api/sentinel/scan              — Trigger on-demand scan
 *   POST   /api/sentinel/scan/:type        — Trigger single analyzer
 *   GET    /api/sentinel/config            — Get sentinel config
 *   PATCH  /api/sentinel/config            — Update sentinel config
 *
 * @module server/routes/sentinel-routes.ts
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../db';
import { getTenantContext } from '../utils/tenantContext';
import { authedUserId } from '../utils/authedActor';
import { getSentinelScheduler } from '../services/sentinel/scheduler';
import { findingNamedProjectIds } from '../services/sentinel/sentinel';
import type { SentinelAnalyzerType } from '../services/sentinel/types';
import { ProgramReadAccessError, readCurrentProgramActor } from '../services/c2c/current-program-access';
import { namedProjectsWithRoot, type NamedProject } from '../services/c2c/program-project-anchor';
import { getAccessibleReportProjectIds } from '../services/report-os/project-access';

import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('sentinel-routes');

const router = Router();
const pool = getPool();

const analyzerTypes: SentinelAnalyzerType[] = [
  'deadline_risk',
  'cross_project',
  'regulatory_change',
  'quality_drift',
  'budget_burn',
];

/* The projects the person can open, by the project sharing policy Projects lists by (P-122, 2026-11-10). Production
   serves the findings read and the finding update for the Projects page's "at risk" answer, so a finding is shown
   or changed only when every project it names is one the person can open. A check that cannot run answers 503, never
   the organization's whole list. */
async function readableProjectIds(req: Request, organizationId: number): Promise<number[]> {
  const userId = authedUserId(req);
  const actor = await readCurrentProgramActor(pool, { organizationId, userId: userId ?? undefined });
  // Openable: a project deleted in Projects is not one the person can open, so its findings are not listed
  // (seen in the running app, 2026-11-12: a deleted project's "3 days overdue" stayed in the answer).
  return getAccessibleReportProjectIds(organizationId, actor, pool, { openable: true });
}

/** Each finding with the projects it names, as the blockers and the work due carry theirs (submission-ops.ts
 *  `withNamedProjects`, 2026-11-12): `project` is the finding's own project and `projects` every project it names, its
 *  own first. Each is the project and its root, the filing project a card on Projects carries; the root is named only
 *  when the person can open it. The names come from `projects`, by id. A label stored in `affected_items` is not used:
 *  until 2026-11-12 the over-allocation finding stored them on the wrong ids. Fields and order are the finding's own. */
async function withNamedProjects<T extends { project_id?: unknown; affected_items?: unknown }>(organizationId: number,
  readable: readonly number[], findings: readonly T[]): Promise<Array<T & { project: NamedProject | null; projects: NamedProject[] }>> {
  const named = (finding: T) => findingNamedProjectIds(finding).filter((id) => Number.isSafeInteger(id) && id > 0);
  const ids = [...new Set(findings.flatMap(named))];
  if (ids.length === 0) return findings.map((finding) => ({ ...finding, project: null, projects: [] }));
  const projects = await namedProjectsWithRoot(pool, organizationId, ids, new Set(readable));
  return findings.map((finding) => ({
    ...finding,
    project: projects.get(Number(finding.project_id)) ?? null,
    projects: named(finding).map((id) => projects.get(id)).filter((p): p is NamedProject => p !== undefined),
  }));
}

/** Whether the finding exists and every project it names is one the person can open. Throws when that cannot be read. */
async function findingIsReadable(
  req: Request,
  sentinel: { findingProjectIds(findingId: string, organizationId: number): Promise<number[] | null> },
  findingId: string,
  organizationId: number,
): Promise<boolean> {
  const named = await sentinel.findingProjectIds(findingId, organizationId);
  if (!named) return false;
  const readable = await readableProjectIds(req, organizationId);
  return named.every((id) => readable.includes(id));
}

function projectAccessFailure(res: Response, error: unknown): Response {
  if (error instanceof ProgramReadAccessError) return res.status(error.status).json({ error: error.message, code: error.code });
  logger.error('Project access could not be read', { err: error instanceof Error ? error.message : String(error) });
  return res.status(503).json({ error: 'Current project access could not be verified. Nothing was read or changed.', code: 'PROJECT_ACCESS_UNAVAILABLE' });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sentinel/status — Health + summary
// ─────────────────────────────────────────────────────────────────────────────

router.get('/status', async (req: Request, res: Response) => {
  try {
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) return res.status(400).json({ error: tenantContext.error });
    const { organizationId } = tenantContext;

    const scheduler = getSentinelScheduler(pool);
    const sentinel = scheduler.getSentinel();
    const config = await sentinel.getConfig(organizationId);
    const summary = await sentinel.getSummary(organizationId);

    res.json({
      status: 'operational',
      enabled: config.enabled,
      intervalMinutes: config.intervalMinutes,
      analyzers: config.analyzers,
      summary,
    });
  } catch (error) {
    logger.error('Error fetching status', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to fetch sentinel status' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sentinel/findings — List findings
// ─────────────────────────────────────────────────────────────────────────────

router.get('/findings', async (req: Request, res: Response) => {
  try {
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) return res.status(400).json({ error: tenantContext.error });
    const { organizationId } = tenantContext;

    let readable: number[];
    try {
      readable = await readableProjectIds(req, organizationId);
    } catch (error) {
      return projectAccessFailure(res, error);
    }

    const scheduler = getSentinelScheduler(pool);
    const sentinel = scheduler.getSentinel();

    const result = await sentinel.getFindings(organizationId, {
      readableProjectIds: readable,
      projectId: req.query.projectId ? parseInt(req.query.projectId as string, 10) : undefined,
      analyzerType: req.query.analyzerType as string | undefined,
      status: req.query.status as string | undefined,
      severity: req.query.severity as string | undefined,
      limit: Math.min(parseInt(req.query.limit as string, 10) || 50, 200),
      offset: parseInt(req.query.offset as string, 10) || 0,
    });

    res.json({ ...result, findings: await withNamedProjects(organizationId, readable, result.findings) });
  } catch (error) {
    logger.error('Error fetching findings', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to fetch findings' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/sentinel/findings/:findingId — Update finding status
// ─────────────────────────────────────────────────────────────────────────────

const updateFindingSchema = z.object({
  status: z.enum(['open', 'acknowledged', 'resolved', 'dismissed']),
  resolvedById: z.number().optional(),
});

router.patch('/findings/:findingId', async (req: Request, res: Response) => {
  try {
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) return res.status(400).json({ error: tenantContext.error });
    const { organizationId } = tenantContext;

    const data = updateFindingSchema.parse(req.body);
    // Who closed a finding (resolved or dismissed) is the session's user
    // (ledger L195). The body's resolvedById used to be stored as given, and an
    // absent one stored no resolver at all. A body naming anyone else is
    // refused, not ignored.
    const userId = authedUserId(req);
    if (data.resolvedById !== undefined && data.resolvedById !== userId) {
      return res.status(422).json({ error: 'resolvedById is the signed-in user; it cannot name anyone else' });
    }
    if ((data.status === 'resolved' || data.status === 'dismissed') && userId === null) {
      return res.status(401).json({ error: 'Authentication required to close a finding' });
    }
    const scheduler = getSentinelScheduler(pool);
    const sentinel = scheduler.getSentinel();

    /* A finding on a project the person cannot open is answered as one that does not exist (P-122). */
    let admitted: boolean;
    try {
      admitted = await findingIsReadable(req, sentinel, String(req.params.findingId), organizationId);
    } catch (error) {
      return projectAccessFailure(res, error);
    }
    if (!admitted) return res.status(404).json({ error: 'Finding not found' });

    const updated = await sentinel.updateFindingStatus(
      String(req.params.findingId),
      organizationId,
      data.status,
      userId ?? undefined
    );

    if (!updated) return res.status(404).json({ error: 'Finding not found' });
    res.json(updated);
  } catch (error) {
    logger.error('Error updating finding', { err: error instanceof Error ? error.message : String(error) });
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid update data', details: error.issues });
    }
    res.status(500).json({ error: 'Failed to update finding' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sentinel/scan — Run full scan
// ─────────────────────────────────────────────────────────────────────────────

router.post('/scan', async (req: Request, res: Response) => {
  try {
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) return res.status(400).json({ error: tenantContext.error });
    const { organizationId } = tenantContext;

    const scheduler = getSentinelScheduler(pool);
    const sentinel = scheduler.getSentinel();

    const results = await sentinel.scan(organizationId);

    const summary = results.reduce(
      (acc, r) => ({
        totalFindings: acc.totalFindings + r.findings.length,
        analyzersRun: acc.analyzersRun + 1,
        totalDurationMs: acc.totalDurationMs + r.durationMs,
        projectsScanned: acc.projectsScanned + r.projectsScanned,
        bySeverity: {
          critical:
            acc.bySeverity.critical + r.findings.filter(f => f.severity === 'critical').length,
          high: acc.bySeverity.high + r.findings.filter(f => f.severity === 'high').length,
          medium: acc.bySeverity.medium + r.findings.filter(f => f.severity === 'medium').length,
          low: acc.bySeverity.low + r.findings.filter(f => f.severity === 'low').length,
          info: acc.bySeverity.info + r.findings.filter(f => f.severity === 'info').length,
        },
      }),
      {
        totalFindings: 0,
        analyzersRun: 0,
        totalDurationMs: 0,
        projectsScanned: 0,
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      }
    );

    res.json({
      message: 'Scan completed',
      summary,
      results: results.map(r => ({
        analyzerType: r.analyzerType,
        findingsCount: r.findings.length,
        projectsScanned: r.projectsScanned,
        durationMs: r.durationMs,
      })),
    });
  } catch (error) {
    logger.error('Error running scan', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to run scan' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sentinel/scan/:type — Run single analyzer
// ─────────────────────────────────────────────────────────────────────────────

router.post('/scan/:type', async (req: Request, res: Response) => {
  try {
    const analyzerType = req.params.type as SentinelAnalyzerType;
    if (!analyzerTypes.includes(analyzerType)) {
      return res.status(400).json({
        error: `Invalid analyzer type. Must be one of: ${analyzerTypes.join(', ')}`,
      });
    }

    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) return res.status(400).json({ error: tenantContext.error });
    const { organizationId } = tenantContext;

    const scheduler = getSentinelScheduler(pool);
    const sentinel = scheduler.getSentinel();

    const result = await sentinel.scanSingle(organizationId, analyzerType);

    res.json({
      message: `${analyzerType} scan completed`,
      analyzerType: result.analyzerType,
      findingsCount: result.findings.length,
      projectsScanned: result.projectsScanned,
      durationMs: result.durationMs,
      findings: result.findings,
    });
  } catch (error) {
    logger.error('Error running single scan', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to run scan' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sentinel/config — Get config
// ─────────────────────────────────────────────────────────────────────────────

router.get('/config', async (req: Request, res: Response) => {
  try {
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) return res.status(400).json({ error: tenantContext.error });
    const { organizationId } = tenantContext;

    const scheduler = getSentinelScheduler(pool);
    const sentinel = scheduler.getSentinel();
    const config = await sentinel.getConfig(organizationId);

    res.json(config);
  } catch (error) {
    logger.error('Error fetching config', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/sentinel/config — Update config
// ─────────────────────────────────────────────────────────────────────────────

const updateConfigSchema = z.object({
  enabled: z.boolean().optional(),
  intervalMinutes: z.number().min(5).max(1440).optional(),
  analyzers: z
    .object({
      deadline_risk: z.boolean().optional(),
      cross_project: z.boolean().optional(),
      regulatory_change: z.boolean().optional(),
      quality_drift: z.boolean().optional(),
      budget_burn: z.boolean().optional(),
    })
    .optional(),
  thresholds: z
    .object({
      deadlineWarningDays: z.number().min(1).max(90).optional(),
      budgetBurnThreshold: z.number().min(50).max(100).optional(),
      qualityDriftThreshold: z.number().min(10).max(90).optional(),
      riskEscalationLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    })
    .optional(),
});

router.patch('/config', async (req: Request, res: Response) => {
  try {
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) return res.status(400).json({ error: tenantContext.error });
    const { organizationId } = tenantContext;

    const data = updateConfigSchema.parse(req.body);
    const scheduler = getSentinelScheduler(pool);
    const sentinel = scheduler.getSentinel();

    const updated = await sentinel.updateConfig(organizationId, data as any);

    // Reschedule if interval or enabled changed
    if (data.enabled !== undefined || data.intervalMinutes !== undefined) {
      await scheduler.scheduleOrg(organizationId);
    }

    res.json(updated);
  } catch (error) {
    logger.error('Error updating config', { err: error instanceof Error ? error.message : String(error) });
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid config data', details: error.issues });
    }
    res.status(500).json({ error: 'Failed to update config' });
  }
});

export default router;
