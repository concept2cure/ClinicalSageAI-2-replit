/**
 * GET /api/insights-canvas/overview — which program the canvas is about, and
 * which reports it offers for it (QA 2026-10-08, journey j8).
 *
 *   - "Reporting scope is fixed to project 1 with no program picker": with no
 *     program open there is no lead (the flagship stood in, and with no
 *     readiness computed anywhere it was the lowest project id); the overview
 *     lists the programs a person can open the canvas on.
 *   - "510(k) equivalence matrix (device-only) runs for this biopharma
 *     organisation": the catalog follows the lead program's recorded product
 *     type, not the organisation's union of segments.
 *   - "Every typed report returns the same readiness digest": each type says
 *     whether an engine computes it over a program (`runnable`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({ summary: vi.fn(), gate: vi.fn(), orgSegments: vi.fn(), projectSegments: vi.fn(), anchor: vi.fn() }));

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
  deriveOrgSegments: h.orgSegments,
  deriveProjectSegments: h.projectSegments,
}));
vi.mock('../../services/report-os/portfolio/fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/portfolio/fetch')>()),
  fetchOrgPortfolioSummary: h.summary,
}));
vi.mock('../../services/c2c/program-project-anchor', () => ({ resolveProgramProjectAnchor: h.anchor }));

import createInsightsCanvasRoutes from '../insights-canvas-routes';

const app = express();
// The request-scoped client the production mount's authenticateToken installs
// (establishRequestTenantScope); the open program's anchor is read on it.
app.use((req, _res, next) => {
  (req as unknown as { dbClient: unknown }).dbClient = { query: vi.fn(async () => ({ rows: [] })) };
  next();
});
app.use('/api/insights-canvas', createInsightsCanvasRoutes());
const HLV = 'd979e567-4622-46f1-8cb7-8bf434227f25';
const CV = '11111111-2222-3333-4444-000000000117';
const overview = (q = '') => request(app).get('/api/insights-canvas/overview' + q);

const member = (projectId: number, name: string, code: string, programId: string | null) => ({
  projectId, name, code, programId, indication: null, readinessScore: null, confidence: null,
  status: 'missing', riskLevel: 'low', criticalBlockerCount: 0,
});
// Project 1 is a legacy record no program anchors; HLV-333 (biologic) and CV-117 (device) are programs.
const SUMMARY = {
  memberCount: 3,
  attentionRanked: [member(1, 'C2C-001 IND Program', 'C2C-001', null), member(11, 'HLV-333 — IND', 'H', HLV), member(14, 'CV-117 ECG Patch', 'CV-117', CV)],
  truncated: false,
};

beforeEach(() => {
  h.gate.mockReset().mockResolvedValue({ entitled: true, feature: 'portfolio_rollup', requiredTier: 'enterprise', tier: 'enterprise' });
  h.orgSegments.mockReset().mockResolvedValue(['pharma', 'biotech', 'device', 'ivd']);
  h.projectSegments.mockReset().mockImplementation(async (_org: number, projectId: number) => (projectId === 11 ? ['biotech'] : projectId === 14 ? ['device'] : null));
  h.summary.mockReset().mockResolvedValue(SUMMARY);
  h.anchor.mockReset().mockResolvedValue(11);
});

const ids = (res: request.Response) => (res.body.data.reportTypes as Array<{ typeId: string }>).map((t) => t.typeId);

describe('with no program open', () => {
  it('leads with no program — not project 1 — and lists the programs to open', async () => {
    const res = await overview();
    expect(res.status).toBe(200);
    expect(res.body.data.leadProgram).toBeNull();
    expect(res.body.data.openProgram).toBeNull();
    expect(res.body.data.programs).toEqual([
      { programId: CV, code: 'CV-117', label: 'CV-117 ECG Patch' },
      { programId: HLV, code: 'H', label: 'HLV-333 — IND' },
    ]);
  });
});

describe('the catalog follows the open program’s product type', () => {
  it('offers no device-only report for a biologic program', async () => {
    const res = await overview(`?programId=${HLV}`);
    expect(res.body.data.leadProgram).toMatchObject({ projectId: 11 });
    expect(h.projectSegments).toHaveBeenCalledWith(7, 11);
    expect(res.body.data.segments).toEqual(['biotech']);
    expect(ids(res)).toContain('readiness.executive_digest');
    expect(ids(res)).not.toContain('usa_fda.estar_510k_equivalence_matrix');
  });

  it('offers it for a device program', async () => {
    h.anchor.mockResolvedValue(14);
    const res = await overview(`?programId=${CV}`);
    expect(ids(res)).toContain('usa_fda.estar_510k_equivalence_matrix');
  });
});

describe('each type says whether an engine computes it over a program', () => {
  it('marks the digest and the registers runnable, and the rest not', async () => {
    const res = await overview(`?programId=${HLV}`);
    const runnable = Object.fromEntries((res.body.data.reportTypes as Array<{ typeId: string; runnable: boolean }>).map((t) => [t.typeId, t.runnable]));
    expect(runnable['readiness.executive_digest']).toBe(true);
    expect(runnable['nonclinical.study_send_register']).toBe(true);
    expect(runnable['ema.rmp_psur_signal_alignment']).toBe(false);
    expect(runnable['compliance.audit_assurance_pack']).toBe(false);
    expect(runnable['provenance.evidence_trace_report']).toBe(false);
  });
});
