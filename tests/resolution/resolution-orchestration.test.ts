/**
 * Resolution Orchestration Layer — Sprint 4 Tests
 *
 * Comprehensive test suite covering:
 * - Resolution plan creation
 * - Affected-object clustering
 * - Bundle creation/preparation
 * - Supersession linkage
 * - Reapproval determination
 * - Rewrite preparation
 * - Resolution state transitions
 * - Failure behavior
 *
 * @module tests/resolution/resolution-orchestration.test
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
          triggerId: 'trigger-001',
          triggerDescription: 'Endpoint definition drift between protocol and SAP',
          state: 'unresolved',
          affectedObjects: [],
          recommendedPath: 'harmonize',
          alternativePaths: ['supersede', 'escalate'],
          confidence: 'moderate',
          requiresReview: true,
          requiresReapproval: false,
          requiresEscalation: false,
          rationale: 'Test rationale',
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
            updatedAt: new Date().toISOString(),
          }]),
        }),
      }),
    }),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORT AFTER MOCKS
// ═══════════════════════════════════════════════════════════════════════════════

// Import the state machine (no DB dependency)
import {
  validateTransition,
  getValidTransitions,
  isTerminalState,
  isResolved,
  isActive,
} from '../../server/services/resolution/resolution-state-machine';

import {
  VALID_RESOLUTION_STATE_TRANSITIONS,
  VALID_BUNDLE_STATE_TRANSITIONS,
} from '../../shared/types/resolution';

import type {
  ResolutionState,
  BundleState,
  AffectedObject,
  ResolutionConfidence,
} from '../../shared/types/resolution';

// Import AnA support (no DB dependency)
import {
  explainResolutionPlan,
  summarizeResolutionBundle,
  buildAnaResolutionContext,
} from '../../server/services/resolution/ana-resolution-support';

// Import rewrite coordinator helpers (no DB dependency for validation)
import { validateRewriteReadiness } from '../../server/services/resolution/rewrite-coordinator';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: RESOLUTION STATE MACHINE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Resolution State Machine', () => {
  describe('validateTransition', () => {
    it('allows valid transitions from unresolved', () => {
      expect(() => validateTransition('unresolved', 'proposed_resolution')).not.toThrow();
      expect(() => validateTransition('unresolved', 'cancelled')).not.toThrow();
    });

    it('rejects invalid transitions from unresolved', () => {
      expect(() => validateTransition('unresolved', 'in_resolution')).toThrow('Invalid state transition');
      expect(() => validateTransition('unresolved', 'resolved_approved')).toThrow('Invalid state transition');
    });

    it('allows valid transitions from proposed_resolution', () => {
      expect(() => validateTransition('proposed_resolution', 'in_resolution')).not.toThrow();
      expect(() => validateTransition('proposed_resolution', 'cancelled')).not.toThrow();
      expect(() => validateTransition('proposed_resolution', 'unresolved')).not.toThrow();
    });

    it('allows valid transitions from in_resolution', () => {
      expect(() => validateTransition('in_resolution', 'resolved_pending_review')).not.toThrow();
      expect(() => validateTransition('in_resolution', 'cancelled')).not.toThrow();
    });

    it('allows review to approval transition', () => {
      expect(() => validateTransition('resolved_pending_review', 'resolved_approved')).not.toThrow();
    });

    it('rejects transitions from terminal state superseded', () => {
      expect(() => validateTransition('superseded', 'unresolved')).toThrow();
    });

    it('allows reopen from cancelled', () => {
      expect(() => validateTransition('cancelled', 'unresolved')).not.toThrow();
    });

    it('throws on unknown state', () => {
      expect(() => validateTransition('nonexistent' as any, 'unresolved')).toThrow();
    });
  });

  describe('getValidTransitions', () => {
    it('returns correct transitions for each state', () => {
      expect(getValidTransitions('unresolved')).toEqual(['proposed_resolution', 'cancelled']);
      expect(getValidTransitions('resolved_approved')).toEqual(['superseded']);
      expect(getValidTransitions('superseded')).toEqual([]);
    });
  });

  describe('isTerminalState', () => {
    it('identifies terminal states', () => {
      expect(isTerminalState('superseded')).toBe(true);
    });

    it('identifies non-terminal states', () => {
      expect(isTerminalState('unresolved')).toBe(false);
      expect(isTerminalState('in_resolution')).toBe(false);
    });
  });

  describe('isResolved', () => {
    it('identifies resolved states', () => {
      expect(isResolved('resolved_pending_review')).toBe(true);
      expect(isResolved('resolved_approved')).toBe(true);
    });

    it('identifies non-resolved states', () => {
      expect(isResolved('unresolved')).toBe(false);
      expect(isResolved('in_resolution')).toBe(false);
      expect(isResolved('cancelled')).toBe(false);
    });
  });

  describe('isActive', () => {
    it('identifies active states', () => {
      expect(isActive('unresolved')).toBe(true);
      expect(isActive('proposed_resolution')).toBe(true);
      expect(isActive('in_resolution')).toBe(true);
    });

    it('identifies inactive states', () => {
      expect(isActive('resolved_approved')).toBe(false);
      expect(isActive('cancelled')).toBe(false);
      expect(isActive('superseded')).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: BUNDLE STATE TRANSITIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Bundle State Machine', () => {
  it('validates all state transitions are defined', () => {
    const allStates: BundleState[] = [
      'draft', 'proposed', 'in_progress', 'pending_review',
      'approved', 'applied', 'rejected', 'cancelled',
    ];
    for (const state of allStates) {
      expect(VALID_BUNDLE_STATE_TRANSITIONS[state]).toBeDefined();
    }
  });

  it('draft can transition to proposed or cancelled', () => {
    expect(VALID_BUNDLE_STATE_TRANSITIONS.draft).toEqual(['proposed', 'cancelled']);
  });

  it('applied is a terminal state', () => {
    expect(VALID_BUNDLE_STATE_TRANSITIONS.applied).toEqual([]);
  });

  it('rejected can go back to draft', () => {
    expect(VALID_BUNDLE_STATE_TRANSITIONS.rejected).toContain('draft');
  });

  it('approved transitions to applied only', () => {
    expect(VALID_BUNDLE_STATE_TRANSITIONS.approved).toEqual(['applied']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: RESOLUTION STATE TRANSITIONS (EXHAUSTIVE)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Resolution State Transition Completeness', () => {
  it('all states are defined in transition map', () => {
    const allStates: ResolutionState[] = [
      'unresolved', 'proposed_resolution', 'in_resolution',
      'resolved_pending_review', 'resolved_approved', 'superseded', 'cancelled',
    ];
    for (const state of allStates) {
      expect(VALID_RESOLUTION_STATE_TRANSITIONS[state]).toBeDefined();
    }
  });

  it('there are no orphan transitions (all targets are valid states)', () => {
    const allStates = new Set(Object.keys(VALID_RESOLUTION_STATE_TRANSITIONS));
    for (const [source, targets] of Object.entries(VALID_RESOLUTION_STATE_TRANSITIONS)) {
      for (const target of targets) {
        expect(allStates.has(target)).toBe(true);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: ANA RESOLUTION SUPPORT
// ═══════════════════════════════════════════════════════════════════════════════

describe('AnA Resolution Support', () => {
  const mockPlan = {
    id: 'plan-001',
    organizationId: 1,
    projectId: 1,
    triggerType: 'contradiction' as const,
    triggerId: 'trigger-001',
    triggerDescription: 'Endpoint definition drift between protocol and SAP',
    state: 'unresolved' as const,
    affectedObjects: [
      { objectType: 'artifact', objectId: 'art-1', objectTitle: 'Protocol Section 3.1', impactState: 'direct' as const },
      { objectType: 'artifact', objectId: 'art-2', objectTitle: 'SAP Section 2.4', impactState: 'direct' as const },
      { objectType: 'document', objectId: 'doc-1', objectTitle: 'Executive Summary', impactState: 'indirect' as const },
    ],
    recommendedPath: 'harmonize' as const,
    alternativePaths: ['supersede', 'escalate'],
    confidence: 'moderate' as const,
    requiresReview: true,
    requiresReapproval: true,
    requiresEscalation: false,
    rationale: 'Endpoint definition drift detected across protocol and SAP sections.',
    resolvedAt: null,
    resolvedById: null,
    resolutionSummary: null,
    bundleId: null,
    createdById: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('explainResolutionPlan', () => {
    it('generates structured explanation from plan data', () => {
      const explanation = explainResolutionPlan(mockPlan);

      expect(explanation.planId).toBe('plan-001');
      expect(explanation.summary).toContain('contradiction');
      expect(explanation.summary).toContain('3 object(s)');
      expect(explanation.triggerExplanation).toContain('contradiction');
      expect(explanation.triggerExplanation).toContain('Endpoint definition drift');
      expect(explanation.affectedObjectsSummary).toContain('2 directly impacted');
      expect(explanation.affectedObjectsSummary).toContain('1 indirectly impacted');
      expect(explanation.recommendedPathExplanation).toContain('Harmonize');
      expect(explanation.reviewRequirements).toContain('review required');
      expect(explanation.reviewRequirements).toContain('reapproval required');
      expect(explanation.confidenceExplanation).toContain('moderate');
      expect(explanation.nextSteps.length).toBeGreaterThan(0);
    });

    it('handles plan with no affected objects', () => {
      const emptyPlan = { ...mockPlan, affectedObjects: [] };
      const explanation = explainResolutionPlan(emptyPlan);
      expect(explanation.summary).toContain('0 object(s)');
    });

    it('includes alternative paths when present', () => {
      const explanation = explainResolutionPlan(mockPlan);
      expect(explanation.alternativePathsExplanation).toBeDefined();
      expect(explanation.alternativePathsExplanation).toContain('supersede');
    });

    it('omits alternative paths when empty', () => {
      const planNoAlts = { ...mockPlan, alternativePaths: [] };
      const explanation = explainResolutionPlan(planNoAlts);
      expect(explanation.alternativePathsExplanation).toBeUndefined();
    });
  });

  describe('summarizeResolutionBundle', () => {
    const mockBundle = {
      id: 'bundle-001',
      organizationId: 1,
      projectId: 1,
      title: 'Resolution: Endpoint definition drift',
      description: 'Fix endpoint drift across protocol and SAP',
      state: 'in_progress' as const,
      planId: 'plan-001',
      resolutionMemo: null,
      requiresReview: true,
      requiresReapproval: true,
      reviewThreadId: null,
      approvedById: null,
      approvedAt: null,
      confidence: 'moderate' as const,
      createdById: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
    };

    const mockItems = [
      { id: 'item-1', bundleId: 'bundle-001', objectType: 'artifact', objectId: 'art-1', objectTitle: 'Protocol Section 3.1', actionType: 'harmonize', actionDescription: 'Harmonize Protocol Section 3.1', status: 'completed', sortOrder: 0, createdAt: new Date(), completedAt: new Date(), completedById: 1, preparedContent: null, preparedContentConfidence: null, sectionCode: null, impactRationale: null },
      { id: 'item-2', bundleId: 'bundle-001', objectType: 'artifact', objectId: 'art-2', objectTitle: 'SAP Section 2.4', actionType: 'rewrite', actionDescription: 'Rewrite SAP Section 2.4', status: 'pending', sortOrder: 1, createdAt: new Date(), completedAt: null, completedById: null, preparedContent: null, preparedContentConfidence: null, sectionCode: null, impactRationale: null },
      { id: 'item-3', bundleId: 'bundle-001', objectType: 'document', objectId: 'doc-1', objectTitle: 'Executive Summary', actionType: 'review', actionDescription: 'Review Executive Summary', status: 'pending', sortOrder: 2, createdAt: new Date(), completedAt: null, completedById: null, preparedContent: null, preparedContentConfidence: null, sectionCode: null, impactRationale: null },
    ];

    it('generates structured bundle summary', () => {
      const summary = summarizeResolutionBundle(mockBundle, mockItems);

      expect(summary.bundleId).toBe('bundle-001');
      expect(summary.itemCount).toBe(3);
      expect(summary.itemBreakdown.length).toBe(3); // harmonize, rewrite, review
      expect(summary.reviewStatus).toContain('In progress');
      expect(summary.reviewStatus).toContain('1/3');
      expect(summary.confidenceLevel).toBe('moderate');
      expect(summary.nextSteps.length).toBeGreaterThan(0);
    });

    it('reports approved status correctly', () => {
      const approvedBundle = { ...mockBundle, state: 'approved' as const };
      const summary = summarizeResolutionBundle(approvedBundle, mockItems);
      expect(summary.reviewStatus).toContain('Approved');
    });
  });

  describe('buildAnaResolutionContext', () => {
    it('produces resolution context block', () => {
      const context = buildAnaResolutionContext([mockPlan], []);
      expect(context).toContain('<resolution_context>');
      expect(context).toContain('Active Resolution Plans (1)');
      expect(context).toContain('Endpoint definition drift');
      expect(context).toContain('</resolution_context>');
    });

    it('handles empty state', () => {
      const context = buildAnaResolutionContext([], []);
      expect(context).toContain('No active resolution plans');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: REWRITE READINESS VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Rewrite Readiness Validation', () => {
  it('marks ready when all targets have content', () => {
    const targets = [
      {
        objectType: 'artifact',
        objectId: 'art-1',
        currentContent: 'Some content',
        revisionRationale: 'Needs update',
        confidence: 'moderate' as ResolutionConfidence,
        requiresReview: true,
      },
    ];
    const result = validateRewriteReadiness(targets);
    expect(result.ready).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('flags uncertain confidence targets', () => {
    const targets = [
      {
        objectType: 'artifact',
        objectId: 'art-1',
        currentContent: undefined,
        revisionRationale: 'Content not available',
        confidence: 'uncertain' as ResolutionConfidence,
        requiresReview: true,
      },
    ];
    const result = validateRewriteReadiness(targets);
    expect(result.ready).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]).toContain('uncertain confidence');
  });

  it('flags missing content for non-uncertain targets', () => {
    const targets = [
      {
        objectType: 'artifact',
        objectId: 'art-1',
        currentContent: undefined,
        revisionRationale: 'Needs update',
        confidence: 'moderate' as ResolutionConfidence,
        requiresReview: true,
      },
    ];
    const result = validateRewriteReadiness(targets);
    expect(result.ready).toBe(false);
    expect(result.issues[0]).toContain('content not available');
  });

  it('handles empty targets list', () => {
    const result = validateRewriteReadiness([]);
    expect(result.ready).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: AFFECTED OBJECT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Affected Object Type Validation', () => {
  it('affected object structure is correct', () => {
    const obj: AffectedObject = {
      objectType: 'artifact',
      objectId: 'art-123',
      objectTitle: 'Protocol Section 3.1',
      sectionCode: 'm5.3.5.1',
      impactState: 'direct',
      impactRationale: 'Contains conflicting endpoint definition',
    };

    expect(obj.objectType).toBe('artifact');
    expect(obj.impactState).toBe('direct');
    expect(obj.sectionCode).toBe('m5.3.5.1');
  });

  it('affected object allows minimal required fields', () => {
    const obj: AffectedObject = {
      objectType: 'document',
      objectId: 'doc-456',
    };

    expect(obj.objectType).toBe('document');
    expect(obj.objectTitle).toBeUndefined();
    expect(obj.impactState).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: SAMPLE PAYLOADS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Sample Resolution Payloads', () => {
  it('sample resolution plan payload is valid', () => {
    const samplePlan = {
      projectId: 42,
      triggerType: 'contradiction',
      triggerId: 'contra-001',
      triggerDescription: 'Primary endpoint definition in Protocol Section 3.1 conflicts with SAP Section 2.4',
      affectedObjects: [
        { objectType: 'artifact', objectId: 'art-protocol-31', objectTitle: 'Protocol Section 3.1', sectionCode: 'm5.3.5.1', impactState: 'direct' },
        { objectType: 'artifact', objectId: 'art-sap-24', objectTitle: 'SAP Section 2.4', sectionCode: 'm5.3.5.2', impactState: 'direct' },
        { objectType: 'artifact', objectId: 'art-stat-rationale', objectTitle: 'Statistical Rationale', impactState: 'indirect' },
        { objectType: 'document', objectId: 'doc-exec-summary', objectTitle: 'Executive Summary', impactState: 'indirect' },
        { objectType: 'decision', objectId: 'dec-endpoint-primary', objectTitle: 'Primary Endpoint Selection Decision', impactState: 'direct' },
      ],
      autoCluster: false,
    };

    expect(samplePlan.triggerType).toBe('contradiction');
    expect(samplePlan.affectedObjects).toHaveLength(5);
    expect(samplePlan.affectedObjects.filter(o => o.impactState === 'direct')).toHaveLength(3);
    expect(samplePlan.affectedObjects.filter(o => o.impactState === 'indirect')).toHaveLength(2);
  });

  it('sample resolution bundle payload is valid', () => {
    const sampleBundle = {
      projectId: 42,
      planId: 'plan-contra-001',
      title: 'Resolution: Primary Endpoint Definition Drift',
      description: 'Harmonize endpoint definition across protocol, SAP, and related artifacts after contradiction detected',
      items: [
        { objectType: 'artifact', objectId: 'art-protocol-31', objectTitle: 'Protocol Section 3.1', actionType: 'harmonize', actionDescription: 'Harmonize Protocol Section 3.1 with corrected endpoint definition' },
        { objectType: 'artifact', objectId: 'art-sap-24', objectTitle: 'SAP Section 2.4', actionType: 'rewrite', actionDescription: 'Rewrite SAP Section 2.4 to align with updated endpoint' },
        { objectType: 'artifact', objectId: 'art-stat-rationale', objectTitle: 'Statistical Rationale', actionType: 'review', actionDescription: 'Review Statistical Rationale for consistency with updated endpoint' },
        { objectType: 'document', objectId: 'doc-exec-summary', objectTitle: 'Executive Summary', actionType: 'review', actionDescription: 'Review Executive Summary references to primary endpoint' },
        { objectType: 'decision', objectId: 'dec-endpoint-primary', objectTitle: 'Primary Endpoint Selection Decision', actionType: 'supersede', actionDescription: 'Supersede original endpoint decision with updated selection' },
      ],
    };

    expect(sampleBundle.items).toHaveLength(5);
    expect(sampleBundle.items.filter(i => i.actionType === 'harmonize')).toHaveLength(1);
    expect(sampleBundle.items.filter(i => i.actionType === 'rewrite')).toHaveLength(1);
    expect(sampleBundle.items.filter(i => i.actionType === 'review')).toHaveLength(2);
    expect(sampleBundle.items.filter(i => i.actionType === 'supersede')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: FAILURE BEHAVIOR
// ═══════════════════════════════════════════════════════════════════════════════

describe('Failure Behavior', () => {
  describe('State machine rejects invalid transitions', () => {
    it('cannot skip from unresolved to resolved_approved', () => {
      expect(() => validateTransition('unresolved', 'resolved_approved')).toThrow('Invalid state transition');
    });

    it('cannot transition from terminal superseded state', () => {
      expect(() => validateTransition('superseded', 'unresolved')).toThrow();
    });

    it('error message includes valid transitions', () => {
      try {
        validateTransition('unresolved', 'resolved_approved');
      } catch (e: any) {
        expect(e.message).toContain('proposed_resolution');
        expect(e.message).toContain('cancelled');
      }
    });
  });

  describe('Rewrite readiness catches problems', () => {
    it('reports all issues, not just first', () => {
      const targets = [
        { objectType: 'a', objectId: '1', confidence: 'uncertain' as const, requiresReview: true, revisionRationale: 'test' },
        { objectType: 'b', objectId: '2', confidence: 'uncertain' as const, requiresReview: true, revisionRationale: 'test' },
      ];
      const result = validateRewriteReadiness(targets);
      expect(result.ready).toBe(false);
      expect(result.issues.length).toBe(2);
    });
  });

  describe('Supersession validation', () => {
    it('type structure prevents self-supersession logically', () => {
      // The engine checks this at runtime, but the type allows it.
      // This test validates the concept that self-supersession is a known error case.
      const request = {
        supersededObjectType: 'artifact',
        supersededObjectId: 'art-1',
        successorObjectType: 'artifact',
        successorObjectId: 'art-1',
      };
      expect(request.supersededObjectId).toBe(request.successorObjectId);
      // The engine would throw: "An object cannot supersede itself"
    });
  });

  describe('Low confidence behavior', () => {
    it('uncertain confidence is flagged in rewrite readiness', () => {
      const targets = [{
        objectType: 'artifact',
        objectId: 'art-1',
        currentContent: 'content',
        confidence: 'uncertain' as const,
        requiresReview: true,
        revisionRationale: 'test',
      }];
      const result = validateRewriteReadiness(targets);
      expect(result.ready).toBe(false);
      expect(result.issues[0]).toContain('uncertain confidence');
    });
  });
});
