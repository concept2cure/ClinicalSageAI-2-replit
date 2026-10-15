/**
 * POST /api/biostat/external-control/synthesize passes the request's
 * matchingVariables to the service as the covariates it takes.
 *
 * Until 2026-10-15 the route destructured `matchingVariables` and dropped it,
 * so a control requested with named matching covariates was synthesised as if
 * none had been named, and a malformed list was accepted and ignored.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const S = vi.hoisted(() => ({ synthesize: vi.fn() }));

vi.mock('../../db', () => {
  const q = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  return { pool: { query: q, connect: vi.fn() }, getPool: () => ({ query: q, connect: vi.fn() }), db: {} };
});

vi.mock('../../middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/auth')>();
  return {
    ...actual,
    authenticateToken: (req: { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = { id: 1, organizationId: 7 };
      next();
    },
  };
});

vi.mock('../../services/external-control-arm-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/external-control-arm-service')>()),
  ExternalControlArmService: class {
    synthesizeControl = S.synthesize;
  },
}));

const { default: biostatRouter } = await import('../biostatPlatform');

const app = express();
app.use(express.json());
app.use('/api/biostat', biostatRouter);

const CONTROL = { indication: 'NSCLC', endpoint: 'Overall survival', sourceIds: [4, 5], method: 'propensity_score' };
const post = (body: Record<string, unknown>) => request(app).post('/api/biostat/external-control/synthesize').send(body);

beforeEach(() => {
  S.synthesize.mockReset().mockResolvedValue({ id: 9 });
});

describe('POST /api/biostat/external-control/synthesize — matchingVariables', () => {
  it('reaches the service as its covariates', async () => {
    const res = await post({ ...CONTROL, matchingVariables: ['age', 'ecog'] });
    expect(res.status).toBe(200);
    expect(S.synthesize.mock.calls[0]?.[0]?.covariates, 'the route dropped matchingVariables').toEqual(['age', 'ecog']);
  });

  it('refuses a matchingVariables that is not a list of covariate names, and builds nothing', async () => {
    for (const matchingVariables of ['age', ['age', ''], [3], { age: true }]) {
      const res = await post({ ...CONTROL, matchingVariables });
      expect(res.status, `matchingVariables ${JSON.stringify(matchingVariables)} was accepted and ignored`).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/matchingVariables/);
    }
    expect(S.synthesize).not.toHaveBeenCalled();
  });

  it('passes no covariates when the request names none', async () => {
    const res = await post(CONTROL);
    expect(res.status).toBe(200);
    expect(S.synthesize.mock.calls[0]?.[0]?.covariates).toBeUndefined();
  });
});
