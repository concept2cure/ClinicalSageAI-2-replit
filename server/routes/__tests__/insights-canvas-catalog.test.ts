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

const h = vi.hoisted(() => ({ summary: vi.fn(), gate: vi.fn(), orgSegments: vi.fn(), projectSegments: vi.fn(), anchor: vi.fn(), registry: vi.fn() }));


// These suites isolate audit/compute contracts; sharing itself is exercised
// against SQL in run-history and scheduling project-access integration tests.
vi.mock('../../services/report-os/project-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/project-access')>()),
  getAccessibleReportProjectIds: async () => [1, 2, 3, 7, 11, 12, 14, 17, 21, 41, 52, 99, 100, 101],
  canAccessReportScope: async () => true,
}));
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
import { REPORT_TYPE_SEED } from '../../services/report-os/taxonomy';
import { GLOBAL_REPORT_TYPE_SEED } from '../../services/report-os/taxonomy-global';
import { PREDICTION_REPORT_TYPES } from '../../services/report-os/prediction/report-types';
const deployedTypes = () => [...REPORT_TYPE_SEED, ...GLOBAL_REPORT_TYPE_SEED, ...PREDICTION_REPORT_TYPES].map(t => ({
  type_id: t.typeId, label: t.label, family: t.family, allowed_scopes: t.allowedScopes,
  allowed_personas: t.allowedPersonas, allowed_client_segments: t.allowedClientSegments,
  governance_requirements: t.governanceRequirements, truthfulness_rules: t.truthfulnessRules, enabled: true,
}));

const app = express();
// The request-scoped client the production mount's authenticateToken installs
// (establishRequestTenantScope); the open program's anchor is read on it.
app.use((req, _res, next) => {
  (req as unknown as { user: { id: number; role: string; organizationId: number } }).user = { id: 5, role: 'manager', organizationId: 7 };
  (req as unknown as { dbClient: unknown }).dbClient = { query: vi.fn(async () => ({ rows: await h.registry() })) };
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
  h.registry.mockReset().mockResolvedValue(deployedTypes());
  h.gate.mockReset().mockResolvedValue({ entitled: true, feature: 'portfolio_rollup', requiredTier: 'enterprise', tier: 'enterprise', tierResolved: true });
  h.orgSegments.mockReset().mockResolvedValue(['pharma', 'biotech', 'device', 'ivd']);
  h.projectSegments.mockReset().mockImplementation(async (_org: number, projectId: number) => (projectId === 11 ? ['biotech'] : projectId === 14 ? ['device'] : null));
  h.summary.mockReset().mockResolvedValue(SUMMARY);
  h.anchor.mockReset().mockResolvedValue(11);
});

const ids = (res: request.Response) => (res.body.data.reportTypes as Array<{ typeId: string }>).map((t) => t.typeId);

describe('with no program open', () => {
  it('offers actual organization registers to institutional clients without programs', async () => {
    h.orgSegments.mockResolvedValue(['academic']);
    h.summary.mockResolvedValue(null);
    const res = await overview();
    expect(res.status).toBe(200);
    expect(res.body.data.reportTypes.find((t: { typeId: string }) => t.typeId === 'research_admin.scorecard')).toMatchObject({
      runnable: true, computedScope: 'organization', runScopeType: 'account', runScopeId: '7',
    });
    expect(res.body.data.reportTypes.find((t: { typeId: string }) => t.typeId === 'readiness.executive_digest').runnable).toBe(false);
  });
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
  it('keeps the organization service identity without importing sibling product catalogs', async () => {
    h.orgSegments.mockResolvedValue(['cro', 'biotech', 'device']);
    const res = await overview(`?programId=${HLV}`);
    expect(res.body.data.segments).toEqual(['biotech', 'cro']);
    expect(ids(res)).toContain('etmf.completeness_pack');
    expect(ids(res)).not.toContain('usa_fda.estar_510k_equivalence_matrix');
  });
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
  it('withdraws Run when the deployed registry disables a report', async () => {
    h.registry.mockResolvedValue(deployedTypes().map(t => t.type_id === 'readiness.executive_digest' ? { ...t, enabled: false } : t));
    const res = await overview(`?programId=${HLV}`);
    expect(res.status).toBe(200);
    expect(res.body.data.reportTypes.find((t: { typeId: string }) => t.typeId === 'readiness.executive_digest')).toMatchObject({ runnable: false, availabilityState: 'disabled', availabilityReason: expect.stringMatching(/disabled/) });
  });
  it('uses the deployed scope and region declarations rather than the seed', async () => {
    h.registry.mockResolvedValue(deployedTypes().map(t => t.type_id === 'usa_fda.nda_bla_filing_readiness' ? { ...t, allowed_scopes: ['submission'], governance_requirements: { ...t.governance_requirements, region: 'EU_EMA' } } : t));
    const res = await overview(`?programId=${HLV}`);
    expect(res.body.data.reportTypes.find((t: { typeId: string }) => t.typeId === 'usa_fda.nda_bla_filing_readiness')).toMatchObject({ runnable: false, computedScopes: [], region: 'EU_EMA' });
  });
  it('keeps discovery when the registry is empty while offering no unregistered run', async () => {
    h.registry.mockResolvedValue([]);
    const res = await overview(`?programId=${HLV}`);
    expect(res.status).toBe(200);
    expect(res.body.data.reportTypes.length).toBeGreaterThan(0);
    expect(res.body.data.reportTypes.every((t: { runnable: boolean; availabilityReason: string }) => !t.runnable && /deployed registry/.test(t.availabilityReason))).toBe(true);
    expect(res.body.data.reportTypes.every((t: { availabilityState: string }) => t.availabilityState === 'unregistered')).toBe(true);
  });
  it('answers a failed registry read as unavailable, never an empty successful catalog', async () => {
    h.registry.mockRejectedValue(new Error('storage unavailable'));
    const res = await overview(`?programId=${HLV}`);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('REPORT_CATALOG_UNAVAILABLE');
    expect(res.body).not.toHaveProperty('data');
  });
  it('marks the digest and the registers runnable, and the rest not', async () => {
    const res = await overview(`?programId=${HLV}`);
    const runnable = Object.fromEntries((res.body.data.reportTypes as Array<{ typeId: string; runnable: boolean }>).map((t) => [t.typeId, t.runnable]));
    expect(runnable['readiness.executive_digest']).toBe(true);
    expect(runnable['nonclinical.study_send_register']).toBe(true);
    expect(runnable['ema.rmp_psur_signal_alignment']).toBe(false);
    expect(runnable['compliance.audit_assurance_pack']).toBe(false);
    expect(runnable['provenance.evidence_trace_report']).toBe(false);
    const reports = res.body.data.reportTypes as Array<{ typeId: string }>;
    expect(reports.find(t => t.typeId === 'usa_fda.nda_bla_filing_readiness')).toMatchObject({
      runnable: true, computedScopes: ['project'], computedScope: 'project', runScopeType: 'project', runScopeId: '11', region: 'USA_FDA',
    });
    expect(reports.find(t => t.typeId === 'provenance.evidence_trace_report')).toMatchObject({ computedScopes: ['document'], computedScope: 'document', availabilityState: 'scope-required' });
  });
});

/** Real resolver/gate control flow over controlled SQL, rather than an outer
 * gate exception; sharing/registry edges remain this suite's existing doubles. */
async function useRecordedTier(tier: string | null) {
  const actual = await vi.importActual<typeof import('../../services/report-os/entitlement-map')>('../../services/report-os/entitlement-map');
  const executor = { query: vi.fn(async (sql: string) => ({
    rows: sql.includes('FROM organizations') ? [{ tier }] : [],
  })) };
  h.gate.mockImplementation(() => actual.requireReportEntitlement(7, 'portfolio.board_pack', 'portfolio', executor));
  return executor;
}

describe('canvas catalog preserves the actual recorded-plan verdict', () => {
  it.each([null, 'platinum'])('locks every report when the real resolver returns an unread %s tier without throwing', async tier => {
    const executor = await useRecordedTier(tier);
    const res = await overview(`?programId=${HLV}`);
    expect(res.status).toBe(200);
    expect(executor.query).toHaveBeenCalledWith('SELECT tier FROM organizations WHERE id = $1', [7]);
    expect(res.body.data).toMatchObject({ tier: 'standard', tierResolved: false });
    expect(res.body.data.reportTypes.find((t: { typeId: string }) => t.typeId === 'readiness.executive_digest'))
      .toMatchObject({ entitled: false, runnable: true });
    expect(res.body.data.reportTypes.every((t: { entitled: boolean }) => t.entitled === false)).toBe(true);
  });

  it.each(['free', 'standard', 'professional', 'enterprise'])('retains a positively recorded %s plan', async tier => {
    await useRecordedTier(tier);
    const res = await overview(`?programId=${HLV}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ tier, tierResolved: true });
    expect(res.body.data.reportTypes.find((t: { typeId: string }) => t.typeId === 'readiness.executive_digest'))
      .toMatchObject({ entitled: tier !== 'free', runnable: true });
  });
});
