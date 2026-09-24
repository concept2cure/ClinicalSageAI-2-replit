/**
 * Module access requests — the endpoint behind "ask an administrator".
 *
 * Mounted at /api/module-access-requests.
 *
 *   POST   /                 a member records a request for a locked module
 *   GET    /mine             the caller's own requests (the lock panel reads this)
 *   GET    /                 the org administrator's queue — the caller's workspace
 *   POST   /:id/decision     approve or decline, with a reason
 *
 * ── EVERY WORKSPACE IS NOT SERVED HERE (2026-09-22) ─────────────────────────
 * This prefix is not a system-scope prefix, so every request to it runs under
 * the CALLER'S organization scope, and module_access_requests is RLS enabled +
 * FORCED. A cross-workspace read here cannot work, and it did not fail — it
 * narrowed: the platform owner's `?scope=all` answered 200 with only the
 * owner's own workspace, which the console rendered as "no requests waiting"
 * for every other one. Answering another workspace's request from here reads
 * the row under the caller's scope, finds nothing, and returns 404.
 * (Reproduced on real PostgreSQL as the runtime role by
 * tests/db/module-access-requests.dbtest.ts.)
 *
 * So the platform owner's queue and decisions are served by
 * ./admin/master-access-requests, mounted under /api/admin/master — a
 * SYSTEM_SCOPE_PREFIXES entry — inside the Master Administration guard. It
 * mounts the SAME two handlers exported below; there is one queue read and one
 * decision in the product, and two mounts. This route refuses `scope=all`
 * outright rather than quietly answering for one workspace.
 *
 * WHAT THIS CLOSES. A locked destination opens a panel that names the module,
 * the real reason and the tier that would include it. If the viewer is an org
 * administrator the panel offers the plans page, which has a real checkout. If
 * they are not, it offered nothing — deliberately, because it refuses to hand
 * somebody a button that will be refused. That was honest and it was a dead
 * end. These endpoints are the step that was missing: the ask is recorded once,
 * an administrator sees it, and their answer is governed.
 *
 * ── AUTHORIZATION IS IN ONE PLACE AND IT IS NOT THIS FILE ────────────────────
 * Every rule lives in ../services/entitlements/access-requests, as a pure
 * function over a resolved actor. This file's job is to RESOLVE the actor the
 * same way its neighbours do (tenant context first, then the token's own
 * claims — see ./module-subscriptions) and to obey the answer. The one rule it
 * enforces structurally rather than by a check is the most important: the
 * organization a request is filed against comes from the caller's tenant
 * context and is never read from the body, so there is no field with which to
 * aim a request at another workspace.
 *
 * ── APPROVING GRANTS THE MODULE THE ONE CANONICAL WAY ────────────────────────
 * `writeModuleGrant` (../services/entitlements/module-grants) is the one place
 * the `module_subscriptions` upsert lives — the row the entitlement resolver
 * reads ahead of tier and industry. This route does not write it a second time.
 *
 * The grant is written BEFORE the request is marked approved, so the only way
 * to fail is the safe one: a request that still reads open, and no capability
 * handed out. Nothing here reads a request row to decide entitlement, and
 * nothing here revokes anything.
 *
 * @module server/routes/module-access-requests
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger.js';
import { recordAuditRow } from '../services/audit/audit-write-outcome.js';
import { authenticateToken } from '../middleware/auth.js';
import { resolveMasterAdmin } from '../services/entitlements/master-admin.js';
import { writeModuleGrant } from '../services/entitlements/module-grants.js';
import {
  denyCreate,
  denyDecision,
  denyQueueRead,
  isDecision,
  mapRow,
  normalizeModuleId,
  normalizeNote,
  normalizeReason,
  toStatus,
  type AccessRequestQueueScope,
  type AccessRequestRow,
  type Denial,
  type RequestActor,
} from '../services/entitlements/access-requests.js';

const logger = createScopedLogger('module-access-requests');
const router = Router();

/** The whole router reads identity, so none of it is reachable unauthenticated. */
router.use(authenticateToken);

/** How many rows a single queue read returns. */
const QUEUE_LIMIT = 200;

/**
 * Resolve the caller into the shape the rules take.
 *
 * Org context and role are read exactly as ./module-subscriptions reads them —
 * tenant context first, then the token's claims — so this feature cannot end up
 * with a second, subtly different idea of which workspace a request belongs to.
 * The role list is assembled the way ../middleware/auth's own guards assemble
 * it (`role` plus `roles`), because a token minted with only one of the two is
 * still the same administrator.
 */
async function resolveActor(req: Request): Promise<RequestActor> {
  const anyReq = req as any;
  const rawOrg = anyReq.tenantContext?.organizationId ?? anyReq.user?.organizationId;
  const orgId = Number(rawOrg);
  const rawUser = anyReq.user?.id ?? anyReq.userId;
  const userId = Number(rawUser);
  const roles = [anyReq.user?.role ?? anyReq.userRole, ...(anyReq.user?.roles ?? [])].filter(
    Boolean,
  ) as string[];

  return {
    userId: Number.isFinite(userId) && userId > 0 ? userId : null,
    organizationId: Number.isFinite(orgId) && orgId > 0 ? orgId : null,
    isOrgAdmin: roles.includes('admin'),
    // resolveMasterAdmin, not isMasterAdmin: the synchronous check cannot see a
    // designation made in the Access Management console, and answering "no"
    // there would hide every other workspace's requests from the platform owner.
    isMasterAdmin: await resolveMasterAdmin(req),
  };
}

function actorEmail(req: Request): string | null {
  const anyReq = req as any;
  const email = anyReq.user?.email ?? anyReq.userEmail;
  return typeof email === 'string' && email.trim() ? email.trim() : null;
}

function actorName(req: Request): string | null {
  const anyReq = req as any;
  const name = anyReq.user?.name ?? anyReq.user?.fullName;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

function refuse(res: Response, denial: Denial) {
  return res.status(denial.status).json({ error: denial.error });
}

/** The joined projection every read returns, so one mapper serves all of them. */
const SELECT_REQUEST = `
  SELECT r.id, r.organization_id, r.module_id, r.requested_by, r.requester_email,
         r.requester_name, r.note, r.status, r.decided_by, r.decided_by_email,
         r.decided_at, r.decision_reason, r.created_at, r.updated_at,
         am.name AS module_name, o.name AS organization_name
    FROM module_access_requests r
    LEFT JOIN available_modules am ON am.module_id = r.module_id
    LEFT JOIN organizations o ON o.id = r.organization_id`;

// ─── POST / — record a request ───────────────────────────────────────────────
//
// THE DE-DUPLICATION RULE. A second request for the same module by the same
// person in the same organization UPDATES the open one; it never stacks a
// second row onto an administrator's queue. The conflict target is the partial
// unique index, so the rule is held by the database and survives two concurrent
// clicks — an application-level "does one already exist" check cannot.
//
// `alreadyOpen` is returned so the caller can SAY SO. A click that is quietly
// absorbed into an existing row, reported as success, teaches the requester
// that nothing happened.
router.post('/', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(req);
    const denial = denyCreate(actor);
    if (denial) return refuse(res, denial);

    const moduleId = normalizeModuleId((req.body ?? {}).moduleId);
    if (!moduleId) return res.status(400).json({ error: 'Choose the app you need.' });

    const note = normalizeNote((req.body ?? {}).note);
    if ('tooLong' in note) {
      return res.status(400).json({ error: 'That note is too long. Please shorten it.' });
    }

    const known = await pool.query(
      `SELECT module_id FROM available_modules WHERE module_id = $1`,
      [moduleId],
    );
    if (!known.rows.length) return res.status(404).json({ error: 'Unknown app.' });

    // `xmax = 0` distinguishes a row this statement INSERTED from one it
    // updated — the only way to know, from a single upsert, whether a request
    // was already open.
    const written = await pool.query(
      `INSERT INTO module_access_requests
         (organization_id, module_id, requested_by, requester_email, requester_name, note, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'open')
       ON CONFLICT (organization_id, module_id, requested_by) WHERE status = 'open'
       DO UPDATE SET
         note = COALESCE(EXCLUDED.note, module_access_requests.note),
         requester_email = COALESCE(EXCLUDED.requester_email, module_access_requests.requester_email),
         requester_name = COALESCE(EXCLUDED.requester_name, module_access_requests.requester_name),
         updated_at = now()
       RETURNING id, (xmax = 0) AS inserted`,
      [
        actor.organizationId,
        moduleId,
        actor.userId,
        actorEmail(req),
        actorName(req),
        note.note,
      ],
    );

    const id = written.rows[0]?.id;
    const alreadyOpen = written.rows[0]?.inserted === false;

    const full = await pool.query(`${SELECT_REQUEST} WHERE r.id = $1`, [id]);
    const request = mapRow(full.rows[0] as AccessRequestRow);

    // Recorded whether or not the row is new: an ask repeated is itself a fact
    // an administrator may later need to see. WO-16C: the outcome is carried
    // in `auditTrail`, not discarded; the ask stands either way.
    const auditTrail = await recordAuditRow({
      tenantId: actor.organizationId ?? undefined,
      userId: actor.userId ?? undefined,
      action: 'data_modify',
      resourceType: 'module_access_request',
      resourceId: String(id),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      details: {
        accessRequestAction: alreadyOpen ? 'request.repeated' : 'request.opened',
        moduleId,
        organizationId: actor.organizationId,
      },
    });

    return res.status(alreadyOpen ? 200 : 201).json({ request, alreadyOpen, auditTrail });
  } catch (err) {
    logger.error('access request create failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Your request was not recorded. Please try again.' });
  }
});

// ─── GET /mine — what this person has already asked for ──────────────────────
//
// Read by the lock panel so it can say "a request is already open, made on
// <date>" instead of offering a button whose click would change nothing.
// Scoped to the caller's own user id AND their current workspace: somebody who
// has moved organizations should not carry the old workspace's asks with them.
router.get('/mine', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(req);
    const denial = denyCreate(actor);
    if (denial) return refuse(res, denial);

    const rows = await pool.query(
      `${SELECT_REQUEST}
        WHERE r.requested_by = $1 AND r.organization_id = $2
        ORDER BY r.created_at DESC
        LIMIT 50`,
      [actor.userId, actor.organizationId],
    );

    return res.json({ requests: rows.rows.map((r) => mapRow(r as AccessRequestRow)) });
  } catch (err) {
    logger.error('own access requests read failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Could not load your requests.' });
  }
});

// ─── The queue read — one implementation, two mounts ────────────────────────
//
// `organization` is the org administrator's own workspace and is mounted here.
// `all` is the platform owner's cross-workspace view and is mounted ONLY by
// ./admin/master-access-requests, under the system scope — the one scope in
// which RLS lets a read see more than the caller's own workspace. The scope is
// fixed by the MOUNT, never by the query string, so no request can ask a
// per-user connection for a read it cannot perform.
//
// `denyQueueRead(actor, 'all')` still requires the owner grant on that mount:
// the Master Administration guard also admits platform staff (support,
// platform_admin), and a staff role is not a licence to read every
// workspace's asks.
export function readAccessRequestQueue(scope: AccessRequestQueueScope) {
  return async (req: Request, res: Response) => {
    try {
      const actor = await resolveActor(req);
      const denial = denyQueueRead(actor, scope);
      if (denial) return refuse(res, denial);

      const statusFilter =
        req.query.status === 'all' ? null : toStatus(req.query.status ?? 'open');
      // A master admin reading the organization scope still reads THEIR
      // organization; only the `all` mount lifts the predicate.
      const orgFilter = scope === 'all' ? null : actor.organizationId;

      const rows = await pool.query(
        `${SELECT_REQUEST}
          WHERE ($1::int IS NULL OR r.organization_id = $1)
            AND ($2::text IS NULL OR r.status = $2)
          ORDER BY (r.status = 'open') DESC, r.created_at DESC
          LIMIT ${QUEUE_LIMIT}`,
        [orgFilter, statusFilter],
      );

      const requests = rows.rows.map((r) => mapRow(r as AccessRequestRow));
      return res.json({
        scope,
        requests,
        openCount: requests.filter((r) => r.status === 'open').length,
        /** True when the list was cut short, so the surface can say so rather
         *  than presenting a truncated queue as the whole queue. */
        truncated: rows.rows.length >= QUEUE_LIMIT,
      });
    } catch (err) {
      logger.error('access request queue read failed', err as Record<string, unknown>);
      return res.status(500).json({ error: 'Could not load access requests.' });
    }
  };
}

// ─── GET / — the org administrator's queue ───────────────────────────────────
//
// `scope=all` is REFUSED here, for everybody, rather than narrowed. Under this
// mount's per-user scope it could only ever return the caller's own workspace
// while its payload said every workspace — the exact lie the refusal in
// `denyQueueRead` exists to prevent. The owner's view lives on its own mount.
router.get(
  '/',
  (req: Request, res: Response, next) => {
    const asked = req.query.scope;
    if (asked === undefined || asked === 'organization') return next();
    return res.status(400).json({
      error:
        'This queue shows one workspace. Requests from every workspace are answered in the platform console.',
    });
  },
  readAccessRequestQueue('organization'),
);

// ─── POST /:id/decision — approve or decline ─────────────────────────────────
//
// One handler for both answers because they are one governed act with two
// outcomes: same authority, same reason floor, same audit record. Two handlers
// would be two places for the authorization to drift apart.
//
// Mounted twice, and only twice: here, where the caller's own scope means RLS
// shows it only its own workspace's requests (another workspace's id reads as
// not found), and by ./admin/master-access-requests under the system scope,
// where the owner grant in `denyDecision` is what lets it cross a workspace.
export async function decideAccessRequest(req: Request, res: Response) {
  try {
    const actor = await resolveActor(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(404).json({ error: 'Not found.' });

    const body = (req.body ?? {}) as { decision?: unknown; reason?: unknown };
    if (!isDecision(body.decision)) {
      return res.status(400).json({ error: 'Choose whether to approve or decline.' });
    }
    const reason = normalizeReason(body.reason);
    if (!reason) {
      return res.status(400).json({ error: 'A reason (min 3 chars) is required for this action.' });
    }

    let row: { organization_id: unknown; module_id: unknown; requested_by: unknown; status: unknown };
    let organizationId: number;

    // ONE TRANSACTION HOLDS THE REQUEST'S ROW LOCK from the status check to the
    // decision write (2026-09-22). Without it the check and the write were two
    // pooled statements with the grant between them, so two administrators
    // answering at once both read `open`: the approver wrote the grant, lost the
    // UPDATE and was told 409, and the request read DECLINED with the module
    // switched on and no approval anywhere in the audit trail. Reproduced on
    // real PostgreSQL by tests/db/module-access-requests.dbtest.ts ("a decline
    // that wins a race against an approval leaves no grant behind"). Under the
    // lock the second answer waits, then reads the first one's outcome and is
    // refused before it can write anything.
    //
    // The lock is taken on the caller's own connection and scope, so RLS still
    // decides what can be locked: on the per-user mount another workspace's id
    // reads as not found, exactly as before.
    const client = await pool.connect();
    let open = false;
    try {
      await client.query('BEGIN');
      open = true;
      const existing = await client.query(
        `SELECT id, organization_id, module_id, requested_by, status
           FROM module_access_requests WHERE id = $1
            FOR UPDATE`,
        [id],
      );
      if (!existing.rows.length) return res.status(404).json({ error: 'Not found.' });
      row = existing.rows[0];
      organizationId = Number(row.organization_id);

      const denial = denyDecision(actor, {
        organizationId,
        status: toStatus(row.status),
      });
      if (denial) return refuse(res, denial);

      // Order matters. The grant is written FIRST, so the only failure this
      // endpoint can produce is a request that still reads open with the
      // capability already granted — which a repeated approval completes, since
      // the grant is an idempotent upsert. Marking it approved first and then
      // failing to grant would leave a queue that says done and a workspace that
      // is still locked — the same dead end, now with a receipt. The grant runs
      // through the canonical writer on its own connection and commits before
      // the decision does; the row lock above is what stops a concurrent answer
      // from reaching this line at all.
      if (body.decision === 'approved') {
        await writeModuleGrant({
          organizationId,
          moduleId: String(row.module_id),
          enabled: true,
          actorEmail: actorEmail(req),
          /* Stated, never defaulted. An organization whose trial of this module
             lapsed still holds a row carrying a past date; re-enabling without
             clearing it writes an already-expired grant, so the queue would say
             approved and the rail would still say locked. An approval is an
             unbounded grant. A time-limited one is a different, deliberate act. */
          expiresAt: null,
        });
      }

      // `AND status = 'open'` is kept as the statement's own guard: under the
      // row lock it cannot lose, and if the lock above is ever removed it is
      // still the difference between one recorded answer and two.
      const updated = await client.query(
        `UPDATE module_access_requests
            SET status = $2,
                decided_by = $3,
                decided_by_email = $4,
                decided_at = now(),
                decision_reason = $5,
                updated_at = now()
          WHERE id = $1 AND status = 'open'
          RETURNING id`,
        [id, body.decision, actor.userId, actorEmail(req), reason],
      );
      if (!updated.rows.length) {
        return res.status(409).json({ error: 'This request has already been answered.' });
      }
      await client.query('COMMIT');
      open = false;
    } finally {
      if (open) await client.query('ROLLBACK').catch(() => {});
      client.release();
    }

    // WO-16C: an answer can change what a workspace is entitled to; whether its
    // §11.10(e) row was written is carried in `auditTrail`, not discarded.
    const auditTrail = await recordAuditRow({
      tenantId: organizationId,
      userId: actor.userId ?? undefined,
      action: 'data_modify',
      resourceType: 'module_access_request',
      resourceId: String(id),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      details: {
        accessRequestAction:
          body.decision === 'approved' ? 'request.approved' : 'request.declined',
        moduleId: String(row.module_id),
        organizationId,
        requestedBy: Number(row.requested_by),
        /** True when this answer also wrote the grant. */
        granted: body.decision === 'approved',
        decidedByMasterAdmin: actor.isMasterAdmin && actor.organizationId !== organizationId,
        reason,
      },
    });

    const full = await pool.query(`${SELECT_REQUEST} WHERE r.id = $1`, [id]);
    return res.json({
      request: mapRow(full.rows[0] as AccessRequestRow),
      /** An approval writes an unbounded grant. Said in the response so no
       *  caller has to assume how long it lasts. */
      granted: body.decision === 'approved',
      auditTrail,
    });
  } catch (err) {
    logger.error('access request decision failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'The decision was not recorded. Please try again.' });
  }
}

router.post('/:id/decision', decideAccessRequest);

export default router;
