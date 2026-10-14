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

vi.mock('../../services/report-os/entitlement-map', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/entitlement-map')>()), requireReportEntitlement: h.gate,
}));
vi.mock('../../services/auditService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/auditService')>()), writeChainedAuditRow: h.audit,
}));

import reportOsRouter from '../report-os';
import { resetReportOsHarness, driverRow } from './_report-os-route-harness';
import { reportRuns, reportTypeRegistry } from '@shared/schema/report-os';
import type { RequestSqlClient } from '../../db/requestDb';

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

async function taxonomyWithRecordedTier(tier: string | null) {
  const originalQuery = h.pool.query;
  const query = vi.fn<RequestSqlClient['query']>(async sql => ({
    rows: sql.includes('FROM organizations') ? [{ tier }] : [],
  }));
  // The existing harness's default query returns only empty rows. Install a
  // typed SQL response on that same pool for the real capability resolver.
  Object.assign(h.pool, { query });
  h.queued.select.push([{ typeId: 'readiness.executive_digest', family: 'readiness',
    allowedScopes: ['project'], allowedClientSegments: [], allowedPersonas: [], enabled: true }]);
  try {
    const res = await request(app).get('/api/report-os/taxonomy');
    expect(query).toHaveBeenCalledWith('SELECT tier FROM organizations WHERE id = $1', [7]);
    return res;
  } finally {
    Object.assign(h.pool, { query: originalQuery });
  }
}

describe('taxonomy preserves internally unresolved capability reads', () => {
  it.each([null, 'platinum'])('does not claim Standard or grant a base report for unread %s tier', async tier => {
    const result = await taxonomyWithRecordedTier(tier);
    expect(result.status).toBe(200);
    expect(result.body.meta).toMatchObject({ tier: 'standard', tierResolved: false });
    expect(result.body.data).toHaveLength(1);
    expect(result.body.data[0]).toMatchObject({ typeId: 'readiness.executive_digest', entitled: false });
  });

  it.each(['free', 'standard', 'professional', 'enterprise'])('retains a positively recorded %s tier and its base entitlement', async tier => {
    const result = await taxonomyWithRecordedTier(tier);
    expect(result.status).toBe(200);
    expect(result.body.meta).toMatchObject({ tier, tierResolved: true });
    expect(result.body.data[0]).toMatchObject({ typeId: 'readiness.executive_digest', entitled: tier !== 'free' });
  });
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

/** These cases prove that the live packet route obeys fresh policy results on
 * its owned executor. They do not turn mocked sharing into native RLS proof. */
describe('complete retained report packet access', () => {
  const at = new Date('2026-10-13T12:00:00Z');
  const type = { id: 1, typeId: 'readiness.executive_digest', label: 'Digest', family: 'readiness', truthfulnessRules: {}, createdAt: at, updatedAt: at };
  const initial = bundle([11, 12]);
  const retained = { ...initial, items: initial.items.map(item => ({ ...item, runUuid: `00000000-0000-4000-8000-${String(item.runId).padStart(12, '0')}` })) };
  const runs = retained.items.map(item => ({ id: item.runId, runUuid: item.runUuid, organizationId: 7,
    scopeType: item.scopeType, scopeId: item.scopeId, reportTypeId: item.reportTypeId, status: 'partial', confidence: null,
    requestedBy: 5, blockers: [], createdAt: at, updatedAt: at, dependencySummary: { providers: [], summary: {} } }));
  let actorReads = 0;
  let denyActorAfter = Number.POSITIVE_INFINITY;
  const getPacket = () => request(app).get(`/api/report-os/bundles/${BUNDLE_ID}/export.pdf?content=reports`);
  beforeEach(() => {
    actorReads = 0; denyActorAfter = Number.POSITIVE_INFINITY;
    access.projects.mockResolvedValue([11, 12]);
    h.gate.mockResolvedValue({ entitled: true, tier: 'enterprise', tierResolved: true });
    h.queued.select.push([memory('bundleRecord', retained)]); // Current pre-packet route still loads through this facade in red.
    h.respond.fn = (sql, arrayMode) => {
      const values = h.params.at(-1) ?? [];
      if (/select .* from "project_memory_entries"/.test(sql)) return [[`bundle:${BUNDLE_ID}`, JSON.stringify({ bundleRecord: retained }), at.toISOString()]];
      if (/select "type_id", "family" from "report_type_registry"/.test(sql)) return [[type.typeId, type.family]];
      if (/select .* from "report_type_registry"/.test(sql)) return [driverRow(reportTypeRegistry, type)];
      if (/SELECT ou.role/.test(sql)) return ++actorReads > denyActorAfter ? [] : [{ role: 'manager' }];
      if (/SELECT id, run_uuid, organization_id/.test(sql)) return runs.map(run => ({ id: run.id, run_uuid: run.runUuid, organization_id: run.organizationId, report_type_id: run.reportTypeId, scope_type: run.scopeType, scope_id: run.scopeId, access_project_ids: null }));
      if (/SELECT id FROM report_runs/.test(sql)) return runs.map(run => ({ id: run.id }));
      if (arrayMode && /select .* from "report_runs"/.test(sql)) return runs.map(run => driverRow(reportRuns, run));
      if (/SELECT status FROM report_runs/.test(sql)) return runs.filter(run => run.id === values[0]).map(run => ({ status: run.status }));
      if (/SELECT id, status FROM report_runs/.test(sql)) return runs.map(run => ({ id: run.id, status: run.status }));
      return [];
    };
  });

  it('refuses one currently private scope before its retained body is read, without identifying it', async () => {
    access.scope.mockImplementation(async (_org, _actor, scope) => scope.scopeId !== '12');
    const result = await getPacket();
    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ error: { code: 'REPORT_BUNDLE_NOT_FOUND', message: 'Bundle not found.' } });
    expect(JSON.stringify(result.body)).not.toContain('12');
    expect(h.statements.some(sql => /from "report_runs"|SELECT status FROM report_runs/.test(sql))).toBe(false);
    expect(h.audit).not.toHaveBeenCalled();
    expect(result.headers['content-disposition']).toBeUndefined();
    expect(h.statements.slice(-2)).toEqual(['ROLLBACK', '<released>']);
  });

  it('refuses observed project withdrawal after rendering despite the earlier allowed set', async () => {
    access.projects.mockResolvedValueOnce([11, 12]).mockResolvedValueOnce([11, 12]).mockResolvedValue([11]);
    const result = await getPacket();
    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ error: { code: 'REPORT_BUNDLE_NOT_FOUND' } });
    expect(access.projects).toHaveBeenCalledTimes(3);
    expect(h.audit).not.toHaveBeenCalled();
    expect(result.headers['content-disposition']).toBeUndefined();
  });

  it('refuses observed scope withdrawal after rendering even when its project remains accessible', async () => {
    access.scope.mockImplementation(async (_org, _actor, scope) => access.projects.mock.calls.length < 3 || scope.scopeId !== '12');
    const result = await getPacket();
    expect(result.status).toBe(404);
    expect(h.audit).not.toHaveBeenCalled();
    expect(result.headers['content-disposition']).toBeUndefined();
  });

  it('refuses an actor whose current active membership is absent before any body read', async () => {
    denyActorAfter = 0;
    const result = await getPacket();
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ error: { code: 'PROJECT_ACTOR_ACCESS_DENIED' } });
    expect(access.projects).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
    expect(result.headers['content-disposition']).toBeUndefined();
  });

  it('refuses an observed active membership withdrawal after rendering', async () => {
    denyActorAfter = 2;
    const result = await getPacket();
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ error: { code: 'PROJECT_ACTOR_ACCESS_DENIED' } });
    expect(actorReads).toBe(3);
    expect(h.audit).not.toHaveBeenCalled();
    expect(result.headers['content-disposition']).toBeUndefined();
  });

  it('uses current canonical actor roles and the same owned client for every scope/allowlist read', async () => {
    const result = await getPacket();
    expect(result.status).toBe(200);
    expect(actorReads).toBe(3);
    const executor = access.projects.mock.calls[0][2];
    expect(executor).toEqual(expect.objectContaining({ query: expect.any(Function), release: expect.any(Function) }));
    for (const [org, actor, client] of access.projects.mock.calls) {
      expect(org).toBe(7); expect(actor).toEqual({ userId: 5, role: 'manager' }); expect(client).toBe(executor);
    }
    for (const [org, actor, , client, allowed] of access.scope.mock.calls) {
      expect(org).toBe(7); expect(actor).toEqual({ userId: 5, role: 'manager' }); expect(client).toBe(executor); expect(allowed).toEqual([11, 12]);
    }
    expect(h.statements.filter(sql => sql === '<released>')).toHaveLength(2); // Admission/render client plus durable export audit client.
  });

  it('retains policy lookup failure as an error, without interpreting it as an empty packet', async () => {
    access.projects.mockRejectedValue(new Error('sharing verification unavailable'));
    const result = await getPacket();
    expect(result.status).toBeGreaterThanOrEqual(500);
    expect(h.audit).not.toHaveBeenCalled();
    expect(result.headers['content-disposition']).toBeUndefined();
    expect(h.statements.slice(-2)).toEqual(['ROLLBACK', '<released>']);
  });
});
