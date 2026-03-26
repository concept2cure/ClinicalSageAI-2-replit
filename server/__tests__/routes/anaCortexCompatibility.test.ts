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

describe('AnA Cortex compatibility', () => {
  it('returns canonical headers for ana route mount', async () => {
    const { default: router } = await import('../../routes/ana-cortex');
    const app = express();
    app.use(express.json());
    app.use('/api/ana-cortex', router);

    const res = await request(app).post('/api/ana-cortex/ich-e6r3-guidance').send({ query: 'x' });
    expect(res.status).toBe(200);
    expect(res.headers['x-ana-cortex-route']).toBe('canonical');
    expect(res.body.ana_1_0_ri_ich_analysis).toBeDefined();
  });
});
