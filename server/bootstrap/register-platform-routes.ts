import type { Express, NextFunction, Request, Response } from 'express';

interface PlatformRouteContext {
  app: Express;
  pool: any;
  authMiddleware: (req: Request, res: Response, next: NextFunction) => unknown;
}

export async function registerPlatformRoutes({ app, pool, authMiddleware }: PlatformRouteContext) {
  app.get('/healthz', (_req, res) => res.json({ ok: true, ts: Date.now() }));
  app.get('/readyz', async (_req, res) => {
    try {
      await pool.query('select 1');
      return res.json({ ready: true });
    } catch {
      return res.status(500).json({ ready: false });
    }
  });

  app.get('/api/health', async (_req: Request, res: Response) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  app.get('/api/health/full', async (_req: Request, res: Response) => {
    try {
      const { HealthCheckService } = await import('../lib/health-check.js');
      const healthCheck = new HealthCheckService(pool);
      const result = await healthCheck.checkFull();
      const status = result.status === 'healthy' ? 200 : result.status === 'degraded' ? 200 : 503;
      res.status(status).json(result);
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err?.message });
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
        const { pool } = await import('../db.js');
        if (pool) {
          lines.push('# HELP db_pool_total Total connections in pool');
          lines.push('# TYPE db_pool_total gauge');
          lines.push(`db_pool_total ${pool.totalCount || 0}`);
          lines.push('# HELP db_pool_idle Idle connections');
          lines.push('# TYPE db_pool_idle gauge');
          lines.push(`db_pool_idle ${pool.idleCount || 0}`);
          lines.push('# HELP db_pool_waiting Waiting requests');
          lines.push('# TYPE db_pool_waiting gauge');
          lines.push(`db_pool_waiting ${pool.waitingCount || 0}`);
        }
      } catch {}

      res.set('Content-Type', 'text/plain; version=0.0.4');
      res.send(lines.join('\n') + '\n');
    } catch {
      res.status(500).send('# Error collecting metrics\n');
    }
  });

  app.get('/api/ai-gateway/health', async (_req: Request, res: Response) => {
    try {
      const { getGateway } = await import('../services/ai-gateway');
      const gw = getGateway();
      if (!gw) {
        return res.status(503).json({ status: 'unavailable', message: 'AI Gateway not initialized' });
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
    res.json({ iso: now.toISOString(), epoch: now.getTime(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  });

  app.get('/api/diag', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html><html><head><title>Diag</title></head><body style="font-family:system-ui;padding:40px;background:#f0fdf4"><h1 style="color:#16a34a">✅ Server is alive</h1><p>If you see this, the Simple Browser can render HTML from this server.</p><p>Timestamp: ${new Date().toISOString()}</p><p><a href="/">← Go to main app</a></p></body></html>`);
  });

  try {
    const authModule = await import('../routes/auth');
    const authRouter = authModule.default;
    if (authRouter && (typeof authRouter === 'function' || (authRouter as any).handle)) {
      app.use('/api/auth', authRouter);
      app.use('/api/v1/auth', authRouter);
    }
  } catch (error) {
    console.error('❌ Failed to mount auth routes:', error);
  }

  try {
    const usersModule = await import('../routes/users');
    const usersRouter = usersModule.default;
    if (usersRouter && (typeof usersRouter === 'function' || (usersRouter as any).handle)) {
      app.use('/api/users', usersRouter);
      app.use('/api/user', usersRouter);
    }
  } catch (error) {
    console.error('❌ Failed to mount users routes:', error);
  }

  app.post('/api/login', (_req, res) => res.redirect(307, '/api/auth/login'));
  app.post('/api/logout', (_req, res) => res.redirect(307, '/api/auth/logout'));
  app.post('/api/register', (_req, res) => res.redirect(307, '/api/auth/signup'));

  try {
    const authEnterpriseModule = await import('../routes/authEnterprise');
    const authEnterpriseRouter = authEnterpriseModule.default;
    if (authEnterpriseRouter && (typeof authEnterpriseRouter === 'function' || (authEnterpriseRouter as any).handle)) {
      app.use('/api/auth/enterprise', authEnterpriseRouter);
    }
  } catch (error) {
    console.error('❌ Failed to mount enterprise auth routes:', error);
  }

  try {
    const ssoModule = await import('../routes/sso');
    const ssoRouter = ssoModule.default;
    if (ssoRouter && (typeof ssoRouter === 'function' || (ssoRouter as any).handle)) {
      app.use('/api/auth/sso', ssoRouter);
    }
  } catch {
    console.warn('⚠️ SSO helper routes not mounted - continuing without SSO helpers');
  }

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const openPrefixes = [
      '/api/auth','/api/login','/api/logout','/api/register','/api/health','/api/health/full','/api/metrics','/api/cortex/health','/api/claude/health','/api/ai-gateway/health','/api/claude/models',
    ];
    const fullPath = req.baseUrl + req.path;
    const isOpen = openPrefixes.some(p => fullPath === p || fullPath.startsWith(p + '/'));
    if (isOpen) return next();
    return authMiddleware(req, res, next);
  });

  console.log('✅ Platform health/auth routes mounted');
}
