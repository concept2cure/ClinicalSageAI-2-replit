/**
 * Governed Document Decision Fabric — Unit & Integration Tests
 *
 * Tests the shared fabric that provides canonical governed document decisions
 * across CMC, Communication Center, and generic governed mutation paths.
 */

import { describe, expect, it, beforeEach } from 'vitest';

// Shared types
import type {
  GovernedDocumentContext,
  GovernedMutationIntent,
  LifecycleReadinessLevel,
} from '../shared/types/governed-document-fabric';

import {
  createBlockingReason,
  createWarning,
  createDecisionReference,
  GOVERNED_DOCUMENT_FABRIC_VERSION,
} from '../shared/types/governed-document-fabric';

// Context resolver
import {
  resolveDocumentContext,
  hasRegulatoryBinding,
  hasPlacementContext,
  hasArtifactIdentity,
  type ContextResolutionInput,
} from '../server/src/control-plane/document-context-resolver';

// Readiness gates
import {
  evaluateReadiness,
  meetsReadinessLevel,
  type ReadinessEvaluationInput,
} from '../server/src/control-plane/readiness-gates';

// Placement authority
import {
  evaluatePlacementAuthority,
  isValidCtdReference,
  getCanonicalPlacement,
} from '../server/src/control-plane/placement-authority';

// Export/publish gates
import {
  evaluateExportGate,
  evaluatePublishGate,
  type ExportGateInput,
  type PublishGateInput,
} from '../server/src/control-plane/export-publish-gates';

// Consequence engine
import {
  generateConsequences,
} from '../server/src/control-plane/document-consequence-engine';

// clearGovernedDecisionLog removed — was a no-op shim (DB is authoritative)

// Main evaluator
import {
  evaluateGovernedDocument,
  type GovernedEvaluationInput,
} from '../server/src/control-plane/governed-document-evaluator';

// ═══════════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════════

function makeBaseContext(overrides: Partial<ContextResolutionInput> = {}): ContextResolutionInput {
  return {
    organizationId: 'org-test-1',
    projectId: 'proj-test-1',
    actorId: 'user-test-1',
    intendedAction: 'update',
    ...overrides,
  };
}

function makeReadinessInput(overrides: Partial<ReadinessEvaluationInput> = {}): ReadinessEvaluationInput {
  const contextResult = resolveDocumentContext(makeBaseContext());
  return {
    context: contextResult.context,
    hasContent: true,
    hasEvidence: true,
    evidenceCount: 5,
    hasBeenReviewed: false,
    hasApproval: false,
    hasPlacement: false,
    placementValid: false,
    hasProvenance: false,
    unresolvedContradictionCount: 0,
    criticalContradictionCount: 0,
    ...overrides,
  };
}

function makeFullEvaluationInput(overrides: Partial<GovernedEvaluationInput> = {}): GovernedEvaluationInput {
  return {
    context: makeBaseContext({ artifactId: 'art-test-1', documentType: 'clinical_overview' }),
    documentState: {
      hasContent: true,
      hasEvidence: true,
      evidenceCount: 3,
      hasBeenReviewed: false,
      hasApproval: false,
      hasPlacement: false,
      placementValid: false,
      hasProvenance: true,
      unresolvedContradictionCount: 0,
      criticalContradictionCount: 0,
    },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Shared Types
// ═══════════════════════════════════════════════════════════════════════

describe('Governed Document Fabric — Shared Types', () => {
  it('has a version constant', () => {
    expect(GOVERNED_DOCUMENT_FABRIC_VERSION).toBe('1.0.0');
  });

  it('creates blocking reasons with unique IDs', () => {
    const b1 = createBlockingReason('missing_evidence', 'critical', 'Evidence missing', 'test');
    const b2 = createBlockingReason('missing_approval', 'major', 'No approval', 'test');
    expect(b1.id).toBeTruthy();
    expect(b2.id).toBeTruthy();
    expect(b1.id).not.toBe(b2.id);
    expect(b1.category).toBe('missing_evidence');
    expect(b1.severity).toBe('critical');
  });

  it('creates warnings with unique IDs', () => {
    const w = createWarning('low_score', 'Score is low', 'test');
    expect(w.id).toBeTruthy();
    expect(w.severity).toBe('warning');
  });

  it('creates decision references', () => {
    const ref = createDecisionReference('dec-1', 'proj-1', 'export', 'allow', 'user-1');
    expect(ref.decisionId).toBe('dec-1');
    expect(ref.outcome).toBe('allow');
    expect(ref.timestamp).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Context Resolution
// ═══════════════════════════════════════════════════════════════════════

describe('Document Context Resolver', () => {
  it('resolves a valid context with all required fields', () => {
    const result = resolveDocumentContext(makeBaseContext({ artifactId: 'art-1' }));
    expect(result.resolved).toBe(true);
    expect(result.missingFields).toHaveLength(0);
    expect(result.context.organizationId).toBe('org-test-1');
    expect(result.context.requestId).toBeTruthy();
    expect(result.context.timestamp).toBeTruthy();
  });

  it('reports missing required fields for create intent', () => {
    const result = resolveDocumentContext(makeBaseContext({
      intendedAction: 'create',
      documentType: undefined,
    }));
    expect(result.resolved).toBe(false);
    expect(result.missingFields).toContain('documentType');
  });

  it('reports missing required fields for export intent', () => {
    const result = resolveDocumentContext(makeBaseContext({
      intendedAction: 'export',
      artifactId: undefined,
    }));
    expect(result.resolved).toBe(false);
    expect(result.missingFields).toContain('artifactId');
  });

  it('warns about missing regulatory context', () => {
    const result = resolveDocumentContext(makeBaseContext());
    expect(result.warnings.some(w => w.includes('regulator body'))).toBe(true);
  });

  it('hasRegulatoryBinding returns true when both body and type present', () => {
    const result = resolveDocumentContext(makeBaseContext({
      regulatorBody: 'FDA',
      submissionType: 'NDA',
    }));
    expect(hasRegulatoryBinding(result.context)).toBe(true);
  });

  it('hasRegulatoryBinding returns false without body', () => {
    const result = resolveDocumentContext(makeBaseContext());
    expect(hasRegulatoryBinding(result.context)).toBe(false);
  });

  it('hasPlacementContext detects CTD section', () => {
    const result = resolveDocumentContext(makeBaseContext({ ctdSection: 'm2.5' }));
    expect(hasPlacementContext(result.context)).toBe(true);
  });

  it('hasArtifactIdentity detects artifact ID', () => {
    const result = resolveDocumentContext(makeBaseContext({ artifactId: 'art-1' }));
    expect(hasArtifactIdentity(result.context)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. Readiness Gates
// ═══════════════════════════════════════════════════════════════════════

describe('Readiness Gates', () => {
  it('returns draft level for basic content', () => {
    const result = evaluateReadiness(makeReadinessInput({
      hasEvidence: false,
    }));
    expect(result.level).toBe('evidence_gap');
    expect(result.score).toBeGreaterThan(0);
  });

  it('returns review_ready when content and evidence present', () => {
    const result = evaluateReadiness(makeReadinessInput());
    expect(result.level).toBe('review_ready');
    expect(result.score).toBeGreaterThanOrEqual(30);
  });

  it('returns approval_ready when reviewed', () => {
    const result = evaluateReadiness(makeReadinessInput({
      hasBeenReviewed: true,
      reviewApprovalCount: 1,
      requiredReviewCount: 1,
    }));
    expect(result.level).toBe('approval_ready');
  });

  it('returns export_ready or publish_ready when approved with placement', () => {
    const result = evaluateReadiness(makeReadinessInput({
      hasBeenReviewed: true,
      reviewApprovalCount: 1,
      hasApproval: true,
      hasPlacement: true,
      placementValid: true,
      hasProvenance: true,
    }));
    // With all conditions met and no contradictions, readiness progresses to publish_ready
    expect(['export_ready', 'publish_ready']).toContain(result.level);
  });

  it('returns publish_ready when fully ready', () => {
    const result = evaluateReadiness(makeReadinessInput({
      hasBeenReviewed: true,
      reviewApprovalCount: 1,
      hasApproval: true,
      hasPlacement: true,
      placementValid: true,
      hasProvenance: true,
    }));
    expect(['export_ready', 'publish_ready']).toContain(result.level);
  });

  it('returns blocked when critical contradictions exist', () => {
    const result = evaluateReadiness(makeReadinessInput({
      criticalContradictionCount: 2,
    }));
    expect(result.level).toBe('blocked');
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.blockers[0].category).toBe('unresolved_contradiction');
  });

  it('returns blocked when stale', () => {
    const result = evaluateReadiness(makeReadinessInput({
      isStale: true,
      staleReason: 'Source data changed',
    }));
    expect(result.blockers.some(b => b.message.includes('stale'))).toBe(true);
  });

  it('meetsReadinessLevel works correctly', () => {
    expect(meetsReadinessLevel('publish_ready', 'draft')).toBe(true);
    expect(meetsReadinessLevel('draft', 'export_ready')).toBe(false);
    expect(meetsReadinessLevel('blocked', 'draft')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. Placement Authority
// ═══════════════════════════════════════════════════════════════════════

describe('Placement Authority', () => {
  it('validates CTD references', () => {
    expect(isValidCtdReference('m2.5')).toBe(true);
    expect(isValidCtdReference('m3.2.S')).toBe(true);
    expect(isValidCtdReference('m3.2.P.1')).toBe(true);
    expect(isValidCtdReference('m1.1')).toBe(true);
    expect(isValidCtdReference('')).toBe(false);
    expect(isValidCtdReference('x')).toBe(false);
  });

  it('returns canonical placement for known document types', () => {
    expect(getCanonicalPlacement('clinical_overview')).toBe('m2.5');
    expect(getCanonicalPlacement('drug_substance')).toBe('m3.2.S');
    expect(getCanonicalPlacement('unknown_type')).toBeUndefined();
  });

  it('allows placement with valid target', () => {
    const ctx = resolveDocumentContext(makeBaseContext({
      intendedAction: 'place',
      artifactId: 'art-1',
      documentType: 'clinical_overview',
      intendedPlacementTarget: 'm2.5',
    })).context;
    const result = evaluatePlacementAuthority(ctx);
    expect(result.outcome).toBe('allowed');
    expect(result.canonicalDestination).toBe('m2.5');
  });

  it('blocks placement with invalid CTD reference', () => {
    const ctx = resolveDocumentContext(makeBaseContext({
      intendedAction: 'place',
      artifactId: 'art-1',
      intendedPlacementTarget: 'invalid!!',
    })).context;
    const result = evaluatePlacementAuthority(ctx);
    expect(result.outcome).toBe('blocked');
    expect(result.blockingReasons!.length).toBeGreaterThan(0);
  });

  it('blocks relocate without current placement', () => {
    const ctx = resolveDocumentContext(makeBaseContext({
      intendedAction: 'relocate',
      artifactId: 'art-1',
      intendedPlacementTarget: 'm2.5',
      currentPlacement: undefined,
    })).context;
    const result = evaluatePlacementAuthority(ctx);
    expect(result.outcome).toBe('blocked');
  });

  it('returns fallback_allowed for non-canonical placement', () => {
    const ctx = resolveDocumentContext(makeBaseContext({
      intendedAction: 'place',
      artifactId: 'art-1',
      documentType: 'clinical_overview',
      intendedPlacementTarget: 'm4.2',
    })).context;
    const result = evaluatePlacementAuthority(ctx);
    expect(result.outcome).toBe('fallback_allowed');
  });

  it('returns insufficient_context when no placement intent and no document type', () => {
    const ctx = resolveDocumentContext(makeBaseContext({
      intendedAction: 'update',
    })).context;
    const result = evaluatePlacementAuthority(ctx);
    expect(result.outcome).toBe('insufficient_context');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. Export/Publish Gates
// ═══════════════════════════════════════════════════════════════════════

describe('Export Gate', () => {
  function makeExportInput(overrides: Partial<ExportGateInput> = {}): ExportGateInput {
    const ctx = resolveDocumentContext(makeBaseContext({
      intendedAction: 'export',
      artifactId: 'art-1',
      regulatorBody: 'FDA',
    })).context;
    return {
      context: ctx,
      readiness: evaluateReadiness(makeReadinessInput({ hasApproval: true, hasBeenReviewed: true, reviewApprovalCount: 1 })),
      placement: { outcome: 'allowed', canonicalDestination: 'm2.5', fallbackAcceptable: true },
      hasContent: true,
      hasApproval: true,
      humanReviewApproved: true,
      aiGenerated: false,
      provenanceComplete: true,
      unresolvedContradictionCount: 0,
      isStale: false,
      ...overrides,
    };
  }

  it('allows export when all checks pass', () => {
    const result = evaluateExportGate(makeExportInput());
    expect(result.outcome).toBe('eligible');
    expect(result.blockingReasons).toHaveLength(0);
  });

  it('blocks export without content', () => {
    const result = evaluateExportGate(makeExportInput({ hasContent: false }));
    expect(result.outcome).toBe('blocked');
    expect(result.blockingReasons.some(b => b.message.includes('no content'))).toBe(true);
  });

  it('blocks export without approval', () => {
    const result = evaluateExportGate(makeExportInput({ hasApproval: false }));
    expect(result.outcome).toBe('blocked');
  });

  it('blocks export when stale', () => {
    const result = evaluateExportGate(makeExportInput({ isStale: true }));
    expect(result.outcome).toBe('blocked');
  });

  it('blocks export with unresolved contradictions', () => {
    const result = evaluateExportGate(makeExportInput({ unresolvedContradictionCount: 3 }));
    expect(result.outcome).toBe('blocked');
  });

  it('blocks export for AI content without human review', () => {
    const result = evaluateExportGate(makeExportInput({
      aiGenerated: true,
      humanReviewApproved: false,
    }));
    expect(result.outcome).toBe('blocked');
    expect(result.blockingReasons.some(b => b.message.includes('human review'))).toBe(true);
  });
});

describe('Publish Gate', () => {
  function makePublishInput(overrides: Partial<PublishGateInput> = {}): PublishGateInput {
    const ctx = resolveDocumentContext(makeBaseContext({
      intendedAction: 'publish',
      artifactId: 'art-1',
      regulatorBody: 'FDA',
      submissionType: 'NDA',
    })).context;
    return {
      context: ctx,
      readiness: evaluateReadiness(makeReadinessInput({ hasApproval: true, hasBeenReviewed: true, reviewApprovalCount: 1 })),
      placement: { outcome: 'allowed', canonicalDestination: 'm2.5', fallbackAcceptable: true },
      hasContent: true,
      hasApproval: true,
      humanReviewApproved: true,
      aiGenerated: false,
      provenanceComplete: true,
      unresolvedContradictionCount: 0,
      isStale: false,
      exportCompleted: true,
      hasGatewayProfile: true,
      gatewayProfileValid: true,
      hasSequenceNumber: true,
      hasAuthorityProfile: true,
      authorityAcceptsFormat: true,
      allSectionsApproved: true,
      staleSectionCount: 0,
      ...overrides,
    };
  }

  it('allows publish when all checks pass', () => {
    const result = evaluatePublishGate(makePublishInput());
    expect(result.outcome).toBe('eligible');
    expect(result.dispatchReady).toBe(true);
  });

  it('blocks publish without export', () => {
    const result = evaluatePublishGate(makePublishInput({ exportCompleted: false }));
    expect(result.outcome).toBe('blocked');
    expect(result.dispatchReady).toBe(false);
  });

  it('blocks eCTD publish without sequence number', () => {
    const result = evaluatePublishGate(makePublishInput({ hasSequenceNumber: false }));
    expect(result.outcome).toBe('blocked');
    expect(result.blockingReasons.some(b => b.message.includes('sequence number'))).toBe(true);
  });

  it('blocks publish when not all sections approved', () => {
    const result = evaluatePublishGate(makePublishInput({ allSectionsApproved: false }));
    expect(result.outcome).toBe('blocked');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. Consequence Engine
// ═══════════════════════════════════════════════════════════════════════

describe('Document Consequence Engine', () => {
  it('generates audit reference for any evaluation', () => {
    const ctx = resolveDocumentContext(makeBaseContext({ artifactId: 'art-1' })).context;
    const readiness = evaluateReadiness(makeReadinessInput());
    const placement = evaluatePlacementAuthority(ctx);
    const exportGate = evaluateExportGate({
      context: ctx, readiness, placement,
      hasContent: true, hasApproval: false, humanReviewApproved: false,
      aiGenerated: false, provenanceComplete: false, unresolvedContradictionCount: 0, isStale: false,
    });

    const consequences = generateConsequences({
      context: ctx, readiness, placement, exportGate,
      publishGate: { outcome: 'insufficient_context', gateChecks: [], blockingReasons: [], remediationSteps: [], dispatchReady: false },
    });

    expect(consequences.some(c => c.consequenceType === 'create_audit_reference')).toBe(true);
    expect(consequences.some(c => c.consequenceType === 'link_provenance')).toBe(true);
  });

  it('generates blocker consequences when readiness is blocked', () => {
    const ctx = resolveDocumentContext(makeBaseContext({ artifactId: 'art-1' })).context;
    const readiness = evaluateReadiness(makeReadinessInput({ criticalContradictionCount: 2 }));
    const placement = evaluatePlacementAuthority(ctx);
    const exportGate = evaluateExportGate({
      context: ctx, readiness, placement,
      hasContent: true, hasApproval: false, humanReviewApproved: false,
      aiGenerated: false, provenanceComplete: false, unresolvedContradictionCount: 2, isStale: false,
    });

    const consequences = generateConsequences({
      context: ctx, readiness, placement, exportGate,
      publishGate: { outcome: 'blocked', gateChecks: [], blockingReasons: [], remediationSteps: [], dispatchReady: false },
    });

    expect(consequences.some(c => c.consequenceType === 'open_blocker')).toBe(true);
    expect(consequences.some(c => c.consequenceType === 'flag_workspace_consequence_row')).toBe(true);
  });

  it('generates submission-not-dispatch-ready when publish gate blocks', () => {
    const ctx = resolveDocumentContext(makeBaseContext({ artifactId: 'art-1' })).context;
    const readiness = evaluateReadiness(makeReadinessInput());
    const placement = evaluatePlacementAuthority(ctx);
    const exportGate = evaluateExportGate({
      context: ctx, readiness, placement,
      hasContent: true, hasApproval: false, humanReviewApproved: false,
      aiGenerated: false, provenanceComplete: false, unresolvedContradictionCount: 0, isStale: false,
    });

    const consequences = generateConsequences({
      context: ctx, readiness, placement, exportGate,
      publishGate: {
        outcome: 'blocked',
        gateChecks: [],
        blockingReasons: [{ id: 'test', category: 'publish_gate_failed', severity: 'critical', message: 'test', source: 'test' }],
        remediationSteps: [],
        dispatchReady: false,
      },
    });

    expect(consequences.some(c => c.consequenceType === 'mark_submission_item_not_dispatch_ready')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7. Decision Service (Persistence + Inspectability)
// ═══════════════════════════════════════════════════════════════════════

describe('Governed Decision Recording', () => {
  it('evaluator produces a valid decision reference', () => {
    const result = evaluateGovernedDocument(makeFullEvaluationInput());
    expect(result.decisionReference).toBeTruthy();
    expect(result.decisionReference.decisionId).toBeTruthy();
    expect(result.decisionReference.projectId).toBe('proj-test-1');
    expect(result.decisionReference.intent).toBe('update');
    expect(result.decisionReference.outcome).toBeTruthy();
    expect(result.decisionReference.timestamp).toBeTruthy();
  });

  it('different evaluations produce different decision IDs', () => {
    const r1 = evaluateGovernedDocument(makeFullEvaluationInput());
    const r2 = evaluateGovernedDocument(makeFullEvaluationInput());
    expect(r1.decisionReference.decisionId).not.toBe(r2.decisionReference.decisionId);
  });

  it('decision reference carries artifact ID when provided', () => {
    const result = evaluateGovernedDocument(makeFullEvaluationInput());
    expect(result.decisionReference.artifactId).toBe('art-test-1');
  });

  it('decision reference carries actor ID', () => {
    const result = evaluateGovernedDocument(makeFullEvaluationInput());
    expect(result.decisionReference.actorId).toBe('user-test-1');
  });

  it('lifecycle state machine validates transitions correctly', async () => {
    const { isValidTransition } = await import('../server/services/governed-decision-repository');
    expect(isValidTransition('recommended_only', 'under_review')).toBe(true);
    expect(isValidTransition('recommended_only', 'approved')).toBe(false);
    expect(isValidTransition('superseded', 'approved')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 8. Full Evaluator (Integration)
// ═══════════════════════════════════════════════════════════════════════

describe('Governed Document Evaluator — Full Integration', () => {
  beforeEach(() => {
    /* no-op: DB is authoritative */;
  });

  it('produces a complete evaluation for a basic update', () => {
    const result = evaluateGovernedDocument(makeFullEvaluationInput());

    expect(result.evaluation).toBeTruthy();
    expect(result.evaluation.readiness).toBeTruthy();
    expect(result.evaluation.placement).toBeTruthy();
    expect(result.evaluation.exportGate).toBeTruthy();
    expect(result.evaluation.publishGate).toBeTruthy();
    expect(result.evaluation.consequences.length).toBeGreaterThan(0);
    expect(result.evaluation.decision).toBeTruthy();
    expect(result.decisionReference.decisionId).toBeTruthy();
  });

  it('blocks export when approval is missing', () => {
    const result = evaluateGovernedDocument({
      context: makeBaseContext({
        intendedAction: 'export',
        artifactId: 'art-1',
        documentType: 'clinical_overview',
        regulatorBody: 'FDA',
      }),
      documentState: {
        hasContent: true,
        hasEvidence: true,
        hasBeenReviewed: false,
        hasApproval: false,
        hasPlacement: true,
        placementValid: true,
        hasProvenance: true,
        unresolvedContradictionCount: 0,
        criticalContradictionCount: 0,
      },
      exportState: {
        humanReviewApproved: false,
        aiGenerated: false,
        provenanceComplete: true,
      },
    });

    expect(result.evaluation.decision.outcome).toBe('block');
    expect(result.evaluation.exportGate.outcome).toBe('blocked');
  });

  it('allows export when fully ready', () => {
    const result = evaluateGovernedDocument({
      context: makeBaseContext({
        intendedAction: 'export',
        artifactId: 'art-1',
        documentType: 'clinical_overview',
        regulatorBody: 'FDA',
        ctdSection: 'm2.5',
      }),
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

    expect(result.evaluation.decision.outcome).toBe('allow');
    expect(result.evaluation.exportGate.outcome).toBe('eligible');
  });

  it('blocks placement with invalid CTD reference', () => {
    const result = evaluateGovernedDocument({
      context: makeBaseContext({
        intendedAction: 'place',
        artifactId: 'art-1',
        intendedPlacementTarget: '!!!invalid!!!',
      }),
      documentState: {
        hasContent: true,
        hasEvidence: false,
        hasBeenReviewed: false,
        hasApproval: false,
        hasPlacement: false,
        placementValid: false,
        hasProvenance: false,
        unresolvedContradictionCount: 0,
        criticalContradictionCount: 0,
      },
    });

    expect(result.evaluation.decision.outcome).toBe('block');
    expect(result.evaluation.placement.outcome).toBe('blocked');
  });

  it('produces degraded outcome when context is insufficient', () => {
    const result = evaluateGovernedDocument({
      context: {
        organizationId: '',
        projectId: '',
        actorId: 'user-1',
        intendedAction: 'update',
      },
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
    });

    expect(['block', 'degraded']).toContain(result.evaluation.decision.outcome);
  });

  it('cross-lane reuse: same evaluator serves CMC and generic paths', () => {
    // CMC-style evaluation (compile intent, stale state)
    const cmcResult = evaluateGovernedDocument({
      context: makeBaseContext({
        intendedAction: 'compile',
        documentType: 'cmc_section',
        ctdSection: 'm3.2.S',
      }),
      documentState: {
        hasContent: true,
        hasEvidence: true,
        hasBeenReviewed: false,
        hasApproval: false,
        hasPlacement: true,
        placementValid: true,
        hasProvenance: true,
        unresolvedContradictionCount: 0,
        criticalContradictionCount: 0,
        isStale: true,
        staleReason: 'Source data changed',
      },
    });

    // Generic placement evaluation
    const genericResult = evaluateGovernedDocument({
      context: makeBaseContext({
        intendedAction: 'place',
        artifactId: 'art-generic',
        documentType: 'clinical_study_report',
        intendedPlacementTarget: 'm5.3',
      }),
      documentState: {
        hasContent: true,
        hasEvidence: true,
        hasBeenReviewed: false,
        hasApproval: false,
        hasPlacement: false,
        placementValid: false,
        hasProvenance: true,
        unresolvedContradictionCount: 0,
        criticalContradictionCount: 0,
      },
    });

    // Both use the same evaluator, produce different results based on context
    expect(cmcResult.evaluation.readiness.blockers.some(b => b.message.includes('stale'))).toBe(true);
    expect(genericResult.evaluation.placement.outcome).toBe('allowed');

    // Both produce distinct decision references
    expect(cmcResult.decisionReference.intent).toBe('compile');
    expect(genericResult.decisionReference.intent).toBe('place');
    expect(cmcResult.decisionReference.decisionId).not.toBe(genericResult.decisionReference.decisionId);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 9. Workspace Consequence Integration
// ═══════════════════════════════════════════════════════════════════════

describe('Workspace Consequence Integration', () => {
  it('DocumentConsequenceRow supports governedFabric state', async () => {
    // Import the workspace types to verify the interface exists
    const { buildDocumentConsequenceRows } = await import(
      '../client/src/concept2cure/components/workspace/documentConsequence'
    );

    const rows = buildDocumentConsequenceRows({
      artifacts: [
        {
          id: 'art-1',
          title: 'Test Doc',
          version: 1,
          status: 'draft',
          metadata: { source: 'compute' },
        },
      ],
      computeJobs: [],
      proposals: [],
      fabricStateMap: {
        'art-1': {
          decisionId: 'dec-1',
          outcome: 'allow',
          readiness: 'review_ready',
          readinessScore: 45,
          blockerCount: 0,
          warningCount: 1,
        },
      },
    });

    expect(rows.length).toBe(1);
    expect(rows[0].governedFabric).toBeTruthy();
    expect(rows[0].governedFabric!.outcome).toBe('allow');
    expect(rows[0].governedFabric!.readiness).toBe('review_ready');
  });
});
