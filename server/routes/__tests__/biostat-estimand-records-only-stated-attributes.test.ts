/**
 * POST /api/biostat/estimand/define records the ICH E9(R1) attributes it was
 * given, and refuses by name the ones it was not.
 *
 * The route filled a missing summary measure with 'difference_in_means' and a
 * missing strategy with 'treatment_policy'. The estimand engine's own check
 * flags a missing summary measure as non-compliant — the route supplied one
 * first, so an estimand nobody finished was stored, and could be judged
 * ichE9R1Compliant, on attributes nobody chose. The real engine runs; only the
 * database and the session are replaced.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const S = vi.hoisted(() => ({ inserts: [] as Array<Record<string, unknown>> }));

vi.mock('../../db', () => {
  const q = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  return {
    pool: { query: q, connect: vi.fn() },
    getPool: () => ({ query: q, connect: vi.fn() }),
    db: {
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          S.inserts.push(v);
          return { returning: async () => [{ id: 31 }] };
        },
      }),
    },
  };
});

vi.mock('../../middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/auth')>();
  return {
    ...actual,
    authenticateToken: (req: any, _res: any, next: any) => {
      req.user = { id: 1, organizationId: 7 };
      next();
    },
  };
});

const { default: biostatRouter } = await import('../biostatPlatform');

const app = express();
app.use(express.json());
app.use('/api/biostat', biostatRouter);

const ESTIMAND = {
  endpoint: 'Change from baseline in HbA1c at week 24',
  population: 'All randomized participants (ITT)',
  intercurrentEvents: [{ name: 'Rescue medication', strategy: 'hypothetical' }],
};

beforeEach(() => {
  S.inserts.length = 0;
});

describe('POST /api/biostat/estimand/define', () => {
  it('refuses an estimand with no summary measure or strategy, naming both, and stores nothing', async () => {
    const res = await request(app).post('/api/biostat/estimand/define').send(ESTIMAND);
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/summaryMeasure.*strategy/);
    expect(S.inserts).toEqual([]);
  });

  it('stores the attributes that were stated', async () => {
    const res = await request(app)
      .post('/api/biostat/estimand/define')
      .send({ ...ESTIMAND, summaryMeasure: 'Difference in means', strategy: 'treatment_policy' });
    expect(res.status).toBe(200);
    expect(S.inserts[0]).toMatchObject({ summaryMeasure: 'Difference in means', strategy: 'treatment_policy' });
  });
});
