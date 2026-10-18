/**
 * The two governance-boundary promotions in authoring-actions record what the
 * boundary actually checked — and do not promote when it could not check.
 *
 * What the code used to do (until 2026-10-15):
 * - POST /mark-submission-ready committed a governed decision whose rationale
 *   was the literal "All assumptions approved, all decisions resolved, strong
 *   confidence. Ready for submission." and a receipt "All gates passed" —
 *   whatever the boundary had checked. The strong-confidence rule never ran
 *   (the route named no decision to rate), and no rule need have applied.
 * - It could not name that decision at all: decisionId was not read.
 * - POST /promote-to-review recorded "No blocking contradictions. Preflight
 *   passed or skipped." and "Artifact passed preflight or user overrode
 *   warnings"; it runs no preflight. When the boundary threw, it fell back to
 *   the contradiction check alone and promoted with every rule unchecked. A
 *   refusal was filed as kind 'contradiction', "Blocked by contradictions",
 *   whatever the boundary's reason was.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  transitionDecision: vi.fn(),
  checkAuthority: vi.fn(),
  recordGovernedActionDecision: vi.fn(),
  createReceipt: vi.fn(),
  evaluateTransition: vi.fn(),
  checkPromotionBlocked: vi.fn(),
  findFirst: vi.fn(),
  selectLimit: vi.fn(),
  updateWhere: vi.fn(),
}));

vi.mock('../../services/decision-lifecycle-service.js', () => ({
  decisionLifecycleService: {
    transitionDecision: H.transitionDecision,
    checkAuthority: H.checkAuthority,
    recordGovernedActionDecision: H.recordGovernedActionDecision,
    createReceipt: H.createReceipt,
  },
}));
vi.mock('../../services/governance-boundary-service.js', () => ({
  GovernanceBoundaryService: { getInstance: () => ({ evaluateTransition: H.evaluateTransition }) },
}));
vi.mock('../../services/contradiction-engine-service.js', () => ({
  contradictionEngineService: { checkPromotionBlocked: H.checkPromotionBlocked },
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

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).tenantId = 3;
    (req as any).userId = 7;
    (req as any).userRole = 'submission_lead';
    next();
  });
  a.use('/api/authoring-actions', authoringActionsRouter);
  return a;
}

const ARTIFACT = { id: 11, artifactId: 'artifact-11', status: 'draft', type: 'regulatory_document', title: 'Draft', content: 'c', ctdSection: 'm2.5', metadata: {}, version: 1 };
const ONLY_CONTRADICTIONS_CHECKED = ['Contradiction gate: no unresolved blocking contradiction for artifact 11.'];
const DECISION_ID = '0f5e7c1a-3b2d-4c5e-8f9a-1b2c3d4e5f60';

beforeEach(() => {
  vi.clearAllMocks();
  H.transitionDecision.mockResolvedValue({ success: true });
  H.checkAuthority.mockReturnValue({ allowed: true, authority: {} });
  H.recordGovernedActionDecision.mockResolvedValue({ id: 'dec-1', authority: {} });
  H.createReceipt.mockResolvedValue({ id: 'rcpt-1', pendingApprovals: [] });
  H.evaluateTransition.mockResolvedValue({ allowed: true, blockedReasons: [], metRequirements: ONLY_CONTRADICTIONS_CHECKED, transition: { id: 'gbt-1' } });
  H.checkPromotionBlocked.mockResolvedValue({ blocked: false, blockingFindings: [], warningFindings: [] });
  H.findFirst.mockResolvedValue({ ...ARTIFACT });
  H.selectLimit.mockResolvedValue([{ ...ARTIFACT, status: 'locked' }]);
  H.updateWhere.mockResolvedValue([]);
});

describe('POST /mark-submission-ready', () => {
  const post = (body: Record<string, unknown>) =>
    request(app()).post('/api/authoring-actions/mark-submission-ready').send({ projectId: 12, artifactId: 11, ...body });

  it('records what the boundary checked, not "strong confidence" or "All gates passed"', async () => {
    const res = await post({});
    expect(res.body.submissionReady).toBe(true);
    const rationale = String(H.recordGovernedActionDecision.mock.calls[0]?.[0]?.rationale);
    expect(rationale).not.toMatch(/strong confidence|assumptions approved|decisions resolved/i);
    expect(rationale).toContain(ONLY_CONTRADICTIONS_CHECKED[0]);
    const receiptRationale = H.createReceipt.mock.calls[0]?.[0]?.recommendation?.rationale;
    expect(receiptRationale).not.toBe('All gates passed');
    expect(receiptRationale).toBe(rationale);
  });

  it('names the decision the minimum-confidence rule rates', async () => {
    await post({ decisionId: DECISION_ID });
    expect(H.evaluateTransition).toHaveBeenCalledWith(expect.objectContaining({ decisionId: DECISION_ID }));
  });

  it('refuses a decisionId that is not a decision id', async () => {
    const res = await post({ decisionId: 'not-a-decision' });
    expect(res.status).toBe(400);
    expect(H.evaluateTransition).not.toHaveBeenCalled();
  });
});

describe('POST /promote-to-review (advisory → governed_draft)', () => {
  const post = () => request(app()).post('/api/authoring-actions/promote-to-review').send({ projectId: 12, artifactId: 11 });

  it('does not promote when the boundary cannot be evaluated — no contradiction-only fallback', async () => {
    H.evaluateTransition.mockRejectedValue(new Error('Database unavailable'));
    const res = await post();
    expect(res.body.promoted).toBe(false);
    expect(res.body.reason).toBe('blocked');
    expect(H.updateWhere).not.toHaveBeenCalled();
  });

  it('records what the boundary checked as the promotion rationale, not "Preflight passed or skipped"', async () => {
    const res = await post();
    expect(res.body.promoted).toBe(true);
    const rationale = String(H.recordGovernedActionDecision.mock.calls[0]?.[0]?.rationale);
    expect(rationale).not.toMatch(/preflight/i);
    expect(rationale).toContain(ONLY_CONTRADICTIONS_CHECKED[0]);
    expect(H.createReceipt.mock.calls[0]?.[0]?.recommendation?.rationale).toBe(rationale);
  });

  it('files a boundary refusal as the rule it is, not as a contradiction', async () => {
    const reason = 'Rule "Advisory to Governed Draft": requires a review before governed_draft, and this boundary reads no review record, so no review is shown. Failing closed.';
    H.evaluateTransition.mockResolvedValue({ allowed: false, blockedReasons: [reason], metRequirements: [], transition: { id: 'gbt-2' } });
    const res = await post();
    expect(res.body.promoted).toBe(false);
    const signals = H.recordGovernedActionDecision.mock.calls[0]?.[0]?.sourceSignals as Array<{ kind: string }>;
    expect(signals.map((s) => s.kind)).not.toContain('contradiction');
    const receipt = H.createReceipt.mock.calls[0]?.[0];
    expect(`${receipt?.confirmation?.rejectionReason} ${receipt?.execution?.error}`).not.toMatch(/contradiction/i);
    expect(receipt?.execution?.error).toContain('requires a review');
  });
});
