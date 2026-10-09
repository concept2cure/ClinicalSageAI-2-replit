import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  evaluateAndInterceptGovernedDocument: vi.fn(),
  hasUnresolvedGovernedDecisions: vi.fn(),
  integrateSignal: vi.fn(),
  tagArtifact: vi.fn(),
}));

vi.mock('../../src/control-plane/governed-document-evaluator.js', () => ({
  evaluateAndInterceptGovernedDocument: mocks.evaluateAndInterceptGovernedDocument,
}));

vi.mock('../governed-decision-repository.js', () => ({
  hasUnresolvedGovernedDecisions: mocks.hasUnresolvedGovernedDecisions,
}));

vi.mock('../intelligence/rim-integration.js', () => ({
  integrateSignal: mocks.integrateSignal,
}));

vi.mock('../artifact-tagger.js', () => ({
  tagArtifact: mocks.tagArtifact,
}));

import { buildCanonicalGovernedState, executeGovernedAnaOperation } from '../governed-ana-execution.js';

/** The evaluator answers a clean evaluation; the lifecycle read reports two unresolved decisions. */
function arrangeEvaluation() {
  vi.resetAllMocks();

  mocks.evaluateAndInterceptGovernedDocument.mockReturnValue({
    evaluation: {
      context: {
        organizationId: '1',
        projectId: '2',
        actorId: '3',
        intendedAction: 'create',
        artifactId: 'art_1',
        documentType: 'risk_memo',
      },
      decision: { outcome: 'allow', rationale: 'ok', blockerCount: 0, warningCount: 0, consequenceCount: 0 },
      readiness: {
        level: 'review_ready',
        score: 77,
        blockers: [],
        warnings: [],
        evaluatedAt: new Date().toISOString(),
        evaluatedBy: 'test',
        confidence: 'moderate',
      },
      placement: { outcome: 'allowed', fallbackAcceptable: false },
      exportGate: { outcome: 'eligible', gateChecks: [], blockingReasons: [], remediationSteps: [] },
      publishGate: { outcome: 'eligible', gateChecks: [], blockingReasons: [], remediationSteps: [], dispatchReady: true },
      consequences: [],
      uiPresentationHints: { nextRecommendedAction: 'Proceed', readinessBadge: { label: 'ready', tone: 'green' }, exportBadge: { label: 'ok', tone: 'green' }, publishBadge: { label: 'ok', tone: 'green' }, topBlockerMessages: [], topWarningMessages: [], placementLabel: 'allowed', decisionOutcomeLabel: 'allow' },
      rimContextHints: { blockerCategories: [], warningCategories: [], consequenceTypes: [], exportGateOutcome: 'eligible', publishGateOutcome: 'eligible', placementOutcome: 'allowed', readinessLevel: 'review_ready' },
      evaluatedAt: new Date().toISOString(),
    },
    decisionReference: { decisionId: 'dec_1', projectId: '2', intent: 'create', outcome: 'allow', actorId: '3', timestamp: new Date().toISOString() },
  });
  mocks.hasUnresolvedGovernedDecisions.mockResolvedValue({ hasUnresolved: true, unresolvedCount: 2, escalatedCount: 1, states: { under_review: 1 } });
  mocks.integrateSignal.mockReturnValue({ runId: 'rim_run_1' });
}

describe('governed-ana-execution', () => {
  beforeEach(arrangeEvaluation);

  it('builds canonical governed state with unresolved lifecycle flags', async () => {
    const state = await buildCanonicalGovernedState({
      context: { organizationId: '1', projectId: '2', actorId: '3', intendedAction: 'create', documentType: 'risk_memo' },
      documentState: { hasContent: true, hasEvidence: true, hasBeenReviewed: true, hasApproval: false, hasPlacement: true, placementValid: true, hasProvenance: true, unresolvedContradictionCount: 0, criticalContradictionCount: 0 },
    });

    expect(state.decisionLifecycle.unresolvedCount).toBe(2);
    expect(state.derivedFlags.hasUnresolvedGovernedDecisions).toBe(true);
    expect(state.nextRecommendedAction).toBe('Proceed');
  });

  it('rejects persistence when unresolved governed decisions remain', async () => {
    const result = await executeGovernedAnaOperation({
      evaluationInput: {
        context: { organizationId: '1', projectId: '2', actorId: '3', intendedAction: 'create', documentType: 'risk_memo' },
        documentState: { hasContent: true, hasEvidence: true, hasBeenReviewed: true, hasApproval: false, hasPlacement: true, placementValid: true, hasProvenance: true, unresolvedContradictionCount: 0, criticalContradictionCount: 0 },
      },
      artifactMutation: {
        projectId: 2,
        organizationId: 1,
        documentType: 'risk_memo',
        artifactClass: 'ana_ri_generated_document',
        title: 'Risk memo',
        content: 'lorem ipsum short',
        status: 'draft',
        source: 'AnA',
        intentLens: 'risk',
        originSurface: 'test',
        provenance: {},
        structureSections: [],
        qualityGate: { grade: 'D', pass: false, issues: ['short'] },
        versioningMode: 'create',
      },
    });

    expect(result.persistenceStatus).toBe('rejected');
    expect(mocks.tagArtifact).not.toHaveBeenCalled();
    expect(result.learningEventReference).toBe('rim_run_1');
  });
});

describe('governed-ana-execution: a lifecycle read that cannot be answered (L186)', () => {
  beforeEach(arrangeEvaluation);

  /* Ledger L186. The unresolved-decision read used to answer a database outage
     with "nothing unresolved", which opened this gate. It now rejects, and the
     gate must stay shut on a rejection, even for a mutation that would
     otherwise pass. The positive control below is the same mutation with a
     read that answers "nothing unresolved": it persists, so the refusal above
     it is the read's doing and nothing else's. */
  const passingMutation = {
    evaluationInput: {
      context: { organizationId: '1', projectId: '2', actorId: '3', intendedAction: 'create', documentType: 'risk_memo' },
      documentState: { hasContent: true, hasEvidence: true, hasBeenReviewed: true, hasApproval: false, hasPlacement: true, placementValid: true, hasProvenance: true, unresolvedContradictionCount: 0, criticalContradictionCount: 0 },
    },
    artifactMutation: {
      projectId: 2,
      organizationId: 1,
      documentType: 'risk_memo',
      artifactClass: 'ana_ri_generated_document',
      title: 'Risk memo',
      content:
        '[KNOWN] The sterilisation validation covers all three lots. [INFERRED] Shelf life is supported to 24 months. ' +
        '[MISSING] No human-factors summative data yet.',
      status: 'draft',
      source: 'AnA',
      intentLens: 'risk',
      originSurface: 'test',
      provenance: {},
      structureSections: [],
      qualityGate: { grade: 'A', pass: true, issues: [] },
      versioningMode: 'create',
    },
  } as unknown as Parameters<typeof executeGovernedAnaOperation>[0];

  it('does not mutate when the unresolved-decision read cannot be answered (L186)', async () => {
    mocks.hasUnresolvedGovernedDecisions.mockRejectedValue(new Error('database unavailable'));
    await expect(executeGovernedAnaOperation(passingMutation)).rejects.toThrow('database unavailable');
    expect(mocks.tagArtifact).not.toHaveBeenCalled();
  });

  it('mutates the same artifact when the read answers that nothing is unresolved', async () => {
    mocks.hasUnresolvedGovernedDecisions.mockResolvedValue({ hasUnresolved: false, unresolvedCount: 0, escalatedCount: 0, states: {} });
    mocks.tagArtifact.mockResolvedValue({ artifactId: 'art_1', versionId: 'ver_1' });
    await executeGovernedAnaOperation(passingMutation);
    expect(mocks.tagArtifact).toHaveBeenCalledTimes(1);
  });
});
