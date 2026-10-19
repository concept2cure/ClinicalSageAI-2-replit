/** The saved pack must roundtrip whole, and every project copy and its audit
 * event must commit together. The real route/Drizzle transaction are exercised;
 * the connection and audit edge record statement order and injected failures. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHash } from 'node:crypto';

const h = await vi.hoisted(async () => (await import('./_report-os-route-harness')).createReportOsHarness());
vi.mock('../../db', () => ({ db: h.db, pool: h.pool, getPool: () => h.pool, getDb: () => h.db, query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../auth', () => ({ authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../utils/authedOrgId', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../utils/authedOrgId')>()), authedOrgId: () => 7 }));
vi.mock('../../services/report-os/project-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/project-access')>()),
  getAccessibleReportProjectIds: async () => [11, 12], canAccessReportScope: async () => true,
}));
vi.mock('../../services/report-os/entitlement-map', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/entitlement-map')>()), requireReportEntitlement: h.gate,
}));
vi.mock('../../services/auditService', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../services/auditService')>()), writeChainedAuditRow: h.audit }));

import reportOsRouter from '../report-os';
import { boundInsertColumn, resetReportOsHarness, tenantStampSql } from './_report-os-route-harness';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
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

beforeEach(() => resetReportOsHarness(h));

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
    /* The register read counts the distinct bundles BEFORE it scans the rows
       (loadBundleRegister), so the count row is queued first. One bundle
       counted and one decoded means a complete read, and the response carries
       no `meta` — the truncation note exists only when it is true. */
    h.queued.select.push([{ n: 1 }], [{ title: `bundle:${result.body.data.bundleId}`, content: stored[0], createdAt: new Date() }]);
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


  it('says the register holds more packs than it read, and only when it does', async () => {
    /* THE SILENT CAP. loadBundleRegister scans a bounded number of
       project_memory_entries ROWS, and a bundle is stored once per covered
       project — so the scan is counted in rows while the register is counted
       in bundles. Past the bound the oldest packs were simply absent from a
       list presented as the register.

       Three bundles counted in SQL, one decoded from the scanned rows: the
       response must carry the register's own count, not the scan's. The count
       comes from `count(distinct title)` precisely so it cannot agree with a
       truncated scan by construction. */
    const bundleId = '00000000-0000-4000-8000-00000000beef';
    const content = JSON.stringify({ bundleRecord: {
      bundleId, organizationId: 7, name: 'Only pack read',
      createdAt: '2026-10-13T12:00:00Z', createdBy: 5, projectIds: [11], runIds: [41], items: [],
    } });
    h.queued.select.push([{ n: 3 }], [{ title: `bundle:${bundleId}`, content, createdAt: new Date() }]);
    const listed = await request(app).get('/api/report-os/bundles');
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.meta).toEqual({ truncated: true, registerTotal: 3 });
  });

  it('refuses manifests above the explicit size limit before writes or audit', async () => {
    ready(['x'.repeat(2 * 1024 * 1024)]);
    const result = await post();
    expect(result.status).toBe(413);
    expect(result.body.error.code).toBe('REPORT_BUNDLE_TOO_LARGE');
    expect(h.statements).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it.each(['{"bundleRecord":{"bundleId":', '{"bundleRecord":{"organizationId":99}}'])('refuses corrupt saved pack data instead of an empty register (%s)', async content => {
    h.queued.select.push([{ n: 1 }], [{ title: 'bundle:old-record', content, createdAt: new Date() }]);
    const result = await request(app).get('/api/report-os/bundles');
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe('REPORT_BUNDLE_CORRUPT');
    expect(result.body.data).toBeUndefined();
  });
});
