/** Actual POST /runs and actual regional computation: strict metadata refusal
 * precedes retained run/snapshot/audit writes. Database/auth doubles qualify
 * the route's ordering only; they do not establish native RLS or signatures. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const h = await vi.hoisted(async () => (await import('./_report-os-route-harness')).createReportOsHarness());
const x = vi.hoisted(() => ({ regionalQuery: vi.fn(), segments: vi.fn() }));
vi.mock('../../db', () => ({ db: h.db, pool: { ...h.pool, query: x.regionalQuery }, getPool: () => h.pool, getDb: () => h.db, query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../auth', () => ({ authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../utils/authedOrgId', async importOriginal => ({ ...(await importOriginal<typeof import('../../utils/authedOrgId')>()), authedOrgId: () => 7 }));
vi.mock('../../services/report-os/entitlement-map', async importOriginal => ({ ...(await importOriginal<typeof import('../../services/report-os/entitlement-map')>()), requireReportEntitlement: h.gate }));
vi.mock('../../services/report-os/project-access', async importOriginal => ({ ...(await importOriginal<typeof import('../../services/report-os/project-access')>()), getAccessibleReportProjectIds: async () => [11], canAccessReportScope: async () => true }));
vi.mock('../../services/report-os/segment', async importOriginal => ({ ...(await importOriginal<typeof import('../../services/report-os/segment')>()), deriveScopeSegments: x.segments }));
vi.mock('../../services/report-os/orchestrator', () => ({ computeInitialRun: h.compute }));
vi.mock('../c2c/actions', async importOriginal => ({ ...(await importOriginal<typeof import('../c2c/actions')>()), verifyReauth: h.reauth, recordGovernedAction: h.ledger }));
vi.mock('../../services/part11/signature-persistence', async importOriginal => ({ ...(await importOriginal<typeof import('../../services/part11/signature-persistence')>()), persistGovernedSignSignature: h.signature }));
vi.mock('../../services/auditService', async importOriginal => ({ ...(await importOriginal<typeof import('../../services/auditService')>()), writeChainedAuditRow: h.audit }));
import reportOsRouter from '../report-os';
import { driverRow, resetReportOsHarness } from './_report-os-route-harness';
import { reportRuns, reportSnapshots } from '@shared/schema/report-os';
const app = express(); app.use(express.json());
app.use((req, _res, next) => {
  (req as unknown as { user: unknown }).user = { id: 5, role: 'manager', organizationId: 7 };
  (req as unknown as { dbClient: unknown }).dbClient = { query: async () => ({ rows: [] }) };
  next();
});
app.use('/api/report-os', reportOsRouter);
const TYPE = { typeId: 'usa_fda.nda_bla_filing_readiness', label: 'FDA NDA / BLA', family: 'usa_fda_nda_bla', enabled: true, allowedScopes: ['project'], allowedClientSegments: ['pharma', 'biotech'], governanceRequirements: { region: 'USA_FDA' }, dataDependencies: [] };
const PROJECT = { id: 11, code: 'REPORT-11', name: 'Invented QA project' };
const RUN = { id: 52, runUuid: '00000000-0000-4000-8000-000000000052', organizationId: 7, scopeType: 'project', scopeId: '11', reportTypeId: TYPE.typeId, status: 'partial', confidence: null, blockers: [], dependencySummary: { providers: [], summary: {}, criticalBlockers: [] }, createdAt: new Date('2026-10-14T07:00:00Z'), completedAt: new Date('2026-10-14T07:00:00Z') };
let metadata: unknown;
const metrics = /FROM sections|concept2cure_artifacts|c2c_rule_packs/;
const post = (additional: Record<string, unknown> = {}) => request(app).post('/api/report-os/runs').send({ scopeType: 'project', scopeId: '11', reportTypeId: TYPE.typeId, ...additional });
beforeEach(() => {
  resetReportOsHarness(h); metadata = { registryId: 'US_NDA', submissionType: 'NDA' };
  h.gate.mockResolvedValue({ entitled: true, tier: 'standard', tierResolved: true });
  h.queued.select.push([TYPE], [PROJECT]); x.segments.mockReset().mockResolvedValue(['biotech']);
  x.regionalQuery.mockReset().mockImplementation(async (sql: string) => {
    if (sql.includes('FROM projects')) return { rows: [{ metadata }] };
    if (metrics.test(sql)) return { rows: [] };
    throw new Error('Unexpected regional computation query');
  });
  h.respond.fn = (_sql, arrayMode) => !arrayMode ? _sql.includes('SELECT ou.role') ? [{ role: 'manager' }]
    : _sql.includes('SELECT id FROM projects WHERE') ? [{ id: 11 }] : []
    : /"report_runs"/.test(_sql) ? [driverRow(reportRuns, RUN)] : /"report_snapshots"/.test(_sql) ? [driverRow(reportSnapshots, { id: 3, runId: 52, organizationId: 7, scopeType: 'project', scopeId: '11', snapshotVersion: 1, isLatest: true })] : [];
});
describe('current regional filing is admitted before retained report writes', () => {
  it('the positive fixture genuinely reaches the regional engine, retention transaction and audit', async () => {
    const result = await post(); expect(result.status, JSON.stringify(result.body)).toBe(201);
    expect(x.regionalQuery.mock.calls.find(([sql]) => sql.includes('FROM projects'))?.[1]).toEqual([11, 7]);
    expect(h.compute).not.toHaveBeenCalled(); expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.statements.some(sql => /^insert into "report_runs"/.test(sql))).toBe(true);
  });
  it.each([{ registryId: 'US_NDA', submissionType: 'MAA' }, { registryId: null, submissionType: 'NDA' }, { registryId: 'US_NDA', submissionType: 'unknown type' }])('refuses malformed/conflicting current metadata without partial run, audit or signing records (%j)', async invalid => {
    metadata = invalid;
    const result = await post(); expect(result.status, JSON.stringify(result.body)).toBe(422);
    expect(result.body.code).toBe('REPORT_TYPE_NOT_COMPUTED');
    expect(x.regionalQuery.mock.calls.some(([sql]) => metrics.test(sql))).toBe(false);
    expect(h.audit).not.toHaveBeenCalled(); expect(h.ledger).not.toHaveBeenCalled(); expect(h.signature).not.toHaveBeenCalled();
    expect(h.statements).toEqual([]);
  });
  it('refuses a newly recorded wrong market before metrics or persistence', async () => {
    metadata = { registryId: 'EU_MAA' };
    const result = await post(); expect(result.status).toBe(422); expect(result.body.error).toMatch(/assesses a US filing/);
    expect(x.regionalQuery.mock.calls.some(([sql]) => metrics.test(sql))).toBe(false);
    expect(h.audit).not.toHaveBeenCalled(); expect(h.statements).toEqual([]);
  });
  it('a posted registry never substitutes for the project record', async () => {
    metadata = { registryId: 'EU_MAA' };
    const result = await post({ registryId: 'US_NDA' }); expect(result.status).toBe(422);
    expect(result.body.code).toBe('REPORT_REGISTRY_CONTEXT_UNSUPPORTED');
    expect(x.regionalQuery).not.toHaveBeenCalled(); expect(h.audit).not.toHaveBeenCalled(); expect(h.statements).toEqual([]);
  });
});
