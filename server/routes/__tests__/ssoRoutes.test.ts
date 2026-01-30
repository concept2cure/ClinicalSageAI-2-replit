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
