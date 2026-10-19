/**
 * A prediction is never a generic report run, and the live prediction run
 * computes nothing over another tenant's records (reporting review 2026-10-01).
 *
 * - The canvas render AnA uses (renderGovernedReport) refuses a prediction-family
 *   type before the orchestrator runs: it would have printed readiness under a
 *   prediction title. POST /runs refuses the same way
 *   (report-os-audit-recording.test.ts).
 * - DP-64: POST /api/insights/predictions/run read the readiness twin for a body
 *   program id, and the twin keeps no organisation, so nothing proved the
 *   program was the caller's. The forecast is refused before anything is read.
 *   The pre-mortem's project and submission ids must be the caller's before its
 *   model runs and stores a result against them.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';


// These suites isolate audit/compute contracts; sharing itself is exercised
// against SQL in run-history and scheduling project-access integration tests.
vi.mock('../../services/report-os/project-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/project-access')>()),
  getAccessibleReportProjectIds: async () => [1, 2, 3, 7, 11, 12, 14, 17, 21, 41, 52, 99, 100, 101],
  canAccessReportScope: h.scopeAccess,
}));
vi.mock('../../db', () => ({ db: {}, pool: {}, getPool: () => ({}), getDb: () => ({}), query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../auth', () => ({
  authMiddleware: (req: any, _res: unknown, next: () => void) => {
    req.user = { id: 5, role: 'admin', organizationId: 7 };
    req.userRole = 'member';
    next();
  },
}));
vi.mock('../../utils/authedOrgId', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/authedOrgId')>()),
  authedOrgId: () => 7,
}));
const h = vi.hoisted(() => ({
  gate: vi.fn(),
  risk: vi.fn(),
  projects: vi.fn(),
  submission: vi.fn(),
  compute: vi.fn(),
  scopeAccess: vi.fn(),
}));
vi.mock('../../services/report-os/entitlement-map', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/entitlement-map')>()),
  requireReportEntitlement: h.gate,
}));
vi.mock('../../services/report-os/prediction/model-adapters', () => ({ runDeficiencyRiskForDraft: h.risk }));
vi.mock('../../services/report-os/ownership', () => ({ projectsInOrg: h.projects, submissionInProject: h.submission }));
vi.mock('../../services/report-os/orchestrator', () => ({ computeInitialRun: h.compute }));
vi.mock('../../services/report-os/prediction/assembler', () => ({
  assemblePredictionReport: () => ({ status: 'partial', sections: [] }),
  assertHasDisclosure: () => undefined,
}));

import insightsRouter from '../report-os-insights';
import { renderGovernedReport } from '../../services/report-os/canvas/render-report';

const app = express();
app.use(express.json());
app.use('/api/insights', insightsRouter);

const PREMORTEM = { kind: 'crl_rtf_premortem', scopeType: 'project', scopeId: '11', submissionType: 'NDA', presentSections: ['2.5'] };

beforeEach(() => {
  h.gate.mockReset().mockResolvedValue({ entitled: true, feature: 'prediction_forecast_report', tier: 'professional', requiredTier: 'professional' });
  h.risk.mockReset().mockResolvedValue({ kind: 'deficiency_risk' });
  h.projects.mockReset().mockResolvedValue(new Set([11]));
  h.submission.mockReset().mockResolvedValue(true);
  h.compute.mockReset();
  h.scopeAccess.mockReset().mockResolvedValue(true);
});

describe('the canvas render never computes a prediction', () => {
  it.each(['prediction.regulatory_forecast', 'prediction.crl_rtf_premortem', 'prediction.deficiency_risk'])(
    '%s is refused before the orchestrator runs',
    async (typeId) => {
      await expect(renderGovernedReport(7, { typeId, scopeType: 'project', scopeId: '11' })).rejects.toThrow(/not computed by the report run/);
      expect(h.compute).not.toHaveBeenCalled();
    },
  );
});

describe('POST /api/insights/predictions/run (DP-64)', () => {
  it('refuses a forecast before the plan gate or any read: its source records no organisation', async () => {
    const res = await request(app)
      .post('/api/insights/predictions/run')
      .send({ kind: 'regulatory_forecast', scopeType: 'program', scopeId: 'another-tenants-program', submissionType: 'NDA' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('FORECAST_NOT_SCOPED');
    expect(h.gate).not.toHaveBeenCalled();
    expect(h.risk).not.toHaveBeenCalled();
  });

  it('refuses a pre-mortem over another tenant\'s project, and runs no model', async () => {
    h.projects.mockResolvedValue(new Set());
    const res = await request(app).post('/api/insights/predictions/run').send({ ...PREMORTEM, projectId: 99 });
    expect(res.status).toBe(404);
    expect(h.projects).toHaveBeenCalledWith(7, [99]);
    expect(h.risk).not.toHaveBeenCalled();
  });

  it('refuses a submission that is not one of the caller\'s project\'s, and runs no model', async () => {
    h.submission.mockResolvedValue(false);
    const res = await request(app).post('/api/insights/predictions/run').send({ ...PREMORTEM, projectId: 11, submissionId: 'sub-of-another-tenant' });
    expect(res.status).toBe(404);
    expect(h.submission).toHaveBeenCalledWith(7, 11, 'sub-of-another-tenant');
    expect(h.risk).not.toHaveBeenCalled();
  });

  it('refuses a submission named without its project', async () => {
    const res = await request(app).post('/api/insights/predictions/run').send({ ...PREMORTEM, submissionId: 'sub-1' });
    expect(res.status).toBe(404);
    expect(h.risk).not.toHaveBeenCalled();
  });

  it('runs the pre-mortem over the caller\'s own project and submission', async () => {
    const res = await request(app).post('/api/insights/predictions/run').send({ ...PREMORTEM, projectId: 11, submissionId: 'sub-1' });
    expect(res.status).toBe(200);
    expect(h.risk).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 7, projectId: 11, submissionId: 'sub-1' }));
  });

  it('refuses a same-organization private project before any model or calibration IO', async () => {
    h.scopeAccess.mockResolvedValue(false);
    const res = await request(app).post('/api/insights/predictions/run').send({ ...PREMORTEM, projectId: 11, submissionId: 'sub-1' });
    expect(res.status).toBe(404);
    expect(h.scopeAccess).toHaveBeenCalledWith(7, { userId: 5, role: 'member' }, { scopeType: 'project', scopeId: '11' });
    expect(h.submission).not.toHaveBeenCalled();
    expect(h.risk).not.toHaveBeenCalled();
  });

  it('uses the current membership role for an authorized prediction instead of a stale token admin role', async () => {
    const res = await request(app).post('/api/insights/predictions/run').send({ ...PREMORTEM, projectId: 11 });
    expect(res.status).toBe(200);
    expect(h.scopeAccess).toHaveBeenCalledWith(7, { userId: 5, role: 'member' }, { scopeType: 'project', scopeId: '11' });
    expect(h.risk).toHaveBeenCalledOnce();
  });

  it('fails closed when project-sharing access cannot be read', async () => {
    h.scopeAccess.mockRejectedValue(new Error('sharing unavailable'));
    const res = await request(app).post('/api/insights/predictions/run').send({ ...PREMORTEM, projectId: 11 });
    expect(res.status).toBe(500);
    expect(h.risk).not.toHaveBeenCalled();
  });

  it('preserves an organization-only supplied draft without reading project context', async () => {
    const res = await request(app).post('/api/insights/predictions/run').send({ ...PREMORTEM, scopeType: 'account', scopeId: '7' });
    expect(res.status).toBe(200);
    expect(h.scopeAccess).not.toHaveBeenCalled();
    expect(h.projects).not.toHaveBeenCalled();
    expect(h.risk).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 7, projectId: undefined }));
  });
});
