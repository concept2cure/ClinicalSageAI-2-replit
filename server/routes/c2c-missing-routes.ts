/**
 * Concept2Cure Missing Routes
 * Stub endpoints for notifications, project sections, errors, predicates, CMC, vault docs.
 */
import { Router, Request, Response } from 'express';
import { query as dbQuery } from '../db';

async function safeQuery(sql: string, params: any[] = []): Promise<{ rows: any[] }> {
  try {
    return await dbQuery(sql, params);
  } catch (_) {
    return { rows: [] };
  }
}

const router = Router();

/* ── Notifications ─────────────────────────────────────────────────────────── */

router.get('/notifications', async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const filter = req.query.filter as string | undefined;
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '20', 10);

  const tableCheck = await safeQuery(
    `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='notifications') AS "exists"`
  );
  const tableExists = tableCheck.rows?.[0]?.exists ?? false;

  if (tableExists && userId) {
    const where = filter === 'unread' ? 'WHERE user_id=$1 AND read=false' : 'WHERE user_id=$1';
    const rows = await safeQuery(
      `SELECT id, notification_id, organization_id, recipient_id, type, category, priority,
              title, message, icon, action_url, activity_id,
              is_read, read_at, is_dismissed, dismissed_at,
              email_sent, email_sent_at, metadata, created_at
       FROM notifications ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${(page-1)*limit}`,
      [userId]
    );
    const counts = await safeQuery(
      `SELECT COUNT(*) as total, SUM(CASE WHEN read=false THEN 1 ELSE 0 END) as unread FROM notifications WHERE user_id=$1`,
      [userId]
    );
    const c = counts.rows?.[0] || {};
    return res.json({ notifications: rows.rows||[], total: parseInt(c.total||'0'), unread: parseInt(c.unread||'0'), page, limit });
  }
  return res.json({ notifications: [], total: 0, unread: 0, page, limit });
});

router.put('/notifications/read-all', async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  if (userId) await safeQuery(`UPDATE notifications SET read=true WHERE user_id=$1`, [userId]);
  return res.json({ success: true });
});

router.put('/notifications/:id/read', async (req: Request, res: Response) => {
  await safeQuery(`UPDATE notifications SET read=true WHERE id=$1`, [req.params.id]);
  return res.json({ success: true, id: req.params.id });
});

router.delete('/notifications/clear-all', async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  if (userId) await safeQuery(`DELETE FROM notifications WHERE user_id=$1`, [userId]);
  return res.json({ success: true });
});

router.get('/notifications/logs', (_req: Request, res: Response) => res.json({ logs: [] }));

/* ── Project Sections Status ────────────────────────────────────────────────── */

router.get('/project-sections/:code/status', async (req: Request, res: Response) => {
  const { code } = req.params;
  const projectId = req.query.project_id ? parseInt(req.query.project_id as string, 10) : null;

  const result = await safeQuery(
    `SELECT status, completion_percent, last_modified, locked, assigned_to
     FROM ind_sections WHERE section_code=$1 AND ($2::int IS NULL OR project_id=$2::int)
     ORDER BY updated_at DESC LIMIT 1`,
    [code, projectId]
  );
  const row = result.rows?.[0];
  return res.json({
    code,
    status: row?.status || 'draft',
    completionPercent: row?.completion_percent || 0,
    lastModified: row?.last_modified || null,
    locked: row?.locked || false,
    assignedTo: row?.assigned_to || null,
  });
});

/* ── Frontend Error Logging ─────────────────────────────────────────────────── */

router.post('/concept2cure/errors', (req: Request, res: Response) => {
  const { error, stack, context, userId } = req.body;
  console.error('[C2C Frontend Error]', {
    error: String(error || '').substring(0, 200),
    context,
    userId,
    stack: String(stack || '').substring(0, 500),
  });
  return res.json({ received: true });
});

/* ── 510(k) Predicates ──────────────────────────────────────────────────────── */

router.get('/510k/predicates', async (req: Request, res: Response) => {
  const limitNum = parseInt((req.query.limit as string) || '20', 10);
  const result = await safeQuery(
    `SELECT id, device_name, device_description, k_number, decision_date, product_code FROM fda_510k_stage_progress LIMIT $1`,
    [limitNum]
  );
  return res.json({
    predicates: (result.rows || []).map((r: any) => ({
      id: r.id, name: r.device_name, description: r.device_description,
      kNumber: r.k_number, decisionDate: r.decision_date, productCode: r.product_code,
    })),
    total: (result.rows || []).length,
  });
});

/* ── CMC Data ───────────────────────────────────────────────────────────────── */

router.get('/cmc/data', async (req: Request, res: Response) => {
  const projectId = req.query.project_id ? parseInt(req.query.project_id as string, 10) : null;
  const result = await safeQuery(
    `SELECT id, name, status, drug_substance, dosage_form, created_at FROM cmc_projects
     WHERE ($1::int IS NULL OR project_id=$1::int) ORDER BY created_at DESC LIMIT 50`,
    [projectId]
  );
  return res.json({ items: result.rows||[], total: (result.rows||[]).length, module: 'cmc' });
});

/* ── Vault Documents ────────────────────────────────────────────────────────── */

router.get('/vault/documents', async (req: Request, res: Response) => {
  const projectId = req.query.project_id ? parseInt(req.query.project_id as string, 10) : null;
  const fileType = (req.query.type as string) || null;
  const limitNum = parseInt((req.query.limit as string) || '50', 10);
  const result = await safeQuery(
    `SELECT id, filename, file_type, size, uploaded_at, project_id, metadata FROM vault_files
     WHERE ($1::int IS NULL OR project_id=$1::int) AND ($2::text IS NULL OR file_type=$2::text)
     ORDER BY uploaded_at DESC LIMIT $3`,
    [projectId, fileType, limitNum]
  );
  return res.json({ documents: result.rows||[], total: (result.rows||[]).length });
});

/* ── Planner root ───────────────────────────────────────────────────────────── */

router.get('/planner', (_req: Request, res: Response) => res.json({
  status: 'active',
  modules: ['generate-ind', 'generate-sap', 'generate-summary'],
  description: 'Protocol Planning & IND Generation Module',
}));

export default router;
