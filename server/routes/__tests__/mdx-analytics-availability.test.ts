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
  /* The kit-shaped aggregate retired with the device analytics screen (D2, fold
     F4, 2026-10-30; decision P-61 item 3). Its figures are the Reporting
     overview's device section over the projects the reader can open; its
     honesty cases moved to server/services/report-os/__tests__/device-portfolio.pglite.test.ts. */
  it('no longer serves the organization-wide kit aggregate, and reads nothing for it', async () => {
    for (const p of ['/api/mdx/analytics', '/api/mdx/analytics?pathway=all', '/api/mdx/analytics?pathway=k510']) {
      expect((await request(app()).get(p)).status, p).toBe(404);
    }
    expect(S.pinned).not.toHaveBeenCalled();
    expect(S.shared).not.toHaveBeenCalled();
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
