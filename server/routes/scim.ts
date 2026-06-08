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
 * org is a fixed deployment constant, not request-derived.
 *
 * Scope: Users (list w/ userName filter + pagination, create, get, replace,
 * patch-active, deactivate), Groups (RBAC-role-mapped: list/get/patch
 * membership), and discovery (ServiceProviderConfig, ResourceTypes, Schemas).
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { query, transaction } from '../db';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('scim');
const router = Router();

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
function scimAuth(req: Request, res: Response, next: NextFunction): Response | void {
  const tenants = loadScimTenants();
  if (tenants.length === 0) return scimError(res, 503, 'SCIM provisioning is not configured.');

  const header = req.headers.authorization ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) return scimError(res, 401, 'Missing or malformed bearer token.');

  const provided = Buffer.from(match[1]);
  let matchedOrgId: number | null = null;
  for (const tenant of tenants) {
    const expected = Buffer.from(tenant.token);
    const ok = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
    if (ok) matchedOrgId = tenant.orgId;
  }
  if (matchedOrgId === null) return scimError(res, 401, 'Invalid bearer token.');

  (req as Request & { scimOrgId?: number }).scimOrgId = matchedOrgId;
  next();
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

function baseUrl(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return `${proto}://${host}`;
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

// ─── ServiceProviderConfig ───────────────────────────────────────────────────

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

function resolveName(body: ScimUserBody, email: string): string {
  if (body.name?.formatted) return body.name.formatted;
  const composed = [body.name?.givenName, body.name?.familyName].filter(Boolean).join(' ');
  if (composed) return composed;
  if (body.displayName) return body.displayName;
  return email.split('@')[0];
}

router.post('/Users', scimAuth, async (req: Request, res: Response) => {
  try {
    const orgId = orgOf(req);
    const body = (req.body ?? {}) as ScimUserBody;
    const email = resolveEmail(body);
    if (!email) return scimError(res, 400, 'userName/email is required.', 'invalidValue');

    const status = body.active === false ? 'inactive' : 'active';
    const name = resolveName(body, email);

    const created = await transaction(async (client) => {
      const existing = await client.query('SELECT id FROM users WHERE lower(email) = $1', [email]);
      let userId: number;
      if (existing.rows.length) {
        userId = existing.rows[0].id as number;
        // Already provisioned into THIS org? → SCIM uniqueness conflict.
        const member = await client.query(
          'SELECT 1 FROM organization_users WHERE user_id = $1 AND organization_id = $2',
          [userId, orgId]
        );
        if (member.rows.length) return { conflict: true as const, userId };
        await client.query('UPDATE users SET status = $1, updated_at = now() WHERE id = $2', [
          status,
          userId,
        ]);
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
      return { conflict: false as const, userId };
    });

    if (created.conflict) {
      return scimError(res, 409, 'User already provisioned in this organization.', 'uniqueness');
    }

    const row = await query(
      'SELECT id, email, name, status, created_at, updated_at FROM users WHERE id = $1',
      [created.userId]
    );
    await auditScim(req, orgId, 'scim.user.provisioned', created.userId, 'Provisioned via SCIM', {
      email,
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
    const orgId = orgOf(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return scimError(res, 404, 'User not found.');
    const body = (req.body ?? {}) as ScimUserBody;

    const member = await query(
      'SELECT u.email FROM users u JOIN organization_users ou ON ou.user_id = u.id AND ou.organization_id = $1 WHERE u.id = $2',
      [orgId, id]
    );
    if (!member.rows.length) return scimError(res, 404, 'User not found.');

    const status = body.active === false ? 'inactive' : 'active';
    const name = resolveName(body, member.rows[0].email as string);
    await query('UPDATE users SET name = $1, status = $2, updated_at = now() WHERE id = $3', [
      name,
      status,
      id,
    ]);

    const row = await query(
      'SELECT id, email, name, status, created_at, updated_at FROM users WHERE id = $1',
      [id]
    );
    res.json(toScimUser(req, row.rows[0] as UserRow));
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
      'SELECT 1 FROM users u JOIN organization_users ou ON ou.user_id = u.id AND ou.organization_id = $1 WHERE u.id = $2',
      [orgId, id]
    );
    if (!member.rows.length) return scimError(res, 404, 'User not found.');

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

    if (nextStatus !== null || nextName !== null) {
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
    }

    if (nextStatus !== null) {
      await auditScim(
        req,
        orgId,
        nextStatus === 'inactive' ? 'scim.user.deactivated' : 'scim.user.activated',
        id,
        `SCIM patch set active=${nextStatus === 'active'}`
      );
    }

    const row = await query(
      'SELECT id, email, name, status, created_at, updated_at FROM users WHERE id = $1',
      [id]
    );
    res.json(toScimUser(req, row.rows[0] as UserRow));
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

    // SCIM delete = deactivate (the user record is retained; access is revoked).
    await query("UPDATE users SET status = 'inactive', updated_at = now() WHERE id = $1", [id]);
    await auditScim(req, orgId, 'scim.user.deactivated', id, 'Deactivated via SCIM DELETE (offboarding)');
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
