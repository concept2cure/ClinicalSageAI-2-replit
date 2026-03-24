import { describe, expect, test } from 'vitest';
import { planKernelExecution } from '../kernel-router';

describe('kernel-router', () => {
  test('routes ana-ri surface to regulatory_review', () => {
    const plan = planKernelExecution({
      route: '/api/ana-ri/chat',
      messageLength: 800,
      intentLens: 'audit',
      intentConfidence: 0.9,
      submissionType: 'ind',
      requestedMaxTokens: 4096,
    });

    expect(plan.taskType).toBe('regulatory_review');
    expect(plan.strategy).toBe('quality_optimized');
    expect(plan.temperature).toBeLessThanOrEqual(0.3);
    expect(plan.riskTier).toBe('high');
  });

  test('keeps generic chat route as chat when no regulatory signals', () => {
    const plan = planKernelExecution({
      route: '/api/chat',
      messageLength: 120,
      intentLens: 'auto',
      intentConfidence: 0.8,
      requestedMaxTokens: 2048,
    });

    expect(plan.taskType).toBe('chat');
    expect(plan.strategy).toBe('quality_optimized');
    expect(plan.maxTokens).toBe(2048);
  });

  test('increases max token budget for long prompts', () => {
    const plan = planKernelExecution({
      route: '/api/chat',
      messageLength: 10000,
      intentLens: 'auto',
      intentConfidence: 0.2,
      requestedMaxTokens: 2048,
    });

    expect(plan.maxTokens).toBeGreaterThanOrEqual(5000);
    expect(plan.temperature).toBeLessThanOrEqual(0.3);
  });

  test('applies high-risk tool restrictions when critical contradictions exist', () => {
    const plan = planKernelExecution({
      route: '/api/cortex/chat',
      messageLength: 450,
      intentLens: 'strategy',
      intentConfidence: 0.6,
      contradictionCount: 3,
      criticalContradictionCount: 1,
      toolRequestCount: 3,
    });

    expect(plan.riskTier).toBe('high');
    expect(plan.allowToolExecution).toBe(false);
    expect(plan.maxToolCalls).toBe(1);
    expect(plan.maxToolChainDepth).toBe(1);
  });
});
