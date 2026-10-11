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
 * Every facet degrades on its own. A missing table (42P01) is a deployment
 * state and an empty facet is a true statement about it. Any OTHER failure is
 * a fault: the facet comes back empty AND is named in `meta.unavailable`, so
 * the surface renders "couldn't be read" for it instead of "0 API keys" or "No
 * admin audit entries yet" (the pattern mdx-engineering.ts panel() set). A
 * failed organizations read also withholds the settings and SSO rows derived
 * from it rather than reporting their defaults ("SSO: Disabled") as the org's
 * configuration. Fields with no real source (per-IdP user distribution, key
 * rotation policy) are honest empties — never fabricated.
 *
 * The "second factor at sign-in" row states what POST /api/auth/login does
 * (routes/auth.ts), not a stored preference: password sign-in always
 * challenges, except on a development server with dev auth on
 * (isDevAuthAllowed). It used to read `settings.security.mfaEnabled !== false`,
 * a flag nothing at sign-in reads, and said "Yes (all roles)" beside audit rows
 * recording "second factor skipped" (2026-09-23 launch sweep, D2).
 */

import { Router, Request, Response } from 'express';
import { createScopedLogger } from '../utils/logger';
import { ok, orgRequired, serverError } from '../lib/api-response';
import { pool } from '../db';
import { isDevAuthAllowed } from '../auth/dev-auth-policy';
import { mfaEnrolmentOf } from '../services/mfa-enrolment';
import { isActiveAccountStatus, isPendingVerificationStatus } from '../services/account-standing';
import { INVITE_PASSWORD_HASH_PREFIX } from '../services/password-setup-token';
import { roleScopesOf } from '../services/tenant/role-scopes';
import { humanizeEventType, linkedSignatures, type LinkedSignature } from './audit-trail-ledger.routes';

// People are named through public.actor_name, not a join on users: since users
// took row-level security (D3, 2026-09-28) a tenant scope reads only current
// members, so the join dropped the name of anyone who had left
// (docs/evidence/D3/2026-09-29-actor-names/).
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

/** The payload facets a read can fail for, as named in `meta.unavailable`. */
type Facet = 'apiKeys' | 'audit' | 'settings' | 'sso';

/** Per-facet SELECT. A table that is not provisioned (42P01) is an empty facet.
 *  Any other failure is recorded in `unavailable` (per request, never module
 *  state) so the surface can say the read failed; the rows are still [] so one
 *  broken store can't sink the payload. */
async function facet<T>(name: Facet, sql: string, params: unknown[], unavailable: Facet[]): Promise<T[]> {
  try {
    const { rows } = await pool.query(sql, params);
    return rows as T[];
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '42P01') return [];
    unavailable.push(name);
    log.warn(`admin facet ${name} failed`, { err: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

/** A display name for an account, never its id. */
const accountName = (name: string | null, email: string | null): string | null =>
  (name && name.trim()) || (email && email.trim()) || null;

/** What an audit row acted on, named for a reader: an account by its name, this
 *  organization by its name, anything else by its humanized table. */
function auditTargetName(
  a: { table_name: string | null; record_id: string | null; target_name: string | null; target_email: string | null },
  orgId: number,
  orgName: string | null,
): string {
  const table = (a.table_name ?? '').toLowerCase();
  if (table === 'user' || table === 'users') return accountName(a.target_name, a.target_email) ?? 'A user account';
  if ((table === 'organization' || table === 'organizations') && a.record_id === String(orgId) && orgName) return orgName;
  return a.table_name ? humanizeEventType(a.table_name) : '—';
}

interface MemberRow {
  user_id: number; name: string | null; email: string | null;
  role: string | null; status: string | null; mfa_enabled: boolean | null;
  mfa_method: string | null; last_login: Date | string | null; permissions: unknown;
  /** The setup link has not been redeemed: the password hash is still the invitation's. */
  invite_pending: boolean | null;
}

/**
 * Whether the member can sign in, in the surface's three words (QA 2026-10-08,
 * j9 finding 4). An invitee's users row is 'active' from the moment they are
 * invited, with an unusable password hash, so `status` alone counted people who
 * cannot sign in as active and left the Invited filter empty.
 *   invited  — the setup link is not redeemed yet (or a sign-up's address is
 *              not confirmed yet): the account exists and cannot sign in.
 *   active   — users.status 'active' (services/account-standing.ts).
 *   disabled — any other status: suspended by the platform, deprovisioned.
 */
function memberStateOf(r: Pick<MemberRow, 'status' | 'invite_pending'>): 'invited' | 'active' | 'disabled' {
  if (r.invite_pending === true || isPendingVerificationStatus(r.status)) return 'invited';
  return isActiveAccountStatus(r.status ?? 'active') ? 'active' : 'disabled';
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
              u.mfa_method, u.last_login, ou.permissions,
              (u.password_hash LIKE $2) AS invite_pending
         FROM organization_users ou
         JOIN users u ON u.id = ou.user_id
        WHERE ou.organization_id = $1
        ORDER BY u.name NULLS LAST`,
      [orgId, `${INVITE_PASSWORD_HASH_PREFIX}%`],
    );

    /* The member drawer changes a role and removes a member through PATCH /
       DELETE /api/tenant-users/:organizationId/:userId (QA 2026-10-08, j9).
       Those take the organization and the numeric user id, so both are sent as
       themselves, and `self` marks the caller's own row, whose role and
       membership that route refuses to change (SELF_ROLE_CHANGE /
       SELF_REMOVAL). The route remains the authority on every change. */
    const callerId = Number((req as any).user?.id ?? (req as any).userId);
    const members = rows.map((r) => ({
      id: `u-${r.user_id}`,
      userId: Number(r.user_id),
      self: Number.isInteger(callerId) && callerId > 0 && Number(r.user_id) === callerId,
      initials: initials(r.name, r.email),
      name: r.name ?? r.email ?? `User ${r.user_id}`,
      email: r.email ?? '',
      role: cap(r.role ?? 'member'),
      groups: [] as string[],
      sso: '',
      // An authenticator app is enrolled and confirmed — the same rule the
      // sign-in challenge applies (services/mfa-enrolment.ts). Without one,
      // password sign-in asks this account for an emailed code instead.
      mfa: mfaEnrolmentOf({ mfaEnabled: r.mfa_enabled, mfaMethod: r.mfa_method }).mfaEnabled,
      lastSeen: r.last_login ? new Date(r.last_login).toISOString() : '',
      state: memberStateOf(r),
      programs: [] as string[],
    }));

    // Roles derived from the live membership rows; what each may do is read
    // from the checks that enforce it (role-scopes.ts; QA 2026-10-08, j9).
    const roleCounts = new Map<string, number>();
    for (const m of rows) {
      const id = (m.role ?? 'member').toLowerCase();
      roleCounts.set(id, (roleCounts.get(id) ?? 0) + 1);
    }
    const roles = [...roleCounts.entries()].map(([id, count]) => ({
      id, label: cap(id), members: count, ...roleScopesOf(id),
    }));

    // Grants: one row per member's org-level role assignment.
    const grants = rows.map((r) => ({
      user: `u-${r.user_id}`,
      program: '*',
      scope: (r.role ?? 'member').toLowerCase() === 'admin' ? 'edit' : 'view',
      granted: `Org ${r.role ?? 'member'}`,
    }));

    /* Facets whose read FAILED (not merely empty), per request. Reported in
       meta.unavailable so the surface never renders a failed read as "none". */
    const unavailable: Facet[] = [];

    // ── API keys (real, org-scoped; hashed at rest — only the prefix is shown) ──
    const keyRows = await facet<{
      id: number; name: string; key_prefix: string | null; scopes: unknown; created_at: Date | string | null;
      last_used_at: Date | string | null; created_by: number | null; status: string | null;
      owner_name: string | null; owner_email: string | null;
    }>(
      'apiKeys',
      `SELECT k.id, k.name, k.key_prefix, k.scopes, k.created_at, k.last_used_at, k.created_by, k.status,
              u.name AS owner_name, u.email AS owner_email
         FROM api_keys k
         LEFT JOIN LATERAL public.actor_name(k.created_by) u ON TRUE
        WHERE k.organization_id = $1 ORDER BY k.created_at DESC LIMIT 50`,
      [orgId],
      unavailable,
    );
    const apiKeys = keyRows
      .filter((k) => k.status !== 'revoked')
      .map((k) => ({
        id: `key-${k.id}`,
        /** The id DELETE /api/api-keys/:id takes (it parseInt()s the param, so
         *  `id` above — "key-7" — was refused as "Invalid key ID"). */
        keyId: k.id,
        /** The key's public prefix — what identifies it to a person. */
        prefix: k.key_prefix ?? '',
        name: k.name,
        owner: accountName(k.owner_name, k.owner_email) ?? '',
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
    /* In the words the Audit trail surface uses for the same rows
       (audit-trail-ledger.routes.ts): the account's name, the event's recorded
       description (or its humanized action), and the target named rather than
       given as table · id. The row id is the React key only; it was shown cut
       to 12 characters of a UUID, which identified nothing. `when` stays an ISO
       instant — the surface formats it for the reader's locale. */
    const auditRows = await facet<{
      id: string; user_id: number | null; action: string; table_name: string | null;
      record_id: string | null; created_at: Date | string; sha256_chain: string | null;
      new_values: unknown;
      description: string | null; actor_name: string | null; actor_email: string | null;
      target_name: string | null; target_email: string | null;
    }>(
      'audit',
      `SELECT a.id, a.user_id, a.action, a.table_name, a.record_id, a.created_at, a.sha256_chain,
              a.new_values, a.new_values->>'description' AS description,
              ua.name AS actor_name, ua.email AS actor_email,
              ut.name AS target_name, ut.email AS target_email
         FROM audit_logs a
         LEFT JOIN LATERAL public.actor_name(a.user_id) ua ON TRUE
         LEFT JOIN LATERAL public.actor_name(
           CASE WHEN a.table_name IN ('user', 'users') AND a.record_id ~ '^[0-9]{1,9}$' THEN a.record_id::int END
         ) ut ON TRUE
        WHERE a.tenant_id = $1 ORDER BY a.created_at DESC LIMIT 20`,
      [orgId],
      unavailable,
    );

    // ── Org settings + SSO/SCIM (real; organizations.settings + scim_tenants) ──
    const orgRows = await facet<{ name: string | null; domain: string | null; settings: unknown }>(
      'settings',
      `SELECT name, domain, settings FROM organizations WHERE id = $1`,
      [orgId],
      unavailable,
    );
    // A failed organizations read is not an org with SSO off and no timeout:
    // the rows derived from it are withheld, and SSO (which reads it) with them.
    const orgRead = !unavailable.includes('settings');
    if (!orgRead) unavailable.push('sso');
    const org = orgRows[0] ?? { name: null, domain: null, settings: null };
    const orgSettings = (org.settings && typeof org.settings === 'object' ? org.settings : {}) as Record<string, any>;
    const security = (orgSettings.security && typeof orgSettings.security === 'object' ? orgSettings.security : {}) as Record<string, any>;
    const ssoOn = security.ssoEnabled === true;
    const sessionMins = typeof security.sessionTimeout === 'number' ? security.sessionTimeout : null;

    const scimRows = await facet<{ enabled: boolean; updated_at: Date | string | null }>(
      'sso',
      `SELECT enabled, updated_at FROM scim_tenants WHERE organization_id = $1 ORDER BY updated_at DESC`,
      [orgId],
      unavailable,
    );
    const scimActive = scimRows.some((s) => s.enabled);

    /* A signed act is named from its signature row, as the audit-trail ledger
       names it: "Controlled document approved (e-signature)" on C2C-SOP-001
       v1.0, not "C2c Work Approve" on "Qms Document" (#24). A failed lookup
       leaves each row's own label — a lower-fidelity name, never a claim. */
    let signedActs = new Map<string, LinkedSignature>();
    try {
      signedActs = await linkedSignatures(pool, orgId, auditRows as unknown as Record<string, unknown>[]);
    } catch (err: unknown) {
      log.warn('admin audit band: signature names unavailable', { err: err instanceof Error ? err.message : String(err) });
    }

    const audit = auditRows.map((a) => {
      const signed = signedActs.get(String(a.id));
      const target = auditTargetName(a, orgId, org.name);
      return {
        id: String(a.id),
        when: new Date(a.created_at).toISOString(),
        actor: a.user_id ? accountName(a.actor_name, a.actor_email) ?? `user ${a.user_id}` : 'system',
        action: signed?.event ?? ((a.description && a.description.trim()) || humanizeEventType(a.action)),
        target: signed?.subject ?? target,
        sha: a.sha256_chain ? `${a.sha256_chain.slice(0, 4)}…${a.sha256_chain.slice(-4)}` : '',
      };
    });

    /* What password sign-in actually asks for (routes/auth.ts POST /login):
       every sign-in is challenged — the authenticator app when one is
       enrolled, an emailed code otherwise — unless this is a development
       server with dev auth on, where the challenge is skipped. No org setting
       changes that, so this row is not presented as a toggle. */
    const secondFactorSkipped = isDevAuthAllowed();
    const secondFactor = secondFactorSkipped
      ? {
          id: 'mfa-required', label: 'Second factor at sign-in', kind: 'policy',
          value: 'Skipped on this development server',
          desc: 'Development sign-in is on here, so password sign-in does not ask for a second factor. A deployed server always asks for one.',
        }
      : {
          id: 'mfa-required', label: 'Second factor at sign-in', kind: 'policy',
          value: 'Required for every member',
          desc: 'Password sign-in asks for the authenticator app when one is enrolled, otherwise an emailed code. Supports 21 CFR 11.10(d), limiting system access to authorized individuals.',
        };

    // Settings tab — only rows with a real backing value (honesty over completeness).
    const settings = [
      secondFactor,
      orgRead && sessionMins != null && {
        id: 'session-ttl', label: 'Session timeout', kind: 'duration',
        value: `${sessionMins} minutes`, desc: 'Idle re-authentication interval',
      },
      orgRead && {
        id: 'sso', label: 'Single sign-on', kind: 'toggle',
        value: ssoOn ? 'Enabled' : 'Disabled', desc: 'SAML / OIDC via your IdP',
      },
      orgRead && org.name && {
        id: 'branding', label: 'Org branding', kind: 'text',
        value: org.name, desc: 'Appears on PDF exports + cover letters',
      },
    ].filter(Boolean);

    // SSO object — truthful reflection of the org's real config. No fabricated
    // provider topology: primary/fallback describe the actual enabled state,
    // scim reflects real scim_tenants, and counts with no real source stay 0.
    // null when either store it reads could not be read (meta.unavailable).
    const memberCount = members.length;
    const sso = unavailable.includes('sso') ? null : {
      primary: ssoOn
        ? { kind: 'SAML/OIDC', provider: 'Configured IdP', status: 'connected', domain: org.domain ?? '', users: memberCount, lastSync: '' }
        : { kind: '—', provider: 'Not configured', status: 'disabled', domain: org.domain ?? '', users: 0, lastSync: 'never' },
      fallback: { kind: 'Local', provider: 'Local users', status: 'enabled', domain: org.domain ?? '', users: ssoOn ? 0 : memberCount, lastSync: 'real-time' },
      proposed: { kind: '—', provider: 'None staged', status: 'none', domain: '', users: 0, lastSync: 'never' },
      scim: { provider: scimActive ? 'SCIM 2.0' : 'Not configured', enabled: scimActive, provisionedAttrs: 0, lastEvent: '' },
      mfaRequired: !secondFactorSkipped,
      sessionTtl: sessionMins != null ? `${sessionMins}m` : '',
    };

    const active = members.filter((m) => m.state === 'active').length;
    const invited = members.filter((m) => m.state === 'invited').length;
    const keysRead = !unavailable.includes('apiKeys');
    const kpis = [
      { label: 'Members', metric: String(members.length), meta: `${active} active${invited ? ` · ${invited} invited` : ''}` },
      { label: 'Roles', metric: String(roles.length), meta: 'Distinct org roles' },
      { label: 'Authenticator app', metric: String(members.filter((m) => m.mfa).length), meta: `of ${members.length} members enrolled` },
      { label: 'API keys', metric: keysRead ? String(apiKeys.length) : '--', meta: keysRead ? 'active, org-scoped' : 'could not be read' },
    ];

    return ok(res, {
      organizationId: orgId, kpis, members, roles, grants, apiKeys, audit, settings, sso,
    }, {
      count: members.length,
      /* Names the facets whose read FAILED, so the surface renders an error for
         those and a true empty for the rest. Always present, so a consumer
         never has to tell an absent key from an empty list. */
      unavailable: [...new Set(unavailable)],
    });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '42P01') {
      return ok(res, { kpis: [], members: [], roles: [], grants: [], apiKeys: [], audit: [], settings: [], sso: null }, { count: 0, unavailable: [] });
    }
    return serverError(res, log, 'admin', err);
  }
});

export default router;
