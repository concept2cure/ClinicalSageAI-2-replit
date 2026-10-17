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
import { requirePlatformAdmin } from '../../middleware/requirePlatformAdmin';
import { query } from '../../db';
import { isValidCidr } from '../../utils/cidr';
import { createScopedLogger } from '../../utils/logger';
import { writeScimIpPolicy, ScimIpPolicyError, type ScimIpRuleRow } from '../../services/scim-ip-policy';

const logger = createScopedLogger('admin-scim-ip-allowlist');
const router = Router();

router.use(authMiddleware);
// DB-authoritative platform gate (PLATFORM_ADMIN_EMAILS on the owner's own
// sign-in, or an active platform_role_grants row, fail-closed; never the
// request role, which is the tenant membership role, D6 2026-10-05) — the
// same gate as /api/admin/master.
// requireRole was unusable here: its legacy org-'admin' bypass let every
// customer org admin reach this cross-tenant router.
const requireAdmin = requirePlatformAdmin;

type AllowlistRow = ScimIpRuleRow;

/** Every security-policy mutation names the reason recorded in its transaction. */
function reasonOf(body: { reason?: unknown }): string | undefined {
  if (typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.trim().length > 500) {
    throw new Error('SCIM_REASON_INVALID');
  }
  return body.reason.trim();
}
function governedReason(req: Request, res: Response): { reason?: string } | null {
  try { return { reason: reasonOf(req.body ?? {}) }; }
  catch { res.status(400).json({ error: 'A reason for change of 3–500 characters is required. Nothing was changed.' }); return null; }
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
    const governed = governedReason(req, res); if (!governed) return;
    const organizationId = Number((req.body as { organizationId?: unknown })?.organizationId);
    const cidrRaw = (req.body as { cidr?: unknown })?.cidr;
    const labelRaw = (req.body as { label?: unknown })?.label;
    const label = typeof labelRaw === 'string' && labelRaw.length > 0 ? labelRaw.slice(0, 200) : null;

    if (!Number.isInteger(organizationId) || organizationId <= 0) {
      return res.status(400).json({ error: 'organizationId (integer) is required.' });
    }
    if (typeof cidrRaw !== 'string' || !isValidCidr(cidrRaw)) {
      return res.status(400).json({ error: 'cidr must be a valid IPv4/IPv6 CIDR or address.' });
    }

    const created = await writeScimIpPolicy(req, { kind: 'create', organizationId, cidr: cidrRaw, label, ...governed });
    if (!created) return res.status(404).json({ error: 'Organization not found. Nothing was changed.' });
    return res.status(201).json({ ...toRule(created), auditTrail: { persisted: true, chained: true } });
  } catch (err) {
    if (err instanceof ScimIpPolicyError) return res.status(err.status).json({ error: err.message, code: err.code, ruleId: err.ruleId, recoveryUrl: err.recoveryUrl });
    logger.error('Create SCIM IP rule failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'The SCIM IP rule could not be created and recorded. Nothing was changed.' });
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
    if (err instanceof ScimIpPolicyError) return res.status(err.status).json({ error: err.message, code: err.code, ruleId: err.ruleId, recoveryUrl: err.recoveryUrl });
    logger.error('List SCIM IP rules failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to list SCIM IP rules.' });
  }
});

// ─── Enable / disable ────────────────────────────────────────────────────────

router.patch('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const governed = governedReason(req, res); if (!governed) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Not found.' });
    const enabledRaw = (req.body as { enabled?: unknown })?.enabled;
    if (typeof enabledRaw !== 'boolean') {
      return res.status(400).json({ error: 'enabled (boolean) is required.' });
    }
    const changed = await writeScimIpPolicy(req, { kind: 'update', id, enabled: enabledRaw, ...governed });
    if (!changed) return res.status(404).json({ error: 'Not found.' });
    return res.json({ ...toRule(changed), auditTrail: { persisted: true, chained: true } });
  } catch (err) {
    if (err instanceof ScimIpPolicyError) return res.status(err.status).json({ error: err.message, code: err.code, ruleId: err.ruleId, recoveryUrl: err.recoveryUrl });
    logger.error('Update SCIM IP rule failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'The SCIM IP rule could not be updated and recorded. Nothing was changed.' });
  }
});

// ─── Delete ──────────────────────────────────────────────────────────────────

router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const governed = governedReason(req, res); if (!governed) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Not found.' });
    const deleted = await writeScimIpPolicy(req, { kind: 'delete', id, ...governed });
    if (!deleted) return res.status(404).json({ error: 'Not found.' });
    res.setHeader('X-Audit-Row-Persisted', 'true');
    res.setHeader('X-Audit-Row-Chained', 'true');
    return res.status(204).send();
  } catch (err) {
    if (err instanceof ScimIpPolicyError) return res.status(err.status).json({ error: err.message, code: err.code, ruleId: err.ruleId, recoveryUrl: err.recoveryUrl });
    logger.error('Delete SCIM IP rule failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'The SCIM IP rule could not be deleted and recorded. Nothing was changed.' });
  }
});

export default router;
