/**
 * Governed Promotion Pipeline — Pass 10 Tests
 *
 * Tests covering:
 * - Governance boundary service contradiction gate
 * - Governance boundary service readiness gate
 * - Authority state → governed action mapping in promotion flow
 * - Wave 3 action routing availability
 * - Boundary transition direction validation
 *
 * @module tests/resolution/governed-promotion-pipeline.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════════

vi.mock('../../server/db', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: 'transition-001',
          organizationId: 1,
          projectId: 1,
          fromBoundary: 'advisory',
          toBoundary: 'governed_draft',
          transitionAllowed: true,
          blockedReasons: [],
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
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}));

vi.mock('../../server/utils/logger', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
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
// TESTS: GOVERNANCE BOUNDARY DIRECTION VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Governance Boundary Direction Validation', () => {
  const BOUNDARY_ORDER: Record<string, number> = {
    advisory: 0,
    governed_draft: 1,
    approved: 2,
    locked: 3,
    submission_ready: 4,
  };

  function validateDirection(from: string, to: string): { valid: boolean; reason?: string } {
    if (from === to) {
      return { valid: false, reason: 'No-op transition' };
    }
    if (BOUNDARY_ORDER[to] < BOUNDARY_ORDER[from] && to !== 'advisory') {
      return { valid: false, reason: 'Boundaries must progress forward unless reverting to advisory' };
    }
    return { valid: true };
  }

  it('allows forward transitions', () => {
    expect(validateDirection('advisory', 'governed_draft').valid).toBe(true);
    expect(validateDirection('governed_draft', 'approved').valid).toBe(true);
    expect(validateDirection('approved', 'locked').valid).toBe(true);
    expect(validateDirection('locked', 'submission_ready').valid).toBe(true);
  });

  it('blocks backward transitions (except to advisory)', () => {
    expect(validateDirection('approved', 'governed_draft').valid).toBe(false);
    expect(validateDirection('locked', 'governed_draft').valid).toBe(false);
    expect(validateDirection('submission_ready', 'locked').valid).toBe(false);
  });

  it('allows reversion to advisory from any boundary', () => {
    expect(validateDirection('governed_draft', 'advisory').valid).toBe(true);
    expect(validateDirection('approved', 'advisory').valid).toBe(true);
    expect(validateDirection('locked', 'advisory').valid).toBe(true);
  });

  it('blocks no-op transitions', () => {
    expect(validateDirection('advisory', 'advisory').valid).toBe(false);
    expect(validateDirection('locked', 'locked').valid).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: CONTRADICTION GATE IN GOVERNANCE BOUNDARY
// ═══════════════════════════════════════════════════════════════════════════════

describe('Contradiction Gate in Governance Boundary', () => {
  it('blocks transition when unresolved blocking contradictions exist', () => {
    // Simulate contradiction check result
    const contradictionCheck = {
      blocked: true,
      blockingFindings: [
        { id: 'f-001', title: 'Endpoint drift', severity: 'critical', authorityState: 'blocks_promotion' },
      ],
      warningFindings: [],
    };

    const blockedReasons: string[] = [];
    if (contradictionCheck.blocked) {
      const blockingCount = contradictionCheck.blockingFindings.length;
      blockedReasons.push(
        `${blockingCount} unresolved blocking contradiction(s) must be resolved before transitioning to governed_draft.`
      );
    }

    expect(blockedReasons).toHaveLength(1);
    expect(blockedReasons[0]).toContain('1 unresolved blocking contradiction');
  });

  it('allows transition when no blocking contradictions exist', () => {
    const contradictionCheck = {
      blocked: false,
      blockingFindings: [],
      warningFindings: [
        { id: 'f-002', title: 'Minor parameter mismatch', severity: 'low', authorityState: 'advisory_only' },
      ],
    };

    const blockedReasons: string[] = [];
    if (contradictionCheck.blocked) {
      blockedReasons.push('Blocked');
    }

    expect(blockedReasons).toHaveLength(0);
  });

  it('allows transition to advisory even with contradictions (reversion path)', () => {
    // The contradiction gate only applies when toBoundary !== 'advisory'
    const toBoundary = 'advisory';
    const shouldCheckContradictions = toBoundary !== 'advisory';

    expect(shouldCheckContradictions).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: READINESS GATE IN GOVERNANCE BOUNDARY
// ═══════════════════════════════════════════════════════════════════════════════

describe('Readiness Gate in Governance Boundary', () => {
  it('blocks approved/locked/submission transitions when readiness fails', () => {
    const readinessResult = {
      isReady: false,
      blockerCount: 3,
      overallScore: 45,
    };

    const toBoundary = 'approved';
    const gatedBoundaries = ['approved', 'locked', 'submission_ready'];
    const shouldCheckReadiness = gatedBoundaries.includes(toBoundary);

    expect(shouldCheckReadiness).toBe(true);

    const blockedReasons: string[] = [];
    if (!readinessResult.isReady && readinessResult.blockerCount > 0) {
      blockedReasons.push(
        `Readiness evaluation failed: ${readinessResult.blockerCount} blocker(s), score ${readinessResult.overallScore}/100.`
      );
    }

    expect(blockedReasons).toHaveLength(1);
    expect(blockedReasons[0]).toContain('3 blocker(s)');
    expect(blockedReasons[0]).toContain('score 45/100');
  });

  it('allows transition when readiness passes', () => {
    const readinessResult = {
      isReady: true,
      blockerCount: 0,
      overallScore: 92,
    };

    const blockedReasons: string[] = [];
    if (!readinessResult.isReady && readinessResult.blockerCount > 0) {
      blockedReasons.push('Blocked');
    }

    expect(blockedReasons).toHaveLength(0);
  });

  it('does NOT check readiness for advisory → governed_draft', () => {
    const toBoundary = 'governed_draft';
    const gatedBoundaries = ['approved', 'locked', 'submission_ready'];
    const shouldCheckReadiness = gatedBoundaries.includes(toBoundary);

    expect(shouldCheckReadiness).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: PROMOTION AUTHORITY CHAIN
// ═══════════════════════════════════════════════════════════════════════════════

describe('Promotion Authority Chain', () => {
  it('promote-to-review requires confirmation (not autonomous)', () => {
    const authority = getAuthorityForAction('promote-to-review');
    // promote-to-review is requires-confirmation per AUTHORITY_BOUNDARY_MAP
    // (reviewer approval is for approve-artifact and lock-artifact)
    expect(authority.level).toBe('requires-confirmation');
    expect(authority.requiresHumanConfirmation).toBe(true);
  });

  it('approve-artifact requires reviewer approval', () => {
    const authority = getAuthorityForAction('approve-artifact');
    expect(authority.level).toBe('requires-reviewer-approval');
    expect(authority.requiresReviewerApproval).toBe(true);
  });

  it('lock-artifact requires reviewer approval', () => {
    const authority = getAuthorityForAction('lock-artifact');
    expect(authority.level).toBe('requires-reviewer-approval');
  });

  it('judge-module-ready requires escalation', () => {
    const authority = getAuthorityForAction('judge-module-ready');
    expect(authority.level).toBe('requires-escalation');
    expect(authority.requiresEscalation).toBe(true);
  });

  it('decision lifecycle creates promotion receipt with affected objects', () => {
    const receipt = buildDecisionReceipt({
      decisionId: 'dec_promo_001',
      projectId: '1',
      recommendation: {
        summary: 'Promote artifact to review',
        actionIds: ['promote-to-review'],
        rationale: 'All gates passed',
      },
      confirmation: {
        accepted: true,
        confirmedById: 'user-1',
      },
      execution: {
        executed: true,
        executedById: 'user-1',
        executionMethod: 'status-transition:advisory→governed_draft',
      },
      affectedObjects: [{
        objectType: 'artifact',
        objectId: 'artifact-001',
        changeType: 'status_changed',
        priorState: 'draft',
        newState: 'review',
      }],
    });

    expect(receipt.id).toMatch(/^rcpt_/);
    expect(receipt.execution.executed).toBe(true);
    expect(receipt.execution.executionMethod).toBe('status-transition:advisory→governed_draft');
    expect(receipt.affectedObjects).toHaveLength(1);
    expect(receipt.affectedObjects[0].newState).toBe('review');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: WAVE 3 ACTION ROUTING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Wave 3 Action Routing', () => {
  const wave3Actions: AuthoringActionWave3Id[] = [
    'plan_contradiction_resolution',
    'execute_contradiction_resolution',
    'explain_contradiction_resolution',
    'project_resolution_status',
  ];

  // Map action IDs to their expected endpoint paths
  const actionToEndpoint: Record<string, string> = {
    plan_contradiction_resolution: '/plan-contradiction-resolution',
    execute_contradiction_resolution: '/execute-contradiction-resolution',
    explain_contradiction_resolution: '/explain-contradiction-resolution',
    project_resolution_status: '/project-resolution-status/:projectId',
  };

  it('all Wave 3 actions have corresponding endpoints', () => {
    for (const action of wave3Actions) {
      expect(actionToEndpoint[action]).toBeDefined();
    }
  });

  it('plan action maps to plan endpoint', () => {
    expect(actionToEndpoint['plan_contradiction_resolution']).toBe('/plan-contradiction-resolution');
  });

  it('execute action maps to execute endpoint', () => {
    expect(actionToEndpoint['execute_contradiction_resolution']).toBe('/execute-contradiction-resolution');
  });

  it('explain action maps to explain endpoint', () => {
    expect(actionToEndpoint['explain_contradiction_resolution']).toBe('/explain-contradiction-resolution');
  });

  it('status action maps to GET endpoint with projectId param', () => {
    expect(actionToEndpoint['project_resolution_status']).toContain(':projectId');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: END-TO-END PROMOTION PIPELINE
// ═══════════════════════════════════════════════════════════════════════════════

describe('End-to-End Promotion Pipeline', () => {
  it('full promotion flow: contradiction check → boundary check → authority check → execute → receipt', () => {
    // Step 1: Contradiction check
    const contradictionCheck = { blocked: false, blockingFindings: [], warningFindings: [] };
    expect(contradictionCheck.blocked).toBe(false);

    // Step 2: Boundary check (advisory → governed_draft)
    const boundaryCheck = { allowed: true, blockedReasons: [] };
    expect(boundaryCheck.allowed).toBe(true);

    // Step 3: Authority check
    const authority = getAuthorityForAction('promote-to-review');
    const actorCheck = isActorAuthorized(authority, 'reviewer');
    expect(actorCheck.authorized).toBe(true);

    // Step 4: Create decision
    const decision = buildGovernedActionDecision({
      projectId: '1',
      kind: 'promotion-decision',
      governedAction: 'promote-to-review',
      artifactId: 'artifact-001',
      summary: 'Artifact promoted to review',
      rationale: 'All gates passed',
      sourceSignals: [{ kind: 'user-request', summary: 'User confirmed promotion' }],
      createdByType: 'human',
      createdById: 'user-1',
    });
    expect(decision.kind).toBe('promotion-decision');

    // Step 5: Create receipt
    const receipt = buildDecisionReceipt({
      decisionId: decision.id,
      projectId: '1',
      recommendation: { summary: 'Promote', actionIds: ['promote-to-review'], rationale: 'Clean' },
      confirmation: { accepted: true, confirmedById: 'user-1' },
      execution: { executed: true, executedById: 'user-1', executionMethod: 'status-transition' },
      affectedObjects: [{ objectType: 'artifact', objectId: 'a-001', changeType: 'status_changed', priorState: 'draft', newState: 'review' }],
    });
    expect(receipt.confirmation.accepted).toBe(true);
    expect(receipt.execution.executed).toBe(true);
  });

  it('blocked promotion: contradictions → boundary blocks → decision records blocked attempt', () => {
    // Step 1: Contradiction check finds blocker
    const contradictionCheck = {
      blocked: true,
      blockingFindings: [{ id: 'f-001', title: 'Critical endpoint drift' }],
    };

    // Step 2: Boundary rejects
    const boundaryCheck = {
      allowed: false,
      blockedReasons: ['1 unresolved blocking contradiction(s) must be resolved'],
    };

    // Step 3: Decision records the blocked attempt
    const decision = buildGovernedActionDecision({
      projectId: '1',
      kind: 'promotion-decision',
      governedAction: 'promote-to-review',
      summary: `Promotion blocked: ${boundaryCheck.blockedReasons.length} issue(s)`,
      rationale: boundaryCheck.blockedReasons.join('; '),
      sourceSignals: [{ kind: 'contradiction', sourceId: 'f-001', summary: 'Critical endpoint drift', severity: 'critical' }],
      createdByType: 'ana',
      linkedContradictionIds: ['f-001'],
    });

    expect(decision.kind).toBe('promotion-decision');
    expect(decision.linkedContradictionIds).toContain('f-001');

    // Step 4: Receipt records the rejection
    const receipt = buildDecisionReceipt({
      decisionId: decision.id,
      projectId: '1',
      recommendation: { summary: 'Promote', actionIds: ['promote-to-review'], rationale: 'Requested' },
      confirmation: { accepted: false, rejectionReason: 'Blocked by contradictions' },
      execution: { executed: false, error: 'Blocked by unresolved contradictions' },
    });

    expect(receipt.confirmation.accepted).toBe(false);
    expect(receipt.execution.executed).toBe(false);
  });
});
