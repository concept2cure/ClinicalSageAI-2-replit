/**
 * IND Routes — Investigational New Drug application management
 *
 * Provides full CRUD for IND applications plus AI content generation
 * endpoints that delegate to indCopilot.js.
 *
 * All routes are org/project scoped via headers:
 *   x-organization-id  — tenant organisation
 *   x-project-id       — optional project filter
 *
 * @module server/routes/ind
 */
import { Router, Request, Response } from 'express';
import { query, transaction } from '../db';
import { createScopedLogger } from '../utils/logger';
import indCopilot from '../services/indCopilot.js';

const router = Router();
const logger = createScopedLogger('ind-routes');

// ── helpers ─────────────────────────────────────────────────────────────────

function tenantHeaders(req: Request) {
  return {
    organizationId: (req as any).tenantId || (req as any).tenantContext?.organizationId || (req as any).user?.organizationId || null,
    projectId: (req.headers['x-project-id'] as string) || null,
  };
}

function sendError(res: Response, status: number, message: string, detail?: unknown) {
  logger.error(message, detail);
  return res.status(status).json({ success: false, error: message });
}

// ── GET /applications ────────────────────────────────────────────────────────

/**
 * List IND applications for the current organisation.
 * Supports ?status=&limit=&offset= query parameters.
 */
router.get('/applications', async (req: Request, res: Response) => {
  try {
    const { organizationId } = tenantHeaders(req);
    const { status, limit = '50', offset = '0' } = req.query as Record<string, string>;

    const params: unknown[] = [];
    let where = 'WHERE 1=1';

    if (organizationId) {
      params.push(organizationId);
      where += ` AND organization_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      where += ` AND status = $${params.length}`;
    }

    params.push(parseInt(limit, 10));
    const limitClause = `LIMIT $${params.length}`;
    params.push(parseInt(offset, 10));
    const offsetClause = `OFFSET $${params.length}`;

    const sql = `
      SELECT
        id,
        project_id,
        organization_id,
        drug_name,
        indication,
        sponsor,
        submission_type,
        status,
        progress_pct,
        created_at,
        updated_at
      FROM ind_applications
      ${where}
      ORDER BY updated_at DESC
      ${limitClause} ${offsetClause}
    `;

    const countSql = `SELECT COUNT(*)::int AS total FROM ind_applications ${where}`;
    const countParams = params.slice(0, params.length - 2); // drop limit/offset

    const [rowsResult, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, countParams),
    ]);

    res.json({
      success: true,
      applications: rowsResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });
  } catch (err: any) {
    sendError(res, 500, 'Failed to list IND applications', err);
  }
});

// ── GET /applications/:id ─────────────────────────────────────────────────────

/**
 * Fetch a single IND application by ID, including its sections.
 */
router.get('/applications/:id', async (req: Request, res: Response) => {
  try {
    const { organizationId } = tenantHeaders(req);
    const { id } = req.params;

    const appResult = await query(
      `SELECT id, project_id, organization_id, drug_name, indication, sponsor, submission_type, status, progress_pct, created_at, updated_at FROM ind_applications WHERE id = $1${organizationId ? ' AND organization_id = $2' : ''}`,
      organizationId ? [id, organizationId] : [id]
    );

    if (!appResult.rows.length) {
      return res.status(404).json({ success: false, error: 'IND application not found' });
    }

    // Fetch associated artifacts / section statuses
    const sectionsResult = await query(
      `SELECT
        ctd_section,
        title,
        status,
        artifact_id,
        updated_at
       FROM concept2cure_artifacts
       WHERE project_id = $1
       ORDER BY ctd_section`,
      [appResult.rows[0].project_id]
    );

    res.json({
      success: true,
      application: {
        ...appResult.rows[0],
        sections: sectionsResult.rows,
      },
    });
  } catch (err: any) {
    sendError(res, 500, 'Failed to fetch IND application', err);
  }
});

// ── POST /applications ────────────────────────────────────────────────────────

/**
 * Create a new IND application draft.
 */
router.post('/applications', async (req: Request, res: Response) => {
  try {
    const { organizationId, projectId } = tenantHeaders(req);
    const {
      drug_name,
      indication,
      sponsor,
      submission_type = 'IND',
    } = req.body as Record<string, string>;

    if (!drug_name) {
      return res.status(400).json({ success: false, error: 'drug_name is required' });
    }

    const result = await query(
      `INSERT INTO ind_applications
         (project_id, organization_id, drug_name, indication, sponsor, submission_type, status, progress_pct, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft', 0, NOW(), NOW())
       RETURNING *`,
      [projectId, organizationId, drug_name, indication || null, sponsor || null, submission_type]
    );

    res.status(201).json({ success: true, application: result.rows[0] });
  } catch (err: any) {
    sendError(res, 500, 'Failed to create IND application', err);
  }
});

// ── PUT /applications/:id ─────────────────────────────────────────────────────

/**
 * Update an existing IND application.
 */
router.put('/applications/:id', async (req: Request, res: Response) => {
  try {
    const { organizationId } = tenantHeaders(req);
    const { id } = req.params;
    const { drug_name, indication, sponsor, status, submission_type, progress_pct } = req.body;

    const updates: string[] = [];
    const params: unknown[] = [];

    const set = (col: string, val: unknown) => {
      if (val !== undefined) {
        params.push(val);
        updates.push(`${col} = $${params.length}`);
      }
    };

    set('drug_name', drug_name);
    set('indication', indication);
    set('sponsor', sponsor);
    set('status', status);
    set('submission_type', submission_type);
    set('progress_pct', progress_pct);

    if (!updates.length) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    params.push(new Date().toISOString());
    updates.push(`updated_at = $${params.length}`);

    params.push(id);
    const idParam = `$${params.length}`;

    let sql = `UPDATE ind_applications SET ${updates.join(', ')} WHERE id = ${idParam}`;
    if (organizationId) {
      params.push(organizationId);
      sql += ` AND organization_id = $${params.length}`;
    }
    sql += ' RETURNING *';

    const result = await query(sql, params);

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'IND application not found' });
    }

    res.json({ success: true, application: result.rows[0] });
  } catch (err: any) {
    sendError(res, 500, 'Failed to update IND application', err);
  }
});

// ── DELETE /applications/:id ──────────────────────────────────────────────────

router.delete('/applications/:id', async (req: Request, res: Response) => {
  try {
    const { organizationId } = tenantHeaders(req);
    const { id } = req.params;

    // SAFETY: Only allow deletion of draft applications
    const checkParams: unknown[] = [id];
    let checkSql = 'SELECT id, status, organization_id FROM ind_applications WHERE id = $1';
    if (organizationId) {
      checkParams.push(organizationId);
      checkSql += ` AND organization_id = $${checkParams.length}`;
    }

    const existing = await query(checkSql, checkParams);
    if (!existing.rows.length) {
      return res.status(404).json({ success: false, error: 'IND application not found' });
    }

    const app = existing.rows[0];
    if (app.status && app.status !== 'draft') {
      return res.status(409).json({
        success: false,
        error: `Cannot delete application in "${app.status}" status. Only draft applications can be deleted.`,
      });
    }

    const u = (req as any).user || {};
    const auditUserId = Number(u.id ?? u.userId) || null;

    // 21 CFR Part 11 §11.10(e): delete the regulated IND/FDA submission record
    // and record the deletion in the hash-chained, append-only audit_events
    // table IN THE SAME TRANSACTION — atomic and fail-closed (an audit failure
    // rolls the delete back, so a regulated record is never removed unaudited).
    const deletedId = await transaction(async (client: any) => {
      const delParams: unknown[] = [id];
      let delSql = 'DELETE FROM ind_applications WHERE id = $1';
      if (organizationId) {
        delParams.push(organizationId);
        delSql += ` AND organization_id = $${delParams.length}`;
      }
      delSql += ' RETURNING id';

      const del = await client.query(delSql, delParams);
      if (!del.rows.length) {
        throw new Error('IND application not found');
      }

      await client.query(
        `INSERT INTO audit_events
           (organization_id, event_type, entity_type, entity_id, user_id, user_name,
            user_role, ip_address, timestamp, reason, metadata,
            regulatory_significant, gxp_relevant, created_at)
         VALUES ($1, 'ind_application.deleted', 'ind_application', $2, $3, $4, $5, $6,
                 NOW(), $7, $8, true, true, NOW())`,
        [
          app.organization_id,
          Number(id),
          auditUserId,
          u.name ?? u.email ?? 'System',
          u.role ?? 'user',
          req.ip ?? '',
          'IND application deleted',
          JSON.stringify({ previousStatus: app.status ?? null }),
        ],
      );

      return del.rows[0].id;
    });

    res.json({ success: true, deleted: deletedId });
  } catch (err: any) {
    sendError(res, 500, 'Failed to delete IND application', err);
  }
});

// ── POST /applications/:id/generate/:sectionCode ──────────────────────────────

/**
 * Generate AI content for a specific section of an IND application.
 * Delegates to indCopilot.generateSectionContent().
 */
router.post('/applications/:id/generate/:sectionCode', async (req: Request, res: Response) => {
  try {
    const { id, sectionCode } = req.params;
    const { model, temperature, max_tokens } = req.body || {};

    const result = await indCopilot.generateSectionContent(id, sectionCode, {
      model,
      temperature,
      max_tokens,
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    sendError(res, 500, `Failed to generate content for section ${req.params.sectionCode}`, err);
  }
});

// ── POST /applications/:id/stream/:sectionCode ────────────────────────────────

/**
 * Stream AI content generation for a specific IND section via SSE.
 * Writes Server-Sent Events (`data: <chunk>\n\n`) until [DONE].
 */
router.post('/applications/:id/stream/:sectionCode', async (req: Request, res: Response) => {
  const { id, sectionCode } = req.params;
  const { model, temperature, max_tokens } = req.body || {};

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const stream = await indCopilot.streamSectionContent(id, sectionCode, {
      model,
      temperature,
      max_tokens,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content ?? '';
      if (delta) {
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err: any) {
    logger.error('Streaming generation error', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// ── POST /applications/:id/analyze/:sectionCode ───────────────────────────────

/**
 * Analyze existing section content for compliance and quality.
 */
router.post('/applications/:id/analyze/:sectionCode', async (req: Request, res: Response) => {
  try {
    const { id, sectionCode } = req.params;
    const analysis = await indCopilot.analyzeContent(id, sectionCode);
    res.json({ success: true, analysis });
  } catch (err: any) {
    sendError(res, 500, 'Failed to analyze section content', err);
  }
});

// ── GET /applications/:id/guidance/:sectionCode ───────────────────────────────

/**
 * Get regulatory guidance for a specific section.
 */
router.get('/applications/:id/guidance/:sectionCode', async (req: Request, res: Response) => {
  try {
    const { sectionCode } = req.params;
    const guidance = await indCopilot.getRegulatoryGuidance(sectionCode);
    res.json({ success: true, guidance });
  } catch (err: any) {
    sendError(res, 500, 'Failed to get regulatory guidance', err);
  }
});

// ── POST /applications/:id/followup ──────────────────────────────────────────

/**
 * Generate a follow-up AI response for a section (revision / Q&A).
 */
router.post('/applications/:id/followup', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { sectionCode, originalContent, userInstruction, model, temperature } = req.body;

    if (!sectionCode || !originalContent || !userInstruction) {
      return res.status(400).json({
        success: false,
        error: 'sectionCode, originalContent, and userInstruction are required',
      });
    }

    const result = await indCopilot.generateFollowupResponse(
      id,
      sectionCode,
      originalContent,
      userInstruction,
      { model, temperature }
    );

    res.json({ success: true, ...result });
  } catch (err: any) {
    sendError(res, 500, 'Failed to generate follow-up response', err);
  }
});

export default router;
