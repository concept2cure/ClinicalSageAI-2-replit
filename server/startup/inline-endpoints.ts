/**
 * Inline endpoints that live directly on `app` rather than in a router family.
 *
 * Extracted from server/index.ts. Preserves:
 *  - /healthz, /readyz, /api/health (fast-path, mounted before security middleware)
 *  - /api/health/full (HealthCheckService)
 *  - /api/metrics (Prometheus text format)
 *  - /api/ai-gateway/health (provider health summary)
 *  - /api/time (server-authoritative timestamp, for signature display)
 *  - /api/diag (HTML diagnostic — no React/Vite)
 *  - /api/shadow/health (shadow service proxy)
 */

import type { Express, NextFunction, Request, Response } from 'express';
import type { Pool } from 'pg';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('inline-endpoints');

/** True when a Redis URL is configured. When false, Redis-backed
 *  dependencies (cache, distributed lock, Bull action queue) run in their
 *  in-memory fallback mode, so we treat them as "not configured" → healthy
 *  (skip), never as a failure. */
function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL || process.env.REDIS_TLS_URL);
}

/**
 * Guard for sensitive observability endpoints (/api/metrics,
 * /api/health/full). Allows the request when EITHER:
 *   - a valid JWT is presented (reuses the platform auth middleware), OR
 *   - a bearer token matching METRICS_TOKEN is presented (so Prometheus can
 *     scrape with a shared secret, no user session required).
 *
 * If METRICS_TOKEN is unset, only JWT auth is accepted. The token path is
 * checked first so a scrape never pays the JWT-verification cost.
 */
function requireMetricsAuth(req: Request, res: Response, next: NextFunction): void {
  const metricsToken = process.env.METRICS_TOKEN;
  if (metricsToken) {
    const auth = req.headers.authorization;
    const match = auth ? /^Bearer\s+(\S+)$/i.exec(auth) : null;
    if (match && match[1] === metricsToken) {
      return next();
    }
  }
  // Fall back to the platform JWT auth middleware (loaded lazily to avoid a
  // load-order coupling with the auth module at module-init time).
  void import('../middleware/auth')
    .then(({ authenticateToken }) => authenticateToken(req, res, next))
    .catch(() => {
      res.status(503).json({ error: { code: 'AUTH_UNAVAILABLE', message: 'Auth unavailable' } });
    });
}

/**
 * Mount fast-path health endpoints BEFORE security/rate-limit/compression.
 * Order is load-bearing: they must short-circuit before any middleware runs.
 */
export function mountFastPathHealthEndpoints(app: Express, pool: Pool): void {
  app.get('/healthz', (_req, res) => res.json({ ok: true, ts: Date.now() }));
  app.get('/readyz', async (_req, res) => {
    const deps: Record<string, 'ok' | 'skipped' | 'down'> = {};

    // Database — always required.
    try {
      await pool.query('select 1');
      deps.database = 'ok';
    } catch {
      deps.database = 'down';
    }

    // Redis + Bull action-queue worker tier. Only required when Redis is
    // configured; otherwise the platform runs on in-memory fallbacks, so we
    // skip (treat as healthy) rather than fail readiness.
    if (isRedisConfigured()) {
      try {
        const { isRedisAvailable } = await import('../services/ai-actions/redis-manager.js');
        deps.redis = isRedisAvailable() ? 'ok' : 'down';
      } catch {
        deps.redis = 'down';
      }

      // Worker tier health rides on Redis: the Bull queue cannot accept work
      // without it. getQueueMetrics() returns null when the queue isn't
      // reachable. Skip if the queue was never initialized (null with Redis
      // down is already reflected by the redis check above).
      try {
        const { getQueueMetrics } = await import('../services/ai-actions/action-queue.js');
        const metrics = await getQueueMetrics();
        deps.worker = metrics ? 'ok' : 'down';
      } catch {
        deps.worker = 'down';
      }
    } else {
      deps.redis = 'skipped';
      deps.worker = 'skipped';
    }

    const failed = Object.entries(deps)
      .filter(([, status]) => status === 'down')
      .map(([name]) => name);

    if (failed.length > 0) {
      return res.status(503).json({ ready: false, failed, dependencies: deps });
    }
    return res.json({ ready: true, dependencies: deps });
  });
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });
}

/**
 * Mount the richer diagnostic endpoints. These run after the security stack.
 */
export function mountDiagnosticEndpoints(app: Express, pool: Pool): void {
  app.get('/api/health/full', requireMetricsAuth, async (_req: Request, res: Response) => {
    try {
      const { HealthCheckService } = await import('../lib/health-check.js');
      const healthCheck = new HealthCheckService(pool);
      const result = await healthCheck.checkFull();
      const status = result.status === 'healthy' ? 200 : result.status === 'degraded' ? 200 : 503;
      res.status(status).json(result);
    } catch (err: any) {
      // Log the raw cause server-side; never echo it back. Exception
      // messages from the health checker can carry DB DSN fragments,
      // file paths, env var names — all leakage on a public endpoint.
      logger.error('Health check failed', { err: err?.message ?? String(err) });
      res.status(500).json({ status: 'error' });
    }
  });

  app.get('/api/metrics', requireMetricsAuth, async (_req: Request, res: Response) => {
    try {
      const memUsage = process.memoryUsage();
      const uptime = process.uptime();

      const lines = [
        '# HELP process_memory_heap_used_bytes Heap memory used',
        '# TYPE process_memory_heap_used_bytes gauge',
        `process_memory_heap_used_bytes ${memUsage.heapUsed}`,
        '# HELP process_memory_rss_bytes Resident set size',
        '# TYPE process_memory_rss_bytes gauge',
        `process_memory_rss_bytes ${memUsage.rss}`,
        '# HELP process_uptime_seconds Process uptime',
        '# TYPE process_uptime_seconds gauge',
        `process_uptime_seconds ${uptime}`,
        '# HELP nodejs_active_handles Number of active handles',
        '# TYPE nodejs_active_handles gauge',
        `nodejs_active_handles ${(process as any)._getActiveHandles?.()?.length || 0}`,
      ];

      try {
        const { pool: poolRef } = await import('../db.js');
        if (poolRef) {
          lines.push('# HELP db_pool_total Total connections in pool');
          lines.push('# TYPE db_pool_total gauge');
          lines.push(`db_pool_total ${poolRef.totalCount || 0}`);
          lines.push('# HELP db_pool_idle Idle connections');
          lines.push('# TYPE db_pool_idle gauge');
          lines.push(`db_pool_idle ${poolRef.idleCount || 0}`);
          lines.push('# HELP db_pool_waiting Waiting requests');
          lines.push('# TYPE db_pool_waiting gauge');
          lines.push(`db_pool_waiting ${poolRef.waitingCount || 0}`);
        }
      } catch {}

      // AnA RI metrics — counters + histograms for per-turn telemetry.
      try {
        const { renderAnaRiMetrics } = await import('../services/ana-ri-metrics.js');
        lines.push(...renderAnaRiMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // Submission orchestrator metrics — per-run / per-step counters +
      // histograms + the dedicated SEQ_QUERY_FAILED counter so Alertmanager
      // can fire on the rate independently of other gateway-not-ready causes.
      // See infra/alerts/orchestrator.yml for the rule definitions.
      try {
        const { renderSubmissionOrchestratorMetrics } = await import(
          '../services/submission-orchestrator-metrics.js'
        );
        lines.push(...renderSubmissionOrchestratorMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // FCOI metrics — 21 CFR 54 disclosure lifecycle (C2C-01).
      try {
        const { renderFcoiMetrics } = await import('../services/fcoi-metrics.js');
        lines.push(...renderFcoiMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // HA interaction & commitment metrics (C2C-03).
      try {
        const { renderHaMetrics } = await import('../services/ha-metrics.js');
        lines.push(...renderHaMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // IACUC / animal study governance metrics (C2C-05).
      try {
        const { renderIacucMetrics } = await import('../services/iacuc-metrics.js');
        lines.push(...renderIacucMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // IRB / IEC metrics (C2C-06).
      try {
        const { renderIrbMetrics } = await import('../services/irb-metrics.js');
        lines.push(...renderIrbMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // IBC / biosafety metrics (C2C-07).
      try {
        const { renderIbcMetrics } = await import('../services/ibc-metrics.js');
        lines.push(...renderIbcMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // Nonclinical + SEND metrics (C2C-04).
      try {
        const { renderNonclinicalMetrics } = await import('../services/nonclinical-metrics.js');
        lines.push(...renderNonclinicalMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // eGrants metrics (C2C-14).
      try {
        const { renderGrantsMetrics } = await import('../services/grants-metrics.js');
        lines.push(...renderGrantsMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // Medicare Coverage Analysis metrics (C2C-15).
      try {
        const { renderCoverageMetrics } = await import('../services/coverage-metrics.js');
        lines.push(...renderCoverageMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // Research committee governance metrics (C2C-16).
      try {
        const { renderCommitteeMetrics } = await import('../services/committee-metrics.js');
        lines.push(...renderCommitteeMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // Intelligent grant finder metrics (C2C-14).
      try {
        const { renderGrantFinderMetrics } = await import('../services/grant-finder-metrics.js');
        lines.push(...renderGrantFinderMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // CITI training metrics (C2C-01/02).
      try {
        const { renderCitiMetrics } = await import('../services/citi-metrics.js');
        lines.push(...renderCitiMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // Protocol portfolio metrics (C2C-16).
      try {
        const { renderProtocolPortfolioMetrics } = await import('../services/protocol-portfolio-metrics.js');
        lines.push(...renderProtocolPortfolioMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // Protocol development metrics (C2C-17).
      try {
        const { renderProtocolDevMetrics } = await import('../services/protocol-development-metrics.js');
        lines.push(...renderProtocolDevMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // Protocol risk register metrics (C2C-19).
      try {
        const { renderProtocolRiskMetrics } = await import('../services/protocol-risks-metrics.js');
        lines.push(...renderProtocolRiskMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // Protocol amendments metrics (C2C-18a).
      try {
        const { renderProtocolAmendmentsMetrics } = await import('../services/protocol-amendments-metrics.js');
        lines.push(...renderProtocolAmendmentsMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // Protocol deviations metrics (C2C-18b).
      try {
        const { renderProtocolDeviationsMetrics } = await import('../services/protocol-deviations-metrics.js');
        lines.push(...renderProtocolDeviationsMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // Protocol review & comment metrics (C2C-18c).
      try {
        const { renderProtocolReviewMetrics } = await import('../services/protocol-reviews-metrics.js');
        lines.push(...renderProtocolReviewMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // Informed consent builder metrics (C2C-18d).
      try {
        const { renderConsentMetrics } = await import('../services/protocol-consent-metrics.js');
        lines.push(...renderConsentMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // Protocol templates metrics (C2C-20a).
      try {
        const { renderProtocolTemplatesMetrics } = await import('../services/protocol-templates-metrics.js');
        lines.push(...renderProtocolTemplatesMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // Protocol milestones metrics (C2C-20b).
      try {
        const { renderProtocolMilestonesMetrics } = await import('../services/protocol-milestones-metrics.js');
        lines.push(...renderProtocolMilestonesMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // Protocol export metrics (C2C-20c).
      try {
        const { renderProtocolExportMetrics } = await import('../services/protocol-export-metrics.js');
        lines.push(...renderProtocolExportMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // Protocol SoA matrix metrics (C2C-21).
      try {
        const { renderProtocolSoaMetrics } = await import('../services/protocol-soa-metrics.js');
        lines.push(...renderProtocolSoaMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // Protocol budget metrics (C2C-22).
      try {
        const { renderProtocolBudgetMetrics } = await import('../services/protocol-budget-metrics.js');
        lines.push(...renderProtocolBudgetMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // RIM-lite metrics (C2C-12).
      try {
        const { renderRimMetrics } = await import('../services/rim-metrics.js');
        lines.push(...renderRimMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // Inspection readiness metrics (C2C-13).
      try {
        const { renderInspectionMetrics } = await import('../services/inspection-metrics.js');
        lines.push(...renderInspectionMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // Controlled substances metrics (C2C-15).
      try {
        const { renderCsMetrics } = await import('../services/cs-metrics.js');
        lines.push(...renderCsMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // Lifecycle obligation metrics (C2C-11).
      try {
        const { renderLifecycleMetrics } = await import('../services/lifecycle-metrics.js');
        lines.push(...renderLifecycleMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // eTMF metrics (C2C-08).
      try {
        const { renderEtmfMetrics } = await import('../services/etmf-metrics.js');
        lines.push(...renderEtmfMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // Effort certification metrics (add-on, 2 CFR 200.430).
      try {
        const { renderEffortMetrics } = await import('../services/effort-metrics.js');
        lines.push(...renderEffortMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // Research-security / COI metrics (add-on, NSPM-33 / NOT-OD-26-017).
      try {
        const { renderResearchSecurityMetrics } = await import('../services/research-security-metrics.js');
        lines.push(...renderResearchSecurityMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // RAG retrieval metrics — recorded at the ragRouter chokepoint.
      try {
        const { renderRagMetrics } = await import('../services/rag-runtime-metrics.js');
        lines.push(...renderRagMetrics());
      } catch {
        /* metrics module not loaded yet — skip */
      }

      // Security health gauges. Sourced from the periodic scheduler's
      // cached result so /api/metrics scrapes don't trigger a full
      // panel run (which would do an EICAR scan, chain verify, etc.).
      // Empty when the scheduler hasn't run yet.
      try {
        const { renderSecurityHealthMetrics } = await import(
          '../services/securityHealthScheduler.js'
        );
        const securityMetrics = renderSecurityHealthMetrics();
        if (securityMetrics) {
          // Strip trailing newline; the join below will re-add it.
          lines.push(securityMetrics.trimEnd());
        }
      } catch {
        /* scheduler not loaded yet — skip */
      }

      // prom-client metrics — CER job SLO metrics (server/metrics.js, custom
      // registry) plus globally-registered counters (e.g. RLS tenant-session
      // observability on client.register). Merge both registries so these are
      // actually scraped here; there is no separate metrics server/port.
      try {
        const client = (await import('prom-client')).default;
        const { register: cerRegister } = (await import('../metrics.js')) as unknown as {
          register: import('prom-client').Registry;
        };
        const merged = client.Registry.merge([cerRegister, client.register]);
        lines.push((await merged.metrics()).trimEnd());
      } catch {
        /* prom-client metrics not available yet — skip */
      }

      res.set('Content-Type', 'text/plain; version=0.0.4');
      res.send(lines.join('\n') + '\n');
    } catch (_err: any) {
      res.status(500).send('# Error collecting metrics\n');
    }
  });

  app.get('/api/ai-gateway/health', async (_req: Request, res: Response) => {
    try {
      const { getGateway } = await import('../services/ai-gateway');
      const gw = getGateway();
      if (!gw) {
        return res.status(503).json({
          status: 'unavailable',
          message: 'AI Gateway not initialized',
        });
      }
      const providers = gw.getProviderHealth();
      const enabled = gw.getEnabledProviders();
      const healthyCount = providers.filter((p: any) => p.healthy).length;

      res.json({
        status: healthyCount > 0 ? 'healthy' : 'degraded',
        providers,
        enabledProviders: enabled,
        healthyProviders: healthyCount,
        totalProviders: providers.length,
      });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err?.message });
    }
  });

  app.get('/api/time', (_req: Request, res: Response) => {
    const now = new Date();
    res.json({
      iso: now.toISOString(),
      epoch: now.getTime(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  });

  app.get('/api/diag', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html><head><title>Diag</title></head>
<body style="font-family:system-ui;padding:40px;background:#f0fdf4">
<h1 style="color:#16a34a">✅ Server is alive</h1>
<p>If you see this, the Simple Browser can render HTML from this server.</p>
<p>Timestamp: ${new Date().toISOString()}</p>
<p><a href="/">← Go to main app</a></p>
</body></html>`);
  });

  app.get('/api/shadow/health', async (_req: Request, res: Response) => {
    try {
      const shadowBase = process.env.SHADOW_SERVICE_URL || 'http://localhost:8001';
      const response = await fetch(`${shadowBase}/health`);
      const payload = await response.json();
      if (!response.ok) {
        return res
          .status(response.status)
          .json({ error: 'Shadow service health check failed', details: payload });
      }
      return res.json(payload);
    } catch (error: any) {
      return res
        .status(502)
        .json({ error: 'Shadow service unavailable', message: error?.message || 'Unknown error' });
    }
  });
}
