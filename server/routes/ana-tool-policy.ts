/**
 * AnA tool policy admin routes — mounted at /api/ana-tool-policy.
 *
 *   GET  /api/ana-tool-policy        Read current policy for the caller's org.
 *   PUT  /api/ana-tool-policy        Replace policy ({ allow?: string[], deny?: string[] }).
 *
 * Admin-only. Written through the one settings writer and audited in its
 * transaction with action='ana_tool_policy.update'.
 */

import { Router, Request, Response } from 'express';

import { authenticateToken } from '../middleware/auth';
import { pool } from '../db';
import { writeTenantSettings } from '../services/tenant/tenant-settings-writer';
import { loadAnaToolPolicy, type AnaToolPolicy } from '../services/ana-ri/mdx-tool-policy';
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';

const router = Router();
router.use(authenticateToken);
const log = createScopedLogger('ana-tool-policy');

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
    return serverError(res, log, 'loading the tool policy', err);
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
    /* Through the one settings writer (services/tenant/tenant-settings-writer.ts;
       R7, 2026-10-01): the stored settings are read under a row lock and the
       policy is overlaid on them in one transaction with its chained audit row.
       This door read the whole object, wrote it all back with no lock, and
       recorded the change after commit, so a setting changed in between (the
       connector switch, a session limit) was silently reverted, and a lost
       audit row left the change unrecorded. The action keeps its name, which
       audit.explain reads; the row carries the policy before and after. */
    const stored = await writeTenantSettings(req, orgId, {
      action: 'ana_tool_policy.update',
      next: (current) => ({ ...current, anaToolPolicy: next }),
      sections: () => ['anaToolPolicy'],
    });
    if (!stored) return res.status(404).json({ error: 'Organization not found' });

    res.json({ organizationId: orgId, policy: next, auditTrail: { persisted: true, chained: true } });
  } catch (err) {
    return serverError(res, log, 'updating the tool policy', err);
  }
});

/**
 * GET /api/ana-tool-policy/catalog
 * The full tool catalog for the user's tool picker, grouped by category, plus
 * the org's current deny-list so the picker can show which tools are governed
 * off. Available to any authenticated user (not admin-only).
 */
router.get('/catalog', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  try {
    const [{ getAllEnabledTools }, { getToolCatalog }] = await Promise.all([
      import('../services/ana/AnaToolDefinitions.js'),
      import('../services/ana/tool-selection.js'),
    ]);
    const categories = getToolCatalog(getAllEnabledTools());
    let deniedTools: string[] = [];
    if (orgId !== null) {
      try {
        const policy = await loadAnaToolPolicy(pool, orgId);
        deniedTools = policy.deny ?? [];
      } catch {
        /* fail-open — show the full catalog if policy can't be read */
      }
    }
    res.json({ categories, deniedTools });
  } catch (err) {
    return serverError(res, log, 'loading the tool catalog', err);
  }
});

export default router;
