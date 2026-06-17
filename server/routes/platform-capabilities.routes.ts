/**
 * Platform capabilities — one cross-surface discovery call for the UI shell.
 *
 * GET /api/platform/capabilities returns the unified, normalized catalog across
 * every deterministic platform surface (global-RI, Submission Center, …). Mounted
 * with authenticateToken at mount time.
 */

import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import { getPlatformCatalog } from '../services/platform/platform-capabilities';
import {
  getProviderCatalog,
  getTenantProviderResolver,
  isClientSelectableProvider,
} from '../services/ai-gateway/providers/provider-preference';

const router = Router();
const limiter = createRateLimiter();
const AUTHOR = 'regulatory-author';

/** The unified platform capability catalog (cross-surface). */
router.get('/capabilities', limiter, requireRole(AUTHOR), (_req: Request, res: Response) => {
  res.json(getPlatformCatalog());
});

/**
 * The client AI-provider catalog (Claude-first) + this tenant's current default.
 * The UI renders the provider chooser from this.
 */
router.get('/ai-providers', limiter, requireRole(AUTHOR), async (req: Request, res: Response) => {
  const orgId = (req as any).user?.organizationId;
  try {
    const tenantDefault = await getTenantProviderResolver().resolve(orgId);
    res.json(getProviderCatalog(tenantDefault));
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed to load providers.' } });
  }
});

/**
 * Set this tenant's default AI provider. Body: { provider }.
 * Provider choice never overrides residency/ZDR compliance (gateway-enforced).
 */
router.put('/ai-providers/preference', limiter, requireRole(AUTHOR), async (req: Request, res: Response) => {
  const orgId = (req as any).user?.organizationId;
  const provider = (req.body && typeof req.body === 'object' ? req.body.provider : undefined) as string | undefined;
  if (orgId === undefined || orgId === null) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'No tenant (organizationId) on the request.' } });
  }
  if (!provider || !isClientSelectableProvider(provider)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'A client-selectable provider is required.' } });
  }
  const resolver = getTenantProviderResolver();
  if (!resolver.setPreference) {
    return res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Tenant provider preference is read-only in this deployment.' } });
  }
  try {
    await resolver.setPreference(orgId, provider);
    res.json({ organizationId: orgId, provider });
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL', message: err instanceof Error ? err.message : 'Failed to set preference.' } });
  }
});

export default router;
