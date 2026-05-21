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

  it('GET /api/auth/sso/:provider/callback returns 501 outside dev mode', async () => {
    const res = await request(app).get('/api/auth/sso/microsoft/callback?code=dev');
    expect(res.status).toBe(501);
    expect(res.body.error).toBe('SSO_NOT_IMPLEMENTED');
  });
});
