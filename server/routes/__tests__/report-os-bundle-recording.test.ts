/** The saved pack must roundtrip whole, and every project copy and its audit
 * event must commit together. The real route/Drizzle transaction are exercised;
 * the connection and audit edge record statement order and injected failures. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';

const access = vi.hoisted(() => ({ projectIds: [11, 12], projectReads: 0, actorReads: 0, scopeReads: 0,
  revokedActor: false, revokeActorAfterRead: false, revokeProjectAfterRead: false, revokeScopeAfterRead: false }));
const h = await vi.hoisted(async () => (await import('./_report-os-route-harness')).createReportOsHarness());
vi.mock('../../db', () => ({ db: h.db, pool: h.pool, getPool: () => h.pool, getDb: () => h.db, query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../auth', () => ({ authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../utils/authedOrgId', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../utils/authedOrgId')>()), authedOrgId: () => 7 }));
vi.mock('../../services/report-os/project-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/project-access')>()),
  getAccessibleReportProjectIds: vi.fn(async () => {
    access.projectReads += 1;
    return access.revokeProjectAfterRead && access.projectReads > 1 ? [11] : [...access.projectIds];
  }),
  canAccessReportScope: vi.fn(async () => { access.scopeReads += 1; return !(access.revokeScopeAfterRead && access.scopeReads > 1); }),
}));
vi.mock('../../services/report-os/entitlement-map', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/entitlement-map')>()), requireReportEntitlement: h.gate,
}));
vi.mock('../../services/c2c/current-program-access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/c2c/current-program-access')>();
  return { ...actual, readCurrentProgramActor: vi.fn(async () => {
    access.actorReads += 1;
    if (access.revokedActor || (access.revokeActorAfterRead && access.actorReads > 1)) {
      throw new actual.ProgramReadAccessError(403, 'PROJECT_ACTOR_ACCESS_DENIED', 'Current membership is required.');
    }
    return { userId: 5, role: 'manager' };
  }) };
});
vi.mock('../../services/auditService', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../services/auditService')>()), writeChainedAuditRow: h.audit }));

import reportOsRouter from '../report-os';
import { readCurrentProgramActor } from '../../services/c2c/current-program-access';
import { canAccessReportScope, getAccessibleReportProjectIds } from '../../services/report-os/project-access';
import { boundInsertColumn, resetReportOsHarness, tenantStampSql } from './_report-os-route-harness';

let requestOverride: { client: unknown; db: unknown } | undefined;
const app = express();
app.use(express.json());
app.use(async (req, _res, next) => {
  Object.assign(req, { dbClient: requestOverride?.client ?? await h.pool.connect(), __requestDb: requestOverride?.db ?? h.db });
  (req as unknown as { user: { id: number; role: string; organizationId: number } }).user = { id: 5, role: 'manager', organizationId: 7 };
  next();
});
app.use('/api/report-os', reportOsRouter);

const run = (id: number, projectId: number, blockers: string[]) => ({
  id, runUuid: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`, organizationId: 7,
  scopeType: 'project', scopeId: String(projectId), reportTypeId: 'readiness.executive_digest', status: 'completed',
  confidence: 90, blockers, dependencySummary: {}, createdAt: new Date('2026-10-13T12:00:00Z'),
});
function ready(blockers: string[] = Array.from({ length: 12 }, (_, i) => `Finding ${i}: ${'x'.repeat(2400)} END-${i}`)) {
  h.queued.select.push([run(41, 11, blockers), run(42, 12, ['Final finding'])],
    [{ typeId: 'readiness.executive_digest', label: 'Executive Readiness Digest' }], [{ id: 11 }, { id: 12 }]);
  h.respond.fn = (sql, arrayMode) => arrayMode && /select "id" from "project_intelligence_profiles"/.test(sql) ? [[101]] : [];
}
const post = () => request(app).post('/api/report-os/bundles').send({ name: 'Two-project review pack', runIds: [41, 42] });
const copies = () => h.statements.flatMap((sql, index) => /^insert into "project_memory_entries"/.test(sql)
  ? [h.params[index].find(value => typeof value === 'string' && value.startsWith('{"bundleRecord":')) as string] : []);

beforeEach(() => {
  resetReportOsHarness(h);
  Object.assign(access, { projectIds: [11, 12], projectReads: 0, actorReads: 0, scopeReads: 0,
    revokedActor: false, revokeActorAfterRead: false, revokeProjectAfterRead: false, revokeScopeAfterRead: false });
  vi.mocked(readCurrentProgramActor).mockClear();
  vi.mocked(getAccessibleReportProjectIds).mockClear();
  vi.mocked(canAccessReportScope).mockClear();
  requestOverride = undefined;
});

function storedPack(index: number, projectId = 11) {
  const bundleId = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  return { id: 100_000 - index, title: `bundle:${bundleId}`, createdAt: '2026-10-13 12:00:00.123456',
    content: JSON.stringify({ bundleRecord: { bundleId, organizationId: 7, name: 'Recorded pack',
      createdAt: '2026-10-13T12:00:00Z', createdBy: 5, projectIds: [projectId], runIds: [41], items: [] } }) };
}
function addDocumentScope(row: ReturnType<typeof storedPack>) {
  const payload = JSON.parse(row.content);
  payload.bundleRecord.items = [{ runId: 41, runUuid: 'run-41', reportTypeId: 'readiness.executive_digest',
    reportTypeLabel: 'Readiness', scopeType: 'document', scopeId: 'artifact-41', status: 'completed', confidence: 90,
    blockers: [], createdAt: '2026-10-13T12:00:00Z' }];
  return { ...row, content: JSON.stringify(payload) };
}


describe('saved report packs are complete and atomically recorded', () => {
  it('roundtrips more than 20,000 characters with one intact copy per project and a bound audit event', async () => {
    ready();
    const result = await post();
    expect(result.status).toBe(201);
    const stored = copies();
    expect(stored).toHaveLength(2);
    expect(stored[0].length).toBeGreaterThan(20_000);
    expect(stored[0]).toBe(stored[1]);
    expect(JSON.parse(stored[0]).bundleRecord).toEqual(result.body.data);
    expect(stored[0]).toContain('END-11');
    h.statements.forEach((sql, index) => {
      if (/^insert into "project_memory_entries"/.test(sql)) expect(boundInsertColumn(sql, h.params[index], 'confidence_score')).toBeNull();
    });
    expect(h.statements.slice(0, 2)).toEqual(['BEGIN', tenantStampSql()]);
    expect(h.statements.slice(-3)).toEqual(['<audit row>', 'COMMIT', '<released>']);
    expect(h.audit.mock.calls[0]?.[1]).toMatchObject({ tenantId: 7, userId: 5, action: 'report_os.bundle_created',
      details: { projectIds: [11, 12], runIds: [41, 42], byteLength: Buffer.byteLength(stored[0]),
        payloadHash: createHash('sha256').update(stored[0]).digest('hex') } });
    h.queued.select.push([{ title: `bundle:${result.body.data.bundleId}`, content: stored[0], createdAt: new Date() }]);
    const listed = await request(app).get('/api/report-os/bundles');
    expect(listed.status).toBe(200);
    expect(listed.body.data).toEqual([result.body.data]);
    expect(listed.body.meta).toBeUndefined();
  });

  it('rolls both project copies back when the second write fails, before any success or audit event', async () => {
    ready();
    let insertCount = 0;
    h.respond.fn = (sql, arrayMode) => {
      if (/^insert into "project_memory_entries"/.test(sql) && ++insertCount === 2) throw new Error('second copy failed');
      return arrayMode && /select "id" from "project_intelligence_profiles"/.test(sql) ? [[101]] : [];
    };
    const result = await post();
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe('REPORT_BUNDLE_NOT_RECORDED');
    expect(result.body.data).toBeUndefined();
    expect(copies()).toHaveLength(2);
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.statements.slice(-2)).toEqual(['ROLLBACK', '<released>']);
    expect(h.statements).not.toContain('COMMIT');
  });

  it('rolls every copy back when the audit event fails', async () => {
    ready();
    h.audit.mockImplementation(async () => { h.statements.push('<audit row>'); throw new Error('audit failed'); });
    const result = await post();
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe('REPORT_BUNDLE_NOT_RECORDED');
    expect(copies()).toHaveLength(2);
    expect(h.statements.slice(-3)).toEqual(['<audit row>', 'ROLLBACK', '<released>']);
    expect(h.statements).not.toContain('COMMIT');
  });


});

describe('report pack register admits before counting or limiting', () => {
  it('counts only admitted distinct packs and states a lower bound after an actual extra admitted pack', async () => {
    h.queued.select.push(Array.from({ length: 5000 }, (_, i) => storedPack(i + 1)), [storedPack(5001)]);
    const listed = await request(app).get('/api/report-os/bundles');
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(5000);
    expect(listed.body.meta).toEqual({ truncated: true, registerTotalAtLeast: 5001 });
    expect(listed.body.meta).not.toHaveProperty('registerTotal');
  });

  it('does not disclose private packs through register totals or truncation metadata', async () => {
    const visible = storedPack(1);
    h.queued.select.push([visible]);
    const before = await request(app).get('/api/report-os/bundles');
    expect(before.status).toBe(200);
    h.queued.select.push([storedPack(2, 13), visible]);
    const after = await request(app).get('/api/report-os/bundles');
    expect(after.status).toBe(200);
    expect(after.body.data).toEqual(before.body.data);
    expect(after.body).toEqual(before.body);
  });

  it('continues past private rows before limiting the authorized register', async () => {
    h.queued.select.push(Array.from({ length: 5000 }, (_, i) => storedPack(i + 1, 13)), [storedPack(5001)]);
    const listed = await request(app).get('/api/report-os/bundles');
    expect(listed.status).toBe(200);
    expect(listed.body.data.map((pack: { bundleId: string }) => pack.bundleId)).toEqual([JSON.parse(storedPack(5001).content).bundleRecord.bundleId]);
    expect(listed.body.meta).toBeUndefined();
    expect(h.reads.select).toBe(2);
  });

  it('does not reveal an older public copy behind a private latest record, even across a page boundary', async () => {
    const latest = storedPack(1, 13);
    h.queued.select.push(Array.from({ length: 5000 }, (_, i) => ({ ...latest, id: 100_000 - i })), [storedPack(1)]);
    const listed = await request(app).get('/api/report-os/bundles');
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual({ data: [] });
    expect(h.reads.select).toBe(2);
  });

  it.each(['actor before', 'actor during', 'project during', 'scope during'])('refuses %s revocation without data or count metadata', async phase => {
    access.revokedActor = phase === 'actor before';
    access.revokeActorAfterRead = phase === 'actor during';
    access.revokeProjectAfterRead = phase === 'project during';
    access.revokeScopeAfterRead = phase === 'scope during';
    h.queued.select.push([phase === 'scope during' ? addDocumentScope(storedPack(1, 12)) : storedPack(1, 12)]);
    const listed = await request(app).get('/api/report-os/bundles');
    expect(listed.status).toBe(phase.startsWith('actor') ? 403 : 503);
    expect(listed.body.data).toBeUndefined();
    expect(listed.body.meta).toBeUndefined();
    if (phase === 'actor before') expect(h.reads.select).toBe(0);
  });

});

describe('report pack register execution context', () => {
  it('uses the same request executor for current actor, project admission, source checks and revalidation', async () => {
    h.queued.select.push([addDocumentScope(storedPack(1))]);
    const listed = await request(app).get('/api/report-os/bundles');
    expect(listed.status).toBe(200);
    const executor = await h.pool.connect();
    expect(vi.mocked(readCurrentProgramActor).mock.calls).toHaveLength(2);
    for (const args of vi.mocked(readCurrentProgramActor).mock.calls) expect(args[0]).toBe(executor);
    for (const args of vi.mocked(getAccessibleReportProjectIds).mock.calls) expect(args[2]).toBe(executor);
    for (const args of vi.mocked(canAccessReportScope).mock.calls) expect(args[3]).toBe(executor);
  });

  it('retains PostgreSQL timestamp precision in its bounded stable keyset', async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => storedPack(i + 1, 13));
    const pages = [rows, [storedPack(5001)]];
    const statements: { text: string; values: unknown[] }[] = [];
    const client = { query: async (config: { text: string }, values: unknown[]) => {
      statements.push({ text: config.text, values });
      return { rows: (pages.shift() ?? []).map(row => [row.id, row.title, row.content, row.createdAt]) };
    } };
    requestOverride = { client, db: drizzle(client as any) };
    const listed = await request(app).get('/api/report-os/bundles');
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(statements).toHaveLength(2);
    expect(statements[1].text).toContain('::timestamp');
    expect(statements[1].text).toContain('::integer');
    expect(statements[1].values).toContain('2026-10-13 12:00:00.123456');
    expect(statements.every(statement => !/count\s*\(/i.test(statement.text))).toBe(true);
  });

});

describe('report pack register refuses incomplete records', () => {
  it('refuses manifests above the explicit size limit before writes or audit', async () => {
    ready(['x'.repeat(2 * 1024 * 1024)]);
    const result = await post();
    expect(result.status).toBe(413);
    expect(result.body.error.code).toBe('REPORT_BUNDLE_TOO_LARGE');
    expect(h.statements).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it.each(['{"bundleRecord":{"bundleId":', '{"bundleRecord":{"organizationId":99}}'])('refuses corrupt saved pack data instead of an empty register (%s)', async content => {
    h.queued.select.push([{ title: 'bundle:old-record', content, createdAt: new Date() }]);
    const result = await request(app).get('/api/report-os/bundles');
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe('REPORT_BUNDLE_CORRUPT');
    expect(result.body.data).toBeUndefined();
  });
});


it('carries every contributing project into a saved account-calendar bundle manifest and its reserved stored copies', async () => {
  const calendar = { ...run(41,11,['Lifecycle legal assessment remains unavailable']), reportTypeId:'lifecycle.obligation_calendar',scopeType:'account',scopeId:'7',dependencySummary:{summary:{accessProjectIds:[11,12]}} };
  h.queued.select.push([calendar,run(42,11,[])],[{typeId:'lifecycle.obligation_calendar',label:'Lifecycle Obligation Calendar'},{typeId:'readiness.executive_digest',label:'Executive Readiness Digest'}],[{id:11},{id:12}]);
  h.respond.fn=(sql,arrayMode)=>arrayMode&&/select "id" from "project_intelligence_profiles"/.test(sql)?[[101]]:[];
  const result=await post();
  expect(result.status,JSON.stringify(result.body)).toBe(201);
  expect(result.body.data.projectIds).toEqual([11,12]);
  expect(result.body.data.items.find((item:{runId:number})=>item.runId===41)).toMatchObject({scopeType:'account',scopeId:'7',accessProjectIds:[11,12]});
  expect(copies()).toHaveLength(2);
  for (const copy of copies()) expect(JSON.parse(copy).bundleRecord).toEqual(result.body.data);
  h.statements.forEach((sql,index)=>{
    if (/^insert into "project_memory_entries"/.test(sql)) expect(boundInsertColumn(sql,h.params[index],'source_document_type')).toBe('report_os_state');
  });
});
