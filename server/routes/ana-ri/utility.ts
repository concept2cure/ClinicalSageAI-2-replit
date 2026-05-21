/**
 * AnA RI utility endpoints — /health, /evaluate, /observability/*, /commands,
 * /decisions. Read-mostly, no LLM generation. Grouped here because each one
 * is small and none of them share helpers beyond what's in ./shared.ts.
 *
 * Extracted from ana-ri.ts. Mounted via {@link mountUtilityRoutes}.
 *
 * @module server/routes/ana-ri/utility
 */

import type { Request, Response, Router } from 'express';

import { evaluateResponse } from '../../services/ana-ri/evaluation.js';
import {
  getGenerationLog,
  getGenerationStats,
} from '../../services/ana-ri/enforcement.js';
import { decisionLifecycleService } from '../../services/decision-lifecycle-service.js';
import {
  sendSuccess,
  sendError,
  ensureGateway,
  isDatabaseAvailable,
} from './shared.js';

/** Register utility endpoints on the given router. */
export function mountUtilityRoutes(router: Router): void {
  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/health — AnA runtime readiness snapshot
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/health', async (_req: Request, res: Response) => {
    const gw = ensureGateway();
    const enabledProviders = gw?.getEnabledProviders() || [];
    const providerHealth = gw?.getProviderHealth?.() || [];
    const deterministicMode = (gw as any)?.isDeterministicMode?.() || false;
    const databaseAvailable = await isDatabaseAvailable();

    const hasHealthyProvider = providerHealth.some((provider: any) => provider.healthy);
    const providerHealthUnavailable =
      providerHealth.length === 0 && enabledProviders.length > 0;

    const checks = {
      gateway: deterministicMode || enabledProviders.length > 0,
      providersHealthy: deterministicMode || hasHealthyProvider || providerHealthUnavailable,
      database: databaseAvailable,
    };

    const status =
      checks.gateway && checks.providersHealthy && checks.database ? 'healthy' : 'degraded';

    return sendSuccess(res, {
      status,
      checks,
      providers: enabledProviders,
      providerHealth,
      deterministicMode,
      timestamp: new Date().toISOString(),
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/ana-ri/evaluate — Evaluate a response against the rubric
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/evaluate', (req: Request, res: Response) => {
    const { response, context } = req.body;

    if (!response || typeof response !== 'string') {
      return sendError(res, 400, 'Response text is required');
    }

    const evaluation = evaluateResponse(response, context || {});
    return sendSuccess(res, evaluation);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/observability — Runtime generation stats
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/observability', (_req: Request, res: Response) => {
    const stats = getGenerationStats();
    return sendSuccess(res, stats);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/observability/log — Filtered generation log
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/observability/log', (_req: Request, res: Response) => {
    const { route, artifact, orchestrated, limit } = _req.query;
    const log = getGenerationLog({
      route: route as string | undefined,
      artifactCreated: artifact === 'true' ? true : artifact === 'false' ? false : undefined,
      anaRiOrchestrated:
        orchestrated === 'true' ? true : orchestrated === 'false' ? false : undefined,
      limit: limit ? Number(limit) : 100,
    });
    return sendSuccess(res, { count: log.length, events: log });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/commands — List registered command surface
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/commands', async (_req: Request, res: Response) => {
    try {
      const { COMMAND_REGISTRY } = await import('../../services/ana-ri/command-executor.js');
      if (!Array.isArray(COMMAND_REGISTRY)) {
        throw new Error('Command registry unavailable');
      }
      return sendSuccess(res, { commands: COMMAND_REGISTRY });
    } catch (error: any) {
      return sendError(
        res,
        503,
        error?.message || 'Command registry unavailable',
        null,
        'COMMANDS_UNAVAILABLE'
      );
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/decisions — Decision audit trail for current project
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/decisions', async (req: Request, res: Response) => {
    try {
      const { project_id, section_code, module_code, limit } = req.query;

      if (!project_id || typeof project_id !== 'string') {
        return sendError(
          res,
          400,
          'project_id query parameter is required',
          null,
          'MISSING_PROJECT_ID'
        );
      }

      const decisionLimit = Number(limit);
      const safeLimit =
        Number.isFinite(decisionLimit) && decisionLimit > 0
          ? Math.min(Math.floor(decisionLimit), 50)
          : 20;

      const context = decisionLifecycleService.getContradictionDecisionContext(project_id, {
        sectionCode: typeof section_code === 'string' ? section_code : undefined,
        moduleCode: typeof module_code === 'string' ? module_code : undefined,
        limit: safeLimit,
      });

      const decisionAwareStatus = decisionLifecycleService.computeDecisionAwareStatus(
        project_id,
        {
          moduleCode: typeof module_code === 'string' ? module_code : undefined,
        }
      );

      return sendSuccess(res, {
        projectId: project_id,
        count: context.length,
        decisionAwareStatus,
        decisions: context,
      });
    } catch (error: any) {
      return sendError(
        res,
        500,
        error?.message || 'Failed to load decision audit trail',
        null,
        'DECISIONS_FETCH_FAILED'
      );
    }
  });
}
