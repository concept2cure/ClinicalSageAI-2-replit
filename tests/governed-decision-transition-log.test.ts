/**
 * Governed Decision Transition Log Tests
 *
 * Tests durable transition event recording, timeline queries,
 * review queue computation, and unresolved decision detection.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import {
  recordTransitionEvent,
  getDecisionTimeline,
  getProjectReviewQueue,
  hasUnresolvedGovernedDecisions,
  clearTransitionLog,
} from '../server/services/governed-decision-transition-log-service';

// ═══════════════════════════════════════════════════════════════════════
// Transition Event Recording
// ═══════════════════════════════════════════════════════════════════════

describe('Transition Log — Event Recording', () => {
  beforeEach(() => clearTransitionLog());

  it('records a transition event with all fields', () => {
    const event = recordTransitionEvent({
      decisionId: 'dec-1',
      organizationId: 1,
      projectId: 100,
      fromState: 'recommended_only',
      toState: 'under_review',
      action: 'review',
      actorId: 'user-1',
      actorRole: 'regulatory_affairs',
      reason: 'Submitted for team review',
    });

    expect(event.id).toBeTruthy();
    expect(event.decisionId).toBe('dec-1');
    expect(event.fromState).toBe('recommended_only');
    expect(event.toState).toBe('under_review');
    expect(event.actorId).toBe('user-1');
    expect(event.createdAt).toBeTruthy();
  });

  it('records multiple transitions for the same decision', () => {
    recordTransitionEvent({
      decisionId: 'dec-1', organizationId: 1, projectId: 100,
      fromState: 'recommended_only', toState: 'under_review',
      action: 'review', actorId: 'user-1',
    });
    recordTransitionEvent({
      decisionId: 'dec-1', organizationId: 1, projectId: 100,
      fromState: 'under_review', toState: 'approved',
      action: 'approve', actorId: 'user-2', reason: 'Meets criteria',
    });

    const timeline = getDecisionTimeline('dec-1');
    expect(timeline.length).toBe(2);
    expect(timeline[0].toState).toBe('under_review');
    expect(timeline[1].toState).toBe('approved');
  });

  it('each event gets a unique ID', () => {
    const e1 = recordTransitionEvent({
      decisionId: 'dec-1', organizationId: 1, projectId: 100,
      fromState: 'a', toState: 'b', action: 'test', actorId: 'u1',
    });
    const e2 = recordTransitionEvent({
      decisionId: 'dec-1', organizationId: 1, projectId: 100,
      fromState: 'b', toState: 'c', action: 'test', actorId: 'u1',
    });
    expect(e1.id).not.toBe(e2.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Timeline Queries
// ═══════════════════════════════════════════════════════════════════════

describe('Transition Log — Timeline', () => {
  beforeEach(() => clearTransitionLog());

  it('getDecisionTimeline returns events in chronological order', () => {
    recordTransitionEvent({
      decisionId: 'dec-1', organizationId: 1, projectId: 100,
      fromState: 'recommended_only', toState: 'under_review',
      action: 'review', actorId: 'user-1',
    });
    recordTransitionEvent({
      decisionId: 'dec-1', organizationId: 1, projectId: 100,
      fromState: 'under_review', toState: 'approved',
      action: 'approve', actorId: 'user-2',
    });
    recordTransitionEvent({
      decisionId: 'dec-1', organizationId: 1, projectId: 100,
      fromState: 'approved', toState: 'executed',
      action: 'execute', actorId: 'user-3',
    });

    const timeline = getDecisionTimeline('dec-1');
    expect(timeline.length).toBe(3);
    expect(timeline[0].toState).toBe('under_review');
    expect(timeline[1].toState).toBe('approved');
    expect(timeline[2].toState).toBe('executed');
  });

  it('timeline only includes events for the requested decision', () => {
    recordTransitionEvent({
      decisionId: 'dec-1', organizationId: 1, projectId: 100,
      fromState: 'a', toState: 'b', action: 'test', actorId: 'u1',
    });
    recordTransitionEvent({
      decisionId: 'dec-2', organizationId: 1, projectId: 100,
      fromState: 'a', toState: 'c', action: 'test', actorId: 'u1',
    });

    expect(getDecisionTimeline('dec-1').length).toBe(1);
    expect(getDecisionTimeline('dec-2').length).toBe(1);
    expect(getDecisionTimeline('dec-3').length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Review Queue
// ═══════════════════════════════════════════════════════════════════════

describe('Transition Log — Review Queue', () => {
  beforeEach(() => clearTransitionLog());

  it('empty project has empty queue', () => {
    const queue = getProjectReviewQueue(100, 1);
    expect(queue.pending.length).toBe(0);
    expect(queue.escalated.length).toBe(0);
  });

  it('decision under_review appears in pending', () => {
    recordTransitionEvent({
      decisionId: 'dec-1', organizationId: 1, projectId: 100,
      fromState: 'recommended_only', toState: 'under_review',
      action: 'review', actorId: 'u1',
    });

    const queue = getProjectReviewQueue(100, 1);
    expect(queue.pending).toContain('dec-1');
  });

  it('approved decision does not appear in queue', () => {
    recordTransitionEvent({
      decisionId: 'dec-1', organizationId: 1, projectId: 100,
      fromState: 'recommended_only', toState: 'under_review',
      action: 'review', actorId: 'u1',
    });
    recordTransitionEvent({
      decisionId: 'dec-1', organizationId: 1, projectId: 100,
      fromState: 'under_review', toState: 'approved',
      action: 'approve', actorId: 'u2',
    });

    const queue = getProjectReviewQueue(100, 1);
    expect(queue.pending.length).toBe(0);
  });

  it('escalated decision appears in escalated queue', () => {
    recordTransitionEvent({
      decisionId: 'dec-1', organizationId: 1, projectId: 100,
      fromState: 'under_review', toState: 'escalated',
      action: 'escalate', actorId: 'u1',
    });

    const queue = getProjectReviewQueue(100, 1);
    expect(queue.escalated).toContain('dec-1');
  });

  it('multiple decisions in different states', () => {
    recordTransitionEvent({
      decisionId: 'dec-1', organizationId: 1, projectId: 100,
      fromState: 'recommended_only', toState: 'under_review',
      action: 'review', actorId: 'u1',
    });
    recordTransitionEvent({
      decisionId: 'dec-2', organizationId: 1, projectId: 100,
      fromState: 'under_review', toState: 'escalated',
      action: 'escalate', actorId: 'u1',
    });
    recordTransitionEvent({
      decisionId: 'dec-3', organizationId: 1, projectId: 100,
      fromState: 'under_review', toState: 'rejected',
      action: 'reject', actorId: 'u1',
    });
    recordTransitionEvent({
      decisionId: 'dec-4', organizationId: 1, projectId: 100,
      fromState: 'recommended_only', toState: 'deferred',
      action: 'defer', actorId: 'u1',
    });

    const queue = getProjectReviewQueue(100, 1);
    expect(queue.pending.length).toBe(1);
    expect(queue.escalated.length).toBe(1);
    expect(queue.rejected.length).toBe(1);
    expect(queue.deferred.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Unresolved Decision Detection
// ═══════════════════════════════════════════════════════════════════════

describe('Transition Log — Unresolved Detection', () => {
  beforeEach(() => clearTransitionLog());

  it('no decisions = no unresolved', () => {
    const result = hasUnresolvedGovernedDecisions(100, 1);
    expect(result.hasUnresolved).toBe(false);
    expect(result.unresolvedCount).toBe(0);
  });

  it('under_review counts as unresolved', () => {
    recordTransitionEvent({
      decisionId: 'dec-1', organizationId: 1, projectId: 100,
      fromState: 'recommended_only', toState: 'under_review',
      action: 'review', actorId: 'u1',
    });

    const result = hasUnresolvedGovernedDecisions(100, 1);
    expect(result.hasUnresolved).toBe(true);
    expect(result.unresolvedCount).toBe(1);
  });

  it('escalated counts as unresolved', () => {
    recordTransitionEvent({
      decisionId: 'dec-1', organizationId: 1, projectId: 100,
      fromState: 'under_review', toState: 'escalated',
      action: 'escalate', actorId: 'u1',
    });

    const result = hasUnresolvedGovernedDecisions(100, 1);
    expect(result.hasUnresolved).toBe(true);
    expect(result.escalatedCount).toBe(1);
  });

  it('approved decision is resolved', () => {
    recordTransitionEvent({
      decisionId: 'dec-1', organizationId: 1, projectId: 100,
      fromState: 'recommended_only', toState: 'under_review',
      action: 'review', actorId: 'u1',
    });
    recordTransitionEvent({
      decisionId: 'dec-1', organizationId: 1, projectId: 100,
      fromState: 'under_review', toState: 'approved',
      action: 'approve', actorId: 'u2',
    });

    const result = hasUnresolvedGovernedDecisions(100, 1);
    expect(result.hasUnresolved).toBe(false);
  });

  it('end-to-end: evaluate → review → approve → downstream sees resolved', () => {
    // Simulate full lifecycle
    recordTransitionEvent({
      decisionId: 'dec-full', organizationId: 1, projectId: 100,
      fromState: 'recommended_only', toState: 'under_review',
      action: 'review', actorId: 'user-1', reason: 'Submitted for approval',
    });

    // While under review — unresolved
    expect(hasUnresolvedGovernedDecisions(100, 1).hasUnresolved).toBe(true);

    // Approve
    recordTransitionEvent({
      decisionId: 'dec-full', organizationId: 1, projectId: 100,
      fromState: 'under_review', toState: 'approved',
      action: 'approve', actorId: 'user-2', reason: 'All criteria met',
    });

    // After approval — resolved
    expect(hasUnresolvedGovernedDecisions(100, 1).hasUnresolved).toBe(false);

    // Timeline shows full history
    const timeline = getDecisionTimeline('dec-full');
    expect(timeline.length).toBe(2);
    expect(timeline[0].toState).toBe('under_review');
    expect(timeline[1].toState).toBe('approved');
    expect(timeline[1].reason).toBe('All criteria met');
  });
});
