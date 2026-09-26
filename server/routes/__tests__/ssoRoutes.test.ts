import { vi } from 'vitest';

// vi.hoisted to set env vars before any module load.
vi.hoisted(() => {
  // The SSO dev stubs gate on isDevAuthAllowed(), which requires BOTH
  // NODE_ENV=development AND an explicit ALLOW_DEV_AUTH=1. Setting only the
  // first is what the callback used to accept, and that single-factor form let
  // any non-production deployment mint a real JWT for an unauthenticated
  // caller — see the header of server/routes/sso.ts. The dev-path cases below
  // opt in to BOTH; the case that asserts the security property clears the
  // second and expects no token.
  process.env.NODE_ENV = 'development';
  process.env.ALLOW_DEV_AUTH = '1';
  process.env.DATABASE_URL_DEV =
    process.env.DATABASE_URL_DEV || 'postgresql://test:test@localhost:5432/test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
  process.env.SKIP_DB_STARTUP_TEST = 'true';

  // ── SAML tenant fixture (IAM-03 / P0-3) ────────────────────────────────────
  // One deployment, two IdPs: the single-org env default (SAML_IDP_*) and one
  // per-org entry in SAML_TENANTS ("acme"). "orphan" is configured in
  // SAML_TENANTS but has no organizations row. "globex" is configured NOWHERE,
  // and is the slug the tenant-binding cases sign in as. SAML_TENANTS is read
  // once, when server/routes/sso.ts loads, so it must be set here.
  process.env.SAML_IDP_SSO_URL = 'https://default-idp.example.test/sso';
  process.env.SAML_IDP_ENTITY_ID = 'https://default-idp.example.test';
  process.env.SAML_IDP_CERTIFICATE = 'MIIDEFAULTCERT';
  process.env.SAML_TENANTS = JSON.stringify({
    acme: {
      idpSsoUrl: 'https://acme-idp.example.test/sso',
      idpEntityId: 'https://acme-idp.example.test',
      idpCertificate: 'MIIACMECERT',
      idpSloUrl: 'https://acme-idp.example.test/slo',
    },
    orphan: {
      idpSsoUrl: 'https://orphan-idp.example.test/sso',
      idpEntityId: 'https://orphan-idp.example.test',
      idpCertificate: 'MIIORPHANCERT',
    },
  });
});

// Auth middleware imports `../config/environment.js` which is a `.ts` file
// in v2. Node ESM strict mode rejects the .js extension. Mock the
// middleware so the import chain doesn't touch the .js → .ts resolution.
vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
  authenticateToken: (_req: any, _res: any, next: any) => next(),
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

/**
 * A drizzle-shaped database stub that EVALUATES its WHERE clauses.
 *
 * The tenant-binding cases below exist because the SAML callback read a user's
 * membership with `WHERE user_id = $1` and took the first row from whichever
 * organisation it belonged to. A stub that ignores `where()` cannot tell that
 * query from the scoped one, so it would pass the fixed code and the defective
 * code alike. This one renders each condition through drizzle's own PgDialect
 * (`"organization_users"."organization_id" = $2`) and filters the seeded rows
 * on every `"col" = $n` conjunct, so the route sees exactly the rows its SQL
 * would have selected, and the red run shows the cross-organisation sign-in
 * rather than a fixture artefact. Every rendered condition is kept in
 * `selectWheres` so a case can also pin the predicate itself.
 */
const dbState = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  inserts: [] as { table: string; values: Record<string, unknown> }[],
  updates: [] as { table: string; values: Record<string, unknown> }[],
  selectWheres: [] as { table: string; sql: string; params: unknown[] }[],
  nextId: 1000,
  reset() {
    this.rows = {};
    this.inserts = [];
    this.updates = [];
    this.selectWheres = [];
    this.nextId = 1000;
  },
}));

vi.mock('../../db', async () => {
  const { getTableName } = await import('drizzle-orm');
  const { PgDialect } = await import('drizzle-orm/pg-core');
  const dialect = new PgDialect();
  const camel = (s: string) => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
  const holds = (row: Record<string, unknown>, sql: string, params: unknown[]) => {
    const re = /"[^"]+"\."([^"]+)"\s*=\s*\$(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql))) {
      if (row[camel(m[1])] !== params[Number(m[2]) - 1]) return false;
    }
    return true;
  };
  const select = () => ({
    from: (table: unknown) => {
      const name = getTableName(table as never);
      let rows = dbState.rows[name] ?? [];
      const chain = {
        where: (cond: unknown) => {
          const q = dialect.sqlToQuery(cond as never);
          dbState.selectWheres.push({ table: name, sql: q.sql, params: q.params });
          rows = rows.filter(r => holds(r, q.sql, q.params));
          return chain;
        },
        limit: async (n: number) => rows.slice(0, n),
        then: (res: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(rows).then(res, rej),
      };
      return chain;
    },
  });
  const insert = (table: unknown) => ({
    values: (v: Record<string, unknown>) => {
      const name = getTableName(table as never);
      const row = { id: dbState.nextId++, ...v };
      dbState.inserts.push({ table: name, values: v });
      (dbState.rows[name] ??= []).push(row);
      return {
        returning: async () => [row],
        then: (res: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve([row]).then(res, rej),
      };
    },
  });
  const update = (table: unknown) => ({
    set: (v: Record<string, unknown>) => ({
      where: async () => {
        dbState.updates.push({ table: getTableName(table as never), values: v });
      },
    }),
  });
  const db = { select, insert, update };
  const pool = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
  return { db, pool, getPool: () => pool, getDb: () => db, query: pool.query };
});

/**
 * The SAML provider is stood in for: what the assertion said is the INPUT to
 * the tenant-binding logic under test, not the thing under test. Signature
 * enforcement has its own suite (server/services/__tests__/saml-provider.test.ts).
 * `SAMLValidationError` is the real class, so the route's instanceof holds.
 */
const saml = vi.hoisted(() => ({
  validateResponse: vi.fn(),
  getAuthorizeUrl: vi.fn(async () => 'https://idp.example.test/sso?SAMLRequest=stub'),
  getLogoutUrl: vi.fn(async () => 'https://acme-idp.example.test/slo?SAMLRequest=stub'),
}));
vi.mock('../../services/saml-provider', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/saml-provider')>();
  return {
    ...actual,
    getSamlProvider: (_slug: string, config: { idpSloUrl?: string }) => ({
      getAuthorizeUrl: saml.getAuthorizeUrl,
      validateResponse: saml.validateResponse,
      getLogoutUrl: saml.getLogoutUrl,
      get supportsLogout() {
        return Boolean(config.idpSloUrl);
      },
      validateLogoutResponse: async () => undefined,
      metadata: () => '<EntityDescriptor/>',
    }),
  };
});

/** Every auth event the router recorded, in order. */
const recordAuthEvent = vi.hoisted(() =>
  vi.fn(async (_entry: Record<string, unknown>): Promise<void> => undefined)
);
vi.mock('../../services/audit/auth-event-audit', () => ({
  recordAuthEvent,
  describeAuthEvent: () => '',
}));

import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import ssoRoutes from '../sso';
import { SAMLValidationError } from '../../services/saml-provider';

describe('SSO helper routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth/sso', ssoRoutes);

  // tests/setup.ts resets NODE_ENV to 'test' around each case, so the env must
  // be re-established HERE to hold at request time. It previously did not need
  // to: sso.ts captured the decision once at module load, so the hoisted value
  // survived the reset and the gate was never actually exercised by a request.
  // The route now consults isDevAuthAllowed() per request, which is what makes
  // the negative case below meaningful.
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DEV_AUTH = '1';
  });

  it('GET /api/auth/sso/:provider/initiate should redirect to callback', async () => {
    const res = await request(app).get('/api/auth/sso/microsoft/initiate');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBeDefined();
    expect(res.headers.location).toContain('/api/auth/sso/microsoft/callback');
  });

  it('GET /api/auth/sso/:provider/callback hands the session to the sign-in page in the URL fragment, never the query string', async () => {
    // Until 2026-09-26 the redirect carried the JWT as ?sso_token= (with the
    // e-mail, name and organisation beside it): a query string is sent to the
    // server on the next request, kept in browser history and access logs
    // (security audit 2026-09-24, IAM-18 item 6). A fragment is neither sent
    // nor logged; the sign-in page reads it once and drops it.
    const res = await request(app).get('/api/auth/sso/microsoft/callback?code=dev');
    expect(res.status).toBe(302);
    const location = String(res.headers.location);
    const [beforeHash, fragment] = location.split('#');
    expect(beforeHash).toBe('/concept2cure/login');
    expect(beforeHash, 'the token travelled in the query string').not.toMatch(/token=|sso_email=/);
    const params = new URLSearchParams(fragment);
    expect(params.get('sso')).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(params.get('provider')).toBe('microsoft');
    expect(params.get('sso_email')).toBeNull();
  });

  // ── The security property ────────────────────────────────────────────────
  // This callback signs a genuine 24-hour JWT (userId 1, organizationId 2,
  // role client_user) with the PRODUCTION secret and never verifies the `code`
  // it is handed. It used to be gated on NODE_ENV === 'development' alone, so
  // any deployment whose NODE_ENV was not exactly 'production' — a preview box,
  // a Replit container, a staging service whose env drifted — served
  // credentials to unauthenticated callers. Two factors are required now, and
  // this pins the second one: with ALLOW_DEV_AUTH absent, no token is minted.
  it('mints NO token when ALLOW_DEV_AUTH is not explicitly set, even in development', async () => {
    delete process.env.ALLOW_DEV_AUTH;

    const initiate = await request(app).get('/api/auth/sso/microsoft/initiate');
    expect(initiate.status).toBe(501);

    const callback = await request(app).get('/api/auth/sso/microsoft/callback?code=dev');
    expect(callback.status).toBe(501);
    expect(callback.headers.location).toBeUndefined();
    expect(JSON.stringify(callback.body)).not.toMatch(/sso_token|eyJ/);
  });
});

/**
 * SAML is bound to a tenant (audit IAM-03, plan P0-3).
 *
 * The router selects an IdP configuration from an org slug and, once the IdP's
 * signature has been verified, decides which organisation the signed-in user
 * belongs to. Before this fix:
 *   - any slug absent from SAML_TENANTS fell back to the env default IdP, so a
 *     default-IdP user was provisioned into whichever organisation they named;
 *   - an existing user was matched by e-mail alone and given the FIRST
 *     membership row found for them, in whatever organisation;
 *   - a user with no membership was attached to the config's organisation;
 *   - `users.name` was overwritten from the assertion; `users.status` was not
 *     read; the logout took the session token from the query string; and no
 *     auth event was written.
 * The organisation is now always the one that owns the matched configuration,
 * and an existing user must already be a member of it.
 */
describe('SAML SSO — the organisation is the one that owns the matched IdP config (IAM-03 / P0-3)', () => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use('/api/auth/sso', ssoRoutes);

  const ACME_ORG = 42;
  const DEFAULT_ORG = 10;
  const relay = (org: string) =>
    Buffer.from(JSON.stringify({ org }), 'utf-8').toString('base64url');
  const assertion = (email: string, over: Record<string, unknown> = {}) => ({
    nameId: email,
    email,
    firstName: 'Mallory',
    lastName: 'Asserted',
    attributes: {},
    sessionIndex: '_session_1',
    ...over,
  });
  const callback = (org: string) =>
    request(app)
      .post('/api/auth/sso/saml/callback')
      .type('form')
      .send({ SAMLResponse: 'c3R1Yg==', RelayState: relay(org) });
  const alice = { id: 7, email: 'alice@acme.test', name: 'alice', status: 'active' };
  const membership = (userId: number, organizationId: number, role: string) => ({
    id: organizationId * 100 + userId,
    userId,
    organizationId,
    role,
  });
  const events = () => recordAuthEvent.mock.calls.map(c => c[0]);

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    dbState.reset();
    dbState.rows.organizations = [
      { id: DEFAULT_ORG, slug: 'default' },
      { id: ACME_ORG, slug: 'acme' },
      { id: 99, slug: 'other-tenant' },
    ];
    dbState.rows.users = [];
    dbState.rows.organization_users = [];
    saml.validateResponse.mockReset();
  });

  // ── 1. The env default IdP serves the default org only ───────────────────

  it('initiate: an org slug configured nowhere is refused (404), not sent to the default IdP', async () => {
    const res = await request(app).get('/api/auth/sso/saml/initiate?org=globex');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('SAML_NOT_CONFIGURED');
    expect(saml.getAuthorizeUrl).not.toHaveBeenCalled();
  });

  it('initiate: the default and the per-tenant slugs still reach their IdPs (control)', async () => {
    const dflt = await request(app).get('/api/auth/sso/saml/initiate?org=default');
    expect(dflt.status).toBe(302);
    const acme = await request(app).get('/api/auth/sso/saml/initiate?org=acme');
    expect(acme.status).toBe(302);
  });

  it('callback: RelayState naming a slug configured nowhere is refused (404) before the response is validated', async () => {
    const res = await callback('globex');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('SAML_NOT_CONFIGURED');
    expect(saml.validateResponse).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toMatch(/accessToken|eyJ/);
  });

  // ── 2. The organisation is the config's; no JIT attach across tenants ────

  it('callback: an existing user with no membership in the config org is refused (403), with a failure event in that tenant', async () => {
    dbState.rows.users = [alice];
    dbState.rows.organization_users = [membership(alice.id, 99, 'admin')];
    saml.validateResponse.mockResolvedValue(assertion(alice.email));

    const res = await callback('acme');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SSO_USER_NOT_IN_ORGANISATION');
    expect(JSON.stringify(res.body)).not.toMatch(/accessToken|eyJ/);
    // No membership was minted in the config org and none was adopted from org 99.
    expect(dbState.inserts.filter(i => i.table === 'organization_users')).toEqual([]);
    expect(events()).toContainEqual(
      expect.objectContaining({
        action: 'user_login',
        outcome: 'failure',
        reason: 'saml_user_not_in_organisation',
        userId: alice.id,
        tenantId: ACME_ORG,
        email: alice.email,
      })
    );
  });

  it('callback: a member signs in to the config org with THAT membership, never the first membership found', async () => {
    dbState.rows.users = [alice];
    // The foreign membership comes first, which is the row the unscoped
    // `orgAssoc[0]` used to pick.
    dbState.rows.organization_users = [
      membership(alice.id, 99, 'admin'),
      membership(alice.id, ACME_ORG, 'manager'),
    ];
    saml.validateResponse.mockResolvedValue(assertion(alice.email));

    const res = await callback('acme');

    expect(res.status).toBe(200);
    expect(res.body.user.organizationId).toBe(String(ACME_ORG));
    expect(res.body.user.roles).toEqual(['manager']);
    const claims = jwt.decode(res.body.accessToken) as Record<string, unknown>;
    expect(claims.organizationId).toBe(String(ACME_ORG));
    expect(claims.role).toBe('manager');
    expect(claims.provider).toBe('saml');
    expect(events()).toContainEqual(
      expect.objectContaining({
        action: 'user_login',
        outcome: 'success',
        reason: 'saml_sso',
        userId: alice.id,
        tenantId: ACME_ORG,
        email: alice.email,
      })
    );
  });

  it('callback: a return path rides in the fragment with the session, never in a query string (IAM-18 item 6)', async () => {
    dbState.rows.users = [alice];
    dbState.rows.organization_users = [membership(alice.id, ACME_ORG, 'manager')];
    saml.validateResponse.mockResolvedValue(assertion(alice.email));
    const relayWithReturn = Buffer.from(JSON.stringify({ org: 'acme', returnTo: '/concept2cure/projects?tab=1' }), 'utf-8').toString('base64url');

    const res = await request(app)
      .post('/api/auth/sso/saml/callback')
      .type('form')
      .send({ SAMLResponse: 'c3R1Yg==', RelayState: relayWithReturn });

    expect(res.status).toBe(302);
    const location = String(res.headers.location);
    const [beforeHash, fragment] = location.split('#');
    expect(beforeHash).toBe('/concept2cure/login');
    expect(beforeHash, 'the token travelled in the query string').not.toMatch(/token=/);
    const params = new URLSearchParams(fragment);
    const claims = jwt.decode(String(params.get('sso'))) as Record<string, unknown> | null;
    expect(claims?.organizationId).toBe(String(ACME_ORG));
    expect(claims?.provider).toBe('saml');
    expect(params.get('returnTo')).toBe('/concept2cure/projects?tab=1');
    expect(params.get('provider')).toBe('saml');
  });

  it('callback: the membership lookup is constrained to the config org in the statement itself', async () => {
    dbState.rows.users = [alice];
    dbState.rows.organization_users = [membership(alice.id, ACME_ORG, 'member')];
    saml.validateResponse.mockResolvedValue(assertion(alice.email));

    await callback('acme');

    const lookups = dbState.selectWheres.filter(w => w.table === 'organization_users');
    expect(lookups.length).toBeGreaterThan(0);
    for (const w of lookups) {
      expect(w.sql).toMatch(/"organization_users"\."organization_id" = \$\d/);
      expect(w.params).toContain(ACME_ORG);
    }
  });

  it('callback: a new user is provisioned with a membership in the config org only', async () => {
    saml.validateResponse.mockResolvedValue(assertion('bob@acme.test'));

    const res = await callback('acme');

    expect(res.status).toBe(200);
    expect(res.body.user.organizationId).toBe(String(ACME_ORG));
    const memberships = dbState.inserts.filter(i => i.table === 'organization_users');
    expect(memberships).toHaveLength(1);
    expect(memberships[0].values).toMatchObject({ organizationId: ACME_ORG, role: 'member' });
    expect(events()).toContainEqual(
      expect.objectContaining({ outcome: 'success', reason: 'saml_sso', tenantId: ACME_ORG })
    );
  });

  // ── 3. The assertion never rewrites an existing account ──────────────────

  it("callback: an existing user's name is not overwritten from the assertion", async () => {
    // `name` equals the e-mail local part, the case the old code treated as
    // "empty" and overwrote with whatever the assertion carried.
    dbState.rows.users = [alice];
    dbState.rows.organization_users = [membership(alice.id, ACME_ORG, 'member')];
    saml.validateResponse.mockResolvedValue(
      assertion(alice.email, { firstName: 'Mallory', lastName: 'Attacker' })
    );

    const res = await callback('acme');

    expect(res.status).toBe(200);
    expect(dbState.updates).toEqual([]);
    expect(res.body.user.name).toBe('alice');
  });

  it('callback: an account that is not active is refused (403), with a failure event', async () => {
    dbState.rows.users = [{ ...alice, status: 'suspended' }];
    dbState.rows.organization_users = [membership(alice.id, ACME_ORG, 'admin')];
    saml.validateResponse.mockResolvedValue(assertion(alice.email));

    const res = await callback('acme');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SSO_ACCOUNT_INACTIVE');
    expect(JSON.stringify(res.body)).not.toMatch(/accessToken|eyJ/);
    expect(events()).toContainEqual(
      expect.objectContaining({
        action: 'user_login',
        outcome: 'failure',
        reason: 'account_inactive',
        userId: alice.id,
        tenantId: ACME_ORG,
      })
    );
  });

  // ── 4. Refusals are audited in the tenant they concern ───────────────────

  it("callback: a validation failure is refused (401) and written as a failure event in the config org's tenant", async () => {
    saml.validateResponse.mockRejectedValue(new SAMLValidationError('signature did not verify'));

    const res = await callback('acme');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('SAML_VALIDATION_FAILED');
    expect(events()).toContainEqual(
      expect.objectContaining({
        action: 'user_login',
        outcome: 'failure',
        reason: 'saml_validation_failed',
        tenantId: ACME_ORG,
      })
    );
  });

  it('callback: a configured slug with no organisation row is refused (403) and written as a failure event', async () => {
    saml.validateResponse.mockResolvedValue(assertion('carol@orphan.test'));

    const res = await callback('orphan');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SAML_ORG_NOT_RESOLVED');
    expect(dbState.inserts).toEqual([]);
    expect(events()).toContainEqual(
      expect.objectContaining({
        action: 'user_login',
        outcome: 'failure',
        reason: 'saml_org_not_resolved',
      })
    );
  });

  // ── 5. Logout takes the session token from the header or body only ───────

  const samlSession = () =>
    jwt.sign(
      {
        userId: String(alice.id),
        email: alice.email,
        organizationId: String(ACME_ORG),
        role: 'member',
        provider: 'saml',
        sessionIndex: '_session_1',
        type: 'access',
      },
      process.env.JWT_SECRET as string,
      { expiresIn: '1h' }
    );

  it('logout: the session token is not accepted from the query string', async () => {
    const res = await request(app).get(
      `/api/auth/sso/saml/logout?org=acme&token=${encodeURIComponent(samlSession())}`
    );
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTH_REQUIRED');
    expect(saml.getLogoutUrl).not.toHaveBeenCalled();
  });

  it('logout: a bearer token in the Authorization header still starts SP-initiated SLO', async () => {
    const res = await request(app)
      .get('/api/auth/sso/saml/logout?org=acme')
      .set('Authorization', `Bearer ${samlSession()}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/acme-idp\.example\.test\/slo/);
    expect(saml.getLogoutUrl).toHaveBeenCalledWith(
      expect.objectContaining({ nameID: alice.email, sessionIndex: '_session_1' }),
      expect.any(String)
    );
  });

  it('logout: a token POSTed in the body still starts SP-initiated SLO', async () => {
    const res = await request(app)
      .post('/api/auth/sso/saml/logout?org=acme')
      .type('form')
      .send({ token: samlSession() });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/acme-idp\.example\.test\/slo/);
  });
});
