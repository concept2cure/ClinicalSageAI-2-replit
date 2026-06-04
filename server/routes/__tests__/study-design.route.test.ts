/**
 * HTTP-level smoke for the mounted study-design router. This imports the real router
 * (the same module the app mounts at /api/study-design), so it proves the route *loads*
 * with its db/governance imports intact, and that the read-only endpoints — validate and
 * simulate — actually respond. The auth gate is exercised too. Persist/load/list need a
 * database and are covered by the pure repository tests, not here.
 */

import { describe, it, expect } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import router from '../study-design';

/** A minimal valid two-arm superiority design. */
function design() {
  return {
    title: 'Phase 3 route fixture',
    phase: '3',
    indication: 'type 2 diabetes',
    objectives: [{ level: 'primary', order: 1, text: 'Superiority', endpointName: 'Primary' }],
    estimands: [],
    endpoints: [{ name: 'Primary', role: 'primary', type: 'continuous', definition: 'change at week 24' }],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: { targetDescription: 'adults', analysisPopulations: [{ kind: 'ITT', definition: 'all' }], eligibility: [] },
    arms: [
      { name: 'Drug', interventions: [{ name: 'Drug', role: 'investigational' }] },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo' }] },
    ],
    randomization: { ratio: [1, 1], allocationMethod: 'stratified', blinding: 'double' },
    statisticalPlan: { alpha: 0.05, oneSided: true, plannedSampleSize: 300, plannedAnalyses: [{ endpointName: 'Primary', method: 'MMRM' }] },
  };
}

/** App with an authenticated user injected. */
function authedApp() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 1, organizationId: 1 };
    next();
  });
  app.use('/api/study-design', router);
  return app;
}

/** App with no authenticated user. */
function anonApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/study-design', router);
  return app;
}

describe('POST /api/study-design/validate', () => {
  it('returns a defensibility report for a valid design', async () => {
    const res = await request(authedApp()).post('/api/study-design/validate').send({ design: design() });
    expect(res.status).toBe(200);
    expect(res.body.validation).toBeDefined();
    expect(typeof res.body.validation.riskLevel).toBe('string');
    expect(typeof res.body.validation.canAdvance).toBe('boolean');
  });

  it('rejects a malformed body with 400', async () => {
    const res = await request(authedApp()).post('/api/study-design/validate').send({ design: { title: '' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_DESIGN');
  });
});

describe('POST /api/study-design/simulate', () => {
  it('runs a seeded simulation and returns the probability of success', async () => {
    const res = await request(authedApp())
      .post('/api/study-design/simulate')
      .send({ design: design(), plannedEffect: 0.3, nPerArm: 150, nRuns: 4000, seed: 1 });
    expect(res.status).toBe(200);
    const pos = res.body.summary?.probabilityOfSuccess;
    expect(typeof pos).toBe('number');
    expect(pos).toBeGreaterThan(0);
    expect(pos).toBeLessThanOrEqual(1);
    expect(res.body.provenance?.seed).toBeDefined();
  });

  it('is reproducible across identical requests', async () => {
    const body = { design: design(), plannedEffect: 0.3, nPerArm: 150, nRuns: 4000, seed: 99 };
    const a = await request(authedApp()).post('/api/study-design/simulate').send(body);
    const b = await request(authedApp()).post('/api/study-design/simulate').send(body);
    expect(a.body.summary.probabilityOfSuccess).toBe(b.body.summary.probabilityOfSuccess);
  });

  it('returns 422 for a design it will not fake (single-arm)', async () => {
    const d = design();
    d.framework = { inferentialFrame: 'superiority', structuralDesign: 'single_arm', controlType: 'none' } as any;
    const res = await request(authedApp())
      .post('/api/study-design/simulate')
      .send({ design: d, plannedEffect: 0.3, nPerArm: 150 });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('CANNOT_SIMULATE');
  });
});

describe('auth gate', () => {
  it('rejects simulate without an authenticated tenant', async () => {
    const res = await request(anonApp()).post('/api/study-design/simulate').send({ design: design(), plannedEffect: 0.3 });
    expect(res.status).toBe(401);
  });

  it('rejects list without an authenticated tenant', async () => {
    const res = await request(anonApp()).get('/api/study-design');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/study-design/sample-size', () => {
  it('returns power-based and assurance-based sizes', async () => {
    const res = await request(authedApp())
      .post('/api/study-design/sample-size')
      .send({ design: design(), plannedEffect: 0.4, assumptionSd: 0.18, targetPower: 0.8, targetAssurance: 0.8 });
    expect(res.status).toBe(200);
    const ss = res.body.sampleSize;
    expect(typeof ss.nPerArmForPower).toBe('number');
    // Same target ⇒ assurance needs more subjects than power.
    expect(ss.nPerArmForAssurance).toBeGreaterThan(ss.nPerArmForPower);
    expect(typeof ss.assuranceCeiling).toBe('number');
  });

  it('rejects sizing without an authenticated tenant', async () => {
    const res = await request(anonApp())
      .post('/api/study-design/sample-size')
      .send({ design: design(), plannedEffect: 0.4 });
    expect(res.status).toBe(401);
  });
});
