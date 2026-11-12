/**
 * A report project group is a governed record: it names the projects a board
 * report or a schedule covers. Found reaching it for a screen (P-122, Reporting;
 * probed in the running app on 2026-11-12, see
 * docs/evidence/DESIGN/P-122/reporting/2026-11-12-project-groups/):
 *
 *   - PATCH /program-groups/:id took its body unvalidated. `{ status: 'nonsense',
 *     name: '' }` answered 200: the group was saved with no name and a status no
 *     reader lists, so it vanished from the default list.
 *   - Creating a group, changing it and recording a snapshot wrote no audit row,
 *     and wrote the group and its members as separate statements on the pool, so
 *     a failure between them left a group with no members. A run, a pack and a
 *     delivery each write one chained row on the same tenant transaction as the
 *     record (routes/report-os.ts, "ReportAuditAction").
 *
 * So: a change is validated before anything is read or written; each write and
 * its chained audit row share one tenant-stamped transaction; when the audit
 * row cannot be written, nothing is committed.
 */
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
import { resetReportOsHarness, driverRow, tenantStampSql } from './_report-os-route-harness';
import { reportProgramGroups, reportProgramGroupSnapshots } from '@shared/schema/report-os';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as unknown as { user: { id: number; role: string; organizationId: number } }).user = { id: 5, role: 'member', organizationId: 7 };
  next();
});
app.use('/api/report-os', reportOsRouter);

const AT = new Date('2026-11-12T21:00:00.000Z');
const GROUP = { id: 3, groupUuid: '33333333-3333-4333-8333-333333333333', organizationId: 7, clientWorkspaceId: null, name: 'Dermatology', description: 'Two INDs',
  status: 'active', metadata: null, createdBy: 5, updatedBy: 5, createdAt: AT, updatedAt: AT, archivedAt: null };
const SNAPSHOT = { id: 9, programGroupId: 3, organizationId: 7, snapshotLabel: 'Q4 board', snapshotReason: 'Board pack issued', asOf: AT,
  projectSetHash: 'h', projectIds: [11, 12], createdBy: 5, createdAt: AT };

/** What the connection answers a transaction's statements with. */
function answer(over: { group?: Record<string, unknown>; members?: number[] } = {}) {
  h.respond.fn = (sql, arrayMode) => {
    if (/(insert into|update) "report_program_groups"/.test(sql)) return [arrayMode ? driverRow(reportProgramGroups, { ...GROUP, ...over.group }) : { ...GROUP, ...over.group }];
    if (/insert into "report_program_group_snapshots"/.test(sql)) return [arrayMode ? driverRow(reportProgramGroupSnapshots, SNAPSHOT) : SNAPSHOT];
    if (/select .*"project_id".* from "report_program_group_projects"/.test(sql)) return (over.members ?? [11]).map((id) => (arrayMode ? [id] : { projectId: id }));
    return [];
  };
}
const auditCalls = () => h.audit.mock.calls.map((c) => c[1] as { action: string; resourceType: string; resourceId: string; tenantId: number; details: Record<string, unknown> });
/** The order of a transaction: its statements reduced to what each one is. */
const shape = () => h.statements.map((s) =>
  s === tenantStampSql() ? '<tenant stamp>'
    : /^insert into "report_program_groups"/.test(s) ? 'insert group'
    : /^update "report_program_groups"/.test(s) ? 'update group'
    : /^select .* from "report_program_group_projects"/.test(s) ? 'read members'
    : /^delete from "report_program_group_projects"/.test(s) ? 'delete members'
    : /^insert into "report_program_group_projects"/.test(s) ? 'insert members'
    : /^insert into "report_program_group_snapshots"/.test(s) ? 'insert snapshot'
    : s);

beforeEach(() => {
  resetReportOsHarness(h);
  access.projects.mockReset().mockResolvedValue([11, 12]);
  access.scope.mockReset().mockResolvedValue(true);
  answer();
});

describe('PATCH /program-groups/:id validates the change before anything is read or written', () => {
  it.each([
    ['an empty name', { name: '' }],
    ['a name of spaces', { name: '   ' }],
    ['a status no reader lists', { status: 'nonsense' }],
    ['a project id that is not a positive integer', { projectIds: [11, 'twelve'] }],
    ['an empty member list', { projectIds: [] }],
    ['a field the group does not have', { organizationId: 9 }],
    ['nothing to change', {}],
  ])('refuses %s', async (_what, body) => {
    const res = await request(app).patch('/api/report-os/program-groups/3').send(body);
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(h.reads.select).toBe(0);
    expect(h.statements).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('refuses a group id that is not a positive integer', async () => {
    expect((await request(app).patch('/api/report-os/program-groups/abc').send({ name: 'Renamed' })).status).toBe(400);
    expect(h.statements).toEqual([]);
  });
});

describe('POST /program-groups', () => {
  it('refuses a name of spaces', async () => {
    const res = await request(app).post('/api/report-os/program-groups').send({ name: '   ', projectIds: [11] });
    expect(res.status).toBe(400);
    expect(h.statements).toEqual([]);
  });

  it('writes the group, its members and one chained audit row in one tenant transaction', async () => {
    h.queued.select.push([{ id: 11 }, { id: 12 }]);
    const res = await request(app).post('/api/report-os/program-groups').send({ name: '  Dermatology ', description: 'Two INDs', projectIds: [11, 12, 11] });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ id: 3, name: 'Dermatology' });
    expect(shape()).toEqual(['BEGIN', '<tenant stamp>', 'insert group', 'insert members', '<audit row>', 'COMMIT', '<released>']);
    expect(auditCalls()).toEqual([expect.objectContaining({
      tenantId: 7, action: 'report_os.program_group_created', resourceType: 'report_program_group', resourceId: '3',
      details: expect.objectContaining({ name: 'Dermatology', projectIds: [11, 12] }),
    })]);
  });

  it('commits nothing when the audit row cannot be written', async () => {
    h.queued.select.push([{ id: 11 }]);
    h.audit.mockRejectedValueOnce(new Error('chain unavailable'));
    const res = await request(app).post('/api/report-os/program-groups').send({ name: 'Dermatology', projectIds: [11] });
    expect(res.status).toBe(500);
    expect(h.statements).toContain('ROLLBACK');
    expect(h.statements).not.toContain('COMMIT');
    expect(JSON.stringify(res.body)).not.toContain('chain unavailable');
  });
});

describe('PATCH /program-groups/:id', () => {
  it('replaces the members and records what changed, in one tenant transaction', async () => {
    h.queued.select.push([{ id: 11 }, { id: 12 }]);
    answer({ members: [11] });
    const res = await request(app).patch('/api/report-os/program-groups/3').send({ projectIds: [11, 12] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(shape()).toEqual(['BEGIN', '<tenant stamp>', 'update group', 'read members', 'delete members', 'insert members', '<audit row>', 'COMMIT', '<released>']);
    expect(auditCalls()).toEqual([expect.objectContaining({
      action: 'report_os.program_group_updated', resourceType: 'report_program_group', resourceId: '3',
      details: expect.objectContaining({ projectIds: [11, 12], previousProjectIds: [11] }),
    })]);
  });

  it('archives a group with its time, and records that', async () => {
    answer({ group: { status: 'archived' } });
    const res = await request(app).patch('/api/report-os/program-groups/3').send({ status: 'archived' });
    expect(res.status).toBe(200);
    expect(shape()).toEqual(['BEGIN', '<tenant stamp>', 'update group', '<audit row>', 'COMMIT', '<released>']);
    expect(auditCalls()[0]).toMatchObject({ action: 'report_os.program_group_updated', details: { status: 'archived' } });
  });

  it('answers 404 and records nothing when the group is not this organization’s', async () => {
    h.respond.fn = () => [];
    const res = await request(app).patch('/api/report-os/program-groups/3').send({ name: 'Renamed' });
    expect(res.status).toBe(404);
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.statements).not.toContain('COMMIT');
  });
});

describe('POST /program-groups/:id/snapshots', () => {
  it('records the membership and one chained audit row in one tenant transaction', async () => {
    h.queued.select.push([{ id: 3 }], [{ projectId: 12 }, { projectId: 11 }]);
    const res = await request(app).post('/api/report-os/program-groups/3/snapshots').send({ snapshotLabel: 'Q4 board', snapshotReason: 'Board pack issued' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(shape()).toEqual(['BEGIN', '<tenant stamp>', 'insert snapshot', '<audit row>', 'COMMIT', '<released>']);
    expect(auditCalls()).toEqual([expect.objectContaining({
      action: 'report_os.program_group_snapshot_recorded', resourceType: 'report_program_group', resourceId: '3',
      details: expect.objectContaining({ snapshotId: 9, projectIds: [11, 12], snapshotLabel: 'Q4 board' }),
    })]);
  });
});
