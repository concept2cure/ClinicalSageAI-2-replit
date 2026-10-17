import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ belongs: vi.fn(), list: vi.fn(), retry: vi.fn() }));
vi.mock('../../../services/cmc/project-membership', () => ({ projectBelongsToTenant: h.belongs }));
vi.mock('../../../services/cmc/register-link-recovery', async (original) => ({ ...await original<typeof import('../../../services/cmc/register-link-recovery')>(), listRegisterLinks: h.list, retryRegisterLink: h.retry }));
import router from '../sourceEvidenceRoutes';
import core from '../routes';
const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';
const prefix = `/api/cmc/module3-os/register-links/${PROJECT}`;
function app(role = 'member') {
  const a = express(); a.use(express.json());
  a.use((req: any, _res, next) => { req.tenantId = 7; req.tenantContext = { organizationId: 7 }; req.userRole = role; req.user = { id: 12 }; req.dbClient = { query: vi.fn() }; next(); });
  a.use('/api/cmc/module3-os', router); a.use('/api/cmc', core); return a;
}
beforeEach(() => { vi.unstubAllEnvs(); h.belongs.mockReset().mockResolvedValue(true); h.list.mockReset().mockResolvedValue([]); h.retry.mockReset().mockResolvedValue({ module3Linked: true }); });
describe('register link recovery route boundaries', () => {
  it('a viewer reads status but cannot invoke a retry', async () => {
    expect((await request(app('viewer')).get(prefix)).status).toBe(200);
    expect((await request(app('viewer')).post(`${prefix}/analytical-methods/31/retry`).send({})).status).toBe(403);
    expect(h.retry).not.toHaveBeenCalled();
  });
  it('a foreign program is refused before reading or retrying its records', async () => {
    h.belongs.mockResolvedValue(false);
    expect((await request(app()).get(prefix)).status).toBe(404);
    expect((await request(app()).post(`${prefix}/analytical-methods/31/retry`).send({})).status).toBe(404);
    expect(h.list).not.toHaveBeenCalled(); expect(h.retry).not.toHaveBeenCalled();
  });
  it('accepts no fabricated source payload and uses the session actor', async () => {
    expect((await request(app()).post(`${prefix}/analytical-methods/31/retry`).send({ sourcePayload: { title: 'invented' } })).status).toBe(400);
    expect(h.retry).not.toHaveBeenCalled();
    expect((await request(app()).post(`${prefix}/analytical-methods/31/retry`).send({})).body.module3Linked).toBe(true);
    expect(h.retry).toHaveBeenCalledWith(expect.anything(), { organizationId: 7, projectId: PROJECT, register: 'analytical-methods', recordId: '31', userId: 12 });
  });
  it('refuses the canonical postapproval classifier under launch enforcement before it runs', async () => {
    vi.stubEnv('LAUNCH_SCOPE_ENFORCE', 'on');
    const r = await request(app()).post('/api/cmc/variations/classify').send({ dosageFormFamily: 'immediate_release_oral_solid', changeCategory: 'scale_up', scaleChangeFactor: 'within_10x' });
    expect(r.status).toBe(409); expect(r.body.error).toBe('CMC_VARIATIONS_OUT_OF_SCOPE');
    expect(r.body.message).toMatch(/US IND/); expect(r.body.data).toBeUndefined();
  });
});
