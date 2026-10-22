/**
 * @fileoverview License-acceptance gate middleware
 * @module server/middleware/requireLicenseAcceptance
 *
 * @description
 * Blocks a route until the current user (and their organization) has accepted
 * all active, required license agreements. Returns 403 with the outstanding
 * agreements so the client can present a clickwrap flow. Must run after auth.
 *
 * Fails closed: when acceptance cannot be read it answers 503 and does not
 * serve the route. 2026-10-15: it failed open (next() from the catch), so an
 * unreadable licensing store served users who had not accepted a required
 * agreement. Mounted on no route as of that change.
 */

import type { Request, Response, NextFunction } from 'express';
import { getOutstandingAgreements } from '../services/licensing/eula-service.js';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('require-license-acceptance');

export function requireLicenseAcceptance() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.id ?? (req as any).userId;
    const orgId =
      (req as any).tenantContext?.organizationId ?? (req as any).user?.organizationId;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    }

    let outstanding: Awaited<ReturnType<typeof getOutstandingAgreements>>;
    try {
      outstanding = await getOutstandingAgreements(
        Number(userId),
        orgId != null ? Number(orgId) : null
      );
    } catch (err) {
      logger.warn('License acceptance could not be read — request refused', {
        userId,
        organizationId: orgId ?? null,
        err: err instanceof Error ? err.message : String(err),
      });
      return res.status(503).json({
        error: 'License acceptance could not be verified',
        code: 'LICENSE_ACCEPTANCE_UNAVAILABLE',
      });
    }

    if (outstanding.length > 0) {
      return res.status(403).json({
        error: 'License acceptance required',
        code: 'LICENSE_ACCEPTANCE_REQUIRED',
        outstanding: outstanding.map(a => ({
          id: a.id,
          agreementKey: a.agreementKey,
          version: a.version,
          title: a.title,
          scope: a.scope,
        })),
        acceptUrl: '/legal/agreements',
      });
    }

    next();
  };
}

export default requireLicenseAcceptance;
