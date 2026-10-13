/** Read/mutation routes must preserve the canonical policy result at every
 * saved scope boundary. The policy itself and frozen historical scope predicates
 * are exercised against real PostgreSQL in run-history/project-access tests. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = await vi.hoisted(async () => (await import('./_report-os-route-harness')).createReportOsHarness());
const access = vi.hoisted(() => ({ scope: vi.fn(), projects: vi.fn() }));
vi.mock('../../db', () => ({ db: h.db, pool: h.pool, getPool: () => h.pool, getDb: () => h.db, query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../auth', () => ({ authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../utils/authedOrgId', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../utils/authedOrgId')>()), authedOrgId: () => 7 }));
vi.mock('../../services/report-os/project-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/project-access')>()),
  getAccessibleReportProjectIds: access.projects, canAccessReportScope: access.scope,
}));

import reportOsRouter from '../report-os';
import { resetReportOsHarness } from './_report-os-route-harness';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as unknown as { user: { id: number; role: string; organizationId: number } }).user = { id: 5, role: 'member', organizationId: 7 };
  next();
});
app.use('/api/report-os', reportOsRouter);

const BUNDLE_ID = '11111111-1111-4111-8111-111111111111';
const bundle = (projects: number[]) => ({ bundleId: BUNDLE_ID, organizationId: 7, name: 'Review pack', createdAt: '2026-10-13T12:00:00Z',
  projectIds: projects, runIds: projects.map((_, i) => i + 41), items: projects.map((id, i) => ({ runId: i + 41, runUuid: `run-${i}`, reportTypeId: 'readiness.executive_digest',
    reportTypeLabel: 'Digest', scopeType: 'project', scopeId: String(id), status: 'completed', confidence: null, blockers: [], createdAt: '2026-10-13T12:00:00Z' })) });
const delivery = (over: Record<string, unknown> = {}) => ({ deliveryId: '22222222-2222-4222-8222-222222222222', organizationId: 7, projectId: 11, bundleId: BUNDLE_ID,
  channel: 'external_pdf_export', recipients: ['partner'], subject: 'Restricted review pack', message: 'Private project12 finding', status: 'exported', createdAt: '2026-10-13T12:00:00Z', ...over });
const memory = (key: string, value: unknown) => ({ content: JSON.stringify({ [key]: value }), createdAt: new Date() });

beforeEach(() => {
  resetReportOsHarness(h);
  access.projects.mockReset().mockResolvedValue([11]);
  access.scope.mockReset().mockResolvedValue(true);
});

describe('retained delivery scopes', () => {
  it('does not show a multi-project delivery after access to one carried project is lost', async () => {
    h.queued.select.push([memory('deliveryRecord', delivery())], [memory('bundleRecord', bundle([11,12]))]);
    const result = await request(app).get('/api/report-os/deliveries');
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual([]);
    expect(JSON.stringify(result.body)).not.toContain('Private project12');
  });
  it('keeps a delivery visible only when all carried scopes still exist and are permitted', async () => {
    const saved = delivery();
    h.queued.select.push([memory('deliveryRecord', saved)], [memory('bundleRecord', bundle([11]))],
      [{ id:41, organizationId:7, scopeType:'project', scopeId:'11', status:'completed', dependencySummary:{} }]);
    const result = await request(app).get('/api/report-os/deliveries');
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual([saved]);
  });
  it('omits a delivery whose saved target run no longer exists', async () => {
    h.queued.select.push([memory('deliveryRecord', delivery({ bundleId:undefined, runId:41 }))], []);
    const result = await request(app).get('/api/report-os/deliveries');
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual([]);
  });
  it.each(['{"deliveryRecord":', JSON.stringify({ deliveryRecord: delivery({ organizationId:99 }) })])('refuses corrupt or mismatched-tenant delivery data (%s)', async content => {
    h.queued.select.push([{ content, createdAt: new Date() }]);
    const result = await request(app).get('/api/report-os/deliveries');
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe('REPORT_DELIVERY_CORRUPT');
    expect(result.body.data).toBeUndefined();
  });
});

describe('program group privacy', () => {
  it('omits every group whose complete member set is inaccessible, while showing an authorized group', async () => {
    access.scope.mockImplementation(async (_org, _actor, scope) => scope.scopeId === '2');
    h.queued.select.push([{id:1,name:'Private project programme'},{id:2,name:'Allowed programme'}], [{groupId:2,projectId:11,projectName:'Public project'}]);
    const result = await request(app).get('/api/report-os/program-groups');
    expect(result.status).toBe(200);
    expect(result.body.data.map((row: {id:number}) => row.id)).toEqual([2]);
    expect(JSON.stringify(result.body)).not.toContain('Private project programme');
  });
  it('refuses changing an inaccessible group before any membership can be replaced', async () => {
    access.scope.mockResolvedValue(false);
    const result = await request(app).patch('/api/report-os/program-groups/1').send({projectIds:[11]});
    expect(result.status).toBe(404);
    expect(h.reads.select).toBe(0);
    expect(h.statements).toEqual([]);
  });
  it('refuses adding an inaccessible project to a new or accessible existing group', async () => {
    h.queued.select.push([{id:11},{id:12}], [{id:11},{id:12}]);
    expect((await request(app).post('/api/report-os/program-groups').send({name:'Private pack',projectIds:[11,12]})).status).toBe(404);
    expect((await request(app).patch('/api/report-os/program-groups/2').send({projectIds:[11,12]})).status).toBe(404);
    expect(h.statements).toEqual([]);
  });
  it('checks historical snapshot project sets rather than changed live group membership', async () => {
    access.scope.mockResolvedValue(false);
    h.queued.select.push([{id:1,projectIds:[11,12]}, {id:2,projectIds:[11]}]);
    const result = await request(app).get('/api/report-os/program-groups/1/snapshots');
    expect(result.status).toBe(200);
    expect(result.body.data.map((row: {id:number}) => row.id)).toEqual([2]);
  });
  it('refuses invalid saved snapshot membership instead of implying an empty register', async () => {
    h.queued.select.push([{id:1,projectIds:null}]);
    const result = await request(app).get('/api/report-os/program-groups/1/snapshots');
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe('REPORT_GROUP_SNAPSHOT_CORRUPT');
  });
  it('refuses taking a snapshot of an inaccessible live group', async () => {
    access.scope.mockResolvedValue(false);
    h.queued.select.push([{id:1}]);
    const result = await request(app).post('/api/report-os/program-groups/1/snapshots').send({});
    expect(result.status).toBe(404);
    expect(h.statements).toEqual([]);
  });
  it('derives snapshot membership from the owned group despite a forged public-only binding in the request', async () => {
    access.projects.mockResolvedValue([11,12]);
    h.queued.select.push([{id:1}], [{projectId:11},{projectId:12}]);
    let persisted: unknown;
    const insert = vi.spyOn(h.db, 'insert').mockImplementation(() => ({ values: (row: unknown) => {
      persisted = row;
      return { returning: async () => [row] };
    } }));
    try {
      const result = await request(app).post('/api/report-os/program-groups/1/snapshots')
        .send({projectIds:[11],accessProjectIds:[11],metadata:{accessProjectIds:[11]}});
      expect(result.status).toBe(201);
      expect(persisted).toMatchObject({organizationId:7,programGroupId:1,projectIds:[11,12]});
      expect(result.body.data.projectIds).toEqual([11,12]);
    } finally { insert.mockRestore(); }
  });
});
