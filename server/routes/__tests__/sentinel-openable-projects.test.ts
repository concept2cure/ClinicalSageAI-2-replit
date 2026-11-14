/**
 * The "at risk" read is answered over the projects a person can open now (routed by the coordinating session,
 * 2026-11-12; docs/evidence/F1/2026-11-12-reporting-deleted-projects-at-risk/).
 *
 * In the running app, a project deleted in Projects still had its finding listed ("Project … is 3 days overdue")
 * under "the projects you can open": the route asked Reporting for every project the sharing policy admits, deleted
 * ones included. It now asks for the openable ones (project-access.ts, `{ openable: true }`; the SQL is run by
 * project-access-openable.pglite.test.ts). This pins what the route asks for and what it hands the findings read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({ accessible: vi.fn(), getFindings: vi.fn(), findingProjectIds: vi.fn(), updateFindingStatus: vi.fn(), pool: { marker: 'pool' } }));
vi.mock('../../db', () => ({ getPool: () => h.pool, pool: h.pool, db: {} }));
vi.mock('../../utils/tenantContext', () => ({ getTenantContext: () => ({ organizationId: 7 }) }));
vi.mock('../../utils/authedActor', () => ({ authedUserId: () => 5 }));
vi.mock('../../services/sentinel/scheduler', () => ({
  getSentinelScheduler: () => ({ getSentinel: () => ({ getFindings: h.getFindings, findingProjectIds: h.findingProjectIds, updateFindingStatus: h.updateFindingStatus }) }),
}));
vi.mock('../../services/c2c/current-program-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/c2c/current-program-access')>()),
  readCurrentProgramActor: async () => ({ userId: 5, role: 'manager' }),
}));
vi.mock('../../services/report-os/project-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/project-access')>()),
  getAccessibleReportProjectIds: h.accessible,
}));

import sentinelRouter from '../sentinel-routes';

const app = express();
app.use(express.json());
app.use('/api/sentinel', sentinelRouter);

beforeEach(() => {
  h.accessible.mockReset().mockResolvedValue([1, 5]);
  h.getFindings.mockReset().mockResolvedValue({ findings: [], total: 0 });
  h.findingProjectIds.mockReset();
});

describe('GET /api/sentinel/findings', () => {
  it('asks for the projects the person can open now, not every project the policy admits', async () => {
    const res = await request(app).get('/api/sentinel/findings');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(h.accessible).toHaveBeenCalledWith(7, { userId: 5, role: 'manager' }, h.pool, { openable: true });
    expect(h.getFindings).toHaveBeenCalledWith(7, expect.objectContaining({ readableProjectIds: [1, 5] }));
  });

  it('answers 503, and reads no finding, when the projects cannot be read', async () => {
    h.accessible.mockRejectedValue(new Error('connection reset'));
    const res = await request(app).get('/api/sentinel/findings');
    expect(res.status).toBe(503);
    expect(h.getFindings).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain('connection reset');
  });
});

describe('a finding is changed only when every project it names can be opened now', () => {
  it('refuses a finding that names a deleted project', async () => {
    h.findingProjectIds.mockResolvedValue([2]); // project 2 is deleted: not in the openable list
    const res = await request(app).patch('/api/sentinel/findings/f-1').send({ status: 'acknowledged' });
    expect(res.status).toBe(404);
    expect(h.accessible).toHaveBeenCalledWith(7, { userId: 5, role: 'manager' }, h.pool, { openable: true });
    expect(h.updateFindingStatus).not.toHaveBeenCalled();
  });
});
