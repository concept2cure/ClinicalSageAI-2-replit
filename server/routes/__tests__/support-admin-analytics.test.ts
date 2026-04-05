import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '../../db';
import supportAdminRouter from '../support-admin';

describe('support-admin analytics caching', () => {
  let orgSeed = 40;

  beforeEach(() => {
    vi.clearAllMocks();
    orgSeed += 1;
  });

  it('returns cached analytics summary on repeated requests', async () => {
    const mockQuery = vi.mocked(pool.query);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ status: 'open', count: 5 }] } as any)
      .mockResolvedValueOnce({ rows: [{ priority: 'high', count: 3 }] } as any)
      .mockResolvedValueOnce({ rows: [{ category: 'technical', count: 4 }] } as any)
      .mockResolvedValueOnce({
        rows: [
          {
            total: 8,
            slaResponseMet: 6,
            slaResponseBreached: 2,
            slaResolutionMet: 5,
            slaResolutionBreached: 3,
            avgResponseTimeHours: 2.5,
            avgResolutionTimeHours: 12.3,
            totalRatings: 4,
            avgRating: 4.5,
            satisfied: 3,
            unsatisfied: 0,
          },
        ],
      } as any)
      .mockResolvedValueOnce({ rows: [{ date: '2026-04-01', created: 2, resolved: 1 }] } as any);

    const app = express();
    app.use((req, _res, next) => {
      (req as any).user = { organizationId: orgSeed, userId: 100 };
      next();
    });
    app.use('/api/support', supportAdminRouter);

    const first = await request(app).get('/api/support/analytics?days=30');
    const second = await request(app).get('/api/support/analytics?days=30');

    expect(first.status).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');
    expect(second.status).toBe(200);
    expect(second.headers['x-cache']).toBe('HIT');
    expect(mockQuery).toHaveBeenCalledTimes(5);
  });

  it('bypasses cache when refresh=true for agent analytics', async () => {
    const mockQuery = vi.mocked(pool.query);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ agentId: 10, totalAssigned: 5 }] } as any)
      .mockResolvedValueOnce({ rows: [{ agentId: 10, totalAssigned: 6 }] } as any);

    const app = express();
    app.use((req, _res, next) => {
      (req as any).user = { organizationId: orgSeed, userId: 100 };
      next();
    });
    app.use('/api/support', supportAdminRouter);

    const first = await request(app).get('/api/support/analytics/agents?days=30');
    const refresh = await request(app).get('/api/support/analytics/agents?days=30&refresh=true');

    expect(first.status).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');
    expect(refresh.status).toBe(200);
    expect(refresh.headers['x-cache']).toBe('MISS');
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('invalidates org analytics cache after ticket mutation', async () => {
    const mockQuery = vi.mocked(pool.query);
    // First analytics request
    mockQuery
      .mockResolvedValueOnce({ rows: [{ status: 'open', count: 5 }] } as any)
      .mockResolvedValueOnce({ rows: [{ priority: 'high', count: 3 }] } as any)
      .mockResolvedValueOnce({ rows: [{ category: 'technical', count: 4 }] } as any)
      .mockResolvedValueOnce({
        rows: [
          {
            total: 8,
            slaResponseMet: 6,
            slaResponseBreached: 2,
            slaResolutionMet: 5,
            slaResolutionBreached: 3,
            avgResponseTimeHours: 2.5,
            avgResolutionTimeHours: 12.3,
            totalRatings: 4,
            avgRating: 4.5,
            satisfied: 3,
            unsatisfied: 0,
          },
        ],
      } as any)
      .mockResolvedValueOnce({ rows: [{ date: '2026-04-01', created: 2, resolved: 1 }] } as any)
      // PATCH /tickets/:id mutation result
      .mockResolvedValueOnce({ rows: [{ id: 99, status: 'resolved' }] } as any)
      // Analytics request after invalidation
      .mockResolvedValueOnce({ rows: [{ status: 'resolved', count: 6 }] } as any)
      .mockResolvedValueOnce({ rows: [{ priority: 'high', count: 4 }] } as any)
      .mockResolvedValueOnce({ rows: [{ category: 'technical', count: 5 }] } as any)
      .mockResolvedValueOnce({
        rows: [
          {
            total: 9,
            slaResponseMet: 7,
            slaResponseBreached: 2,
            slaResolutionMet: 6,
            slaResolutionBreached: 3,
            avgResponseTimeHours: 2.1,
            avgResolutionTimeHours: 10.1,
            totalRatings: 5,
            avgRating: 4.6,
            satisfied: 4,
            unsatisfied: 0,
          },
        ],
      } as any)
      .mockResolvedValueOnce({ rows: [{ date: '2026-04-02', created: 3, resolved: 2 }] } as any);

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).user = { organizationId: orgSeed, userId: 100, role: 'admin' };
      next();
    });
    app.use('/api/support', supportAdminRouter);

    const first = await request(app).get('/api/support/analytics?days=30');
    const update = await request(app).patch('/api/support/tickets/99').send({ status: 'resolved' });
    const second = await request(app).get('/api/support/analytics?days=30');

    expect(first.status).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');
    expect(update.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.headers['x-cache']).toBe('MISS');
    expect(mockQuery).toHaveBeenCalledTimes(11);
  });
});
