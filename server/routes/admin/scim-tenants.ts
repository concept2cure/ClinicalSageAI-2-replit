/**
 * Admin API for SCIM tenant tokens — /api/admin/scim-tenants
 *
 * Super-admin-only management of the DB-backed SCIM bearer tokens
 * (server/routes/scim.ts resolves provisioning requests against them). Tokens
 * are generated server-side, returned to the admin ONCE on create/rotate, and
 * only ever stored as a SHA-256 hash (21 CFR Part 11 §11.10(d) — controlled
 * system access). The plaintext is never persisted or readable afterwards.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../auth';
import { requirePlatformAdmin } from '../../middleware/requirePlatformAdmin';
import { query } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import { writeScimToken, ScimTokenPolicyError, type ScimTokenChange } from '../../services/scim-token-policy';

const logger = createScopedLogger('admin-scim-tenants');
const router = Router();

router.use(authMiddleware);
// DB-authoritative platform gate (PLATFORM_ADMIN_EMAILS on the owner's own
// sign-in, or an active platform_role_grants row, fail-closed; never the
// request role, which is the tenant membership role, D6 2026-10-05) — the
// same gate as /api/admin/master.
// requireRole was unusable here: its legacy org-'admin' bypass let every
// customer org admin reach this cross-tenant router.
const requireAdmin = requirePlatformAdmin;

interface TenantRow {
  id: number;
  organization_id: number;
  label: string | null;
  enabled: boolean;
  created_at?: Date | string;
  updated_at?: Date | string;
}

function toTenant(row: TenantRow): Record<string, unknown> {
  return {
    id: row.id,
    organizationId: row.organization_id,
    label: row.label,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const reason = z.string().trim().min(3).max(500);
const reasonBody = z.object({ reason }).strict();
const createBody = z.object({ reason, organizationId: z.number().int().positive().safe(), label: z.string().trim().max(200).optional() }).strict();
const updateBody = z.object({ reason, enabled: z.boolean() }).strict();

type Kind = ScimTokenChange['kind'];
function changeFrom(req: Request, kind: Kind): ScimTokenChange {
  if (kind === 'create') {
    const body = createBody.parse(req.body);
    return { kind, ...body, label: body.label || null };
  }
  const id = Number(req.params.id);
  if (kind === 'update') return { kind, id, ...updateBody.parse(req.body) };
  return { kind, id, ...reasonBody.parse(req.body) };
}

async function mutate(req: Request, res: Response, kind: Kind) {
  const id = Number(req.params.id);
  if (kind !== 'create' && (!Number.isSafeInteger(id) || id < 1)) return res.status(404).json({ error: 'Not found.' });
  try {
    const result = await writeScimToken(req, changeFrom(req, kind));
    if (!result) return res.status(404).json({ error: 'Organization or token not found. Nothing was changed.' });
    if (kind === 'delete') {
      res.setHeader('X-Audit-Row-Persisted', 'true');
      res.setHeader('X-Audit-Row-Chained', 'true');
      return res.status(204).send();
    }
    return res.status(kind === 'create' ? 201 : 200).json({
      ...toTenant(result.row), ...(result.token ? { token: result.token } : {}),
      auditTrail: { persisted: true, chained: true },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Provide valid permitted fields and a reason for change of 3–500 characters. Nothing was changed.' });
    if (err instanceof ScimTokenPolicyError) return res.status(err.status).json({ error: err.message, code: err.code, recoveryUrl: err.recoveryUrl });
    logger.error('SCIM token change failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'The SCIM token change could not be recorded.' });
  }
}

// One-time credentials must never be cached by a browser or intermediary.
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
router.post('/', requireAdmin, (req, res) => mutate(req, res, 'create'));

// ─── List (never returns the hash) ───────────────────────────────────────────

router.get('/', requireAdmin, async (_req: Request, res: Response) => {
  try {
    // Super-admin view: list every SCIM tenant (across orgs). We deliberately do
    // NOT take an org filter from req.query — tenant ids from request input are
    // banned (tenant-trust-query); callers filter client-side.
    const result = await query(
      `SELECT id, organization_id, label, enabled, created_at, updated_at
         FROM scim_tenants ORDER BY id DESC`
    );
    return res.json({ tenants: (result.rows as TenantRow[]).map(toTenant) });
  } catch (err) {
    logger.error('List SCIM tenants failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to list SCIM tenants.' });
  }
});

router.post('/:id/rotate', requireAdmin, (req, res) => mutate(req, res, 'rotate'));
router.patch('/:id', requireAdmin, (req, res) => mutate(req, res, 'update'));
router.delete('/:id', requireAdmin, (req, res) => mutate(req, res, 'delete'));

export default router;
