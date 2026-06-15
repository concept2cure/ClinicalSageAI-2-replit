/**
 * Global markets route.
 *
 * Exposes the global-market registry and the multi-market submission planner so
 * the app UI — not just AnA — can show device/IVD market coverage and plan a
 * submission across markets. Pure compute over caller-supplied content + the
 * static registry; no tenant data is read or written, but auth is required for
 * consistency with the rest of the API.
 *
 * GET  /api/global-markets
 *   → { data: MarketDescriptor[] }   (the registry — all supported markets)
 *
 * POST /api/global-markets/plan
 *   body: { profile: { name, isIvd, riskTier?, intendedUse?, availableArtifacts[] }, targetMarkets[] }
 *   → { data: GlobalSubmissionPlan }
 *
 * HONEST: the planner never claims transmission to any authority — the registry
 * invariant (canTransmit === false everywhere) carries straight through.
 *
 * @module server/routes/global-markets
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../auth';
import { authedOrgId } from '../utils/authedOrgId';
import { listMarkets } from '../services/global-markets/market-registry';
import { planGlobalSubmission } from '../services/mdx-submission-planner/planner';
import type { DeviceProfile } from '../services/mdx-submission-planner/types';
import type { MarketId } from '../services/global-markets/types';

const router = Router();
router.use(authMiddleware);

function requireTenant(req: Request, res: Response): boolean {
  const organizationId = authedOrgId(req);
  if (!Number.isFinite(organizationId as number)) {
    res.status(403).json({ error: 'Tenant context required' });
    return false;
  }
  return true;
}

const planSchema = z.object({
  profile: z.object({
    name: z.string(),
    isIvd: z.boolean(),
    riskTier: z.string().optional(),
    intendedUse: z.string().optional(),
    availableArtifacts: z.array(z.string()).default([]),
  }),
  targetMarkets: z.array(z.string()).default([]),
});

// List the supported markets (the registry).
router.get('/', (req: Request, res: Response) => {
  if (!requireTenant(req, res)) return;
  return res.json({ data: listMarkets() });
});

// Plan a device/IVD submission across the requested markets.
router.post('/plan', (req: Request, res: Response) => {
  if (!requireTenant(req, res)) return;

  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const plan = planGlobalSubmission(
    parsed.data.profile as DeviceProfile,
    parsed.data.targetMarkets as MarketId[],
  );
  return res.json({ data: plan });
});

export default router;
