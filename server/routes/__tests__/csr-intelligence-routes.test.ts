import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createCsrIntelligenceRoutes } from '../csr-intelligence-routes';

function createMockPool() {
  const query = vi.fn(async (sql: string) => {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (normalized.includes('COUNT(*)::int AS total,') && normalized.includes('processed_today')) {
      return { rows: [{ total: 12, processed_today: 2 }] };
    }
    if (
      normalized.includes('COUNT(*)::int AS total,') &&
      normalized.includes('therapeutic_area_count')
    ) {
      return {
        rows: [
          {
            total: 12,
            therapeutic_area_count: 3,
            unique_sponsors: 4,
            completed_reviews: 7,
          },
        ],
      };
    }
    if (normalized.includes('COALESCE(indication')) {
      return { rows: [{ area: 'Cardiology', count: 5, studies: 5, avg_sample: 120 }] };
    }
    if (normalized.includes('COALESCE(phase')) {
      return { rows: [{ phase: 'Phase III', count: 8 }] };
    }
    if (normalized.includes('AVG(sample_size)::int AS avg_sample')) {
      return { rows: [{ avg_sample: 98, avg_duration: 20 }] };
    }
    if (normalized.includes('SELECT phase, COUNT(*)::int AS cnt')) {
      return { rows: [{ phase: 'Phase III', cnt: 8 }] };
    }

    return { rows: [] };
  });

  return { query };
}

describe('csr-intelligence-routes backend tuning', () => {
  it('caches analytics response for identical requests', async () => {
    const pool = createMockPool();
    const app = express();
    app.use('/api', createCsrIntelligenceRoutes(pool as any, { searchCSRs: vi.fn() }));

    const first = await request(app).get('/api/csr-intelligence/analytics');
    const second = await request(app).get('/api/csr-intelligence/analytics');

    expect(first.status).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');
    expect(second.status).toBe(200);
    expect(second.headers['x-cache']).toBe('HIT');
    expect(pool.query).toHaveBeenCalledTimes(3);
  });

  it('supports refresh=true to bypass stats cache', async () => {
    const pool = createMockPool();
    const app = express();
    app.use('/api', createCsrIntelligenceRoutes(pool as any, { searchCSRs: vi.fn() }));

    const first = await request(app).get('/api/csr-intelligence/stats');
    const refresh = await request(app).get('/api/csr-intelligence/stats?refresh=true');

    expect(first.status).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');
    expect(refresh.status).toBe(200);
    expect(refresh.headers['x-cache']).toBe('MISS');
    expect(pool.query).toHaveBeenCalledTimes(6);
  });
});
