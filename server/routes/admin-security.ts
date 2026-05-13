/**
 * Admin security-health endpoint.
 *
 * GET /api/admin/security-health
 *
 *   Runs the security self-test panel (server/services/securityHealth.ts)
 *   and returns the report as JSON. Admin role required — the report
 *   contains environment posture information (JWT secret length,
 *   ClamAV reachability, audit-chain status) that's not for end users.
 *
 *   Response shape:
 *
 *     {
 *       "overall": "healthy" | "degraded" | "failing",
 *       "checkedAt": "2026-05-13T...",
 *       "checks": [
 *         { "name": "jwt_secret_strength", "status": "pass", "critical": true, "durationMs": 1 },
 *         { "name": "clamav_connectivity", "status": "pass", "critical": true, ... },
 *         ...
 *       ]
 *     }
 *
 *   Response status maps from the overall field:
 *     overall: healthy  → 200
 *     overall: degraded → 200 (degraded ops still serve traffic)
 *     overall: failing  → 503 (page on this)
 *
 *   The endpoint itself emits an audit event so admins can see who
 *   ran the check and when.
 */

import { Router, type Request, type Response } from 'express';
import { authMiddleware, requireAdminRole } from '../auth.js';
import { getPool } from '../db.js';
import { runSecurityHealthChecks } from '../services/securityHealth';
import { getLastSecurityHealthReport } from '../services/securityHealthScheduler';
import auditService from '../services/auditService';
import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('admin-security');
const router = Router();

/**
 * Maximum age (ms) of a cached report we'll serve without re-running.
 * Default matches the scheduler's prod interval so the cached value is
 * always "fresh" by scheduler standards. Callers wanting a guaranteed-
 * fresh result can pass ?fresh=1 to bypass the cache.
 */
const MAX_CACHED_AGE_MS = 5 * 60 * 1000;

router.use(authMiddleware);
router.use(requireAdminRole);

router.get('/security-health', async (req: Request, res: Response) => {
  const pool = getPool();
  const forceFresh = req.query.fresh === '1';

  try {
    // Prefer the cached result from the periodic scheduler when it's
    // recent enough — running the full panel (EICAR scan, chain
    // verify) costs ~1s with clamd and a few hundred ms otherwise.
    // Callers that need a guaranteed-fresh value pass ?fresh=1.
    let report;
    let fromCache = false;
    if (!forceFresh) {
      const cached = getLastSecurityHealthReport();
      if (cached.report && cached.ageMs != null && cached.ageMs < MAX_CACHED_AGE_MS) {
        report = cached.report;
        fromCache = true;
      }
    }
    if (!report) {
      report = await runSecurityHealthChecks(pool);
    }

    const httpStatus = report.overall === 'failing' ? 503 : 200;
    if (fromCache) {
      res.setHeader('X-Security-Health-Cached', '1');
    }

    // Audit who looked. The check itself can reveal posture (e.g.
    // ClamAV reachable / unreachable) which is useful for SOC.
    try {
      const user = (req as any).user;
      await auditService.logAction({
        tenantId: user?.organizationId,
        userId: user?.id ?? user?.userId,
        action: 'admin_security_health_check',
        resourceType: 'security_event',
        resourceId: 'security-health',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
        details: { overall: report.overall },
      });
    } catch {
      /* audit failure is non-fatal */
    }

    res.status(httpStatus).json(report);
  } catch (err) {
    log.error('Security-health endpoint threw', {
      err: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({
      error: 'Security-health check failed to run',
    });
  }
});

export default router;
