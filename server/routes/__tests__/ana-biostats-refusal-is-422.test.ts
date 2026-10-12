/**
 * A refusal is a 422 with the engine's sentence, not a 500 (2026-10-11).
 *
 * The engine's refusal contract exists so a caller can tell "I need one more
 * input" from "the computation broke" (`ComputationRefusal`, 2026-10-05, and
 * `AnaToolExecutor.biostatsRefusal` for the tool path). Every handler in this
 * router sent every throw to `serverError`, so the HTTP surface collapsed the
 * distinction: a design the engine declined to size came back as
 *
 *   500 { error: 'INTERNAL_ERROR',
 *         message: 'Something went wrong while saving compute. The problem
 *                   has been logged.' }
 *
 * The browser could therefore never show a refusal, however honestly the
 * engine phrased one — and "the problem has been logged" is the wrong thing to
 * tell someone whose design simply lacks an input. This is the HTTP half of
 * the same defect, and it is what the biostatistics surface's refusal state
 * renders.
 *
 * A missing tenant had the same shape: `resolveOrganizationId` threw a plain
 * Error inside the try, so an un-tenanted session got a 500 instead of the 403
 * that `orgRequired` exists for.
 *
 * RED before the fix: every case below reads 500 / INTERNAL_ERROR.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

/* The auth gate is not what these cases are about: the router's own
   `authenticateToken` wants a real token and would answer 401 before any
   handler runs. It is replaced with one that installs whatever user the case
   asks for, so the thing under test is how a THROW from the engine is
   reported. */
const authState: { user: unknown } = { user: { id: 1, organizationId: 1 } };
vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    if (authState.user) (req as any).user = authState.user;
    next();
  },
}));

import router from '../ana-biostats';

/** The engine's own input contract (server/services/ana-biostats/types.ts). */
const BASE = {
  clientTrack: 'biotech_pharma',
  studyType: 'superiority',
  objectiveType: 'efficacy',
  endpointType: 'continuous',
  alpha: 0.05,
  powerTarget: 0.8,
  effectSize: 0.5,
  attritionRate: 0.1,
  allocationRatio: 1,
  numberOfGroups: 2,
};

function app(user: unknown = { id: 1, organizationId: 1 }) {
  authState.user = user;
  const a = express();
  a.use(express.json({ limit: '4mb' }));
  a.use('/api/ana-biostats', router);
  return a;
}

beforeEach(() => {
  authState.user = { id: 1, organizationId: 1 };
});

describe('a design the engine declines to size', () => {
  /* An agreement (kappa) design: the published methods need a null kappa and
     the marginal prevalence, which the input contract does not carry, so the
     engine refuses outright on every track. */
  const AGREEMENT = { ...BASE, endpointType: 'agreement', agreementTarget: 0.8 };

  it('answers 422 with the engine’s own sentence, not 500', async () => {
    const res = await request(app()).post('/api/ana-biostats/compute').send(AGREEMENT);

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/kappa/i);
    expect(res.body.details).toMatchObject({ refusal: true, code: 'not_supported' });
    // The two sentences a refusal must never be reported as.
    expect(JSON.stringify(res.body)).not.toMatch(/INTERNAL_ERROR/);
    expect(JSON.stringify(res.body)).not.toMatch(/went wrong/i);
  });

  it('names the field it needs, so a form can mark the control', async () => {
    const res = await request(app())
      .post('/api/ana-biostats/compute')
      .send({ ...BASE, endpointType: 'sensitivity_specificity' });

    expect(res.status).toBe(422);
    expect(res.body.details.field).toBe('sensitivity');
    expect(res.body.details.code).toBe('missing_input');
    expect(res.body.error).toMatch(/sensitivity/i);
  });

  it('carries no figure of any kind with the refusal', async () => {
    const res = await request(app()).post('/api/ana-biostats/compute').send(AGREEMENT);
    expect(res.body).not.toHaveProperty('computation');
    expect(res.body).not.toHaveProperty('sampleSize');
  });

  /* The sizing routes. `/multiplicity` is not one of them — it adjusts alpha
     across endpoints and never dispatches on the endpoint type, so there is no
     input it refuses; the case below pins that it answers rather than
     refusing, which is the honest behaviour for it. */
  it.each([
    ['/api/ana-biostats/compute-enhanced', (b: object) => b],
    ['/api/ana-biostats/compare', (b: object) => ({ scenarioA: BASE, scenarioB: b })],
  ] as const)('reports the refusal the same way on %s', async (path, body) => {
    const res = await request(app()).post(path).send(body(AGREEMENT));
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).not.toMatch(/INTERNAL_ERROR/);
  });

  it('is still sized for multiplicity, which does not depend on the endpoint type', async () => {
    const res = await request(app())
      .post('/api/ana-biostats/multiplicity')
      .send({ ...AGREEMENT, numberOfEndpoints: 3, multiplicityMethod: 'bonferroni' });
    expect(res.status).toBe(200);
    expect(res.body.adjustedAlphas[0]).toBeCloseTo(0.05 / 3, 12);
  });
});

describe('a design the engine CAN size still computes', () => {
  it('answers 200 with the deterministic result', async () => {
    const res = await request(app()).post('/api/ana-biostats/compute').send(BASE);
    expect(res.status).toBe(200);
    // 64 per group is the exact noncentral-t answer for d = 0.5 (R power.t.test).
    expect(res.body.computation.sampleSize.perGroup).toBe(64);
  });
});

describe('a session with no tenant', () => {
  it('is told the organization context is required, with a 403 rather than a 500', async () => {
    const res = await request(app({ id: 1 })).post('/api/ana-biostats/document').send({
      ...BASE,
      documentType: 'sample_size_rationale',
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/organization/i);
    expect(JSON.stringify(res.body)).not.toMatch(/INTERNAL_ERROR/);
  });
});
