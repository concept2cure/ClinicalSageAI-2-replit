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
import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { pool } from '../db';
import { writeChainedAuditRow } from '../services/auditService';
import { logger } from '../utils/logger';

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

/** The acting user, when the request carries one. Null is recorded as null. */
function getUserId(req: Request): number | null {
  const raw = (req as { user?: { id?: unknown } }).user?.id;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * What the request is waiting on, named for the agency that actually holds it.
 *
 * This was the constant string 'FDA grant/deny pending' for every row, so an
 * EMA Scientific Advice request or a PMDA consultation was filed — and shown
 * back to the sponsor in the Clock column — as waiting on the FDA. The agency
 * is a required field on the form; the line now says what it says.
 *
 * Deliberately no PDUFA day count. FDA's response and briefing-document goals
 * differ by meeting type (Type A/B/B-EOP/C/D, INTERACT), and other agencies do
 * not use them at all. A wrong deadline on this screen is worse than none.
 */
function pendingClockFor(agency: string): string {
  const name = agency.split('·')[0].trim() || agency.trim();
  return name.toUpperCase() === 'FDA'
    ? 'FDA grant/deny pending'
    : `${name} response to the request pending`;
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
 * briefing book or minutes yet.
 *
 * It IS audited. The surface's own dialog told the user "a meeting request is a
 * governed interaction — the request ... recorded with an audit entry", and no
 * audit row was written anywhere. The row and its sha256-chained `audit_logs`
 * entry are now written on one client in one transaction, so the claim on
 * screen is either true or the request is refused — never a record without the
 * entry the sponsor was told it had.
 *
 * Org scoped; 403 without org; 400 on a missing required field; 503
 * PENDING_STORE on 42P01 so the client falls back to its local-only behavior.
 */
/** The fields the form sends, trimmed, with the defaults the store expects. */
interface MeetingRequestFields {
  type: string;
  agency: string;
  program: string;
  goal: string;
  cat: string;
  format: string;
  requested: string | null;
}

/** Read the request body; name every required field that is missing. */
function parseMeetingRequest(
  body: Record<string, unknown>,
): { fields: MeetingRequestFields; missing: string[] } {
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
  return {
    missing,
    fields: {
      type, agency, program, goal,
      cat: str(body.cat) || type,
      format: str(body.format) || 'Teleconference',
      requested: str(body.requested) || null,
    },
  };
}

router.post('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }

  const { fields, missing } = parseMeetingRequest((req.body ?? {}) as Record<string, unknown>);
  if (missing.length > 0) {
    return res.status(400).json({
      error: { code: 'INVALID_BODY', message: `Missing required field(s): ${missing.join(', ')}.` },
    });
  }
  const { type, agency, program, goal, cat, format, requested } = fields;
  /* Date.now() alone collided for two requests in the same millisecond — a
     primary-key violation surfaced to the sponsor as "could not save". */
  const id = 'mtg-' + Date.now() + '-' + randomUUID().slice(0, 8);
  const status = 'requested';
  const clock = pendingClockFor(agency);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
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
    /* Same transaction as the INSERT: the audit entry the dialog promises
       commits with the meeting or neither exists. */
    await writeChainedAuditRow(client, {
      tenantId: orgId,
      userId: getUserId(req) ?? undefined,
      action: 'agency_meeting.requested',
      resourceType: 'c2c_agency_meetings',
      resourceId: r.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      details: { type, agency, cat, program, format, requested, status },
    });
    await client.query('COMMIT');
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
    await client.query('ROLLBACK').catch(() => undefined);
    if ((err as { code?: string })?.code === '42P01') {
      return res.status(503).json({
        error: { code: 'PENDING_STORE', message: 'Agency-meetings store is not provisioned yet.' },
      });
    }
    logger.error('agency-meeting create failed — nothing was recorded', {
      err: err instanceof Error ? err.message : String(err),
    });
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to create agency meeting.' } });
  } finally {
    client.release();
  }
});

export default router;
