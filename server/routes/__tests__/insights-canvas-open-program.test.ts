/**
 * GET /api/insights-canvas/overview?programId= — the canvas leads with the
 * OPEN program, never another program's figures under its name.
 *
 * QA 2026-10-08 (j1, "Project screens show other programs' documents and
 * records"): with HLV-333 open, Reporting & analytics said "C2C-001's
 * submission readiness is not yet computed". The overview always led with the
 * organisation's flagship (highest readiness) whatever program the shell had
 * open. The canvas now names the open program by its regulatory_programs UUID;
 * the server resolves the program's anchored projects row (the id space the
 * readiness runs and reports are computed over) and leads with that row, or
 * says why it cannot — never falling back to the flagship.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({ summary: vi.fn(), gate: vi.fn(), segments: vi.fn(), anchor: vi.fn() }));

vi.mock('../../db', () => ({ db: { __db: true }, pool: {}, getPool: () => ({}), getDb: () => ({}), query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../utils/authedOrgId', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/authedOrgId')>()),
  authedOrgId: () => 7,
}));
vi.mock('../../services/report-os/entitlement-map', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/entitlement-map')>()),
  requireReportEntitlement: h.gate,
}));
vi.mock('../../services/report-os/segment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/segment')>()),
  deriveOrgSegments: h.segments,
  deriveProjectSegments: async () => null,
}));
vi.mock('../../services/report-os/portfolio/fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/portfolio/fetch')>()),
  fetchOrgPortfolioSummary: h.summary,
}));
vi.mock('../../services/c2c/program-project-anchor', () => ({ resolveProgramProjectAnchor: h.anchor }));

import createInsightsCanvasRoutes from '../insights-canvas-routes';
import { requestDb } from '../../db/requestDb';

/* The request-scoped client the mount's authenticateToken installs in
   production (establishRequestTenantScope). A request sent with
   `x-test-no-request-db` has none, as a mount that skipped the auth boundary
   would. */
let lastReq: express.Request | null = null;
const app = express();
app.use((req, _res, next) => {
  lastReq = req;
  if (!req.headers['x-test-no-request-db']) {
    (req as unknown as { dbClient: unknown }).dbClient = { query: vi.fn(async () => ({ rows: [] })) };
  }
  next();
});
app.use('/api/insights-canvas', createInsightsCanvasRoutes());
const PROGRAM = 'd979e567-4622-46f1-8cb7-8bf434227f25';
const overview = (q = '') => request(app).get('/api/insights-canvas/overview' + q);

const member = (projectId: number, name: string, readinessScore: number | null) => ({
  projectId, name, code: name, indication: null, readinessScore, confidence: 70,
  status: 'partial', riskLevel: 'medium', criticalBlockerCount: 0,
});
// C2C-001 is the flagship (highest readiness); HLV-333 (project 11) is the open program.
const SUMMARY = { memberCount: 2, attentionRanked: [member(1, 'C2C-001', 88), member(11, 'HLV-333', null)], truncated: false };

beforeEach(() => {
  h.gate.mockReset().mockResolvedValue({ entitled: false, feature: 'portfolio_rollup', requiredTier: 'enterprise', tier: 'standard' });
  h.segments.mockReset().mockResolvedValue(['pharma']);
  h.summary.mockReset().mockResolvedValue(SUMMARY);
  h.anchor.mockReset();
});

describe('GET /overview?programId= — the open program leads', () => {
  it('leads with the open program’s anchored project, not the flagship', async () => {
    h.anchor.mockResolvedValue(11);
    const res = await overview(`?programId=${PROGRAM}`);
    expect(res.status).toBe(200);
    expect(h.anchor).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ programId: PROGRAM, orgId: 7, strict: true }));
    expect(res.body.data.leadProgram).toMatchObject({ projectId: 11, label: 'HLV-333', scopeId: '11' });
    expect(res.body.data.openProgram).toEqual({ programId: PROGRAM, state: 'lead' });
  });

  /* The anchor read runs on the request's RLS-scoped client, never the shared
     pool (resolveProgramProjectAnchor's contract; ci requestDb adoption gate).
     The canvas read it through the shared `db` (4ac15bdd1). */
  it('resolves the open program on the request-scoped client, not the shared pool', async () => {
    h.anchor.mockResolvedValue(11);
    const res = await overview(`?programId=${PROGRAM}`);
    expect(res.status).toBe(200);
    expect(lastReq).not.toBeNull();
    expect(h.anchor.mock.calls[0][0]).toBe(requestDb(lastReq!));
    expect(h.anchor.mock.calls[0][0]).not.toEqual({ __db: true });
  });

  it('with no request-scoped client the open program is not read at all — no shared-pool fallback', async () => {
    const res = await overview(`?programId=${PROGRAM}`).set('x-test-no-request-db', '1');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(h.anchor).not.toHaveBeenCalled();
  });

  it('a program with no project record has no lead — and is not given the flagship', async () => {
    h.anchor.mockResolvedValue(null);
    const res = await overview(`?programId=${PROGRAM}`);
    expect(res.status).toBe(200);
    expect(res.body.data.leadProgram).toBeNull();
    expect(res.body.data.openProgram).toEqual({ programId: PROGRAM, state: 'unanchored' });
  });

  it('an anchored project outside the computed portfolio is named as such, with no lead', async () => {
    h.anchor.mockResolvedValue(99);
    const res = await overview(`?programId=${PROGRAM}`);
    expect(res.body.data.leadProgram).toBeNull();
    expect(res.body.data.openProgram).toEqual({ programId: PROGRAM, state: 'not-in-portfolio' });
  });

  it('a programId that is not a program UUID is refused, not guessed', async () => {
    for (const bad of ['11', '7abb', 'proj_12']) {
      const res = await overview(`?programId=${encodeURIComponent(bad)}`);
      expect(res.status, bad).toBe(400);
    }
    expect(h.anchor).not.toHaveBeenCalled();
  });

  /* QA 2026-10-08 (j8, "Reporting scope is fixed to project 1"): the flagship
     no longer stands in for an open program that was never chosen. With none
     open there is no lead, and the canvas asks which program
     (insights-canvas-catalog.test.ts pins the program list it offers). */
  it('with no program open no program leads — the flagship does not stand in', async () => {
    const res = await overview();
    expect(res.body.data.leadProgram).toBeNull();
    expect(res.body.data.openProgram).toBeNull();
    expect(h.anchor).not.toHaveBeenCalled();
  });
});
