/**
 * The connector refuses an account that is out of use, and its tokens open
 * nothing but the connector (row D8; review 2026-09-22 finding #6; security
 * audit 2026-09-24 IAM-02, plan item P0-2 parts (a) and (c)).
 *
 * ── The defect this pins (reproduced 2026-09-25, before the fix) ─────────────
 * VSR-001 F-28/F-29 took a suspended or deprovisioned account out of use on
 * every first-party surface: it cannot sign, cannot sign in, and a session it
 * already holds ends at the next request (tests/db/account-standing.dbtest.ts).
 * The connector was not one of those surfaces. Its one verifier,
 * `verifyPlatformBearer`, called verifyJwtWithRotation directly and re-checked
 * the membership row, so it read neither the revocation list nor the account's
 * standing; the /token exchanges re-checked membership only. So:
 *
 *   · a session token the account held before its suspension, or one its
 *     holder had signed out, kept opening /mcp for the rest of its life, and
 *     could still be handed to the consent page to authorise a NEW client;
 *   · a connector grant made before the suspension kept working: the refresh
 *     token minted fresh access tokens for its whole 30-day life, rotating
 *     forward each time, so in practice for as long as the client kept asking;
 *   · an authorization code issued before the suspension still redeemed.
 *
 * `53b5545db` (2026-09-25) then made the membership read itself refuse an
 * account that is not active. That closed the suspended/deprovisioned half at
 * every door, but as "no longer a member" — the membership exists — and left
 * the signed-out session, the password change, and everything below. Re-run
 * on that trunk, this suite still failed 11 of 14.
 *
 * And, the other half of IAM-02: a connector-issued token is `type: 'access'`,
 * which every first-party authenticator accepts, so a token whose holder
 * consented to `c2c:read` was a full /api session.
 *
 * §11.10(d) limits system access to authorized individuals; §11.300(b) requires
 * that identification codes and passwords can be recalled. The connector is
 * system access, and a recall that stops at the connector recalls nothing.
 *
 * ── Posture ─────────────────────────────────────────────────────────────────
 * As account-standing.dbtest.ts: a freshly minted NOSUPERUSER NOBYPASSRLS
 * runtime role through APP_DATABASE_URL, RLS_ENFORCE=on. The connector is the
 * production router (createMcpRouter) on a real HTTP server, and the OAuth flow
 * is driven over HTTP the way a client drives it: /register, /authorize, the
 * consent POST, /token. The two /api authenticators are production's own:
 * authMiddleware (the global gate) and authenticateToken (a router's gate). An
 * account is taken out of use by the statement the admin route and the SCIM
 * route each run; a session is signed out by revokeToken, which is what
 * POST /api/auth/logout runs.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbd8": every organisation slug and every email starts `dbd8-`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { databaseUrl } from '../../../tests/setup.db';
import {
  provisionAppServiceRole,
  resolveAppServiceRole,
} from '../../../scripts/db/provision-app-role.mjs';

const TAG = 'dbd8';
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const RUNTIME_PASSWORD = 'dbd8-connector-standing-runtime-password';
const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `dbd8_rt_${RUN}` });

type Key = 'active' | 'suspended' | 'deprovisioned' | 'held' | 'signedOut';
interface Member {
  id: number;
  membershipId: number;
  email: string;
  /** A first-party session token, as POST /api/auth/login issues it. */
  session: string;
}

let owner: Pool;
let server: http.Server;
let baseUrl: string;
let resourceUrl: string;
let redirectUri: string;
let clientId: string;
let orgId: number;
let orgUuid: string;
let runtimePool: { query: Pool['query']; end: () => Promise<void> } | null = null;
const members = {} as Record<Key, Member>;

/** The statement server/routes/admin/master-admin.ts runs to suspend an account. */
const suspend = (m: Member) =>
  // tenant-isolation-safe: an account's own status in the global identity table, keyed by this suite's fixture user id
  owner.query(`UPDATE users SET status = 'suspended', updated_at = now() WHERE id = $1`, [m.id]);
/** The statement server/routes/scim.ts runs when the identity provider deprovisions it. */
const deprovision = (m: Member) =>
  // tenant-isolation-safe: an account's own status in the global identity table, keyed by this suite's fixture user id
  owner.query(`UPDATE users SET status = 'inactive', updated_at = now() WHERE id = $1`, [m.id]);
const reactivate = (m: Member) =>
  // tenant-isolation-safe: an account's own status in the global identity table, keyed by this suite's fixture user id
  owner.query(`UPDATE users SET status = 'active' WHERE id = $1`, [m.id]);

/** A body for an assertion message, every token and code in it redacted: evidence carries none. */
const shown = (body: unknown) =>
  JSON.stringify(body)
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<token>')
    .replace(/("(?:refresh_token|code)":")[^"]+/g, '$1<redacted>');

// ── The OAuth flow, driven over HTTP as a client drives it ───────────────────

function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

/** GET /authorize → the signed pending-authorization assertion the consent page carries. */
async function authorize(challenge: string): Promise<string> {
  const u = new URL('/authorize', baseUrl);
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('scope', 'c2c:read');
  u.searchParams.set('state', 'dbd8-state');
  u.searchParams.set('resource', resourceUrl);
  const res = await fetch(u, { redirect: 'manual' });
  const html = await res.text();
  expect(res.status, `GET /authorize did not render the consent page: ${res.status}`).toBe(200);
  const m = html.match(/name="request" value="([^"]+)"/);
  expect(m, 'the consent page carried no pending-authorization assertion').not.toBeNull();
  return m![1];
}

/** POST /oauth/consent, as the page's Allow button sends it. */
async function consent(assertion: string, sessionToken: string) {
  const res = await fetch(new URL('/oauth/consent', baseUrl), {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ request: assertion, access_token: sessionToken, decision: 'allow' }),
  });
  const location = res.headers.get('location');
  const code = location ? new URL(location).searchParams.get('code') : null;
  const body = res.status === 302 ? null : await res.json().catch(() => null);
  return { status: res.status, code, body };
}

async function token(params: Record<string, string>) {
  const res = await fetch(new URL('/token', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, ...params }),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

const exchangeCode = (code: string, verifier: string) =>
  token({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri, resource: resourceUrl });
const refresh = (refreshToken: string) => token({ grant_type: 'refresh_token', refresh_token: refreshToken });

/** A code the account's consent produced, and the verifier that redeems it. */
async function codeFor(m: Member): Promise<{ code: string; verifier: string }> {
  const { verifier, challenge } = pkce();
  const c = await consent(await authorize(challenge), m.session);
  expect(c.status, `consent refused an account in use: ${shown(c.body)}`).toBe(302);
  expect(c.code).toBeTruthy();
  return { code: c.code!, verifier };
}

/** The whole flow: authorize → consent → code exchange. */
async function grant(m: Member): Promise<{ access: string; refresh: string }> {
  const { code, verifier } = await codeFor(m);
  const t = await exchangeCode(code, verifier);
  expect(t.status, `the code exchange refused an account in use: ${shown(t.body)}`).toBe(200);
  return { access: String(t.body.access_token), refresh: String(t.body.refresh_token) };
}

/** POST /mcp initialize with a bearer; the status and the challenge the SDK sends on a refusal. */
async function mcp(bearer: string): Promise<{ status: number; challenge: string | null }> {
  const res = await fetch(resourceUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'dbd8', version: '1.0.0' } },
    }),
  });
  await res.body?.cancel().catch(() => {});
  return { status: res.status, challenge: res.headers.get('www-authenticate') };
}

async function api(path: string, bearer: string) {
  const res = await fetch(new URL(path, baseUrl), { headers: { Authorization: `Bearer ${bearer}` } });
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

// ── Fixture ──────────────────────────────────────────────────────────────────

async function cleanup(): Promise<void> {
  const orgs = (
    await owner.query(`SELECT id, uuid::text AS uuid FROM organizations WHERE slug LIKE $1`, [`${TAG}-%`])
  ).rows as Array<{ id: number; uuid: string }>;
  const ids = orgs.map((o) => o.id);
  if (ids.length > 0) {
    await owner.query('DELETE FROM mcp_oauth_refresh_tokens WHERE organization_id = ANY($1::int[])', [ids]);
    await owner.query('DELETE FROM mcp_oauth_authorization_codes WHERE organization_id = ANY($1::int[])', [ids]);
    await owner.query('DELETE FROM organization_users WHERE organization_id = ANY($1::int[])', [ids]);
  }
  await owner.query(`DELETE FROM mcp_oauth_clients WHERE client_name LIKE $1`, [`${TAG}-%`]);
  // tenant-isolation-safe: removes only this suite's fixture users, matched by the suite-unique TAG
  await owner.query('DELETE FROM users WHERE email LIKE $1', [`${TAG}-%@example.invalid`]);
  if (ids.length > 0) {
    await owner.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [ids]);
    // trg_sync_org_to_identity mirrors every organizations INSERT.
    await owner
      .query(`DELETE FROM identity.organizations WHERE id = ANY($1::uuid[]) AND created_by = 'c48-stage1-sync'`, [
        orgs.map((o) => o.uuid),
      ])
      .catch(() => {/* mirror absent or referenced: a harmless leftover */});
  }
}

/** A first-party session token: the claims and class POST /api/auth/login issues. */
function sessionToken(secret: string, m: { id: number; email: string }): string {
  return jwt.sign(
    {
      userId: String(m.id),
      email: m.email,
      organizationId: String(orgId),
      organizationUuid: orgUuid,
      role: 'admin',
      type: 'access',
    },
    secret,
    { expiresIn: '1h', algorithm: 'HS256' },
  );
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await cleanup();

  for (let attempt = 1; ; attempt++) {
    try {
      const provisioned = await provisionAppServiceRole(owner, {
        env: { APP_SERVICE_DB_ROLE: runtimeRole, APP_SERVICE_DB_PASSWORD: RUNTIME_PASSWORD },
      });
      if (provisioned.skipped) throw new Error('[dbd8] provisionAppServiceRole skipped — no runtime role.');
      break;
    } catch (err) {
      if (attempt >= 5 || !/tuple concurrently updated/.test((err as Error).message)) throw err;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  const runtimeUrl = new URL(databaseUrl);
  runtimeUrl.username = runtimeRole;
  runtimeUrl.password = RUNTIME_PASSWORD;
  process.env.APP_DATABASE_URL = runtimeUrl.toString();
  process.env.RLS_ENFORCE = 'on';
  process.env.ALLOW_DEV_AUTH = '0';

  const org = await owner.query(
    `INSERT INTO organizations (name, slug, tier, industry_mode, status)
     VALUES ($1, $1, 'free', 'biotech', 'active') RETURNING id, uuid::text AS uuid`,
    [`${TAG}-org-${RUN}`],
  );
  orgId = Number(org.rows[0].id);
  orgUuid = String(org.rows[0].uuid);

  const { activeJwtSecret } = await import('../../utils/jwtVerify');
  for (const key of ['active', 'suspended', 'deprovisioned', 'held', 'signedOut'] as Key[]) {
    const email = `${TAG}-${key}-${RUN}@example.invalid`;
    // tenant-isolation-safe: fixture user in a throw-away test database; `users` is global and tenancy is the organization_users row below
    const user = await owner.query(
      `INSERT INTO users (email, name, password_hash, default_organization_id) VALUES ($1, $2, 'not-a-real-hash', $3) RETURNING id`,
      [email, `Lane D8 ${key}`, orgId],
    );
    const id = Number(user.rows[0].id);
    const membership = await owner.query(
      `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'admin') RETURNING id`,
      [orgId, id],
    );
    // Issued while the account is in use, as every token an account holds was.
    members[key] = { id, membershipId: Number(membership.rows[0].id), email, session: sessionToken(activeJwtSecret(), { id, email }) };
  }

  const app = express();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  baseUrl = `http://localhost:${port}`;
  resourceUrl = `${baseUrl}/mcp`;
  redirectUri = `${baseUrl}/dbd8/callback`;

  const { createMcpRouter } = await import('../index');
  const { resolveMcpConfig } = await import('../config');
  app.use(createMcpRouter(resolveMcpConfig({ ...process.env, MCP_ENABLED: 'true', MCP_PUBLIC_URL: baseUrl })));

  // Production's two /api authenticators, each answering who it let through.
  const { authMiddleware } = await import('../../auth');
  const { authenticateToken } = await import('../../middleware/auth');
  const whoami = (req: express.Request, res: express.Response) =>
    res.json({ userId: (req as { user?: { id?: number } }).user?.id ?? null });
  app.get('/api/dbd8/whoami', authMiddleware, whoami);
  app.get('/dbd8/router-gate', authenticateToken, whoami);
  // As production's terminal handler does, a thrown error is logged, not swallowed:
  // a 500 in this suite must say what threw.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[dbd8] unhandled route error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'server_error' });
  });

  const { getPool } = await import('../../db');
  runtimePool = getPool() as unknown as typeof runtimePool;

  // Registered once, as a connector client registers itself (RFC 7591).
  const reg = await fetch(new URL('/register', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: `${TAG}-client-${RUN}`,
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    }),
  });
  const registered = (await reg.json()) as { client_id?: string };
  expect(reg.status, shown(registered)).toBe(201);
  clientId = registered.client_id!;

  // Taken out of use AFTER their session was issued, as happens in life.
  await suspend(members.suspended);
  await deprovision(members.deprovisioned);
  const { revokeToken } = await import('../../services/token-revocation');
  await revokeToken(members.signedOut.session, 'logout');
}, 180_000);

afterAll(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  if (runtimePool) await runtimePool.end().catch(() => {});
  if (owner) {
    await cleanup().catch((err) => console.warn('[dbd8] cleanup left rows:', err?.message));
    for (let attempt = 1; ; attempt++) {
      try {
        await owner.query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`);
        await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
        break;
      } catch (err) {
        if (attempt >= 5) {
          console.warn('[dbd8] runtime role left behind:', (err as Error).message);
          break;
        }
        await new Promise((r) => setTimeout(r, 250 * attempt));
      }
    }
    await owner.end();
  }
});

// ── The cases ────────────────────────────────────────────────────────────────

describe('the posture is the one production runs in', () => {
  it('connects as a non-superuser runtime role with RLS enforcing', async () => {
    const { runWithPreAuthScope } = await import('../../db/tenantStore');
    const { rows } = await runWithPreAuthScope('dbd8:posture', () =>
      runtimePool!.query(
        `SELECT current_user AS role, r.rolsuper, r.rolbypassrls, current_setting('app.rls_enforce', true) AS rls
           FROM pg_roles r WHERE r.rolname = current_user`,
      ),
    );
    expect(rows[0]).toMatchObject({ role: runtimeRole, rolsuper: false, rolbypassrls: false, rls: 'on' });
  });

  it('the accounts are in the states the admin route and SCIM leave them in', async () => {
    // tenant-isolation-safe: reads back only this suite's fixture users, matched by the suite-unique TAG
    const { rows } = await owner.query(`SELECT email, status FROM users WHERE email LIKE $1 ORDER BY id`, [`${TAG}-%`]);
    expect(rows.map((r) => [String(r.email).split('-')[1], r.status])).toEqual([
      ['active', 'active'],
      ['suspended', 'suspended'],
      ['deprovisioned', 'inactive'],
      ['held', 'active'],
      ['signedOut', 'active'],
    ]);
  });
});

describe('an account in use connects (the control every refusal below is read against)', () => {
  it('its session opens /mcp, authorises a client, and the grant opens /mcp and refreshes', async () => {
    const m = members.active;
    expect((await mcp(m.session)).status).toBe(200);
    const g = await grant(m);
    expect((await mcp(g.access)).status).toBe(200);
    const r = await refresh(g.refresh);
    expect(r.status, shown(r.body)).toBe(200);
    expect((await mcp(String(r.body.access_token))).status).toBe(200);
  });

  it('the grant runs a tool as the runtime role, not only the handshake', async () => {
    // mcp-connector.dbtest.ts proves the tools' tenant scoping, but as the
    // database owner, a superuser, which RLS never binds. This is the same
    // call as the role production connects as.
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
    const g = await grant(members.active);
    const client = new Client({ name: 'dbd8', version: '1.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(resourceUrl), {
        requestInit: { headers: { Authorization: `Bearer ${g.access}` } },
      }),
    );
    try {
      const listed = (await client.callTool({ name: 'c2c_list_projects', arguments: {} })) as {
        isError?: boolean;
        content: Array<{ text?: string }>;
      };
      expect(listed.isError, `c2c_list_projects failed as the runtime role: ${listed.content[0]?.text}`).toBeFalsy();
    } finally {
      await client.close();
    }
  });
});

describe('a session the account held before it was taken out of use (finding #6)', () => {
  for (const key of ['suspended', 'deprovisioned'] as const) {
    it(`${key}: the session no longer opens /mcp, and says why`, async () => {
      const res = await mcp(members[key].session);
      expect(res.status, `a ${key} account's session still opened the connector`).toBe(401);
      expect(res.challenge).toMatch(/invalid_token/);
      expect(res.challenge).toMatch(/not active/);
    });

    it(`${key}: the session cannot authorise a new client at the consent page, and is told why`, async () => {
      const { challenge } = pkce();
      const c = await consent(await authorize(challenge), members[key].session);
      expect(c.status, `a ${key} account's session authorised a connector client: ${shown(c.body)}`).toBe(401);
      expect(c.code, 'an authorization code was issued').toBeNull();
      // Not "sign in again": signing in cannot help an account out of use.
      expect((c.body as { error_description?: string } | null)?.error_description).toMatch(/not active/);
    });
  }
});

describe('a session its holder signed out', () => {
  it('no longer opens /mcp', async () => {
    const res = await mcp(members.signedOut.session);
    expect(res.status, 'a signed-out session still opened the connector').toBe(401);
    expect(res.challenge).toMatch(/invalid_token/);
  });

  it('cannot authorise a new client at the consent page', async () => {
    const { challenge } = pkce();
    const c = await consent(await authorize(challenge), members.signedOut.session);
    expect(c.status, `a signed-out session authorised a connector client: ${shown(c.body)}`).toBe(401);
    expect(c.code).toBeNull();
  });
});

describe('a connector grant made while the account was in use', () => {
  for (const [label, takeOutOfUse] of [
    ['suspended', suspend],
    ['deprovisioned', deprovision],
  ] as const) {
    it(`ends when the account is ${label}: the access token, the refresh token and an unredeemed code`, async () => {
      const m = members.held;
      const g = await grant(m);
      const pending = await codeFor(m);
      expect((await mcp(g.access)).status).toBe(200);

      await takeOutOfUse(m);
      try {
        const access = await mcp(g.access);
        expect(access.status, `a ${label} account's connector token still opened /mcp`).toBe(401);
        expect(access.challenge).toMatch(/not active/);

        const r = await refresh(g.refresh);
        expect(r.status, `a ${label} account's refresh token minted a connector token: ${shown(r.body)}`).toBe(400);
        expect(r.body.error).toBe('invalid_grant');
        expect(r.body.access_token).toBeUndefined();
        // The true reason. The membership still exists; the account is what is out
        // of use, and a client told otherwise is sent to the wrong administrator.
        expect(r.body.error_description).toMatch(/not active/);

        const c = await exchangeCode(pending.code, pending.verifier);
        expect(c.status, `a code issued before the account was ${label} still redeemed: ${shown(c.body)}`).toBe(400);
        expect(c.body.error).toBe('invalid_grant');
        expect(c.body.access_token).toBeUndefined();
        expect(c.body.error_description).toMatch(/not active/);
      } finally {
        await reactivate(m);
      }

      // The refusal was the account's standing and nothing else: once the
      // account is back in use, the same grant works again. A suspension is
      // reversible, and refusing it did not quietly destroy the grant.
      const back = await refresh(g.refresh);
      expect(back.status, `the grant did not work again after reactivation: ${shown(back.body)}`).toBe(200);
    });
  }
});

/*
 * Product decision 2026-10-01 (docs/LAUNCH_DEFINITION_OF_DONE.md): a password
 * change ends every connector grant authorised before it. In a regulated tenant
 * a password is changed most often because it may be known to someone else,
 * and a grant authorised with it is a credential derived from it; without this
 * the remedy left that credential minting access for 30 days (§11.300(b), (d)).
 */
describe('a password change ends the connector grants authorised before it', () => {
  /** The statement a password change or reset leaves behind (users.password_changed_at, UTC). */
  const changePassword = (m: Member) =>
    // tenant-isolation-safe: an account's own password-change stamp in the global identity table, keyed by this suite's fixture user id
    owner.query(`UPDATE users SET password_changed_at = (now() AT TIME ZONE 'utc') WHERE id = $1`, [m.id]);

  it('refuses the access token, the refresh token and an unredeemed code, says why, and a fresh sign-in connects again', async () => {
    const m = members.held;
    const g = await grant(m);
    const pending = await codeFor(m);
    expect((await mcp(g.access)).status).toBe(200);

    // Whole seconds on both sides (sessionPredatesPasswordChange): the change
    // lands in a later second than the authorisation, as it does in life.
    await new Promise((r) => setTimeout(r, 1100));
    await changePassword(m);
    try {
      const access = await mcp(g.access);
      expect(access.status, 'a connector token issued before the password change still opened /mcp').toBe(401);

      const r = await refresh(g.refresh);
      expect(r.status, `a grant authorised before the password change still refreshed: ${shown(r.body)}`).toBe(400);
      expect(r.body.error).toBe('invalid_grant');
      expect(r.body.error_description).toMatch(/password/i);
      expect(r.body.access_token).toBeUndefined();

      const c = await exchangeCode(pending.code, pending.verifier);
      expect(c.status, `a code issued before the password change still redeemed: ${shown(c.body)}`).toBe(400);
      expect(c.body.error).toBe('invalid_grant');
      expect(c.body.error_description).toMatch(/password/i);

      // The control: the holder signs in again with the new password and
      // connects again — the refusal was the change, not the account.
      const { activeJwtSecret } = await import('../../utils/jwtVerify');
      const fresh = { ...m, session: sessionToken(activeJwtSecret(), m) };
      const again = await grant(fresh);
      expect((await mcp(again.access)).status).toBe(200);
      const rotated = await refresh(again.refresh);
      expect(rotated.status, shown(rotated.body)).toBe(200);
    } finally {
      // tenant-isolation-safe: restores this suite's fixture user's stamp
      await owner.query(`UPDATE users SET password_changed_at = NULL WHERE id = $1`, [m.id]);
    }
  });
});

describe('a connector token is not a platform session (IAM-02, P0-2 part a)', () => {
  it('the first-party session opens both /api authenticators (control)', async () => {
    const m = members.active;
    const gate = await api('/api/dbd8/whoami', m.session);
    expect(gate.status, shown(gate.body)).toBe(200);
    expect(gate.body?.userId).toBe(m.id);
    expect((await api('/dbd8/router-gate', m.session)).status).toBe(200);
  });

  it('a token the connector issued for c2c:read opens neither', async () => {
    const g = await grant(members.active);
    const gate = await api('/api/dbd8/whoami', g.access);
    expect(gate.status, `a connector token passed the global /api gate as a session: ${shown(gate.body)}`).toBe(401);
    const routed = await api('/dbd8/router-gate', g.access);
    expect(routed.status, `a connector token passed a router's own gate as a session: ${shown(routed.body)}`).toBe(401);
    // …while it still opens the connector it was issued for.
    expect((await mcp(g.access)).status).toBe(200);
  });
});
