import type { Express, RequestHandler } from 'express';
import { authMiddleware } from './auth.js';
import betaTelemetryRoutes from './routes/beta-telemetry.routes';

export function mountBetaSafeRoutes(
  app: Express,
  authenticate: RequestHandler = authMiddleware
) {
  // Note: the former '/api/510k-project' mount was removed — its route module
  // (./routes/510k-project.routes) was never committed, so the import broke the
  // build and would throw ERR_MODULE_NOT_FOUND at mount time. 510(k) project
  // routes are served by the fda510k-* routers elsewhere.
  app.use('/api/telemetry/beta-workspace', authenticate, betaTelemetryRoutes);
}
