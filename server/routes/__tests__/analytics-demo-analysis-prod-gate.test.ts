/**
 * POST /api/analytics/demo-analysis must not be reachable in production (L167).
 *
 * L171 fixed what this endpoint SAYS — the minted DOIs and the three claimed
 * analyses are gone, pinned by analytics-demo-analysis-provenance.test.ts. It
 * left what L171's own ledger row records: the route "is mounted live by
 * register-project-routes with no NODE_ENV gate and no client caller".
 *
 * The exposure was not only cosmetic. `analyticsRoutes` is mounted with no
 * middleware at all — the sibling `mountAll` call for quality management passes
 * requireTenantContext, the analytics one passes nothing — and the route file
 * installs no router-level auth. So on a real deployment this handler answered
 * unauthenticated and without tenant context, wrote caller-supplied text under
 * `exports/`, and spent a model call, for a route nothing in the client calls.
 *
 * These tests pin three things: production gets 404, the handler does not run at
 * all (the gate precedes every side effect), and development still works.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const analyzeProtocol = vi.fn();
const findSimilarProtocols = vi.fn();

vi.mock('../../db', () => ({ db: {} }));
vi.mock('../../protocol-analyzer-service', () => ({
  protocolAnalyzerService: {
    analyzeProtocol: (...a: unknown[]) => analyzeProtocol(...a),
    findSimilarProtocols: (...a: unknown[]) => findSimilarProtocols(...a),
  },
}));
vi.mock('../../protocol-optimizer-service', () => ({ protocolOptimizerService: {} }));
vi.mock('../../openai-service', () => ({ analyzeText: vi.fn(async () => 'narrative analysis') }));

// Imported ONCE, before any NODE_ENV is set below. That is the point: the gate
// reads process.env per request rather than capturing it at module load, so
// these tests can flip the environment after the router exists. A constant
// frozen at import time would make this file impossible to write — the reason
// server/routes/sso.ts gives for consulting its policy per request.
import analyticsRouter from '../analytics-routes';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { organizationId: 1 };
    next();
  });
  a.use('/api/analytics', analyticsRouter);
  return a;
}

const SESSION_ID = 'prod-gate-test';
const SESSION_DIR = path.join(process.cwd(), 'exports', SESSION_ID);

const ORIGINAL_ENV = process.env.NODE_ENV;
afterAll(() => {
  process.env.NODE_ENV = ORIGINAL_ENV;
  fs.rmSync(SESSION_DIR, { recursive: true, force: true });
});

const post = () =>
  request(app())
    .post('/api/analytics/demo-analysis')
    .send({ content: 'A protocol body.', session_id: SESSION_ID });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NODE_ENV = ORIGINAL_ENV;
  fs.rmSync(SESSION_DIR, { recursive: true, force: true });
  analyzeProtocol.mockResolvedValue({
    phase: 'Phase 2',
    indication: 'Duchenne muscular dystrophy',
    sample_size: 120,
    primary_endpoint: '6-minute walk distance',
    duration_weeks: 52,
  });
  findSimilarProtocols.mockResolvedValue([]);
});

describe('demo-analysis production gate', () => {
  it('returns 404 in production', async () => {
    process.env.NODE_ENV = 'production';
    const res = await post();
    expect(res.status).toBe(404);
    // 404, not 403, and the same body as server/routes/seed-demo.ts: a route
    // that should not exist in production must not advertise that it does.
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('runs none of the handler in production — no analysis, no model call, no file written', async () => {
    process.env.NODE_ENV = 'production';
    await post();
    // The gate precedes every side effect: were it installed inside the handler
    // instead of in front of it, these would have happened before the 404.
    expect(analyzeProtocol).not.toHaveBeenCalled();
    expect(findSimilarProtocols).not.toHaveBeenCalled();
    expect(fs.existsSync(SESSION_DIR)).toBe(false);
  });

  it('still serves the endpoint outside production', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(analyzeProtocol).toHaveBeenCalled();
    expect(res.body.wisdom_trace).toBeDefined();
  });

  it('gates on the environment at request time, not at module load', async () => {
    // The router was imported before any of this ran. If the gate had captured
    // NODE_ENV at import, the production request below would still be served.
    const dev = await post();
    expect(dev.status).toBe(200);

    process.env.NODE_ENV = 'production';
    const prod = await post();
    expect(prod.status).toBe(404);
  });
});
