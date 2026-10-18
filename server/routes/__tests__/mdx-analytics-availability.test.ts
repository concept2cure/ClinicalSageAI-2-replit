import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const S = vi.hoisted(() => ({ shared: vi.fn(), pinned: vi.fn() }));
vi.mock('../../db', async original => ({ ...await original<Record<string, unknown>>(), pool: { query: S.shared } }));
import router from '../mdx-analytics';
const app = (scoped = true) => {
  const a = express();
  a.use((req, _res, next) => {
    (req as any).user = { id: 1, organizationId: 7 };
    if (scoped) (req as any).dbClient = { query: S.pinned };
    next();
  });
  a.use('/api/mdx', router); return a;
};
beforeEach(() => {
  S.shared.mockReset().mockResolvedValue({ rows: [{ total: 0, active: 0, blocked: 0, complete: 0 }] });
  S.pinned.mockReset().mockImplementation(async (sql: string) => /GROUP BY/.test(sql)
    ? { rows: [] }
    : { rows: [{ total: 2, active: 2, blocked: 0, complete: 0, received: 1, in_review: 0 }] });
});
describe('MDX analytics data availability', () => {
  it('rejects an unsupported pathway rather than labeling organization totals as filtered data', async () => {
    const r = await request(app()).get('/api/mdx/analytics?pathway=k510');
    expect(r.status).toBe(400); expect(r.body.error).toBe('ANALYTICS_PATHWAY_UNAVAILABLE');
    expect(S.pinned).not.toHaveBeenCalled();
  });
  it('reads positive tenant data on the pinned connection', async () => {
    const r = await request(app()).get('/api/mdx/analytics/portfolio');
    expect(r.status).toBe(200); expect(r.body.data.programs.total).toBe(2);
    expect(S.shared).not.toHaveBeenCalled();
  });
  it.each(['42P01','42703'])('reports %s as unavailable rather than zero counts', async code => {
    S.pinned.mockRejectedValue(Object.assign(new Error('private table or column'), { code }));
    const r = await request(app()).get('/api/mdx/analytics/portfolio');
    expect(r.status).toBe(503); expect(r.body.error).toBe('ANALYTICS_UNAVAILABLE');
    expect(r.body.data).toBeUndefined(); expect(JSON.stringify(r.body)).not.toContain('private table');
  });
  it('reports a missing request connection rather than borrowing a shared one', async () => {
    const r = await request(app(false)).get('/api/mdx/analytics/portfolio');
    expect(r.status).toBe(503); expect(S.shared).not.toHaveBeenCalled();
  });
  it('permits genuine zero counts from an initialized source', async () => {
    S.pinned.mockImplementation(async (sql: string) => /GROUP BY/.test(sql)
      ? { rows: [] } : { rows: [{ total: 0, active: 0, blocked: 0, complete: 0, received: 0, in_review: 0 }] });
    const r = await request(app()).get('/api/mdx/analytics/portfolio');
    expect(r.status).toBe(200); expect(r.body.data.programs.total).toBe(0);
  });
});
