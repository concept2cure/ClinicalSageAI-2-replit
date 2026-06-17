import type { Express } from 'express';
import concept2cureRoutes from '../routes/concept2cure';
import computeRoutes from '../routes/compute';
import scheduleOfEventsRoutes from '../routes/project-schedule-of-events';
import { authenticateToken } from '../middleware/auth.js';

// SECURITY: Concept2Cure routes carry per-tenant project + program data.
// Compute endpoints also pass through to upstream LLM providers and
// must be JWT-gated to bound cost exposure.
export function registerConcept2CureRoutes(app: Express) {
  app.use('/api/concept2cure', authenticateToken, concept2cureRoutes);
  app.use('/api/concept2cure/compute', authenticateToken, computeRoutes);
  // AnA Schedule of Events — shares the project URL space (/projects/:id/...);
  // mounted after the main router so distinct sub-paths resolve here.
  app.use('/api/concept2cure', authenticateToken, scheduleOfEventsRoutes);
  console.log('✅ Concept2Cure routes mounted (auth-gated)');
}
