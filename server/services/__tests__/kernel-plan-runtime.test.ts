import { describe, expect, test, vi} from 'vitest';

// vi.hoisted ensures env vars are set BEFORE any ESM imports (including
// transitive ones) are evaluated. Loading the auth/db/config chain at
// module init requires these to be present, or the chain throws.
vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

import { canTransitionStepStatus, findNextRunnableStep } from '../kernel-plan-runtime';
import type { GoalPlan } from '../kernel-goal-planner';

describe('kernel-plan-runtime', () => {
  test('allows valid step transitions', () => {
    expect(canTransitionStepStatus('pending', 'in_progress')).toBe(true);
    expect(canTransitionStepStatus('in_progress', 'completed')).toBe(true);
    expect(canTransitionStepStatus('blocked', 'replanned')).toBe(true);
  });

  test('rejects invalid step transitions', () => {
    expect(canTransitionStepStatus('completed', 'in_progress')).toBe(false);
    expect(canTransitionStepStatus('pending', 'completed')).toBe(false);
  });

  test('finds next runnable step based on dependency completion', () => {
    const plan: GoalPlan = {
      planId: 'p1',
      goal: 'test',
      intentLens: 'audit',
      riskTier: 'medium',
      generatedAt: new Date().toISOString(),
      replanCount: 0,
      steps: [
        {
          id: 's1',
          title: 'one',
          objective: '',
          dependsOn: [],
          successCriteria: [],
          status: 'completed',
        },
        {
          id: 's2',
          title: 'two',
          objective: '',
          dependsOn: ['s1'],
          successCriteria: [],
          status: 'pending',
        },
      ],
    };

    const next = findNextRunnableStep(plan);
    expect(next?.id).toBe('s2');
  });
});
