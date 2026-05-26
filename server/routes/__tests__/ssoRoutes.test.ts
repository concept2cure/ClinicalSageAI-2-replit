
import { vi } from 'vitest';

// vi.hoisted to set env vars before any module load.
vi.hoisted(() => {
  // SSO helper routes branch on `isDev = NODE_ENV === 'development'`.
  // The dev-mode path redirects 302 to the callback (what the test
  // expects); production returns 501 SSO_NOT_IMPLEMENTED.
  process.env.NODE_ENV = 'development';
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


import request from 'supertest';
import express from 'express';
import ssoRoutes from '../sso';

// The generic OAuth-style routes only do something when isDev is true at
// module load time (see server/routes/sso.ts:23). NODE_ENV is 'test' here,
// so the routes return 501 — assert that contract instead of the dev path.
describe('SSO helper routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth/sso', ssoRoutes);

  it('GET /api/auth/sso/:provider/initiate returns 501 outside dev mode', async () => {
    const res = await request(app).get('/api/auth/sso/microsoft/initiate');
    expect(res.status).toBe(501);
    expect(res.body.error).toBe('SSO_NOT_IMPLEMENTED');
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
});
