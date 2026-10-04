/**
 * Only the user's own session can authorise a connector grant (IAM-02 part b,
 * reopened 2026-10-01; plan item P0-2 residual, fix round; rows D6 and D8).
 *
 * ── The defect this pins (reproduced 2026-10-01 at 0e58e794) ─────────────────
 * The consent POST verified the token it was handed with `verifyPlatformBearer`,
 * the connector's one verifier, which admits connector-issued tokens
 * (`token_use: 'mcp'`) because /mcp is their resource server. It then issued an
 * authorization code for the scopes the /authorize request named, and compared
 * them with nothing the token carried. So a connector token the user granted
 * `c2c:read`, posted as `access_token`, authorised a new grant of
 * `c2c:read c2c:draft c2c:file`, for any registered client, with no user
 * present: a fresh 30-day refresh token and the governed write
 * (`c2c_file_draft_for_review`). A leaked one-hour read token became a month
 * of write access. 21 CFR 11.10(d) and 11.300(c), HIPAA 164.312(a)(1),
 * Annex 11 §12: a delegated credential stays bound to what its user consented to.
 *
 * ── Posture ─────────────────────────────────────────────────────────────────
 * As mcp-account-standing.dbtest.ts: a freshly minted NOSUPERUSER NOBYPASSRLS
 * runtime role through APP_DATABASE_URL, RLS_ENFORCE=on, the production router
 * (createMcpRouter) on a real HTTP server, and the OAuth flow driven over HTTP:
 * /register, /authorize, the consent POST, /token.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Every organisation slug, email and client name starts `p02bc-`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { databaseUrl } from '../../../tests/setup.db';
import { provisionAppServiceRole, resolveAppServiceRole } from '../../../scripts/db/provision-app-role.mjs';

const TAG = 'p02bc';
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const RUNTIME_PASSWORD = 'p02bc-consent-runtime-password';
const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `p02bc_rt_${RUN}` });
const ALL_SCOPES = 'c2c:read c2c:draft c2c:file';

let owner: Pool;
let server: http.Server;
let baseUrl: string;
let resourceUrl: string;
let redirectUri: string;
let runtimePool: { query: Pool['query']; end: () => Promise<void> } | null = null;
let orgId: number;
let sequenceId: number;
/** The user's own first-party session, as POST /api/auth/login issues it. */
let session: string;
/** The client the user consented to, and a second one registered by someone else. */
const clients = { granted: '', other: '' };
/** The connector token the user's c2c:read consent produced. */
let readToken: string;
let readRefresh: string;

const shown = (body: unknown) =>
  JSON.stringify(body)
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<token>')
    .replace(/("(?:refresh_token|access_token|code)":")[^"]+/g, '$1<redacted>');

function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

/** GET /authorize → the signed pending-authorization assertion the consent page carries. */
async function authorize(clientId: string, scope: string, challenge: string): Promise<string> {
  const u = new URL('/authorize', baseUrl);
  for (const [k, v] of Object.entries({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code', code_challenge: challenge,
    code_challenge_method: 'S256', scope, state: `${TAG}-state`, resource: resourceUrl,
  })) u.searchParams.set(k, v);
  const res = await fetch(u, { redirect: 'manual' });
  const html = await res.text();
  expect(res.status, `GET /authorize did not render the consent page: ${res.status}`).toBe(200);
  const m = html.match(/name="request" value="([^"]+)"/);
  expect(m, 'the consent page carried no pending-authorization assertion').not.toBeNull();
  return m![1];
}

/** POST /oauth/consent, as the page's Allow button sends it. */
async function consent(assertion: string, bearer: string) {
  const res = await fetch(new URL('/oauth/consent', baseUrl), {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ request: assertion, access_token: bearer, decision: 'allow' }),
  });
  const location = res.headers.get('location');
  const code = location ? new URL(location).searchParams.get('code') : null;
  const body = res.status === 302 ? null : ((await res.json().catch(() => null)) as Record<string, unknown> | null);
  return { status: res.status, code, body };
}

async function token(clientId: string, params: Record<string, string>) {
  const res = await fetch(new URL('/token', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, ...params }),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/** The whole flow for one bearer at the consent page: the consent answer, and what any code it issued buys. */
async function grantFor(clientId: string, scope: string, bearer: string) {
  const { verifier, challenge } = pkce();
  const c = await consent(await authorize(clientId, scope, challenge), bearer);
  if (!c.code) return { consent: c, tokens: null };
  const t = await token(clientId, {
    grant_type: 'authorization_code', code: c.code, code_verifier: verifier, redirect_uri: redirectUri, resource: resourceUrl,
  });
  expect(t.status, `the code exchange failed: ${shown(t.body)}`).toBe(200);
  return { consent: c, tokens: { access: String(t.body.access_token), refresh: String(t.body.refresh_token), scope: String(t.body.scope) } };
}

const codeRows = async () =>
  Number((await owner.query('SELECT count(*)::int AS n FROM mcp_oauth_authorization_codes WHERE organization_id = $1', [orgId])).rows[0].n);

/** What the governed write answers for a bearer: 'filed' or the refusal text. */
async function governedWrite(bearer: string): Promise<string> {
  const client = new Client({ name: `${TAG}-dbtest`, version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(resourceUrl), {
    requestInit: { headers: { Authorization: `Bearer ${bearer}` } },
  }));
  try {
    const r = (await client.callTool({
      name: 'c2c_file_draft_for_review',
      arguments: { sequence_id: sequenceId, section_code: '2.5', title: `${TAG} widened write`, reason: 'P0-2 residual fix round' },
    })) as { isError?: boolean; content: Array<{ text?: string }> };
    return r.isError ? String(r.content[0]?.text) : 'filed';
  } finally {
    await client.close();
  }
}

async function register(name: string): Promise<string> {
  const reg = await fetch(new URL('/register', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: `${TAG}-${name}-${RUN}`, redirect_uris: [redirectUri], token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
    }),
  });
  const registered = (await reg.json()) as { client_id?: string };
  expect(reg.status, shown(registered)).toBe(201);
  return registered.client_id!;
}

async function cleanup(): Promise<void> {
  const orgs = (await owner.query(`SELECT id, uuid::text AS uuid FROM organizations WHERE slug LIKE $1`, [`${TAG}-%`])).rows as Array<{ id: number; uuid: string }>;
  const ids = orgs.map((o) => o.id);
  if (ids.length > 0) {
    for (const table of ['mcp_oauth_refresh_tokens', 'mcp_oauth_authorization_codes', 'submission_leaves', 'ectd_sequences', 'submissions', 'organization_users']) {
      await owner.query(`DELETE FROM ${table} WHERE organization_id = ANY($1::int[])`, [ids]);
    }
  }
  await owner.query(`DELETE FROM mcp_oauth_clients WHERE client_name LIKE $1`, [`${TAG}-%`]);
  // tenant-isolation-safe: removes only this suite's fixture users, matched by the suite-unique TAG
  await owner.query('DELETE FROM users WHERE email LIKE $1', [`${TAG}-%@example.invalid`]);
  if (ids.length > 0) {
    await owner.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [ids]);
    await owner
      .query(`DELETE FROM identity.organizations WHERE id = ANY($1::uuid[]) AND created_by = 'c48-stage1-sync'`, [orgs.map((o) => o.uuid)])
      .catch(() => {/* mirror absent or referenced: a harmless leftover */});
  }
}

async function provisionRuntimeRole(): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      const provisioned = await provisionAppServiceRole(owner, {
        env: { APP_SERVICE_DB_ROLE: runtimeRole, APP_SERVICE_DB_PASSWORD: RUNTIME_PASSWORD },
      });
      if (provisioned.skipped) throw new Error(`[${TAG}] provisionAppServiceRole skipped — no runtime role.`);
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
}

async function seed(): Promise<{ userId: number; email: string; orgUuid: string }> {
  const org = await owner.query(
    // Its owner has turned the connector on (P1-47; mcp-connector-enablement.dbtest.ts proves the off state).
    `INSERT INTO organizations (name, slug, tier, industry_mode, status, settings)
     VALUES ($1, $1, 'free', 'biotech', 'active', '{"claudeConnector":{"enabled":true}}'::json) RETURNING id, uuid::text AS uuid`,
    [`${TAG}-org-${RUN}`],
  );
  orgId = Number(org.rows[0].id);
  const email = `${TAG}-user-${RUN}@example.invalid`;
  // tenant-isolation-safe: fixture user in a throw-away test database; `users` is global and tenancy is the organization_users row below
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash, default_organization_id) VALUES ($1, 'P0-2 residual', 'not-a-real-hash', $2) RETURNING id`,
    [email, orgId],
  );
  const userId = Number(user.rows[0].id);
  await owner.query(`INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'admin')`, [orgId, userId]);
  const sub = await owner.query(
    `INSERT INTO submissions (title, application_type, client_type, primary_region, organization_id, created_by)
       VALUES ($1, 'ind', 'pharma', 'fda', $2, $3) RETURNING id`,
    [`${TAG} submission`, orgId, userId],
  );
  const seq = await owner.query(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, organization_id, created_by) VALUES ($1, 'fda', '0000', $2, $3) RETURNING id`,
    [Number(sub.rows[0].id), orgId, userId],
  );
  sequenceId = Number(seq.rows[0].id);
  return { userId, email, orgUuid: String(org.rows[0].uuid) };
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await cleanup();
  await provisionRuntimeRole();
  const who = await seed();

  const app = express();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://localhost:${(server.address() as { port: number }).port}`;
  resourceUrl = `${baseUrl}/mcp`;
  redirectUri = `${baseUrl}/${TAG}/callback`;
  const { createMcpRouter } = await import('../index');
  const { resolveMcpConfig } = await import('../config');
  app.use(createMcpRouter(resolveMcpConfig({ ...process.env, MCP_ENABLED: 'true', MCP_PUBLIC_URL: baseUrl })));
  const { getPool } = await import('../../db');
  runtimePool = getPool() as unknown as typeof runtimePool;

  const { activeJwtSecret } = await import('../../utils/jwtVerify');
  session = jwt.sign(
    { userId: String(who.userId), email: who.email, organizationId: String(orgId), organizationUuid: who.orgUuid, role: 'admin', type: 'access' },
    activeJwtSecret(),
    { expiresIn: '1h', algorithm: 'HS256' },
  );
  clients.granted = await register('granted');
  clients.other = await register('other');
}, 180_000);

afterAll(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  if (runtimePool) await runtimePool.end().catch(() => {});
  if (!owner) return;
  await cleanup().catch((err) => console.warn(`[${TAG}] cleanup left rows:`, err?.message));
  for (let attempt = 1; ; attempt++) {
    try {
      await owner.query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`);
      await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
      break;
    } catch (err) {
      if (attempt >= 5) {
        console.warn(`[${TAG}] runtime role left behind:`, (err as Error).message);
        break;
      }
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  await owner.end().catch(() => {});
});

describe('the posture is the one production runs in', () => {
  it('connects as a non-superuser runtime role with RLS enforcing', async () => {
    const { runWithPreAuthScope } = await import('../../db/tenantStore');
    const { rows } = await runWithPreAuthScope(`${TAG}:posture`, () =>
      runtimePool!.query(
        `SELECT current_user AS role, r.rolsuper, r.rolbypassrls, current_setting('app.rls_enforce', true) AS rls
           FROM pg_roles r WHERE r.rolname = current_user`,
      ),
    );
    expect(rows[0]).toMatchObject({ role: runtimeRole, rolsuper: false, rolbypassrls: false, rls: 'on' });
  });
});

describe('the user consents to c2c:read', () => {
  it('the grant is a connector token carrying exactly c2c:read', async () => {
    const g = await grantFor(clients.granted, 'c2c:read', session);
    expect(g.consent.status, shown(g.consent.body)).toBe(302);
    expect(g.tokens?.scope).toBe('c2c:read');
    const claims = jwt.decode(g.tokens!.access) as Record<string, unknown>;
    expect(claims).toMatchObject({ token_use: 'mcp', scope: 'c2c:read', client_id: clients.granted });
    readToken = g.tokens!.access;
    readRefresh = g.tokens!.refresh;
  });

  it('that token opens /mcp and is refused the governed write there', async () => {
    expect(await governedWrite(readToken)).toContain('Insufficient scope');
  });
});

describe('a connector token cannot authorise a grant at the consent page', () => {
  // The case the verifier reproduced first, then every other shape of it: the
  // same scope for another client, and the token's own client re-upped.
  const cases: Array<[string, () => string, string]> = [
    ['all three scopes, for another client', () => clients.other, ALL_SCOPES],
    ['all three scopes, for its own client', () => clients.granted, ALL_SCOPES],
    ['the scope it already holds, for another client', () => clients.other, 'c2c:read'],
    ['the scope it already holds, for its own client', () => clients.granted, 'c2c:read'],
  ];
  for (const [label, clientOf, scope] of cases) {
    it(`${label}: no code, no code row, and nothing for /mcp`, async () => {
      const before = await codeRows();
      const g = await grantFor(clientOf(), scope, readToken);
      // What a code would have bought, so a red run says what leaked.
      const outcome = {
        consentStatus: g.consent.status,
        codeIssued: g.consent.code !== null,
        codeRowsAdded: (await codeRows()) - before,
        tokenScope: g.tokens?.scope ?? null,
        governedWrite: g.tokens && g.tokens.scope.includes('c2c:file') ? await governedWrite(g.tokens.access) : null,
      };
      expect(outcome).toEqual({ consentStatus: 401, codeIssued: false, codeRowsAdded: 0, tokenScope: null, governedWrite: null });
      expect(g.consent.body).toMatchObject({ error: 'invalid_token' });
      expect(String(g.consent.body?.error_description)).toMatch(/connector token cannot authorise a grant/i);
    });
  }
});

describe('what a connector token still does, and what the user still can', () => {
  it('the c2c:read connector token still opens /mcp for a read', async () => {
    const client = new Client({ name: `${TAG}-read`, version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(resourceUrl), {
      requestInit: { headers: { Authorization: `Bearer ${readToken}` } },
    }));
    const r = (await client.callTool({ name: 'c2c_list_projects', arguments: {} })) as { isError?: boolean; structuredContent?: Record<string, unknown> };
    await client.close();
    expect(r.isError, JSON.stringify(r)).toBeFalsy();
    expect(r.structuredContent?.organizationId).toBe(orgId);
  });

  it('a refresh cannot widen the grant either', async () => {
    const t = await token(clients.granted, { grant_type: 'refresh_token', refresh_token: readRefresh, scope: ALL_SCOPES });
    expect(t.status, shown(t.body)).toBe(400);
    expect(t.body.error).toBe('invalid_scope');
  });

  it('the user\'s own session still consents to all three scopes, and that grant files the draft', async () => {
    const g = await grantFor(clients.other, ALL_SCOPES, session);
    expect(g.consent.status, shown(g.consent.body)).toBe(302);
    expect(g.tokens?.scope).toBe(ALL_SCOPES);
    expect(await governedWrite(g.tokens!.access)).toBe('filed');
  });
});
