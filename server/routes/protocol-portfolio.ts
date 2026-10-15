/**
 * Protocol Portfolio Analytics API — Capability C2C-16
 *
 * Read-only, org-scoped analytics across all IACUC protocols and IRB submissions:
 * expiration buckets, overdue/expiring lists, and a prioritized needs-attention
 * list for managing many protocols at once. Mounted at /api/protocol-portfolio.
 *
 * @module server/routes/protocol-portfolio
 */

import { Router, type Request, type Response } from 'express';
import { getPortfolioAnalytics } from '../services/protocols/protocol-portfolio-service';
import { recordPortfolioView } from '../services/protocol-portfolio-metrics';
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';

const router = Router();
const log = createScopedLogger('protocol-portfolio');

function resolveOrgId(req: Request): number | null {
  const r = req as any;
  const raw = r.tenantId ?? r.organizationId ?? r.user?.organizationId ?? r.user?.tenantId;
  const n = raw == null ? NaN : typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}
function fail(res: Response, err: unknown): void {
  serverError(res, log, 'handling the protocol portfolio request', err);
}

router.get('/analytics', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const summary = await getPortfolioAnalytics(orgId);
    recordPortfolioView();
    res.json(summary);
  } catch (err) { fail(res, err); }
});

export default router;
