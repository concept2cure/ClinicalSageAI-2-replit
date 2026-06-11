import type { Express } from 'express';
import betaTelemetryRoutes from './routes/beta-telemetry.routes';

export function mountBetaSafeRoutes(app: Express) {
  // /api/510k-project removed at the 2026-06-30 sunset (issue #726):
  // 510k-project.routes.ts was deprecated 2026-01-26 and served
  // Deprecation/Sunset headers on every response. No in-repo consumers.
  app.use('/api/telemetry/beta-workspace', betaTelemetryRoutes);
}
