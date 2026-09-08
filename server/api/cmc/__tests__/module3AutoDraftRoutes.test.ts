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

  it('REFUSES to persist — a preview may not become a governed artifact', async () => {
    /* `persist: true` used to walk caller-supplied JSON through the convergence
       bridge, which UPDATEs the section's governed artifact with the content
       and stamps its metadata `compiledFrom: 'module3-os'` with sourceObjectIds
       taken from that same request body: no canonical source, no section row,
       no lineage, no compile. Any authenticated caller in the org could
       overwrite an approved section's artifact with typed prose claiming to
       have been compiled from records that do not exist. */
    const app = makeApp();
    const res = await request(app)
      .post('/api/cmc/module3/auto-draft/proj-1')
      .send({ documents: [{ id: 'd1', sourceType: 'drug_substance', payload: { name: 'Invented' } }], persist: true });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/cannot write a governed artifact/i);
    // It names the path that CAN: the compile route, from canonical sources.
    expect(res.body.error).toMatch(/module3-os\/compile/);
  });

  it('still drafts the preview when persist is not asked for, and says it persisted nothing', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/cmc/module3/auto-draft/proj-1')
      .send({ documents: [{ id: 'd1', sourceType: 'drug_substance', payload: { name: 'BX-204', manufacturer: 'Acme' } }] });

    expect(res.status).toBe(200);
    expect(res.body.data.sections.length).toBeGreaterThan(0);
    expect(res.body.data.persisted).toBe(false);
    expect(res.body.data.persistedArtifacts).toEqual([]);
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
