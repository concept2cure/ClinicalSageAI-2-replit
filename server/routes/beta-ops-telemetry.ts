import { Router, Request, Response } from 'express';
import {
  getBetaFlowTelemetrySnapshot,
  resetBetaFlowTelemetry,
} from '../services/telemetry/betaFlowTelemetry';

const router = Router();

function isAdminRole(req: Request): boolean {
  const user = (req as any).user ?? {};
  const role = String(user.role || '').toLowerCase();
  return role === 'admin' || role === 'super_admin';
}

router.get('/beta-telemetry', (req: Request, res: Response) => {
  const telemetryEnabled = process.env.ENABLE_BETA_OPS_TELEMETRY === 'true';
  if (!telemetryEnabled) {
    return res.status(404).json({ error: 'Not found' });
  }

  const shouldReset = String(req.query.reset || 'false').toLowerCase() === 'true';
  const includeErrors = String(req.query.include_errors || 'false').toLowerCase() === 'true';
  const includeResets = String(req.query.include_resets || 'false').toLowerCase() === 'true';
  const isAdmin = isAdminRole(req);

  if (shouldReset) {
    const resetConfirmation = String(req.headers['x-confirm-reset'] || '');
    const resetReason = String(req.query.reason || '').trim();
    if (!isAdmin || resetConfirmation !== 'BETA_TELEMETRY_RESET') {
      return res.status(403).json({
        error: 'Forbidden: beta telemetry reset requires admin role and confirmation header',
      });
    }
    if (resetReason.length < 10) {
      return res.status(400).json({
        error: 'Reset reason is required (min 10 chars) for audit traceability',
      });
    }
  }

  if (includeErrors && !isAdmin) {
    return res.status(403).json({
      error: 'Forbidden: include_errors requires admin role',
    });
  }
  if (includeResets && !isAdmin) {
    return res.status(403).json({
      error: 'Forbidden: include_resets requires admin role',
    });
  }

  if (shouldReset) {
    const user = (req as any).user ?? {};
    resetBetaFlowTelemetry({
      actorId: String(user.id || user.userId || 'unknown'),
      actorRole: String(user.role || 'unknown'),
      reason: String(req.query.reason || ''),
    });
  }
  const snapshot = getBetaFlowTelemetrySnapshot({
    includeErrorEvents: includeErrors,
    includeResetEvents: includeResets,
  });

  return res.json({
    generatedAt: new Date().toISOString(),
    resetApplied: shouldReset,
    ...snapshot,
  });
});

export default router;
