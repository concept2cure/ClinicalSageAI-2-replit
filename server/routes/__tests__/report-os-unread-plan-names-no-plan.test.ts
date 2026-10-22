/**
 * The report-os plan gates say the plan could not be read, and name no plan,
 * when requireReportEntitlement did not read it.
 *
 * What the code used to do (until 2026-10-15): /portfolio/org, /portfolio,
 * POST /runs, GET /runs/:id/export.pdf and POST /bundles answered every refusal
 * "… requires the <requiredTier> plan." with `tier: gate.tier`. On an unread
 * plan the gate refuses with its compatibility tier 'standard' and
 * tierResolved:false, so the 403 told the customer that a plan they may well
 * hold was required, and named 'standard' as their plan.
 *
 * The router's own imports are real; the database facade, the auth middleware,
 * the entitlement gate and the services the run path calls are replaced. The
 * gate answers through the REAL decideReportEntitlement, so the unread shape is
 * exactly the one requireReportEntitlement returns.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = await vi.hoisted(async () => (await import('./_report-os-route-harness')).createReportOsHarness());
const x = vi.hoisted(() => ({ orgSegments: vi.fn(), scopeAccess: vi.fn(), accessIds: vi.fn() }));

vi.mock('../../services/report-os/project-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/project-access')>()),
  getAccessibleReportProjectIds: x.accessIds,
  canAccessReportScope: x.scopeAccess,
}));
vi.mock('../../db', () => ({ db: h.db, pool: h.pool, getPool: () => h.pool, getDb: () => h.db, query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../auth', () => ({ authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../utils/authedOrgId', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/authedOrgId')>()),
  authedOrgId: () => 7,
}));
vi.mock('../../services/report-os/entitlement-map', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/entitlement-map')>()),
  requireReportEntitlement: h.gate,
}));
vi.mock('../../services/report-os/orchestrator', () => ({ computeInitialRun: h.compute }));
vi.mock('../../services/report-os/segment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/segment')>()),
  deriveOrgSegments: x.orgSegments,
}));
vi.mock('../../services/auditService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/auditService')>()),
  writeChainedAuditRow: h.audit,
}));

import reportOsRouter from '../report-os';
import { decideReportEntitlement } from '../../services/report-os/entitlement-map';
import { resetReportOsHarness } from './_report-os-route-harness';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as unknown as { user: { id: number; role: string; organizationId: number } }).user = { id: 5, role: 'manager', organizationId: 7 };
  next();
});
app.use('/api/report-os', reportOsRouter);

/** An organization register: account scope, so POST /runs reaches its plan gate with no project read. */
const ADMIN = {
  typeId: 'research_admin.scorecard', label: 'Research Administration Scorecard', family: 'research_compliance',
  allowedScopes: ['account'], allowedClientSegments: ['academic'],
};
const RUN = {
  id: 52, organizationId: 7, scopeType: 'project', scopeId: '11', reportTypeId: 'readiness.executive_digest', status: 'partial',
};

const ROUTES = [
  {
    name: 'GET /portfolio/org',
    unread: 'Your plan could not be read, so the portfolio rollup was not loaded.',
    read: 'Portfolio rollup requires the enterprise plan.',
    send: () => request(app).get('/api/report-os/portfolio/org'),
  },
  {
    name: 'GET /portfolio',
    unread: 'Your plan could not be read, so the portfolio rollup was not loaded.',
    read: 'Portfolio rollup requires the enterprise plan.',
    send: () => request(app).get('/api/report-os/portfolio?programGroupId=5'),
  },
  {
    name: 'POST /runs',
    unread: 'Your plan could not be read, so the report was not generated.',
    read: 'This report requires the standard plan.',
    send: () => {
      h.queued.select.push([ADMIN]);
      return request(app).post('/api/report-os/runs').send({ scopeType: 'account', scopeId: '7', reportTypeId: ADMIN.typeId });
    },
  },
  {
    name: 'GET /runs/:id/export.pdf',
    unread: 'Your plan could not be read, so the report was not exported.',
    read: 'Exporting this report requires the standard plan.',
    send: () => {
      h.queued.select.push([RUN], [{ label: 'Executive Readiness Digest', family: 'readiness', truthfulnessRules: {} }]);
      return request(app).get('/api/report-os/runs/52/export.pdf');
    },
  },
  {
    name: 'POST /bundles',
    unread: 'Your plan could not be read, so the bundle was not created.',
    read: 'Bundling reports requires the standard plan.',
    send: () => request(app).post('/api/report-os/bundles').send({ name: 'Board pack', runIds: [52] }),
  },
];

/** The gate as requireReportEntitlement answers it, for a plan read as `tier` or not read at all. */
function gateAnswers(tier: 'free' | null) {
  h.gate.mockImplementation(async (_org: number, typeId: string, family?: string) =>
    tier === null ? decideReportEntitlement(typeId, family, 'standard', false) : decideReportEntitlement(typeId, family, tier, true));
}

beforeEach(() => {
  resetReportOsHarness(h);
  x.orgSegments.mockReset().mockResolvedValue(['academic']);
  x.scopeAccess.mockReset().mockResolvedValue(true);
  x.accessIds.mockReset().mockResolvedValue([11]);
});

describe('report-os plan gates on a plan that could not be read', () => {
  it.each(ROUTES)('$name says the plan could not be read and names no plan', async (route) => {
    gateAnswers(null);
    const res = await route.send();
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.error).toBe(route.unread);
    expect(res.body.tier, 'an unread plan was named as the organization’s plan').toBeNull();
    expect(h.gate).toHaveBeenCalled();
    expect(h.compute).not.toHaveBeenCalled();
  });

  it.each(ROUTES)('$name still names the required plan when the plan was read (control)', async (route) => {
    gateAnswers('free');
    const res = await route.send();
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.error).toBe(route.read);
    expect(res.body.tier).toBe('free');
  });
});
