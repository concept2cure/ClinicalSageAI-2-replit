/**
 * Predicate-Intelligence shadow service — ops health probes.
 *
 * Mounted at /api/_ops/predicate-intelligence/. Unauthenticated by design:
 * Kubernetes liveness/readiness probes do not carry a user JWT, and the
 * existing GET /api/predicate-intelligence/health endpoint is gated behind
 * authenticateToken so it is not usable as a probe.
 *
 * Endpoints:
 *   GET /live   200 if the BFF is up (no upstream check). Liveness probe target.
 *   GET /ready  200 if the BFF can reach the shadow service AND configuration
 *               is complete; 503 otherwise. Readiness probe target.
 *   GET /info   non-secret config snapshot useful for the ops dashboard.
 *
 * Notes:
 *   - This router exposes no business data and no per-tenant information.
 *   - The shadow probe uses a hard 2s timeout to prevent slow probes from
 *     cascading into pod restarts.
 */

import { Router } from 'express';

const router = Router();

const PROBE_TIMEOUT_MS = 2_000;

function getShadowUrl(): string {
  return process.env.SHADOW_SERVICE_URL || 'http://localhost:8001';
}

function getAdminToken(): string {
  return process.env.REVIEW_ADMIN_TOKEN || '';
}

router.get('/live', (_req, res) => {
  res.status(200).json({ status: 'live' });
});

router.get('/ready', async (_req, res) => {
  const reasons: string[] = [];
  const adminToken = getAdminToken();
  if (!adminToken) reasons.push('REVIEW_ADMIN_TOKEN missing');

  const shadowUrl = getShadowUrl();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);

  let shadowStatus: number | null = null;
  let shadowError: string | null = null;
  try {
    const url = new URL('/predicate/health', shadowUrl);
    const upstream = await fetch(url.toString(), {
      method: 'GET',
      headers: adminToken ? { 'X-Admin-Token': adminToken } : {},
      signal: ctrl.signal,
    });
    shadowStatus = upstream.status;
    if (upstream.status >= 500) {
      reasons.push(`shadow returned ${upstream.status}`);
    } else if (upstream.status === 503) {
      reasons.push('shadow reports degraded');
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      shadowError = `shadow probe timed out after ${PROBE_TIMEOUT_MS}ms`;
    } else if (err instanceof Error) {
      shadowError = err.message;
    } else {
      shadowError = 'shadow probe failed';
    }
    reasons.push(shadowError);
  } finally {
    clearTimeout(timer);
  }

  if (reasons.length > 0) {
    return res.status(503).json({
      status: 'unready',
      reasons,
      shadow: { url: shadowUrl, status: shadowStatus, error: shadowError },
    });
  }
  res.status(200).json({
    status: 'ready',
    shadow: { url: shadowUrl, status: shadowStatus },
  });
});

router.get('/info', (_req, res) => {
  res.json({
    shadowUrl: getShadowUrl(),
    adminTokenConfigured: getAdminToken().length > 0,
    probeTimeoutMs: PROBE_TIMEOUT_MS,
  });
});

export default router;
