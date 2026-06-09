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
import * as crypto from 'crypto';
import { authMiddleware } from '../../auth';
import { requireRole } from '../../middleware/auth';
import { query } from '../../db';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('admin-scim-tenants');
const router = Router();

router.use(authMiddleware);
const requireAdmin = requireRole('super_admin', 'platform_admin');

function newToken(): { token: string; tokenHash: string } {
  // URL-safe, high-entropy bearer token. Only the hash is stored.
  const token = `scim_${crypto.randomBytes(32).toString('base64url')}`;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

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

// ─── Create (token returned ONCE) ────────────────────────────────────────────

router.post('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const organizationId = Number((req.body as { organizationId?: unknown })?.organizationId);
    const labelRaw = (req.body as { label?: unknown })?.label;
    const label = typeof labelRaw === 'string' && labelRaw.length > 0 ? labelRaw.slice(0, 200) : null;
    if (!Number.isFinite(organizationId)) {
      return res.status(400).json({ error: 'organizationId (integer) is required.' });
    }

    const { token, tokenHash } = newToken();
    const result = await query(
      `INSERT INTO scim_tenants (organization_id, token_hash, label)
       VALUES ($1, $2, $3)
       RETURNING id, organization_id, label, enabled, created_at, updated_at`,
      [organizationId, tokenHash, label]
    );
    // The plaintext token is shown ONCE — the admin configures the IdP with it now.
    return res.status(201).json({ ...toTenant(result.rows[0] as TenantRow), token });
  } catch (err) {
    logger.error('Create SCIM tenant failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to create SCIM tenant.' });
  }
});

// ─── List (never returns the hash) ───────────────────────────────────────────

router.get('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const organizationId = Number(req.query.organizationId);
    const params: unknown[] = [];
    let where = '';
    if (Number.isFinite(organizationId)) {
      params.push(organizationId);
      where = 'WHERE organization_id = $1';
    }
    const result = await query(
      `SELECT id, organization_id, label, enabled, created_at, updated_at
         FROM scim_tenants ${where} ORDER BY id DESC`,
      params
    );
    return res.json({ tenants: (result.rows as TenantRow[]).map(toTenant) });
  } catch (err) {
    logger.error('List SCIM tenants failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to list SCIM tenants.' });
  }
});

// ─── Rotate (new token returned ONCE) ────────────────────────────────────────

router.post('/:id/rotate', requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(404).json({ error: 'Not found.' });
    const { token, tokenHash } = newToken();
    const result = await query(
      `UPDATE scim_tenants SET token_hash = $1, updated_at = now() WHERE id = $2
       RETURNING id, organization_id, label, enabled, created_at, updated_at`,
      [tokenHash, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found.' });
    return res.json({ ...toTenant(result.rows[0] as TenantRow), token });
  } catch (err) {
    logger.error('Rotate SCIM tenant failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to rotate SCIM tenant.' });
  }
});

// ─── Enable / disable ────────────────────────────────────────────────────────

router.patch('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(404).json({ error: 'Not found.' });
    const enabledRaw = (req.body as { enabled?: unknown })?.enabled;
    if (typeof enabledRaw !== 'boolean') {
      return res.status(400).json({ error: 'enabled (boolean) is required.' });
    }
    const result = await query(
      `UPDATE scim_tenants SET enabled = $1, updated_at = now() WHERE id = $2
       RETURNING id, organization_id, label, enabled, created_at, updated_at`,
      [enabledRaw, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found.' });
    return res.json(toTenant(result.rows[0] as TenantRow));
  } catch (err) {
    logger.error('Update SCIM tenant failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to update SCIM tenant.' });
  }
});

// ─── Delete (revoke) ─────────────────────────────────────────────────────────

router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(404).json({ error: 'Not found.' });
    const result = await query('DELETE FROM scim_tenants WHERE id = $1 RETURNING id', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found.' });
    return res.status(204).send();
  } catch (err) {
    logger.error('Delete SCIM tenant failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to delete SCIM tenant.' });
  }
});

export default router;
