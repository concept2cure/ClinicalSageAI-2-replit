import type { Express } from 'express';
import masterAdminRoutes from '../routes/admin/master-admin';
import businessCenterRoutes from '../routes/admin/business-center';
import accessManagementRoutes from '../routes/admin/access-management';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('register-admin-routes');

/**
 * Admin-only route manifests.
 *
 * Master Administration (/api/admin/master) is the platform-owner + support
 * console — non-client-facing, cross-tenant. The Business Center
 * (/api/admin/business) is the narrower owner/finance tier (cost accounting,
 * margins). Each router carries its own auth gate (authMiddleware →
 * requirePlatformAdmin / requireBusinessAdmin) so they are safe to mount here.
 */
export function registerAdminRoutes(app: Express) {
  app.use('/api/admin/master', masterAdminRoutes);
  app.use('/api/admin/business', businessCenterRoutes);
  // Designate personnel: grant/revoke platform-level role grants (platform-admin
  // gated; business-tier grants additionally require a business admin caller).
  app.use('/api/admin/access', accessManagementRoutes);
  logger.info('Master Administration + Business Center + Access routes mounted (admin-gated)');
}
