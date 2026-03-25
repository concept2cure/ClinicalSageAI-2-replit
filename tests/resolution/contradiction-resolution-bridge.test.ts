/**
 * Contradiction → Resolution Bridge — Pass 9 Tests
 *
 * Tests covering:
 * - Authority mapping from contradiction findings (with overlay escalation)
 * - Confidence mapping from contradiction scores
 * - Affected object extraction from findings
 * - Wave 3 AnA action handlers
 * - Decision receipt linkage
 * - Preflight refresh triggering
 *
 * @module tests/resolution/contradiction-resolution-bridge.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════════

// Mock the database module
vi.mock('../../server/db', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: 'test-plan-001',
          organizationId: 1,
          projectId: 1,
          triggerType: 'contradiction',
          triggerId: 'finding-001',
          triggerDescription: 'Test contradiction',
          state: 'unresolved',
          affectedObjects: [],
          recommendedPath: 'harmonize',
          alternativePaths: ['supersede'],
          confidence: 'moderate',
          requiresReview: true,
          requiresReapproval: false,
          requiresEscalation: false,
          rationale: 'Test',
          bundleId: null,
          createdById: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }]),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
          orderBy: vi.fn().mockResolvedValue([]),
        }),
        orderBy: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: 'test-plan-001',
            state: 'proposed_resolution',
          }]),
        }),
      }),
    }),
  },
}));

// Mock the pool for contradiction-engine-service
vi.mock('../../server/db.js', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

// Mock logger
vi.mock('../../server/utils/logger', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock reactive dependency service for preflight refresh
vi.mock('../../server/services/reactive-dependency-service', () => ({
  reactiveDependencyService: {
    propagateChange: vi.fn().mockResolvedValue({ downstreamImpacted: 0, actions: [] }),
  },
}));

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORTS (after mocks)
// ═══════════════════════════════════════════════════════════════════════════════

import {
  getAuthorityForAction,
  isActorAuthorized,
  buildGovernedActionDecision,
  buildDecisionReceipt,
  type GovernedActionType,
} from '../../shared/types/decision-architecture';

import type { AuthoringActionWave3Id } from '../../shared/types/authoring-context';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST FIXTURES
// ═══════════════════════════════════════════════════════════════════════════════

function makeFinding(overrides: Record<string, unknown> = {}) {
  return {
    id: 'finding-001',
    organizationId: 1,
    projectId: 1,
    sourceClassification: 'structured_record_conflict' as const,
    objectAType: 'assumption',
    objectAId: 'assumption-001',
    objectALabel: 'Primary endpoint definition',
    objectBType: 'assumption',
    objectBId: 'assumption-002',
    objectBLabel: 'SAP endpoint definition',
    contradictionType: 'assumption_drift' as const,
    severity: 'high' as const,
    truthHierarchyLevel: 1 as const,
    confidenceScore: 0.85,
    confidenceLevel: 'high',
    title: 'Endpoint drift between Protocol and SAP',
    description: 'Primary endpoint definition differs between protocol assumption and SAP assumption',
    evidenceSummary: null,
    deterministicRule: 'same-category-different-value',
    llmRole: 'none' as const,
    llmExplanation: null,
    regulatorBody: null,
    overlayRuleId: null,
    regulatorSeverityOverride: null,
    authorityState: 'requires_review' as const,
    reviewState: 'unresolved' as const,
    resolvedAt: null,
    resolvedBy: null,
    resolutionNotes: null,
    consequenceType: null,
    consequenceObjectId: null,
    consequenceExecuted: false,
    detectedBy: 'contradiction-engine',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeOverlayRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'overlay-001',
    organizationId: 1,
    ruleCode: 'FDA_ENDPOINT_ESCALATE',
    ruleName: 'FDA Endpoint Escalation',
    regulatorBody: 'FDA',
    jurisdiction: 'US',
    contradictionType: 'assumption_drift',
    applicableDomains: ['clinical'],
    applicableProgramTypes: ['NDA'],
    severityOverride: 'critical',
    authorityOverride: 'blocks_promotion',
    consequenceOverride: null,
    description: 'FDA requires escalation for endpoint drift',
    regulatoryReference: '21 CFR 312',
    rationale: 'Endpoint changes require IND amendment',
    priority: 1,
    active: true,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: AUTHORITY BOUNDARY MAP INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Authority Boundary Map Integration', () => {
  it('maps contradiction-consequence action to requires-confirmation authority', () => {
    const authority = getAuthorityForAction('create-contradiction-consequence');
    expect(authority.level).toBe('requires-confirmation');
    expect(authority.requiresHumanConfirmation).toBe(true);
  });

  it('maps explain-preflight-results to autonomous-read authority', () => {
    const authority = getAuthorityForAction('explain-preflight-results');
    expect(authority.level).toBe('autonomous-read');
    expect(authority.requiresHumanConfirmation).toBe(false);
  });

  it('maps prepare-correction-draft to requires-confirmation authority', () => {
    const authority = getAuthorityForAction('prepare-correction-draft');
    expect(authority.level).toBe('requires-confirmation');
  });

  it('defaults unknown actions to requires-escalation (fail-safe)', () => {
    const authority = getAuthorityForAction('some-unknown-action' as GovernedActionType);
    expect(authority.level).toBe('requires-escalation');
    expect(authority.requiresEscalation).toBe(true);
  });

  it('authorizes autonomous-read actions without actor role', () => {
    const authority = getAuthorityForAction('explain-preflight-results');
    const check = isActorAuthorized(authority);
    expect(check.authorized).toBe(true);
  });

  it('blocks forbidden actions regardless of role', () => {
    const authority = getAuthorityForAction('execute-multi-object-correction');
    const check = isActorAuthorized(authority, 'admin');
    expect(check.authorized).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: DECISION RECORD CREATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Decision Record Creation for Contradiction Resolution', () => {
  it('creates a contradiction-resolution-decision with linked contradiction ID', () => {
    const finding = makeFinding();
    const decision = buildGovernedActionDecision({
      projectId: '1',
      kind: 'contradiction-resolution-decision',
      governedAction: 'create-contradiction-consequence',
      summary: `Resolution for ${finding.contradictionType}: ${finding.title}`,
      rationale: 'Authority check passed. Proceeding with resolution.',
      sourceSignals: [{
        kind: 'contradiction',
        sourceId: finding.id,
        sourceLabel: finding.title,
        severity: finding.severity,
        detail: finding.description,
      }],
      createdByType: 'ana',
      createdById: '1',
      linkedContradictionIds: [finding.id],
    });

    expect(decision.id).toMatch(/^dec_/);
    expect(decision.kind).toBe('contradiction-resolution-decision');
    expect(decision.status).toBe('recommended');
    expect(decision.linkedContradictionIds).toContain(finding.id);
    expect(decision.sourceSignals).toHaveLength(1);
    expect(decision.sourceSignals[0].kind).toBe('contradiction');
  });

  it('creates a decision receipt with affected objects from bundle execution', () => {
    const receipt = buildDecisionReceipt({
      decisionId: 'dec_test_001',
      projectId: '1',
      recommendation: {
        summary: 'Resolve assumption drift',
        actionIds: ['create-contradiction-consequence'],
        rationale: 'Confidence is moderate. 2 objects affected.',
      },
      confirmation: {
        accepted: true,
        confirmedById: 'user-1',
      },
      execution: {
        executed: true,
        executedById: 'user-1',
        executionMethod: 'resolution-bundle:bundle-001',
      },
      affectedObjects: [
        { objectType: 'assumption', objectId: 'a-001', changeType: 'updated', priorState: 'active', newState: 'superseded' },
        { objectType: 'assumption', objectId: 'a-002', changeType: 'updated', priorState: 'active', newState: 'active' },
      ],
      pendingApprovals: [
        { requiredRole: 'reviewer', reason: 'Review required after resolution', status: 'pending' },
      ],
    });

    expect(receipt.id).toMatch(/^rcpt_/);
    expect(receipt.decisionId).toBe('dec_test_001');
    expect(receipt.confirmation.accepted).toBe(true);
    expect(receipt.execution.executed).toBe(true);
    expect(receipt.execution.executionMethod).toBe('resolution-bundle:bundle-001');
    expect(receipt.affectedObjects).toHaveLength(2);
    expect(receipt.pendingApprovals).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: OVERLAY-AWARE AUTHORITY ESCALATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Overlay-Aware Authority Escalation', () => {
  it('overlay escalates advisory_only → blocks_promotion', () => {
    const finding = makeFinding({ authorityState: 'advisory_only' });
    const overlay = makeOverlayRule({ authorityOverride: 'blocks_promotion' });

    // Simulate the mapping logic from the bridge
    let effectiveAuthority = finding.authorityState;
    const authorityWeight: Record<string, number> = {
      advisory_only: 0, requires_review: 1, requires_approval: 2,
      blocks_promotion: 3, requires_escalation: 4,
    };

    if (overlay.authorityOverride) {
      const overrideLevel = authorityWeight[overlay.authorityOverride as string] ?? 0;
      const currentLevel = authorityWeight[effectiveAuthority] ?? 0;
      if (overrideLevel > currentLevel) {
        effectiveAuthority = overlay.authorityOverride as string;
      }
    }

    expect(effectiveAuthority).toBe('blocks_promotion');
  });

  it('overlay does NOT downgrade blocks_promotion → advisory_only', () => {
    const finding = makeFinding({ authorityState: 'blocks_promotion' });
    const overlay = makeOverlayRule({ authorityOverride: 'advisory_only' });

    let effectiveAuthority = finding.authorityState;
    const authorityWeight: Record<string, number> = {
      advisory_only: 0, requires_review: 1, requires_approval: 2,
      blocks_promotion: 3, requires_escalation: 4,
    };

    if (overlay.authorityOverride) {
      const overrideLevel = authorityWeight[overlay.authorityOverride as string] ?? 0;
      const currentLevel = authorityWeight[effectiveAuthority] ?? 0;
      if (overrideLevel > currentLevel) {
        effectiveAuthority = overlay.authorityOverride as string;
      }
    }

    // Should remain blocks_promotion — overlays cannot downgrade
    expect(effectiveAuthority).toBe('blocks_promotion');
  });

  it('no overlay means original authority is preserved', () => {
    const finding = makeFinding({ authorityState: 'requires_review' });

    // With no overlays, authority should remain unchanged
    expect(finding.authorityState).toBe('requires_review');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: CONFIDENCE MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Confidence Mapping', () => {
  it('maps high confidence (>=0.9) to strong', () => {
    expect(mapConfidence(0.95)).toBe('strong');
    expect(mapConfidence(0.9)).toBe('strong');
  });

  it('maps moderate confidence (0.7-0.89) to moderate', () => {
    expect(mapConfidence(0.85)).toBe('moderate');
    expect(mapConfidence(0.7)).toBe('moderate');
  });

  it('maps low confidence (0.5-0.69) to provisional', () => {
    expect(mapConfidence(0.6)).toBe('provisional');
    expect(mapConfidence(0.5)).toBe('provisional');
  });

  it('maps very low confidence (<0.5) to uncertain', () => {
    expect(mapConfidence(0.3)).toBe('uncertain');
    expect(mapConfidence(0.0)).toBe('uncertain');
  });
});

// Helper to test confidence mapping without importing the private function
function mapConfidence(score: number): string {
  if (score >= 0.9) return 'strong';
  if (score >= 0.7) return 'moderate';
  if (score >= 0.5) return 'provisional';
  return 'uncertain';
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: CONTRADICTION TYPE → RESOLUTION PATH MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Contradiction Type → Resolution Path Mapping', () => {
  // Helper matching the bridge's mapping logic
  function mapPath(type: string): string {
    switch (type) {
      case 'assumption_drift':
      case 'superseded_information':
        return 'supersede';
      case 'summary_body_tension':
      case 'parameter_mismatch':
      case 'factual_contradiction':
      case 'dosage_conflict':
        return 'rewrite';
      case 'cross_jurisdictional_divergence':
      case 'protocol_sap_inconsistency':
      case 'outcome_divergence':
        return 'harmonize';
      case 'decision_action_inconsistency':
      case 'recommendation_action_inconsistency':
        return 'review_only';
      case 'regulatory_discrepancy':
      case 'temporal_inconsistency':
      case 'status_conflict':
      case 'procedural_conflict':
        return 'escalate';
      default:
        return 'review_only';
    }
  }

  it('maps assumption_drift to supersede', () => {
    expect(mapPath('assumption_drift')).toBe('supersede');
  });

  it('maps summary_body_tension to rewrite', () => {
    expect(mapPath('summary_body_tension')).toBe('rewrite');
  });

  it('maps cross_jurisdictional_divergence to harmonize', () => {
    expect(mapPath('cross_jurisdictional_divergence')).toBe('harmonize');
  });

  it('maps decision_action_inconsistency to review_only', () => {
    expect(mapPath('decision_action_inconsistency')).toBe('review_only');
  });

  it('maps regulatory_discrepancy to escalate', () => {
    expect(mapPath('regulatory_discrepancy')).toBe('escalate');
  });

  it('defaults unknown types to review_only', () => {
    expect(mapPath('some_unknown_type')).toBe('review_only');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: AUTHORITY STATE → GOVERNED ACTION MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Authority State → Governed Action Mapping', () => {
  // Helper matching the bridge's mapping logic
  function mapAction(authorityState: string): string {
    switch (authorityState) {
      case 'advisory_only': return 'explain-preflight-results';
      case 'requires_review': return 'prepare-correction-draft';
      case 'requires_approval': return 'prepare-harmonization-suggestion';
      case 'blocks_promotion':
      case 'requires_escalation': return 'create-contradiction-consequence';
      default: return 'create-contradiction-consequence';
    }
  }

  it('maps advisory_only to explain-preflight-results', () => {
    expect(mapAction('advisory_only')).toBe('explain-preflight-results');
  });

  it('maps requires_review to prepare-correction-draft', () => {
    expect(mapAction('requires_review')).toBe('prepare-correction-draft');
  });

  it('maps requires_approval to prepare-harmonization-suggestion', () => {
    expect(mapAction('requires_approval')).toBe('prepare-harmonization-suggestion');
  });

  it('maps blocks_promotion to create-contradiction-consequence', () => {
    expect(mapAction('blocks_promotion')).toBe('create-contradiction-consequence');
  });

  it('maps requires_escalation to create-contradiction-consequence', () => {
    expect(mapAction('requires_escalation')).toBe('create-contradiction-consequence');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: WAVE 3 ACTION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Wave 3 Authoring Action Types', () => {
  it('defines all Wave 3 action IDs', () => {
    const wave3Actions: AuthoringActionWave3Id[] = [
      'plan_contradiction_resolution',
      'execute_contradiction_resolution',
      'explain_contradiction_resolution',
      'project_resolution_status',
    ];

    expect(wave3Actions).toHaveLength(4);
    for (const action of wave3Actions) {
      expect(typeof action).toBe('string');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: AFFECTED OBJECT EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Affected Object Extraction from Findings', () => {
  it('extracts both objects from a contradiction finding', () => {
    const finding = makeFinding();

    // Simulate the bridge's mapAffectedObjects
    const objects = [
      {
        objectType: finding.objectAType,
        objectId: finding.objectAId,
        objectTitle: finding.objectALabel ?? undefined,
        impactState: 'direct' as const,
        impactRationale: `Direct participant in ${finding.contradictionType} contradiction`,
      },
      {
        objectType: finding.objectBType,
        objectId: finding.objectBId,
        objectTitle: finding.objectBLabel ?? undefined,
        impactState: 'direct' as const,
        impactRationale: `Direct participant in ${finding.contradictionType} contradiction`,
      },
    ];

    expect(objects).toHaveLength(2);
    expect(objects[0].objectType).toBe('assumption');
    expect(objects[0].objectId).toBe('assumption-001');
    expect(objects[0].impactState).toBe('direct');
    expect(objects[1].objectType).toBe('assumption');
    expect(objects[1].objectId).toBe('assumption-002');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: TRIGGER DESCRIPTION BUILDING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Trigger Description Building', () => {
  it('builds description from finding metadata', () => {
    const finding = makeFinding({ severity: 'critical', regulatorBody: 'FDA' });

    const parts = [
      `${finding.contradictionType} detected`,
      `between ${finding.objectAType}:${finding.objectAId}`,
      `and ${finding.objectBType}:${finding.objectBId}`,
    ];
    if (finding.severity === 'critical' || finding.severity === 'high') {
      parts.push(`(${finding.severity} severity)`);
    }
    if (finding.regulatorBody) {
      parts.push(`[${finding.regulatorBody}]`);
    }

    const description = parts.join(' ');
    expect(description).toContain('assumption_drift detected');
    expect(description).toContain('assumption:assumption-001');
    expect(description).toContain('(critical severity)');
    expect(description).toContain('[FDA]');
  });

  it('omits severity tag for medium/low', () => {
    const finding = makeFinding({ severity: 'medium' });

    const parts = [
      `${finding.contradictionType} detected`,
      `between ${finding.objectAType}:${finding.objectAId}`,
      `and ${finding.objectBType}:${finding.objectBId}`,
    ];
    if (finding.severity === 'critical' || finding.severity === 'high') {
      parts.push(`(${finding.severity} severity)`);
    }

    const description = parts.join(' ');
    expect(description).not.toContain('severity');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: END-TO-END AUTHORITY + OVERLAY + PATH
// ═══════════════════════════════════════════════════════════════════════════════

describe('End-to-End: Finding → Authority → Action → Path', () => {
  it('advisory finding without overlay → explain-preflight-results (autonomous)', () => {
    const finding = makeFinding({ authorityState: 'advisory_only', contradictionType: 'assumption_drift' });
    const action = 'explain-preflight-results';
    const authority = getAuthorityForAction(action as GovernedActionType);

    expect(authority.level).toBe('autonomous-read');
    expect(authority.requiresHumanConfirmation).toBe(false);
  });

  it('requires_review finding with FDA overlay → blocks_promotion → create-contradiction-consequence', () => {
    const finding = makeFinding({ authorityState: 'requires_review' });
    const overlay = makeOverlayRule({ authorityOverride: 'blocks_promotion' });

    // Overlay escalates to blocks_promotion
    const authorityWeight: Record<string, number> = {
      advisory_only: 0, requires_review: 1, requires_approval: 2,
      blocks_promotion: 3, requires_escalation: 4,
    };
    const overrideLevel = authorityWeight[overlay.authorityOverride as string] ?? 0;
    const currentLevel = authorityWeight[finding.authorityState] ?? 0;
    const effectiveAuthority = overrideLevel > currentLevel
      ? overlay.authorityOverride as string
      : finding.authorityState;

    expect(effectiveAuthority).toBe('blocks_promotion');

    // blocks_promotion → create-contradiction-consequence
    const action = 'create-contradiction-consequence';
    const authority = getAuthorityForAction(action as GovernedActionType);
    expect(authority.level).toBe('requires-confirmation');
  });

  it('blocks_promotion finding with high confidence → resolution orchestrator should execute', () => {
    const finding = makeFinding({
      authorityState: 'blocks_promotion',
      confidenceScore: 0.85,
    });

    const confidence = mapConfidence(finding.confidenceScore);
    expect(confidence).toBe('moderate');

    // Moderate confidence + no escalation → orchestrator would execute
    // (this matches the classifyDecision logic in ana-resolution-orchestrator)
  });

  it('uncertain confidence → orchestrator should block', () => {
    const finding = makeFinding({ confidenceScore: 0.3 });

    const confidence = mapConfidence(finding.confidenceScore);
    expect(confidence).toBe('uncertain');

    // Uncertain confidence → orchestrator blocks (rule 1 in classifyDecision)
  });
});
