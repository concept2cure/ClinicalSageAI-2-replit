/**
 * Agency-meetings — regulator-interaction worklist read.
 *
 * GET /api/agency-meetings → the org's agency meetings (Pre-IND, EOP2, device
 * Q-Sub, EMA Scientific Advice, …), shaped to exactly the keys the v2
 * AgencyMeetings surface renders ({ id, type, agency, cat, program, status,
 * requested, granted, meets, clock, format, goal }), each with its nested
 * briefing book and minutes rehydrated from JSONB so the detail panel adopts
 * live too. Org scoped; 403 without org context; fails closed to an empty list
 * on 42P01 so an unprovisioned store never 500s.
 */
import { Router, type Request, type Response } from 'express';
import { pool } from '../db';

const router = Router();

function getOrgId(req: Request): number | null {
  const r = req as {
    tenantId?: unknown;
    organizationId?: unknown;
    tenantContext?: { organizationId?: unknown };
    user?: { organizationId?: unknown };
  };
  const raw =
    r.tenantId ?? r.organizationId ?? r.tenantContext?.organizationId ?? r.user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, type, agency, cat, program, status,
              requested, granted, meets, clock, format, goal,
              briefing_book, minutes
         FROM c2c_agency_meetings
        WHERE organization_id = $1
        ORDER BY id`,
      [orgId],
    );
    const data = rows.map((r) => ({
      id: r.id,
      type: r.type,
      agency: r.agency,
      cat: r.cat,
      program: r.program,
      status: r.status,
      requested: r.requested ?? null,
      granted: r.granted ?? null,
      meets: r.meets ?? null,
      clock: r.clock,
      format: r.format,
      goal: r.goal,
      briefingBook: r.briefing_book ?? null,
      minutes: r.minutes ?? null,
    }));
    return res.json({ data, meta: { count: data.length } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read agency meetings.' } });
  }
});

/**
 * POST /api/agency-meetings — create a new agency-meeting request.
 *
 * The v2 AgencyMeetings surface's "Request an agency meeting" form POSTs here
 * when its read has adopted the store (LIVE). This is a plain org-scoped
 * persisted create — a new meeting instance in the 'requested' status with no
 * briefing book or minutes yet — NOT a governed/audited action. Org scoped;
 * 403 without org; 400 on a missing required field; 503 PENDING_STORE on 42P01
 * so the client falls back to its local-only behavior.
 */
router.post('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

  const type = str(body.type);
  const agency = str(body.agency);
  const program = str(body.program);
  const goal = str(body.goal);
  const missing = [
    ['type', type],
    ['agency', agency],
    ['program', program],
    ['goal', goal],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    return res.status(400).json({
      error: { code: 'INVALID_BODY', message: `Missing required field(s): ${missing.join(', ')}.` },
    });
  }

  const cat = str(body.cat) || type;
  const format = str(body.format) || 'Teleconference';
  const requested = str(body.requested) || null;
  const id = 'mtg-' + Date.now();
  const status = 'requested';
  const clock = 'FDA grant/deny pending';

  try {
    const { rows } = await pool.query(
      `INSERT INTO c2c_agency_meetings
         (id, organization_id, type, agency, cat, program, status,
          requested, granted, meets, clock, format, goal, briefing_book, minutes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL, $9, $10, $11, NULL, NULL)
       RETURNING id, type, agency, cat, program, status,
                 requested, granted, meets, clock, format, goal,
                 briefing_book, minutes`,
      [id, orgId, type, agency, cat, program, status, requested, clock, format, goal],
    );
    const r = rows[0];
    const data = {
      id: r.id,
      type: r.type,
      agency: r.agency,
      cat: r.cat,
      program: r.program,
      status: r.status,
      requested: r.requested ?? null,
      granted: r.granted ?? null,
      meets: r.meets ?? null,
      clock: r.clock,
      format: r.format,
      goal: r.goal,
      briefingBook: r.briefing_book ?? null,
      minutes: r.minutes ?? null,
    };
    return res.status(201).json({ data, meta: { created: true } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.status(503).json({
        error: { code: 'PENDING_STORE', message: 'Agency-meetings store is not provisioned yet.' },
      });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to create agency meeting.' } });
  }
});

export default router;
