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
 * patch-active, deactivate) + ServiceProviderConfig. Groups are out of scope
 * for this core.
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
const LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
const ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error';

interface ScimConfig {
  token: string;
  orgId: number;
}

function getScimConfig(): ScimConfig | null {
  const token = process.env.SCIM_BEARER_TOKEN;
  const orgId = Number(process.env.SCIM_ORG_ID);
  if (!token || !Number.isFinite(orgId)) return null;
  return { token, orgId };
}

function scimError(res: Response, status: number, detail: string, scimType?: string): Response {
  return res.status(status).json({
    schemas: [ERROR_SCHEMA],
    status: String(status),
    ...(scimType ? { scimType } : {}),
    detail,
  });
}

/** Constant-time bearer-token check; sets req-local org on success. */
function scimAuth(req: Request, res: Response, next: NextFunction): Response | void {
  const config = getScimConfig();
  if (!config) return scimError(res, 503, 'SCIM provisioning is not configured.');

  const header = req.headers.authorization ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) return scimError(res, 401, 'Missing or malformed bearer token.');

  const provided = Buffer.from(match[1]);
  const expected = Buffer.from(config.token);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return scimError(res, 401, 'Invalid bearer token.');
  }
  (req as Request & { scimOrgId?: number }).scimOrgId = config.orgId;
  next();
}

function orgOf(req: Request): number {
  return (req as Request & { scimOrgId?: number }).scimOrgId as number;
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
    res.status(204).send();
  } catch (err) {
    logger.error('SCIM delete user failed', err as Record<string, unknown>);
    return scimError(res, 500, 'Failed to deactivate user.');
  }
});

export default router;
