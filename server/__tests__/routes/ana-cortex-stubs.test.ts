import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

// Mock pattern matches anaCortexCompatibility.test.ts so the route file's
// module-load chain (db → drizzle-orm, services/ana-cortex-service, schema,
// auth) resolves cleanly in the vitest worker. The handlers under test do
// not call db or anaCortexService, but importing the route file requires
// these mocks because Node resolves the imports at module-load time.
vi.mock('../../services/ana-cortex-service', () => ({
  anaCortexService: {
    getCapabilityHealth: vi.fn(async () => ({
      module: 'AnA Cortex',
      engineVersion: 'AnA 1.0 RI',
      availability: 'available',
    })),
    harvest10KFilings: vi.fn(async () => ({ harvested: 0, atomsCreated: 0 })),
    syncObservationTermsFromCSR: vi.fn(async () => ({ termsCreated: 0 })),
  },
}));

vi.mock('../../db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => []),
      })),
    })),
  },
}));

vi.mock('@shared/schema', () => ({
  anaObservationTerms: { organizationId: 1, category: 1, termType: 1 },
}));

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

describe('AnA Cortex fabricated endpoint stubs', () => {
  // Regression guard. Three endpoints in server/routes/ana-cortex.ts previously
  // returned hardcoded JSON disguised as AI output (fabricated confidence scores,
  // dollar-impact estimates, ICH section coverage) without calling the AI gateway
  // or touching the database. They were replaced with 501 stubs until a
  // validated, gateway-routed implementation lands. This test fails if anyone
  // restores the fabricated behaviour.

  it('returns 501 NOT_IMPLEMENTED for all three previously-fabricated endpoints', async () => {
    const { default: router } = await import('../../routes/ana-cortex');
    const app = express();
    app.use(express.json());
    app.use('/api/ana-cortex', router);

    const regAnalysis = await request(app)
      .post('/api/ana-cortex/regulatory-analysis')
      .send({ query: 'anything' });
    expect(regAnalysis.status).toBe(501);
    expect(regAnalysis.body?.code).toBe('NOT_IMPLEMENTED');
    // Forbidden fabricated fields must NOT be present.
    expect(regAnalysis.body?.overall_confidence_score).toBeUndefined();
    expect(regAnalysis.body?.cost_analysis).toBeUndefined();
    expect(regAnalysis.body?.comprehensive_analysis).toBeUndefined();

    const ichGuidance = await request(app)
      .post('/api/ana-cortex/ich-e6r3-guidance')
      .send({ query: 'anything' });
    expect(ichGuidance.status).toBe(501);
    expect(ichGuidance.body?.code).toBe('NOT_IMPLEMENTED');
    expect(ichGuidance.body?.confidence_score).toBeUndefined();
    expect(ichGuidance.body?.ich_e6r3_guidance).toBeUndefined();

    const intelligence = await request(app).get('/api/ana-cortex/intelligence');
    expect(intelligence.status).toBe(501);
    expect(intelligence.body?.code).toBe('NOT_IMPLEMENTED');
    expect(intelligence.body?.feeds).toBeUndefined();
  });
});
