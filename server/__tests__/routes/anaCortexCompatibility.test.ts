import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

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
vi.mock('@shared/schema', () => ({ anaObservationTerms: { organizationId: 1, category: 1, termType: 1 } }));
vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

// The ICH-guidance handler now routes through the AI gateway (the prior
// fabricated handler was deleted). Mock the gateway to return a valid
// model JSON payload so the test exercises the real passthrough path
// without needing a live provider / API key.
vi.mock('../../services/ai-gateway', () => ({
  getGateway: () => ({
    route: vi.fn(async () => ({
      content: JSON.stringify({
        guidance_response: {
          answer: 'Mocked ICH E6(R3) guidance.',
          regulatory_framework: 'ICH_E6_R3',
          confidence_score: 0.9,
          supporting_sections: [],
          implementation_guidance: [],
          references: [],
        },
        query_metadata: {
          query_timestamp: new Date().toISOString(),
          processing_time_ms: 1,
          guidance_version: 'test',
        },
      }),
      provider: 'mock',
      model: 'mock',
    })),
  }),
}));

describe('AnA Cortex compatibility', () => {
  it('returns canonical headers and real AI-gateway shape for ana route mount', async () => {
    const { default: router } = await import('../../routes/ana-cortex');
    const app = express();
    app.use(express.json());
    app.use('/api/ana-cortex', router);

    const res = await request(app).post('/api/ana-cortex/ich-e6r3-guidance').send({ query: 'x' });
    expect(res.status).toBe(200);
    expect(res.headers['x-ana-cortex-route']).toBe('canonical');
    // New honest contract: AI-gateway JSON passthrough, not the old
    // fabricated `ana_1_0_ri_ich_analysis` field.
    expect(res.body.guidance_response).toBeDefined();
    expect(res.body.guidance_response.regulatory_framework).toBe('ICH_E6_R3');
  });
});
