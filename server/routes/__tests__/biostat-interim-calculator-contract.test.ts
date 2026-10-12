/**
 * The workbench's interim calculator and the route agree (2026-10-12).
 *
 * `biostatCalculators.ts` is DATA: the workbench generates one form per entry
 * and posts `'/api/biostat' + calc.path`. So a calculator is reachable only if
 * the body its form builds is the body its route accepts — and nothing checked
 * that for any of the sixteen. The two halves live in different files and
 * different test environments, so this file drives the REAL registry through
 * the REAL `buildRequestBody` and feeds the result to the REAL route.
 *
 * It exists because the interim calculator is the first entry with dotted
 * field keys (`designEffect.nPerArm`, `prior.sd`) and with a pair of fields
 * that must be supplied together. A form that posts `{designEffect:
 * {standardizedEffect: 0.4}}` gets a 400, which is correct — and a reader
 * should be able to see that it is deliberate rather than discover it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 1, organizationId: 1 };
    next();
  },
}));

import router from '../biostat-design-stats';
import { CALCULATORS, buildRequestBody } from '../../../client/src/concept2cure/v2/surfaces/biostatCalculators';

const calc = CALCULATORS.find((c) => c.id === 'interim-look')!;

function app() {
  const a = express();
  a.use(express.json({ limit: '1mb' }));
  a.use('/api/biostat', router);
  return a;
}

/** Drive the registry exactly as the workbench does, then post what it built. */
const run = async (values: Record<string, string>) => {
  const built = buildRequestBody(calc, values);
  const res = await request(app()).post(`/api/biostat${calc.path}`).send(built.body);
  return { built, res };
};

const COMPLETE = {
  informationFractions: '0.5, 1',
  lookNumber: '1',
  observedZ: '2.0',
  spendingFunction: 'obrien-fleming',
};

beforeEach(() => {
  expect(calc, 'the interim-look calculator is missing from the registry').toBeTruthy();
});

describe('the calculator is declared against the route it posts to', () => {
  it('posts to a path the router actually serves', async () => {
    const { res } = await run(COMPLETE);
    expect(res.status, `POST /api/biostat${calc.path} was not served`).not.toBe(404);
    expect(res.status).toBe(200);
  });

  it('its required fields are exactly what the route requires', async () => {
    // The form refuses before any request when a required field is blank, so
    // the route's own 400 for the same field is never reached from the UI.
    const built = buildRequestBody(calc, { ...COMPLETE, observedZ: '' });
    expect(built.errors.length).toBeGreaterThan(0);
    expect(built.fieldErrors.observedZ).toMatch(/required/i);

    // And every field the route requires is a non-optional field here.
    const required = calc.fields.filter((f) => !f.optional).map((f) => f.key).sort();
    expect(required).toEqual(['informationFractions', 'lookNumber', 'observedZ', 'spendingFunction']);
  });

  it('builds the dotted keys into the nested objects the route reads', async () => {
    const { built, res } = await run({
      ...COMPLETE,
      'designEffect.standardizedEffect': '0.4',
      'designEffect.nPerArm': '120',
      'prior.mean': '2.8',
      'prior.sd': '1.0',
    });

    expect(built.body.designEffect).toEqual({ standardizedEffect: 0.4, nPerArm: 120 });
    expect(built.body.prior).toEqual({ mean: 2.8, sd: 1 });

    expect(res.status).toBe(200);
    // theta = 0.4 * sqrt(120/2) = 3.0984; CP under H1 at Z=2, t=0.5.
    expect(res.body.data.conditionalPower.designEffect.drift).toBeCloseTo(3.0984, 3);
    expect(res.body.data.conditionalPower.designEffect.conditionalPower).toBeCloseTo(0.9203, 3);
    expect(res.body.data.predictivePower.prior).toMatchObject({ mean: 2.8, sd: 1 });
  });

  it('omits an optional field left blank, rather than sending a zero', async () => {
    const { built, res } = await run(COMPLETE);
    expect(built.body).not.toHaveProperty('designEffect');
    expect(built.body).not.toHaveProperty('prior');
    expect(built.body).not.toHaveProperty('alpha');
    // So the engine reports H1 as not computed and uses a flat prior.
    expect(res.body.data.conditionalPower.designEffect.conditionalPower).toBeNull();
    expect(res.body.data.predictivePower.prior).toBe('flat');
  });

  it('a half-filled pair is refused by the route, in a sentence naming the field', async () => {
    const half = await run({ ...COMPLETE, 'designEffect.standardizedEffect': '0.4' });
    expect(half.built.errors).toEqual([]);          // the form allows it: both are optional
    expect(half.res.status).toBe(400);              // the route does not
    expect(half.res.body.error).toMatch(/nPerArm/);

    const halfPrior = await run({ ...COMPLETE, 'prior.mean': '2.8' });
    expect(halfPrior.res.status).toBe(400);
    expect(halfPrior.res.body.error).toMatch(/prior/);
  });

  it('offers only the spending functions the engine implements', async () => {
    const field = calc.fields.find((f) => f.key === 'spendingFunction')!;
    const offered = (field.options ?? []).map((o) => o.value).sort();
    expect(offered).toEqual(['linear', 'obrien-fleming', 'pocock']);

    // And the route refuses anything else, so the two cannot drift apart
    // without this failing.
    const res = await request(app())
      .post(`/api/biostat${calc.path}`)
      .send({ informationFractions: [0.5, 1], lookNumber: 1, observedZ: 2, spendingFunction: 'haybittle' });
    expect(res.status).toBe(400);
  });

  it('does not offer designDrift, which the route refuses alongside designEffect', async () => {
    // One way in from the UI, so the "not both" refusal is unreachable by a
    // user and the two can never disagree on screen.
    expect(calc.fields.some((f) => f.key === 'designDrift')).toBe(false);
  });
});
