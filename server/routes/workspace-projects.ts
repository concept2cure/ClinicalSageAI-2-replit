/**
 * workspace-projects.ts
 *
 * Extracted from server/index.ts — Workspace project creation and listing.
 * Multi-type project factory: IND/BLA/NDA → ind_projects, 510k/PMA/DeNovo → fda_510k_projects,
 * CER/MDR/IVDR → cer_projects.
 *
 * Routes:
 *   POST /api/workspace/projects  — create project (type-routed)
 *   GET  /api/workspace/projects  — list all projects (union across types)
 */

import { Router, type Request, type Response } from 'express';
import { getPool } from '../db';

const router = Router();
const pool = getPool();

/** POST / — create a new workspace project */
router.post('/', async (req: any, res: any) => {
  const rawOrgId =
    req.tenantContext?.organizationId ||
    req.organizationId ||
    req.user?.organizationId ||
    req.user?.tenantId;
  if (!rawOrgId) {
    return res.status(401).json({ error: 'Organization context required' });
  }
  const orgId: number = parseInt(String(rawOrgId), 10);
  if (!orgId) {
    return res.status(401).json({ error: 'Invalid organization ID' });
  }
  const {
    name,
    type = 'ind',
    description,
    clientId,
    deviceName,
    drugName,
    indication,
    sponsor,
    phase,
    deviceType,
    regulatoryContext,
    product,
    region,
    goal,
  } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ ok: false, error: 'name is required' });
  try {
    const t = (type || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let row: any;
    if (t === 'ind' || t === 'bla' || t === 'nda' || t === 'pharma') {
      const r = await pool.query(
        `INSERT INTO ind_projects (name, project_id, organization_id, client_workspace_id, drug_name, indication, sponsor, phase, status, stage, progress, project_data, step_data, sections, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active','planning',0,'{}','{}','[]',NOW(),NOW()) RETURNING id, name`,
        [
          name.trim(),
          `ind-${Date.now()}`,
          orgId,
          clientId ? parseInt(clientId, 10) : null,
          drugName || product || name.trim(),
          indication || goal || name.trim(),
          sponsor || 'TBD',
          phase || 'Phase 1',
        ]
      );
      row = { id: String(r.rows[0].id), name: r.rows[0].name, type: 'ind' };
    } else if (t === '510k' || t === 'pma' || t === 'denovo') {
      const r = await pool.query(
        `INSERT INTO fda_510k_projects (organization_id, device_name, device_classification, current_stage, current_stage_progress, overall_progress, created_at, updated_at) VALUES ($1,$2,$3,'planning',0,0,NOW(),NOW()) RETURNING id, device_name AS name`,
        [orgId, (deviceName || name).trim(), null]
      );
      row = { id: String(r.rows[0].id), name: r.rows[0].name, type: '510k' };
    } else {
      const r = await pool.query(
        `INSERT INTO cer_projects (name, organization_id, client_workspace_id, device_name, device_type, regulatory_context, description, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'active',NOW(),NOW()) RETURNING id, name`,
        [
          name.trim(),
          orgId,
          clientId ? parseInt(clientId, 10) : null,
          deviceName || name.trim(),
          deviceType || null,
          regulatoryContext || (t === 'ivdr' ? 'IVDR' : 'MDR'),
          description || null,
        ]
      );
      row = { id: String(r.rows[0].id), name: r.rows[0].name, type: 'cer' };
    }
    return res.status(201).json({ ok: true, project: { ...row, orgId: String(orgId) } });
  } catch (err: any) {
    console.error('[workspace/projects POST]', err?.message);
    return res
      .status(500)
      .json({ ok: false, error: 'Project creation failed', detail: err?.message });
  }
});

/** GET / — list all workspace projects (union of IND + 510k + CER) */
router.get('/', async (req: any, res: any) => {
  const rawOrgId =
    req.tenantContext?.organizationId ||
    req.organizationId ||
    req.user?.organizationId ||
    req.user?.tenantId;
  if (!rawOrgId) {
    return res.status(401).json({ error: 'Organization context required' });
  }
  const orgId: number = parseInt(String(rawOrgId), 10);
  if (!orgId) {
    return res.status(401).json({ error: 'Invalid organization ID' });
  }
  try {
    const r = await pool.query(
      `SELECT * FROM (SELECT id::text, name, 'ind' AS type, status, updated_at FROM ind_projects WHERE organization_id = $1 UNION ALL SELECT id::text, COALESCE(device_name,'Unnamed') AS name, '510k' AS type, NULL AS status, updated_at FROM fda_510k_projects WHERE organization_id = $1 UNION ALL SELECT id::text, name, 'cer' AS type, status, updated_at FROM cer_projects WHERE organization_id = $1) p ORDER BY updated_at DESC NULLS LAST`,
      [orgId]
    );
    return res.json({ ok: true, projects: r.rows });
  } catch (err: any) {
    return res
      .status(500)
      .json({ ok: false, error: 'Failed to load projects', detail: err?.message });
  }
});

export default router;
