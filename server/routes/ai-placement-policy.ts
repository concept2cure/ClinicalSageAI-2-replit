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
import { governedActorId } from '../middleware/orgMembership';
import { verifyReauth } from './c2c/actions';
import { createScopedLogger } from '../utils/logger';
import {
  parsePlacementPolicyInput,
  readOrgPlacementPolicy,
  writeOrgPlacementPolicy,
  parseDerivativeAction,
  readDerivativeCustody,
  manageDerivativeCustody,
  DerivativeCustodyError,
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

/** Placement and custody controls require current tenant authority, not a stale role claim. */
router.use(async (req, res, next) => {
  const organizationId = positiveInt((req as any).user?.organizationId);
  const userId = governedActorId(req);
  if (organizationId === null || userId === null) {
    return res.status(403).json({ error: { code: 'NO_ORGANIZATION', message: 'A current organization administrator is required.' } });
  }
  try {
    const { rows } = await requestPgClient(req).query(`SELECT ou.role FROM organization_users ou
      JOIN users u ON u.id = ou.user_id JOIN organizations o ON o.id = ou.organization_id
      WHERE ou.organization_id = $1 AND ou.user_id = $2 AND u.status = 'active' AND o.status = 'active'`, [organizationId, userId]);
    if (rows.length !== 1 || !['admin', 'owner'].includes(String(rows[0].role))) {
      return res.status(403).json({ error: { code: 'CURRENT_ADMIN_REQUIRED', message: 'Current administration authority for this organization is required.' } });
    }
    next();
  } catch {
    return res.status(503).json({ error: { code: 'AUTHORITY_UNAVAILABLE', message: 'Current organization authority could not be verified.' } });
  }
});

router.get('/', async (req: Request, res: Response) => {
  const orgId = positiveInt((req as any).user?.organizationId);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'NO_ORGANIZATION', message: 'Organization context required.' } });
  }
  try {
    const [policy, derivativeCustody] = await Promise.all([
      readOrgPlacementPolicy(requestPgClient(req), orgId), readDerivativeCustody(requestPgClient(req), orgId),
    ]);
    return res.json({ organizationId: orgId, policy, derivativeCustody });
  } catch {
    log.error('placement policy read failed');
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'The placement policy could not be read.' } });
  }
});

async function manageDerivative(req: Request, res: Response, organizationId: number, userId: number) {
  try {
    const { reauth, ...body } = req.body;
    const action = parseDerivativeAction(body);
    const proof = await verifyReauth(userId, derivativeReauthentication(reauth));
    if (!proof.ok) return res.status(401).json({ error: { code: 'REAUTH_REQUIRED', message: 'Confirm your password and required second factor before managing derivative custody.' } });
    const derivativeCustody = await manageDerivativeCustody(requestConnectable(req), organizationId, action, {
      userId, ipAddress: clientIpOf(req), userAgent: req.headers['user-agent'] as string | undefined,
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ organizationId, derivativeCustody, audited: true });
  } catch (error) {
    if (error instanceof DerivativeCustodyError) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    log.error('derivative custody change could not be confirmed');
    return res.status(503).json({ error: { code: 'DERIVATIVE_CHANGE_UNCONFIRMED', message: 'The derivative custody change could not be confirmed. Re-read its status before retrying.' } });
  }
}

function derivativeReauthentication(value: unknown): Parameters<typeof verifyReauth>[1] {
  if (value == null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw new DerivativeCustodyError();
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !['password', 'totp', 'totpCode'].includes(key)) ||
      Object.values(input).some(entry => entry !== undefined && typeof entry !== 'string') ||
      (input.totp !== undefined && input.totpCode !== undefined && input.totp !== input.totpCode)) throw new DerivativeCustodyError();
  return { password: input.password as string | undefined, totp: (input.totp ?? input.totpCode) as string | undefined };
}

router.put('/', async (req: Request, res: Response) => {
  const orgId = positiveInt((req as any).user?.organizationId);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'NO_ORGANIZATION', message: 'Organization context required.' } });
  }
  const userId = governedActorId(req);
  if (userId === null) {
    return res.status(401).json({ error: { code: 'NO_USER', message: 'A signed-in user is required to change policy.' } });
  }
  if (typeof req.body?.action === 'string' && req.body.action.startsWith('derivative_')) {
    return manageDerivative(req, res, orgId, userId);
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
  } catch {
    log.error('placement policy change failed — nothing was changed');
    return res.status(500).json({
      error: { code: 'INTERNAL', message: 'The placement policy was not changed.' },
    });
  }
});

export default router;
