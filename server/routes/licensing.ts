/**
 * @fileoverview Intelligent Licensing + End-User License (EULA) API
 * @module server/routes/licensing
 * @version 1.0.0
 *
 * @description
 * REST API for the intelligent-entitlements layer and end-user license
 * features. Pricing is intentionally out of scope here — this exposes
 * capability entitlements, upgrade *targets*, quota posture, and the
 * agreement-acceptance lifecycle.
 *
 * Entitlements:
 *   GET  /entitlements              — full explainable entitlement summary + recommendations
 *   GET  /features                  — feature catalog with availability for the org's tier
 *
 * End-user license:
 *   GET  /agreements/active         — all active agreements
 *   GET  /agreements/outstanding    — agreements the current user/org still must accept
 *   POST /agreements/:id/accept     — record acceptance (clickwrap), append-only + audited
 *   GET  /acceptances               — current user's acceptance history
 *   POST /agreements                — publish a new agreement version (admin)
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  resolveEntitlements,
  buildFeatureCatalog,
} from '../services/licensing/entitlements-service.js';
import {
  getActiveAgreements,
  getOutstandingAgreements,
  recordAcceptance,
  getAcceptanceHistory,
  publishAgreement,
} from '../services/licensing/eula-service.js';
import { getLicenseInfo } from '../services/license-manager.js';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('licensing');
const router = Router();

function orgIdOf(req: Request): number | undefined {
  const v = (req as any).tenantContext?.organizationId ?? (req as any).user?.organizationId;
  return v != null ? Number(v) : undefined;
}
function userIdOf(req: Request): number | undefined {
  const v = (req as any).user?.id ?? (req as any).userId;
  return v != null ? Number(v) : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entitlements
// ─────────────────────────────────────────────────────────────────────────────

router.get('/entitlements', async (req: Request, res: Response) => {
  try {
    const orgId = orgIdOf(req);
    if (!orgId) return res.status(401).json({ error: 'Organization context required' });

    const summary = await resolveEntitlements(orgId, userIdOf(req));
    if (!summary) return res.status(404).json({ error: 'License not found' });
    return res.json(summary);
  } catch (error) {
    logger.error('entitlements error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to resolve entitlements' });
  }
});

router.get('/features', async (req: Request, res: Response) => {
  try {
    const orgId = orgIdOf(req);
    if (!orgId) return res.status(401).json({ error: 'Organization context required' });

    const license = await getLicenseInfo(orgId);
    const tier = license?.tier ?? 'free';
    return res.json({ tier, features: buildFeatureCatalog(tier) });
  } catch (error) {
    logger.error('features error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to load feature catalog' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// End-user license agreements
// ─────────────────────────────────────────────────────────────────────────────

router.get('/agreements/active', async (_req: Request, res: Response) => {
  try {
    return res.json({ agreements: await getActiveAgreements() });
  } catch (error) {
    logger.error('agreements/active error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to load agreements' });
  }
});

router.get('/agreements/outstanding', async (req: Request, res: Response) => {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const outstanding = await getOutstandingAgreements(userId, orgIdOf(req) ?? null);
    return res.json({ outstanding, count: outstanding.length });
  } catch (error) {
    logger.error('agreements/outstanding error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to load outstanding agreements' });
  }
});

router.post('/agreements/:id/accept', async (req: Request, res: Response) => {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const record = await recordAcceptance({
      agreementId: String(req.params.id),
      userId,
      organizationId: orgIdOf(req) ?? null,
      ipAddress: (req.headers['x-forwarded-for'] as string) || req.ip || null,
      userAgent: req.headers['user-agent'] || null,
      method: 'clickwrap',
    });
    return res.status(201).json({ accepted: true, acceptance: record });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('not found')) return res.status(404).json({ error: msg });
    logger.error('accept error', { err: msg });
    return res.status(500).json({ error: 'Failed to record acceptance' });
  }
});

router.get('/acceptances', async (req: Request, res: Response) => {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    return res.json({ acceptances: await getAcceptanceHistory(userId) });
  } catch (error) {
    logger.error('acceptances error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to load acceptance history' });
  }
});

router.post('/agreements', async (req: Request, res: Response) => {
  try {
    const role = (req as any).user?.role ?? (req as any).userRole;
    if (role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    const { agreementKey, version, title, summary, body, url, scope, required } = req.body || {};
    if (!agreementKey || !version || !title) {
      return res.status(400).json({ error: 'agreementKey, version, and title are required' });
    }

    const agreement = await publishAgreement({
      agreementKey: String(agreementKey),
      version: String(version),
      title: String(title),
      summary,
      body,
      url,
      scope: scope === 'organization' ? 'organization' : 'user',
      required: required !== false,
      createdBy: String(userIdOf(req) ?? ''),
    });
    return res.status(201).json({ agreement });
  } catch (error) {
    logger.error('publish error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to publish agreement' });
  }
});

export default router;
