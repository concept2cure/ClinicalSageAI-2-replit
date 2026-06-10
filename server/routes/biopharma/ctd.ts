/**
 * /api/biopharma/ctd — CTD Module 1 (regional administrative) and Module 2
 * (CTD summaries) home.
 *
 *   GET /api/biopharma/ctd/structure?region=US&module=1|2
 *   GET /api/biopharma/ctd/build-state/:projectId?region=US
 *
 * The structure is region-aware (FDA/EMA/PMDA). Build-state is derived from the
 * existing c2c_document_sections store (no new tables); it degrades to an
 * all-not-started structure when a program has no authored sections yet.
 *
 * @module server/routes/biopharma/ctd
 */

import { Router, type Request, type Response } from 'express';
import { pool } from '../../db.js';
import {
  normalizeRegion,
  getModule1Structure,
  getModule2Structure,
  getCtdModuleHome,
  annotateModuleBuildState,
  type SectionStatusRow,
} from '../../services/regulatory/ctd-module-structure.js';

const router = Router();

function resolveOrgId(req: Request): number | null {
  const r = req as any;
  const raw = r.tenantId ?? r.organizationId ?? r.user?.organizationId;
  if (raw == null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

// GET /structure — region-aware M1/M2 section trees (no DB).
router.get('/structure', (req: Request, res: Response) => {
  const region = normalizeRegion((req.query as any).region);
  const moduleParam = (req.query as any).module as string | undefined;
  if (moduleParam === '1') return res.json({ region, module: 1, sections: getModule1Structure(region) });
  if (moduleParam === '2') return res.json({ region, module: 2, sections: getModule2Structure() });
  return res.json(getCtdModuleHome(region));
});

// GET /build-state/:projectId — M1 + M2 build-state for a program.
router.get('/build-state/:projectId', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(403).json({ error: 'FORBIDDEN' });
  const region = normalizeRegion((req.query as any).region);

  let rows: SectionStatusRow[] = [];
  try {
    const result = await pool.query(
      `SELECT ds.section_key, ds.status
         FROM c2c_document_sections ds
         JOIN c2c_documents d ON d.id = ds.document_id
        WHERE d.project_id = $1 AND d.org_id = $2`,
      [req.params.projectId, orgId],
    );
    rows = result.rows as SectionStatusRow[];
  } catch (err) {
    // Schema may be absent on some envs, or the program may have no documents.
    // Degrade to an all-not-started structure rather than failing the surface.
    console.error('[biopharma/ctd] build-state query', err);
    rows = [];
  }

  const module1 = annotateModuleBuildState(1, region, getModule1Structure(region), rows);
  const module2 = annotateModuleBuildState(2, region, getModule2Structure(), rows);
  return res.json({ projectId: req.params.projectId, region, module1, module2 });
});

export default router;
