
import { vi } from 'vitest';

// vi.hoisted to set env vars before any module load.
vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
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

describe('SSO helper routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth/sso', ssoRoutes);

  it('GET /api/auth/sso/:provider/initiate should redirect to callback', async () => {
    const res = await request(app).get('/api/auth/sso/microsoft/initiate');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBeDefined();
    expect(res.headers.location).toContain('/api/auth/sso/microsoft/callback');
  });

  it('GET /api/auth/sso/:provider/callback should return token and user in dev', async () => {
    const res = await request(app).get('/api/auth/sso/microsoft/callback?code=dev');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBeDefined();
  });
});
