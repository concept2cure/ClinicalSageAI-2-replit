/**
 * The interim look a DSMB actually sits in front of, over HTTP (2026-10-12).
 *
 * ── What was unreachable ─────────────────────────────────────────────────────
 * `calculateSpendingBoundaries`, `conditionalPowerScenarios` and
 * `computePredictivePower` (server/services/adaptive-trial-operations-service.ts)
 * are the engines a data monitoring committee needs at an interim: the
 * Lan–DeMets boundary at this look, and — given the observed z — the
 * probability the trial still wins, under the current trend, under the design
 * effect, and under H0, plus the Bayesian predictive probability.
 *
 * They were repaired on 2026-10-11 (conditional power had been computed under
 * H0 while labelled "current trend": 0.185 where 0.8903 is right; predictive
 * power 0.247 where 0.8074 is right) and pinned to published values in
 * tests/biostat/adaptive-and-spending-reference.test.ts. And they were
 * reachable only through the adaptive PLAN lifecycle — POST /adaptive/plan,
 * then an interim snapshot, then /evaluate/:snapshotId — which no client code
 * calls. A sponsor could not get the figure at all.
 *
 * This route is the stateless path: the design and the observed z in, the
 * boundary and the four probabilities out. No stored plan, no tenant data.
 * The plan lifecycle (stored snapshots, a governed decision ceremony) remains
 * scheduled and is NOT what this covers.
 *
 * ── Reference values ─────────────────────────────────────────────────────────
 * Two looks at t = 0.5 and 1, Lan–DeMets O'Brien–Fleming, one-sided α = 0.025:
 * boundaries 2.9627 and 1.9686, cumulative α 0.001525 and 0.025 (gsDesign).
 * Observed Z = 2.0 at the first look, against the final critical value 1.9686:
 *   current trend (θ = Z/√t)   0.8880
 *   H0 (θ = 0)                 0.2165
 *   design effect, d = 0.4 at n = 120/arm (θ = 3.0984)   0.9203
 *   predictive power, flat prior                          0.8051
 *
 * RED before the route existed: every case 404s.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const authState: { user: unknown } = { user: { id: 1, organizationId: 1 } };
vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    if (authState.user) (req as any).user = authState.user;
    next();
  },
}));

import router from '../biostat-design-stats';

const PATH = '/api/biostat/adaptive/interim';

/** The two-look O'Brien–Fleming design the reference values are for. */
const DESIGN = {
  informationFractions: [0.5, 1],
  alpha: 0.025,
  spendingFunction: 'obrien-fleming',
  lookNumber: 1,
  observedZ: 2.0,
};

function app(user: unknown = { id: 1, organizationId: 1 }) {
  authState.user = user;
  const a = express();
  a.use(express.json({ limit: '1mb' }));
  a.use('/api/biostat', router);
  return a;
}

const post = (body: unknown, user?: unknown) => request(app(user)).post(PATH).send(body as object);

beforeEach(() => {
  authState.user = { id: 1, organizationId: 1 };
});

describe('the boundary at this look', () => {
  it('solves the Lan–DeMets boundaries and says which look was read', async () => {
    const res = await post(DESIGN);
    expect(res.status).toBe(200);
    const d = res.body.data;

    expect(d.boundaries.criticalValues[0]).toBeCloseTo(2.9627, 3);
    expect(d.boundaries.criticalValues[1]).toBeCloseTo(1.9686, 3);
    expect(d.boundaries.cumulativeAlpha[0]).toBeCloseTo(0.001525, 5);
    expect(d.boundaries.cumulativeAlpha[1]).toBeCloseTo(0.025, 12);

    expect(d.look.number).toBe(1);
    expect(d.look.informationFraction).toBe(0.5);
    expect(d.look.criticalValue).toBeCloseTo(2.9627, 3);
    expect(d.look.observedZ).toBe(2.0);
  });

  it('says plainly whether the observed z crossed the boundary at this look', async () => {
    const below = await post(DESIGN);
    expect(below.body.data.look.crossedEfficacy).toBe(false);

    // 3.1 is above the 2.9627 first-look boundary.
    const above = await post({ ...DESIGN, observedZ: 3.1 });
    expect(above.body.data.look.crossedEfficacy).toBe(true);
  });

  it('names the method and its citation, so the figure is checkable', async () => {
    const res = await post(DESIGN);
    expect(res.body.data.boundaries.method).toMatch(/Lan.DeMets/i);
    expect(res.body.data.conditionalPower.citation).toMatch(/Lan & Wittes|Jennison/);
    expect(res.body.data.predictivePower.citation).toMatch(/Spiegelhalter/i);
  });
});

describe('the probability the trial still wins', () => {
  it('computes conditional power under the current trend and under H0', async () => {
    const d = (await post(DESIGN)).body.data;
    expect(d.conditionalPower.currentTrend.conditionalPower).toBeCloseTo(0.8880, 3);
    expect(d.conditionalPower.currentTrend.drift).toBeCloseTo(2 / Math.sqrt(0.5), 9);
    expect(d.conditionalPower.nullHypothesis.conditionalPower).toBeCloseTo(0.2165, 3);
    expect(d.conditionalPower.nullHypothesis.drift).toBe(0);
  });

  it('computes the design-effect figure from a drift given directly', async () => {
    const d = (await post({ ...DESIGN, designDrift: 3.0983866769659336 })).body.data;
    expect(d.conditionalPower.designEffect.conditionalPower).toBeCloseTo(0.9203, 3);
  });

  it('derives the drift from an effect size and n per arm, and discloses that it did', async () => {
    const d = (await post({ ...DESIGN, designEffect: { standardizedEffect: 0.4, nPerArm: 120 } })).body.data;
    expect(d.conditionalPower.designEffect.drift).toBeCloseTo(3.0984, 3);
    expect(d.conditionalPower.designEffect.conditionalPower).toBeCloseTo(0.9203, 3);
    // The derivation is stated, not silent: a reader must be able to see that
    // the drift came from d and n rather than from the plan.
    expect(JSON.stringify(d.derived)).toMatch(/standardized effect|driftForTwoSampleMeans/i);
  });

  it('computes predictive power with a flat prior', async () => {
    const d = (await post(DESIGN)).body.data;
    expect(d.predictivePower.value).toBeCloseTo(0.8051, 3);
    expect(d.predictivePower.prior).toBe('flat');
  });

  it('computes predictive power under a normal prior on the drift', async () => {
    const d = (await post({ ...DESIGN, prior: { mean: 2.8, sd: 1.0 } })).body.data;
    // A prior centred near the design drift raises it above the flat answer.
    expect(d.predictivePower.value).toBeGreaterThan(0.8051);
    expect(d.predictivePower.prior).toMatchObject({ mean: 2.8, sd: 1 });
  });
});

describe('what it refuses rather than assuming', () => {
  it('reports the H1 figure as not computed when no design effect was supplied', async () => {
    const d = (await post(DESIGN)).body.data;
    expect(d.conditionalPower.designEffect.conditionalPower).toBeNull();
    expect(d.conditionalPower.designEffect.drift).toBeNull();
    // And the reason names what THIS route would need, not a stored plan's fields.
    expect(d.conditionalPower.designEffect.reason).toMatch(/designDrift|designEffect/);
  });

  it.each([
    [{ informationFractions: [] }, /informationFractions/i],
    [{ informationFractions: [0.5, 1], lookNumber: 3 }, /lookNumber/i],
    [{ informationFractions: [0.5, 1], lookNumber: 0 }, /lookNumber/i],
    [{ informationFractions: [0.5, 1], lookNumber: 1 }, /observedZ/i],
    [{ informationFractions: [1, 0.5], lookNumber: 1, observedZ: 2 }, /increasing/i],
    [{ informationFractions: [0.5, 0.9], lookNumber: 1, observedZ: 2 }, /final analysis|last/i],
  ] as const)('refuses %j with a sentence naming the problem', async (body, pattern) => {
    const res = await post({ alpha: 0.025, spendingFunction: 'obrien-fleming', ...body });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(pattern);
  });

  it('refuses a spending function it has no formula for, rather than defaulting', async () => {
    const res = await post({ ...DESIGN, spendingFunction: 'haybittle' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/spendingFunction/);
  });

  it('refuses both a designDrift and a designEffect, which could disagree', async () => {
    const res = await post({ ...DESIGN, designDrift: 3.1, designEffect: { standardizedEffect: 0.4, nPerArm: 120 } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/designDrift|designEffect/);
  });

  it('is tenant-gated like its siblings', async () => {
    const res = await post(DESIGN, { id: 1 });
    expect(res.status).toBe(401);
  });
});

describe('the final look', () => {
  it('reads a conclusive result at t = 1 rather than a conditional probability', async () => {
    const d = (await post({ ...DESIGN, lookNumber: 2, observedZ: 2.5 })).body.data;
    expect(d.look.informationFraction).toBe(1);
    expect(d.look.crossedEfficacy).toBe(true);
    // At t = 1 there is nothing left to condition on: the engines return 1 or 0.
    expect(d.conditionalPower.currentTrend.conditionalPower).toBe(1);
    expect(d.predictivePower.value).toBe(1);
  });

  it('reads a miss at t = 1 as zero, not as a probability', async () => {
    const d = (await post({ ...DESIGN, lookNumber: 2, observedZ: 1.5 })).body.data;
    expect(d.look.crossedEfficacy).toBe(false);
    expect(d.conditionalPower.currentTrend.conditionalPower).toBe(0);
    expect(d.predictivePower.value).toBe(0);
  });
});
