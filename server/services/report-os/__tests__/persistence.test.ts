import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = await vi.hoisted(async () => (await import('../../../routes/__tests__/_report-os-route-harness')).createReportOsHarness());

vi.mock('../../../db', () => ({ getPool: () => h.pool }));
vi.mock('../../auditService', () => ({ writeChainedAuditRow: h.audit }));

import { persistReportRun, ReportRunRecordingError, type ReportRunRows } from '../persistence';
import { reportRuns, reportSnapshots } from '../../../../shared/schema/report-os';
import { driverRow, resetReportOsHarness } from '../../../routes/__tests__/_report-os-route-harness';

const createdAt = new Date('2026-10-10T09:00:00.000Z');
const run = {
  id: 41, runUuid: '00000000-0000-4000-8000-000000000041', organizationId: 7,
  reportTypeId: 'readiness.executive_digest', scopeType: 'project', scopeId: '17',
  status: 'partial', requestedBy: 5, confidence: 73, blockers: ['missing evidence'],
  createdAt,
};
const snapshot = { id: 9, runId: run.id, organizationId: 7, scopeType: run.scopeType, scopeId: run.scopeId, snapshotVersion: 1, isLatest: true, createdAt };
const actor = { userId: 5, ipAddress: '127.0.0.1', userAgent: 'test-platform-delivery' };
const rows = (): ReportRunRows => ({
  run: { organizationId: run.organizationId, reportTypeId: run.reportTypeId, scopeType: run.scopeType, scopeId: run.scopeId, status: run.status, requestedBy: run.requestedBy, confidence: run.confidence, blockers: run.blockers },
  snapshot: { organizationId: 7, scopeType: 'project', scopeId: '17', snapshotMetadata: { capturedAt: createdAt.toISOString() }, createdBy: 5 },
  dependencies: [{ organizationId: 7, provider: 'submission_readiness', status: 'ok', payload: { evidenceIds: ['e-1'] } }],
});

beforeEach(() => {
  resetReportOsHarness(h);
  h.respond.fn = (sql, arrayMode) => !arrayMode ? []
    : /insert into "report_runs"/.test(sql) ? [driverRow(reportRuns, run)]
      : /insert into "report_snapshots"/.test(sql) ? [driverRow(reportSnapshots, snapshot)] : [];
});
afterEach(() => vi.restoreAllMocks());

describe('canonical report persistence', () => {
  it('commits the run, snapshot, dependencies, chained audit and platform effect on one tenant connection', async () => {
    const effect = vi.fn(async (client, created) => {
      expect(client).toBe(await h.pool.connect());
      expect(created.run.id).toBe(run.id);
      expect(created.snapshot.runId).toBe(run.id);
      h.statements.push('<platform effect>');
    });
    const saved = await persistReportRun(rows(), actor, effect);

    expect(saved.run).toMatchObject(run);
    expect(saved.snapshot).toMatchObject(snapshot);
    expect(h.statements).toEqual([
      'BEGIN', expect.stringContaining("set_config('app.current_tenant_id', $1, true)"),
      expect.stringMatching(/^insert into "report_runs"/),
      expect.stringMatching(/^insert into "report_snapshots"/),
      expect.stringMatching(/^insert into "report_run_dependencies"/),
      '<audit row>', '<platform effect>', 'COMMIT', '<released>',
    ]);
    expect(h.params[1]).toEqual(['7']);
    expect(h.params[3]).toContain(run.id);
    expect(h.params[4]).toContain(run.id);
    expect(h.audit).toHaveBeenCalledOnce();
    expect(h.audit.mock.calls[0][0]).toBe(await h.pool.connect());
    expect(h.audit.mock.calls[0][1]).toMatchObject({
      tenantId: 7, ...actor, action: 'report_os.run_created', resourceType: 'report_run', resourceId: '41',
      details: { runUuid: run.runUuid, reportTypeId: run.reportTypeId, scopeType: 'project', scopeId: '17', status: 'partial', confidence: 73, blockerCount: 1 },
    });
    expect(effect).toHaveBeenCalledOnce();
  });

  it('records a run with no dependencies without issuing an empty dependency insert', async () => {
    const input = rows();
    input.dependencies = [];
    await expect(persistReportRun(input, actor)).resolves.toMatchObject({ run: { id: 41 }, snapshot: { runId: 41 } });
    expect(h.statements.some(statement => /insert into "report_run_dependencies"/.test(statement))).toBe(false);
    expect(h.statements.slice(-3)).toEqual(['<audit row>', 'COMMIT', '<released>']);
  });
});

describe('report persistence identity validation', () => {
  it.each([
    ['invalid organization', (input: ReportRunRows) => { input.run.organizationId = 0; }],
    ['cross-tenant snapshot', (input: ReportRunRows) => { input.snapshot.organizationId = 8; }],
    ['cross-tenant dependency', (input: ReportRunRows) => { input.dependencies[0].organizationId = 8; }],
    ['a different requesting actor', (input: ReportRunRows) => { input.run.requestedBy = 9; }],
    ['a different snapshot actor', (input: ReportRunRows) => { input.snapshot.createdBy = 9; }],
    ['contradictory snapshot scope', (input: ReportRunRows) => { input.snapshot.scopeId = 'a-different-project'; }],
    ['contradictory snapshot scope type', (input: ReportRunRows) => { input.snapshot.scopeType = 'document'; }],
  ])('rejects %s before opening a transaction', async (_description, change) => {
    const input = rows();
    change(input);
    const effect = vi.fn();
    await expect(persistReportRun(input, actor, effect)).rejects.toThrow();
    expect(h.statements).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
    expect(effect).not.toHaveBeenCalled();
  });
});

describe('report persistence rollback guarantees', () => {
  it('rolls back the whole run when the audit chain refuses it and never calls delivery', async () => {
    const cause = new Error('chain write refused');
    h.audit.mockImplementation(async () => { h.statements.push('<audit refused>'); throw cause; });
    const effect = vi.fn();

    await expect(persistReportRun(rows(), actor, effect)).rejects.toMatchObject({ name: 'ReportRunRecordingError', cause });
    expect(effect).not.toHaveBeenCalled();
    expect(h.statements.slice(-3)).toEqual(['<audit refused>', 'ROLLBACK', '<released>']);
    expect(h.statements).not.toContain('COMMIT');
  });

  it('rolls back the run and its audit when platform delivery fails', async () => {
    const failure = new Error('platform notification insert refused');
    const effect = vi.fn(async () => { h.statements.push('<platform effect refused>'); throw failure; });

    await expect(persistReportRun(rows(), actor, effect)).rejects.toBe(failure);
    expect(h.audit).toHaveBeenCalledOnce();
    expect(h.statements.slice(-4)).toEqual(['<audit row>', '<platform effect refused>', 'ROLLBACK', '<released>']);
    expect(h.statements).not.toContain('COMMIT');
  });

  it.each(['report_runs', 'report_snapshots', 'report_run_dependencies'])('rolls back a failed %s insert without recording or delivering', async table => {
    const answer = h.respond.fn;
    const failure = new Error(`${table} refused`);
    h.respond.fn = (sql, arrayMode) => {
      if (sql.startsWith(`insert into "${table}"`)) throw failure;
      return answer(sql, arrayMode);
    };
    const effect = vi.fn();
    await expect(persistReportRun(rows(), actor, effect)).rejects.toMatchObject({ cause: failure });
    expect(h.audit).not.toHaveBeenCalled();
    expect(effect).not.toHaveBeenCalled();
    expect(h.statements.slice(-2)).toEqual(['ROLLBACK', '<released>']);
    expect(h.statements).not.toContain('COMMIT');
  });

  it('retains the audit failure type used by fail-closed HTTP callers', () => {
    expect(new ReportRunRecordingError(new Error('refused'))).toBeInstanceOf(Error);
    expect(new ReportRunRecordingError(null).message).toMatch(/could not be recorded/);
  });

  it('returns no success when COMMIT fails and rolls back before releasing the connection', async () => {
    const client = await h.pool.connect();
    const query = client.query.bind(client);
    const failure = new Error('commit refused');
    vi.spyOn(client, 'query').mockImplementation(async (statement, values) => {
      if (statement === 'COMMIT') { h.statements.push('COMMIT'); throw failure; }
      return query(statement, values);
    });
    await expect(persistReportRun(rows(), actor)).rejects.toBe(failure);
    expect(h.statements.slice(-4)).toEqual(['<audit row>', 'COMMIT', 'ROLLBACK', '<released>']);
  });

  it('destroys a connection whose rollback fails rather than returning an uncertain transaction to the pool', async () => {
    const client = await h.pool.connect();
    const query = client.query.bind(client);
    const cleanupFailure = new Error('rollback refused');
    const originalFailure = new Error('platform delivery refused');
    vi.spyOn(client, 'query').mockImplementation(async (statement, values) => {
      if (statement === 'ROLLBACK') { h.statements.push('ROLLBACK'); throw cleanupFailure; }
      return query(statement, values);
    });
    const release = vi.spyOn(client, 'release');
    await expect(persistReportRun(rows(), actor, async () => { throw originalFailure; })).rejects.toBe(originalFailure);
    expect(release).toHaveBeenCalledWith(cleanupFailure);
    expect(h.statements).not.toContain('COMMIT');
  });
});
