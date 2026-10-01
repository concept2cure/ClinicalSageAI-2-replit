/**
 * Tenant AI placement policy — mounted at /api/ai-placement-policy.
 *
 *   GET  /api/ai-placement-policy   The caller's organization's policy (null = none).
 *   PUT  /api/ai-placement-policy   Replace it. Body: the whole policy plus
 *                                   reasonForChange (see org-placement-writer.ts).
 *
 * The policy decides which AI services may receive this organization's data —
 * residency, zero retention, substrate and vendor allow-lists — and the gateway
 * enforces it on every dispatch. Organization admin or owner only. A change and
 * its chained audit row (before, after, reason) commit together, on the
 * request's own tenant-scoped connection (never the shared pool).
 */

import { Router, type Request, type Response } from 'express';

import { authenticateToken, requireRole } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import { requestConnectable, requestPgClient } from '../db/requestDb';
import { clientIpOf } from '../utils/client-ip';
import { createScopedLogger } from '../utils/logger';
import {
  parsePlacementPolicyInput,
  readOrgPlacementPolicy,
  writeOrgPlacementPolicy,
} from '../services/ai-gateway/providers/org-placement-writer';

const router = Router();
const log = createScopedLogger('ai-placement-policy');
router.use(authenticateToken);
router.use(createRateLimiter());
router.use(requireRole('admin', 'owner'));

function positiveInt(raw: unknown): number | null {
  const n = typeof raw === 'string' ? Number(raw) : raw;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

router.get('/', async (req: Request, res: Response) => {
  const orgId = positiveInt((req as any).user?.organizationId);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'NO_ORGANIZATION', message: 'Organization context required.' } });
  }
  try {
    const policy = await readOrgPlacementPolicy(requestPgClient(req), orgId);
    return res.json({ organizationId: orgId, policy });
  } catch (err) {
    log.error('placement policy read failed', { err: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'The placement policy could not be read.' } });
  }
});

router.put('/', async (req: Request, res: Response) => {
  const orgId = positiveInt((req as any).user?.organizationId);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'NO_ORGANIZATION', message: 'Organization context required.' } });
  }
  const userId = positiveInt((req as any).user?.id);
  if (userId === null) {
    return res.status(401).json({ error: { code: 'NO_USER', message: 'A signed-in user is required to change policy.' } });
  }
  const input = parsePlacementPolicyInput(req.body);
  if (!input.ok) {
    return res.status(422).json({ error: { code: 'INVALID_POLICY', message: input.message } });
  }
  try {
    const result = await writeOrgPlacementPolicy(requestConnectable(req), orgId, input.policy, input.reasonForChange, {
      userId,
      ipAddress: clientIpOf(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });
    return res.json({ organizationId: orgId, ...result, audited: true });
  } catch (err) {
    log.error('placement policy change failed — nothing was changed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return res.status(500).json({
      error: { code: 'INTERNAL', message: 'The placement policy was not changed.' },
    });
  }
});

export default router;
