import { Router } from 'express';
import { requireTenant } from '../middleware/tenant.js';
import sourceDataIngestRoutes from './source-data-ingest.routes';

const router = Router();

// Small v1 surface for Pillar 1.1: a stable, versioned ingest namespace.
// Reuses the existing ingestion pipeline mounted at /api/ingest.
router.get('/health', requireTenant(), (req, res) => {
  return res.json({
    status: 'ok',
    version: 'v1',
    product: 'regulai',
    organizationId: (req as any).organizationId ?? null,
    timestamp: new Date().toISOString(),
  });
});

// Delegate to existing ingestion router (supports POST / and GET / today)
router.use('/', sourceDataIngestRoutes);

export default router;
