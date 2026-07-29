/** Global RI — capability catalog (one-call UI discovery of the whole surface). */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import { getGlobalRiCatalog, capabilitiesByGroup } from '../../services/global-ri/global-ri-capabilities';
import { buildGlobalRiOpenApi } from '../../services/global-ri/openapi-builder';

const router = Router();

/** Machine-readable OpenAPI 3.0 contract for the global-RI surface (codegen / Swagger). */
router.get('/openapi.json', limiter, requireRole(AUTHOR), (_req: Request, res: Response) => {
  res.json(buildGlobalRiOpenApi());
});

/**
 * The full global-RI capability catalog: navigation groups, every capability with
 * its HTTP routes + AnA tools + per-tool input JSON-schema (for dynamic forms).
 * One call for the UI to render the entire surface without hard-coding it.
 */
router.get('/catalog', limiter, requireRole(AUTHOR), (_req: Request, res: Response) => {
  res.json(getGlobalRiCatalog());
});

/** The catalog restricted to a single navigation group. 404 when the group is unknown. */
router.get('/catalog/:group', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const group = String(Array.isArray(req.params.group) ? req.params.group[0] : req.params.group);
  const grouped = capabilitiesByGroup();
  const capabilities = grouped[group];
  if (!capabilities) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Unknown global-RI group "${group}".` } });
  }
  res.json({ group, count: capabilities.length, capabilities });
});

export default router;
