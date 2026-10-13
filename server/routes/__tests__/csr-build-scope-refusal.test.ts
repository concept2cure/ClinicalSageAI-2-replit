import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ rows: [] as unknown[], quota: vi.fn(), usage: vi.fn(), complete: vi.fn() }));
vi.mock('../../db', () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => h.rows }) }) }) } }));
vi.mock('../../services/usage-metering.js', () => ({ checkQuota: h.quota, recordUsage: h.usage }));
vi.mock('../../lib/unified-ai-client.js', () => ({ ai: { complete: h.complete } }));
vi.mock('../../services/report-os/project-access', () => ({ canAccessReportProject: async () => true }));
import router from '../csr-builder-routes';
const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as unknown as { user: unknown }).user = { organizationId: 7, id: 5 }; next(); });
app.use('/api/csr-builder', router);
const studyInfo = { title: 'Recorded study', protocolNumber: 'STUDY-11', phase: '1', indication: 'Recorded indication', sponsor: 'Sponsor', investigationalProduct: 'Investigational product', studyDesign: 'Recorded design', primaryEndpoint: 'Recorded endpoint' };
beforeEach(() => { h.rows = []; h.quota.mockReset(); h.usage.mockReset(); h.complete.mockReset(); });
describe('synchronous CSR build scope refusal', () => {
  it('returns scoped not-found for a foreign project and never bills or requests AI', async () => {
    const res = await request(app).post('/api/csr-builder/build').send({ projectId: 21, studyInfo, organizationId: 8, userId: 999 });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('CSR_PROJECT_NOT_FOUND');
    expect(h.quota).not.toHaveBeenCalled();
    expect(h.usage).not.toHaveBeenCalled();
    expect(h.complete).not.toHaveBeenCalled();
  });
  it('returns conflict for an archived project and validation error for a malformed target', async () => {
    h.rows = [{ id: 11, status: 'archived', clientWorkspaceId: 71, role: 'member' }];
    expect((await request(app).post('/api/csr-builder/build').send({ projectId: 11, studyInfo })).status).toBe(409);
    expect((await request(app).post('/api/csr-builder/build').send({ projectId: 0, studyInfo })).status).toBe(400);
    expect(h.quota).not.toHaveBeenCalled();
    expect(h.complete).not.toHaveBeenCalled();
  });
});
