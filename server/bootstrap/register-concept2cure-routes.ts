import type { Express } from 'express';
import concept2cureRoutes from '../routes/concept2cure';
import computeRoutes from '../routes/compute';

export function registerConcept2CureRoutes(app: Express) {
  app.use('/api/concept2cure', concept2cureRoutes);
  app.use('/api/concept2cure/compute', computeRoutes);
  console.log('✅ Concept2Cure routes mounted');
}
