/**
 * SCIM 2.0 provisioning endpoint (RFC 7643 / 7644) — core Users lifecycle.
 *
 * Enterprise IdPs (Okta, Entra ID, Ping) push user create / update / deactivate
 * here so access is provisioned and — critically — DEPROVISIONED automatically
 * when an employee is offboarded. Pairs with the SAML SSO login path.
 *
 * Auth: a bearer token (SCIM_BEARER_TOKEN), constant-time compared. The endpoint
 * provisions into a single configured tenant (SCIM_ORG_ID) — the common 1 IdP :
 * 1 org deployment. When unconfigured, the routes report "not configured".
 *
 * Tenant safety: all writes go through the shared `query`/`transaction` helpers
 * with explicit organization scoping; this file is on the tenant-isolation gate
 * allowlist because user-by-email lookup is inherent to provisioning and the
 * org is a fixed deployment constant, not request-derived. `users` is a GLOBAL
 * identity row and tenancy is the `organization_users` row, so a tenant's IdP
 * may write `users.status` / `users.name` only when it is the user's sole
 * organisation — see "Sole-organisation rule" below (IAM-05 / P0-5).
 *
 * Scope: Users (list w/ userName filter + pagination, create, get, replace,
 * patch-active, deactivate), Groups (RBAC-role-mapped: list/get/patch
 * membership), and discovery (ServiceProviderConfig, ResourceTypes, Schemas).
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import * as crypto from 'crypto';
import { query, transaction } from '../db';
import { createScopedLogger } from '../utils/logger';
import { ipInAnyCidr } from '../utils/cidr';
import { shouldProcessTenantInBackground } from '../services/tenant/tenant-lifecycle.js';
import { clientIpOf } from '../utils/client-ip';
import { invalidateOrgMembershipCache } from '../middleware/orgMembership';

const logger = createScopedLogger('scim');
const router = Router();

// SCIM is mounted at /scim/v2 (OUTSIDE the /api global rate limiters), so it
// gets its own per-IP limit — protects the bearer-token endpoints from
// brute-force / flood. 60/min/IP comfortably covers real IdP sync traffic.
const scimRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
    status: '429',
    detail: 'Too many requests.',
  },
});
router.use(scimRateLimiter);

// IdPs send application/scim+json; parse it (and plain json) on this router.
router.use(express.json({ type: ['application/json', 'application/scim+json'], limit: '1mb' }));

const USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
const GROUP_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Group';
const LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
const ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error';

// SCIM Groups are mapped onto the org's RBAC roles (organization_users.role).
// A user holds exactly one role per org, so assigning a user to a role-group
// sets that role; removing them from their current role-group demotes to member.
const VALID_ROLES = ['admin', 'manager', 'member', 'viewer'] as const;
type OrgRole = (typeof VALID_ROLES)[number];
function isValidRole(role: string): role is OrgRole {
  return (VALID_ROLES as readonly string[]).includes(role);
}

interface ScimTenant {
  token: string;
  orgId: number;
}

/**
 * Resolve the configured SCIM tenants. Multi-tenant: SCIM_TENANTS is a JSON
 * array of `{ "token": "...", "orgId": <int> }` so one deployment can serve
 * several client orgs (each IdP gets its own token → org). The single-tenant
 * env pair (SCIM_BEARER_TOKEN / SCIM_ORG_ID) is still honored for back-compat.
 */
function loadScimTenants(): ScimTenant[] {
  const tenants: ScimTenant[] = [];

  const raw = process.env.SCIM_TENANTS;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          const token = (entry as { token?: unknown })?.token;
          const orgId = Number((entry as { orgId?: unknown })?.orgId);
          if (typeof token === 'string' && token.length > 0 && Number.isFinite(orgId)) {
            tenants.push({ token, orgId });
          }
        }
      }
    } catch {
      /* malformed SCIM_TENANTS — ignore, fall back to the single-tenant pair */
    }
  }

  const token = process.env.SCIM_BEARER_TOKEN;
  const orgId = Number(process.env.SCIM_ORG_ID);
  if (token && Number.isFinite(orgId)) tenants.push({ token, orgId });

  return tenants;
}

// ─── DB-backed tenants (scim_tenants table; tokens stored as SHA-256 hashes) ──

interface DbScimTenant {
  orgId: number;
  tokenHash: string;
}

const DB_TENANT_TTL_MS = 60_000;
let dbTenantCache: { tenants: DbScimTenant[]; at: number } = { tenants: [], at: 0 };

/** Test-only: force the next loadDbScimTenants() to re-query. */
export function __resetScimDbTenantCache(): void {
  dbTenantCache = { tenants: [], at: 0 };
}

/** Load enabled DB tenants, cached with a short TTL (keeps stale cache on error). */
async function loadDbScimTenants(): Promise<DbScimTenant[]> {
  if (Date.now() - dbTenantCache.at < DB_TENANT_TTL_MS) return dbTenantCache.tenants;
  try {
    const result = await query(
      'SELECT organization_id, token_hash FROM scim_tenants WHERE enabled = true'
    );
    dbTenantCache = {
      tenants: result.rows.map((r: { organization_id: number; token_hash: string }) => ({
        orgId: Number(r.organization_id),
        tokenHash: String(r.token_hash),
      })),
      at: Date.now(),
    };
  } catch (err) {
    // Keep the stale cache on a transient DB error, but mark refreshed so we
    // don't hammer the DB on every request.
    logger.error('Failed to load SCIM tenants from DB', err as Record<string, unknown>);
    dbTenantCache.at = Date.now();
  }
  return dbTenantCache.tenants;
}

// ─── Per-org source-IP allowlist (scim_ip_allowlist; network access policy) ──
//
// Opt-in, fail-closed: an org with NO enabled rows is unrestricted; once any row
// is enabled, the request source IP must fall within one of its CIDRs or the
// (otherwise valid) token is rejected. Cached with a short TTL like the tokens.
const IP_ALLOWLIST_TTL_MS = 60_000;
let ipAllowlistCache: { byOrg: Map<number, string[]>; at: number } = {
  byOrg: new Map(),
  at: 0,
};

/** Test-only: force the next loadIpAllowlist() to re-query. */
export function __resetScimIpAllowlistCache(): void {
  ipAllowlistCache = { byOrg: new Map(), at: 0 };
}

/** Load enabled allowlist CIDRs grouped by org, cached (keeps stale on error). */
async function loadIpAllowlist(): Promise<Map<number, string[]>> {
  if (Date.now() - ipAllowlistCache.at < IP_ALLOWLIST_TTL_MS) return ipAllowlistCache.byOrg;
  try {
    const result = await query(
      'SELECT organization_id, cidr FROM scim_ip_allowlist WHERE enabled = true'
    );
    const byOrg = new Map<number, string[]>();
    for (const r of result.rows as Array<{ organization_id: number; cidr: string }>) {
      const orgId = Number(r.organization_id);
      const list = byOrg.get(orgId) ?? [];
      list.push(String(r.cidr));
      byOrg.set(orgId, list);
    }
    ipAllowlistCache = { byOrg, at: Date.now() };
  } catch (err) {
    logger.error('Failed to load SCIM IP allowlist from DB', err as Record<string, unknown>);
    ipAllowlistCache.at = Date.now(); // keep stale cache, don't hammer the DB
  }
  return ipAllowlistCache.byOrg;
}

/**
 * Network access policy: true when `ip` is permitted for `orgId`. Opt-in — an
 * org with no enabled allowlist rows is always permitted. When rows exist, the
 * IP must match one (fail-closed: an empty/unknown IP is denied).
 */
async function isIpAllowedForOrg(orgId: number, ip: string): Promise<boolean> {
  const byOrg = await loadIpAllowlist();
  const cidrs = byOrg.get(orgId);
  if (!cidrs || cidrs.length === 0) return true; // unrestricted
  if (!ip) return false; // configured but no resolvable source IP → fail closed
  return ipInAnyCidr(ip, cidrs);
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function scimError(res: Response, status: number, detail: string, scimType?: string): Response {
  return res.status(status).json({
    schemas: [ERROR_SCHEMA],
    status: String(status),
    ...(scimType ? { scimType } : {}),
    detail,
  });
}

/**
 * Constant-time bearer-token check across all configured tenants; resolves the
 * matching org and pins it on the request. The match loop does constant work
 * per tenant (no early break) so timing does not reveal which tenant matched.
 */
async function scimAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> {
  try {
    const envTenants = loadScimTenants();
    const dbTenants = await loadDbScimTenants();
    if (envTenants.length === 0 && dbTenants.length === 0) {
      return scimError(res, 503, 'SCIM provisioning is not configured.');
    }

    const header = req.headers.authorization ?? '';
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match) return scimError(res, 401, 'Missing or malformed bearer token.');

    const provided = Buffer.from(match[1]);
    let matchedOrgId: number | null = null;

    // 1) env tokens — plaintext, constant-time (constant work per tenant).
    for (const tenant of envTenants) {
      const expected = Buffer.from(tenant.token);
      const ok = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
      if (ok) matchedOrgId = tenant.orgId;
    }

    // 2) DB tokens — compared by SHA-256 hash (plaintext is never stored).
    if (matchedOrgId === null) {
      const providedHash = Buffer.from(sha256Hex(match[1]), 'hex');
      for (const tenant of dbTenants) {
        let expected: Buffer;
        try {
          expected = Buffer.from(tenant.tokenHash, 'hex');
        } catch {
          continue; // malformed stored hash — skip
        }
        const ok =
          expected.length === providedHash.length &&
          crypto.timingSafeEqual(providedHash, expected);
        if (ok) matchedOrgId = tenant.orgId;
      }
    }

    if (matchedOrgId === null) return scimError(res, 401, 'Invalid bearer token.');

    // Network access policy (opt-in, fail-closed): once a tenant configures an
    // IP allowlist, an otherwise-valid token is only accepted from its CIDRs —
    // a leaked token can't be replayed from outside the IdP's egress ranges.
    const sourceIp = clientIpOf(req) ?? '';
    if (!(await isIpAllowedForOrg(matchedOrgId, sourceIp))) {
      logger.warn('SCIM request from non-allowlisted IP', { orgId: matchedOrgId, sourceIp });
      return scimError(res, 403, 'Source IP not permitted for this tenant.');
    }

    (req as Request & { scimOrgId?: number }).scimOrgId = matchedOrgId;
    next();
  } catch (err) {
    logger.error('SCIM auth error', err as Record<string, unknown>);
    return scimError(res, 500, 'SCIM authentication failed.');
  }
}

function orgOf(req: Request): number {
  return (req as Request & { scimOrgId?: number }).scimOrgId as number;
}

/**
 * Best-effort audit of a SCIM account-lifecycle event to the append-only
 * audit_events table. Account provisioning/deprovisioning is GxP-relevant
 * (21 CFR Part 11 §11.10(d) — limiting system access to authorized individuals)
 * and is the evidence a CSO/auditor expects for offboarding. Non-blocking: a
 * provisioning sync is not failed on an audit hiccup, but the failure is logged.
 */
async function auditScim(
  req: Request,
  orgId: number,
  eventType: string,
  userId: number,
  reason: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_events
         (organization_id, event_type, entity_type, entity_id, user_id, user_name,
          user_role, ip_address, reason, metadata, regulatory_significant, gxp_relevant)
       VALUES ($1, $2, 'scim_user', $3, NULL, 'SCIM Provisioning', 'system', $4, $5, $6, false, true)`,
      [orgId, eventType, userId, req.ip ?? null, reason, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    logger.error('SCIM audit write failed', err as Record<string, unknown>);
  }
}

// ─── Resource mapping ────────────────────────────────────────────────────────

interface UserRow {
  id: number;
  email: string;
  name: string | null;
  status: string;
  created_at?: Date | string;
  updated_at?: Date | string;
}

/**
 * The origin of meta.location URLs. req.protocol honours X-Forwarded-Proto only
 * from the trusted proxy (server/config/trust-proxy.ts); the raw
 * X-Forwarded-Proto and X-Forwarded-Host headers it read were the client's own.
 */
function baseUrl(req: Request): string {
  return `${req.protocol}://${req.get('host') ?? 'localhost'}`;
}

function toScimUser(req: Request, row: UserRow): Record<string, unknown> {
  const name = row.name ?? '';
  const parts = name.split(' ');
  return {
    schemas: [USER_SCHEMA],
    id: String(row.id),
    userName: row.email,
    name: {
      formatted: name,
      givenName: parts[0] ?? '',
      familyName: parts.length > 1 ? parts.slice(1).join(' ') : '',
    },
    displayName: name,
    emails: [{ value: row.email, primary: true, type: 'work' }],
    active: row.status === 'active',
    meta: {
      resourceType: 'User',
      created: row.created_at ?? undefined,
      lastModified: row.updated_at ?? undefined,
      location: `${baseUrl(req)}/scim/v2/Users/${row.id}`,
    },
  };
}

// ─── Sole-organisation rule (IAM-05 / P0-5) ──────────────────────────────────
//
// `users` is a global identity row; tenancy is the `organization_users` row
// (organization_id, user_id, role, persona, permissions — no per-org status or
// display name). A SCIM tenant may change `users.status` or `users.name` ONLY
// when it is the user's sole organisation. Otherwise its effects stop at its
// own membership:
//
//   - deprovisioning (DELETE, PATCH/PUT active=false) removes THIS tenant's
//     membership row and leaves `users.status` alone — the account stays
//     active for the user's other organisations;
//   - a rename is refused (403 `mutability`) — `users.name` is the printed
//     name on §11.50 signature manifests, and one tenant's IdP must not
//     rewrite it for another;
//   - re-activation (PATCH/PUT active=true) is a no-op on status — an IdP
//     cannot reactivate a platform-suspended shared account.
//
// Fail closed: when the count cannot be established the tenant is NOT assumed
// to own the account, so the membership-scoped path runs. Removing a
// membership already revokes tenant access (enforceOrgMembership is
// fail-closed on a missing row), so the scoped path is the safe default in
// both directions.

interface MembershipScope {
  /** Number of organisations the user belongs to (0 when it could not be read). */
  orgCount: number;
  /** True only when the caller's organisation is proven to be the user's only one. */
  soleOrg: boolean;
}

/**
 * Count the user's memberships. Every caller has just verified that the
 * calling org's own membership row exists, so a count of exactly one is the
 * caller's.
 */
async function membershipScope(userId: number): Promise<MembershipScope> {
  const r = await query('SELECT COUNT(*)::int AS count FROM organization_users WHERE user_id = $1', [
    userId,
  ]);
  const orgCount = Number(r.rows[0]?.count ?? 0);
  return { orgCount, soleOrg: orgCount === 1 };
}

const SHARED_NAME_DETAIL =
  "displayName is managed by the account's owning organisation; this user belongs to other organisations";

/**
 * Deprovision a user who belongs to other organisations: remove THIS tenant's
 * membership row, leave `users.status` untouched, drop the membership cache so
 * revocation is immediate, and audit it as a deactivation with the scope
 * spelled out. Removal precedent: server/routes/tenant-users.ts
 * (DELETE /:organizationId/:userId).
 */
async function removeMembership(
  req: Request,
  orgId: number,
  userId: number,
  via: string,
  organizationCount: number
): Promise<void> {
  await query('DELETE FROM organization_users WHERE user_id = $1 AND organization_id = $2', [
    userId,
    orgId,
  ]);
  invalidateOrgMembershipCache(userId, orgId);
  await auditScim(
    req,
    orgId,
    'scim.user.deactivated',
    userId,
    `${via}: membership removed from this organization; the account remains active for its other organisations`,
    { membershipRemoved: true, accountStatusUnchanged: true, organizationCount }
  );
}

// ─── ServiceProviderConfig ───────────────────────────────────────────────────

// ─── Tenant lifecycle: provisioning stops, deprovisioning never does ─────────
//
// SCIM is mounted at /scim/v2 — OUTSIDE /api — with its own bearer token, so the
// lifecycle guard (middleware/tenantLifecycleGuard.ts) never runs for it. That
// left a suspended organization's IdP able to keep CREATING users on a tenancy
// nobody is paying for and nobody may log into.
//
// The correct behaviour is ASYMMETRIC, which is why it is a decision rather than
// a copy of the HTTP rule:
//
//   PROVISIONING (create / activate) STOPS. Adding a seat to a suspended tenant
//   grows something that cannot be used and, on a seat-licensed product, cannot
//   be billed.
//
//   DEPROVISIONING (delete / deactivate) ALWAYS CONTINUES. An IdP removing a
//   user is a SECURITY action — the offboarding of a departed employee, or the
//   response to a compromised account. Blocking it because the tenant is behind
//   on an invoice would turn a billing state into a security incident. It is
//   also the direction an administrator reaches for during the suspension.
//
//   READS always continue: an IdP reconciling its view changes nothing, and
//   read_only tenants keep read access everywhere else by design.
//
// Reversible without a deploy: SCIM_PROVISIONING_ON_SUSPENDED_TENANT=allow
// restores the old behaviour. The default is `block` because that is the
// defensible position, but this is a product judgement and the operator gets to
// override it.
function scimProvisioningBlocked(): boolean {
  return (process.env.SCIM_PROVISIONING_ON_SUSPENDED_TENANT ?? '').trim().toLowerCase() !== 'allow';
}

/**
 * Refuse a PROVISIONING request when the tenant is not entitled to operate.
 * Never applied to DELETE or to a deactivating PATCH — see the note above.
 *
 * Uses the background-work rule (`allow` only), not the HTTP rule: a read_only
 * tenant must not gain seats either, and there is no "safe verb" here — every
 * route this guards creates or re-activates something.
 */
async function refuseIfNotEntitled(req: Request, res: Response): Promise<boolean> {
  if (!scimProvisioningBlocked()) return false;
  const orgId = orgOf(req);
  if (!Number.isFinite(orgId) || orgId <= 0) return false;
  if (await shouldProcessTenantInBackground(orgId)) return false;
  logger.warn('SCIM provisioning refused — organization is not entitled', { orgId });
  scimError(
    res,
    403,
    'This organization is not active. User provisioning is suspended; ' +
      'deprovisioning remains available.'
  );
  return true;
}

router.get('/ServiceProviderConfig', scimAuth, (req: Request, res: Response) => {
  res.json({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
    documentationUri: `${baseUrl(req)}/docs/scim`,
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: 'oauthbearertoken',
        name: 'OAuth Bearer Token',
        description: 'Authentication via the SCIM bearer token.',
      },
    ],
    meta: { resourceType: 'ServiceProviderConfig', location: `${baseUrl(req)}/scim/v2/ServiceProviderConfig` },
  });
});

// ─── Users: list ─────────────────────────────────────────────────────────────

router.get('/Users', scimAuth, async (req: Request, res: Response) => {
  try {
    const orgId = orgOf(req);
    const startIndex = Math.max(1, Number(req.query.startIndex) || 1);
    const count = Math.min(200, Math.max(0, Number(req.query.count) || 100));
    const offset = startIndex - 1;

    // Only the `userName eq "x"` filter is supported (IdPs use it to dedupe).
    let emailFilter: string | null = null;
    const filter = req.query.filter as string | undefined;
    if (filter) {
      const m = /^\s*userName\s+eq\s+"([^"]+)"\s*$/i.exec(filter);
      if (!m) {
        return scimError(res, 400, `Unsupported filter: ${filter}`, 'invalidFilter');
      }
      emailFilter = m[1].toLowerCase();
    }

    const params: unknown[] = [orgId];
    let where = 'ou.organization_id = $1';
    if (emailFilter) {
      params.push(emailFilter);
      where += ` AND lower(u.email) = $${params.length}`;
    }

    const totalRes = await query(
      `SELECT COUNT(*)::int AS total FROM users u
         JOIN organization_users ou ON ou.user_id = u.id
        WHERE ${where}`,
      params
    );
    const totalResults = Number(totalRes.rows[0]?.total ?? 0);

    const pageParams = params.slice();
    pageParams.push(count, offset);
    const rows = await query(
      `SELECT u.id, u.email, u.name, u.status, u.created_at, u.updated_at
         FROM users u JOIN organization_users ou ON ou.user_id = u.id
        WHERE ${where}
        ORDER BY u.id ASC
        LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
      pageParams
    );

    res.json({
      schemas: [LIST_SCHEMA],
      totalResults,
      startIndex,
      itemsPerPage: rows.rows.length,
      Resources: rows.rows.map((r: UserRow) => toScimUser(req, r)),
    });
  } catch (err) {
    logger.error('SCIM list users failed', err as Record<string, unknown>);
    return scimError(res, 500, 'Failed to list users.');
  }
});

// ─── Users: get one ──────────────────────────────────────────────────────────

router.get('/Users/:id', scimAuth, async (req: Request, res: Response) => {
  try {
    const orgId = orgOf(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return scimError(res, 404, 'User not found.');

    const result = await query(
      `SELECT u.id, u.email, u.name, u.status, u.created_at, u.updated_at
         FROM users u JOIN organization_users ou ON ou.user_id = u.id AND ou.organization_id = $1
        WHERE u.id = $2`,
      [orgId, id]
    );
    if (!result.rows.length) return scimError(res, 404, 'User not found.');
    res.json(toScimUser(req, result.rows[0] as UserRow));
  } catch (err) {
    logger.error('SCIM get user failed', err as Record<string, unknown>);
    return scimError(res, 500, 'Failed to get user.');
  }
});

// ─── Users: create (JIT provision + membership) ──────────────────────────────

interface ScimUserBody {
  userName?: string;
  emails?: Array<{ value?: string; primary?: boolean }>;
  name?: { formatted?: string; givenName?: string; familyName?: string };
  displayName?: string;
  active?: boolean;
}

function resolveEmail(body: ScimUserBody): string | null {
  if (typeof body.userName === 'string' && body.userName.includes('@')) {
    return body.userName.toLowerCase().trim();
  }
  const primary = body.emails?.find(e => e.primary)?.value ?? body.emails?.[0]?.value;
  return typeof primary === 'string' ? primary.toLowerCase().trim() : null;
}

/** The name the body asks for, or null when the body carries no name at all. */
function requestedName(body: ScimUserBody): string | null {
  if (body.name?.formatted) return body.name.formatted;
  const composed = [body.name?.givenName, body.name?.familyName].filter(Boolean).join(' ');
  if (composed) return composed;
  if (body.displayName) return body.displayName;
  return null;
}

function resolveName(body: ScimUserBody, email: string): string {
  return requestedName(body) ?? email.split('@')[0];
}

router.post('/Users', scimAuth, async (req: Request, res: Response) => {
  try {
    if (await refuseIfNotEntitled(req, res)) return;
    const orgId = orgOf(req);
    const body = (req.body ?? {}) as ScimUserBody;
    const email = resolveEmail(body);
    if (!email) return scimError(res, 400, 'userName/email is required.', 'invalidValue');

    const status = body.active === false ? 'inactive' : 'active';
    const name = resolveName(body, email);

    const created = await transaction(async (client) => {
      const existing = await client.query('SELECT id FROM users WHERE lower(email) = $1', [email]);
      let userId: number;
      let existingAccount = false;
      if (existing.rows.length) {
        userId = existing.rows[0].id as number;
        existingAccount = true;
        // Already provisioned into THIS org? → SCIM uniqueness conflict.
        const member = await client.query(
          'SELECT 1 FROM organization_users WHERE user_id = $1 AND organization_id = $2',
          [userId, orgId]
        );
        if (member.rows.length) return { conflict: true as const, userId };
        // An existing account keeps its status and name: this tenant is adding
        // a membership to an identity it does not own. Writing `status` here
        // let an IdP re-activate a platform-suspended account by re-provisioning
        // it (IAM-05). The 201 below reflects the STORED status.
      } else {
        const ins = await client.query(
          `INSERT INTO users (email, name, password_hash, status)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [email, name, `scim:${crypto.randomUUID()}`, status]
        );
        userId = ins.rows[0].id as number;
      }
      await client.query(
        `INSERT INTO organization_users (organization_id, user_id, role)
         VALUES ($1, $2, 'member')
         ON CONFLICT (user_id, organization_id) DO NOTHING`,
        [orgId, userId]
      );
      return { conflict: false as const, userId, existingAccount };
    });

    if (created.conflict) {
      return scimError(res, 409, 'User already provisioned in this organization.', 'uniqueness');
    }

    const row = await query(
      'SELECT id, email, name, status, created_at, updated_at FROM users WHERE id = $1',
      [created.userId]
    );
    const storedStatus = String((row.rows[0] as UserRow | undefined)?.status ?? '');
    if (created.existingAccount && storedStatus !== 'active') {
      logger.info('SCIM provision joined an existing account whose status is not active; status unchanged', {
        orgId,
        userId: created.userId,
        storedStatus,
      });
    }
    await auditScim(req, orgId, 'scim.user.provisioned', created.userId, 'Provisioned via SCIM', {
      email,
      existingAccount: created.existingAccount,
    });
    res
      .status(201)
      .location(`${baseUrl(req)}/scim/v2/Users/${created.userId}`)
      .json(toScimUser(req, row.rows[0] as UserRow));
  } catch (err) {
    logger.error('SCIM create user failed', err as Record<string, unknown>);
    return scimError(res, 500, 'Failed to create user.');
  }
});

// ─── Users: replace (PUT) ────────────────────────────────────────────────────

router.put('/Users/:id', scimAuth, async (req: Request, res: Response) => {
  try {
    if (await refuseIfNotEntitled(req, res)) return;
    const orgId = orgOf(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return scimError(res, 404, 'User not found.');
    const body = (req.body ?? {}) as ScimUserBody;

    const member = await query(
      'SELECT u.email, u.name, u.status FROM users u JOIN organization_users ou ON ou.user_id = u.id AND ou.organization_id = $1 WHERE u.id = $2',
      [orgId, id]
    );
    if (!member.rows.length) return scimError(res, 404, 'User not found.');
    const stored = member.rows[0] as { email: string; name: string | null; status: string };

    const status = body.active === false ? 'inactive' : 'active';
    const scope = await membershipScope(id);
    let deprovisionedHere = false;

    if (scope.soleOrg) {
      const name = resolveName(body, stored.email);
      await query('UPDATE users SET name = $1, status = $2, updated_at = now() WHERE id = $3', [
        name,
        status,
        id,
      ]);
      if (status === 'inactive') invalidateOrgMembershipCache(id, orgId);
      if (status !== stored.status) {
        await auditScim(
          req,
          orgId,
          status === 'inactive' ? 'scim.user.deactivated' : 'scim.user.activated',
          id,
          `SCIM replace set active=${status === 'active'}`
        );
      }
    } else {
      // Shared account: this tenant's effects stop at its own membership.
      // Compared against the STORED name so a full-profile replace that carries
      // the unchanged name (Okta's deactivation shape) is not turned into a
      // refusal; only an actual rename is.
      const requested = requestedName(body);
      if (requested !== null && requested !== (stored.name ?? '')) {
        return scimError(res, 403, SHARED_NAME_DETAIL, 'mutability');
      }
      if (status === 'inactive') {
        await removeMembership(req, orgId, id, 'SCIM replace set active=false', scope.orgCount);
        deprovisionedHere = true;
      } else if (stored.status !== 'active') {
        logger.info(
          'SCIM activate ignored — account status is platform-wide and the user belongs to other organisations',
          { orgId, userId: id, storedStatus: stored.status, organizationCount: scope.orgCount }
        );
      }
    }

    const row = await query(
      'SELECT id, email, name, status, created_at, updated_at FROM users WHERE id = $1',
      [id]
    );
    const resource = toScimUser(req, row.rows[0] as UserRow);
    // The membership is gone: in THIS tenant the user is no longer active,
    // whatever the global row says for the user's other organisations.
    if (deprovisionedHere) resource.active = false;
    res.json(resource);
  } catch (err) {
    logger.error('SCIM replace user failed', err as Record<string, unknown>);
    return scimError(res, 500, 'Failed to replace user.');
  }
});

// ─── Users: patch (active toggle / name) — the deprovision path ──────────────

interface PatchOp {
  op?: string;
  path?: string;
  value?: unknown;
}

router.patch('/Users/:id', scimAuth, async (req: Request, res: Response) => {
  try {
    const orgId = orgOf(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return scimError(res, 404, 'User not found.');

    const member = await query(
      'SELECT u.name, u.status FROM users u JOIN organization_users ou ON ou.user_id = u.id AND ou.organization_id = $1 WHERE u.id = $2',
      [orgId, id]
    );
    if (!member.rows.length) return scimError(res, 404, 'User not found.');
    const stored = member.rows[0] as { name: string | null; status: string };

    const ops = ((req.body?.Operations ?? []) as PatchOp[]) || [];
    let nextStatus: string | null = null;
    let nextName: string | null = null;

    for (const op of ops) {
      if ((op.op ?? '').toLowerCase() !== 'replace' && (op.op ?? '').toLowerCase() !== 'add') continue;
      const path = (op.path ?? '').toLowerCase();
      if (path === 'active') {
        nextStatus = op.value === false || op.value === 'false' ? 'inactive' : 'active';
      } else if (path === 'displayname' || path === 'name.formatted') {
        if (typeof op.value === 'string') nextName = op.value;
      } else if (!op.path && op.value && typeof op.value === 'object') {
        const v = op.value as ScimUserBody;
        if (typeof v.active === 'boolean') nextStatus = v.active ? 'active' : 'inactive';
        if (v.displayName) nextName = v.displayName;
        if (v.name?.formatted) nextName = v.name.formatted;
      }
    }

    // Only an ACTIVATING patch is provisioning. A deactivating one — and a pure
    // rename — must go through even on a suspended tenant, for the reason in the
    // note above: deprovisioning is a security action, not a billable one.
    if (nextStatus === 'active' && (await refuseIfNotEntitled(req, res))) return;

    let deprovisionedHere = false;

    if (nextStatus !== null || nextName !== null) {
      const scope = await membershipScope(id);

      if (scope.soleOrg) {
        const sets: string[] = [];
        const params: unknown[] = [];
        if (nextName !== null) {
          params.push(nextName);
          sets.push(`name = $${params.length}`);
        }
        if (nextStatus !== null) {
          params.push(nextStatus);
          sets.push(`status = $${params.length}`);
        }
        params.push(id);
        await query(
          `UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`,
          params
        );
        if (nextStatus === 'inactive') invalidateOrgMembershipCache(id, orgId);
        if (nextStatus !== null) {
          await auditScim(
            req,
            orgId,
            nextStatus === 'inactive' ? 'scim.user.deactivated' : 'scim.user.activated',
            id,
            `SCIM patch set active=${nextStatus === 'active'}`
          );
        }
      } else {
        // Shared account: this tenant's effects stop at its own membership.
        // An op that restates the stored name is not a rename.
        if (nextName !== null && nextName !== (stored.name ?? '')) {
          return scimError(res, 403, SHARED_NAME_DETAIL, 'mutability');
        }
        if (nextStatus === 'inactive') {
          await removeMembership(req, orgId, id, 'SCIM patch set active=false', scope.orgCount);
          deprovisionedHere = true;
        } else if (nextStatus === 'active') {
          // Nothing is written, so nothing claims to have been: no audit row.
          logger.info(
            'SCIM activate ignored — account status is platform-wide and the user belongs to other organisations',
            { orgId, userId: id, storedStatus: stored.status, organizationCount: scope.orgCount }
          );
        }
      }
    }

    const row = await query(
      'SELECT id, email, name, status, created_at, updated_at FROM users WHERE id = $1',
      [id]
    );
    const resource = toScimUser(req, row.rows[0] as UserRow);
    // The membership is gone: in THIS tenant the user is no longer active,
    // whatever the global row says for the user's other organisations.
    if (deprovisionedHere) resource.active = false;
    res.json(resource);
  } catch (err) {
    logger.error('SCIM patch user failed', err as Record<string, unknown>);
    return scimError(res, 500, 'Failed to patch user.');
  }
});

// ─── Users: deactivate (DELETE → soft) ───────────────────────────────────────

router.delete('/Users/:id', scimAuth, async (req: Request, res: Response) => {
  try {
    const orgId = orgOf(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return scimError(res, 404, 'User not found.');

    const member = await query(
      'SELECT 1 FROM users u JOIN organization_users ou ON ou.user_id = u.id AND ou.organization_id = $1 WHERE u.id = $2',
      [orgId, id]
    );
    if (!member.rows.length) return scimError(res, 404, 'User not found.');

    const scope = await membershipScope(id);
    if (scope.soleOrg) {
      // SCIM delete = deactivate (the user record is retained; access is revoked).
      await query("UPDATE users SET status = 'inactive', updated_at = now() WHERE id = $1", [id]);
      invalidateOrgMembershipCache(id, orgId);
      await auditScim(req, orgId, 'scim.user.deactivated', id, 'Deactivated via SCIM DELETE (offboarding)');
    } else {
      // The user belongs to other organisations: revoke THIS tenant's access
      // only. `users.status` is not this tenant's to write.
      await removeMembership(req, orgId, id, 'SCIM DELETE (offboarding)', scope.orgCount);
    }
    res.status(204).send();
  } catch (err) {
    logger.error('SCIM delete user failed', err as Record<string, unknown>);
    return scimError(res, 500, 'Failed to deactivate user.');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUPS (mapped to org RBAC roles)
// ═══════════════════════════════════════════════════════════════════════════════

interface GroupMemberRow {
  id: number;
  email: string;
  name: string | null;
}

function toScimGroup(req: Request, role: string, members: GroupMemberRow[]): Record<string, unknown> {
  return {
    schemas: [GROUP_SCHEMA],
    id: role,
    displayName: role.charAt(0).toUpperCase() + role.slice(1),
    members: members.map(m => ({
      value: String(m.id),
      display: m.email,
      $ref: `${baseUrl(req)}/scim/v2/Users/${m.id}`,
    })),
    meta: { resourceType: 'Group', location: `${baseUrl(req)}/scim/v2/Groups/${role}` },
  };
}

async function membersOfRole(orgId: number, role: string): Promise<GroupMemberRow[]> {
  const result = await query(
    `SELECT u.id, u.email, u.name
       FROM users u JOIN organization_users ou ON ou.user_id = u.id
      WHERE ou.organization_id = $1 AND ou.role = $2
      ORDER BY u.id ASC`,
    [orgId, role]
  );
  return result.rows as GroupMemberRow[];
}

/** Extract member user-ids from a SCIM group PatchOp (value array/object or path filter). */
function extractMemberIds(op: PatchOp): number[] {
  const ids: number[] = [];
  if (typeof op.path === 'string') {
    const m = /members\[value eq "([^"]+)"\]/i.exec(op.path);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) ids.push(n);
    }
  }
  const val = op.value;
  if (Array.isArray(val)) {
    for (const v of val) {
      const n = Number((v as { value?: unknown })?.value);
      if (Number.isFinite(n)) ids.push(n);
    }
  } else if (val && typeof val === 'object') {
    const n = Number((val as { value?: unknown }).value);
    if (Number.isFinite(n)) ids.push(n);
  }
  return ids;
}

router.get('/Groups', scimAuth, async (req: Request, res: Response) => {
  try {
    const orgId = orgOf(req);
    let roles: string[] = [...VALID_ROLES];
    const filter = req.query.filter as string | undefined;
    if (filter) {
      const m = /^\s*displayName\s+eq\s+"([^"]+)"\s*$/i.exec(filter);
      if (!m) return scimError(res, 400, `Unsupported filter: ${filter}`, 'invalidFilter');
      const wanted = m[1].toLowerCase();
      roles = roles.filter(r => r === wanted);
    }

    const resources: Record<string, unknown>[] = [];
    for (const role of roles) {
      resources.push(toScimGroup(req, role, await membersOfRole(orgId, role)));
    }

    res.json({
      schemas: [LIST_SCHEMA],
      totalResults: resources.length,
      startIndex: 1,
      itemsPerPage: resources.length,
      Resources: resources,
    });
  } catch (err) {
    logger.error('SCIM list groups failed', err as Record<string, unknown>);
    return scimError(res, 500, 'Failed to list groups.');
  }
});

router.get('/Groups/:id', scimAuth, async (req: Request, res: Response) => {
  try {
    const orgId = orgOf(req);
    const role = String(req.params.id).toLowerCase();
    if (!isValidRole(role)) return scimError(res, 404, 'Group not found.');
    res.json(toScimGroup(req, role, await membersOfRole(orgId, role)));
  } catch (err) {
    logger.error('SCIM get group failed', err as Record<string, unknown>);
    return scimError(res, 500, 'Failed to get group.');
  }
});

router.patch('/Groups/:id', scimAuth, async (req: Request, res: Response) => {
  try {
    const orgId = orgOf(req);
    const role = String(req.params.id).toLowerCase();
    if (!isValidRole(role)) return scimError(res, 404, 'Group not found.');

    const ops = ((req.body?.Operations ?? []) as PatchOp[]) || [];
    for (const op of ops) {
      const action = (op.op ?? '').toLowerCase();
      const memberIds = extractMemberIds(op);
      if (memberIds.length === 0) continue;

      if (action === 'add' || action === 'replace') {
        // Assign the group's role to existing org members (never cross-tenant).
        for (const uid of memberIds) {
          await query(
            'UPDATE organization_users SET role = $1, updated_at = now() WHERE organization_id = $2 AND user_id = $3',
            [role, orgId, uid]
          );
        }
      } else if (action === 'remove') {
        // Removing from a role-group demotes the user to the baseline 'member'
        // role (only if they currently hold this group's role).
        for (const uid of memberIds) {
          await query(
            "UPDATE organization_users SET role = 'member', updated_at = now() WHERE organization_id = $1 AND user_id = $2 AND role = $3",
            [orgId, uid, role]
          );
        }
      }
    }

    res.json(toScimGroup(req, role, await membersOfRole(orgId, role)));
  } catch (err) {
    logger.error('SCIM patch group failed', err as Record<string, unknown>);
    return scimError(res, 500, 'Failed to patch group.');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DISCOVERY (ResourceTypes, Schemas) — IdPs query these during setup
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/ResourceTypes', scimAuth, (req: Request, res: Response) => {
  const rt = (id: string, endpoint: string, schema: string) => ({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
    id,
    name: id,
    endpoint,
    schema,
    meta: { resourceType: 'ResourceType', location: `${baseUrl(req)}/scim/v2/ResourceTypes/${id}` },
  });
  const resources = [rt('User', '/Users', USER_SCHEMA), rt('Group', '/Groups', GROUP_SCHEMA)];
  res.json({ schemas: [LIST_SCHEMA], totalResults: resources.length, Resources: resources });
});

router.get('/Schemas', scimAuth, (_req: Request, res: Response) => {
  const resources = [
    { id: USER_SCHEMA, name: 'User', description: 'SCIM core User resource.' },
    {
      id: GROUP_SCHEMA,
      name: 'Group',
      description: 'SCIM core Group resource, mapped to organization RBAC roles.',
    },
  ];
  res.json({ schemas: [LIST_SCHEMA], totalResults: resources.length, Resources: resources });
});

export default router;
