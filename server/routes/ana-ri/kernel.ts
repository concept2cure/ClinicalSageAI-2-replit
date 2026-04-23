/**
 * Kernel observability + decision-audit endpoints under /api/ana-ri/kernel/*.
 *
 * Extracted from ana-ri.ts as a behaviour-preserving move. Mounted via
 * {@link mountKernelRoutes} on the parent router.
 *
 * @module server/routes/ana-ri/kernel
 */

import type { Request, Response, Router } from 'express';

import { getPool } from '../../db.js';
import { getKernelMetrics } from '../../services/kernel-observability.js';
import { getKernelBetaReadiness } from '../../services/kernel-beta-readiness.js';
import { sendSuccess, sendError } from './shared.js';

/** Register kernel observability + audit endpoints on the given router. */
export function mountKernelRoutes(router: Router): void {
  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/kernel/metrics — Kernel observability summary
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/kernel/metrics', async (req: Request, res: Response) => {
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    const windowDays = req.query.window_days ? Number(req.query.window_days) : 7;
    const metrics = await getKernelMetrics({
      organizationId: orgId ? Number(orgId) : null,
      windowDays: Number.isFinite(windowDays) && windowDays > 0 ? windowDays : 7,
    });
    return sendSuccess(res, metrics);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/kernel/readiness — Beta launch readiness checks
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/kernel/readiness', async (_req: Request, res: Response) => {
    const readiness = await getKernelBetaReadiness();
    return sendSuccess(res, readiness);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/kernel/decisions — List kernel decision records (audit trail)
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/kernel/decisions', async (req: Request, res: Response) => {
    try {
      const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
      const projectId = req.query.projectId ? Number(req.query.projectId) : null;
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const pool = getPool();

      // Build WHERE clause with tenant scoping
      const conditions: string[] = [];
      const params: (number | null)[] = [];
      let paramIdx = 1;

      if (orgId) {
        conditions.push(`organization_id = $${paramIdx++}`);
        params.push(Number(orgId));
      }
      if (projectId && Number.isFinite(projectId)) {
        conditions.push(`project_id = $${paramIdx++}`);
        params.push(projectId);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await pool.query(
        `SELECT COUNT(*) FROM ai_kernel_decision_records ${where}`,
        params,
      );
      const total = Number(countResult.rows[0]?.count ?? 0);

      params.push(limit as any);
      params.push(offset as any);

      const result = await pool.query(
        `SELECT
           id, created_at, request_id, thread_id, route,
           organization_id, user_id, project_id,
           planner_version, orchestrator_name,
           intent_lens, intent_confidence, submission_type,
           selected_task_type, selected_provider, selected_model,
           routing_strategy, selected_tools, alternatives, constraints,
           decision_rationale, estimated_cost_usd, latency_ms,
           outcome, error_message
         FROM ai_kernel_decision_records
         ${where}
         ORDER BY created_at DESC
         LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        params,
      );

      return sendSuccess(res, {
        decisions: result.rows.map((r: any) => ({
          id: r.id,
          createdAt: r.created_at,
          requestId: r.request_id,
          threadId: r.thread_id,
          route: r.route,
          organizationId: r.organization_id,
          userId: r.user_id,
          projectId: r.project_id,
          plannerVersion: r.planner_version,
          orchestratorName: r.orchestrator_name,
          intentLens: r.intent_lens,
          intentConfidence: r.intent_confidence ? Number(r.intent_confidence) : null,
          submissionType: r.submission_type,
          selectedTaskType: r.selected_task_type,
          selectedProvider: r.selected_provider,
          selectedModel: r.selected_model,
          routingStrategy: r.routing_strategy,
          selectedTools: r.selected_tools,
          alternatives: r.alternatives,
          constraints: r.constraints,
          decisionRationale: r.decision_rationale,
          estimatedCostUsd: r.estimated_cost_usd ? Number(r.estimated_cost_usd) : null,
          latencyMs: r.latency_ms,
          outcome: r.outcome,
          errorMessage: r.error_message,
        })),
        total,
        limit,
        offset,
      });
    } catch (error: any) {
      return sendError(res, 500, error?.message || 'Failed to fetch kernel decisions');
    }
  });
}
