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

describe('governed-ana-execution', () => {
  beforeEach(() => {
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
  });

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
