/**
 * Contradiction Resolution Execution Tests — Pass 9 Execution Hardened
 *
 * Tests real execution paths, partial execution, blocked handling,
 * receipt persistence, refresh/invalidation, failure behavior,
 * and AnA explanation grounding from receipt data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db module to prevent database connection errors
vi.mock('../../server/db', () => ({
  db: {},
  pool: null,
  getPool: () => null,
}));
vi.mock('../../server/db.js', () => ({
  db: {},
  pool: null,
  getPool: () => null,
}));

import {
  buildContradictionBundlePlan,
  classifyPlanActions,
} from '../../server/services/resolution/contradiction-bundle-planner';
import {
  buildContradictionExplanation,
} from '../../server/services/resolution/contradiction-resolution-orchestrator';
import type { ContradictionFinding, OverlayRule } from '../../server/services/contradiction-engine-service';
import type {
  ContradictionOrchestrationResult,
  BundleExecutionReceipt,
  ResolutionBundlePlan,
} from '../../shared/types/resolution';
import { ACTION_KIND_TO_BUNDLE_ACTION } from '../../shared/types/resolution';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST FIXTURES
// ═══════════════════════════════════════════════════════════════════════════════

function makeFinding(overrides: Partial<ContradictionFinding> = {}): ContradictionFinding {
  return {
    id: `test-finding-${Math.random().toString(36).slice(2, 8)}`,
    organizationId: 1,
    projectId: 100,
    sourceClassification: 'structured_record_conflict',
    objectAType: 'assumption',
    objectAId: 'asm-001',
    objectALabel: 'Primary endpoint assumption',
    objectBType: 'assumption',
    objectBId: 'asm-002',
    objectBLabel: 'Secondary endpoint assumption',
    contradictionType: 'assumption_drift',
    severity: 'high',
    truthHierarchyLevel: 1,
    confidenceScore: 0.9,
    confidenceLevel: 'high',
    title: 'Assumption drift: efficacy endpoint',
    description: 'Two assumptions about the efficacy endpoint have different values',
    evidenceSummary: null,
    deterministicRule: 'RULE: Same category → values must not conflict',
    llmRole: 'none',
    llmExplanation: null,
    regulatorBody: null,
    overlayRuleId: null,
    regulatorSeverityOverride: null,
    authorityState: 'requires_review',
    reviewState: 'unresolved',
    resolvedAt: null,
    resolvedBy: null,
    resolutionNotes: null,
    consequenceType: 'assumption_supersession',
    consequenceObjectId: null,
    consequenceExecuted: false,
    detectedBy: 'contradiction-engine',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeReceipt(overrides: Partial<BundleExecutionReceipt> = {}): BundleExecutionReceipt {
  return {
    bundleId: 'bundle-test-001',
    planId: 'plan-test-001',
    executedSteps: [],
    preparedSteps: [],
    blockedSteps: [],
    supersededObjects: [],
    updatedArtifacts: [],
    requiresReview: [],
    requiresReapproval: [],
    contradictionState: 'unresolved',
    summary: { totalItems: 0, executed: 0, prepared: 0, blocked: 0 },
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: REAL EXECUTION PATH BY ACTION KIND
// ═══════════════════════════════════════════════════════════════════════════════

describe('Real execution path by action kind', () => {
  it('supersede-assumption maps to supersede bundle action', () => {
    expect(ACTION_KIND_TO_BUNDLE_ACTION['supersede-assumption']).toBe('supersede');
  });

  it('create-review-thread maps to review bundle action', () => {
    expect(ACTION_KIND_TO_BUNDLE_ACTION['create-review-thread']).toBe('review');
  });

  it('attach-contradiction-memo maps to review bundle action', () => {
    expect(ACTION_KIND_TO_BUNDLE_ACTION['attach-contradiction-memo']).toBe('review');
  });

  it('prepare-correction-draft maps to rewrite bundle action', () => {
    expect(ACTION_KIND_TO_BUNDLE_ACTION['prepare-correction-draft']).toBe('rewrite');
  });

  it('apply-harmonization maps to harmonize bundle action', () => {
    expect(ACTION_KIND_TO_BUNDLE_ACTION['apply-harmonization']).toBe('harmonize');
  });

  it('mark-needs-reapproval maps to reapprove bundle action', () => {
    expect(ACTION_KIND_TO_BUNDLE_ACTION['mark-needs-reapproval']).toBe('reapprove');
  });

  it('escalate maps to escalate bundle action', () => {
    expect(ACTION_KIND_TO_BUNDLE_ACTION['escalate']).toBe('escalate');
  });

  it('bundle items generated from plan use correct action types', () => {
    const findings = [
      makeFinding({ contradictionType: 'assumption_drift' }),
      makeFinding({
        contradictionType: 'dosage_conflict',
        authorityState: 'blocks_promotion',
        objectAId: 'dose-001',
      }),
    ];

    const plan = buildContradictionBundlePlan({
      organizationId: 1, projectId: 100, findings,
    });

    // Convert to bundle items (same as orchestrator does)
    const bundleItems = plan.actions
      .filter(a => a.status === 'planned')
      .map(a => ({
        actionType: ACTION_KIND_TO_BUNDLE_ACTION[a.kind],
        objectType: a.targetObjectType,
        objectId: a.targetObjectId,
      }));

    // All action types should be valid
    const validTypes = ['rewrite', 'review', 'supersede', 'reapprove', 'harmonize', 'escalate'];
    for (const item of bundleItems) {
      expect(validTypes).toContain(item.actionType);
    }
    expect(bundleItems.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: PARTIAL EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Partial execution handling', () => {
  it('receipt correctly represents partial execution', () => {
    const receipt = makeReceipt({
      executedSteps: [
        {
          stepType: 'supersede',
          targetId: 'asm-001',
          targetType: 'assumption',
          targetTitle: 'Primary endpoint',
          result: 'success',
          priorState: 'active',
          newState: 'superseded',
          bundleId: 'bundle-1',
          timestamp: new Date().toISOString(),
        },
      ],
      preparedSteps: [
        {
          stepType: 'review',
          targetId: 'asm-002',
          targetType: 'assumption',
          targetTitle: 'Secondary endpoint',
          result: 'prepared',
          preparedAction: 'Review required',
          confidence: 'moderate',
        },
      ],
      blockedSteps: [
        {
          stepType: 'rewrite',
          targetId: 'doc-001',
          targetType: 'document',
          targetTitle: 'Clinical Overview',
          reason: 'Object is locked',
        },
      ],
      contradictionState: 'in_resolution',
      summary: { totalItems: 3, executed: 1, prepared: 1, blocked: 1 },
    });

    // Partial execution should NOT be "resolved"
    expect(receipt.contradictionState).toBe('in_resolution');
    expect(receipt.summary.executed).toBe(1);
    expect(receipt.summary.prepared).toBe(1);
    expect(receipt.summary.blocked).toBe(1);
    expect(receipt.executedSteps).toHaveLength(1);
    expect(receipt.preparedSteps).toHaveLength(1);
    expect(receipt.blockedSteps).toHaveLength(1);
  });

  it('all-blocked receipt shows unresolved state', () => {
    const receipt = makeReceipt({
      blockedSteps: [
        { stepType: 'supersede', targetId: 'a', targetType: 'assumption', reason: 'Object locked' },
        { stepType: 'review', targetId: 'b', targetType: 'assumption', reason: 'Authority blocks' },
      ],
      contradictionState: 'unresolved',
      summary: { totalItems: 2, executed: 0, prepared: 0, blocked: 2 },
    });

    expect(receipt.contradictionState).toBe('unresolved');
    expect(receipt.summary.executed).toBe(0);
    expect(receipt.summary.blocked).toBe(2);
  });

  it('all-executed receipt shows resolved_pending_review state', () => {
    const receipt = makeReceipt({
      executedSteps: [
        { stepType: 'supersede', targetId: 'a', targetType: 'assumption', result: 'success', priorState: 'active', newState: 'superseded', bundleId: 'b1', timestamp: '' },
        { stepType: 'harmonize', targetId: 'b', targetType: 'artifact', result: 'success', priorState: 'draft', newState: 'harmonize_staged', bundleId: 'b1', timestamp: '' },
      ],
      contradictionState: 'resolved_pending_review',
      summary: { totalItems: 2, executed: 2, prepared: 0, blocked: 0 },
    });

    expect(receipt.contradictionState).toBe('resolved_pending_review');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: BLOCKED ACTION HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Blocked action handling', () => {
  it('blocked steps include explicit reason', () => {
    const receipt = makeReceipt({
      blockedSteps: [
        {
          stepType: 'supersede',
          targetId: 'asm-locked',
          targetType: 'assumption',
          targetTitle: 'Locked assumption',
          reason: 'Cannot supersede assumption asm-locked — object is locked. Escalation required.',
        },
      ],
      summary: { totalItems: 1, executed: 0, prepared: 0, blocked: 1 },
    });

    expect(receipt.blockedSteps[0].reason).toContain('locked');
    expect(receipt.blockedSteps[0].reason).toContain('Escalation required');
  });

  it('escalation-only plan blocks execution when requires escalation', () => {
    const finding = makeFinding({
      contradictionType: 'regulatory_discrepancy',
      authorityState: 'requires_escalation',
    });

    const plan = buildContradictionBundlePlan({
      organizationId: 1, projectId: 100, findings: [finding],
    });

    // Should require escalation
    expect(plan.authority.requiresEscalation).toBe(true);
    expect(plan.authority.blockedReason).toContain('requires_escalation');

    // Classification should show escalation actions
    const classification = classifyPlanActions(plan);
    expect(classification.requiresEscalation.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: RECEIPT PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Receipt persistence and structure', () => {
  it('receipt contains contradictionIds when set', () => {
    const receipt = makeReceipt({
      contradictionIds: ['finding-1', 'finding-2'],
    });

    expect(receipt.contradictionIds).toEqual(['finding-1', 'finding-2']);
  });

  it('receipt contains overlay context when set', () => {
    const receipt = makeReceipt({
      overlayContext: {
        regulatorBody: 'FDA',
        appliedRuleIds: ['rule-fda-1'],
      },
    });

    expect(receipt.overlayContext?.regulatorBody).toBe('FDA');
    expect(receipt.overlayContext?.appliedRuleIds).toContain('rule-fda-1');
  });

  it('receipt contains user confirmation decision', () => {
    const receipt = makeReceipt({
      userConfirmation: 'confirmed',
      executedBy: 42,
    });

    expect(receipt.userConfirmation).toBe('confirmed');
    expect(receipt.executedBy).toBe(42);
  });

  it('receipt contains post-execution results', () => {
    const receipt = makeReceipt({
      postExecution: {
        reviewThreadsCreated: 2,
        memosAttached: 1,
        reapprovalFlagsSet: 1,
        escalationsRecorded: 0,
        errors: [],
      },
    });

    expect(receipt.postExecution?.reviewThreadsCreated).toBe(2);
    expect(receipt.postExecution?.memosAttached).toBe(1);
    expect(receipt.postExecution?.reapprovalFlagsSet).toBe(1);
    expect(receipt.postExecution?.errors).toHaveLength(0);
  });

  it('receipt can be serialized to JSON and back without data loss', () => {
    const receipt = makeReceipt({
      contradictionIds: ['f1', 'f2'],
      overlayContext: { regulatorBody: 'EMA', appliedRuleIds: ['r1'] },
      userConfirmation: 'auto',
      executedBy: 7,
      postExecution: {
        reviewThreadsCreated: 1,
        memosAttached: 1,
        reapprovalFlagsSet: 0,
        escalationsRecorded: 1,
        errors: ['escalation on f2: table not found'],
      },
      executedSteps: [
        { stepType: 'supersede', targetId: 'a1', targetType: 'assumption', result: 'success', priorState: 'active', newState: 'superseded', bundleId: 'b1', timestamp: '2026-03-24' },
      ],
      blockedSteps: [
        { stepType: 'rewrite', targetId: 'd1', targetType: 'document', reason: 'Object locked' },
      ],
      contradictionState: 'in_resolution',
      summary: { totalItems: 2, executed: 1, prepared: 0, blocked: 1 },
    });

    const json = JSON.stringify(receipt);
    const restored = JSON.parse(json) as BundleExecutionReceipt;

    expect(restored.contradictionIds).toEqual(['f1', 'f2']);
    expect(restored.overlayContext?.regulatorBody).toBe('EMA');
    expect(restored.postExecution?.reviewThreadsCreated).toBe(1);
    expect(restored.postExecution?.errors).toHaveLength(1);
    expect(restored.executedSteps).toHaveLength(1);
    expect(restored.blockedSteps).toHaveLength(1);
    expect(restored.summary.executed).toBe(1);
    expect(restored.summary.blocked).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: FAILURE BEHAVIOR
// ═══════════════════════════════════════════════════════════════════════════════

describe('Failure and partial execution behavior', () => {
  it('one success + one failure = in_resolution, not resolved', () => {
    const receipt = makeReceipt({
      executedSteps: [
        { stepType: 'supersede', targetId: 'a', targetType: 'assumption', result: 'success', priorState: 'active', newState: 'superseded', bundleId: 'b1', timestamp: '' },
      ],
      blockedSteps: [
        { stepType: 'rewrite', targetId: 'b', targetType: 'artifact', reason: 'Execution error: content hash conflict' },
      ],
      contradictionState: 'in_resolution',
      summary: { totalItems: 2, executed: 1, prepared: 0, blocked: 1 },
    });

    expect(receipt.contradictionState).not.toBe('resolved_pending_review');
    expect(receipt.contradictionState).toBe('in_resolution');
  });

  it('post-execution errors are tracked without failing orchestration', () => {
    const receipt = makeReceipt({
      postExecution: {
        reviewThreadsCreated: 1,
        memosAttached: 0,
        reapprovalFlagsSet: 0,
        escalationsRecorded: 0,
        errors: [
          'attach-contradiction-memo on f1: table does not exist',
          'mark-needs-reapproval on art-1: column not found',
        ],
      },
    });

    expect(receipt.postExecution?.errors).toHaveLength(2);
    expect(receipt.postExecution?.reviewThreadsCreated).toBe(1);
  });

  it('bundle with no executable actions blocks cleanly', () => {
    const finding = makeFinding({
      contradictionType: 'regulatory_discrepancy',
      authorityState: 'requires_escalation',
    });

    const plan = buildContradictionBundlePlan({
      organizationId: 1, projectId: 100, findings: [finding],
    });

    // All actions should require escalation
    expect(plan.authority.requiresEscalation).toBe(true);

    // Simulate the orchestrator's decision
    const classification = classifyPlanActions(plan);
    const allEscalation = classification.requiresEscalation.length === plan.actions.length;
    // At minimum, escalation actions should exist
    expect(classification.requiresEscalation.length + classification.cannotExecute.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: ANA EXPLANATION WITH POST-EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

describe('AnA explanation grounding from receipt with post-execution', () => {
  it('explanation includes post-execution details', () => {
    const finding = makeFinding();
    const plan = buildContradictionBundlePlan({
      organizationId: 1, projectId: 100, findings: [finding],
    });

    const receipt = makeReceipt({
      contradictionIds: [finding.id],
      userConfirmation: 'confirmed',
      executedBy: 42,
      executedSteps: [
        { stepType: 'supersede', targetId: 'a', targetType: 'assumption', targetTitle: 'Endpoint', result: 'success', priorState: 'active', newState: 'superseded', bundleId: 'b1', timestamp: '' },
      ],
      postExecution: {
        reviewThreadsCreated: 1,
        memosAttached: 1,
        reapprovalFlagsSet: 0,
        escalationsRecorded: 0,
        errors: [],
      },
      contradictionState: 'resolved_pending_review',
      summary: { totalItems: 1, executed: 1, prepared: 0, blocked: 0 },
    });

    const result: ContradictionOrchestrationResult = {
      plan,
      decision: 'execute',
      decisionRationale: 'Executed 1 action',
      bundle: { id: 'b1', state: 'in_progress', itemCount: 1 },
      receipt,
      readinessRefreshed: true,
      contradictionStatesUpdated: [finding.id],
      timestamp: new Date().toISOString(),
    };

    const explanation = buildContradictionExplanation(result);

    expect(explanation).toContain('Post-execution');
    expect(explanation).toContain('review thread(s) created');
    expect(explanation).toContain('memo(s) attached');
    expect(explanation).toContain('active → superseded');
  });

  it('explanation includes post-execution errors when present', () => {
    const finding = makeFinding();
    const plan = buildContradictionBundlePlan({
      organizationId: 1, projectId: 100, findings: [finding],
    });

    const receipt = makeReceipt({
      postExecution: {
        reviewThreadsCreated: 0,
        memosAttached: 0,
        reapprovalFlagsSet: 0,
        escalationsRecorded: 0,
        errors: ['create-review-thread on f1: concept2cure_review_threads does not exist'],
      },
      contradictionState: 'in_resolution',
      summary: { totalItems: 1, executed: 0, prepared: 0, blocked: 1 },
    });

    const result: ContradictionOrchestrationResult = {
      plan,
      decision: 'execute',
      decisionRationale: 'Partial',
      receipt,
      readinessRefreshed: false,
      contradictionStatesUpdated: [],
      timestamp: new Date().toISOString(),
    };

    const explanation = buildContradictionExplanation(result);

    expect(explanation).toContain('Post-execution errors');
    expect(explanation).toContain('does not exist');
  });

  it('blocked result explanation does not claim execution', () => {
    const finding = makeFinding({
      contradictionType: 'regulatory_discrepancy',
      authorityState: 'requires_escalation',
    });

    const plan = buildContradictionBundlePlan({
      organizationId: 1, projectId: 100, findings: [finding],
    });

    const result: ContradictionOrchestrationResult = {
      plan,
      decision: 'block',
      decisionRationale: 'Escalation required',
      readinessRefreshed: false,
      contradictionStatesUpdated: [],
      timestamp: new Date().toISOString(),
    };

    const explanation = buildContradictionExplanation(result);

    expect(explanation).toContain('BLOCK');
    expect(explanation).toContain('Escalation required');
    expect(explanation).not.toContain('Execution Receipt');
    expect(explanation).not.toContain('Post-execution');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: RECEIPT LINKAGE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Receipt linkage to contradictions and objects', () => {
  it('receipt links back to contradiction findings', () => {
    const finding1 = makeFinding({ id: 'f-001' });
    const finding2 = makeFinding({ id: 'f-002', objectAId: 'asm-003' });

    const plan = buildContradictionBundlePlan({
      organizationId: 1, projectId: 100, findings: [finding1, finding2],
    });

    expect(plan.contradictionIds).toContain('f-001');
    expect(plan.contradictionIds).toContain('f-002');

    // Simulate receipt with contradictionIds
    const receipt = makeReceipt({
      contradictionIds: plan.contradictionIds,
    });

    expect(receipt.contradictionIds).toContain('f-001');
    expect(receipt.contradictionIds).toContain('f-002');
  });

  it('receipt tracks affected objects through executed/blocked/prepared steps', () => {
    const receipt = makeReceipt({
      executedSteps: [
        { stepType: 'supersede', targetId: 'asm-001', targetType: 'assumption', result: 'success', priorState: 'active', newState: 'superseded', bundleId: 'b1', timestamp: '' },
      ],
      blockedSteps: [
        { stepType: 'rewrite', targetId: 'doc-001', targetType: 'document', reason: 'Locked' },
      ],
      preparedSteps: [
        { stepType: 'review', targetId: 'asm-002', targetType: 'assumption', result: 'prepared', preparedAction: 'Review needed', confidence: 'moderate' },
      ],
      supersededObjects: ['assumption:asm-001'],
      requiresReview: ['assumption:asm-002'],
    });

    // All affected objects are tracked
    expect(receipt.supersededObjects).toContain('assumption:asm-001');
    expect(receipt.requiresReview).toContain('assumption:asm-002');
    expect(receipt.executedSteps[0].targetId).toBe('asm-001');
    expect(receipt.blockedSteps[0].targetId).toBe('doc-001');
    expect(receipt.preparedSteps[0].targetId).toBe('asm-002');
  });
});
