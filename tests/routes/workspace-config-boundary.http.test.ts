import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  organizationId: 7 as number | undefined,
  enrich: vi.fn(), map: vi.fn(), catalog: vi.fn(),
}));
vi.mock('../../server/auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { organizationId: h.organizationId, industryMode: 'pharma' };
    next();
  },
}));
vi.mock('../../server/services/regulatory/workspace-config-enrichment', () => ({
  enrichWorkspaceConfig: h.enrich,
}));
vi.mock('../../shared/regulatory/project-map', () => ({ resolveProjectMap: h.map }));
vi.mock('../../shared/regulatory/workspace-config', () => ({ buildSelectionCatalog: h.catalog }));
// Actual profile and tenant helper modules are deliberately not mocked.
import router from '../../server/routes/workspace-config.routes';
const app = express();
app.set('query parser', 'extended');
app.use('/api/workspace', router);

beforeEach(() => {
  h.organizationId = 7;
  h.enrich.mockReset().mockImplementation(async (input: unknown) => ({ input }));
  h.map.mockReset().mockImplementation((input: unknown) => ({ input }));
  h.catalog.mockReset().mockReturnValue([{ id: 'test-catalog' }]);
});

describe('shared workspace query boundary over HTTP', () => {
  for (const endpoint of ['config', 'project-map']) {
    it.each([
      'need=NDA&region=JP&region=CA',
      'need=NDA&region[country]=JP',
      'need=NDA&clientType[country]=cro',
      'need=NDA&clientType=',
      'need=NDA&region=ZZ',
      'need=NDA&clientType=fintech',
      'need=NDA&organizationId=99',
      'need=NDA&projectId=42',
    ])(`${endpoint}: refuses ambiguous or unsupported query %s`, async query => {
      const result = await request(app).get(`/api/workspace/${endpoint}?${query}`);
      expect(result.status).toBe(400);
      expect(result.body).not.toHaveProperty('data');
      expect(h.enrich).not.toHaveBeenCalled();
      expect(h.map).not.toHaveBeenCalled();
    });
  }
  it('passes the exact selected context and authenticated tenant to enrichment', async () => {
    const result = await request(app).get('/api/workspace/config?need=SOP&region=CA&clientType=cro');
    expect(result.status).toBe(200);
    expect(h.enrich).toHaveBeenCalledWith({ need: 'SOP', region: 'CA', clientType: 'cro', organizationId: 7 });
  });
  it('keeps omitted defaults in the existing service', async () => {
    const result = await request(app).get('/api/workspace/config?need=NDA');
    expect(result.status).toBe(200);
    expect(h.enrich).toHaveBeenCalledWith({ need: 'NDA', region: undefined, clientType: 'pharma', organizationId: 7 });
  });
  it('returns unavailable rather than removing region and client settings on failure', async () => {
    h.enrich.mockRejectedValueOnce(new Error('postgresql://user:secret@host/db'));
    const result = await request(app).get('/api/workspace/config?need=SOP&region=JP&clientType=cro');
    expect(result.status).toBe(503);
    expect(result.body.code).toBe('WORKSPACE_CONFIG_UNAVAILABLE');
    expect(result.body).not.toHaveProperty('data');
    expect(JSON.stringify(result.body)).not.toContain('secret');
  });
  it('contains a project-map exception without claiming an empty successful map', async () => {
    h.map.mockImplementationOnce(() => { throw new Error('private context'); });
    const result = await request(app).get('/api/workspace/project-map?need=NDA');
    expect(result.status).toBe(503);
    expect(result.body.code).toBe('WORKSPACE_PROJECT_MAP_UNAVAILABLE');
    expect(result.body).not.toHaveProperty('data');
  });
  it('contains a catalog exception without fabricating an empty catalog', async () => {
    h.catalog.mockImplementationOnce(() => { throw new Error('private catalog'); });
    const result = await request(app).get('/api/workspace/selection-catalog');
    expect(result.status).toBe(503);
    expect(result.body.code).toBe('WORKSPACE_CATALOG_UNAVAILABLE');
    expect(result.body).not.toHaveProperty('data');
  });
  it.each([0, -1, 1.5])('rejects unusable tenant %s before any enrichment', async org => {
    h.organizationId = org;
    const result = await request(app).get('/api/workspace/config?need=NDA');
    expect(result.status).toBe(403);
    expect(h.enrich).not.toHaveBeenCalled();
  });
});
