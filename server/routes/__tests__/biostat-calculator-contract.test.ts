/**
 * Every workbench calculator posts a body its own route accepts (2026-10-12).
 *
 * `biostatCalculators.ts` is DATA: the workbench generates one form per entry
 * and posts `calculatorEndpoint(calc)`. So a calculator is reachable only if
 * the body its form builds is the body its route accepts — and until this file
 * nothing checked that for any of them. The two halves live in different
 * files, different trees and different test environments, so this drives the
 * REAL registry through the REAL `buildRequestBody` and feeds the result to
 * the REAL routers.
 *
 * The failure mode it exists to catch is invisible to a screenshot and to a
 * typecheck: the form looks right, the key is subtly wrong, and the server
 * answers 200 computed from its own defaults. Two live examples that shaped
 * this file:
 *
 *   - The eleven CLSI analytical and clinical-performance calculators post to
 *     `/api/diagnostics-performance`, which answers `{result}` where
 *     `/api/biostat` answers `{success, data}`. Reading the wrong key yields
 *     null, which the workbench renders as "Calculation failed" — a refusal
 *     shown where a result was returned. Hence `resultKey` per calculator, and
 *     the envelope case below.
 *   - The interim calculator is the first with dotted field keys
 *     (`designEffect.nPerArm`, `prior.sd`) and with a pair of fields that must
 *     be supplied together. A form that posts half a pair gets a 400, which is
 *     correct — and a reader should be able to see that it is deliberate
 *     rather than discover it.
 *
 * Each case names the calculator it is about, so a failure says which registry
 * entry drifted from which route.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

/* The auth gate is not what these cases are about. Both middlewares are
   replaced so a validated user reaches every handler; what is under test is
   whether the BODY is accepted. `/api/diagnostics-performance` is role-gated
   with requireRole('regulatory-author'), so that gate is admitted too. */
vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 1, organizationId: 1, roles: ['regulatory-author'] };
    next();
  },
  requireRole: () => (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 1, organizationId: 1, roles: ['regulatory-author'] };
    next();
  },
}));

import designStatsRouter from '../biostat-design-stats';
import diagnosticsPerformanceRouter from '../diagnostics-performance';
import {
  CALCULATORS,
  buildRequestBody,
  calculatorEndpoint,
  calculatorResultKey,
  DEFAULT_CALCULATOR_BASE,
} from '../../../client/src/concept2cure/v2/surfaces/biostatCalculators';

const IVD_BASE = '/api/diagnostics-performance';

function app() {
  const a = express();
  a.use(express.json({ limit: '1mb' }));
  a.use(DEFAULT_CALCULATOR_BASE, designStatsRouter);
  a.use(IVD_BASE, diagnosticsPerformanceRouter);
  return a;
}

const calc = CALCULATORS.find((c) => c.id === 'interim-look')!;

/** Drive the registry exactly as the workbench does, then post what it built. */
const run = async (values: Record<string, string>) => {
  const built = buildRequestBody(calc, values);
  const res = await request(app()).post(calculatorEndpoint(calc)).send(built.body);
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

/**
 * A filled-in value for every field kind, so each calculator can be driven
 * end to end without hand-writing 27 fixtures. The values are shaped to
 * satisfy each route's own domain guards (a run design must be balanced, an
 * agreement matrix square, information fractions must end at 1), because a
 * 400 from a domain guard would make these cases pass or fail for a reason
 * that has nothing to do with the key names.
 */
const SAMPLE: Record<string, string> = {
  // Shapes that several calculators share.
  informationFractions: '0.5, 1',
  driftGrid: '0, 1, 2',
  // Everything else falls back by field kind below.
};

function sampleFor(field: { key: string; kind: string; options?: Array<{ value: string }> }): string {
  if (SAMPLE[field.key]) return SAMPLE[field.key];
  switch (field.kind) {
    case 'select':
      return field.options?.[0]?.value ?? '';
    case 'int':
      return field.key === 'lookNumber' ? '1' : '12';
    case 'number':
      return '0.5';
    case 'numlist':
      return '1, 2, 3, 4, 5';
    case 'rows':
      // Four lines of four numbers: balanced for EP05, square for a 2x2+
      // matrix, and enough levels for EP06's three-level minimum.
      return '1 2 3 4\n2 3 4 5\n3 4 5 6\n4 5 6 7';
    default:
      return 'x';
  }
}

const filledValues = (c: typeof CALCULATORS[number]): Record<string, string> =>
  Object.fromEntries(c.fields.map((f) => [f.key, sampleFor(f)]));

describe('every calculator in the registry', () => {
  it('declares a base this test app actually mounts', () => {
    const bases = new Set(CALCULATORS.map((c) => c.base ?? DEFAULT_CALCULATOR_BASE));
    expect([...bases].sort()).toEqual([DEFAULT_CALCULATOR_BASE, IVD_BASE].sort());
  });

  it.each(CALCULATORS.map((c) => [c.id, c] as const))(
    '%s posts to a path its router serves',
    async (_id, c) => {
      const built = buildRequestBody(c, filledValues(c));
      const res = await request(app()).post(calculatorEndpoint(c)).send(built.body);
      // A 404 means the registry names a path nothing serves — the one outcome
      // that is always a registry bug. A 400 is a domain guard rejecting this
      // generic fixture, which is the route working.
      expect(res.status, `${calculatorEndpoint(c)} is not served`).not.toBe(404);
      expect(res.status, `${calculatorEndpoint(c)} rejected the request before any handler`).not.toBe(401);
      expect(res.status, `${calculatorEndpoint(c)} refused the role`).not.toBe(403);
    },
  );

  it.each(CALCULATORS.map((c) => [c.id, c] as const))(
    '%s builds a body with no field left unmapped',
    (_id, c) => {
      const built = buildRequestBody(c, filledValues(c));
      expect(built.errors, `${c.id}: ${built.errors.join('; ')}`).toEqual([]);
      // Every non-optional field has to appear in the body under its own
      // (possibly dotted) path. A typo'd key would silently vanish here and
      // the server would compute from its own default.
      for (const f of c.fields.filter((x) => !x.optional)) {
        const value = f.key.split('.').reduce<any>((acc, k) => (acc == null ? acc : acc[k]), built.body);
        expect(value, `${c.id}: ${f.key} is missing from the built body`).not.toBeUndefined();
      }
    },
  );

  it('reads each result out of the envelope its own router uses', async () => {
    /* The whole point of `resultKey`. /api/biostat answers {success, data} and
       /api/diagnostics-performance answers {result}; a calculator declaring
       the wrong one renders "Calculation failed" on a successful computation. */
    const checked: string[] = [];
    for (const c of CALCULATORS) {
      const built = buildRequestBody(c, filledValues(c));
      const res = await request(app()).post(calculatorEndpoint(c)).send(built.body);
      if (res.status !== 200) continue;   // a domain guard; not this case's subject
      const key = calculatorResultKey(c);
      expect(res.body[key], `${c.id} answered 200 but has nothing under "${key}"`).toBeDefined();
      checked.push(c.id);
    }
    // At least one calculator from each router must have reached 200, or this
    // case would pass by computing nothing.
    expect(checked.some((id) => CALCULATORS.find((c) => c.id === id)?.base === undefined)).toBe(true);
    expect(checked.some((id) => CALCULATORS.find((c) => c.id === id)?.base === IVD_BASE)).toBe(true);
  });

  it('has no duplicate id, and shares an endpoint only with a mode discriminator', () => {
    const ids = CALCULATORS.map((c) => c.id);
    expect(new Set(ids).size, 'two calculators share an id').toBe(ids.length);

    /* Two calculators MAY post to one endpoint when the server switches on a
       `fixedBody` discriminator — /dose-finding/boin serves both the boundary
       table and a single decision, and /diagnostic/sizing serves both the
       one-endpoint and the co-primary sizing. What must not happen is two
       entries posting the same body to the same path, which would be one
       calculator rendered twice under different titles. */
    const byEndpoint = new Map<string, typeof CALCULATORS>();
    for (const c of CALCULATORS) {
      const e = calculatorEndpoint(c);
      byEndpoint.set(e, [...(byEndpoint.get(e) ?? []), c]);
    }
    for (const [endpoint, sharing] of byEndpoint) {
      if (sharing.length === 1) continue;
      const discriminators = sharing.map((c) => JSON.stringify(c.fixedBody ?? null));
      expect(
        new Set(discriminators).size,
        `${endpoint} is shared by ${sharing.map((c) => c.id).join(', ')} with no distinguishing fixedBody`,
      ).toBe(sharing.length);
    }
  });
});
