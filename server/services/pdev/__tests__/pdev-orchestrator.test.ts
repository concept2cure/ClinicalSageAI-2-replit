/**
 * Pure-math tests for the workstream rollup. Does not touch the DB —
 * the db module is mocked because importing the orchestrator pulls in
 * db/runtime which eagerly throws when no DATABASE_URL is set.
 */
import { describe, expect, test, vi } from 'vitest';

vi.mock('../../../db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => [] }) }) }),
  },
  pool: undefined,
  getPool: () => {
    throw new Error('not in test scope');
  },
}));

import { computeWorkstreamRollup } from '../pdev-orchestrator';
import {
  PDEV_ACTIVITIES,
  type PdevActivity,
  type PdevActivityState,
} from '../pdev-activity-registry';

function mkActivityView(registry: PdevActivity, state: PdevActivityState | null) {
  return {
    registry,
    state: state
      ? ({
          id: 'fake',
          programId: 'fake',
          activityKey: registry.key,
          workstream: registry.workstream,
          stage: registry.stage,
          state,
          ownerUserId: null,
          reviewerUserId: null,
          notes: null,
          attachedDocumentCodes: [],
          evidenceObjectIds: [],
          openContradictionIds: [],
          dueDate: null,
          stateChangedAt: new Date(),
          stateChangedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any)
      : null,
  };
}

const cmc = PDEV_ACTIVITIES.filter(a => a.workstream === 'cmc');

describe('pdev orchestrator rollup math', () => {
  test('empty workstream yields zero readiness', () => {
    const r = computeWorkstreamRollup('cmc', []);
    expect(r.totalActivities).toBe(0);
    expect(r.readinessScore).toBe(40); // 60*0 + 40*1 (no blocking → ratio 1)
  });

  test('all activities not_started → readiness ~0', () => {
    const views = cmc.map(a => mkActivityView(a, 'not_started'));
    const r = computeWorkstreamRollup('cmc', views);
    expect(r.totalActivities).toBe(cmc.length);
    expect(r.completedActivities).toBe(0);
    expect(r.notStartedActivities).toBe(cmc.length);
    // Completed ratio = 0; blockingResolved/blocking = 0 → score = 0.
    expect(r.readinessScore).toBe(0);
  });

  test('all activities approved → readiness 100', () => {
    const views = cmc.map(a => mkActivityView(a, 'approved'));
    const r = computeWorkstreamRollup('cmc', views);
    expect(r.completedActivities).toBe(cmc.length);
    expect(r.readinessScore).toBe(100);
  });

  test('all blocking activities resolved but non-blocking pending → high score', () => {
    const views = cmc.map(a =>
      mkActivityView(a, a.blocksIndAssembly ? 'approved' : 'not_started')
    );
    const r = computeWorkstreamRollup('cmc', views);
    // Blocking resolution should drive most of the score.
    expect(r.blockingActivities).toBeGreaterThan(0);
    expect(r.blockingResolved).toBe(r.blockingActivities);
    expect(r.readinessScore).toBeGreaterThan(40);
  });

  test('in_review counts as in-flight, not completed', () => {
    const views = cmc.slice(0, 3).map(a => mkActivityView(a, 'in_review'));
    const r = computeWorkstreamRollup('cmc', views);
    expect(r.inFlightActivities).toBe(3);
    expect(r.completedActivities).toBe(0);
  });

  test('revision_required is blocked, not in-flight', () => {
    const views = cmc.slice(0, 2).map(a => mkActivityView(a, 'revision_required'));
    const r = computeWorkstreamRollup('cmc', views);
    expect(r.blockedActivities).toBe(2);
    expect(r.inFlightActivities).toBe(0);
  });
});
