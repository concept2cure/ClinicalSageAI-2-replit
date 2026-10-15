/**
 * Preflight's body-expectations check measures the section's own text.
 *
 * Section and module preflight ran detectBodySpecificGaps against '' — the
 * empty string — so every recorded requirement came back 'missing' and the
 * check failed whatever the section said, while a section with no recorded
 * expectations passed. A missing regulator or submission type was filled in
 * as FDA / IND, contradiction rows without an id got String(Math.random()),
 * and the module read named no tenant. The section verdict is written into a
 * governed decision (recordPreflightDecision).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const H = vi.hoisted(() => ({
  detect: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  scanProject: vi.fn(),
  recordPreflightDecision: vi.fn(),
}));

vi.mock('../../services/body-aware-authoring.js', () => ({ detectBodySpecificGaps: H.detect }));
vi.mock('../../db.js', () => ({
  db: { query: { concept2cureArtifacts: { findFirst: H.findFirst, findMany: H.findMany } } },
}));
vi.mock('../../services/contradiction-engine-service.js', () => ({
  contradictionEngineService: {
    scanProject: H.scanProject,
    buildPreflightContradictionContext: vi.fn(async () => ({})),
  },
}));
vi.mock('../../services/orchestration/cross-object-resolver.js', () => ({
  assembleCrossObjectPayload: vi.fn(async () => { throw new Error('not under test'); }),
}));
vi.mock('../../services/orchestration/readiness-engine.js', () => ({ computeReadinessAssessment: vi.fn() }));
vi.mock('../../services/decision-lifecycle-service.js', () => ({
  decisionLifecycleService: {
    recordPreflightDecision: H.recordPreflightDecision,
    computeDecisionAwareStatus: vi.fn(() => ({})),
  },
}));
vi.mock('../../services/harmonize-engine.js', () => ({
  HarmonizeEngine: class { async check() { return { issues: [], consistencyScore: 100 }; } },
}));

import authoringActionsRouter, { bodyExpectationsCheck } from '../authoring-actions';

const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as any).tenantId = 3; (req as any).userId = 7; next(); });
app.use('/api/authoring-actions', authoringActionsRouter);

const SECTION_TEXT = '<p>The starting dose rationale is based on the NOAEL in two species.</p>';
const PRESENT = { gaps: [{ requirement: 'Starting dose rationale', status: 'present', bodyNote: '' }], overallCompleteness: 100, requiredLevel: 'required' };

beforeEach(() => {
  vi.clearAllMocks();
  H.detect.mockResolvedValue(PRESENT);
  H.findFirst.mockResolvedValue({ id: 11, projectId: 12, organizationId: 3, ctdSection: '2.4', content: SECTION_TEXT });
  H.findMany.mockResolvedValue([{ id: 11, ctdSection: '2.4', status: 'draft', content: SECTION_TEXT }]);
  H.scanProject.mockResolvedValue({ findings: [] });
  H.recordPreflightDecision.mockResolvedValue({ id: 'dec-1', status: 'recommended' });
});

describe('bodyExpectationsCheck', () => {
  it("measures the section's own text, not the empty string", async () => {
    const r = await bodyExpectationsCheck({ regulatorBody: 'FDA', submissionType: 'IND', sectionCode: '2.4', content: SECTION_TEXT });
    expect(H.detect).toHaveBeenCalledWith('FDA', 'IND', '2.4', 'The starting dose rationale is based on the NOAEL in two species.');
    expect(r).toMatchObject({ status: 'pass', missing: [], weak: [], requiredLevel: 'required' });
  });

  it('does not fill in FDA / IND when one is missing', async () => {
    const r = await bodyExpectationsCheck({ regulatorBody: 'FDA', sectionCode: '2.4', content: SECTION_TEXT });
    expect(r.status).toBe('unknown');
    expect(r.reason).toMatch(/regulator body and a submission type/);
    expect(H.detect).not.toHaveBeenCalled();
  });

  it('does not run on a section with no text', async () => {
    const r = await bodyExpectationsCheck({ regulatorBody: 'FDA', submissionType: 'IND', sectionCode: '2.4', content: '<p> </p>' });
    expect(r.status).toBe('unknown');
    expect(H.detect).not.toHaveBeenCalled();
  });

  it('is not a pass when nothing was recorded to measure against', async () => {
    H.detect.mockResolvedValue({ gaps: [], overallCompleteness: null, requiredLevel: 'recommended' });
    const r = await bodyExpectationsCheck({ regulatorBody: 'FDA', submissionType: 'IND', sectionCode: '9.9', content: SECTION_TEXT });
    expect(r.status).toBe('unknown');
    expect(r.reason).toMatch(/No FDA IND expectations are recorded for section 9\.9/);
  });
});

describe('the preflights pass the section text', () => {
  it("section preflight checks this tenant's artifact text", async () => {
    const res = await request(app).post('/api/authoring-actions/section-preflight')
      .send({ projectId: 12, sectionCode: '2.4', regulatorBody: 'FDA', submissionType: 'IND' });
    expect(res.status).toBe(200);
    expect(res.body.checks.bodyExpectations.status).toBe('pass');
    expect(H.detect).toHaveBeenCalledWith('FDA', 'IND', '2.4', expect.stringContaining('starting dose rationale'));
  });

  it("module preflight reads only this tenant's artifacts, and checks their text", async () => {
    const res = await request(app).post('/api/authoring-actions/module-preflight')
      .send({ projectId: 12, moduleCode: 'm2', regulatorBody: 'FDA', submissionType: 'IND' });
    expect(res.status).toBe(200);
    expect(H.detect).toHaveBeenCalledWith('FDA', 'IND', '2.4', expect.stringContaining('starting dose rationale'));
    expect(res.body.sectionResults[0].checks.bodyExpectations.status).toBe('pass');
    // The read is scoped: the where-builder is given and(projectId, organizationId).
    const where = H.findMany.mock.calls[0][0].where;
    const conds: unknown[] = [];
    where({ projectId: 'p', organizationId: 'o' }, {
      and: (...c: unknown[]) => { conds.push(...c); return c; },
      eq: (col: string, v: unknown) => `${col}=${v}`,
    });
    expect(conds).toEqual(['p=12', 'o=3']);
  });

  it('module preflight reports a failed read as a failure, not "no sections"', async () => {
    H.findMany.mockRejectedValue(new Error('connection terminated'));
    const res = await request(app).post('/api/authoring-actions/module-preflight')
      .send({ projectId: 12, moduleCode: 'm2', regulatorBody: 'FDA', submissionType: 'IND' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/No sections found/);
  });
});
