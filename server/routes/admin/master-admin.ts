/**
 * Master Administration API — /api/admin/master
 *
 * Non-client-facing, platform-owner + support tooling for product-level
 * support and client monitoring. Every endpoint sees ACROSS tenants, so the
 * whole router is gated by `requirePlatformAdmin` (strict platform-role check,
 * no org-admin bypass — see ../../middleware/requirePlatformAdmin).
 *
 * Surfaces:
 *   GET   /overview              Platform KPIs + health snapshot
 *   GET   /tenants              All organizations (search / status filter)
 *   GET   /tenants/:id          One organization — members, modules, usage, audit
 *   PATCH /tenants/:id/status   Suspend / reactivate an organization (governed)
 *   GET   /users               All platform users (search) with memberships
 *   PATCH /users/:id/status    Suspend / reactivate a user (governed)
 *   GET   /entitlements        Module catalog + per-module enablement counts
 *   GET   /system-health       Process / DB pool / uptime snapshot
 *   GET   /audit               Platform-wide audit-log explorer (paginated)
 *
 * Licensing control lives in ./master-licensing and mounts on this router
 * (inside the same guard):
 *   GET   /licensing                    Modules x tiers, plus every tenant
 *   GET   /licensing/tenants/:id        One tenant's effective verdict per module
 *   PATCH /licensing/modules/:moduleId  Move a module between tiers
 *   PATCH /licensing/tenants/:id/tier   Change one tenant's plan
 *   POST  /licensing/tenants/:id/provision  Apply that plan to the tenant
 *
 * Reads use the raw `query()` helper (same precedent as routes/admin/scim-*).
 * The two mutations are written through `auditService` so the 21 CFR Part 11
 * tamper-evident chain records every governed support action.
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../auth';
import { requirePlatformAdmin } from '../../middleware/requirePlatformAdmin';
import { query, getPool } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import auditService from '../../services/auditService';
import masterLicensingRoutes from './master-licensing';

const logger = createScopedLogger('admin-master');
const router = Router();

// Auth first, then the strict platform-admin gate, for every route below.
router.use(authMiddleware);
router.use(requirePlatformAdmin);

// Licensing control (./master-licensing) mounts INSIDE that gate rather than
// beside it, so its endpoints inherit exactly this authorization and cannot
// drift from it. Editing the commercial model is at least as sensitive as
// anything else on this router.
router.use(masterLicensingRoutes);

// ─── helpers ─────────────────────────────────────────────────────────────────

const ORG_STATUSES = ['active', 'suspended', 'inactive'] as const;
const USER_STATUSES = ['active', 'suspended', 'inactive'] as const;

function clampLimit(raw: unknown, fallback = 50, max = 200): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.trunc(n), max);
}

function clampOffset(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.trunc(n);
}

/** Build a case-insensitive LIKE term, or null when the input is empty. */
function likeTerm(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return `%${trimmed.replace(/[%_]/g, m => `\\${m}`)}%`;
}

// ─── Overview — platform KPIs + health snapshot ──────────────────────────────

router.get('/overview', async (_req: Request, res: Response) => {
  try {
    const [orgs, usersRow, usage, modules, auditRow] = await Promise.all([
      query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'active')::int AS active,
           COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended,
           COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS new_30d
         FROM organizations`
      ),
      query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'active')::int AS active,
           COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended,
           COUNT(*) FILTER (WHERE last_login > now() - interval '30 days')::int AS active_30d,
           COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS new_30d
         FROM users`
      ),
      query(
        `SELECT COALESCE(SUM(credits_used), 0)::int AS credits_30d,
                COUNT(*)::int AS events_30d
           FROM usage_records
          WHERE created_at > now() - interval '30 days'`
      ),
      query(
        `SELECT COUNT(*) FILTER (WHERE enabled)::int AS enabled
           FROM module_subscriptions`
      ),
      query(
        `SELECT
           COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS last_24h,
           COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS last_7d
         FROM audit_logs`
      ),
    ]);

    const tierBreakdown = await query(
      `SELECT tier, COUNT(*)::int AS count
         FROM organizations
        GROUP BY tier
        ORDER BY count DESC`
    );

    return res.json({
      tenants: orgs.rows[0],
      users: usersRow.rows[0],
      usage: usage.rows[0],
      modules: modules.rows[0],
      audit: auditRow.rows[0],
      tiers: tierBreakdown.rows,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Overview query failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to load platform overview.' });
  }
});

// ─── Tenants — list all organizations ────────────────────────────────────────

router.get('/tenants', async (req: Request, res: Response) => {
  try {
    const search = likeTerm(req.query.q);
    const statusRaw = typeof req.query.status === 'string' ? req.query.status : null;
    const status = statusRaw && ORG_STATUSES.includes(statusRaw as never) ? statusRaw : null;

    const result = await query(
      `SELECT
         o.id, o.name, o.slug, o.tier, o.status, o.client_type,
         o.seats_purchased, o.max_users, o.payment_status, o.created_at,
         COUNT(DISTINCT ou.user_id)::int AS member_count,
         MAX(u.last_login) AS last_active,
         COALESCE(ms.enabled_modules, 0)::int AS enabled_modules,
         COALESCE(us.credits_30d, 0)::int AS credits_30d
       FROM organizations o
       LEFT JOIN organization_users ou ON ou.organization_id = o.id
       LEFT JOIN users u ON u.id = ou.user_id
       LEFT JOIN (
         SELECT organization_id, COUNT(*) AS enabled_modules
           FROM module_subscriptions WHERE enabled = true
          GROUP BY organization_id
       ) ms ON ms.organization_id = o.id
       LEFT JOIN (
         SELECT organization_id, SUM(credits_used) AS credits_30d
           FROM usage_records WHERE created_at > now() - interval '30 days'
          GROUP BY organization_id
       ) us ON us.organization_id = o.id
       WHERE ($1::text IS NULL OR o.name ILIKE $1 OR o.slug ILIKE $1)
         AND ($2::text IS NULL OR o.status = $2)
       GROUP BY o.id, ms.enabled_modules, us.credits_30d
       ORDER BY o.created_at DESC
       LIMIT 500`,
      [search, status]
    );

    return res.json({ tenants: result.rows });
  } catch (err) {
    logger.error('Tenant list query failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to list tenants.' });
  }
});

// ─── Tenant detail ───────────────────────────────────────────────────────────

router.get('/tenants/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(404).json({ error: 'Not found.' });

    const orgResult = await query(
      `SELECT id, name, slug, domain, tier, status, client_type, billing_cycle,
              payment_status, seats_purchased, max_users, max_projects, max_storage,
              trial_ends_at, next_billing_date, created_at, updated_at
         FROM organizations WHERE id = $1`,
      [id]
    );
    if (!orgResult.rows.length) return res.status(404).json({ error: 'Not found.' });

    const [members, modules, usage, audit] = await Promise.all([
      query(
        `SELECT u.id, u.name, u.email, u.title, u.status, u.last_login, u.mfa_enabled,
                ou.role
           FROM organization_users ou
           JOIN users u ON u.id = ou.user_id
          WHERE ou.organization_id = $1
          ORDER BY ou.role, u.name`,
        [id]
      ),
      query(
        `SELECT ms.module_id, am.name, am.category, ms.enabled, ms.enabled_at, ms.updated_at
           FROM module_subscriptions ms
           LEFT JOIN available_modules am ON am.module_id = ms.module_id
          WHERE ms.organization_id = $1
          ORDER BY am.category, am.name`,
        [id]
      ),
      query(
        `SELECT feature_id, SUM(credits_used)::int AS credits, COUNT(*)::int AS events
           FROM usage_records
          WHERE organization_id = $1 AND created_at > now() - interval '30 days'
          GROUP BY feature_id
          ORDER BY credits DESC`,
        [id]
      ),
      query(
        `SELECT id, user_id, action, table_name, record_id, ip_address, created_at
           FROM audit_logs
          WHERE tenant_id = $1
          ORDER BY created_at DESC
          LIMIT 25`,
        [id]
      ),
    ]);

    return res.json({
      tenant: orgResult.rows[0],
      members: members.rows,
      modules: modules.rows,
      usage: usage.rows,
      recentAudit: audit.rows,
    });
  } catch (err) {
    logger.error('Tenant detail query failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to load tenant.' });
  }
});

// ─── Tenant status — suspend / reactivate (governed) ─────────────────────────

router.patch('/tenants/:id/status', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(404).json({ error: 'Not found.' });

    const status = (req.body as { status?: unknown })?.status;
    const reason = (req.body as { reason?: unknown })?.reason;
    if (typeof status !== 'string' || !ORG_STATUSES.includes(status as never)) {
      return res.status(400).json({ error: `status must be one of: ${ORG_STATUSES.join(', ')}` });
    }
    if (typeof reason !== 'string' || reason.trim().length < 3) {
      return res.status(400).json({ error: 'A reason (min 3 chars) is required for this action.' });
    }

    const before = await query('SELECT status FROM organizations WHERE id = $1', [id]);
    if (!before.rows.length) return res.status(404).json({ error: 'Not found.' });

    const result = await query(
      `UPDATE organizations SET status = $1, updated_at = now() WHERE id = $2
       RETURNING id, name, slug, status, updated_at`,
      [status, id]
    );

    await auditService.logAction({
      tenantId: id,
      userId: req.userId,
      action: 'data_modify',
      resourceType: 'organization',
      resourceId: id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      details: {
        masterAdminAction: 'tenant.status_change',
        from: before.rows[0].status,
        to: status,
        reason: reason.trim(),
      },
    });

    return res.json(result.rows[0]);
  } catch (err) {
    logger.error('Tenant status update failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to update tenant status.' });
  }
});

// ─── Users — list all platform users ─────────────────────────────────────────

router.get('/users', async (req: Request, res: Response) => {
  try {
    const search = likeTerm(req.query.q);
    const statusRaw = typeof req.query.status === 'string' ? req.query.status : null;
    const status = statusRaw && USER_STATUSES.includes(statusRaw as never) ? statusRaw : null;
    const limit = clampLimit(req.query.limit, 100, 500);

    const result = await query(
      `SELECT
         u.id, u.email, u.name, u.title, u.status, u.last_login,
         u.mfa_enabled, u.created_at,
         COALESCE(
           json_agg(
             json_build_object('orgId', o.id, 'orgName', o.name, 'role', ou.role)
           ) FILTER (WHERE o.id IS NOT NULL),
           '[]'
         ) AS memberships
       FROM users u
       LEFT JOIN organization_users ou ON ou.user_id = u.id
       LEFT JOIN organizations o ON o.id = ou.organization_id
       WHERE ($1::text IS NULL OR u.email ILIKE $1 OR u.name ILIKE $1)
         AND ($2::text IS NULL OR u.status = $2)
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT ${limit}`,
      [search, status]
    );

    return res.json({ users: result.rows });
  } catch (err) {
    logger.error('User list query failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to list users.' });
  }
});

// ─── User status — suspend / reactivate (governed) ───────────────────────────

router.patch('/users/:id/status', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(404).json({ error: 'Not found.' });

    const status = (req.body as { status?: unknown })?.status;
    const reason = (req.body as { reason?: unknown })?.reason;
    if (typeof status !== 'string' || !USER_STATUSES.includes(status as never)) {
      return res.status(400).json({ error: `status must be one of: ${USER_STATUSES.join(', ')}` });
    }
    if (typeof reason !== 'string' || reason.trim().length < 3) {
      return res.status(400).json({ error: 'A reason (min 3 chars) is required for this action.' });
    }

    const before = await query('SELECT status FROM users WHERE id = $1', [id]);
    if (!before.rows.length) return res.status(404).json({ error: 'Not found.' });

    const result = await query(
      `UPDATE users SET status = $1, updated_at = now() WHERE id = $2
       RETURNING id, name, email, status, updated_at`,
      [status, id]
    );

    await auditService.logAction({
      tenantId: 0, // platform-level action (not scoped to a single tenant)
      userId: req.userId,
      action: 'data_modify',
      resourceType: 'user',
      resourceId: id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      details: {
        masterAdminAction: 'user.status_change',
        from: before.rows[0].status,
        to: status,
        reason: reason.trim(),
      },
    });

    return res.json(result.rows[0]);
  } catch (err) {
    logger.error('User status update failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to update user status.' });
  }
});

// ─── Entitlements — module catalog + enablement counts ───────────────────────

router.get('/entitlements', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT
         am.module_id, am.name, am.category, am.description,
         COUNT(ms.id) FILTER (WHERE ms.enabled)::int AS enabled_orgs,
         COUNT(ms.id)::int AS total_subscriptions
       FROM available_modules am
       LEFT JOIN module_subscriptions ms ON ms.module_id = am.module_id
       GROUP BY am.id
       ORDER BY am.sort_order, am.name`
    );
    return res.json({ modules: result.rows });
  } catch (err) {
    logger.error('Entitlements query failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to load entitlements.' });
  }
});

// ─── System health — process / DB pool / uptime ──────────────────────────────

router.get('/system-health', async (_req: Request, res: Response) => {
  const mem = process.memoryUsage();
  let dbOk = false;
  let pool: { total?: number; idle?: number; waiting?: number } = {};
  try {
    await query('SELECT 1');
    dbOk = true;
    const p = getPool() as unknown as {
      totalCount?: number;
      idleCount?: number;
      waitingCount?: number;
    };
    pool = { total: p.totalCount, idle: p.idleCount, waiting: p.waitingCount };
  } catch (err) {
    logger.error('System health DB probe failed', err as Record<string, unknown>);
  }

  return res.json({
    status: dbOk ? 'healthy' : 'degraded',
    database: { ok: dbOk, pool },
    process: {
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      env: process.env.NODE_ENV || 'development',
      memory: {
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      },
    },
    generatedAt: new Date().toISOString(),
  });
});

// ─── Audit explorer — platform-wide, paginated ───────────────────────────────

router.get('/audit', async (req: Request, res: Response) => {
  try {
    // `client` is a platform-admin display filter (which tenant's events to
    // show), NOT the caller's own tenant — this route is platform-admin gated
    // and never uses it for authorization. Named `client` (not `tenantId`) to
    // make that explicit and avoid the tenant-trust-query foot-gun.
    const clientRaw = req.query.client;
    const tenantId =
      typeof clientRaw === 'string' && clientRaw.trim() !== '' && Number.isFinite(Number(clientRaw))
        ? Number(clientRaw)
        : null;
    const action = likeTerm(req.query.action);
    const limit = clampLimit(req.query.limit, 50, 200);
    const offset = clampOffset(req.query.offset);

    const [rows, count] = await Promise.all([
      query(
        `SELECT a.id, a.tenant_id, a.user_id, a.action, a.table_name, a.record_id,
                a.ip_address, a.created_at, u.email AS actor_email, o.name AS tenant_name
           FROM audit_logs a
           LEFT JOIN users u ON u.id = a.user_id
           LEFT JOIN organizations o ON o.id = a.tenant_id
          WHERE ($1::int IS NULL OR a.tenant_id = $1)
            AND ($2::text IS NULL OR a.action ILIKE $2)
          ORDER BY a.created_at DESC
          LIMIT ${limit} OFFSET ${offset}`,
        [tenantId, action]
      ),
      query(
        `SELECT COUNT(*)::int AS total
           FROM audit_logs a
          WHERE ($1::int IS NULL OR a.tenant_id = $1)
            AND ($2::text IS NULL OR a.action ILIKE $2)`,
        [tenantId, action]
      ),
    ]);

    return res.json({
      events: rows.rows,
      total: count.rows[0].total,
      limit,
      offset,
    });
  } catch (err) {
    logger.error('Audit explorer query failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to load audit log.' });
  }
});

// ─── Billing & subscription monitoring ───────────────────────────────────────

router.get('/billing', async (_req: Request, res: Response) => {
  try {
    const [byStatus, trials, pastDue, alerts] = await Promise.all([
      query(
        `SELECT COALESCE(payment_status, 'unknown') AS payment_status, COUNT(*)::int AS count
           FROM organizations
          GROUP BY payment_status
          ORDER BY count DESC`
      ),
      query(
        `SELECT id, name, slug, tier, trial_ends_at
           FROM organizations
          WHERE trial_ends_at IS NOT NULL
            AND trial_ends_at > now()
            AND trial_ends_at < now() + interval '14 days'
          ORDER BY trial_ends_at ASC
          LIMIT 50`
      ),
      query(
        `SELECT id, name, slug, tier, payment_status, next_billing_date
           FROM organizations
          WHERE payment_status IN ('past_due', 'incomplete')
          ORDER BY next_billing_date ASC NULLS LAST
          LIMIT 50`
      ),
      query(
        `SELECT a.id, a.organization_id, a.type, a.threshold, a.message, a.created_at,
                o.name AS organization_name
           FROM billing_alerts a
           LEFT JOIN organizations o ON o.id = a.organization_id
          WHERE a.acknowledged = false
          ORDER BY a.created_at DESC
          LIMIT 50`
      ),
    ]);
    return res.json({
      byPaymentStatus: byStatus.rows,
      trialsEndingSoon: trials.rows,
      pastDue: pastDue.rows,
      unacknowledgedAlerts: alerts.rows,
    });
  } catch (err) {
    logger.error('Billing query failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to load billing overview.' });
  }
});

// ─── Acknowledge a billing alert (governed) ──────────────────────────────────

router.patch('/billing/alerts/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(404).json({ error: 'Not found.' });

    const actorId = Number.isFinite(Number(req.userId)) ? Number(req.userId) : null;
    const result = await query(
      `UPDATE billing_alerts
          SET acknowledged = true, acknowledged_at = now(), acknowledged_by = $1
        WHERE id = $2 AND acknowledged = false
       RETURNING id, organization_id, type, acknowledged_at`,
      [actorId, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found or already acknowledged.' });

    await auditService.logAction({
      tenantId: result.rows[0].organization_id ?? 0,
      userId: req.userId,
      action: 'data_modify',
      resourceType: 'billing_alert',
      resourceId: id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      details: { masterAdminAction: 'billing_alert.acknowledge' },
    });
    return res.json(result.rows[0]);
  } catch (err) {
    logger.error('Billing alert acknowledge failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to acknowledge alert.' });
  }
});

// ─── Entitlements — toggle a module for one client (governed) ─────────────────

router.patch('/tenants/:id/modules', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(404).json({ error: 'Not found.' });

    const moduleId = (req.body as { moduleId?: unknown })?.moduleId;
    const enabled = (req.body as { enabled?: unknown })?.enabled;
    const reason = (req.body as { reason?: unknown })?.reason;
    if (typeof moduleId !== 'string' || !moduleId.trim()) {
      return res.status(400).json({ error: 'moduleId is required.' });
    }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled (boolean) is required.' });
    }
    if (typeof reason !== 'string' || reason.trim().length < 3) {
      return res.status(400).json({ error: 'A reason (min 3 chars) is required for this action.' });
    }

    const org = await query('SELECT id FROM organizations WHERE id = $1', [id]);
    if (!org.rows.length) return res.status(404).json({ error: 'Tenant not found.' });
    const mod = await query('SELECT module_id FROM available_modules WHERE module_id = $1', [moduleId]);
    if (!mod.rows.length) return res.status(404).json({ error: 'Unknown module.' });

    const actorEmail = req.userEmail ?? null;
    const result = await query(
      `INSERT INTO module_subscriptions
         (organization_id, module_id, enabled, enabled_at, disabled_at, enabled_by, disabled_by, updated_at)
       VALUES ($1, $2, $3, CASE WHEN $3 THEN now() END, CASE WHEN $3 THEN NULL ELSE now() END,
               CASE WHEN $3 THEN $4 END, CASE WHEN $3 THEN NULL ELSE $4 END, now())
       ON CONFLICT (organization_id, module_id) DO UPDATE
         SET enabled = EXCLUDED.enabled,
             enabled_at = CASE WHEN EXCLUDED.enabled THEN now() ELSE module_subscriptions.enabled_at END,
             disabled_at = CASE WHEN EXCLUDED.enabled THEN NULL ELSE now() END,
             enabled_by = CASE WHEN EXCLUDED.enabled THEN $4 ELSE module_subscriptions.enabled_by END,
             disabled_by = CASE WHEN EXCLUDED.enabled THEN NULL ELSE $4 END,
             updated_at = now()
       RETURNING organization_id, module_id, enabled, updated_at`,
      [id, moduleId, enabled, actorEmail]
    );

    await auditService.logAction({
      tenantId: id,
      userId: req.userId,
      action: 'data_modify',
      resourceType: 'module_subscription',
      resourceId: `${id}:${moduleId}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      details: { masterAdminAction: 'tenant.module_toggle', moduleId, enabled, reason: reason.trim() },
    });
    return res.json(result.rows[0]);
  } catch (err) {
    logger.error('Module toggle failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to update module entitlement.' });
  }
});

// ─── Feature flags ───────────────────────────────────────────────────────────

router.get('/feature-flags', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT id, feature_key, description, enabled,
              enabled_for_organization_ids, enabled_for_client_workspace_ids,
              updated_at
         FROM feature_toggles
        ORDER BY feature_key`
    );
    return res.json({ flags: result.rows });
  } catch (err) {
    logger.error('Feature flag list failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to load feature flags.' });
  }
});

router.patch('/feature-flags/:key', async (req: Request, res: Response) => {
  try {
    const key = String(req.params.key || '').trim();
    if (!key) return res.status(404).json({ error: 'Not found.' });
    const enabled = (req.body as { enabled?: unknown })?.enabled;
    const reason = (req.body as { reason?: unknown })?.reason;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled (boolean) is required.' });
    }
    if (typeof reason !== 'string' || reason.trim().length < 3) {
      return res.status(400).json({ error: 'A reason (min 3 chars) is required for this action.' });
    }

    const before = await query('SELECT enabled FROM feature_toggles WHERE feature_key = $1', [key]);
    if (!before.rows.length) return res.status(404).json({ error: 'Unknown feature flag.' });

    const result = await query(
      `UPDATE feature_toggles SET enabled = $1, updated_at = now() WHERE feature_key = $2
       RETURNING id, feature_key, enabled, updated_at`,
      [enabled, key]
    );

    await auditService.logAction({
      tenantId: 0,
      userId: req.userId,
      action: 'data_modify',
      resourceType: 'feature_toggle',
      resourceId: key,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      details: {
        masterAdminAction: 'feature_flag.toggle',
        from: before.rows[0].enabled,
        to: enabled,
        reason: reason.trim(),
      },
    });
    return res.json(result.rows[0]);
  } catch (err) {
    logger.error('Feature flag toggle failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to update feature flag.' });
  }
});

// ─── Integrations — connector health across clients ──────────────────────────
// NB: credentials column (AES-256-GCM ciphertext) is deliberately never selected.

router.get('/connectors', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT c.id, c.organization_id, c.connector_id, c.is_valid, c.last_validated_at, c.created_at,
              o.name AS organization_name
         FROM connector_credentials c
         LEFT JOIN organizations o ON o.id = c.organization_id
        ORDER BY c.is_valid ASC, c.last_validated_at ASC NULLS FIRST
        LIMIT 500`
    );
    return res.json({ connectors: result.rows });
  } catch (err) {
    logger.error('Connector health query failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to load connector health.' });
  }
});

// ─── Operations — recent deep-research jobs across clients ────────────────────

router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const statusRaw = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const status = statusRaw || null;
    const limit = clampLimit(req.query.limit, 50, 200);
    const [jobs, summary] = await Promise.all([
      query(
        `SELECT j.id, j.organization_id, j.status, j.progress, j.credits_used,
                j.created_at, j.completed_at, o.name AS organization_name
           FROM deep_research_jobs j
           LEFT JOIN organizations o ON o.id = j.organization_id
          WHERE ($1::text IS NULL OR j.status = $1)
          ORDER BY j.created_at DESC
          LIMIT ${limit}`,
        [status]
      ),
      query(
        `SELECT status, COUNT(*)::int AS count
           FROM deep_research_jobs
          WHERE created_at > now() - interval '7 days'
          GROUP BY status`
      ),
    ]);
    return res.json({ jobs: jobs.rows, summary7d: summary.rows });
  } catch (err) {
    logger.error('Jobs query failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to load jobs.' });
  }
});

export default router;
