/**
 * Three engines a sponsor could not reach, now reachable (2026-10-12).
 *
 * Each was declared in `server/services/stats/*`, correct, and referenced by
 * no route, no AnA tool and no client code — found by a reachability sweep
 * whose findings were each handed to a second agent told to prove them wrong.
 *
 * 1. `tippingPointBorrow` — the BORROWING-WEIGHT sensitivity of an
 *    external-control analysis: the same design swept over a0 from 1 to 0, so
 *    a reviewer can see at what borrowing weight the conclusion flips. "How
 *    much of your result depends on how much you borrowed?" is the question
 *    FDA and EMA ask of every external-control filing. It takes exactly the
 *    inputs `/external-control/sensitivity` already has, so it is part of that
 *    response rather than a second endpoint recomputing the same borrow and
 *    the same effect. (The route already ran `tippingPointBias`, which is the
 *    different sensitivity — bias in the historical control, not the weight.)
 * 2. `mmrmPower` — the power an MMRM design has at an n the sponsor names.
 *    The reverse of `/mmrm/sample-size`, and the question that follows a
 *    budget rather than precedes it.
 * 3. `accrualHoldoutError` — the forecast scored against what actually
 *    enrolled. A forecast never checked against reality is the thing a CRO is
 *    measured on; the platform produced the forecast and had no way to say how
 *    far off it was.
 */
import { describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 1, organizationId: 1 };
    next();
  },
  requireRole: () => (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 1, organizationId: 1 };
    next();
  },
}));

import router from '../biostat-design-stats';

function app() {
  const a = express();
  a.use(express.json({ limit: '1mb' }));
  a.use('/api/biostat', router);
  return a;
}
const post = (path: string, body: unknown) => request(app()).post(`/api/biostat${path}`).send(body as object);

describe('the external-control borrowing-weight sensitivity', () => {
  const DESIGN = {
    endpoint: 'ORR', meanT: 0.45, seT: 0.05,
    meanC: 0.3, seC: 0.06, nC: 40,
    meanH: 0.28, seH: 0.04, nH: 120,
    method: 'power-prior', a0: 0.5, alpha: 0.05,
  };

  it('sweeps a0 from 1 to 0 and reports where the conclusion flips', async () => {
    const res = await post('/external-control/sensitivity', DESIGN);
    expect(res.status).toBe(200);
    const t = res.body.data.tippingBorrow;

    expect(t, 'the borrowing-weight sweep is absent from the response').toBeTruthy();
    expect(t.grid.length).toBeGreaterThan(50);
    expect(t.grid[0].a0).toBe(1);
    expect(t.grid.at(-1).a0).toBe(0);
    // Every grid point carries the p-value at that weight and whether it held.
    expect(typeof t.grid[0].pValue).toBe('number');
    expect(typeof t.grid[0].significant).toBe('boolean');
    // `flips` says whether a tipping point exists at all, rather than leaving
    // a null tippingValue to be read as "no sensitivity".
    expect(typeof t.flips).toBe('boolean');
    expect(t.flips === (t.tippingValue !== null)).toBe(true);
  });

  it('is beside the BIAS tipping point, not instead of it', async () => {
    const res = await post('/external-control/sensitivity', DESIGN);
    // Two different questions: bias in the historical control, and how much of
    // it was borrowed. Both are asked of an external-control filing.
    expect(res.body.data.tipping).toBeTruthy();
    expect(res.body.data.tippingBorrow).toBeTruthy();
    expect(res.body.data.tipping).not.toEqual(res.body.data.tippingBorrow);
  });

  it('is deterministic — the same design gives the same sweep', async () => {
    const a = (await post('/external-control/sensitivity', DESIGN)).body.data.tippingBorrow;
    const b = (await post('/external-control/sensitivity', DESIGN)).body.data.tippingBorrow;

    /* Everything that reproduces the answer: the grid, where it flips, and the
       hash of the inputs it was computed from. `generatedAt` is a wall-clock
       reading and differs by design — `reproducibleProvenance` in
       stats/computation-provenance.ts exists for exactly this distinction, so
       comparing the whole object would assert the opposite of reproducible. */
    expect(a.grid).toEqual(b.grid);
    expect(a.tippingValue).toBe(b.tippingValue);
    expect(a.provenance.inputsSha256).toBe(b.provenance.inputsSha256);
    expect(a.provenance.reproducible).toBe(true);
  });
});

describe('MMRM power at a chosen n', () => {
  const DESIGN = {
    visits: 4, covariance: 'compound_symmetry', rho: 0.6, sigma: 2.5, delta: 1,
    retention: [1, 0.92, 0.86, 0.8], nPerArm: 90, alpha: 0.05,
  };

  it('answers the power, and the n the target power would need beside it', async () => {
    const res = await post('/mmrm/power', DESIGN);
    expect(res.status).toBe(200);
    const d = res.body.data;

    expect(d.power).toBeGreaterThan(0);
    expect(d.power).toBeLessThan(1);
    expect(d.nPerArm).toBe(90);
    // The sizing beside it, from the same engine, so the two cannot disagree.
    expect(d.atTargetPower.nPerArm).toBeGreaterThan(0);
    expect(d.atTargetPower.achievedPower).toBeGreaterThanOrEqual(d.atTargetPower.power);
    expect(d.varianceFactor).toBeGreaterThan(0);
    expect(d.provenance).toBeTruthy();
  });

  it('is below the target when n is below what the target needs, and above when above', async () => {
    const sized = (await post('/mmrm/power', DESIGN)).body.data.atTargetPower.nPerArm;
    const under = (await post('/mmrm/power', { ...DESIGN, nPerArm: sized - 20 })).body.data.power;
    const over = (await post('/mmrm/power', { ...DESIGN, nPerArm: sized + 20 })).body.data.power;
    expect(under).toBeLessThan(0.9);
    expect(over).toBeGreaterThan(0.9);
  });

  it('refuses a covariance structure it has no formula for', async () => {
    const res = await post('/mmrm/power', { ...DESIGN, covariance: 'unstructured' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/compound_symmetry|ar1/);
  });

  it('names the fields it needs rather than defaulting them', async () => {
    const res = await post('/mmrm/power', { visits: 4, covariance: 'ar1', retention: [1, 0.9] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rho/);
    expect(res.body.error).toMatch(/nPerArm/);
  });
});

describe('the enrollment forecast back-test', () => {
  const SITES = [
    { meanRate: 0.8, rateCv: 0.3, activationTime: 0 },
    { meanRate: 1.2, rateCv: 0.4, activationTime: 2 },
  ];

  it('scores each observed point and reports MAE and RMSE', async () => {
    const res = await post('/enrollment/backtest', {
      sites: SITES,
      observed: [{ time: 3, cumulative: 18 }, { time: 6, cumulative: 47 }, { time: 9, cumulative: 94 }],
    });
    expect(res.status).toBe(200);
    const d = res.body.data;

    expect(d.points).toHaveLength(3);
    for (const p of d.points) {
      expect(typeof p.expected).toBe('number');
      expect(p.error).toBeCloseTo(p.observed - p.expected, 10);
    }
    expect(d.meanAbsoluteError).toBeGreaterThanOrEqual(0);
    // RMSE is at least the MAE, always.
    expect(d.rootMeanSquaredError).toBeGreaterThanOrEqual(d.meanAbsoluteError - 1e-12);
  });

  it('reports zero error when the observed series IS the expectation', async () => {
    const first = await post('/enrollment/backtest', { sites: SITES, observed: [{ time: 6, cumulative: 0 }] });
    const expected = first.body.data.points[0].expected;
    const exact = await post('/enrollment/backtest', { sites: SITES, observed: [{ time: 6, cumulative: expected }] });
    expect(exact.body.data.meanAbsoluteError).toBeCloseTo(0, 10);
    expect(exact.body.data.rootMeanSquaredError).toBeCloseTo(0, 10);
  });

  it('refuses an empty or malformed observed series rather than scoring nothing', async () => {
    expect((await post('/enrollment/backtest', { sites: SITES, observed: [] })).status).toBe(400);
    expect((await post('/enrollment/backtest', { sites: SITES, observed: [{ time: 3 }] })).status).toBe(400);
    expect((await post('/enrollment/backtest', { sites: [], observed: [{ time: 3, cumulative: 1 }] })).status).toBe(400);
  });
});
