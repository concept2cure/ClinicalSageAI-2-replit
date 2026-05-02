/**
 * AnA tool policy admin routes — mounted at /api/ana-tool-policy.
 *
 *   GET  /api/ana-tool-policy        Read current policy for the caller's org.
 *   PUT  /api/ana-tool-policy        Replace policy ({ allow?: string[], deny?: string[] }).
 *
 * Admin-only. Audited with action='ana_tool_policy.update'.
 */

import { Router, Request, Response } from 'express';

import { authenticateToken } from '../middleware/auth';
import { pool } from '../db';
import auditService from '../services/auditService';
import { loadAnaToolPolicy, type AnaToolPolicy } from '../services/ana-ri/mdx-tool-policy';

const router = Router();
router.use(authenticateToken);

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

function isAdmin(req: Request): boolean {
  const u = (req as any).user;
  if (!u) return false;
  if (u.role === 'admin' || u.role === 'owner') return true;
  if (Array.isArray(u.roles) && (u.roles.includes('admin') || u.roles.includes('owner'))) {
    return true;
  }
  return false;
}

const VALID_KEYS: ReadonlySet<keyof AnaToolPolicy> = new Set(['allow', 'deny']);

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin role required' });
  try {
    const policy = await loadAnaToolPolicy(pool, orgId);
    res.json({ organizationId: orgId, policy });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to load policy',
      detail: err instanceof Error ? err.message : 'unknown',
    });
  }
});

router.put('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin role required' });

  const body = req.body ?? {};
  const next: AnaToolPolicy = {};
  if (body.allow !== undefined) {
    if (!Array.isArray(body.allow) || body.allow.some((s: unknown) => typeof s !== 'string')) {
      return res.status(422).json({ error: 'allow must be an array of strings' });
    }
    next.allow = body.allow as string[];
  }
  if (body.deny !== undefined) {
    if (!Array.isArray(body.deny) || body.deny.some((s: unknown) => typeof s !== 'string')) {
      return res.status(422).json({ error: 'deny must be an array of strings' });
    }
    next.deny = body.deny as string[];
  }
  // Reject any unknown keys so a typo doesn't silently no-op.
  for (const k of Object.keys(body)) {
    if (!VALID_KEYS.has(k as keyof AnaToolPolicy)) {
      return res.status(422).json({ error: `Unknown policy key: ${k}` });
    }
  }

  try {
    // Read existing settings, merge anaToolPolicy, write back.
    const { rows } = await pool.query(
      `SELECT settings FROM organizations WHERE id = $1 LIMIT 1`,
      [orgId],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Organization not found' });

    const settings = (rows[0].settings ?? {}) as Record<string, unknown>;
    const previousPolicy = (settings.anaToolPolicy ?? {}) as AnaToolPolicy;
    settings.anaToolPolicy = next;

    await pool.query(
      `UPDATE organizations SET settings = $1, updated_at = NOW() WHERE id = $2`,
      [settings, orgId],
    );

    void auditService.logAction({
      tenantId: orgId,
      userId: (req as any).user?.id ?? null,
      action: 'ana_tool_policy.update',
      resourceType: 'organization_settings',
      resourceId: String(orgId),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      details: { previousPolicy, newPolicy: next },
    });

    res.json({ organizationId: orgId, policy: next });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to update policy',
      detail: err instanceof Error ? err.message : 'unknown',
    });
  }
});

export default router;
