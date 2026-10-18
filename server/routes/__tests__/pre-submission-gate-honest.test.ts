/**
 * The pre-submission gate says what it assessed, and nothing it did not.
 *
 * - CRL and RTF risk came from regulatory-precedent-intelligence, whose
 *   CRL/RTF families ADR 0013 keeps unwired from the product. On a tenant
 *   whose library is empty — every tenant but those POST /api/tenants seeded
 *   with uncited rates — both answered "low", risk 0, and the verdict read
 *   "CRL/RTF risk acceptable". They are now reported as not assessed.
 * - A missing submission type was assessed and audited as an NDA.
 * - An ICH check that failed read as "not evaluated · no CMC project linked".
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  assessCRLRisk: vi.fn(),
  generatePreventionReport: vi.fn(),
  runIchComplianceCheck: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('../../services/orchestration', () => ({
  executeWorkflow: vi.fn(),
  cancelWorkflow: vi.fn(() => true),
  getWorkflowExecution: vi.fn(() => null),
  getProjectWorkflows: vi.fn(() => []),
  getRegisteredTemplates: vi.fn(() => []),
  assembleCrossObjectPayload: vi.fn(async () => ({
    cmcSignals: { sourceObjectCount: 0, sourceTypeBreakdown: {}, sectionCount: 0, staleSectionCount: 0,
      contradictionCounts: { critical: 0, open: 0 }, contradictions: [] },
    lastSignalAt: null,
  })),
  computeReadinessAssessment: vi.fn(() => ({
    overallScore: 82, status: 'on_track', scores: {}, unassessedDimensions: [], blockers: [], moduleBreakdown: [],
  })),
  generateRecommendations: vi.fn(() => ({ recommendations: [] })),
  generateContinuitySnapshot: vi.fn(),
  getLatestSnapshot: vi.fn(() => null),
}));
vi.mock('../../services/regulatory-precedent-intelligence', () => ({
  crlTriggerService: { assessCRLRisk: h.assessCRLRisk },
  rtfTriggerService: { generatePreventionReport: h.generatePreventionReport },
}));
vi.mock('../../services/cmc/ich-compliance-checker', () => ({ runIchComplianceCheck: h.runIchComplianceCheck }));
vi.mock('../../db.js', () => ({ db: { insert: () => ({ values: h.insert }) } }));

import orchestrationRouter from '../orchestration';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).user = { id: 17, organizationId: 1, email: 'runner@example.test', role: 'admin', name: 'R. Unner' };
    next();
  });
  a.use('/api/orchestration', orchestrationRouter);
  return a;
}

const LOW = { overallRisk: 'low', riskScore: 0, matchedPatterns: [], trajectoryPrediction: {}, mitigationStrategies: [],
  preventionChecklist: [], estimatedRecoveryDays: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  h.assessCRLRisk.mockResolvedValue(LOW);
  h.generatePreventionReport.mockResolvedValue(LOW);
  h.insert.mockResolvedValue(undefined);
});

describe('POST /pre-submission-gate', () => {
  it('reports CRL and RTF risk as not assessed, and never calls them acceptable', async () => {
    const r = await request(app()).post('/api/orchestration/pre-submission-gate').send({ projectId: 7, submissionType: 'NDA' });
    expect(r.status).toBe(200);
    expect(h.assessCRLRisk).not.toHaveBeenCalled();
    expect(h.generatePreventionReport).not.toHaveBeenCalled();
    expect(r.body.crl).toMatchObject({ overallRisk: 'not_assessed', riskScore: null });
    expect(r.body.rtf).toMatchObject({ overallRisk: 'not_assessed', riskScore: null });
    expect(r.body.crl.reason).toMatch(/not assessed/i);
    expect(r.body.verdictRationale.join(' ')).not.toMatch(/CRL\/RTF risk acceptable/);
  });

  it('assesses no submission type it was not given', async () => {
    const r = await request(app()).post('/api/orchestration/pre-submission-gate').send({ projectId: 7 });
    expect(r.status).toBe(200);
    expect(r.body.submissionType).toBeNull();
  });

  it('reports an ICH check that failed as incomplete, not as no CMC project linked', async () => {
    h.runIchComplianceCheck.mockRejectedValue(new Error('stability read failed'));
    const r = await request(app()).post('/api/orchestration/pre-submission-gate')
      .send({ projectId: 7, submissionType: 'NDA', cmcProjectId: '0b7e1d2a-1111-4222-8333-944455556666' });
    expect(r.status).toBe(200);
    expect(r.body.ich).toMatchObject({ overallStatus: 'incomplete', counts: null });
    expect(r.body.verdict).toBe('conditional');
    expect(r.body.verdictRationale.join(' ')).toMatch(/ICH compliance could not be evaluated/);
  });

  it('says the ICH check was not run when no CMC project was linked', async () => {
    const r = await request(app()).post('/api/orchestration/pre-submission-gate').send({ projectId: 7, submissionType: 'NDA' });
    expect(r.body.ich).toBeNull();
    expect(r.body.verdictRationale.join(' ')).not.toMatch(/ICH compliance clean/);
  });
});
