import type { Express, RequestHandler } from 'express';
import { authMiddleware } from './auth.js';
import projectRoutes from './routes/510k-project.routes';
import betaTelemetryRoutes from './routes/beta-telemetry.routes';

export function mountBetaSafeRoutes(
  app: Express,
  authenticate: RequestHandler = authMiddleware
) {
  app.use('/api/510k-project', projectRoutes);
  app.use('/api/telemetry/beta-workspace', authenticate, betaTelemetryRoutes);
}
