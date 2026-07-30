import type { Express, RequestHandler } from 'express';
import { authMiddleware } from './auth.js';
import betaTelemetryRoutes from './routes/beta-telemetry.routes';

export function mountBetaSafeRoutes(
  app: Express,
  authenticate: RequestHandler = authMiddleware
) {
  // /api/510k-project is intentionally NOT mounted: 510k-project.routes.ts was
  // deprecated 2026-01-26 and sunset (deleted) on 2026-06-30 (issue #726), with
  // no in-repo consumers. A later "consolidate readiness" refactor re-added an
  // `import projectRoutes from './routes/510k-project.routes'` for that deleted
  // module — an unresolved import at the top of a manifest that mountBetaSafeRoutes
  // loads at boot, i.e. a boot-time module-resolution failure. Restored to the
  // post-sunset state. Ledger C-22.
  app.use('/api/telemetry/beta-workspace', authenticate, betaTelemetryRoutes);
}
