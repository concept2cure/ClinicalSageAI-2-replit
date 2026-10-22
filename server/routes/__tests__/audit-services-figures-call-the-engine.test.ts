/**
 * The figure routes call the figure engine with the request the caller sent.
 *
 * POST /figures/auto-insert passed five positional arguments to
 * autoInsertFigures(params), whose single object parameter then had no
 * sectionContent: the analysis threw on `.slice`, the service swallowed it,
 * and the route answered { success: true, figures: [] } — "no figures to
 * insert" for an analysis that never ran. POST /figures/generate forwarded
 * `dataSource` / `options`, names the engine does not read, so a caller's data
 * never reached it. Engine persistence is stubbed; project admission and the request-bound executor are explicit test seams.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ autoInsert: vi.fn(), generate: vi.fn(), admit:vi.fn(), executor:{ connect:vi.fn() },
  Refusal:class ProjectAdmissionRefusal extends Error {
    constructor(readonly status:number, readonly code:string, message:string) { super(message); }
  },
}));
vi.mock('../c2c/project-access', () => ({ requireProjectAdmission:h.admit, ProjectAdmissionRefusal:h.Refusal }));
vi.mock('../../db/requestDb', () => ({ requestConnectable:() => h.executor }));
vi.mock('../../services/figureGenerationService.js', () => ({
  autoInsertFigures: h.autoInsert,
  generateFigure: h.generate,
}));

import router from '../audit-services';

function app(user: Record<string, unknown> | null = { id: 17, organizationId: 5 }) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    if (user) (req as any).user = user;
    next();
  });
  a.use('/api/audit-services', router);
  return a;
}

beforeEach(() => {
  h.admit.mockReset().mockResolvedValue({ id:12, organizationId:5 });
  h.autoInsert.mockReset().mockResolvedValue([]);
  h.generate.mockReset().mockResolvedValue({ success: true, figure: { id: 'f1' } });
});

describe('POST /api/audit-services/figures/auto-insert', () => {
  it('hands the engine the section and its content, with the session’s tenant and user', async () => {
    const r = await request(app()).post('/api/audit-services/figures/auto-insert')
      .send({ projectId: 12, sectionType: '2.7.3', content: 'Objective response was 41%.', organizationId: 999 });
    expect(r.status).toBe(200);
    expect(h.autoInsert).toHaveBeenCalledWith({
      projectId: 12, organizationId: 5, userId: 17, sectionCode: '2.7.3', sectionContent: 'Objective response was 41%.',
    }, h.executor);
    expect(h.admit).toHaveBeenCalledWith(expect.anything(), '12', true);
  });

  it('answers a failed analysis as a failure, not as "no figures"', async () => {
    h.autoInsert.mockRejectedValue(new Error('figure analysis returned no readable suggestions'));
    const r = await request(app()).post('/api/audit-services/figures/auto-insert')
      .send({ projectId: 12, sectionType: '2.7.3', content: 'x' });
    expect(r.status).toBeGreaterThanOrEqual(500);
    expect(r.body.success).not.toBe(true);
  });

  it('refuses without the section it is analysing, instead of calling it "general"', async () => {
    const r = await request(app()).post('/api/audit-services/figures/auto-insert').send({ projectId: 12, content: 'x' });
    expect(r.status).toBe(400);
    expect(h.autoInsert).not.toHaveBeenCalled();
  });
});

describe('POST /api/audit-services/figures/generate', () => {
  it('refuses an inaccessible current project before generation or persistence', async () => {
    h.admit.mockRejectedValue(new h.Refusal(404, 'PROJECT_NOT_FOUND', 'Project not found'));
    const r = await request(app()).post('/api/audit-services/figures/generate')
      .send({ projectId:12, figureType:'bar_chart', title:'ORR', rawData:[{ a:1 }] });
    expect(r.status).toBe(404);
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('does not report an uncertain storage commit as a generated success', async () => {
    h.generate.mockResolvedValue({ success:false, storage:{ status:'unconfirmed' } });
    const r = await request(app()).post('/api/audit-services/figures/generate')
      .send({ projectId:12, figureType:'bar_chart', title:'ORR', rawData:[{ a:1 }] });
    expect(r.status).toBe(503);
    expect(r.body.success).toBe(false);
  });

  it('forwards the caller’s data under the names the engine reads', async () => {
    const rows = [{ arm: 'A', orr: 0.41 }, { arm: 'B', orr: 0.12 }];
    const r = await request(app()).post('/api/audit-services/figures/generate').send({
      projectId: 12, figureType: 'bar_chart', title: 'ORR', description: 'ORR by arm', targetSection: '2.7.3',
      rawData: rows, sourceDataRefs: ['71'],
    });
    expect(r.status).toBe(200);
    expect(h.generate).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 12, organizationId: 5, userId: 17, rawData: rows, sourceDataRefs: ['71'],
      description: 'ORR by arm', targetSection: '2.7.3',
    }), h.executor);
    expect(h.admit).toHaveBeenCalledWith(expect.anything(), '12', true);
  });

  it('refuses a request with no session user instead of attributing it to user 0', async () => {
    const r = await request(app({ organizationId: 5 })).post('/api/audit-services/figures/generate')
      .send({ projectId: 12, figureType: 'bar_chart', rawData: [{ a: 1 }] });
    expect(r.status).toBe(401);
    expect(h.generate).not.toHaveBeenCalled();
  });
});
