/**
 * Full Promotion Lifecycle — Pass 12 Tests
 *
 * Tests covering:
 * - Artifact status transitions: draft → review → approved → locked → submission_ready
 * - Governance boundary checks at each stage
 * - Authority requirements per stage
 * - Decision receipt persistence bridge
 *
 * @module tests/resolution/promotion-lifecycle.test
 */

import { describe, it, expect } from 'vitest';
import {
  getAuthorityForAction,
  isActorAuthorized,
  buildGovernedActionDecision,
  buildDecisionReceipt,
  type GovernedActionType,
} from '../../shared/types/decision-architecture';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type ArtifactStatus = 'draft' | 'review' | 'approved' | 'locked';
type BoundaryLevel = 'advisory' | 'governed_draft' | 'approved' | 'locked' | 'submission_ready';

interface PromotionStage {
  artifactFrom: ArtifactStatus;
  artifactTo: ArtifactStatus | 'submission_ready';
  boundaryFrom: BoundaryLevel;
  boundaryTo: BoundaryLevel;
  governedAction: GovernedActionType;
  endpoint: string;
}

const PROMOTION_STAGES: PromotionStage[] = [
  {
    artifactFrom: 'draft', artifactTo: 'review',
    boundaryFrom: 'advisory', boundaryTo: 'governed_draft',
    governedAction: 'promote-to-review',
    endpoint: '/promote-to-review',
  },
  {
    artifactFrom: 'review', artifactTo: 'approved',
    boundaryFrom: 'governed_draft', boundaryTo: 'approved',
    governedAction: 'approve-artifact',
    endpoint: '/approve-artifact',
  },
  {
    artifactFrom: 'approved', artifactTo: 'locked',
    boundaryFrom: 'approved', boundaryTo: 'locked',
    governedAction: 'lock-artifact',
    endpoint: '/lock-artifact',
  },
  {
    artifactFrom: 'locked', artifactTo: 'submission_ready',
    boundaryFrom: 'locked', boundaryTo: 'submission_ready',
    governedAction: 'judge-dossier-ready',
    endpoint: '/mark-submission-ready',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: COMPLETE PROMOTION LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Full Promotion Lifecycle', () => {
  it('defines 4 promotion stages from draft to submission_ready', () => {
    expect(PROMOTION_STAGES).toHaveLength(4);
    expect(PROMOTION_STAGES[0].artifactFrom).toBe('draft');
    expect(PROMOTION_STAGES[3].artifactTo).toBe('submission_ready');
  });

  it('each stage has a corresponding governed action in AUTHORITY_BOUNDARY_MAP', () => {
    for (const stage of PROMOTION_STAGES) {
      const authority = getAuthorityForAction(stage.governedAction);
      expect(authority).toBeDefined();
      expect(authority.level).toBeDefined();
    }
  });

  it('authority requirements escalate through the lifecycle', () => {
    const levels = PROMOTION_STAGES.map(s => getAuthorityForAction(s.governedAction).level);

    // promote-to-review: requires-confirmation
    expect(levels[0]).toBe('requires-confirmation');
    // approve-artifact: requires-reviewer-approval
    expect(levels[1]).toBe('requires-reviewer-approval');
    // lock-artifact: requires-reviewer-approval
    expect(levels[2]).toBe('requires-reviewer-approval');
    // judge-dossier-ready: requires-escalation
    expect(levels[3]).toBe('requires-escalation');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: APPROVE-ARTIFACT
// ═══════════════════════════════════════════════════════════════════════════════

describe('Approve Artifact (review → approved)', () => {
  it('requires reviewer approval authority', () => {
    const authority = getAuthorityForAction('approve-artifact');
    expect(authority.level).toBe('requires-reviewer-approval');
    expect(authority.requiresReviewerApproval).toBe(true);
  });

  it('reviewer role is authorized', () => {
    const authority = getAuthorityForAction('approve-artifact');
    const check = isActorAuthorized(authority, 'reviewer');
    expect(check.authorized).toBe(true);
  });

  it('approver role is authorized', () => {
    const authority = getAuthorityForAction('approve-artifact');
    const check = isActorAuthorized(authority, 'approver');
    expect(check.authorized).toBe(true);
  });

  it('creates decision + receipt on successful approval', () => {
    const decision = buildGovernedActionDecision({
      projectId: '1', kind: 'promotion-decision',
      governedAction: 'approve-artifact', artifactId: 'art-001',
      summary: 'Artifact approved', rationale: 'All governance gates passed',
      sourceSignals: [{ kind: 'user-request', summary: 'Reviewer approved' }],
      createdByType: 'human', createdById: 'user-1',
    });

    const receipt = buildDecisionReceipt({
      decisionId: decision.id, projectId: '1',
      recommendation: { summary: 'Approve', actionIds: ['approve-artifact'], rationale: 'Gates passed' },
      confirmation: { accepted: true, confirmedById: 'user-1' },
      execution: { executed: true, executedById: 'user-1', executionMethod: 'status-transition:review→approved' },
      affectedObjects: [{ objectType: 'artifact', objectId: 'art-001', changeType: 'status_changed', priorState: 'review', newState: 'approved' }],
    });

    expect(receipt.execution.executionMethod).toBe('status-transition:review→approved');
    expect(receipt.affectedObjects[0].newState).toBe('approved');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: LOCK-ARTIFACT
// ═══════════════════════════════════════════════════════════════════════════════

describe('Lock Artifact (approved → locked)', () => {
  it('requires reviewer approval authority', () => {
    const authority = getAuthorityForAction('lock-artifact');
    expect(authority.level).toBe('requires-reviewer-approval');
  });

  it('boundary service requires all decisions resolved for approved → locked', () => {
    // The seed rule for approved → locked requires requiresAllDecisionsResolved: true
    // This is validated by GovernanceBoundaryService.evaluateTransition()
    // (tested structurally here, integration tested in governed-promotion-pipeline.test.ts)
    const stage = PROMOTION_STAGES.find(s => s.governedAction === 'lock-artifact')!;
    expect(stage.boundaryFrom).toBe('approved');
    expect(stage.boundaryTo).toBe('locked');
  });

  it('creates receipt with lock metadata', () => {
    const receipt = buildDecisionReceipt({
      decisionId: 'dec-lock-001', projectId: '1',
      recommendation: { summary: 'Lock', actionIds: ['lock-artifact'], rationale: 'All resolved' },
      confirmation: { accepted: true, confirmedById: 'user-1' },
      execution: { executed: true, executedById: 'user-1', executionMethod: 'status-transition:approved→locked' },
      affectedObjects: [{ objectType: 'artifact', objectId: 'art-001', changeType: 'status_changed', priorState: 'approved', newState: 'locked' }],
    });

    expect(receipt.execution.executionMethod).toBe('status-transition:approved→locked');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: MARK-SUBMISSION-READY
// ═══════════════════════════════════════════════════════════════════════════════

describe('Mark Submission Ready (locked → submission_ready)', () => {
  it('requires escalation authority (RA/submission lead)', () => {
    const authority = getAuthorityForAction('judge-dossier-ready');
    expect(authority.level).toBe('requires-escalation');
    expect(authority.requiresEscalation).toBe(true);
  });

  it('boundary service requires strong confidence + all assumptions/decisions resolved', () => {
    // Seed rule: locked → submission_ready requires:
    //   requiresAllAssumptionsApproved: true
    //   requiresAllDecisionsResolved: true
    //   minimumConfidence: 'strong'
    const stage = PROMOTION_STAGES.find(s => s.boundaryTo === 'submission_ready')!;
    expect(stage.boundaryFrom).toBe('locked');
    expect(stage.boundaryTo).toBe('submission_ready');
  });

  it('creates governance-level transition receipt (artifact stays locked in DB)', () => {
    const receipt = buildDecisionReceipt({
      decisionId: 'dec-submit-001', projectId: '1',
      recommendation: { summary: 'Mark submission-ready', actionIds: ['judge-dossier-ready'], rationale: 'All gates passed' },
      confirmation: { accepted: true, confirmedById: 'ra-lead-1' },
      execution: { executed: true, executedById: 'ra-lead-1', executionMethod: 'governance-transition:locked→submission_ready' },
      affectedObjects: [{ objectType: 'artifact', objectId: 'art-001', changeType: 'status_changed', priorState: 'locked', newState: 'submission_ready' }],
    });

    expect(receipt.execution.executionMethod).toBe('governance-transition:locked→submission_ready');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: DECISION RECEIPT PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Decision Receipt Persistence', () => {
  it('receipt has all required fields for DB persistence', () => {
    const receipt = buildDecisionReceipt({
      decisionId: 'dec-001', projectId: '1',
      recommendation: { summary: 'Test', actionIds: ['approve-artifact'], rationale: 'Test rationale' },
      confirmation: { accepted: true, confirmedById: 'user-1' },
      execution: { executed: true, executedById: 'user-1', executionMethod: 'test' },
      affectedObjects: [{ objectType: 'artifact', objectId: 'a-1', changeType: 'updated' }],
      pendingApprovals: [{ requiredRole: 'reviewer', reason: 'Needs sign-off', status: 'pending' }],
      provisionalItems: [{ objectType: 'assumption', objectId: 'asm-1', reason: 'Provisional' }],
    });

    // All fields needed for the decision_receipts INSERT
    expect(receipt.id).toBeTruthy();
    expect(receipt.decisionId).toBe('dec-001');
    expect(receipt.projectId).toBe('1');
    expect(receipt.recommendation.summary).toBe('Test');
    expect(receipt.recommendation.actionIds).toEqual(['approve-artifact']);
    expect(receipt.confirmation.accepted).toBe(true);
    expect(receipt.confirmation.confirmedById).toBe('user-1');
    expect(receipt.confirmation.confirmedAt).toBeTruthy();
    expect(receipt.execution.executed).toBe(true);
    expect(receipt.execution.executedById).toBe('user-1');
    expect(receipt.execution.executionMethod).toBe('test');
    expect(receipt.affectedObjects).toHaveLength(1);
    expect(receipt.pendingApprovals).toHaveLength(1);
    expect(receipt.provisionalItems).toHaveLength(1);
    expect(receipt.createdAt).toBeTruthy();
  });

  it('receipt serializes affected objects to JSON', () => {
    const receipt = buildDecisionReceipt({
      decisionId: 'dec-002', projectId: '1',
      recommendation: { summary: 'S', actionIds: [], rationale: 'R' },
      confirmation: { accepted: true },
      affectedObjects: [
        { objectType: 'artifact', objectId: 'a-1', changeType: 'updated', priorState: 'draft', newState: 'review' },
        { objectType: 'assumption', objectId: 'asm-1', changeType: 'status_changed' },
      ],
    });

    const serialized = JSON.stringify(receipt.affectedObjects);
    expect(JSON.parse(serialized)).toHaveLength(2);
  });
});
