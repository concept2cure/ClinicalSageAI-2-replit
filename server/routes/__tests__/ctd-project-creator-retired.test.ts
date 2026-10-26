import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ create: vi.fn(), list: vi.fn(), status: vi.fn(), validate: vi.fn() }));
vi.mock('../../auth.js', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { tenantId: 7, userId: 55 });
    next();
  },
}));
vi.mock('../../services/ctd-ingestion-service.js', () => ({
  createCTDProject: h.create, listCTDProjects: h.list, getCTDProjectStatus: h.status,
  validateCTDCompleteness: h.validate, uploadCTDDocument: vi.fn(), detectCTDSection: vi.fn(),
}));
import router from '../ctd-onboarding';

function app() {
  const app = express();
  app.use(express.json());
  app.use('/api/ctd', router);
  return app;
}
beforeEach(() => vi.clearAllMocks());

describe('CTD project creation is retired while existing document work stays reachable', () => {
  it('does not invoke the alternate CTD project creator for a complete old payload', async () => {
    h.create.mockResolvedValue({ projectId: 31, gaps: [] });
    const result = await request(app()).post('/api/ctd/projects').send({
      name: 'Old alternate creator', regulatoryRegion: 'US', submissionType: 'IND', productName: 'Recorded product', productType: 'drug',
    });
    expect(result.status).toBe(404);
    expect(h.create).not.toHaveBeenCalled();
  });

  it('keeps the organization-bound project list and document status reads', async () => {
    h.list.mockResolvedValue([{ id: 31, name: 'Existing stored project' }]);
    h.status.mockResolvedValue({ id: 31, documents: [], gaps: [] });
    const listed = await request(app()).get('/api/ctd/projects');
    expect(listed.status).toBe(200);
    expect(listed.body.total).toBe(1);
    expect(h.list).toHaveBeenCalledWith(7);
    const stored = await request(app()).get('/api/ctd/projects/31');
    expect(stored.status).toBe(200);
    expect(h.status).toHaveBeenCalledWith(31, 7);
  });

  it('keeps document completeness validation for an existing CTD project', async () => {
    h.validate.mockResolvedValue({ gaps: [], complete: true });
    const result = await request(app()).post('/api/ctd/projects/31/validate').send({});
    expect(result.status).toBe(200);
    expect(h.validate).toHaveBeenCalledWith(31, 7);
  });
});
