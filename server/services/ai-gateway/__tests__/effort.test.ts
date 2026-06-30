/**
 * Effort/model picker — unit tests for the pure resolution helpers.
 *
 * Covers:
 *  - EFFORT_TO_STRATEGY mapping (fast→cost, balanced→task, thorough→quality)
 *  - effort_level='garbage' → 'balanced' (no throw, never a 4xx upstream)
 *  - invalid model_override dropped (null)
 *  - governance-safe strategy precedence (policyHint wins over effort)
 *  - projectModelsForPicker: enabled-only, derived label/recommendedEffort
 *
 * @module server/services/ai-gateway/__tests__/effort.test
 */

import { describe, it, expect } from 'vitest';

import { EFFORT_TO_STRATEGY, type ModelConfig } from '../types';
import {
  DEFAULT_EFFORT,
  EFFORT_LEVELS,
  isEffortLevel,
  resolveEffortLevel,
  resolveEffortStrategy,
  resolveStrategyWithPrecedence,
  resolveModelOverride,
  projectModelsForPicker,
  deriveModelLabel,
  deriveRecommendedEffort,
} from '../effort';

function model(overrides: Partial<ModelConfig>): ModelConfig {
  return {
    id: 'm',
    provider: 'anthropic',
    model: 'm-wire',
    contextWindow: 200000,
    qualityScore: 90,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    capabilities: ['chat', 'general'],
    enabled: true,
    ...overrides,
  };
}

describe('EFFORT_TO_STRATEGY mapping', () => {
  it('maps each effort to the documented routing strategy', () => {
    expect(EFFORT_TO_STRATEGY.fast).toBe('cost_optimized');
    expect(EFFORT_TO_STRATEGY.balanced).toBe('task_based');
    expect(EFFORT_TO_STRATEGY.thorough).toBe('quality_optimized');
  });

  it('resolveEffortStrategy returns the mapped strategy', () => {
    expect(resolveEffortStrategy('fast')).toBe('cost_optimized');
    expect(resolveEffortStrategy('balanced')).toBe('task_based');
    expect(resolveEffortStrategy('thorough')).toBe('quality_optimized');
  });

  it('exposes the three levels and a balanced default', () => {
    expect(EFFORT_LEVELS).toEqual(['fast', 'balanced', 'thorough']);
    expect(DEFAULT_EFFORT).toBe('balanced');
  });
});

describe('resolveEffortLevel — defaults to balanced on bad input', () => {
  it('passes through the three valid levels', () => {
    expect(resolveEffortLevel('fast')).toBe('fast');
    expect(resolveEffortLevel('balanced')).toBe('balanced');
    expect(resolveEffortLevel('thorough')).toBe('thorough');
  });

  it("resolves 'garbage' to balanced", () => {
    expect(resolveEffortLevel('garbage')).toBe('balanced');
  });

  it('resolves undefined / null / wrong-type to balanced', () => {
    expect(resolveEffortLevel(undefined)).toBe('balanced');
    expect(resolveEffortLevel(null)).toBe('balanced');
    expect(resolveEffortLevel(42)).toBe('balanced');
    expect(resolveEffortLevel({})).toBe('balanced');
  });

  it('isEffortLevel narrows correctly', () => {
    expect(isEffortLevel('thorough')).toBe(true);
    expect(isEffortLevel('GARBAGE')).toBe(false);
  });
});

describe('resolveStrategyWithPrecedence — governance-safe', () => {
  it('lets the user effort strategy take effect when no policy hint is pinned', () => {
    expect(
      resolveStrategyWithPrecedence({
        policyHintStrategy: undefined,
        effortStrategy: 'quality_optimized',
        routingPlanStrategy: 'task_based',
      }),
    ).toBe('quality_optimized');
  });

  it('a governance-pinned policyHint ALWAYS wins over user effort', () => {
    expect(
      resolveStrategyWithPrecedence({
        policyHintStrategy: 'cost_optimized',
        effortStrategy: 'quality_optimized', // user asked for thorough
        routingPlanStrategy: 'task_based',
      }),
    ).toBe('cost_optimized');
  });

  it('falls back to the routing plan when neither policy nor effort is present', () => {
    expect(
      resolveStrategyWithPrecedence({
        policyHintStrategy: null,
        effortStrategy: null,
        routingPlanStrategy: 'latency_optimized',
      }),
    ).toBe('latency_optimized');
  });
});

describe('resolveModelOverride — invalid override dropped silently', () => {
  const enabled: ModelConfig[] = [
    model({ id: 'claude-opus-4', model: 'claude-opus-4-7', provider: 'anthropic' }),
    model({ id: 'gpt-4o', model: 'gpt-4o', provider: 'openai' }),
    model({ id: 'disabled-one', model: 'disabled-wire', enabled: false }),
  ];

  it('resolves a valid override by registry id', () => {
    expect(resolveModelOverride('claude-opus-4', enabled)).toEqual({
      id: 'claude-opus-4',
      provider: 'anthropic',
      model: 'claude-opus-4-7',
    });
  });

  it('resolves a valid override by wire model string', () => {
    expect(resolveModelOverride('gpt-4o', enabled)?.provider).toBe('openai');
  });

  it('drops an unknown override (returns null)', () => {
    expect(resolveModelOverride('not-a-real-model', enabled)).toBeNull();
  });

  it('drops a disabled model even if the id matches', () => {
    // The caller passes the enabled-filtered set; a disabled model should not
    // be matchable. Pass the unfiltered list and confirm the enabled guard.
    expect(resolveModelOverride('disabled-one', enabled)).toBeNull();
  });

  it('drops empty / non-string overrides', () => {
    expect(resolveModelOverride('', enabled)).toBeNull();
    expect(resolveModelOverride(undefined, enabled)).toBeNull();
    expect(resolveModelOverride(null, enabled)).toBeNull();
    expect(resolveModelOverride(123, enabled)).toBeNull();
  });
});

describe('projectModelsForPicker — projection', () => {
  it('filters to enabled models only', () => {
    const projected = projectModelsForPicker([
      model({ id: 'a', enabled: true }),
      model({ id: 'b', enabled: false }),
    ]);
    expect(projected.map((m) => m.id)).toEqual(['a']);
  });

  it('derives label + recommendedEffort and sorts by quality desc', () => {
    const projected = projectModelsForPicker([
      model({ id: 'claude-haiku-4', qualityScore: 85, costPer1kInput: 0.0008 }),
      model({ id: 'claude-opus-4', qualityScore: 99, costPer1kInput: 0.015 }),
    ]);
    expect(projected[0].id).toBe('claude-opus-4'); // highest quality first
    expect(projected[0].label).toBe('Claude Opus 4');
    expect(projected[0].recommendedEffort).toBe('thorough'); // quality >= 97
    expect(projected[1].label).toBe('Claude Haiku 4');
    expect(projected[1].recommendedEffort).toBe('fast'); // cheap input cost
  });

  it('deriveRecommendedEffort heuristic', () => {
    expect(deriveRecommendedEffort(model({ qualityScore: 98, costPer1kInput: 0.02 }))).toBe('thorough');
    expect(deriveRecommendedEffort(model({ qualityScore: 80, costPer1kInput: 0.0005 }))).toBe('fast');
    expect(deriveRecommendedEffort(model({ qualityScore: 90, costPer1kInput: 0.003 }))).toBe('balanced');
  });

  it('humanizes unknown registry ids for the label', () => {
    expect(deriveModelLabel(model({ id: 'some-new-model' }))).toBe('Some New Model');
  });
});
