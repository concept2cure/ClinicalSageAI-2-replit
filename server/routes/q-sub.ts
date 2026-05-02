/**
 * Q-Submission routes — mounted at /api/q-sub.
 *
 *   GET    /api/q-sub                            list (filters: type, stage, program_id)
 *   POST   /api/q-sub                            create new Q-Sub (plan stage)
 *   GET    /api/q-sub/:id                        full detail (questions + commitments + timeline)
 *   PATCH  /api/q-sub/commitments/:id/rolled-in  toggle commitment.rolled_in
 *
 * All endpoints require an authenticated user with an organization context.
 * Per-row access control is enforced inside the service via JOINs against
 * regulatory_programs.organization_id.
 */

import { Router, Request, Response } from 'express';

import { authenticateToken } from '../middleware/auth';
import {
  createQSubmission,
  getQSubDetail,
  listQSubsForOrg,
  setCommitmentRolledIn,
  TenantAccessError,
  type ListFilters,
  type QSubType,
  type QSubStage,
} from '../services/q-sub/q-sub.service';
import { Q_SUB_TYPES, Q_SUB_STAGES } from '../../shared/schema/q-sub';

const router = Router();
router.use(authenticateToken);

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

function getUserId(req: Request): string | null {
  const raw = (req as any).user?.id;
  if (raw === undefined || raw === null) return null;
  return typeof raw === 'string' ? raw : String(raw);
}

const TYPE_SET = new Set<string>(Q_SUB_TYPES);
const STAGE_SET = new Set<string>(Q_SUB_STAGES);

// ─── GET /api/q-sub — list ──────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: 'Organization context required' });
  }

  const filters: ListFilters = {};
  const typeRaw = req.query.type;
  if (typeof typeRaw === 'string' && typeRaw.length > 0) {
    if (!TYPE_SET.has(typeRaw)) {
      return res.status(422).json({ error: `type must be one of: ${Q_SUB_TYPES.join(', ')}` });
    }
    filters.type = typeRaw as QSubType;
  }
  const stageRaw = req.query.stage;
  if (typeof stageRaw === 'string' && stageRaw.length > 0) {
    if (!STAGE_SET.has(stageRaw)) {
      return res.status(422).json({ error: `stage must be one of: ${Q_SUB_STAGES.join(', ')}` });
    }
    filters.stage = stageRaw as QSubStage;
  }
  const programIdRaw = req.query.program_id;
  if (typeof programIdRaw === 'string' && programIdRaw.length > 0) {
    filters.programId = programIdRaw;
  }
  const limitRaw = req.query.limit;
  if (typeof limitRaw === 'string' && limitRaw.length > 0) {
    const n = parseInt(limitRaw, 10);
    if (Number.isFinite(n)) filters.limit = n;
  }

  try {
    const rows = await listQSubsForOrg(orgId, filters);
    res.json({ rows, count: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: 'List failed', detail: err?.message });
  }
});

// ─── POST /api/q-sub — create new ───────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: 'Organization context required' });
  }

  const body = req.body ?? {};

  const programId = typeof body.programId === 'string' ? body.programId : null;
  if (!programId) {
    return res.status(422).json({ error: 'programId is required' });
  }
  // regulatory_programs.id is uuid; non-uuid input would fail downstream
  // with "invalid input syntax for type uuid". Surface as 422 here so the
  // client gets a clean validation error rather than a 500.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(programId)) {
    return res.status(422).json({ error: 'programId must be a UUID' });
  }
  const qSubType = typeof body.qSubType === 'string' ? body.qSubType : null;
  if (!qSubType || !TYPE_SET.has(qSubType)) {
    return res.status(422).json({ error: `qSubType must be one of: ${Q_SUB_TYPES.join(', ')}` });
  }
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (title.length === 0) {
    return res.status(422).json({ error: 'title is required' });
  }

  let targetDate: Date | null = null;
  if (typeof body.targetDate === 'string' && body.targetDate.length > 0) {
    const d = new Date(body.targetDate);
    if (Number.isNaN(d.getTime())) {
      return res.status(422).json({ error: 'targetDate must be an ISO-8601 date' });
    }
    targetDate = d;
  }

  try {
    const row = await createQSubmission(orgId, {
      programId,
      qSubType: qSubType as QSubType,
      title,
      fdaTeam: typeof body.fdaTeam === 'string' ? body.fdaTeam : null,
      targetDate,
      summary: typeof body.summary === 'string' ? body.summary : null,
      createdBy: getUserId(req),
    });
    res.status(201).json(row);
  } catch (err: unknown) {
    if (err instanceof TenantAccessError) {
      return res.status(403).json({ error: err.message });
    }
    const detail = err instanceof Error ? err.message : 'unknown';
    res.status(500).json({ error: 'Create failed', detail });
  }
});

// ─── GET /api/q-sub/:id — detail ────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: 'Organization context required' });
  }

  try {
    const detail = await getQSubDetail(orgId, req.params.id);
    if (!detail) return res.status(404).json({ error: 'Q-Sub not found' });
    res.json(detail);
  } catch (err: any) {
    res.status(500).json({ error: 'Fetch failed', detail: err?.message });
  }
});

// ─── PATCH /api/q-sub/commitments/:id/rolled-in ─────────────────────────────

router.patch('/commitments/:id/rolled-in', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: 'Organization context required' });
  }

  const body = req.body ?? {};
  if (typeof body.rolledIn !== 'boolean') {
    return res.status(422).json({ error: 'rolledIn (boolean) is required' });
  }

  try {
    const updated = await setCommitmentRolledIn(orgId, {
      commitmentId: req.params.id,
      rolledIn: body.rolledIn,
      rolledInBy: body.rolledIn ? getUserId(req) : null,
    });
    res.json(updated);
  } catch (err: unknown) {
    if (err instanceof TenantAccessError) {
      return res.status(403).json({ error: err.message });
    }
    const detail = err instanceof Error ? err.message : 'unknown';
    res.status(500).json({ error: 'Update failed', detail });
  }
});

export default router;
