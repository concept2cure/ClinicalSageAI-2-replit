/**
 * MDX Admin & Access surface route.
 *
 *   GET /api/mdx/admin   — tenant members, roles, grants, KPIs (+ empty-safe
 *                          api-keys / audit / settings facets)
 *
 * Backs the kit Admin surface (client useAdmin). Returns the surface's exact
 * payload shape from the real users + organization_users tables, tenant-scoped.
 * api_keys / settings facets have no per-org store wired yet, so they return
 * empty (the surface renders its empty state) rather than fixtures.
 */

import { Router, Request, Response } from 'express';
import { createScopedLogger } from '../utils/logger';
import { ok, orgRequired, serverError } from '../lib/api-response';
import { pool } from '../db';

const router = Router();
const log = createScopedLogger('mdx-admin');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const initials = (name: string | null, email: string | null): string => {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || (name[0] ?? '?').toUpperCase();
  }
  return (email?.[0] ?? '?').toUpperCase();
};
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

interface MemberRow {
  user_id: number; name: string | null; email: string | null;
  role: string | null; status: string | null; mfa_enabled: boolean | null;
  last_login: Date | string | null; permissions: unknown;
}

router.get('/admin', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);

  try {
    const { rows } = await pool.query<MemberRow>(
      `SELECT ou.user_id, u.name, u.email, ou.role, u.status, u.mfa_enabled,
              u.last_login, ou.permissions
         FROM organization_users ou
         JOIN users u ON u.id = ou.user_id
        WHERE ou.organization_id = $1
        ORDER BY u.name NULLS LAST`,
      [orgId],
    );

    const members = rows.map((r) => ({
      id: `u-${r.user_id}`,
      initials: initials(r.name, r.email),
      name: r.name ?? r.email ?? `User ${r.user_id}`,
      email: r.email ?? '',
      role: cap(r.role ?? 'member'),
      groups: [] as string[],
      sso: '',
      mfa: Boolean(r.mfa_enabled),
      lastSeen: r.last_login ? new Date(r.last_login).toISOString() : '',
      state: r.status ?? 'active',
      programs: [] as string[],
    }));

    // Roles derived from the live membership rows.
    const roleCounts = new Map<string, number>();
    for (const m of rows) {
      const id = (m.role ?? 'member').toLowerCase();
      roleCounts.set(id, (roleCounts.get(id) ?? 0) + 1);
    }
    const roles = [...roleCounts.entries()].map(([id, count]) => ({
      id, label: cap(id), members: count, desc: '', scopes: [] as string[],
    }));

    // Grants: one row per member's org-level role assignment.
    const grants = rows.map((r) => ({
      user: `u-${r.user_id}`,
      program: '*',
      scope: (r.role ?? 'member').toLowerCase() === 'admin' ? 'edit' : 'view',
      granted: `Org ${r.role ?? 'member'}`,
    }));

    const active = members.filter((m) => m.state === 'active').length;
    const kpis = [
      { label: 'Members', metric: String(members.length), meta: `${active} active` },
      { label: 'Roles', metric: String(roles.length), meta: 'Distinct org roles' },
      { label: 'MFA enabled', metric: String(members.filter((m) => m.mfa).length), meta: `of ${members.length} members` },
    ];

    return ok(res, {
      kpis, members, roles, grants,
      apiKeys: [], audit: [], settings: [],
    }, { count: members.length });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '42P01') {
      return ok(res, { kpis: [], members: [], roles: [], grants: [], apiKeys: [], audit: [], settings: [] }, { count: 0 });
    }
    return serverError(res, log, 'admin', err);
  }
});

export default router;
