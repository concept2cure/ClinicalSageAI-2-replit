/**
 * Workspace-config route.
 *
 * Exposes the document-type → workspace projection so the UI (built separately)
 * can render the project-creation picker and the self-tailoring project
 * workspace without reaching into shared modules. Pure projections over the
 * canonical 158-type filing registry + the supplementary QMS catalog; no tenant
 * data is read or written, but auth is required for consistency with the rest of
 * the API.
 *
 * GET /api/workspace/selection-catalog
 *   → { data: SelectionGroup[] }   (the unified "select your need" picker)
 *
 * GET /api/workspace/config?need=NDA
 *   → { data: WorkspaceConfig }    (the shell + apps tailored to the selection)
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
router.get('/config', (req: Request, res: Response) => {
  if (!requireTenant(req, res)) return;

  const need = typeof req.query.need === 'string' ? req.query.need.trim() : '';
  if (!need) {
    return res.status(400).json({ error: 'Query parameter "need" is required' });
  }

  return res.json({ data: resolveWorkspaceConfig(need) });
});

export default router;
