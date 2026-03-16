/**
 * Projects Routes
 * POST /api/projects — Create a new regulatory project
 * GET  /api/projects — List projects for the authenticated org
 *
 * Supported project types:
 *   ind   → ind_projects
 *   510k  → fda_510k_projects (device_name used as project label)
 *   cer   → cer_projects
 *   ivdr  → cer_projects (same table, different regulatory_context)
 */
import { Router, Request, Response } from 'express';
import { query as dbQuery } from '../db';

const router = Router();

async function sq(sql: string, params: any[] = []) {
  try {
    return await dbQuery(sql, params);
  } catch (err: any) {
    console.error('[projects] db error:', err?.message);
    throw err;
  }
}

// ─── POST /api/workspace/projects ──────────────────────────────────────────

router.post('/workspace/projects', async (req: Request, res: Response) => {
  const orgId: number = parseInt((req as any).organizationId || '1', 10);
  const userId: string | null = (req as any).userId || null;

  const {
    name,
    type = 'ind',
    description,
    clientId,
    submissionType,
    // 510k-specific
    deviceName,
    deviceClassification,
    // IND-specific
    drugName,
    indication,
    sponsor,
    phase,
    // CER/IVDR-specific
    deviceType,
    regulatoryContext,
  } = req.body as Record<string, string>;

  if (!name?.trim()) {
    return res.status(400).json({ ok: false, error: 'name is required' });
  }

  try {
    const t = (type || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let insertedId: string | number | null = null;
    let insertedType = t;

    if (t === 'ind' || t === 'bla' || t === 'nda' || t === 'pharma') {
      // ── IND / BLA / NDA → ind_projects ──────────────────────────────────
      const r = await sq(
        `INSERT INTO ind_projects
           (project_id, name, organization_id, client_workspace_id,
            drug_name, indication, sponsor, phase,
            status, stage, progress,
            project_data, step_data, sections,
            created_at, updated_at)
         VALUES (
           'ind-' || to_char(NOW(), 'YYYYMMDD') || '-' || floor(random()*10000)::int,
           $1, $2, $3, $4, $5, $6, $7,
           'active', 'planning', 0,
           '{}'::json, '{}'::json, '{}'::json,
           NOW(), NOW()
         )
         RETURNING id, name`,
        [
          name.trim(),
          orgId,
          clientId ? parseInt(clientId, 10) : null,
          drugName || name.trim(),
          indication || 'TBD',
          sponsor || 'TBD',
          phase || 'Phase 1',
        ]
      );
      insertedId = r.rows[0]?.id;
      insertedType = 'ind';
    } else if (t === '510k' || t === 'pma' || t === 'denovo') {
      // ── 510(k) / PMA / De Novo → fda_510k_projects ──────────────────────
      const r = await sq(
        `INSERT INTO fda_510k_projects
           (organization_id, project_id, device_name, device_classification, current_stage,
            current_stage_progress, overall_progress, created_at, updated_at)
         VALUES ($1,
           (SELECT COALESCE(MAX(id), 0) + 1 FROM fda_510k_projects),
           $2, $3, 'planning', 0, 0, NOW(), NOW())
         RETURNING id, device_name AS name`,
        [orgId, (deviceName || name).trim(), deviceClassification || null]
      );
      insertedId = r.rows[0]?.id;
      insertedType = '510k';
    } else {
      // ── CER / IVDR / MDD → cer_projects ─────────────────────────────────
      const r = await sq(
        `INSERT INTO cer_projects
           (name, organization_id, client_workspace_id, device_name, device_manufacturer,
            device_type, regulatory_context, description, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW(), NOW())
         RETURNING id, name`,
        [
          name.trim(),
          orgId,
          clientId ? parseInt(clientId, 10) : null,
          deviceName || name.trim(),
          'TBD',
          deviceType || null,
          regulatoryContext || (t === 'ivdr' ? 'IVDR' : 'MDR'),
          description || null,
        ]
      );
      insertedId = r.rows[0]?.id;
      insertedType = 'cer';
    }

    return res.status(201).json({
      ok: true,
      project: {
        id: String(insertedId),
        name: name.trim(),
        type: insertedType,
        orgId: String(orgId),
      },
    });
  } catch (err: any) {
    console.error('[projects/create] error:', err?.message);
    return res
      .status(500)
      .json({ ok: false, error: 'Project creation failed', detail: err?.message });
  }
});

// ─── GET /api/workspace/projects ────────────────────────────────────────────

router.get('/workspace/projects', async (req: Request, res: Response) => {
  const orgId: number = parseInt((req as any).organizationId || '1', 10);

  try {
    const r = await sq(
      `SELECT * FROM (
         SELECT id::text, name, 'ind' AS type, status, updated_at FROM ind_projects WHERE organization_id = $1
         UNION ALL
         SELECT id::text, COALESCE(device_name, 'Unnamed') AS name, '510k' AS type, NULL AS status, updated_at FROM fda_510k_projects WHERE organization_id = $1
         UNION ALL
         SELECT id::text, name, 'cer' AS type, status, updated_at FROM cer_projects WHERE organization_id = $1
       ) p
       ORDER BY updated_at DESC NULLS LAST`,
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
