/**
 * Agency gateway accounts — mounted at /api/gateway-accounts.
 *
 *   GET /api/gateway-accounts
 *       Every agency gateway × environment for the caller's organisation:
 *       platform or own account, the sender identity, which credential fields
 *       are held (never their values), and whether a transmit can go out under
 *       it now. Any signed-in member: it is what the Submission Center states.
 *   PUT /api/gateway-accounts/:region/:gateway/:environment
 *       Choose the platform's account or the organisation's own. Body:
 *       { mode, senderIdentifier?, credentials?, reason, reauth: { password, totp? } }.
 *       Organisation admin or owner, re-authenticated: this decides whose
 *       identity submissions go out under. The change and its chained audit row
 *       (mode before and after, sender, credential field NAMES, reason) commit
 *       together on the request's tenant-scoped connection.
 *
 * Founder decision 2026-10-01 (both accounts offered, chosen in admin settings
 * and at onboarding). Evidence docs/evidence/D7/2026-10-01-gateway-account-choice/.
 */
import { Router, type Request, type Response } from 'express';

import { authenticateToken, requireRole } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import { requestConnectable, requestPgClient } from '../db/requestDb';
import { clientIpOf } from '../utils/client-ip';
import { createScopedLogger } from '../utils/logger';
import { writeChainedAuditRow } from '../services/auditService';
import { verifyReauth } from './c2c/actions';
import { getGatewayUnguarded } from '../services/submission-gateways';
import {
  GatewayAccountInputError,
  listGatewayAccounts,
  writeGatewayAccount,
} from '../services/submission-gateways/gateway-accounts';

const router = Router();
const log = createScopedLogger('gateway-accounts');
router.use(authenticateToken);
router.use(createRateLimiter());

function positiveInt(raw: unknown): number | null {
  const n = typeof raw === 'string' ? Number(raw) : raw;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

const orgOf = (req: Request) => positiveInt((req as any).user?.organizationId);

router.get('/', async (req: Request, res: Response) => {
  const orgId = orgOf(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'NO_ORGANIZATION', message: 'Organization context required.' } });
  }
  try {
    const accounts = await listGatewayAccounts(requestPgClient(req), orgId, (spec, environment) =>
      getGatewayUnguarded(spec.region, spec.gateway).isConfigured(orgId, environment),
    );
    return res.json({ organizationId: orgId, accounts });
  } catch (err) {
    log.error('gateway accounts read failed', { err: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'The gateway accounts could not be read.' } });
  }
});

router.put('/:region/:gateway/:environment', requireRole('admin', 'owner'), async (req: Request, res: Response) => {
  const orgId = orgOf(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'NO_ORGANIZATION', message: 'Organization context required.' } });
  }
  const userId = positiveInt((req as any).user?.id);
  if (userId === null) {
    return res.status(401).json({ error: { code: 'NO_USER', message: 'A signed-in user is required.' } });
  }
  const body = (req.body ?? {}) as Record<string, any>;
  const reauth = await verifyReauth(userId, body.reauth);
  if (!reauth.ok) {
    return res.status(401).json({
      error: { code: reauth.error ?? 'REAUTH_REQUIRED', message: 'Confirm your password: this changes whose identity submissions go out under.' },
    });
  }
  const credentials =
    body.credentials && typeof body.credentials === 'object' && !Array.isArray(body.credentials)
      ? (body.credentials as Record<string, string>)
      : null;
  const db = requestConnectable(req);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const written = await writeGatewayAccount(client, {
      organizationId: orgId,
      userId,
      region: String(req.params.region),
      gateway: String(req.params.gateway),
      environment: String(req.params.environment),
      mode: body.mode,
      senderIdentifier: body.senderIdentifier === undefined ? undefined : body.senderIdentifier ?? null,
      credentials,
      reason: body.reason,
    });
    await writeChainedAuditRow(client, {
      tenantId: orgId,
      userId,
      action: 'data_modify',
      resourceType: 'organization_gateway_account',
      resourceId: `${written.spec.region}:${written.spec.gateway}:${written.environment}`,
      ipAddress: clientIpOf(req) ?? undefined,
      userAgent: req.get('user-agent'),
      details: {
        orgAdminAction: 'gateway_account.change',
        modeBefore: written.previousMode,
        modeAfter: written.mode,
        senderIdentifier: written.senderIdentifier,
        // Names only: secret material is never copied into the log.
        credentialFieldsChanged: Object.keys(credentials ?? {}).sort(),
        credentialFieldsHeld: written.credentialFieldsHeld,
        reason: String(body.reason).trim(),
        reauthenticated: true,
      },
    });
    await client.query('COMMIT');
    return res.json({
      organizationId: orgId,
      region: written.spec.region,
      gateway: written.spec.gateway,
      environment: written.environment,
      mode: written.mode,
      senderIdentifier: written.senderIdentifier,
      credentialFieldsHeld: written.credentialFieldsHeld,
      audited: true,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (err instanceof GatewayAccountInputError) {
      return res.status(400).json({ error: { code: err.code, message: err.message } });
    }
    log.error('gateway account change failed — nothing was changed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'The gateway account was not changed.' } });
  } finally {
    client.release();
  }
});

export default router;
