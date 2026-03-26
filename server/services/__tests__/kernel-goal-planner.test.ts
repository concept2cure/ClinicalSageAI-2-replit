import { describe, expect, test } from 'vitest';
import { buildGoalPlan, replanGoalPlan } from '../kernel-goal-planner';

describe('kernel-goal-planner', () => {
  test('builds baseline plan graph with dependencies', () => {
    const plan = buildGoalPlan({
      message: 'Assess IND briefing package risks',
      intentLens: 'risk',
      riskTier: 'high',
      submissionType: 'ind',
    });

    expect(plan.steps.length).toBeGreaterThanOrEqual(5);
    expect(plan.steps[1].dependsOn).toContain(plan.steps[0].id);
  });

  test('replan appends remediation step and increments counter', () => {
    const original = buildGoalPlan({
      message: 'Review response quality',
      intentLens: 'audit',
      riskTier: 'medium',
    });

    const replanned = replanGoalPlan(original, 'structure_failure');
    expect(replanned.replanCount).toBe(1);
    expect(replanned.steps.some(s => s.title === 'Remediation pass')).toBe(true);
  });
});

