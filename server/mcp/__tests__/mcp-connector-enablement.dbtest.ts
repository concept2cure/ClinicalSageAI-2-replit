/**
 * The connector for Claude is opened per organization, by that organization's
 * owner or administrator (ADR-0014 §10; plan item P1-47; audit IAM-02
 * follow-on; row D8).
 *
 * A connector is a new path for tenant content to leave the platform, to a
 * client the customer controls, so the customer decides to open it. Until the
 * organization's administrator enables it:
 *   - the consent page refuses the organization's members (no code is issued);
 *   - a connector token minted for the organization is refused at /mcp, and its
 *     refresh token at /token.
 * The check is live: disabling cuts tokens already issued, and enabling admits
 * the same token again. Enabling or disabling happens through one door,
 * PUT /api/tenant-config/:id/claude-connector, and is recorded by a chained
 * audit row in the transaction that changes the setting. A manager, a member
 * and another organization's administrator are refused there; the
 * administrator who may use that door is still refused, with 403, by every
 * general settings door that is sent the key.
 *
 * ── Posture ─────────────────────────────────────────────────────────────────
 * As mcp-consent-delegated.dbtest.ts: a freshly minted NOSUPERUSER NOBYPASSRLS
 * runtime role through APP_DATABASE_URL, RLS_ENFORCE=on, the production MCP
 * router (createMcpRouter) and the production /api auth boundary in front of
 * tenant-config, organizations-routes and the AnA platform controller, all on
 * one real HTTP server.
 *
 * ── The doors outside tenant-config ─────────────────────────────────────────
 * Two settings doors outside tenant-config also write organizations.settings:
 * PATCH /api/organizations/:id/settings and PATCH /api/ana/platform/settings.
 * Each is exercised after a control that shows the door is open to the
 * administrator, so a door that admits the connector fails its own case and
 * nothing before it. Fix round (IAM-24, 2026-10-01): a probe door that writes
 * through the one settings writer with no connector check of its own shows
 * the writer itself refusing, so a door added later is covered too.
 *
 * ── IAM-25: who can open it (decided 2026-10-01) ────────────────────────────
 * No product path writes `owner` to organization_users.role (sign-up and
 * first-run setup write `admin`; tenant-users, SCIM and SSO assign admin,
 * manager, member or viewer), so a connector only an owner could open stayed
 * closed for every organisation. Decided for the product (2026-10-01): the
 * organisation's owner or administrator opens it; the administrator is the
 * customer's highest in-product role, so the customer still decides. The
 * cases above seed admin, manager and member memberships through the table
 * owner's pool. The last describe signs an organisation up through the
 * production sign-up and e-mail verification, and shows its creator, whom the
 * product makes an administrator, opening the connector.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Every organisation slug, email and client name starts `p147-`.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// Sign-up mails a verification link (IAM-17): observed here, never sent (IAM-25 case).
vi.mock('../../services/emailService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/emailService')>()),
  isEmailConfigured: () => true,
  sendVerificationEmail: vi.fn(async () => undefined),
  sendWelcomeEmail: vi.fn(async () => undefined),
}));
import express from 'express';
import request from 'supertest';
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { databaseUrl } from '../../../tests/setup.db';
import { provisionAppServiceRole, resolveAppServiceRole } from '../../../scripts/db/provision-app-role.mjs';

const TAG = 'p147';
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const RUNTIME_PASSWORD = 'p147-connector-enablement-runtime-password';
const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `p147_rt_${RUN}` });

let owner: Pool;
let server: http.Server;
let baseUrl: string;
let resourceUrl: string;
let redirectUri: string;
let runtimePool: { query: Pool['query']; end: () => Promise<void> } | null = null;

let orgId: number;
const ROLES = ['admin', 'manager', 'member'] as const;
const people = { admin: 0, manager: 0, member: 0, otherAdmin: 0 };
let memberMembershipId = 0;
let orgUuid = '';
/** A second organization, whose administrator must not reach the first's setting. */
let otherOrg = { id: 0, uuid: '' };
/** First-party sessions, as POST /api/auth/login issues them. */
const sessions = { admin: '', manager: '', member: '', otherAdmin: '' };
let clientId = '';
/** A connector token minted for the organization's member, before anything was enabled. */
let connectorToken = '';
/** The refresh token of a grant made while the connector was enabled. */
let grantRefresh = '';

const shown = (body: unknown) =>
  JSON.stringify(body)
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<token>')
    .replace(/("(?:refresh_token|access_token|code)":")[^"]+/g, '$1<redacted>');

function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

async function authorize(scope: string, challenge: string): Promise<string> {
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

async function token(params: Record<string, string>) {
  const res = await fetch(new URL('/token', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, ...params }),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/** The consent page for one bearer, and the code exchange when a code was issued. */
async function grantFor(bearer: string, scope = 'c2c:read') {
  const { verifier, challenge } = pkce();
  const c = await consent(await authorize(scope, challenge), bearer);
  if (!c.code) return { consent: c, tokens: null };
  const t = await token({
    grant_type: 'authorization_code', code: c.code, code_verifier: verifier, redirect_uri: redirectUri, resource: resourceUrl,
  });
  expect(t.status, `the code exchange failed: ${shown(t.body)}`).toBe(200);
  return { consent: c, tokens: { access: String(t.body.access_token), refresh: String(t.body.refresh_token) } };
}

/** What /mcp answers a bearer's initialize: the status, and the challenge when refused. */
async function mcpInitialize(bearer: string): Promise<{ status: number; challenge: string }> {
  const res = await fetch(resourceUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: `${TAG}-dbtest`, version: '1' } },
    }),
  });
  await res.text().catch(() => '');
  return { status: res.status, challenge: res.headers.get('www-authenticate') ?? '' };
}

/** A first-party access token, as POST /api/auth/login issues one. */
async function sessionFor(userId: number, email: string, org: number, uuid: string, role: string): Promise<string> {
  const { activeJwtSecret } = await import('../../utils/jwtVerify');
  const claims = { userId: String(userId), email, organizationId: String(org), organizationUuid: uuid, role, type: 'access' };
  return jwt.sign(claims, activeJwtSecret(), { expiresIn: '1h', algorithm: 'HS256' });
}

async function api(method: 'GET' | 'PUT' | 'PATCH', path: string, bearer: string, body?: unknown) {
  const res = await fetch(new URL(path, baseUrl), {
    method,
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> };
}

const connectorPath = () => `/api/tenant-config/${orgId}/claude-connector`;
const setConnector = (who: keyof typeof sessions, enabled: boolean) => api('PUT', connectorPath(), sessions[who], { enabled });

const storedSetting = async () =>
  (await owner.query(`SELECT settings::jsonb -> 'claudeConnector' AS c FROM organizations WHERE id = $1`, [orgId])).rows[0]?.c ?? null;

const codeRows = async () =>
  Number((await owner.query('SELECT count(*)::int AS n FROM mcp_oauth_authorization_codes WHERE organization_id = $1', [orgId])).rows[0].n);

/** Every settings audit row on this organization's chain. */
async function settingsAuditRows(): Promise<Array<{ action: string; actor_id: number; new_values: Record<string, any> }>> {
  const { rows } = await owner.query(
    `SELECT action, actor_id, new_values FROM audit_logs
      WHERE tenant_id = $1 AND table_name = 'organization_settings'
      ORDER BY chain_seq NULLS LAST, occurred_at, id`,
    [orgId],
  );
  return rows;
}

async function cleanup(): Promise<void> {
  const orgs = (await owner.query(`SELECT id, uuid::text AS uuid FROM organizations WHERE slug LIKE $1`, [`${TAG}-%`])).rows as Array<{ id: number; uuid: string }>;
  const ids = orgs.map((o) => o.id);
  if (ids.length > 0) {
    // module_subscriptions, organization_industry_profiles, client_workspaces: what sign-up creates (IAM-25 case).
    const tables = ['mcp_oauth_refresh_tokens', 'mcp_oauth_authorization_codes', 'module_subscriptions'];
    for (const table of [...tables, 'organization_industry_profiles', 'client_workspaces', 'organization_users']) {
      await owner.query(`DELETE FROM ${table} WHERE organization_id = ANY($1::int[])`, [ids]);
    }
    // This suite's own chain rows, removed as the P1-41 suite removes its own:
    // the no-delete trigger off for this one transaction only.
    const c = await owner.connect();
    try {
      await c.query('BEGIN');
      await c.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
      await c.query('DELETE FROM audit_logs WHERE tenant_id = ANY($1::int[])', [ids]);
      await c.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
      await c.query('COMMIT');
    } catch (err) {
      await c.query('ROLLBACK').catch(() => undefined);
      console.warn(`[${TAG}] audit cleanup incomplete:`, (err as Error).message);
    } finally {
      c.release();
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
  process.env.AUTH_BOUNDARY_MODE = 'enforce';
}

/**
 * The organization as sign-up leaves it: no connector setting at all. Its
 * subscription is active, so the AnA platform controller's settings door is
 * open to its administrator (verifyPaidAccess), and a refusal there is about
 * the connector, not the subscription. A second organization has an
 * administrator of its own, who is refused the first organization's setting.
 */
async function seed(): Promise<void> {
  const insertOrg = async (slug: string) => {
    const { rows } = await owner.query(
      `INSERT INTO organizations (name, slug, tier, industry_mode, status, payment_status)
       VALUES ($1, $1, 'free', 'biotech', 'active', 'active') RETURNING id, uuid::text AS uuid`,
      [slug],
    );
    return { id: Number(rows[0].id), uuid: String(rows[0].uuid) };
  };
  ({ id: orgId, uuid: orgUuid } = await insertOrg(`${TAG}-org-${RUN}`));
  otherOrg = await insertOrg(`${TAG}-other-${RUN}`);
  type Seat = [keyof typeof people, number, string];
  for (const [who, org, role] of [...ROLES.map((r): Seat => [r, orgId, r]), ['otherAdmin', otherOrg.id, 'admin'] as Seat]) {
    // tenant-isolation-safe: fixture user in a throw-away test database; `users` is global and tenancy is the organization_users row below
    const user = await owner.query(
      `INSERT INTO users (email, name, password_hash, default_organization_id) VALUES ($1, $2, 'not-a-real-hash', $3) RETURNING id`,
      [`${TAG}-${who}-${RUN}@example.invalid`, `P1-47 ${who}`, org],
    );
    people[who] = Number(user.rows[0].id);
    const m = await owner.query(
      `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, $3) RETURNING id`,
      [org, people[who], role],
    );
    if (who === 'member') memberMembershipId = Number(m.rows[0].id);
  }
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await cleanup();
  await provisionRuntimeRole();
  await seed();

  const app = express();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://localhost:${(server.address() as { port: number }).port}`;
  resourceUrl = `${baseUrl}/mcp`;
  redirectUri = `${baseUrl}/${TAG}/callback`;
  const { createMcpRouter } = await import('../index');
  const { resolveMcpConfig } = await import('../config');
  app.use(createMcpRouter(resolveMcpConfig({ ...process.env, MCP_ENABLED: 'true', MCP_PUBLIC_URL: baseUrl })));
  // The settings doors, behind the production /api boundary as server/index.ts mounts them.
  const { createAuthBoundary } = await import('../../middleware/authBoundary');
  const tenantConfig = (await import('../../routes/tenant-config')).default;
  const organizationsRoutes = (await import('../../routes/organizations-routes')).default;
  const anaPlatformControl = (await import('../../routes/ana-platform-control')).default;
  app.use(express.json());
  app.use('/api', createAuthBoundary());
  app.use('/api/tenant-config', tenantConfig);
  app.use('/api/organizations', organizationsRoutes);
  app.use('/api/ana/platform', anaPlatformControl);
  // A settings door with no connector check of its own, as a door added later
  // might be (fix round, IAM-24): it lays the body over the stored settings
  // through the one writer, so only the writer can refuse.
  const writer = await import('../../services/tenant/tenant-settings-writer');
  app.patch('/api/p147-probe/:tenantId/settings', async (req, res) => {
    try {
      const stored = await writer.writeTenantSettings(req, Number(req.params.tenantId), {
        action: 'tenant_settings_changed',
        next: (current) => writer.overlaySettings(current, req.body ?? {}),
        sections: () => Object.keys(req.body ?? {}),
      });
      res.status(stored ? 200 : 404).json({ written: Boolean(stored) });
    } catch (err) {
      res.status(409).json({ refused: err instanceof Error ? err.message : String(err) });
    }
  });
  const { getPool } = await import('../../db');
  runtimePool = getPool() as unknown as typeof runtimePool;

  for (const role of ROLES) {
    sessions[role] = await sessionFor(people[role], `${TAG}-${role}@example.invalid`, orgId, orgUuid, role);
  }
  sessions.otherAdmin = await sessionFor(people.otherAdmin, `${TAG}-otherAdmin@example.invalid`, otherOrg.id, otherOrg.uuid, 'admin');
  const { mintAccessToken } = await import('../auth/platform-token');
  connectorToken = (await mintAccessToken({
    membership: { membershipId: memberMembershipId, organizationId: orgId, userId: people.member, role: 'member', organizationUuid: orgUuid, email: null },
    clientId: `${TAG}-minted-client`,
    scopes: ['c2c:read'],
    resource: resourceUrl,
    ttlSeconds: 600,
  })).token;

  const reg = await fetch(new URL('/register', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: `${TAG}-client-${RUN}`, redirect_uris: [redirectUri], token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
    }),
  });
  const registered = (await reg.json()) as { client_id?: string };
  expect(reg.status, shown(registered)).toBe(201);
  clientId = registered.client_id!;
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

describe('until its administrator enables it, the connector is closed to the organization', () => {
  it('the organization starts with no connector setting (absent means disabled)', async () => {
    expect(await storedSetting()).toBeNull();
  });

  it('a member is refused at consent: 403, no code, no code row', async () => {
    const before = await codeRows();
    const g = await grantFor(sessions.member);
    expect({ status: g.consent.status, codeIssued: g.consent.code !== null, codeRowsAdded: (await codeRows()) - before }).toEqual({
      status: 403,
      codeIssued: false,
      codeRowsAdded: 0,
    });
    expect(g.consent.body).toMatchObject({ error: 'access_denied' });
    expect(String(g.consent.body?.error_description)).toMatch(/connector for Claude is not enabled/i);
  });

  it('a connector token minted for the organization is refused at /mcp', async () => {
    const r = await mcpInitialize(connectorToken);
    expect(r.status, 'a token of an organization that has not enabled the connector opened /mcp').toBe(401);
    expect(r.challenge).toContain('invalid_token');
  });

  it("the member's own session is refused at /mcp too", async () => {
    expect((await mcpInitialize(sessions.member)).status).toBe(401);
  });

  it('every member sees it is off; only the administrator is told they can change it', async () => {
    const seen: Record<string, unknown> = {};
    for (const role of ROLES) {
      const r = await api('GET', connectorPath(), sessions[role]);
      seen[role] = { status: r.status, ...r.body };
    }
    const off = (canChange: boolean) => ({ status: 200, connector: { enabled: false, canChange } });
    expect(seen).toEqual({ admin: off(true), manager: off(false), member: off(false) });
  });
});

describe("no one else enables it, and the administrator not through tenant-config's general doors", () => {
  it.each([['manager'], ['member'], ['otherAdmin']] as const)('PUT /api/tenant-config/:id/claude-connector as %s → 403', async (who) => {
    const r = await setConnector(who, true);
    expect(r.status, shown(r.body)).toBe(403);
    // The connector door's own refusal, not the boundary's.
    expect(String(r.body.error)).toMatch(/turn the connector for Claude on or off/);
  });

  it('PATCH /api/tenant-config/:id/settings naming the connector, as the administrator → 403', async () => {
    const r = await api('PATCH', `/api/tenant-config/${orgId}/settings`, sessions.admin, { claudeConnector: { enabled: true } });
    expect(r.status, shown(r.body)).toBe(403);
  });

  it('PATCH /api/tenant-config/:id/settings/claudeConnector → refused', async () => {
    const r = await api('PATCH', `/api/tenant-config/${orgId}/settings/claudeConnector`, sessions.admin, { enabled: true });
    expect([400, 403], shown(r.body)).toContain(r.status);
  });

  it('nothing was stored and nothing was recorded as a change', async () => {
    expect(await storedSetting()).toBeNull();
    expect(await settingsAuditRows()).toEqual([]);
    expect((await mcpInitialize(connectorToken)).status).toBe(401);
  });
});

describe('the administrator enables it, through its own door', () => {
  it('PUT by the administrator: 200, stored, and one chained audit row naming them, the value before and after', async () => {
    const r = await setConnector('admin', true);
    expect(r.status, shown(r.body)).toBe(200);
    expect(r.body).toEqual({ connector: { enabled: true, canChange: true } });
    expect(await storedSetting()).toEqual({ enabled: true });
    const rows = await settingsAuditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'tenant_settings_changed',
      actor_id: people.admin,
      new_values: {
        sections: ['claudeConnector'],
        changedFields: { claudeConnector: ['enabled'] },
        values: { claudeConnector: { before: { enabled: null }, after: { enabled: true } } },
      },
    });
  });

  it('the same connector token is now admitted at /mcp', async () => {
    expect((await mcpInitialize(connectorToken)).status).toBe(200);
  });

  it('a member can now consent, and the grant opens /mcp', async () => {
    const g = await grantFor(sessions.member);
    expect(g.consent.status, shown(g.consent.body)).toBe(302);
    expect((await mcpInitialize(g.tokens!.access)).status).toBe(200);
    grantRefresh = g.tokens!.refresh;
  });
});

describe('the administrator disables it: tokens already issued are cut', () => {
  it('PUT {enabled:false} by the administrator: 200 and a second audit row', async () => {
    const r = await setConnector('admin', false);
    expect(r.status, shown(r.body)).toBe(200);
    expect(await storedSetting()).toEqual({ enabled: false });
    const rows = await settingsAuditRows();
    expect(rows).toHaveLength(2);
    expect(rows[1].new_values.values).toEqual({ claudeConnector: { before: { enabled: true }, after: { enabled: false } } });
  });

  it('the same connector token is refused at /mcp again', async () => {
    expect((await mcpInitialize(connectorToken)).status).toBe(401);
  });

  it('the refresh token of a grant made while it was enabled is refused at /token', async () => {
    const t = await token({ grant_type: 'refresh_token', refresh_token: grantRefresh });
    expect(t.status, shown(t.body)).toBe(400);
    expect(t.body.error).toBe('invalid_grant');
    expect(String(t.body.error_description)).toMatch(/connector for Claude is not enabled/i);
    // Refused, not destroyed: the grant is as it was, as a suspension leaves it.
    const row = await owner.query('SELECT revoked_at FROM mcp_oauth_refresh_tokens WHERE token_hash = $1', [
      createHash('sha256').update(grantRefresh).digest('hex'),
    ]);
    expect(row.rows).toEqual([{ revoked_at: null }]);
  });

  it('a member is refused at consent again', async () => {
    expect((await grantFor(sessions.member)).consent.status).toBe(403);
  });
});

// The administrator who may use the connector's own door is refused by every
// general door. "Nothing stored" is read against the value before the attempt,
// so a case here fails only on its own door.
describe('the settings doors outside tenant-config refuse the administrator the key too', () => {
  it('control: the AnA settings door is open to this administrator for another setting', async () => {
    const r = await api('PATCH', '/api/ana/platform/settings', sessions.admin, { defaultModel: `${TAG}-probe` });
    expect(r.status, shown(r.body)).toBe(200);
  });

  it('PATCH /api/ana/platform/settings naming the connector → 403, nothing stored, the token still refused', async () => {
    const before = await storedSetting();
    const r = await api('PATCH', '/api/ana/platform/settings', sessions.admin, { claudeConnector: { enabled: true } });
    const seen = { status: r.status, stored: await storedSetting(), mcp: (await mcpInitialize(connectorToken)).status };
    expect(seen, shown(r.body)).toEqual({ status: 403, stored: before, mcp: 401 });
  });

  it('control: the organizations settings door is open to this administrator for another setting', async () => {
    const r = await api('PATCH', `/api/organizations/${orgId}/settings`, sessions.admin, {
      settings: { translation: { enabled: false } },
      reason: 'P1-47 control',
    });
    expect(r.status, shown(r.body)).toBe(200);
  });

  it('PATCH /api/organizations/:id/settings naming the connector → 403, nothing stored, the token still refused', async () => {
    const before = await storedSetting();
    const r = await api('PATCH', `/api/organizations/${orgId}/settings`, sessions.admin, {
      settings: { claudeConnector: { enabled: true } },
      reason: 'P1-47 administrator attempt',
    });
    const seen = { status: r.status, stored: await storedSetting(), mcp: (await mcpInitialize(connectorToken)).status };
    expect(seen, shown(r.body)).toEqual({ status: 403, stored: before, mcp: 401 });
  });

  it('control: a door with no connector check of its own writes another setting through the one writer', async () => {
    const r = await api('PATCH', `/api/p147-probe/${orgId}/settings`, sessions.admin, { p147Probe: { ok: true } });
    expect(r.status, shown(r.body)).toBe(200);
  });

  it('that door cannot turn it on: the one writer refuses, nothing stored, nothing recorded, the token still refused', async () => {
    const [rowsBefore, storedBefore] = [(await settingsAuditRows()).length, await storedSetting()];
    const r = await api('PATCH', `/api/p147-probe/${orgId}/settings`, sessions.admin, { claudeConnector: { enabled: true } });
    const recorded = (await settingsAuditRows()).length - rowsBefore;
    const seen = { status: r.status, stored: await storedSetting(), recorded, mcp: (await mcpInitialize(connectorToken)).status };
    expect(seen, shown(r.body)).toEqual({ status: 409, stored: storedBefore, recorded: 0, mcp: 401 });
  });
});

describe('IAM-25 (decided 2026-10-01): the organisation a sign-up creates has someone who can open the connector', () => {
  const email = `${TAG}-signup-${RUN}@example.invalid`;
  let creator: { organization_id: number; user_id: number; role: string; uuid: string } | null = null;

  it("sign-up and e-mail verification, through production's own routes, leave one membership: its creator's", async () => {
    const { registerPlatformRoutes } = await import('../../bootstrap/register-platform-routes');
    const { getPool } = await import('../../db');
    const { sendVerificationEmail } = await import('../../services/emailService');
    const platform = express();
    platform.use(express.json());
    await registerPlatformRoutes({
      app: platform,
      pool: getPool(),
      authMiddleware: (_req: unknown, res: express.Response) => {
        res.status(401).json({ error: 'the global gate was reached; sign-up must not reach it' });
      },
    });
    const signup = await request(platform).post('/api/auth/signup').send({
      email,
      password: 'Quartz-Meridian-Lantern-5513!',
      companyName: `${TAG} signup ${RUN}`,
      industryMode: 'biotech',
      firstName: 'Connector',
      lastName: 'Opener',
    });
    expect(signup.status, JSON.stringify(signup.body).slice(0, 300)).toBe(201);
    const link = vi.mocked(sendVerificationEmail).mock.calls.find((c) => c[0] === email)?.[2];
    expect(link, 'sign-up sent no verification link').toBeTruthy();
    const verifyToken = decodeURIComponent(new URL(String(link)).hash.replace(/^#token=/, ''));
    const verified = await request(platform).post('/api/auth/verify-email').send({ token: verifyToken });
    expect(verified.status, JSON.stringify(verified.body)).toBe(200);
    const { rows } = await owner.query(
      `SELECT ou.organization_id, ou.user_id, ou.role, o.uuid::text AS uuid FROM organization_users ou
         JOIN users u ON u.id = ou.user_id JOIN organizations o ON o.id = ou.organization_id WHERE u.email = $1`,
      [email],
    );
    expect(rows).toHaveLength(1);
    creator = rows[0];
    // The fact IAM-25 rests on: the product makes its creator an administrator.
    expect(creator!.role).toBe('admin');
  });

  // Until the decision this case was `it.fails` (canChange false, PUT 403):
  // the creator is an administrator, and only an owner could open it.
  it('that creator, its administrator, is told they can change it, and turns it on', async () => {
    expect(creator, 'the sign-up case did not run').not.toBeNull();
    const c = creator!;
    const session = await sessionFor(c.user_id, email, c.organization_id, c.uuid, c.role);
    const path = `/api/tenant-config/${c.organization_id}/claude-connector`;
    const read = await api('GET', path, session);
    const put = await api('PUT', path, session, { enabled: true });
    expect({ read: read.status, connector: read.body.connector, put: put.status }, shown(put.body)).toEqual({
      read: 200,
      connector: { enabled: false, canChange: true },
      put: 200,
    });
  });
});
