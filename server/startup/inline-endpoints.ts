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

import type { Express, Request, Response } from 'express';
import type { Pool } from 'pg';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('inline-endpoints');

/**
 * Mount fast-path health endpoints BEFORE security/rate-limit/compression.
 * Order is load-bearing: they must short-circuit before any middleware runs.
 */
export function mountFastPathHealthEndpoints(app: Express, pool: Pool): void {
  app.get('/healthz', (_req, res) => res.json({ ok: true, ts: Date.now() }));
  app.get('/readyz', async (_req, res) => {
    try {
      await pool.query('select 1');
      return res.json({ ready: true });
    } catch {
      return res.status(500).json({ ready: false });
    }
  });
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });
}

/**
 * Mount the richer diagnostic endpoints. These run after the security stack.
 */
export function mountDiagnosticEndpoints(app: Express, pool: Pool): void {
  app.get('/api/health/full', async (_req: Request, res: Response) => {
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

  app.get('/api/metrics', async (_req: Request, res: Response) => {
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
