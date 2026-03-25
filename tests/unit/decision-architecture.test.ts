/**
 * Decision Architecture — Comprehensive test suite for Pass 7.
 *
 * Tests cover:
 * - DecisionRecord construction
 * - Authority requirement mapping
 * - Confirmation-required path
 * - Reviewer-approval-required path
 * - Escalation-required path
 * - Decision receipt creation
 * - Blocked promotion decision
 * - Provisional result handling
 * - Contradiction consequence decision path
 * - Failure behavior when persistence/context/authority is missing
 * - Decision status transitions
 * - Decision-aware gating
 */

import { describe, it, expect } from 'vitest';
import {
  type DecisionStatus,
  type DecisionKind,
  type GovernedActionType,
  type FormalDecisionRecord,
  type DecisionReceipt,
  type AuthorityRequirement,
  AUTHORITY_BOUNDARY_MAP,
  getAuthorityForAction,
  isActorAuthorized,
  isValidTransition,
  createDecisionId,
  createReceiptId,
  buildPreflightDecision,
  buildGovernedActionDecision,
  buildDecisionReceipt,
} from '../../shared/types/decision-architecture';

// ─── Decision Record Construction ────────────────────────────────────────────

describe('DecisionRecord construction', () => {
  it('buildPreflightDecision produces a valid decision record', () => {
    const decision = buildPreflightDecision({
      projectId: 'proj-1',
      kind: 'section-preflight-judgment',
      sectionCode: '2.5',
      overall: 'blocked',
      summary: 'Section blocked by 2 failed checks',
      sourceSignals: [
        { kind: 'contradiction', summary: 'Dose inconsistency', severity: 'critical' },
        { kind: 'body-gap', summary: 'Missing efficacy endpoint', severity: 'major' },
      ],
      recommendedActionIds: ['prepare-correction-draft', 'gather-body-evidence'],
      regulatorBody: 'FDA',
      submissionType: 'IND',
    });

    expect(decision.id).toMatch(/^dec_/);
    expect(decision.projectId).toBe('proj-1');
    expect(decision.kind).toBe('section-preflight-judgment');
    expect(decision.status).toBe('recommended'); // blocked preflights are recommended decisions
    expect(decision.sectionCode).toBe('2.5');
    expect(decision.regulatorBody).toBe('FDA');
    expect(decision.submissionType).toBe('IND');
    expect(decision.sourceSignals).toHaveLength(2);
    expect(decision.recommendedActionIds).toHaveLength(2);
    expect(decision.authority.level).toBe('autonomous-read');
    expect(decision.createdByType).toBe('system');
    expect(decision.createdAt).toBeTruthy();
    expect(decision.updatedAt).toBeTruthy();
  });

  it('buildGovernedActionDecision produces a valid governed decision', () => {
    const decision = buildGovernedActionDecision({
      projectId: 'proj-2',
      kind: 'promotion-decision',
      governedAction: 'promote-to-review',
      artifactId: 'art-42',
      summary: 'Promote to review',
      rationale: 'All preflight checks pass',
      sourceSignals: [{ kind: 'user-request', summary: 'User initiated promotion' }],
      createdByType: 'human',
      createdById: 'user-123',
    });

    expect(decision.id).toMatch(/^dec_/);
    expect(decision.kind).toBe('promotion-decision');
    expect(decision.status).toBe('recommended');
    expect(decision.authority.requiresHumanConfirmation).toBe(true);
    expect(decision.createdByType).toBe('human');
    expect(decision.createdById).toBe('user-123');
  });

  it('module-preflight-judgment maps to autonomous-read authority', () => {
    const decision = buildPreflightDecision({
      projectId: 'p1',
      kind: 'module-preflight-judgment',
      moduleCode: 'm2',
      overall: 'ready',
      summary: 'Module ready',
      sourceSignals: [],
    });
    expect(decision.authority.level).toBe('autonomous-read');
    expect(decision.authority.requiresHumanConfirmation).toBe(false);
  });

  it('dossier-preflight-judgment maps to autonomous-read authority', () => {
    const decision = buildPreflightDecision({
      projectId: 'p1',
      kind: 'dossier-preflight-judgment',
      overall: 'provisional',
      summary: 'Dossier provisional',
      sourceSignals: [{ kind: 'readiness-blocker', summary: 'Module m3 has warnings' }],
    });
    expect(decision.status).toBe('provisional');
    expect(decision.authority.level).toBe('autonomous-read');
  });

  it('needs-reapproval overall maps to escalated status', () => {
    const decision = buildPreflightDecision({
      projectId: 'p1',
      kind: 'section-preflight-judgment',
      overall: 'needs-reapproval',
      summary: 'Upstream decision changed',
      sourceSignals: [],
    });
    expect(decision.status).toBe('escalated');
  });

  it('unique decision IDs', () => {
    const id1 = createDecisionId();
    const id2 = createDecisionId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^dec_/);
    expect(id2).toMatch(/^dec_/);
  });
});

// ─── Authority Requirement Mapping ───────────────────────────────────────────

describe('Authority requirement mapping', () => {
  it('AUTHORITY_BOUNDARY_MAP has all expected actions', () => {
    const actions = AUTHORITY_BOUNDARY_MAP.map(e => e.action);
    expect(actions).toContain('run-section-preflight');
    expect(actions).toContain('run-module-preflight');
    expect(actions).toContain('run-dossier-preflight');
    expect(actions).toContain('explain-preflight-results');
    expect(actions).toContain('prepare-correction-draft');
    expect(actions).toContain('prepare-harmonization-suggestion');
    expect(actions).toContain('gather-evidence');
    expect(actions).toContain('promote-to-review');
    expect(actions).toContain('approve-artifact');
    expect(actions).toContain('lock-artifact');
    expect(actions).toContain('judge-module-ready');
    expect(actions).toContain('judge-dossier-ready');
    expect(actions).toContain('create-contradiction-consequence');
    expect(actions).toContain('execute-multi-object-correction');
  });

  it('read-only actions are autonomous', () => {
    for (const action of ['run-section-preflight', 'run-module-preflight', 'run-dossier-preflight', 'explain-preflight-results'] as GovernedActionType[]) {
      const auth = getAuthorityForAction(action);
      expect(auth.level).toBe('autonomous-read');
      expect(auth.requiresHumanConfirmation).toBe(false);
    }
  });

  it('draft-preparation actions require confirmation', () => {
    for (const action of ['prepare-correction-draft', 'prepare-harmonization-suggestion', 'gather-evidence'] as GovernedActionType[]) {
      const auth = getAuthorityForAction(action);
      expect(auth.level).toBe('requires-confirmation');
      expect(auth.requiresHumanConfirmation).toBe(true);
    }
  });

  it('promote-to-review requires confirmation', () => {
    const auth = getAuthorityForAction('promote-to-review');
    expect(auth.level).toBe('requires-confirmation');
    expect(auth.requiresHumanConfirmation).toBe(true);
  });

  it('approve-artifact requires reviewer approval', () => {
    const auth = getAuthorityForAction('approve-artifact');
    expect(auth.level).toBe('requires-reviewer-approval');
    expect(auth.requiresReviewerApproval).toBe(true);
    expect(auth.allowedActorRoles).toContain('reviewer');
    expect(auth.allowedActorRoles).toContain('approver');
  });

  it('lock-artifact requires reviewer approval with restricted roles', () => {
    const auth = getAuthorityForAction('lock-artifact');
    expect(auth.level).toBe('requires-reviewer-approval');
    expect(auth.allowedActorRoles).toContain('approver');
    expect(auth.allowedActorRoles).toContain('submission_lead');
  });

  it('judge-module-ready requires escalation', () => {
    const auth = getAuthorityForAction('judge-module-ready');
    expect(auth.level).toBe('requires-escalation');
    expect(auth.requiresEscalation).toBe(true);
    expect(auth.allowedActorRoles).toContain('ra_lead');
  });

  it('judge-dossier-ready requires escalation', () => {
    const auth = getAuthorityForAction('judge-dossier-ready');
    expect(auth.level).toBe('requires-escalation');
    expect(auth.requiresEscalation).toBe(true);
    expect(auth.allowedActorRoles).toContain('submission_lead');
  });

  it('execute-multi-object-correction is forbidden', () => {
    const auth = getAuthorityForAction('execute-multi-object-correction');
    expect(auth.level).toBe('forbidden');
    expect(auth.blockedReason).toBeTruthy();
  });

  it('unknown action defaults to escalation (fail-safe)', () => {
    const auth = getAuthorityForAction('unknown-action' as GovernedActionType);
    expect(auth.level).toBe('requires-escalation');
    expect(auth.requiresEscalation).toBe(true);
    expect(auth.blockedReason).toContain('Unknown governed action');
  });
});

// ─── Actor Authorization ─────────────────────────────────────────────────────

describe('Actor authorization', () => {
  it('autonomous-read always authorizes', () => {
    const auth: AuthorityRequirement = { level: 'autonomous-read', requiresHumanConfirmation: false, requiresReviewerApproval: false, requiresEscalation: false };
    expect(isActorAuthorized(auth).authorized).toBe(true);
    expect(isActorAuthorized(auth, 'viewer').authorized).toBe(true);
  });

  it('forbidden never authorizes', () => {
    const auth: AuthorityRequirement = { level: 'forbidden', requiresHumanConfirmation: true, requiresReviewerApproval: true, requiresEscalation: true, blockedReason: 'Not allowed' };
    expect(isActorAuthorized(auth).authorized).toBe(false);
    expect(isActorAuthorized(auth, 'admin').authorized).toBe(false);
    expect(isActorAuthorized(auth).reason).toBe('Not allowed');
  });

  it('role restriction blocks unauthorized actors', () => {
    const auth: AuthorityRequirement = { level: 'requires-reviewer-approval', requiresHumanConfirmation: true, requiresReviewerApproval: true, requiresEscalation: false, allowedActorRoles: ['reviewer', 'ra_lead'] };
    expect(isActorAuthorized(auth, 'reviewer').authorized).toBe(true);
    expect(isActorAuthorized(auth, 'ra_lead').authorized).toBe(true);
    expect(isActorAuthorized(auth, 'author').authorized).toBe(false);
    expect(isActorAuthorized(auth).authorized).toBe(false); // no role → blocked
  });

  it('actor role unknown returns blocked with reason', () => {
    const auth = getAuthorityForAction('approve-artifact');
    const result = isActorAuthorized(auth);
    expect(result.authorized).toBe(false);
    expect(result.reason).toContain('Requires one of');
  });
});

// ─── Decision Status Transitions ─────────────────────────────────────────────

describe('Decision status transitions', () => {
  it('recommended → confirmed is valid', () => {
    expect(isValidTransition('recommended', 'confirmed')).toBe(true);
  });

  it('recommended → rejected is valid', () => {
    expect(isValidTransition('recommended', 'rejected')).toBe(true);
  });

  it('recommended → escalated is valid', () => {
    expect(isValidTransition('recommended', 'escalated')).toBe(true);
  });

  it('confirmed → executed is valid', () => {
    expect(isValidTransition('confirmed', 'executed')).toBe(true);
  });

  it('executed → approved is valid', () => {
    expect(isValidTransition('executed', 'approved')).toBe(true);
  });

  it('executed → provisional is valid', () => {
    expect(isValidTransition('executed', 'provisional')).toBe(true);
  });

  it('provisional → approved is valid', () => {
    expect(isValidTransition('provisional', 'approved')).toBe(true);
  });

  it('approved → superseded is valid', () => {
    expect(isValidTransition('approved', 'superseded')).toBe(true);
  });

  it('superseded → anything is invalid', () => {
    expect(isValidTransition('superseded', 'recommended')).toBe(false);
    expect(isValidTransition('superseded', 'approved')).toBe(false);
  });

  it('recommended → executed is invalid (must confirm first)', () => {
    expect(isValidTransition('recommended', 'executed')).toBe(false);
  });

  it('rejected → confirmed is invalid', () => {
    expect(isValidTransition('rejected', 'confirmed')).toBe(false);
  });

  it('escalated → confirmed is valid (escalation can be resolved)', () => {
    expect(isValidTransition('escalated', 'confirmed')).toBe(true);
  });
});

// ─── Decision Receipt ────────────────────────────────────────────────────────

describe('Decision receipt creation', () => {
  it('buildDecisionReceipt creates a valid receipt', () => {
    const receipt = buildDecisionReceipt({
      decisionId: 'dec_test_1',
      projectId: 'proj-1',
      recommendation: {
        summary: 'Promote artifact to review',
        actionIds: ['promote-to-review'],
        rationale: 'All checks pass',
      },
      confirmation: {
        accepted: true,
        confirmedById: 'user-1',
      },
      execution: {
        executed: true,
        executedById: 'user-1',
        executionMethod: 'status-transition:draft→review',
      },
      affectedObjects: [{
        objectType: 'artifact',
        objectId: 'art-42',
        previousState: 'draft',
        newState: 'review',
        changeDescription: 'Status changed to review',
      }],
      pendingApprovals: [{
        requiredRole: 'reviewer',
        reason: 'Artifact needs reviewer sign-off',
        status: 'pending',
      }],
    });

    expect(receipt.id).toMatch(/^rcpt_/);
    expect(receipt.decisionId).toBe('dec_test_1');
    expect(receipt.confirmation.accepted).toBe(true);
    expect(receipt.confirmation.confirmedById).toBe('user-1');
    expect(receipt.execution.executed).toBe(true);
    expect(receipt.affectedObjects).toHaveLength(1);
    expect(receipt.affectedObjects[0].previousState).toBe('draft');
    expect(receipt.affectedObjects[0].newState).toBe('review');
    expect(receipt.pendingApprovals).toHaveLength(1);
    expect(receipt.pendingApprovals[0].status).toBe('pending');
  });

  it('rejected confirmation receipt', () => {
    const receipt = buildDecisionReceipt({
      decisionId: 'dec_test_2',
      projectId: 'proj-1',
      recommendation: { summary: 'Apply correction', actionIds: ['prepare-correction-draft'], rationale: 'Contradiction found' },
      confirmation: { accepted: false, rejectionReason: 'Not applicable' },
    });

    expect(receipt.confirmation.accepted).toBe(false);
    expect(receipt.confirmation.rejectionReason).toBe('Not applicable');
    expect(receipt.execution.executed).toBe(false);
    expect(receipt.affectedObjects).toHaveLength(0);
    expect(receipt.pendingApprovals).toHaveLength(0);
  });

  it('receipt with provisional items', () => {
    const receipt = buildDecisionReceipt({
      decisionId: 'dec_test_3',
      projectId: 'proj-1',
      recommendation: { summary: 'Harmonize sections', actionIds: ['harmonize'], rationale: 'Inconsistency found' },
      confirmation: { accepted: true },
      execution: { executed: true, executionMethod: 'harmonize-engine' },
      provisionalItems: [
        { objectType: 'section', objectId: '2.5', reason: 'Pending reviewer confirmation' },
        { objectType: 'section', objectId: '5.3', reason: 'Cross-ref not yet verified' },
      ],
    });

    expect(receipt.provisionalItems).toHaveLength(2);
    expect(receipt.provisionalItems[0].reason).toContain('reviewer confirmation');
  });

  it('unique receipt IDs', () => {
    const id1 = createReceiptId();
    const id2 = createReceiptId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^rcpt_/);
  });
});

// ─── Blocked Promotion Decision ──────────────────────────────────────────────

describe('Blocked promotion decision', () => {
  it('creates a decision with authority boundary for blocked promotion', () => {
    const decision = buildGovernedActionDecision({
      projectId: 'proj-1',
      kind: 'promotion-decision',
      governedAction: 'promote-to-review',
      artifactId: 'art-42',
      summary: 'Promotion blocked: 2 unresolved contradictions',
      rationale: 'Dose inconsistency; Missing endpoint definition',
      sourceSignals: [
        { kind: 'contradiction', summary: 'Dose inconsistency', severity: 'critical' },
        { kind: 'contradiction', summary: 'Missing endpoint', severity: 'critical' },
      ],
      createdByType: 'ana',
    });

    expect(decision.status).toBe('recommended');
    expect(decision.authority.requiresHumanConfirmation).toBe(true);
    expect(decision.sourceSignals).toHaveLength(2);
    expect(decision.sourceSignals[0].severity).toBe('critical');
  });
});

// ─── Provisional Result Handling ─────────────────────────────────────────────

describe('Provisional result handling', () => {
  it('preflight with warnings produces provisional status', () => {
    const decision = buildPreflightDecision({
      projectId: 'p1',
      kind: 'section-preflight-judgment',
      overall: 'provisional',
      summary: 'Section has warnings',
      sourceSignals: [
        { kind: 'cross-section-inconsistency', summary: 'Minor terminology difference', severity: 'minor' },
      ],
    });
    expect(decision.status).toBe('provisional');
  });

  it('executed but pending approval creates provisional receipt', () => {
    const receipt = buildDecisionReceipt({
      decisionId: 'dec-prov',
      projectId: 'p1',
      recommendation: { summary: 'Promote', actionIds: ['promote-to-review'], rationale: 'Ready' },
      confirmation: { accepted: true },
      execution: { executed: true },
      pendingApprovals: [{ requiredRole: 'reviewer', reason: 'Needs sign-off', status: 'pending' }],
      provisionalItems: [{ objectType: 'artifact', objectId: 'a1', reason: 'Awaiting reviewer approval' }],
    });
    expect(receipt.execution.executed).toBe(true);
    expect(receipt.pendingApprovals).toHaveLength(1);
    expect(receipt.provisionalItems).toHaveLength(1);
  });
});

// ─── Contradiction Consequence Decision Path ─────────────────────────────────

describe('Contradiction consequence decision path', () => {
  it('builds a contradiction-resolution decision from a finding', () => {
    const decision = buildGovernedActionDecision({
      projectId: 'proj-1',
      kind: 'contradiction-resolution-decision',
      governedAction: 'create-contradiction-consequence',
      sectionCode: '2.5',
      summary: 'Contradiction: dose inconsistency between protocol and CSR',
      rationale: 'Severity: critical. 2 consequence paths available.',
      sourceSignals: [{
        kind: 'contradiction',
        id: 'c-123',
        summary: 'Dose inconsistency between protocol (10mg) and CSR (15mg)',
        severity: 'critical',
      }],
      createdByType: 'system',
      linkedContradictionIds: ['c-123'],
    });

    expect(decision.kind).toBe('contradiction-resolution-decision');
    expect(decision.authority.requiresHumanConfirmation).toBe(true);
    expect(decision.linkedContradictionIds).toEqual(['c-123']);
    expect(decision.sourceSignals[0].kind).toBe('contradiction');
  });
});

// ─── Failure Behavior ────────────────────────────────────────────────────────

describe('Failure behavior', () => {
  it('unknown action authority defaults to escalation', () => {
    const auth = getAuthorityForAction('nonexistent' as GovernedActionType);
    expect(auth.level).toBe('requires-escalation');
    expect(auth.blockedReason).toContain('Unknown');
  });

  it('actor with no role cannot approve', () => {
    const auth = getAuthorityForAction('approve-artifact');
    const result = isActorAuthorized(auth, undefined);
    expect(result.authorized).toBe(false);
  });

  it('invalid transition returns false', () => {
    expect(isValidTransition('superseded', 'recommended')).toBe(false);
    expect(isValidTransition('approved', 'confirmed')).toBe(false);
    expect(isValidTransition('rejected', 'executed')).toBe(false);
  });

  it('missing context returns safe defaults in decision', () => {
    const decision = buildPreflightDecision({
      projectId: '',
      kind: 'section-preflight-judgment',
      overall: 'needs-review',
      summary: 'Manual review needed',
      sourceSignals: [],
    });
    expect(decision.projectId).toBe('');
    expect(decision.status).toBe('recommended');
    expect(decision.sourceSignals).toHaveLength(0);
    expect(decision.authority).toBeDefined();
  });

  it('receipt with execution error records failure', () => {
    const receipt = buildDecisionReceipt({
      decisionId: 'dec-err',
      projectId: 'p1',
      recommendation: { summary: 'Promote', actionIds: ['promote-to-review'], rationale: 'Ready' },
      confirmation: { accepted: true },
      execution: { executed: false, error: 'Database connection failed' },
    });
    expect(receipt.execution.executed).toBe(false);
    expect(receipt.execution.error).toBe('Database connection failed');
  });
});

// ─── Integration: Full Workflow Lifecycle ─────────────────────────────────────

describe('Full workflow lifecycle', () => {
  it('section preflight → promotion decision → receipt', () => {
    // 1. Section preflight creates a judgment decision
    const pfDecision = buildPreflightDecision({
      projectId: 'proj-1',
      kind: 'section-preflight-judgment',
      sectionCode: '2.5',
      overall: 'ready',
      summary: 'All checks pass',
      sourceSignals: [],
      recommendedActionIds: ['promote-to-review'],
    });
    expect(pfDecision.status).toBe('recommended');
    expect(pfDecision.recommendedActionIds).toContain('promote-to-review');

    // 2. User confirms → promotion decision
    const promoteDecision = buildGovernedActionDecision({
      projectId: 'proj-1',
      kind: 'promotion-decision',
      governedAction: 'promote-to-review',
      artifactId: 'art-1',
      summary: 'Promote to review',
      rationale: 'Preflight passed',
      sourceSignals: [{ kind: 'user-request', summary: 'User confirmed promotion' }],
      createdByType: 'human',
      createdById: 'user-1',
    });
    expect(promoteDecision.authority.requiresHumanConfirmation).toBe(true);

    // 3. Receipt records what happened
    const receipt = buildDecisionReceipt({
      decisionId: promoteDecision.id,
      projectId: 'proj-1',
      recommendation: { summary: 'Promote', actionIds: ['promote-to-review'], rationale: 'Ready' },
      confirmation: { accepted: true, confirmedById: 'user-1' },
      execution: { executed: true, executedById: 'user-1', executionMethod: 'status-transition:draft→review' },
      affectedObjects: [{ objectType: 'artifact', objectId: 'art-1', previousState: 'draft', newState: 'review' }],
      pendingApprovals: [{ requiredRole: 'reviewer', reason: 'Needs sign-off', status: 'pending' }],
    });
    expect(receipt.decisionId).toBe(promoteDecision.id);
    expect(receipt.execution.executed).toBe(true);
    expect(receipt.pendingApprovals[0].status).toBe('pending');
  });

  it('contradiction finding → correction decision → receipt', () => {
    // 1. Contradiction creates a resolution decision
    const decision = buildGovernedActionDecision({
      projectId: 'proj-1',
      kind: 'contradiction-resolution-decision',
      governedAction: 'create-contradiction-consequence',
      sectionCode: '2.5',
      summary: 'Dose inconsistency detected',
      rationale: 'Protocol says 10mg, CSR says 15mg',
      sourceSignals: [{ kind: 'contradiction', id: 'c-1', summary: 'Dose mismatch', severity: 'critical' }],
      createdByType: 'system',
      linkedContradictionIds: ['c-1'],
    });

    // 2. User rejects the recommendation
    const receipt = buildDecisionReceipt({
      decisionId: decision.id,
      projectId: 'proj-1',
      recommendation: { summary: 'Correct dose inconsistency', actionIds: ['prepare-correction-draft'], rationale: 'Critical contradiction' },
      confirmation: { accepted: false, rejectionReason: 'Will address in next review cycle' },
    });
    expect(receipt.confirmation.accepted).toBe(false);
    expect(receipt.confirmation.rejectionReason).toContain('next review cycle');
    expect(receipt.execution.executed).toBe(false);
  });

  it('escalation path triggered for module readiness judgment', () => {
    const decision = buildGovernedActionDecision({
      projectId: 'proj-1',
      kind: 'other',
      governedAction: 'judge-module-ready',
      moduleCode: 'm2',
      summary: 'Module 2 ready for submission',
      rationale: 'All sections pass',
      sourceSignals: [],
      createdByType: 'ana',
    });

    expect(decision.authority.level).toBe('requires-escalation');
    expect(decision.authority.requiresEscalation).toBe(true);
    expect(decision.authority.allowedActorRoles).toContain('ra_lead');

    // Author cannot approve — escalation required
    const authCheck = isActorAuthorized(decision.authority, 'author');
    expect(authCheck.authorized).toBe(false);

    // RA lead can approve
    const raCheck = isActorAuthorized(decision.authority, 'ra_lead');
    expect(raCheck.authorized).toBe(true);
  });
});
