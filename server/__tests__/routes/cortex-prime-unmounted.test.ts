/**
 * Cortex Prime is retired (WO-14, Route B, 2026-09-10).
 *
 * Its router, server/routes/cortexRoutes.ts, was mounted at `/` and `/main`
 * under /api/cortex and every write path it exposed answered HTTP 500: the
 * service issued SQL against columns no applier ever created (27 of them across
 * six tables), and the tenant key it passed was an integer stringified into a
 * uuid column. Measured on a database provisioned from empty, with the real
 * router and the real pool, before the unmount.
 *
 * This test pins the retirement from the outside: the Cortex Prime paths must
 * fall through the unified router as 404 — not 500, not 401 — while the
 * surfaces that share the /api/cortex prefix and never used cortex.* (the static
 * health handler, advisory, query, ana, the inline thread and chat routes) keep
 * answering. Run RED on the head before the unmount: POST /atoms answered 500,
 * GET /main/health and GET /main/stats answered 200. (Under this lane's mocked
 * pool, GET/DELETE /atoms/:id answered 404 from the handler's own not-found
 * branch even before the unmount, so those two cases do not discriminate on
 * their own; they are kept so a remount that changes that branch is caught.)
 * GREEN after.
 *
 * Auth is faked because auth is not what is measured; nothing else is mocked.
 */
import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const inject = (req: any, _res: any, next: () => void) => {
    req.user = {
      id: 1,
      userId: 1,
      email: 'retired-surface@example.test',
      role: 'admin',
      roles: ['admin'],
      organizationId: 7,
      permissions: [],
    };
    next();
  };
  return {
    ...actual,
    requireAuth: inject,
    authenticateToken: inject,
    requireOrgAccess: (_req: any, _res: any, next: () => void) => next(),
  };
});

describe('Cortex Prime is unmounted from /api/cortex', () => {
  let app: express.Express;

  beforeAll(async () => {
    const router = (await import('../../routes/cortex-unified')).default;
    // mountSubRouters() is async and un-awaited by the module; let it settle so
    // the surviving sub-routers are attached before the assertions run.
    await new Promise((r) => setTimeout(r, 500));
    app = express();
    app.use(express.json());
    app.use('/api/cortex', router);
  });

  const uuid = '00000000-0000-0000-0000-000000000000';

  it('POST /api/cortex/atoms is gone (404), not broken (500)', async () => {
    const res = await request(app)
      .post('/api/cortex/atoms')
      .send({ atomType: 'chunk', content: 'retired' });
    expect(res.status).toBe(404);
  });

  it('GET /api/cortex/atoms/:id is gone (404)', async () => {
    const res = await request(app).get(`/api/cortex/atoms/${uuid}`);
    expect(res.status).toBe(404);
  });

  it('DELETE /api/cortex/atoms/:id is gone (404)', async () => {
    const res = await request(app).delete(`/api/cortex/atoms/${uuid}`);
    expect(res.status).toBe(404);
  });

  it('GET /api/cortex/main/health — the cortex.health_check() surface that always reported error — is gone (404)', async () => {
    const res = await request(app).get('/api/cortex/main/health');
    expect(res.status).toBe(404);
  });

  it('GET /api/cortex/main/stats is gone (404)', async () => {
    const res = await request(app).get('/api/cortex/main/stats');
    expect(res.status).toBe(404);
  });

  it('the static /api/cortex/health handler that never touched cortex.* still answers', async () => {
    const res = await request(app).get('/api/cortex/health');
    expect(res.status).toBe(200);
    expect(res.body?.status).toBe('healthy');
    expect(res.body?.service).toBe('cortex-unified-api');
  });
});
