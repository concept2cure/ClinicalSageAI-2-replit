/**
 * The CRL/RTF pre-mortem refuses, as the regulatory forecast does, when there
 * is nothing to predict from.
 *
 * POST /api/insights/predictions/run (kind crl_rtf_premortem) used to assemble
 * a report whatever the risk model returned. At cold start — no trained model
 * and no network prior, every estate until 30 outcomes are recorded — the model
 * answered 0.5 for every target, and the report printed "Predicted first-cycle
 * approval probability is 50%…". The adapter now projects nothing in that case
 * and the route answers 422 PREDICTION_NOT_ASSESSED. A submission type with no
 * required-section profile (CompletenessNotAssessedError, a 422 by its own
 * contract) used to reach the generic handler and come back as a 500.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  gate: vi.fn(),
  risk: vi.fn(),
  projects: vi.fn(),
  submission: vi.fn(),
  scopeAccess: vi.fn(),
  assemble: vi.fn(),
}));

vi.mock('../../services/report-os/project-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/project-access')>()),
  canAccessReportScope: h.scopeAccess,
}));
vi.mock('../../db', () => ({ db: {}, pool: {}, getPool: () => ({}), getDb: () => ({}), query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../auth', () => ({
  authMiddleware: (req: any, _res: unknown, next: () => void) => {
    req.user = { id: 5, role: 'member', organizationId: 7 };
    req.userRole = 'member';
    next();
  },
}));
vi.mock('../../utils/authedOrgId', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/authedOrgId')>()),
  authedOrgId: () => 7,
}));
vi.mock('../../services/report-os/entitlement-map', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/entitlement-map')>()),
  requireReportEntitlement: h.gate,
}));
vi.mock('../../services/report-os/prediction/model-adapters', () => ({ runDeficiencyRiskForDraft: h.risk }));
vi.mock('../../services/report-os/ownership', () => ({ projectsInOrg: h.projects, submissionInProject: h.submission }));
vi.mock('../../services/report-os/prediction/assembler', () => ({
  assemblePredictionReport: h.assemble,
  assertHasDisclosure: () => undefined,
}));

import insightsRouter from '../report-os-insights';
import { CompletenessNotAssessedError } from '../../services/intelligence/regulatory-intelligence';

const app = express();
app.use(express.json());
app.use('/api/insights', insightsRouter);

const PREMORTEM = { kind: 'crl_rtf_premortem', scopeType: 'project', scopeId: '11', submissionType: 'NDA', presentSections: ['2.5'], projectId: 11 };

beforeEach(() => {
  h.gate.mockReset().mockResolvedValue({ entitled: true, feature: 'crl_rtf_premortem', tier: 'professional', requiredTier: 'professional' });
  h.risk.mockReset();
  h.projects.mockReset().mockResolvedValue(new Set([11]));
  h.submission.mockReset().mockResolvedValue(true);
  h.scopeAccess.mockReset().mockResolvedValue(true);
  h.assemble.mockReset().mockReturnValue({ status: 'partial', sections: [] });
});

describe('POST /api/insights/predictions/run — crl_rtf_premortem', () => {
  it('refuses with 422 when the model assessed no target, and assembles no report', async () => {
    h.risk.mockResolvedValue(null);
    const res = await request(app).post('/api/insights/predictions/run').send(PREMORTEM);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PREDICTION_NOT_ASSESSED');
    expect(res.body.error).toMatch(/no trained model and no network prior/i);
    expect(h.assemble).not.toHaveBeenCalled();
  });

  it('answers a submission type with no required-section profile with 422, not 500', async () => {
    h.risk.mockRejectedValue(
      new CompletenessNotAssessedError({
        submissionType: 'PMA',
        targetAgency: 'FDA',
        assessment: { status: 'not_assessed', reason: 'PMA has no canonical required-section profile', assessWith: null },
        checklist: [],
        rtfRisk: null,
        goNoGo: { decision: 'not_assessed', readinessScore: null, rationale: 'not assessed', conditions: [], blockers: [], risks: [] },
        summary: null,
      }),
    );
    const res = await request(app).post('/api/insights/predictions/run').send({ ...PREMORTEM, submissionType: 'PMA' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('COMPLETENESS_NOT_ASSESSED');
    expect(h.assemble).not.toHaveBeenCalled();
  });

  it('assembles the report when a target was assessed', async () => {
    h.risk.mockResolvedValue({ kind: 'deficiency_risk', rtfProbability: 0.3, crlProbability: null, firstCycleApprovalProbability: null, sampleSize: 0, usingNetworkPrior: true });
    const res = await request(app).post('/api/insights/predictions/run').send(PREMORTEM);
    expect(res.status).toBe(200);
    expect(h.assemble).toHaveBeenCalledOnce();
  });
});
