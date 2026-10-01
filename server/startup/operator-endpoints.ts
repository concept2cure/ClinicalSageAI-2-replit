/**
 * The operator-only diagnostic surface: who may read it, and the AI gateway's
 * health as the process sees it. Split from inline-endpoints.ts on 2026-09-25
 * (security audit 2026-09-24, IAM-18; plan P1-17) when that file crossed the
 * lint size limit; the endpoints themselves are mounted there.
 *
 * @module server/startup/operator-endpoints
 */
import type { NextFunction, Request, Response } from 'express';

/**
 * Guard for the operator observability endpoints (/api/metrics,
 * /api/health/full, /api/health/jobs, /api/ai-gateway/health/detail). Allows
 * the request when EITHER:
 *   - a bearer token matching METRICS_TOKEN is presented (so Prometheus can
 *     scrape with a shared secret, no user session required), OR
 *   - a platform administrator's session is presented (the platform auth
 *     middleware, then requirePlatformAdmin).
 *
 * Until 2026-09-25 any signed-in user passed: every tenant's every user could
 * read the process, pool and job figures (security audit 2026-09-24, IAM-18).
 * If METRICS_TOKEN is unset, only a platform administrator is accepted. The
 * token path is checked first so a scrape never pays the JWT-verification cost.
 */
export function requireMetricsAuth(req: Request, res: Response, next: NextFunction): void {
  const metricsToken = process.env.METRICS_TOKEN;
  if (metricsToken) {
    const auth = req.headers.authorization;
    const match = auth ? /^Bearer\s+(\S+)$/i.exec(auth) : null;
    if (match && match[1] === metricsToken) {
      return next();
    }
  }
  // The platform auth middleware, then the platform-administrator check
  // (both loaded lazily to avoid a load-order coupling at module-init time).
  void Promise.all([import('../middleware/auth'), import('../middleware/requirePlatformAdmin')])
    .then(([{ authenticateToken }, { requirePlatformAdmin }]) =>
      authenticateToken(req, res, (err?: unknown) => {
        if (err) return next(err);
        void requirePlatformAdmin(req, res, next);
      }),
    )
    .catch(() => {
      res.status(503).json({ error: { code: 'AUTH_UNAVAILABLE', message: 'Auth unavailable' } });
    });
}

/**
 * The AI gateway's health as the process sees it. The public endpoint sends
 * the status word alone; the detail (which providers are configured, their
 * health, latency and error rates) is for operators (security audit
 * 2026-09-24, IAM-18: the detail was public, and an exception's message was
 * echoed to whoever asked).
 */
export async function gatewayHealthSummary(): Promise<
  | { status: 'unavailable' }
  | { status: 'healthy' | 'degraded'; providers: unknown[]; enabledProviders: unknown[]; healthyProviders: number; totalProviders: number }
> {
  const { getGateway } = await import('../services/ai-gateway');
  const gw = getGateway();
  if (!gw) return { status: 'unavailable' };
  const providers = gw.getProviderHealth();
  const enabled = gw.getEnabledProviders();
  const healthyCount = providers.filter((p: any) => p.healthy).length;
  return {
    status: healthyCount > 0 ? 'healthy' : 'degraded',
    providers,
    enabledProviders: enabled,
    healthyProviders: healthyCount,
    totalProviders: providers.length,
  };
}

