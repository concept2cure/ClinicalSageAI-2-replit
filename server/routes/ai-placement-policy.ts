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
import { AggregateLearningRefusedError, readLearningContributionMetadata } from '../services/intelligence/ana-failure-learning';
import { writeLearningContributionPolicy, writeLearningPatternContribution } from '../services/tenant/tenant-settings-writer';
import { listReviewedLearningLibrary } from '../services/qms/changeControl.service';
import { assertCurrentLearningCurator } from '../services/qms/change-approval-signature';
import { prepareReviewedLearningCandidate } from '../services/qms/controlled-document-service';
import { QmsContentRefusedError } from '../services/qms/controlled-document-content';
import { installReviewedLearningSkill } from '../services/account-skill-bundles';
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

class CurrentAdministrationRequiredError extends Error {
  constructor() { super('Current administration authority for this organization is required.'); }
}
async function currentAdministrator(req: Request, organizationId: number, userId: number): Promise<boolean> {
  const { rows } = await requestPgClient(req).query(`SELECT ou.role FROM organization_users ou
      JOIN users u ON u.id = ou.user_id JOIN organizations o ON o.id = ou.organization_id
      WHERE ou.organization_id = $1 AND ou.user_id = $2 AND u.status = 'active' AND o.status = 'active'`, [organizationId, userId]);
  return rows.length === 1 && ['admin', 'owner'].includes(String(rows[0].role));
}
/** These configuration acts sign nothing. Recheck current tenant administration
 * before the shared password/MFA ceremony; regulated QMS signing stays separate. */
async function reauthenticateAdministrator(req: Request, organizationId: number, userId: number, proof: unknown) {
  if (!await currentAdministrator(req, organizationId, userId)) throw new CurrentAdministrationRequiredError();
  return verifyReauth(userId, derivativeReauthentication(proof));
}

/** Placement and custody controls require current tenant authority, not a stale role claim. */
router.use(async (req, res, next) => {
  const organizationId = positiveInt((req as any).user?.organizationId);
  const userId = governedActorId(req);
  if (organizationId === null || userId === null) {
    return res.status(403).json({ error: { code: 'NO_ORGANIZATION', message: 'A current organization administrator is required.' } });
  }
  try {
    if (!await currentAdministrator(req, organizationId, userId)) {
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
    const [policy, derivativeCustody, learningContribution] = await Promise.all([
      readOrgPlacementPolicy(requestPgClient(req), orgId), readDerivativeCustody(requestPgClient(req), orgId),
      learningAdministrationMetadata(req, orgId),
    ]);
    return res.json({ organizationId: orgId, policy, derivativeCustody, learningContribution });
  } catch {
    log.error('placement policy read failed');
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'The placement policy could not be read.' } });
  }
});

async function learningAdministrationMetadata(req: Request, organizationId: number) {
  const q = requestPgClient(req), userId = governedActorId(req)!;
  const metadata = await readLearningContributionMetadata(q, organizationId, userId);
  let canCurate = false;
  try { await assertCurrentLearningCurator(q, userId); canCurate = true; } catch { /* No curator controls without current standing. */ }
  return { ...metadata, canCurate, library: await listReviewedLearningLibrary() };
}

async function manageDerivative(req: Request, res: Response, organizationId: number, userId: number) {
  try {
    const { reauth, ...body } = req.body;
    const action = parseDerivativeAction(body);
    const proof = await reauthenticateAdministrator(req, organizationId, userId, reauth);
    if (!proof.ok) return res.status(401).json({ error: { code: 'REAUTH_REQUIRED', message: 'Confirm your password and required second factor before managing derivative custody.' } });
    const derivativeCustody = await manageDerivativeCustody(requestConnectable(req), organizationId, action, {
      userId, ipAddress: clientIpOf(req), userAgent: req.headers['user-agent'] as string | undefined,
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ organizationId, derivativeCustody, audited: true });
  } catch (error) {
    if (error instanceof CurrentAdministrationRequiredError) return res.status(403).json({ error: { code: 'CURRENT_ADMIN_REQUIRED', message: error.message } });
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

async function manageLearning(req: Request, res: Response, organizationId: number, userId: number) {
  try {
    const { reauth, action, ...body } = req.body;
    if (!['learning_policy', 'learning_contribute', 'learning_prepare', 'learning_install'].includes(action)) throw new AggregateLearningRefusedError(400);
    const proof = await reauthenticateAdministrator(req, organizationId, userId, reauth);
    if (!proof.ok) return res.status(401).json({ error: { code: 'REAUTH_REQUIRED', message: 'Confirm your password and required second factor before changing learning contributions.' } });
    const result = await performLearningAction(req, organizationId, userId, action, body);
    return res.json({ organizationId, learningContribution: result, audited: true });
  } catch (error) {
    if (error instanceof CurrentAdministrationRequiredError) return res.status(403).json({ error: { code: 'CURRENT_ADMIN_REQUIRED', message: error.message } });
    if (error instanceof AggregateLearningRefusedError) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    if (error instanceof QmsContentRefusedError) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return res.status(503).json({ error: { code: 'LEARNING_CHANGE_UNCONFIRMED', message: 'The learning contribution change could not be confirmed. Re-read its current status before retrying.' } });
  }
}

function performLearningAction(req: Request, organizationId: number, userId: number, action: string, body: unknown) {
  const pool = requestConnectable(req);
  if (action === 'learning_policy') return writeLearningContributionPolicy(pool, organizationId, userId, body);
  if (action === 'learning_contribute') return writeLearningPatternContribution(pool, organizationId, userId, body);
  if (action === 'learning_install') return installReviewedLearningSkill(pool, organizationId,
    { userId, ipAddress: clientIpOf(req), userAgent: String(req.headers['user-agent'] ?? '') }, body);
  return prepareReviewedLearningCandidate({ pool, tenantId: organizationId, actor: { id: String(userId), email: null },
    audit: { pool, tenantId: organizationId, actorId: String(userId), actorEmail: 'unknown', actorRole: 'unknown',
      ipAddress: clientIpOf(req) ?? 'unknown', userAgent: String(req.headers['user-agent'] ?? '') } }, body);
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
  if (typeof req.body?.action === 'string' && req.body.action.startsWith('learning_')) return manageLearning(req, res, orgId, userId);
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
