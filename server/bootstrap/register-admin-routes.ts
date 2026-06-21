import type { Express } from 'express';
import masterAdminRoutes from '../routes/admin/master-admin';

/**
 * Admin-only route manifests.
 *
 * Master Administration (/api/admin/master) is the platform-owner + support
 * console — non-client-facing, cross-tenant. The router carries its own auth
 * gate (authMiddleware → requirePlatformAdmin) so it is safe to mount here on
 * the shared app.
 */
export function registerAdminRoutes(app: Express) {
  app.use('/api/admin/master', masterAdminRoutes);
  console.log('✅ Master Administration routes mounted (platform-admin gated)');
}
