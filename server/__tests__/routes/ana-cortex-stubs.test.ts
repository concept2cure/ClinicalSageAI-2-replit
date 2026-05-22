import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

// Same alias-resolution + auth mocks as ana-cortex-correlation.test.ts — the
// route transitively loads ana-cortex-service.ts which imports from
// `@shared/schema`, and the auth middleware imports a `.ts` file via `.js`
// that Node ESM strict mode rejects under vitest.
vi.mock('@shared/schema', () => ({
  anaDataAtoms: { organizationId: 'organizationId', termId: 'termId' },
  anaFilingDocuments: { organizationId: 'organizationId', filingDate: 'filingDate' },
  anaObservationTerms: {
    organizationId: 'organizationId',
    category: 'category',
    termType: 'termType',
    term: 'term',
  },
  csrReports: { id: 'id', organizationId: 'organizationId' },
}));

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  authenticateToken: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

describe('AnA Cortex fabricated endpoint stubs', () => {
  // Regression guard. Three endpoints in server/routes/ana-cortex.ts previously
  // returned hardcoded JSON disguised as AI output (fabricated confidence scores,
  // dollar-impact estimates, ICH section coverage) without calling the AI
  // gateway or touching the database. They were replaced with 501 stubs until
  // validated, gateway-routed implementations land. These tests fail if anyone
  // restores the fabricated behaviour.

  async function mountRouter() {
    const { default: router } = await import('../../routes/ana-cortex');
    const app = express();
    app.use(express.json());
    app.use('/api/ana-cortex', router);
    return app;
  }

  it('POST /regulatory-analysis returns 501 NOT_IMPLEMENTED', async () => {
    const app = await mountRouter();
    const res = await request(app)
      .post('/api/ana-cortex/regulatory-analysis')
      .send({ query: 'anything' });

    expect(res.status).toBe(501);
    expect(res.body?.success).toBe(false);
    expect(res.body?.code).toBe('NOT_IMPLEMENTED');
    // The forbidden fabricated fields must NOT be present.
    expect(res.body?.overall_confidence_score).toBeUndefined();
    expect(res.body?.cost_analysis).toBeUndefined();
    expect(res.body?.comprehensive_analysis).toBeUndefined();
  });

  it('POST /ich-e6r3-guidance returns 501 NOT_IMPLEMENTED', async () => {
    const app = await mountRouter();
    const res = await request(app)
      .post('/api/ana-cortex/ich-e6r3-guidance')
      .send({ query: 'anything' });

    expect(res.status).toBe(501);
    expect(res.body?.success).toBe(false);
    expect(res.body?.code).toBe('NOT_IMPLEMENTED');
    expect(res.body?.confidence_score).toBeUndefined();
    expect(res.body?.ich_e6r3_guidance).toBeUndefined();
  });

  it('GET /intelligence returns 501 NOT_IMPLEMENTED', async () => {
    const app = await mountRouter();
    const res = await request(app).get('/api/ana-cortex/intelligence');

    expect(res.status).toBe(501);
    expect(res.body?.success).toBe(false);
    expect(res.body?.code).toBe('NOT_IMPLEMENTED');
    expect(res.body?.feeds).toBeUndefined();
  });
});
