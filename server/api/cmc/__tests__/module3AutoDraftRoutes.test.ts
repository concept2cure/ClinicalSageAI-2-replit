import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridgeCompileToArtifact = vi.fn();

vi.mock('../../../services/module3-convergence-service', () => ({
  bridgeCompileToArtifact: (...args: any[]) => bridgeCompileToArtifact(...args),
}));

import router from '../module3AutoDraftRoutes';

function makeApp(withTenant = true) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (withTenant) {
      req.tenantId = 101;
      req.tenantContext = { organizationId: 101 };
      req.user = { id: 1, organizationId: 101 };
    }
    next();
  });
  app.use('/api/cmc/module3', router);
  return app;
}

describe('module3AutoDraftRoutes', () => {
  beforeEach(() => {
    bridgeCompileToArtifact.mockReset();
  });

  it('drafts Module 3 from extracted documents and returns coverage', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/cmc/module3/auto-draft/proj-1')
      .send({
        documents: [
          { id: '1', sourceType: 'drug_substance', payload: { name: 'API-1', manufacturer: 'Acme' } },
          { id: '2', ctdSection: '3.2.S.7', payload: { timePoints: [0, 3, 6], storageCondition: '25C/60RH' } },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.projectId).toBe('proj-1');
    expect(res.body.data.coverage.mappedSourceCount).toBe(2);
    expect(res.body.data.coverage.completeSections).toContain('3.2.S.1');
    expect(res.body.data.persisted).toBe(false);
    // No persistence requested → bridge not invoked.
    expect(bridgeCompileToArtifact).not.toHaveBeenCalled();
    const s1 = res.body.data.sections.find((s: any) => s.sectionKey === '3.2.S.1');
    expect(s1.completeness).toBe(100);
  });

  it('persists drafted sections via the existing bridge when persist=true', async () => {
    bridgeCompileToArtifact.mockResolvedValue({ artifactId: 'm3-x', isNew: true });
    const app = makeApp();

    const res = await request(app)
      .post('/api/cmc/module3/auto-draft/proj-1')
      .send({
        persist: true,
        documents: [
          { id: '1', sourceType: 'drug_substance', payload: { name: 'API-1', manufacturer: 'Acme' } },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.persisted).toBe(true);
    // Only sections with source coverage are bridged; 3.2.S.1 must be one.
    expect(bridgeCompileToArtifact).toHaveBeenCalled();
    expect(bridgeCompileToArtifact.mock.calls[0][0]).toBe(101); // orgId
    expect(bridgeCompileToArtifact.mock.calls[0][1]).toBe('proj-1'); // projectId
    expect(res.body.data.persistedArtifacts.length).toBeGreaterThan(0);
  });

  it('records bridge failures without failing the whole request', async () => {
    bridgeCompileToArtifact.mockRejectedValue(new Error('db down'));
    const app = makeApp();

    const res = await request(app)
      .post('/api/cmc/module3/auto-draft/proj-1')
      .send({
        persist: true,
        documents: [
          { id: '1', sourceType: 'drug_substance', payload: { name: 'API-1', manufacturer: 'Acme' } },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.persistErrors.length).toBeGreaterThan(0);
    expect(res.body.data.persistErrors[0].error).toContain('db down');
  });

  it('rejects an empty document list', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/cmc/module3/auto-draft/proj-1').send({ documents: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid auto-draft payload');
  });

  it('requires organization context', async () => {
    const app = makeApp(false);
    const res = await request(app)
      .post('/api/cmc/module3/auto-draft/proj-1')
      .send({ documents: [{ id: '1', sourceType: 'drug_substance', payload: {} }] });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Organization context required');
  });
});
