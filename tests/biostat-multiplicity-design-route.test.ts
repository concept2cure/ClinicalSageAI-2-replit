/**
 * POST /api/biostat/multiplicity/design — the served layer of the multiplicity
 * designer (server/services/estimand-engine-service.ts, unit-tested in
 * server/services/__tests__/estimand-multiplicity-design.test.ts).
 *
 * Until 2026-09-28 the engine's refusals (no hypotheses, an unknown approach)
 * reached the caller as a 500, and a top-level `weights` or `familyStructure`
 * was destructured and dropped without a word.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const S = vi.hoisted(() => ({ inserts: [] as Array<Record<string, unknown>> }));

// The router transitively imports services that touch the DB at module load.
vi.mock('../server/db', () => {
  const q = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  return {
    pool: { query: q, connect: vi.fn() },
    getPool: () => ({ query: q, connect: vi.fn() }),
    db: {
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          S.inserts.push(v);
          return { returning: async () => [{ id: 17 }] };
        },
      }),
    },
  };
});

vi.mock('../server/middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/middleware/auth')>();
  return {
    ...actual,
    authenticateToken: (req: any, _res: any, next: any) => {
      req.user = { id: 1, organizationId: 7 };
      next();
    },
  };
});

const { default: biostatRouter } = await import('../server/routes/biostatPlatform');

const app = express();
app.use(express.json());
app.use('/api/biostat', biostatRouter);

const post = (body: unknown) => request(app).post('/api/biostat/multiplicity/design').send(body as object);

const HYPS = [
  { id: 'H1', description: 'Primary', endpoint: 'PFS' },
  { id: 'H2', description: 'Key secondary', endpoint: 'OS' },
  { id: 'H3', description: 'Key secondary', endpoint: 'ORR' },
];

describe('POST /api/biostat/multiplicity/design', () => {
  it('hochberg: 200 with the thresholds by rank and alpha/m by hypothesis', async () => {
    const r = await post({ hypotheses: HYPS, method: 'hochberg', alpha: 0.05 });
    expect(r.status).toBe(200);
    expect(r.body.data.approach).toBe('hochberg');
    expect(r.body.data.overallAlpha).toBe(0.05);
    expect(r.body.data.testingOrder).toBeNull();
    const t = r.body.data.rankThresholds as Array<{ rank: number; threshold: number }>;
    expect(t.map((x) => x.rank)).toEqual([1, 2, 3]);
    expect(t[1].threshold).toBeCloseTo(0.025, 15);
    for (const v of Object.values(r.body.data.alphaAllocation as Record<string, number>)) {
      expect(v).toBeCloseTo(0.05 / 3, 15);
    }
  });

  it('the route default alpha is visible in the response', async () => {
    const r = await post({ hypotheses: HYPS, method: 'holm' });
    expect(r.status).toBe(200);
    expect(r.body.data.overallAlpha).toBe(0.025);
  });

  it.each([
    // Refused as absent — not coerced to an empty family and refused as "empty".
    ['no hypotheses', { method: 'holm' }, /hypotheses must be an array; got undefined/],
    ['an empty family', { hypotheses: [], method: 'holm' }, /hypotheses is empty/],
    ['an unknown method', { hypotheses: HYPS, method: 'bonferroni' }, /approach "bonferroni"/],
    ['alpha out of range', { hypotheses: HYPS, method: 'holm', alpha: 1.5 }, /overallAlpha/],
    ['a repeated id', { hypotheses: [...HYPS, HYPS[0]], method: 'holm' }, /hypotheses\[3\]\.id/],
  ])('%s is a 400 naming the input, not a 500', async (_what, body, message) => {
    S.inserts.length = 0;
    const r = await post(body);
    expect(r.status).toBe(400);
    expect(r.body.success).toBe(false);
    expect(r.body.error).toMatch(message);
    expect(S.inserts).toHaveLength(0);
  });

  it.each([
    ['weights', { weights: [0.8, 0.1, 0.1] }],
    ['familyStructure', { familyStructure: { primary: ['H1'] } }],
  ])('a top-level %s, which the designer does not read, is refused', async (key, extra) => {
    S.inserts.length = 0;
    const r = await post({ hypotheses: HYPS, method: 'fallback', alpha: 0.05, ...extra });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(new RegExp(`${key} is not read`));
    expect(S.inserts).toHaveLength(0);
  });
});
