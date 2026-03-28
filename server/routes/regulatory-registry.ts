/**
 * Regulatory Registry API — Query the Global Regulatory Document Registry.
 *
 * Endpoints:
 * - GET /api/regulatory/registry — list all application types (with filters)
 * - GET /api/regulatory/registry/:id — get a specific application type
 * - GET /api/regulatory/regions — list all regions with profiles
 * - GET /api/regulatory/search?q=... — search application types
 * - GET /api/regulatory/resolve?legacy=IND — resolve legacy type to registry entry
 *
 * @module server/routes/regulatory-registry
 */

import { Router, Request, Response } from 'express';

const router = Router();

// Lazy import to avoid circular dependencies
async function getRegistry() {
  const mod = await import('../../shared/regulatory/global-document-registry.js');
  return mod;
}

async function getRegionProfiles() {
  const mod = await import('../../shared/regulatory/region-profiles.js');
  return mod;
}

// ─── GET /api/regulatory/registry ─────────────────────────────────────────────

router.get('/registry', async (req: Request, res: Response) => {
  try {
    const { getByRegion, getByAgency, getByFamily, getByProductClass, GLOBAL_REGISTRY } = await getRegistry();

    const { region, agency, family, productClass } = req.query;

    let results = GLOBAL_REGISTRY.filter((e: { active: boolean }) => e.active);

    if (region) results = results.filter((e: { region: string }) => e.region === region);
    if (agency) results = results.filter((e: { agency: string }) => e.agency === agency);
    if (family) results = results.filter((e: { applicationFamily: string }) => e.applicationFamily === family);
    if (productClass) results = results.filter((e: { productClass: string[] }) => e.productClass.includes(productClass as string));

    res.json({
      success: true,
      data: {
        entries: results,
        count: results.length,
        totalInRegistry: GLOBAL_REGISTRY.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/regulatory/registry/:id ─────────────────────────────────────────

router.get('/registry/:id', async (req: Request, res: Response) => {
  try {
    const { getApplicationType } = await getRegistry();
    const entry = getApplicationType(req.params.id);
    if (!entry) return res.status(404).json({ success: false, error: 'Application type not found' });
    res.json({ success: true, data: entry });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/regulatory/regions ──────────────────────────────────────────────

router.get('/regions', async (_req: Request, res: Response) => {
  try {
    const { REGION_PROFILES } = await getRegionProfiles();
    const { getCountByRegion } = await getRegistry();
    const counts = getCountByRegion();

    const regions = REGION_PROFILES.map((r: { region: string }) => ({
      ...r,
      applicationTypeCount: counts[r.region as keyof typeof counts] || 0,
    }));

    res.json({ success: true, data: regions });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/regulatory/search ───────────────────────────────────────────────

router.get('/search', async (req: Request, res: Response) => {
  try {
    const { search } = await getRegistry();
    const q = (req.query.q as string) || '';
    if (!q) return res.json({ success: true, data: { results: [], query: q } });

    const results = search(q);
    res.json({ success: true, data: { results, query: q, count: results.length } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/regulatory/resolve ──────────────────────────────────────────────

router.get('/resolve', async (req: Request, res: Response) => {
  try {
    const { resolveFromLegacy } = await getRegistry();
    const legacy = (req.query.legacy as string) || '';
    if (!legacy) return res.status(400).json({ success: false, error: 'legacy parameter required' });

    const entry = resolveFromLegacy(legacy);
    if (!entry) return res.status(404).json({ success: false, error: `No registry entry for '${legacy}'` });
    res.json({ success: true, data: entry });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
