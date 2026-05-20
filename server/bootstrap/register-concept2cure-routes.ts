import type { Express } from 'express';
import concept2cureRoutes from '../routes/concept2cure';
import computeRoutes from '../routes/compute';
import { authenticateToken } from '../middleware/auth.js';

// SECURITY: Concept2Cure routes carry per-tenant project + program data.
// Compute endpoints also pass through to upstream LLM providers and
// must be JWT-gated to bound cost exposure.
export function registerConcept2CureRoutes(app: Express) {
  app.use('/api/concept2cure', authenticateToken, concept2cureRoutes);
  app.use('/api/concept2cure/compute', authenticateToken, computeRoutes);
  console.log('✅ Concept2Cure routes mounted (auth-gated)');
}
