/**
 * @fileoverview License-acceptance gate middleware
 * @module server/middleware/requireLicenseAcceptance
 *
 * @description
 * Blocks a route until the current user (and their organization) has accepted
 * all active, required license agreements. Returns 403 with the outstanding
 * agreements so the client can present a clickwrap flow. Must run after auth.
 *
 * Fails open on infrastructure errors to avoid locking users out of the
 * platform when the licensing store is transiently unavailable.
 */

import type { Request, Response, NextFunction } from 'express';
import { getOutstandingAgreements } from '../services/licensing/eula-service.js';

export function requireLicenseAcceptance() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id ?? (req as any).userId;
      const orgId =
        (req as any).tenantContext?.organizationId ?? (req as any).user?.organizationId;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
      }

      const outstanding = await getOutstandingAgreements(
        Number(userId),
        orgId != null ? Number(orgId) : null
      );

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
    } catch {
      // Fail open: don't lock users out on a transient licensing-store error.
      next();
    }
  };
}

export default requireLicenseAcceptance;
