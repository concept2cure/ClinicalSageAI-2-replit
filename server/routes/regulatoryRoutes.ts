import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { RegulatoryIntelligenceService } from '../services/regulatory-intelligence-service';
import { getPool } from '../db';
import { getSecureOrgId } from '../utils/tenantContext';

const router = express.Router();
const regulatoryService = new RegulatoryIntelligenceService();
router.use(authenticate);

const REGULATORY_DATA_UNAVAILABLE = {
  success: false,
  error: 'Regulatory data unavailable',
  message:
    'Regulatory workflow tables are not available in this environment. Data is not synthesized from mock defaults.',
};

function getDbClientOrNull() {
  try {
    return getPool();
  } catch {
    return null;
  }
}

async function tableReady(pool: ReturnType<typeof getDbClientOrNull>, tableName: string) {
  if (!pool) return false;
  try {
    const check = await pool.query(`SELECT to_regclass($1) AS tbl`, [tableName]);
    return !!check.rows[0]?.tbl;
  } catch {
    return false;
  }
}

function requireOrgId(req: express.Request, res: express.Response): number | null {
  const orgIdRaw = getSecureOrgId(req as any);
  const orgId = orgIdRaw ? Number(orgIdRaw) : NaN;
  if (!Number.isFinite(orgId) || orgId <= 0) {
    res.status(401).json({ success: false, error: 'Organization context required' });
    return null;
  }
  return orgId;
}

router.get('/submissions', async (req, res) => {
  const orgId = requireOrgId(req, res);
  if (!orgId) return;

  const pool = getDbClientOrNull();
  if (!(await tableReady(pool, 'public.c2c_submissions'))) {
    return res.status(503).json(REGULATORY_DATA_UNAVAILABLE);
  }

  const { rows } = await pool!.query(
    `SELECT id, submission_type, regulator, lifecycle_state, application_number, sequence_number, created_at
     FROM c2c_submissions
     WHERE organization_id = $1
     ORDER BY created_at DESC
     LIMIT 200`,
    [orgId]
  );

  const data = rows.map((row: any) => ({
    id: row.id,
    title:
      row.application_number && row.submission_type
        ? `${row.submission_type} ${row.application_number}`
        : row.submission_type || 'Regulatory Submission',
    agency: row.regulator || 'Unknown',
    status: row.lifecycle_state || 'unknown',
    type: row.submission_type || 'unknown',
    sequenceNumber: row.sequence_number || null,
    createdAt: row.created_at,
  }));

  return res.json({ success: true, data, source: 'c2c_submissions' });
});

router.get('/calendar', async (req, res) => {
  const orgId = requireOrgId(req, res);
  if (!orgId) return;

  const pool = getDbClientOrNull();
  if (!(await tableReady(pool, 'public.c2c_correspondence'))) {
    return res.status(503).json(REGULATORY_DATA_UNAVAILABLE);
  }

  const { rows } = await pool!.query(
    `SELECT id, subject, due_date, urgency, status, submission_id
     FROM c2c_correspondence
     WHERE organization_id = $1
       AND due_date IS NOT NULL
     ORDER BY due_date ASC
     LIMIT 200`,
    [orgId]
  );

  const data = rows.map((row: any) => ({
    id: row.id,
    title: row.subject || 'Regulatory correspondence deadline',
    eventType: 'deadline',
    status: row.status || 'open',
    priority: row.urgency || 'medium',
    eventDate: row.due_date,
    submissionId: row.submission_id || null,
  }));

  return res.json({ success: true, data, source: 'c2c_correspondence' });
});

router.post('/calendar', async (_req, res) => {
  return res.status(501).json({
    success: false,
    error: 'Not implemented',
    message:
      'Calendar creation is not implemented on this endpoint yet. Use governed submission/correspondence workflows.',
  });
});

// Keep /search contract intact for existing clients while avoiding registry route overlap.
router.get('/search', async (req, res) => {
  const { q, phase } = req.query;
  await regulatoryService.initialize();
  const results = await regulatoryService.getRegulatoryIntelligence(
    (phase as string) || 'Phase 2',
    q as string | undefined
  );
  res.json(results);
});

router.get('/regulatory/search', async (req, res) => {
  const { q, phase } = req.query;
  await regulatoryService.initialize();
  const results = await regulatoryService.getRegulatoryIntelligence(
    (phase as string) || 'Phase 2',
    q as string | undefined
  );
  res.json(results);
});

router.get('/risk/:sectionId', async (req, res) => {
  const { sectionId } = req.params;
  await regulatoryService.initialize();
  const analysis = await regulatoryService.analyzeProtocolCompliance(
    `Section ${sectionId}`,
    'Phase 2'
  );
  res.json({ sectionId, analysis });
});

router.get('/regulatory/risk/:sectionId', async (req, res) => {
  const { sectionId } = req.params;
  await regulatoryService.initialize();
  const analysis = await regulatoryService.analyzeProtocolCompliance(
    `Section ${sectionId}`,
    'Phase 2'
  );
  res.json({ sectionId, analysis });
});
export default router;
