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
import auditService from '../services/auditService';
import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('admin-security');
const router = Router();

router.use(authMiddleware);
router.use(requireAdminRole);

router.get('/security-health', async (req: Request, res: Response) => {
  const pool = getPool();
  try {
    const report = await runSecurityHealthChecks(pool);
    const httpStatus = report.overall === 'failing' ? 503 : 200;

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
