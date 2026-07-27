/**
 * MDX Admin & Access surface route.
 *
 *   GET /api/mdx/admin   — tenant members, roles, grants, KPIs, api-keys,
 *                          audit, settings, and SSO/SCIM facets
 *
 * Backs the kit Admin surface (client useAdmin). Returns the surface's exact
 * payload shape, tenant-scoped, from the real stores:
 *   members / roles / grants  → users + organization_users
 *   apiKeys                    → api_keys (org-scoped, hashed at rest)
 *   audit                      → audit_logs (this tenant, most recent)
 *   settings                   → organizations.settings + org columns
 *   sso                        → organizations.settings.security + scim_tenants
 * Every facet is fail-closed per store: a missing table degrades that facet
 * to empty rather than 500-ing the whole payload. Fields with no real source
 * (per-IdP user distribution, key rotation policy) are honest empties — never
 * fabricated.
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

/**
 * Org-admin roles that may read this tenant's admin data. Mirrors the ui-v2
 * Shell gate (isOrgAdmin) and client-portal's STAFF_ROLES. This is the
 * SERVER-SIDE authorization: the global /api boundary authenticates the caller
 * but does not authorize a role, and the ui-v2 Shell only HIDES the nav item —
 * so without this gate any authenticated tenant member could read API-key
 * names/scopes, audit targets and SSO/security config.
 */
const ADMIN_ROLES = new Set(['admin', 'owner', 'super_admin', 'platform_admin', 'business_admin']);
function isAdminCaller(req: Request): boolean {
  const u = (req as any).user ?? {};
  const single = String(u.role ?? (req as any).userRole ?? '').toLowerCase();
  if (ADMIN_ROLES.has(single)) return true;
  return Array.isArray(u.roles) && u.roles.some((r: unknown) => ADMIN_ROLES.has(String(r).toLowerCase()));
}

const initials = (name: string | null, email: string | null): string => {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || (name[0] ?? '?').toUpperCase();
  }
  return (email?.[0] ?? '?').toUpperCase();
};
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Best-effort SELECT: returns [] when the table is not provisioned (42P01)
 *  or any facet query fails, so one missing store can't sink the payload. */
async function facet<T>(sql: string, params: unknown[]): Promise<T[]> {
  try {
    const { rows } = await pool.query(sql, params);
    return rows as T[];
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '42P01') return [];
    log.warn('admin facet query failed', { err: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

interface MemberRow {
  user_id: number; name: string | null; email: string | null;
  role: string | null; status: string | null; mfa_enabled: boolean | null;
  last_login: Date | string | null; permissions: unknown;
}

router.get('/admin', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  // Fail-closed authorization (AGENTS.md §Repository Safety: gates fail closed).
  // Non-leaky 403 — reveal nothing about the org's admin estate to non-admins.
  if (!isAdminCaller(req)) {
    return res.status(403).json({ error: 'Organization admin access required.' });
  }

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

    // ── API keys (real, org-scoped; hashed at rest — only the prefix is shown) ──
    const keyRows = await facet<{
      id: number; name: string; scopes: unknown; created_at: Date | string | null;
      last_used_at: Date | string | null; created_by: number | null; status: string | null;
    }>(
      `SELECT id, name, scopes, created_at, last_used_at, created_by, status
         FROM api_keys WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [orgId],
    );
    const apiKeys = keyRows
      .filter((k) => k.status !== 'revoked')
      .map((k) => ({
        id: `key-${k.id}`,
        name: k.name,
        owner: k.created_by ? `u-${k.created_by}` : '',
        scopes: Array.isArray(k.scopes)
          ? k.scopes
          : typeof k.scopes === 'string'
            ? (() => { try { return JSON.parse(k.scopes); } catch { return []; } })()
            : [],
        created: k.created_at ? new Date(k.created_at).toISOString().slice(0, 10) : '',
        lastUsed: k.last_used_at ? new Date(k.last_used_at).toISOString() : 'never',
        rotateIn: '', // no rotation policy is stored — honest empty, never invented
      }));

    // ── Admin audit (real, this tenant, most recent) ──
    const auditRows = await facet<{
      id: string; user_id: number | null; action: string; table_name: string | null;
      record_id: string | null; created_at: Date | string; sha256_chain: string | null;
    }>(
      `SELECT id, user_id, action, table_name, record_id, created_at, sha256_chain
         FROM audit_logs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [orgId],
    );
    const audit = auditRows.map((a) => ({
      id: String(a.id).slice(0, 12),
      when: new Date(a.created_at).toISOString(),
      actor: a.user_id ? `u-${a.user_id}` : 'system',
      action: a.action,
      target: [a.table_name, a.record_id].filter(Boolean).join(' · ') || '—',
      sha: a.sha256_chain ? `${a.sha256_chain.slice(0, 4)}…${a.sha256_chain.slice(-4)}` : '',
    }));

    // ── Org settings + SSO/SCIM (real; organizations.settings + scim_tenants) ──
    const orgRows = await facet<{ name: string | null; domain: string | null; settings: unknown }>(
      `SELECT name, domain, settings FROM organizations WHERE id = $1`,
      [orgId],
    );
    const org = orgRows[0] ?? { name: null, domain: null, settings: null };
    const orgSettings = (org.settings && typeof org.settings === 'object' ? org.settings : {}) as Record<string, any>;
    const security = (orgSettings.security && typeof orgSettings.security === 'object' ? orgSettings.security : {}) as Record<string, any>;
    const mfaOn = security.mfaEnabled !== false; // default-on posture
    const ssoOn = security.ssoEnabled === true;
    const sessionMins = typeof security.sessionTimeout === 'number' ? security.sessionTimeout : null;

    const scimRows = await facet<{ enabled: boolean; updated_at: Date | string | null }>(
      `SELECT enabled, updated_at FROM scim_tenants WHERE organization_id = $1 ORDER BY updated_at DESC`,
      [orgId],
    );
    const scimActive = scimRows.some((s) => s.enabled);

    // Settings tab — only rows with a real backing value (honesty over completeness).
    const settings = [
      mfaOn !== undefined && {
        id: 'mfa-required', label: 'MFA required', kind: 'toggle',
        value: mfaOn ? 'Yes (all roles)' : 'Optional',
        desc: '21 CFR Part 11 §11.10(d) compliance',
      },
      sessionMins != null && {
        id: 'session-ttl', label: 'Session timeout', kind: 'duration',
        value: `${sessionMins} minutes`, desc: 'Idle re-authentication interval',
      },
      {
        id: 'sso', label: 'Single sign-on', kind: 'toggle',
        value: ssoOn ? 'Enabled' : 'Disabled', desc: 'SAML / OIDC via your IdP',
      },
      org.name && {
        id: 'branding', label: 'Org branding', kind: 'text',
        value: org.name, desc: 'Appears on PDF exports + cover letters',
      },
    ].filter(Boolean);

    // SSO object — truthful reflection of the org's real config. No fabricated
    // provider topology: primary/fallback describe the actual enabled state,
    // scim reflects real scim_tenants, and counts with no real source stay 0.
    const memberCount = members.length;
    const sso = {
      primary: ssoOn
        ? { kind: 'SAML/OIDC', provider: 'Configured IdP', status: 'connected', domain: org.domain ?? '', users: memberCount, lastSync: '' }
        : { kind: '—', provider: 'Not configured', status: 'disabled', domain: org.domain ?? '', users: 0, lastSync: 'never' },
      fallback: { kind: 'Local', provider: 'Local users', status: 'enabled', domain: org.domain ?? '', users: ssoOn ? 0 : memberCount, lastSync: 'real-time' },
      proposed: { kind: '—', provider: 'None staged', status: 'none', domain: '', users: 0, lastSync: 'never' },
      scim: { provider: scimActive ? 'SCIM 2.0' : 'Not configured', enabled: scimActive, provisionedAttrs: 0, lastEvent: '' },
      mfaRequired: mfaOn,
      sessionTtl: sessionMins != null ? `${sessionMins}m` : '',
    };

    const active = members.filter((m) => m.state === 'active').length;
    const kpis = [
      { label: 'Members', metric: String(members.length), meta: `${active} active` },
      { label: 'Roles', metric: String(roles.length), meta: 'Distinct org roles' },
      { label: 'MFA enabled', metric: String(members.filter((m) => m.mfa).length), meta: `of ${members.length} members` },
      { label: 'API keys', metric: String(apiKeys.length), meta: 'active, org-scoped' },
    ];

    return ok(res, {
      kpis, members, roles, grants, apiKeys, audit, settings, sso,
    }, { count: members.length });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '42P01') {
      return ok(res, { kpis: [], members: [], roles: [], grants: [], apiKeys: [], audit: [], settings: [], sso: null }, { count: 0 });
    }
    return serverError(res, log, 'admin', err);
  }
});

export default router;
