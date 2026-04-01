import type { Express } from 'express';
import projectRoutes from './routes/510k-project.routes';
import betaTelemetryRoutes from './routes/beta-telemetry.routes';

export function mountBetaSafeRoutes(app: Express) {
  app.use('/api/510k-project', projectRoutes);
  app.use('/api/telemetry/beta-workspace', betaTelemetryRoutes);
}
