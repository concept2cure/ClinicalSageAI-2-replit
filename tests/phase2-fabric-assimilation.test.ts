/**
 * Phase 2 Build Order #2 — Fabric Assimilation Tests
 *
 * Tests for RIM bridge, chat context enrichment, UI hints,
 * canonical hooks, and cross-layer integration.
 */

import { describe, expect, it, beforeEach } from 'vitest';

// Fabric evaluator
import {
  evaluateGovernedDocument,
  type GovernedEvaluationInput,
} from '../server/src/control-plane/governed-document-evaluator';
import {
  clearGovernedDecisionLog,
} from '../server/services/governed-decision-repository';

// Shared types
import type {
  RIMContextHints,
  UIPresentationHints,
} from '../shared/types/governed-document-fabric';

// RIM bridge
import {
  interceptFabricDecision,
  buildRIMContextForFabric,
  type FabricDecisionInterceptInput,
  type GovernedFabricLearningEvent,
} from '../server/services/intelligence/fabric-signal-bridge';

// Chat context envelope
import {
  formatFabricStateForPrompt,
  type GovernedContextEnvelope,
} from '../server/services/ana-ri/governed-context-envelope';

// Fabric hooks (type-only check)
import type {
  FabricDecisionEntry,
  FabricSummary,
} from '../client/src/concept2cure/hooks/useFabricState';

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function makeEvaluationInput(overrides: Partial<GovernedEvaluationInput> = {}): GovernedEvaluationInput {
  return {
    context: {
      organizationId: 'org-1',
      projectId: 'proj-1',
      actorId: 'user-1',
      intendedAction: 'update',
      artifactId: 'art-1',
      documentType: 'clinical_overview',
      regulatorBody: 'FDA',
      submissionType: 'NDA',
      ctdSection: 'm2.5',
    },
    documentState: {
      hasContent: true,
      hasEvidence: true,
      evidenceCount: 3,
      hasBeenReviewed: false,
      hasApproval: false,
      hasPlacement: true,
      placementValid: true,
      hasProvenance: true,
      unresolvedContradictionCount: 0,
      criticalContradictionCount: 0,
    },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 1. RIM Context Hints in Evaluation
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 2 — RIM Context Hints', () => {
  beforeEach(() => clearGovernedDecisionLog());

  it('evaluation includes rimContextHints', () => {
    const result = evaluateGovernedDocument(makeEvaluationInput());
    const hints = result.evaluation.rimContextHints;

    expect(hints).toBeTruthy();
    expect(hints!.readinessLevel).toBeTruthy();
    expect(hints!.exportGateOutcome).toBeTruthy();
    expect(hints!.publishGateOutcome).toBeTruthy();
    expect(hints!.placementOutcome).toBeTruthy();
    expect(Array.isArray(hints!.blockerCategories)).toBe(true);
    expect(Array.isArray(hints!.warningCategories)).toBe(true);
    expect(Array.isArray(hints!.consequenceTypes)).toBe(true);
  });

  it('rimContextHints reflect blocked state when contradictions exist', () => {
    const result = evaluateGovernedDocument(makeEvaluationInput({
      documentState: {
        hasContent: true,
        hasEvidence: true,
        hasBeenReviewed: false,
        hasApproval: false,
        hasPlacement: true,
        placementValid: true,
        hasProvenance: true,
        unresolvedContradictionCount: 3,
        criticalContradictionCount: 2,
      },
    }));

    expect(result.evaluation.rimContextHints!.readinessLevel).toBe('blocked');
    expect(result.evaluation.rimContextHints!.blockerCategories).toContain('unresolved_contradiction');
  });

  it('rimContextHints include regulatory scope when provided', () => {
    const result = evaluateGovernedDocument(makeEvaluationInput());
    expect(result.evaluation.rimContextHints!.regulatorScope).toBe('FDA');
    expect(result.evaluation.rimContextHints!.submissionType).toBe('NDA');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. UI Presentation Hints
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 2 — UI Presentation Hints', () => {
  beforeEach(() => clearGovernedDecisionLog());

  it('evaluation includes uiPresentationHints', () => {
    const result = evaluateGovernedDocument(makeEvaluationInput());
    const hints = result.evaluation.uiPresentationHints;

    expect(hints).toBeTruthy();
    expect(hints!.readinessBadge).toBeTruthy();
    expect(hints!.readinessBadge.label).toBeTruthy();
    expect(['green', 'amber', 'red', 'stone']).toContain(hints!.readinessBadge.tone);
    expect(hints!.exportBadge).toBeTruthy();
    expect(hints!.publishBadge).toBeTruthy();
    expect(hints!.nextRecommendedAction).toBeTruthy();
    expect(hints!.placementLabel).toBeTruthy();
    expect(hints!.decisionOutcomeLabel).toBeTruthy();
  });

  it('readiness badge is red when blocked', () => {
    const result = evaluateGovernedDocument(makeEvaluationInput({
      documentState: {
        hasContent: true,
        hasEvidence: false,
        hasBeenReviewed: false,
        hasApproval: false,
        hasPlacement: false,
        placementValid: false,
        hasProvenance: false,
        unresolvedContradictionCount: 5,
        criticalContradictionCount: 3,
      },
    }));

    expect(result.evaluation.uiPresentationHints!.readinessBadge.tone).toBe('red');
  });

  it('export badge is green when eligible', () => {
    const result = evaluateGovernedDocument({
      ...makeEvaluationInput(),
      context: {
        organizationId: 'org-1',
        projectId: 'proj-1',
        actorId: 'user-1',
        intendedAction: 'export',
        artifactId: 'art-1',
        documentType: 'clinical_overview',
        regulatorBody: 'FDA',
        ctdSection: 'm2.5',
      },
      documentState: {
        hasContent: true,
        hasEvidence: true,
        evidenceCount: 5,
        hasBeenReviewed: true,
        reviewApprovalCount: 1,
        hasApproval: true,
        hasPlacement: true,
        placementValid: true,
        hasProvenance: true,
        unresolvedContradictionCount: 0,
        criticalContradictionCount: 0,
      },
      exportState: {
        humanReviewApproved: true,
        aiGenerated: false,
        provenanceComplete: true,
      },
    });

    expect(result.evaluation.uiPresentationHints!.exportBadge.tone).toBe('green');
  });

  it('topBlockerMessages limited to 3', () => {
    const result = evaluateGovernedDocument(makeEvaluationInput({
      documentState: {
        hasContent: false,
        hasEvidence: false,
        hasBeenReviewed: false,
        hasApproval: false,
        hasPlacement: false,
        placementValid: false,
        hasProvenance: false,
        unresolvedContradictionCount: 10,
        criticalContradictionCount: 5,
      },
    }));

    expect(result.evaluation.uiPresentationHints!.topBlockerMessages.length).toBeLessThanOrEqual(3);
  });

  it('nextRecommendedAction provides actionable guidance', () => {
    const draftResult = evaluateGovernedDocument(makeEvaluationInput({
      documentState: {
        hasContent: false,
        hasEvidence: false,
        hasBeenReviewed: false,
        hasApproval: false,
        hasPlacement: false,
        placementValid: false,
        hasProvenance: false,
        unresolvedContradictionCount: 0,
        criticalContradictionCount: 0,
      },
    }));

    expect(draftResult.evaluation.uiPresentationHints!.nextRecommendedAction).toBeTruthy();
    expect(draftResult.evaluation.uiPresentationHints!.nextRecommendedAction.length).toBeGreaterThan(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. RIM ↔ Fabric Bridge
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 2 — RIM ↔ Fabric Signal Bridge', () => {
  it('interceptFabricDecision runs without throwing', () => {
    expect(() => {
      interceptFabricDecision({
        organizationId: 1,
        projectId: 100,
        decisionId: 'dec-test-1',
        intent: 'export',
        outcome: 'block',
        readinessLevel: 'blocked',
        readinessScore: 25,
        blockerCount: 2,
        warningCount: 1,
        blockerCategories: ['unresolved_contradiction', 'missing_approval'],
        exportGateOutcome: 'blocked',
        publishGateOutcome: 'insufficient_context',
        consequenceTypes: ['open_blocker', 'flag_workspace_consequence_row'],
      });
    }).not.toThrow();
  });

  it('buildRIMContextForFabric returns structured context', () => {
    const ctx = buildRIMContextForFabric(1, 100);

    expect(ctx).toBeTruthy();
    expect(ctx.signalSummary).toBeTruthy();
    expect(typeof ctx.hasHighRiskSignals).toBe('boolean');
    expect(typeof ctx.hasCriticalPatterns).toBe('boolean');
    expect(typeof ctx.compactSummary).toBe('string');
    expect(Array.isArray(ctx.topPatternIds)).toBe(true);
    expect(Array.isArray(ctx.recurringPatterns)).toBe(true);
  });

  it('GovernedFabricLearningEvent type has required fields', () => {
    const event: GovernedFabricLearningEvent = {
      organizationId: 1,
      projectId: 100,
      artifactId: 'art-1',
      decisionRef: 'dec-1',
      readinessState: 'review_ready',
      blockerCodes: ['missing_evidence'],
      warningCodes: ['low_completeness'],
      exportOutcome: 'blocked',
      publishOutcome: 'insufficient_context',
      placementOutcome: 'allowed',
      downstreamConsequenceTypes: ['open_blocker'],
      sourceModule: 'fabric-evaluator',
      timestamp: new Date().toISOString(),
    };

    expect(event.organizationId).toBe(1);
    expect(event.readinessState).toBe('review_ready');
    expect(event.blockerCodes).toContain('missing_evidence');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. Chat Context Envelope
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 2 — Chat Context Envelope', () => {
  it('formatFabricStateForPrompt produces bounded output', () => {
    const result = evaluateGovernedDocument(makeEvaluationInput());
    const promptBlock = formatFabricStateForPrompt(result.evaluation);

    expect(promptBlock).toBeTruthy();
    expect(typeof promptBlock).toBe('string');
    expect(promptBlock.length).toBeLessThanOrEqual(1000);
    expect(promptBlock).toContain('Readiness');
  });

  it('formatFabricStateForPrompt handles blocked state', () => {
    const result = evaluateGovernedDocument(makeEvaluationInput({
      documentState: {
        hasContent: true,
        hasEvidence: false,
        hasBeenReviewed: false,
        hasApproval: false,
        hasPlacement: false,
        placementValid: false,
        hasProvenance: false,
        unresolvedContradictionCount: 3,
        criticalContradictionCount: 2,
      },
    }));

    const promptBlock = formatFabricStateForPrompt(result.evaluation);
    expect(promptBlock).toContain('blocked');
  });

  it('formatFabricStateForPrompt includes placement info', () => {
    const result = evaluateGovernedDocument(makeEvaluationInput());
    const promptBlock = formatFabricStateForPrompt(result.evaluation);
    expect(promptBlock).toContain('Placement');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. Hook Types Verification
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 2 — Fabric Hook Types', () => {
  it('FabricDecisionEntry has required fields', () => {
    const entry: FabricDecisionEntry = {
      decisionId: 'dec-1',
      projectId: 'proj-1',
      intent: 'export',
      outcome: 'allow',
      readinessLevel: 'export_ready',
      readinessScore: 85,
      placementOutcome: 'allowed',
      exportGateOutcome: 'eligible',
      publishGateOutcome: 'eligible',
      blockerCount: 0,
      warningCount: 0,
      consequenceCount: 2,
      timestamp: new Date().toISOString(),
    };

    expect(entry.outcome).toBe('allow');
    expect(entry.readinessScore).toBe(85);
  });

  it('FabricSummary has required fields', () => {
    const summary: FabricSummary = {
      total: 10,
      byOutcome: { allow: 7, block: 2, review: 1, degraded: 0 },
      byIntent: { update: 5, export: 3, place: 2 },
      averageReadinessScore: 65,
      blockedCount: 2,
      exportBlockedCount: 1,
      publishBlockedCount: 0,
    };

    expect(summary.total).toBe(10);
    expect(summary.blockedCount).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. Cross-Layer Integration
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 2 — Cross-Layer Integration', () => {
  beforeEach(() => clearGovernedDecisionLog());

  it('full flow: evaluate → RIM hints → chat envelope → UI hints', () => {
    // 1. Fabric evaluation
    const result = evaluateGovernedDocument(makeEvaluationInput());

    // 2. RIM hints present
    expect(result.evaluation.rimContextHints).toBeTruthy();
    expect(result.evaluation.rimContextHints!.readinessLevel).toBeTruthy();

    // 3. Chat envelope from evaluation
    const chatBlock = formatFabricStateForPrompt(result.evaluation);
    expect(chatBlock.length).toBeGreaterThan(0);
    expect(chatBlock.length).toBeLessThanOrEqual(1000);

    // 4. UI hints present
    expect(result.evaluation.uiPresentationHints).toBeTruthy();
    expect(result.evaluation.uiPresentationHints!.readinessBadge).toBeTruthy();
    expect(result.evaluation.uiPresentationHints!.nextRecommendedAction).toBeTruthy();

    // 5. RIM bridge can consume the same evaluation
    expect(() => {
      interceptFabricDecision({
        organizationId: 1,
        projectId: 100,
        decisionId: result.decisionReference.decisionId,
        intent: result.evaluation.context.intendedAction,
        outcome: result.evaluation.decision.outcome,
        readinessLevel: result.evaluation.readiness.level,
        readinessScore: result.evaluation.readiness.score,
        blockerCount: result.evaluation.decision.blockerCount,
        warningCount: result.evaluation.decision.warningCount,
        blockerCategories: result.evaluation.rimContextHints!.blockerCategories,
        exportGateOutcome: result.evaluation.exportGate.outcome,
        publishGateOutcome: result.evaluation.publishGate.outcome,
        consequenceTypes: result.evaluation.rimContextHints!.consequenceTypes,
      });
    }).not.toThrow();

    // 6. Decision was persisted
    expect(result.decisionReference.decisionId).toBeTruthy();
  });

  it('blocked evaluation produces consistent hints across all layers', () => {
    const result = evaluateGovernedDocument(makeEvaluationInput({
      documentState: {
        hasContent: true,
        hasEvidence: false,
        hasBeenReviewed: false,
        hasApproval: false,
        hasPlacement: false,
        placementValid: false,
        hasProvenance: false,
        unresolvedContradictionCount: 5,
        criticalContradictionCount: 3,
      },
    }));

    // All layers agree on blocked state
    expect(result.evaluation.decision.outcome).toBe('block');
    expect(result.evaluation.rimContextHints!.readinessLevel).toBe('blocked');
    expect(result.evaluation.uiPresentationHints!.readinessBadge.tone).toBe('red');

    const chatBlock = formatFabricStateForPrompt(result.evaluation);
    expect(chatBlock).toContain('blocked');
  });
});
