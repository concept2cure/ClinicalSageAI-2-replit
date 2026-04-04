/**
 * Governed Decision Stack — DB Integration Tests
 *
 * Tests that verify the governed decision repository returns correct
 * structures and handles DB unavailability gracefully. All functions
 * must return safe defaults without throwing.
 */

import { describe, expect, it } from 'vitest';

import {
  recordGovernedDecisionSync,
  getRecentGovernedDecisions,
  getGovernedDecisionSummary,
  getDecisionTimeline,
  getProjectReviewQueue,
  hasUnresolvedGovernedDecisions,
  recordTransitionEvent,
  isValidTransition,
  GOVERNED_DECISION_REPOSITORY_VERSION,
} from '../server/services/governed-decision-repository';

// ═══════════════════════════════════════════════════════════════════════
// Structure + Graceful Degradation Tests
// ═══════════════════════════════════════════════════════════════════════

describe('Governed Decision Repository — Integration', () => {
  it('repository version is 2.0.0', () => {
    expect(GOVERNED_DECISION_REPOSITORY_VERSION).toBe('2.0.0');
  });

  it('getRecentGovernedDecisions returns empty array for non-existent project', async () => {
    const results = await getRecentGovernedDecisions({
      organizationId: '999999',
      projectId: '999999',
      limit: 10,
    });
    expect(results).toEqual([]);
  });

  it('getGovernedDecisionSummary returns zeroed summary for non-existent project', async () => {
    const summary = await getGovernedDecisionSummary({
      organizationId: '999999',
      projectId: '999999',
    });
    expect(summary.total).toBe(0);
    expect(summary.blockedCount).toBe(0);
    expect(summary.averageReadinessScore).toBe(0);
    expect(summary.byOutcome).toHaveProperty('allow');
    expect(summary.byOutcome).toHaveProperty('block');
  });

  it('getProjectReviewQueue returns empty queues for non-existent project', async () => {
    const queue = await getProjectReviewQueue(999999, 999999);
    expect(queue.pending).toEqual([]);
    expect(queue.escalated).toEqual([]);
    expect(queue.deferred).toEqual([]);
    expect(queue.rejected).toEqual([]);
  });

  it('hasUnresolvedGovernedDecisions returns false for non-existent project', async () => {
    const result = await hasUnresolvedGovernedDecisions(999999, 999999);
    expect(result.hasUnresolved).toBe(false);
    expect(result.unresolvedCount).toBe(0);
    expect(result.escalatedCount).toBe(0);
    expect(result.states).toEqual({
      under_review: 0,
      escalated: 0,
      deferred: 0,
      rejected: 0,
    });
  });

  it('getDecisionTimeline returns empty for non-existent decision', async () => {
    const timeline = await getDecisionTimeline('00000000-0000-0000-0000-000000000000', 999999);
    expect(timeline).toEqual([]);
  });

  it('isValidTransition is pure logic — no DB dependency', () => {
    expect(isValidTransition('recommended_only', 'under_review')).toBe(true);
    expect(isValidTransition('superseded', 'approved')).toBe(false);
    expect(isValidTransition('approved', 'executed')).toBe(true);
    expect(isValidTransition('executed', 'approved')).toBe(false);
  });

  it('all query functions handle unavailability without throwing', async () => {
    const results = await Promise.allSettled([
      getRecentGovernedDecisions({ organizationId: '1', projectId: '1' }),
      getGovernedDecisionSummary({ organizationId: '1', projectId: '1' }),
      getProjectReviewQueue(1, 1),
      hasUnresolvedGovernedDecisions(1, 1),
      getDecisionTimeline('test-id', 1),
    ]);
    // Every call must fulfill (not reject) — graceful degradation
    for (const result of results) {
      expect(result.status).toBe('fulfilled');
    }
  });

  it('recordTransitionEvent returns a complete event structure', async () => {
    const event = await recordTransitionEvent({
      decisionId: 'test-decision-integration',
      organizationId: 999999,
      projectId: 999999,
      fromState: 'recommended_only',
      toState: 'under_review',
      action: 'review',
      actorId: 'test-actor',
      reason: 'Integration test',
    });

    expect(event.id).toBeTruthy();
    expect(event.id.length).toBeGreaterThan(10); // UUID format
    expect(event.decisionId).toBe('test-decision-integration');
    expect(event.fromState).toBe('recommended_only');
    expect(event.toState).toBe('under_review');
    expect(event.actorId).toBe('test-actor');
    expect(event.reason).toBe('Integration test');
    expect(event.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO format
  });
});
