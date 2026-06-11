/**
 * Admin API for the SCIM IP allowlist — /api/admin/scim-ip-allowlist
 *
 * Super-admin management of per-org source-IP rules enforced on /scim/v2
 * (server/routes/scim.ts). A rule is a CIDR (or bare IP) that an org's SCIM
 * traffic must originate from. Opt-in: with no enabled rows an org is
 * unrestricted; once any row is enabled, SCIM requests from outside the listed
 * ranges are denied even with a valid token (21 CFR Part 11 §11.10(d) —
 * limiting system access to authorized systems).
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../auth';
import { requireRole } from '../../middleware/auth';
import { query } from '../../db';
import { isValidCidr } from '../../utils/cidr';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('admin-scim-ip-allowlist');
const router = Router();

router.use(authMiddleware);
const requireAdmin = requireRole('super_admin', 'platform_admin');

interface AllowlistRow {
  id: number;
  organization_id: number;
  cidr: string;
  label: string | null;
  enabled: boolean;
  created_at?: Date | string;
  updated_at?: Date | string;
}

function toRule(row: AllowlistRow): Record<string, unknown> {
  return {
    id: row.id,
    organizationId: row.organization_id,
    cidr: row.cidr,
    label: row.label,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Create ──────────────────────────────────────────────────────────────────

router.post('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const organizationId = Number((req.body as { organizationId?: unknown })?.organizationId);
    const cidrRaw = (req.body as { cidr?: unknown })?.cidr;
    const labelRaw = (req.body as { label?: unknown })?.label;
    const label = typeof labelRaw === 'string' && labelRaw.length > 0 ? labelRaw.slice(0, 200) : null;

    if (!Number.isFinite(organizationId)) {
      return res.status(400).json({ error: 'organizationId (integer) is required.' });
    }
    if (typeof cidrRaw !== 'string' || !isValidCidr(cidrRaw)) {
      return res.status(400).json({ error: 'cidr must be a valid IPv4/IPv6 CIDR or address.' });
    }

    const result = await query(
      `INSERT INTO scim_ip_allowlist (organization_id, cidr, label)
       VALUES ($1, $2, $3)
       RETURNING id, organization_id, cidr, label, enabled, created_at, updated_at`,
      [organizationId, cidrRaw, label]
    );
    return res.status(201).json(toRule(result.rows[0] as AllowlistRow));
  } catch (err) {
    logger.error('Create SCIM IP rule failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to create SCIM IP rule.' });
  }
});

// ─── List ────────────────────────────────────────────────────────────────────

router.get('/', requireAdmin, async (_req: Request, res: Response) => {
  try {
    // Super-admin view across orgs; we deliberately do NOT take an org filter
    // from req.query (tenant ids from request input are banned). Filter client-side.
    const result = await query(
      `SELECT id, organization_id, cidr, label, enabled, created_at, updated_at
         FROM scim_ip_allowlist ORDER BY id DESC`
    );
    return res.json({ rules: (result.rows as AllowlistRow[]).map(toRule) });
  } catch (err) {
    logger.error('List SCIM IP rules failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to list SCIM IP rules.' });
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
      `UPDATE scim_ip_allowlist SET enabled = $1, updated_at = now() WHERE id = $2
       RETURNING id, organization_id, cidr, label, enabled, created_at, updated_at`,
      [enabledRaw, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found.' });
    return res.json(toRule(result.rows[0] as AllowlistRow));
  } catch (err) {
    logger.error('Update SCIM IP rule failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to update SCIM IP rule.' });
  }
});

// ─── Delete ──────────────────────────────────────────────────────────────────

router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(404).json({ error: 'Not found.' });
    const result = await query('DELETE FROM scim_ip_allowlist WHERE id = $1 RETURNING id', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found.' });
    return res.status(204).send();
  } catch (err) {
    logger.error('Delete SCIM IP rule failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to delete SCIM IP rule.' });
  }
});

export default router;
