/**
 * External Client Portal — the read-only view a CRO's client sees.
 *
 *   GET /api/client-portal/overview[?clientWorkspaceId=]
 *
 * Backs the Claude Design ClientPortal surface. Returns ONLY what belongs to
 * one client workspace: its programs (projects), shared deliverables
 * (client-visible documents) and recent updates (activity) — never the CRO's
 * other clients.
 *
 * ── Access model (the "full external portal") ──────────────────────────────
 * Two legitimate callers, resolved server-side from the verified JWT:
 *   1. EXTERNAL CLIENT — a user with a `client_access` row is auto-scoped to
 *      that client_workspace_id. The ?clientWorkspaceId query param is IGNORED
 *      for them: a client can never pivot to another client's portal.
 *   2. PREVIEW — an org admin/owner (staff of the CRO that owns the workspace)
 *      may pass ?clientWorkspaceId to preview what a specific client sees, but
 *      only for a workspace their own organization owns.
 * Anyone else gets a non-leaky 403 (no data, no counts). This is the same
 * fail-closed, tenant-scoped posture as the rest of the platform.
 *
 * Every field maps to a real column; anything the data model can't supply
 * (e.g. a per-program "blocker") is a documented null, never fabricated.
 *
 * @module routes/client-portal
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../auth';
import { pool } from '../db';
import { createScopedLogger } from '../utils/logger';

const router = Router();
const log = createScopedLogger('client-portal');

// Rate limit ahead of auth. The global /api limiter (redisRateLimiter) already
// covers this route at runtime; this per-router limit is defence-in-depth and
// keeps the guarantee local to the endpoint (an authenticated handler must be
// rate-limited). Uses express-rate-limit to match the repo convention
// (server/middleware/enterprise-security.ts).
const portalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded for the client portal. Please wait.' },
});

router.use(portalRateLimiter);
router.use(authMiddleware);

const STAFF_ROLES = new Set(['admin', 'owner', 'super_admin', 'platform_admin', 'business_admin']);

/** Documents a client is allowed to see — shared/finished states only. */
const CLIENT_VISIBLE_DOC_STATUS = ['shared', 'approved', 'final', 'released', 'published', 'signed'];

function callerOrgId(req: Request): number | null {
  const raw =
    (req as any).user?.organizationId ??
    (req as any).tenantContext?.organizationId ??
    (req as any).organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}
function callerId(req: Request): number | null {
  const raw = (req as any).user?.id ?? (req as any).userId;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}
function callerRole(req: Request): string {
  return String((req as any).user?.role ?? (req as any).userRole ?? '').toLowerCase();
}
function callerName(req: Request): string {
  const u = (req as any).user ?? {};
  return u.name || u.displayName || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || 'You';
}

interface ResolvedScope {
  clientWorkspaceId: number;
  clientName: string;
  croName: string;
  mode: 'client' | 'preview';
}

/**
 * Resolve which single client workspace this caller may view, and how.
 * Returns null → the handler sends a non-leaky 403.
 */
async function resolveScope(req: Request): Promise<ResolvedScope | null> {
  const uid = callerId(req);
  if (!uid) return null;

  // 1. External client — self-scoped via client_access. A ?clientWorkspaceId=
  //    is honored ONLY when the caller has a matching client_access row: the
  //    requested workspace sorts first, but the WHERE still restricts to the
  //    caller's own grants, so a multi-workspace client can pick one and can
  //    NEVER pivot to a workspace they lack. No/invalid param, or a param they
  //    aren't granted, falls back to the lowest id — the stable single-
  //    workspace behavior — rather than a confusing denial.
  const reqWs = Number(req.query.clientWorkspaceId);
  const wantWs = Number.isFinite(reqWs) && reqWs > 0 ? reqWs : null;
  const access = await pool.query(
    `SELECT ca.client_workspace_id, cw.name AS client_name, o.name AS cro_name
       FROM client_access ca
       JOIN client_workspaces cw ON cw.id = ca.client_workspace_id
       LEFT JOIN organizations o ON o.id = cw.organization_id
      WHERE ca.user_id = $1
      ORDER BY (ca.client_workspace_id = $2::int) DESC NULLS LAST, ca.client_workspace_id
      LIMIT 1`,
    [uid, wantWs],
  );
  if (access.rows.length) {
    const r = access.rows[0];
    return {
      clientWorkspaceId: Number(r.client_workspace_id),
      clientName: r.client_name ?? 'Your workspace',
      croName: r.cro_name ?? '',
      mode: 'client',
    };
  }

  // 2. Preview — org staff viewing one of THEIR OWN org's client workspaces.
  const orgId = callerOrgId(req);
  const wsParam = Number(req.query.clientWorkspaceId);
  if (orgId && STAFF_ROLES.has(callerRole(req)) && Number.isFinite(wsParam) && wsParam > 0) {
    const owned = await pool.query(
      `SELECT cw.id, cw.name AS client_name, o.name AS cro_name
         FROM client_workspaces cw
         LEFT JOIN organizations o ON o.id = cw.organization_id
        WHERE cw.id = $1 AND cw.organization_id = $2
        LIMIT 1`,
      [wsParam, orgId],
    );
    if (owned.rows.length) {
      const r = owned.rows[0];
      return {
        clientWorkspaceId: Number(r.id),
        clientName: r.client_name ?? 'Client',
        croName: r.cro_name ?? '',
        mode: 'preview',
      };
    }
  }

  return null;
}

/** Fail-closed SELECT: empty on a missing table so one gap can't 500 the view. */
async function safeRows<T>(sql: string, params: unknown[]): Promise<T[]> {
  try {
    const { rows } = await pool.query(sql, params);
    return rows as T[];
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '42P01') return [];
    log.warn('client-portal facet failed', { err: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

/**
 * Humanise a target date into the surface's "next" vocabulary.
 *
 * `now` is a required parameter, not a `Date.now()` read, for the same reason
 * `deadlineUrgency`/`awardPeriodState`/`milestoneBucket` take one: a function
 * that reads the wall clock cannot be pinned. The fixture-and-regex version of
 * this test asserted /milestone/ against a hardcoded 2026-09-01 target, which
 * held only until 2026-09-01 actually arrived; on 2026-09-02 the same code
 * correctly returned 'Target passed 1d ago' and the suite went red on the
 * calendar rather than on a defect. Taking the clock as an argument is what
 * makes every branch below reachable from a test at any wall-clock time.
 */
export function nextFromProject(
  status: string | null,
  target: Date | string | null,
  now: number,
): string {
  if (status === 'completed') return 'Complete';
  if (!target) return status ? `In ${status}` : '';
  const d = new Date(target);
  if (Number.isNaN(d.getTime())) return '';
  const days = Math.round((d.getTime() - now) / 86_400_000);
  if (days < 0) return `Target passed ${-days}d ago`;
  if (days === 0) return 'Target today';
  return `Next milestone · ${days} days`;
}

router.get('/overview', async (req: Request, res: Response) => {
  try {
    const scope = await resolveScope(req);
    if (!scope) {
      // Non-leaky: reveal nothing about whether the workspace exists.
      return res.status(403).json({ error: 'This portal is limited to the client it belongs to.' });
    }
    const wsId = scope.clientWorkspaceId;
    // One clock read per request: every program in a response is measured
    // against the same instant, so two rows a millisecond apart can't land in
    // different day buckets.
    const now = Date.now();

    // Programs — the client's projects.
    const programs = (
      await safeRows<{
        id: number; name: string; code: string | null; type: string | null;
        status: string | null; progress: number | null; target_end_date: Date | string | null;
      }>(
        `SELECT id, name, code, type, status, progress, target_end_date
           FROM projects
          WHERE client_workspace_id = $1 AND COALESCE(status, '') <> 'archived'
          ORDER BY updated_at DESC NULLS LAST, id DESC
          LIMIT 50`,
        [wsId],
      )
    ).map((p) => ({
      id: p.code || `p-${p.id}`,
      title: p.name,
      pathway: p.type || '—',
      readiness: typeof p.progress === 'number' ? p.progress : 0,
      status: p.status || 'active',
      next: nextFromProject(p.status, p.target_end_date, now),
      blocker: null as string | null, // no per-program blocker column — honest null
    }));

    // Deliverables — client-visible documents in this workspace.
    const deliverables = (
      await safeRows<{
        title: string; project_name: string | null; status: string | null;
        updated_at: Date | string | null; validation_status: string | null;
      }>(
        `SELECT d.title, p.name AS project_name, d.status, d.updated_at, d.validation_status
           FROM documents d
           LEFT JOIN projects p ON p.id = d.project_id
          WHERE d.client_workspace_id = $1
            AND LOWER(COALESCE(d.status, '')) = ANY($2)
          ORDER BY d.updated_at DESC NULLS LAST
          LIMIT 40`,
        [wsId, CLIENT_VISIBLE_DOC_STATUS],
      )
    ).map((d) => ({
      name: d.title,
      prog: d.project_name || '',
      status: (d.status || 'shared').toLowerCase(),
      when: d.updated_at ? new Date(d.updated_at).toISOString() : '',
      sig: /valid|approv|sign/i.test(d.validation_status || ''),
    }));

    // Updates — recent activity on this client's projects.
    const projectIds = programs.map((p) => p.id); // display ids; join on real ids below
    const updates = (
      await safeRows<{ user_name: string | null; description: string | null; action: string | null; created_at: Date | string }>(
        `SELECT af.user_name, af.description, af.action, af.created_at
           FROM activity_feed af
          WHERE af.entity_type = 'project'
            AND af.entity_id IN (
              SELECT id::text FROM projects WHERE client_workspace_id = $1
            )
          ORDER BY af.created_at DESC
          LIMIT 12`,
        [wsId],
      )
    ).map((a) => ({
      who: a.user_name || scope.croName || 'Update',
      what: a.description || a.action || 'updated a program',
      when: new Date(a.created_at).toISOString(),
    }));

    return res.json({
      data: {
        mode: scope.mode,
        client: scope.clientName,
        cro: scope.croName,
        user: callerName(req),
        programs,
        deliverables,
        updates,
      },
      meta: { clientWorkspaceId: wsId, programCount: programs.length, deliverableCount: deliverables.length },
    });
  } catch (err) {
    log.error('client-portal overview failed', { err: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: 'Failed to load the client portal.' });
  }
});

export default router;
