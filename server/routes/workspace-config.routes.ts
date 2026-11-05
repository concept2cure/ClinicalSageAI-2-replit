/**
 * Workspace-config route.
 *
 * Exposes the document-type → workspace projection so the UI (built separately)
 * can render the project-creation picker and the self-tailoring project
 * workspace without reaching into shared modules. Pure projections over the
 * canonical filing registry (count derived, never hardcoded) + the supplementary
 * QMS catalog. Config enrichment may read the authenticated tenant's license;
 * these endpoints never change project, catalog or entitlement records.
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
import { authedOrgId, usableOrgId } from '../utils/authedOrgId';
import { buildSelectionCatalog } from '../../shared/regulatory/workspace-config';
import { getRegionProfile } from '../../shared/regulatory/region-profiles';
import { getClientTypeProfile } from '../../shared/regulatory/client-type-profiles';
import { resolveProjectMap } from '../../shared/regulatory/project-map';
import { enrichWorkspaceConfig } from '../services/regulatory/workspace-config-enrichment';

const router = Router();
router.use(authMiddleware);

function requireTenant(req: Request, res: Response): number | null {
  const organizationId = usableOrgId(authedOrgId(req));
  if (organizationId === null) {
    res.status(403).json({ error: 'Tenant context required' });
  }
  return organizationId;
}

/** One parser for the existing config and project-map projections. An explicit
 * selector must never disappear into an omitted/default setting. Use the
 * canonical profiles, not a second region or client-type enumeration.
 * Unknown document needs retain the shared resolver's honest blank-workspace
 * behavior; an unknown overlay is different from omitting that overlay.
 */
function workspaceInput(req: Request, res: Response): {
  need: string; clientType?: string; region?: string;
} | null {
  const query = req.query;
  const keys = ['need', 'clientType', 'region'] as const;
  if (Object.keys(query).some(key => !(keys as readonly string[]).includes(key))) {
    res.status(400).json({ code: 'WORKSPACE_QUERY_INVALID',
      error: 'Only need, clientType and region are accepted for this projection.' });
    return null;
  }
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(query, key) &&
        (typeof query[key] !== 'string' || !(query[key] as string).trim())) {
      res.status(400).json({ code: 'WORKSPACE_QUERY_INVALID', field: key,
        error: `Query parameter "${key}" must be one non-empty string.` });
      return null;
    }
  }
  const need = typeof query.need === 'string' ? query.need.trim() : '';
  if (!need) {
    res.status(400).json({ code: 'WORKSPACE_QUERY_INVALID',
      error: 'Query parameter "need" is required' });
    return null;
  }
  const region = typeof query.region === 'string' ? query.region.trim() : undefined;
  if (region !== undefined && !getRegionProfile(region)) {
    res.status(400).json({ code: 'WORKSPACE_REGION_UNKNOWN',
      error: 'Choose a region recorded in the existing region profiles.' });
    return null;
  }
  const explicitClientType = typeof query.clientType === 'string' ? query.clientType.trim() : undefined;
  if (explicitClientType !== undefined) {
    const profile = getClientTypeProfile(explicitClientType);
    if (!profile || typeof profile.industry !== 'string') {
      res.status(400).json({ code: 'WORKSPACE_CLIENT_TYPE_UNKNOWN',
        error: 'Choose a client type recorded in the existing industry profiles.' });
      return null;
    }
  }
  // Retain the existing authenticated industry precedence, never query/body
  // tenant identifiers. An explicit client preset is not a license grant.
  const orgIndustry =
    (req as any).user?.industryMode ?? (req as any).tenantContext?.industryMode ?? undefined;
  return { need, region, clientType: explicitClientType ??
    (typeof orgIndustry === 'string' ? orgIndustry : undefined) };
}

// The unified picker: filing registry ∪ QMS documents, grouped by scope.
router.get('/selection-catalog', (req: Request, res: Response) => {
  if (requireTenant(req, res) === null) return;
  try {
    return res.json({ data: buildSelectionCatalog() });
  } catch {
    return res.status(503).json({ code: 'WORKSPACE_CATALOG_UNAVAILABLE',
      error: 'The workspace catalog could not be loaded. Retry the request.' });
  }
});

// Same existing document/client/region projection, with the authenticated
// tenant's optional entitlement assessment. Unexpected enrichment failures
// must not return a different, pure configuration as a successful result.
router.get('/config', async (req: Request, res: Response) => {
  const organizationId = requireTenant(req, res);
  if (organizationId === null) return;
  const input = workspaceInput(req, res);
  if (!input) return;
  try {
    const data = await enrichWorkspaceConfig({ ...input, organizationId });
    return res.json({ data });
  } catch {
    // No raw provider/SQL error, no substitute context and no implied grant.
    // Best-effort license failures already remain unassessed in enrichment.
    return res.status(503).json({ code: 'WORKSPACE_CONFIG_UNAVAILABLE',
      error: 'The selected workspace configuration could not be loaded. Retry the request.' });
  }
});

// The existing project map is a pure capability inventory, not a readiness or
// authorization verdict. It accepts exactly the same contextual selectors.
router.get('/project-map', (req: Request, res: Response) => {
  if (requireTenant(req, res) === null) return;
  const input = workspaceInput(req, res);
  if (!input) return;
  try {
    return res.json({ data: resolveProjectMap(input) });
  } catch {
    return res.status(503).json({ code: 'WORKSPACE_PROJECT_MAP_UNAVAILABLE',
      error: 'The selected project map could not be loaded. Retry the request.' });
  }
});

export default router;
