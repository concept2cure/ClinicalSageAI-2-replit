/**
 * Access Management API — /api/admin/access (mounted by the app entrypoint).
 *
 * Lets the platform owner DESIGNATE PERSONNEL — grant/revoke platform-level
 * roles (super_admin / platform_admin / support / business_admin / owner) from
 * inside the app, with a full 21 CFR Part 11 audit trail — instead of editing
 * env allowlists or the DB by hand.
 *
 * Grants are written to platform_role_grants (a table SEPARATE from
 * organization_users.role, which carries only org-scoped roles). The platform
 * access guards honor active rows here as a DB-backed fallback, so a grant made
 * here immediately widens access to the Master Admin / Business Center consoles.
 *
 * Access model (defense in depth):
 *   - authMiddleware → requirePlatformAdmin gates the whole router (managing
 *     platform/support grants is a platform-admin operation).
 *   - Granting a BUSINESS-tier role (owner / business_admin / super_admin) is
 *     more sensitive (it confers finance access), so the grant handler ALSO
 *     requires the CALLER to be a business admin — support / platform_admin can
 *     manage support/platform_admin grants, but only owner/business-admin/
 *     super_admin may designate finance personnel.
 *
 * This router queries users / platform_role_grants WITHOUT an org scope (these
 * are platform-global, owner-managed records, not tenant data) → it must be on
 * the tenant-isolation allowlist.
 *
 * @compliance FDA 21 CFR Part 11 §11.10(d) — limiting system access to
 *             authorized individuals; every grant/revoke is governed
 *             (reason-for-change) and audited.
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../auth';
import { requirePlatformAdmin } from '../../middleware/requirePlatformAdmin';
import { isBusinessAdmin } from '../../middleware/requireBusinessAdmin';
import { query } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import auditService from '../../services/auditService';

const logger = createScopedLogger('admin-access-management');
const router = Router();

router.use(authMiddleware);
router.use(requirePlatformAdmin);

/** Platform roles that may be granted. NOT org-scoped roles. */
const GRANTABLE_ROLES = new Set([
  'super_admin',
  'platform_admin',
  'support',
  'business_admin',
  'owner',
]);

/** Roles whose grant confers finance access — only a business admin may grant. */
const BUSINESS_TIER_ROLES = new Set(['owner', 'business_admin', 'super_admin']);

// ─── List active grants ──────────────────────────────────────────────────────

router.get('/grants', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT g.id, g.user_id, u.email, u.name, g.role, g.granted_by, g.granted_at
         FROM platform_role_grants g
         JOIN users u ON u.id = g.user_id
        WHERE g.revoked_at IS NULL
        ORDER BY g.role, u.email`
    );
    return res.json({ grants: result.rows, generatedAt: new Date().toISOString() });
  } catch (err) {
    logger.error('Grant list query failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to load access grants.' });
  }
});

// ─── Grant (or re-activate) a platform role for a user ───────────────────────

router.post('/grants', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      email?: unknown;
      userId?: unknown;
      role?: unknown;
      reason?: unknown;
    };

    const role = String(body.role || '').trim().toLowerCase();
    if (!GRANTABLE_ROLES.has(role)) {
      return res.status(400).json({
        error: `role must be one of: ${[...GRANTABLE_ROLES].join(', ')}`,
      });
    }

    if (typeof body.reason !== 'string' || body.reason.trim().length < 3) {
      return res.status(400).json({ error: 'A reason (min 3 chars) is required for this action.' });
    }
    const reason = body.reason.trim();

    // Designating finance personnel is stricter: the CALLER must themselves be
    // a business admin to grant a business-tier role.
    if (BUSINESS_TIER_ROLES.has(role) && !isBusinessAdmin(req)) {
      return res.status(403).json({
        error: 'Granting a business-tier role (owner / business_admin / super_admin) requires the caller to be a business administrator.',
      });
    }

    // Resolve the target user — by numeric userId, or by email lookup.
    let userId: number | null = null;
    if (body.userId != null && body.userId !== '') {
      const n = Number(body.userId);
      if (!Number.isInteger(n) || n <= 0) {
        return res.status(400).json({ error: 'userId must be a positive integer.' });
      }
      userId = n;
    } else if (typeof body.email === 'string' && body.email.trim()) {
      const lookup = await query('SELECT id FROM users WHERE email = $1', [body.email.trim()]);
      if (lookup.rows.length === 0) {
        return res.status(404).json({ error: 'No user found with that email.' });
      }
      userId = Number(lookup.rows[0].id);
    } else {
      return res.status(400).json({ error: 'Provide either userId or email.' });
    }

    const actor = req.userEmail ?? null;

    const result = await query(
      `INSERT INTO platform_role_grants (user_id, role, granted_by, granted_at, reason, revoked_at, revoked_by)
       VALUES ($1, $2, $3, now(), $4, NULL, NULL)
       ON CONFLICT (user_id, role) DO UPDATE
         SET revoked_at = NULL,
             revoked_by = NULL,
             granted_by = EXCLUDED.granted_by,
             granted_at = now(),
             reason = EXCLUDED.reason
       RETURNING id, user_id, role, granted_by, granted_at, reason`,
      [userId, role, actor, reason]
    );

    await auditService.logAction({
      tenantId: 0,
      userId: req.userId,
      action: 'data_modify',
      resourceType: 'platform_role_grant',
      resourceId: `${userId}:${role}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      details: { accessAction: 'role.grant', role, reason },
    });

    return res.json(result.rows[0]);
  } catch (err) {
    logger.error('Grant create failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to grant role.' });
  }
});

// ─── Revoke an active grant ──────────────────────────────────────────────────

router.delete('/grants/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'A numeric grant id is required.' });
    }
    const body = req.body as { reason?: unknown };
    if (typeof body.reason !== 'string' || body.reason.trim().length < 3) {
      return res.status(400).json({ error: 'A reason (min 3 chars) is required for this action.' });
    }
    const reason = body.reason.trim();
    const actor = req.userEmail ?? null;

    const result = await query(
      `UPDATE platform_role_grants
          SET revoked_at = now(), revoked_by = $2, reason = $3
        WHERE id = $1 AND revoked_at IS NULL
        RETURNING id, user_id, role, revoked_at, revoked_by`,
      [id, actor, reason]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No active grant found with that id.' });
    }

    const revoked = result.rows[0];
    await auditService.logAction({
      tenantId: 0,
      userId: req.userId,
      action: 'data_modify',
      resourceType: 'platform_role_grant',
      resourceId: `${revoked.user_id}:${revoked.role}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      details: { accessAction: 'role.revoke', role: revoked.role, reason },
    });

    return res.json(revoked);
  } catch (err) {
    logger.error('Grant revoke failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to revoke grant.' });
  }
});

export default router;
