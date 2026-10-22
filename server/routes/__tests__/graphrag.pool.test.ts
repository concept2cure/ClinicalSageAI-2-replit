/** WO-19: shared-pool fallback is the defect. An authenticated graph read must
 * have the request's pinned database client, never a synthetic empty result. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const S = vi.hoisted(() => ({ shared: vi.fn(), pinned: vi.fn() }));
vi.mock('../../db', async original => ({ ...await original<Record<string, unknown>>(), getPool: () => ({ query: S.shared }) }));
import router from '../graphrag';
const app = (org: number | null, scoped = false) => {
  const a = express(); a.use(express.json());
  a.use((req, _res, next) => {
    if (org != null) (req as any).user = { id: 1, organizationId: org };
    if (scoped) (req as any).dbClient = { query: S.pinned };
    next();
  });
  a.use('/api/graphrag', router); return a;
};
beforeEach(() => {
  S.shared.mockReset().mockResolvedValue({ rows: [] });
  S.pinned.mockReset().mockResolvedValue({ rows: [] });
});
describe('GraphRAG request connection', () => {
  it('refuses an organization-less request without touching a pool', async () => {
    const r = await request(app(null)).get('/api/graphrag/communities');
    expect(r.status).toBe(403); expect(S.shared).not.toHaveBeenCalled();
  });
  it('reports authenticated but unscoped reads unavailable rather than empty success', async () => {
    const r = await request(app(7)).get('/api/graphrag/communities');
    expect(r.status).toBe(503); expect(r.body.error).toBe('GRAPH_SCOPE_UNAVAILABLE');
    expect(S.shared).not.toHaveBeenCalled();
  });
  it('reads through the pinned client and never falls back to the shared pool', async () => {
    const r = await request(app(7, true)).get('/api/graphrag/communities');
    expect(r.status).toBe(200); expect(S.pinned).toHaveBeenCalled(); expect(S.shared).not.toHaveBeenCalled();
  });
  it('does not describe a missing graph schema as healthy zero activity', async () => {
    S.pinned.mockRejectedValue(Object.assign(new Error('private schema missing'), { code: '42P01' }));
    const r = await request(app(7, true)).get('/api/graphrag/health');
    expect(r.status).toBe(503); expect(r.body.status).toBe('unavailable');
    expect(JSON.stringify(r.body)).not.toContain('private schema');
    expect(r.body.graphStore.postgres.nodes).toBeNull();
  });
});
