/**
 * Every governed record authoring-actions writes names the session user, read
 * through the canonical helper (governedActorId) — or there is no record, or
 * the request is refused. Never a value nobody is.
 *
 * What the code used to do (until 2026-10-15):
 *   - promote-to-review checked the user with governedActorId but recorded
 *     the boundary actor, the decision's createdById and the receipt's
 *     confirmedById / executedById from `(req as any).userId || undefined`;
 *     correction-draft, harmonize-sections and the three preflights recorded
 *     createdById the same way. So a session whose user is on req.user (which
 *     governedActorId reads) recorded no decider, and a non-numeric req.userId
 *     such as 'system' was recorded AS the decider.
 *   - plan- and execute-contradiction-resolution took `(req as any).userId || 0`:
 *     a request with no user ran as user 0, and execute recorded its decision
 *     and receipt by user '0'.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const H = vi.hoisted(() => ({
  recordGovernedActionDecision: vi.fn(),
  recordPreflightDecision: vi.fn(),
  createReceipt: vi.fn(),
  transitionDecision: vi.fn(),
  evaluateTransition: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  identifyRewriteTargets: vi.fn(),
  planResolution: vi.fn(),
  executeResolution: vi.fn(),
}));

vi.mock('../../services/decision-lifecycle-service.js', () => ({
  decisionLifecycleService: {
    recordGovernedActionDecision: H.recordGovernedActionDecision,
    recordPreflightDecision: H.recordPreflightDecision,
    createReceipt: H.createReceipt,
    transitionDecision: H.transitionDecision,
    checkAuthority: () => ({ allowed: true, authority: {} }),
    computeDecisionAwareStatus: () => ({}),
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
    query: { concept2cureArtifacts: { findFirst: H.findFirst, findMany: H.findMany } },
    update: () => ({ set: () => ({ where: async () => [] }) }),
  },
  // harmonize-sections proves the project is the caller's organization's
  // (projectBelongsToTenant) before it reads; project 12 is.
  getPool: () => ({ query: async () => ({ rows: [{ present: 1 }] }) }),
}));
vi.mock('../../../shared/schema/index.js', () => ({ concept2cureArtifacts: { id: 'id' } }));
vi.mock('../../services/resolution/rewrite-coordinator.js', () => ({ identifyRewriteTargets: H.identifyRewriteTargets }));
vi.mock('../../services/harmonize-engine.js', () => ({
  HarmonizeEngine: class {
    async check() {
      return { issues: [], consistencyScore: 100, totalIssues: 0, checkedDimensions: [], skippedDimensions: [] };
    }
  },
}));
vi.mock('../../services/body-aware-authoring.js', () => ({
  detectBodySpecificGaps: async () => ({ gaps: [], overallCompleteness: null, requiredLevel: 'recommended' }),
}));
vi.mock('../../services/orchestration/cross-object-resolver.js', () => ({
  assembleCrossObjectPayload: async () => { throw new Error('not under test'); },
}));
vi.mock('../../services/orchestration/readiness-engine.js', () => ({ computeReadinessAssessment: vi.fn() }));
vi.mock('../../services/contradiction-engine-service.js', () => ({
  contradictionEngineService: {
    scanProject: async () => ({ findings: [] }),
    buildPreflightContradictionContext: async () => ({}),
    getFinding: async () => ({ id: 'F-1', severity: 'major', contradictionType: 'assumption_drift' }),
  },
}));
vi.mock('../../services/resolution/contradiction-resolution-bridge.js', () => ({
  planContradictionResolution: H.planResolution,
  executeContradictionResolution: H.executeResolution,
}));

import authoringActionsRouter from '../authoring-actions';

/** The session as an authenticator leaves it: user on req.user, and/or req.userId. */
function app(session: { user?: Record<string, unknown>; userId?: unknown }) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).tenantId = 3;
    (req as any).userRole = 'submission_lead';
    if (session.user) (req as any).user = session.user;
    if ('userId' in session) (req as any).userId = session.userId;
    next();
  });
  a.use('/api/authoring-actions', authoringActionsRouter);
  return a;
}

/** The session user on req.user only — what governedActorId reads when req.userId is absent. */
const ON_USER = { user: { id: 7, organizationId: 3 } };
const post = (session: Parameters<typeof app>[0], path: string, body: Record<string, unknown>) =>
  request(app(session)).post(`/api/authoring-actions/${path}`).send(body);

const ARTIFACT = { id: 11, artifactId: 'artifact-11', status: 'draft', type: 'regulatory_document', title: 'Draft', content: '<p>Section text</p>', ctdSection: '2.4', metadata: {}, version: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  H.recordGovernedActionDecision.mockResolvedValue({ id: 'dec-1', authority: {} });
  H.recordPreflightDecision.mockResolvedValue({ id: 'dec-2', status: 'recommended' });
  H.createReceipt.mockResolvedValue({ id: 'rcpt-1', pendingApprovals: [] });
  H.transitionDecision.mockResolvedValue({ success: true, decision: { id: 'dec-1' } });
  H.evaluateTransition.mockResolvedValue({ allowed: true, blockedReasons: [], transition: null, metRequirements: [] });
  H.findFirst.mockResolvedValue({ ...ARTIFACT });
  H.findMany.mockResolvedValue([{ ...ARTIFACT }]);
  H.identifyRewriteTargets.mockResolvedValue([
    { objectId: '11', objectTitle: 'Section 2.4', revisionRationale: 'Align the dose rationale', requiresReview: true },
  ]);
  H.planResolution.mockResolvedValue({ success: true });
  H.executeResolution.mockResolvedValue({ success: true });
});

const decider = () => H.recordGovernedActionDecision.mock.calls[0]?.[0]?.createdById;

describe('promote-to-review records the user governedActorId resolved', () => {
  it('as the boundary actor, the decider and the receipt’s confirmer and executor', async () => {
    const res = await post(ON_USER, 'promote-to-review', { projectId: 12, artifactId: 11 });
    expect(res.body.promoted, JSON.stringify(res.body)).toBe(true);
    expect(H.evaluateTransition.mock.calls[0][0].actorId).toBe(7);
    expect(decider()).toBe('7');
    expect(H.createReceipt.mock.calls[0][0].confirmation.confirmedById).toBe('7');
    expect(H.createReceipt.mock.calls[0][0].execution.executedById).toBe('7');
  });

  it('as the decider of a blocked promotion', async () => {
    H.evaluateTransition.mockResolvedValue({ allowed: false, blockedReasons: ['A review record is required'], transition: null, metRequirements: [] });
    const res = await post(ON_USER, 'promote-to-review', { projectId: 12, artifactId: 11 });
    expect(res.body.promoted).toBe(false);
    expect(decider()).toBe('7');
  });
});

describe('the decisions the authoring computations record name the session user', () => {
  it('correction-draft', async () => {
    await post(ON_USER, 'correction-draft', { projectId: 12, artifactId: 11, sectionCode: '2.4' });
    expect(decider()).toBe('7');
  });

  it('harmonize-sections', async () => {
    await post(ON_USER, 'harmonize-sections', { projectId: 12, sectionCodes: ['2.4', '2.5'], submissionType: 'IND' });
    expect(decider()).toBe('7');
  });

  it.each([
    ['section-preflight', { projectId: 12, sectionCode: '2.4', regulatorBody: 'FDA', submissionType: 'IND' }],
    ['module-preflight', { projectId: 12, moduleCode: 'm2', regulatorBody: 'FDA', submissionType: 'IND' }],
    ['dossier-preflight', { projectId: 12, regulatorBody: 'FDA', submissionType: 'IND' }],
  ] as const)('%s', async (path, body) => {
    const res = await post(ON_USER, path, body);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(H.recordPreflightDecision.mock.calls[0]?.[0]?.createdById).toBe('7');
  });

  it("a non-numeric req.userId ('system') is not recorded as the decider", async () => {
    await post({ userId: 'system' }, 'correction-draft', { projectId: 12, artifactId: 11, sectionCode: '2.4' });
    expect(decider()).toBeUndefined();
  });
});

describe('contradiction resolution runs as the session user, or not at all', () => {
  it.each(['plan-contradiction-resolution', 'execute-contradiction-resolution'])(
    '%s answers 401 with no user, and runs nothing as user 0',
    async (path) => {
      const res = await post({}, path, { projectId: 12, findingId: 'F-1' });
      expect(res.status).toBe(401);
      expect(H.planResolution).not.toHaveBeenCalled();
      expect(H.executeResolution).not.toHaveBeenCalled();
    },
  );

  it('execute passes the session user to the resolution it records', async () => {
    const res = await post(ON_USER, 'execute-contradiction-resolution', { projectId: 12, findingId: 'F-1' });
    expect(res.status).toBe(200);
    expect(H.executeResolution.mock.calls[0][1]).toBe(7);
  });
});
