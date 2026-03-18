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
import { getSentinelScheduler } from '../services/sentinel/scheduler';
import type { SentinelAnalyzerType } from '../services/sentinel/types';

const router = Router();
const pool = getPool();

const analyzerTypes: SentinelAnalyzerType[] = [
  'deadline_risk',
  'cross_project',
  'regulatory_change',
  'quality_drift',
  'budget_burn',
];

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
    console.error('[SentinelAPI] Error fetching status:', error);
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

    const scheduler = getSentinelScheduler(pool);
    const sentinel = scheduler.getSentinel();

    const result = await sentinel.getFindings(organizationId, {
      projectId: req.query.projectId ? parseInt(req.query.projectId as string, 10) : undefined,
      analyzerType: req.query.analyzerType as string | undefined,
      status: req.query.status as string | undefined,
      severity: req.query.severity as string | undefined,
      limit: Math.min(parseInt(req.query.limit as string, 10) || 50, 200),
      offset: parseInt(req.query.offset as string, 10) || 0,
    });

    res.json(result);
  } catch (error) {
    console.error('[SentinelAPI] Error fetching findings:', error);
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
    const scheduler = getSentinelScheduler(pool);
    const sentinel = scheduler.getSentinel();

    const updated = await sentinel.updateFindingStatus(
      req.params.findingId,
      organizationId,
      data.status,
      data.resolvedById
    );

    if (!updated) return res.status(404).json({ error: 'Finding not found' });
    res.json(updated);
  } catch (error) {
    console.error('[SentinelAPI] Error updating finding:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid update data', details: error.errors });
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
    console.error('[SentinelAPI] Error running scan:', error);
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
    console.error('[SentinelAPI] Error running single scan:', error);
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
    console.error('[SentinelAPI] Error fetching config:', error);
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
    console.error('[SentinelAPI] Error updating config:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid config data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update config' });
  }
});

export default router;
