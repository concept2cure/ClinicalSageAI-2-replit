
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
});

// Auth middleware imports `../config/environment.js` which is a `.ts` file
// in v2. Node ESM strict mode rejects the .js extension. Mock the
// middleware so the import chain doesn't touch the .js → .ts resolution.
vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
  authenticateToken: (_req: any, _res: any, next: any) => next(),
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../db', () => {
  const pool = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
  return {
    db: {},
    pool,
    getPool: () => pool,
    getDb: () => ({}),
  };
});


import { beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import ssoRoutes from '../sso';

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

  it('GET /api/auth/sso/:provider/callback should return token and user in dev', async () => {
    // The callback now redirects 302 to the frontend SSO handler page
    // with the JWT in the sso_token query param (was: 200 JSON body).
    // Verify the redirect carries an sso_token and an sso_email so the
    // frontend can complete the SSO flow.
    const res = await request(app).get('/api/auth/sso/microsoft/callback?code=dev');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBeDefined();
    expect(res.headers.location).toMatch(/sso_token=/);
    expect(res.headers.location).toMatch(/sso_email=/);
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
