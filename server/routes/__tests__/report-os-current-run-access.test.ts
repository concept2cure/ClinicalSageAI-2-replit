/** Current persisted authority is checked after computation on the actual
 * report persistence connection; request-time claims cannot authorize a late write. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = await vi.hoisted(async () => (await import('./_report-os-route-harness')).createReportOsHarness());
const state = vi.hoisted(() => ({ role: 'manager', active: true, projectOwner: 5, readUnavailable: false, scopeAvailable: true }));
vi.mock('../../db', () => ({ db: h.db, pool: h.pool, getPool: () => h.pool, getDb: () => h.db, query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../auth', () => ({ authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../utils/authedOrgId', async original => ({ ...await original<typeof import('../../utils/authedOrgId')>(), authedOrgId: () => 7 }));
vi.mock('../../services/report-os/project-access', async original => ({
  ...await original<typeof import('../../services/report-os/project-access')>(),
  // Preflight discovery is not this suite's subject. The enlisted late scope
  // check uses the real canonical policy and its supplied SQL connection.
  getAccessibleReportProjectIds: async () => [11],
}));
vi.mock('../../services/report-os/entitlement-map', async original => ({ ...await original<typeof import('../../services/report-os/entitlement-map')>(), requireReportEntitlement: h.gate }));
vi.mock('../../services/report-os/orchestrator', () => ({ computeInitialRun: h.compute }));
vi.mock('../../services/report-os/segment', async original => ({ ...await original<typeof import('../../services/report-os/segment')>(), deriveScopeSegments: async () => ['pharma'] }));
vi.mock('../../services/auditService', async original => ({ ...await original<typeof import('../../services/auditService')>(), writeChainedAuditRow: h.audit }));

import router from '../report-os';
import { driverRow, resetReportOsHarness } from './_report-os-route-harness';
import { reportRuns, reportSnapshots } from '@shared/schema/report-os';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as unknown as { user: unknown }).user = { id: 5, organizationId: 7, role: 'manager' };
  next();
});
app.use('/api/report-os', router);
const type = { typeId: 'readiness.executive_digest', label: 'Readiness', family: 'readiness', allowedScopes: ['project'], allowedClientSegments: ['pharma'], enabled: true };
const run = { id: 61, runUuid: '00000000-0000-4000-8000-000000000061', organizationId: 7, requestedBy: 5, scopeType: 'project', scopeId: '11', reportTypeId: type.typeId, status: 'completed', dependencySummary: { summary: {} }, blockers: [], confidence: null };
const post = () => request(app).post('/api/report-os/runs').send({ reportTypeId: type.typeId, scopeType: 'project', scopeId: '11' });

beforeEach(() => {
  resetReportOsHarness(h);
  Object.assign(state, { role: 'manager', active: true, projectOwner: 5, readUnavailable: false, scopeAvailable: true });
  h.queued.select.push([type], [{ id: 11, code: 'R11', name: 'Current access project' }]);
  h.respond.fn = (sql, arrayMode) => {
    if (arrayMode) return /insert into "report_runs"/.test(sql) ? [driverRow(reportRuns, run)]
      : /insert into "report_snapshots"/.test(sql) ? [driverRow(reportSnapshots, { id: 62, runId: run.id, organizationId: 7, scopeType: 'project', scopeId: '11', snapshotVersion: 1, isLatest: true })] : [];
    if (/FROM organization_users ou/.test(sql)) {
      if (state.readUnavailable) throw new Error('membership read unavailable');
      return state.active ? [{ role: state.role }] : [];
    }
    if (/FROM projects p LEFT JOIN/.test(sql)) return [{ id: 11, owner_id: state.projectOwner, created_by_id: state.projectOwner, settings: {}, visibility: 'private', members: [], review_assigned: false }];
    if (/SELECT id FROM projects WHERE/.test(sql)) return state.scopeAvailable ? [{ id: 11 }] : [];
    return [];
  };
});

describe('every manual report retains current authority at persistence', () => {
  it('keeps an authorized counterexample and checks membership on the same tenant transaction', async () => {
    const response = await post();
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const check = h.statements.findIndex(sql => sql.includes('FROM organization_users ou'));
    expect(check).toBeGreaterThan(h.statements.indexOf('<audit row>'));
    expect(h.statements[check]).toContain('FOR SHARE OF ou,u,o');
    const queryIndex = h.statements.slice(0, check).filter(sql => !sql.startsWith('<')).length;
    expect(h.params[queryIndex]).toEqual([7, 5]);
    expect(h.statements.slice(-2)).toEqual(['COMMIT', '<released>']);
  });

  it.each(['demoted', 'inactive', 'project-revoked', 'unavailable', 'project-archived'])('refuses %s authority changed during computation and rolls back the entire run', async kind => {
    h.compute.mockImplementationOnce(async () => {
      if (kind === 'demoted') state.role = 'viewer';
      if (kind === 'inactive') state.active = false;
      if (kind === 'project-revoked') { state.role = 'member'; state.projectOwner = 88; }
      if (kind === 'unavailable') state.readUnavailable = true;
      if (kind === 'project-archived') state.scopeAvailable = false;
      return { providers: [], blockers: [], criticalBlockers: [], summary: {}, confidence: null };
    });
    const response = await post();
    expect(response.status, JSON.stringify(response.body)).toBe(kind === 'unavailable' ? 503 : kind === 'project-archived' ? 404 : 403);
    expect(response.body.data).toBeUndefined();
    expect(response.body.code).toBe(kind === 'demoted' || kind === 'project-revoked' ? 'PROJECT_PERMISSION_DENIED' : kind === 'inactive' ? 'PROJECT_ACTOR_ACCESS_DENIED' : kind === 'project-archived' ? 'REPORT_SCOPE_NOT_FOUND' : 'PROJECT_ACCESS_UNAVAILABLE');
    expect(h.statements).toContain('<audit row>');
    expect(h.statements).not.toContain('COMMIT');
    expect(h.statements.slice(-2)).toEqual(['ROLLBACK', '<released>']);
  });
});
