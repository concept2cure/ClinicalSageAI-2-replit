/**
 * GET /runs/:id/dependencies names each source in words (sales rehearsal E17;
 * docs/evidence/F1/2026-11-12-reporting-source-words/).
 *
 * The run's evidence table printed the engine's id for each source ("artifact_state"), because the route sent the
 * stored rows and nothing else. Each row now also carries `sourceLabel`, from the one vocabulary the report itself
 * uses (services/report-os/render/source-words.ts), so the report and its evidence name a source the same way. The
 * stored id stays on the row: it is the record.
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

import reportOsRouter from '../report-os';
import { resetReportOsHarness } from './_report-os-route-harness';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as unknown as { user: { id: number; role: string; organizationId: number } }).user = { id: 5, role: 'member', organizationId: 7 };
  next();
});
app.use('/api/report-os', reportOsRouter);

const AT = new Date('2026-11-12T21:00:00.000Z');
const RUN = { id: 41, organizationId: 7, scopeType: 'project', scopeId: '1', reportTypeId: 'readiness.executive_digest', status: 'partial', runUuid: null };
const ROWS = [
  { id: 1, runId: 41, organizationId: 7, provider: 'artifact_state', status: 'ready', blocker: null, observedAt: AT },
  { id: 2, runId: 41, organizationId: 7, provider: 'regional_package_manifest', status: 'partial', blocker: 'Required package sections/artifacts are incomplete', observedAt: AT },
  { id: 3, runId: 41, organizationId: 7, provider: 'a_new_engine', status: 'missing', blocker: null, observedAt: AT },
];

beforeEach(() => {
  resetReportOsHarness(h);
  access.projects.mockReset().mockResolvedValue([1]);
  access.scope.mockReset().mockResolvedValue(true);
});

describe('GET /runs/:id/dependencies', () => {
  it('sends each source’s name in words beside the stored id', async () => {
    h.queued.select.push([RUN], ROWS);
    const res = await request(app).get('/api/report-os/runs/41/dependencies');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.map((r: { provider: string; sourceLabel: string }) => [r.provider, r.sourceLabel])).toEqual([
      ['artifact_state', 'What the project holds'],
      ['regional_package_manifest', 'Regional package'],
      ['a_new_engine', 'A new engine'],
    ]);
    expect(res.body.data[1]).toMatchObject({ status: 'partial', blocker: 'Required package sections/artifacts are incomplete' });
  });

  it('still answers 404 for a run the reader may not open, with no row', async () => {
    access.scope.mockResolvedValue(false);
    h.queued.select.push([RUN], ROWS);
    const res = await request(app).get('/api/report-os/runs/41/dependencies');
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('artifact_state');
  });
});
