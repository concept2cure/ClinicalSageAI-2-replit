/**
 * The governed decision acts in authoring-actions record only what happened,
 * for the user who did it, in the caller's own organization.
 *
 * - POST /decision/:id/confirm resolved no tenant (any caller could confirm or
 *   reject another organization's decision by id) and recorded a missing user
 *   as 'unknown'.
 * - /promote-to-review and /mark-submission-ready ignored the answer of each
 *   decision transition, so a refused or non-durable transition was followed by
 *   a receipt saying the decision was executed.
 * - /mark-submission-ready's authority check sat in a catch marked
 *   "non-blocking": a check that threw let the act through.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const H = vi.hoisted(() => ({
  getDecision: vi.fn(),
  transitionDecision: vi.fn(),
  checkAuthority: vi.fn(),
  recordGovernedActionDecision: vi.fn(),
  createReceipt: vi.fn(),
  evaluateTransition: vi.fn(),
  findFirst: vi.fn(),
  selectLimit: vi.fn(),
  updateWhere: vi.fn(),
}));

vi.mock('../../services/decision-lifecycle-service.js', () => ({
  decisionLifecycleService: {
    getDecision: H.getDecision,
    transitionDecision: H.transitionDecision,
    checkAuthority: H.checkAuthority,
    recordGovernedActionDecision: H.recordGovernedActionDecision,
    createReceipt: H.createReceipt,
  },
}));
vi.mock('../../services/governance-boundary-service.js', () => ({
  GovernanceBoundaryService: { getInstance: () => ({ evaluateTransition: H.evaluateTransition }) },
}));
vi.mock('../../services/concept2cure/governedDocumentContractService.js', () => ({
  resolveGovernedContext: () => ({
    validation: { valid: true, errors: [], warnings: [] },
    contract: { exportEligibility: { gateChecks: [], blockingReasons: [], readinessOutcome: 'internal_review' } },
  }),
}));
vi.mock('../../db.js', () => ({
  db: {
    query: { concept2cureArtifacts: { findFirst: H.findFirst } },
    update: () => ({ set: () => ({ where: H.updateWhere }) }),
    select: () => ({ from: () => ({ where: () => ({ limit: H.selectLimit }) }) }),
  },
}));
vi.mock('../../../shared/schema/index.js', () => ({ concept2cureArtifacts: { id: 'id' } }));

import authoringActionsRouter from '../authoring-actions';

function app(user: { userId?: unknown; tenantId?: number } = {}) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).tenantId = user.tenantId ?? 3;
    if ('userId' in user) {
      if (user.userId !== undefined) (req as any).userId = user.userId;
    } else {
      (req as any).userId = 7;
    }
    (req as any).userRole = 'submission_lead';
    next();
  });
  a.use('/api/authoring-actions', authoringActionsRouter);
  return a;
}

const ARTIFACT = { id: 11, artifactId: 'artifact-11', status: 'draft', type: 'regulatory_document', title: 'Draft', content: 'c', ctdSection: null, metadata: {}, version: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  H.getDecision.mockImplementation((id: string, org?: number) =>
    id === 'dec-own' && org === 3 ? { id: 'dec-own', organizationId: 3, status: 'recommended' } : undefined);
  H.transitionDecision.mockResolvedValue({ success: true, decision: { id: 'dec-own', status: 'confirmed' } });
  H.checkAuthority.mockReturnValue({ allowed: true, authority: {} });
  H.recordGovernedActionDecision.mockResolvedValue({ id: 'dec-1', authority: {} });
  H.createReceipt.mockResolvedValue({ id: 'rcpt-1', pendingApprovals: [] });
  H.evaluateTransition.mockResolvedValue({ allowed: true, blockedReasons: [], transition: null });
  H.findFirst.mockResolvedValue({ ...ARTIFACT });
  H.selectLimit.mockResolvedValue([{ ...ARTIFACT, status: 'locked' }]);
  H.updateWhere.mockResolvedValue([]);
});

describe('POST /decision/:decisionId/confirm', () => {
  it("does not confirm another organization's decision — it is not found", async () => {
    const res = await request(app({ tenantId: 4 })).post('/api/authoring-actions/decision/dec-own/confirm').send({ accepted: true });
    expect(res.status).toBe(404);
    expect(H.transitionDecision).not.toHaveBeenCalled();
  });

  it('refuses a request with no user rather than recording "unknown"', async () => {
    const res = await request(app({ userId: undefined })).post('/api/authoring-actions/decision/dec-own/confirm').send({ accepted: true });
    expect(res.status).toBe(401);
    expect(H.transitionDecision).not.toHaveBeenCalled();
  });

  it('confirms the caller\'s own decision as the signed-in user', async () => {
    const res = await request(app()).post('/api/authoring-actions/decision/dec-own/confirm').send({ accepted: true });
    expect(res.status).toBe(200);
    expect(H.transitionDecision).toHaveBeenCalledWith('dec-own', 'confirmed', expect.objectContaining({ actorId: '7' }));
  });
});

describe('POST /mark-submission-ready', () => {
  const BODY = { projectId: 12, artifactId: 11 };

  it('refuses when the authority check cannot be completed', async () => {
    H.checkAuthority.mockImplementation(() => { throw new Error('authority map unavailable'); });
    const res = await request(app()).post('/api/authoring-actions/mark-submission-ready').send(BODY);
    expect(res.body).toMatchObject({ submissionReady: false, reason: 'authority-check-failed' });
    expect(H.recordGovernedActionDecision).not.toHaveBeenCalled();
  });

  it('writes no "executed" receipt when the decision transition is refused', async () => {
    H.transitionDecision.mockResolvedValueOnce({ success: false, error: 'Decision dec-1 could not be transitioned to confirmed durably.' });
    await request(app()).post('/api/authoring-actions/mark-submission-ready').send(BODY);
    expect(H.recordGovernedActionDecision).toHaveBeenCalled();
    expect(H.createReceipt).not.toHaveBeenCalled();
  });

  it('refuses a request with no user', async () => {
    const res = await request(app({ userId: undefined })).post('/api/authoring-actions/mark-submission-ready').send(BODY);
    expect(res.status).toBe(401);
    expect(H.recordGovernedActionDecision).not.toHaveBeenCalled();
  });
});

describe('POST /promote-to-review', () => {
  const BODY = { projectId: 12, artifactId: 11 };

  it('writes no "executed" receipt when the decision transition is refused', async () => {
    H.transitionDecision
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'Invalid transition: confirmed → executed' });
    const res = await request(app()).post('/api/authoring-actions/promote-to-review').send(BODY);
    expect(H.recordGovernedActionDecision).toHaveBeenCalled();
    expect(H.createReceipt).not.toHaveBeenCalled();
    expect(res.body.receiptId ?? null).toBeNull();
  });

  it('refuses a request with no user', async () => {
    const res = await request(app({ userId: undefined })).post('/api/authoring-actions/promote-to-review').send(BODY);
    expect(res.status).toBe(401);
    expect(H.recordGovernedActionDecision).not.toHaveBeenCalled();
  });
});
