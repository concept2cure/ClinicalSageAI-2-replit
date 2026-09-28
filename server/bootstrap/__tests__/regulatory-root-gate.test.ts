/**
 * The Doc Orchestration router's authentication gate guards its own paths
 * (/api/510k/...), not every /api request that reaches it.
 *
 * ── The defect this pins (VSR-001 F-32, reproduced 2026-09-23) ───────────────
 * documentOrchestrationRoutes declares absolute /api/510k/... paths, so
 * registerRegulatoryRoutes mounts it at the app root. The gate in front of it
 * was scoped only to "any path starting /api", so every /api request that
 * reached that point had to carry a bearer token, including requests for
 * routers registered later. The global /api gate deliberately leaves a set of
 * endpoints open (register-platform-routes.ts), and each of these, mounted
 * after this one, answered 401 AUTH_001 "No authentication token provided" on
 * a live server:
 *
 *   POST /api/billing/webhooks/stripe  Stripe's webhook (a signature, no session)
 *   GET  /api/billing/dtc-pricing      the public pricing page's figures
 *   GET  /api/v1/...                   the public API, authenticated by X-API-Key
 *   GET  /api/cortex/health            a health probe
 *
 * The routers named here are replaced by one probe registered after the
 * regulatory routes, as production registers them; the question is only
 * whether a request reaches it. The regulatory registration is the real one.
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { registerRegulatoryRoutes } from '../register-regulatory-routes';

async function productionShapedApp() {
  const app = express();
  // Entitlement queries answer one active row, as the IVDR test's pool does.
  const pool: any = { query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) };
  await registerRegulatoryRoutes({ app, pool });
  // Everything production registers after the regulatory routes, as one probe.
  app.use((req, res) => res.status(200).json({ reached: req.path }));
  return app;
}

const OPEN_AFTER_REGULATORY = [
  ['POST', '/api/billing/webhooks/stripe'],
  ['GET', '/api/billing/dtc-pricing'],
  ['GET', '/api/v1/health'],
  ['GET', '/api/cortex/health'],
] as const;

describe('the Doc Orchestration gate is its own paths\' gate', () => {
  it.each(OPEN_AFTER_REGULATORY)(
    '%s %s, registered later and open by design, is reached without a session',
    async (method, path) => {
      const app = await productionShapedApp();
      const res = method === 'POST' ? await request(app).post(path).send({}) : await request(app).get(path);
      expect(res.status, `${method} ${path} was answered by the Doc Orchestration gate: ${JSON.stringify(res.body)}`).toBe(200);
      expect(res.body.reached).toBe(path);
    },
    30_000,
  );

  it('still refuses a Doc Orchestration request with no session', async () => {
    const app = await productionShapedApp();
    const res = await request(app).get('/api/510k/1/documents');
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('AUTH_001');
  }, 30_000);

  it('lets a request outside /api through to the frontend', async () => {
    const app = await productionShapedApp();
    const res = await request(app).get('/projects');
    expect(res.status).toBe(200);
    expect(res.body.reached).toBe('/projects');
  }, 30_000);
});

/*
 * What scoping the gate must not widen. Two routes under /api/v1 (the public
 * API's prefix, left to its X-API-Key check) have no tenant filter of their
 * own, and required a session only because the Doc Orchestration gate covered
 * every /api path (audit finding API-01). They require one themselves now.
 */
describe('the /api/v1 drafting routes require a session of their own', () => {
  const sessionGate = (req: any, res: any, next: any) =>
    req.headers.authorization ? next() : res.status(401).json({ error: 'session required' });

  it.each([
    ['POST', '/api/v1/drafting/start_task'],
    ['GET', '/api/v1/drafting/task_status/task_1'],
  ] as const)('%s %s is refused without a session', async (method, path) => {
    const { createMiscInlineRoutes } = await import('../../routes/misc-inline-routes');
    const app = express();
    app.use(express.json());
    app.use('/api', createMiscInlineRoutes({ query: vi.fn() } as any, sessionGate));
    const res = method === 'POST' ? await request(app).post(path).send({}) : await request(app).get(path);
    expect(res.status, `${method} ${path} ran without a session: ${JSON.stringify(res.body)}`).toBe(401);
  }, 30_000);
});
