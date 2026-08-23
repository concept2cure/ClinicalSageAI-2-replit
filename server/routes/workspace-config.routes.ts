/**
 * Workspace-config route.
 *
 * Exposes the document-type → workspace projection so the UI (built separately)
 * can render the project-creation picker and the self-tailoring project
 * workspace without reaching into shared modules. Pure projections over the
 * canonical filing registry (count derived, never hardcoded) + the supplementary QMS catalog; no tenant
 * data is read or written, but auth is required for consistency with the rest of
 * the API.
 *
 * GET /api/workspace/selection-catalog
 *   → { data: SelectionGroup[] }   (the unified "select your need" picker)
 *
 * GET /api/workspace/config?need=NDA[&clientType=pharma][&region=EU]
 *   → { data: WorkspaceConfig }    (the shell + apps tailored to the selection,
 *      enriched with the region + client-type overlays; clientType defaults to
 *      the org's industryMode, region to the selected type's own region)
 *
 * GET /api/workspace/project-map?need=BLA[&clientType=biotech][&region=US]
 *   → { data: ProjectMap }         (the project MAP + capability INVENTORY: the
 *      ordered milestones for the selection and, per app/service, the phase[s]
 *      at which it is needed — what project setup suggests to the client)
 *
 * @module server/routes/workspace-config
 */

import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../auth';
import { authedOrgId } from '../utils/authedOrgId';
import {
  buildSelectionCatalog,
  resolveWorkspaceConfig,
} from '../../shared/regulatory/workspace-config';
import { resolveProjectMap } from '../../shared/regulatory/project-map';
import { enrichWorkspaceConfig } from '../services/regulatory/workspace-config-enrichment';

const router = Router();
router.use(authMiddleware);

function requireTenant(req: Request, res: Response): boolean {
  const organizationId = authedOrgId(req);
  if (!Number.isFinite(organizationId as number)) {
    res.status(403).json({ error: 'Tenant context required' });
    return false;
  }
  return true;
}

// The unified picker: filing registry ∪ QMS documents, grouped by scope.
router.get('/selection-catalog', (req: Request, res: Response) => {
  if (!requireTenant(req, res)) return;
  return res.json({ data: buildSelectionCatalog() });
});

// The tailored workspace for a selected need (submission type, document, or QMS doc).
// Enriched across all three axes: document type (need), client type (industry),
// and region. clientType defaults to the org's industryMode; region to the
// selected type's own region. Both accept an explicit query override.
router.get('/config', async (req: Request, res: Response) => {
  if (!requireTenant(req, res)) return;

  const need = typeof req.query.need === 'string' ? req.query.need.trim() : '';
  if (!need) {
    return res.status(400).json({ error: 'Query parameter "need" is required' });
  }

  const clientTypeOverride =
    typeof req.query.clientType === 'string' ? req.query.clientType.trim() : undefined;
  const regionOverride =
    typeof req.query.region === 'string' ? req.query.region.trim() : undefined;

  // Industry comes from the authenticated tenant context unless overridden.
  const orgIndustry =
    (req as any).user?.industryMode ?? (req as any).tenantContext?.industryMode ?? undefined;
  const clientType =
    clientTypeOverride ?? (typeof orgIndustry === 'string' ? orgIndustry : undefined);
  const organizationId = authedOrgId(req) ?? undefined;

  try {
    const data = await enrichWorkspaceConfig({
      need,
      clientType,
      region: regionOverride,
      organizationId: organizationId ?? undefined,
    });
    return res.json({ data });
  } catch {
    // Fail-open: enrichment must never 500. Fall back to the pure config.
    return res.json({ data: resolveWorkspaceConfig(need) });
  }
});

// The project map + capability inventory for a selected need. Pure projection
// (no enrichment, no tenant data): the milestones and the "what's needed, when"
// inventory that the setup wizard surfaces to suggest capabilities to the client.
// clientType defaults to the org's industryMode; both accept a query override.
router.get('/project-map', (req: Request, res: Response) => {
  if (!requireTenant(req, res)) return;

  const need = typeof req.query.need === 'string' ? req.query.need.trim() : '';
  if (!need) {
    return res.status(400).json({ error: 'Query parameter "need" is required' });
  }

  const clientTypeOverride =
    typeof req.query.clientType === 'string' ? req.query.clientType.trim() : undefined;
  const regionOverride =
    typeof req.query.region === 'string' ? req.query.region.trim() : undefined;

  const orgIndustry =
    (req as any).user?.industryMode ?? (req as any).tenantContext?.industryMode ?? undefined;
  const clientType =
    clientTypeOverride ?? (typeof orgIndustry === 'string' ? orgIndustry : undefined);

  return res.json({
    data: resolveProjectMap({ need, clientType, region: regionOverride }),
  });
});

export default router;
