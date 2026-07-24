/**
 * Tests — reasoning-effort resolution (extended thinking policy).
 */
import { describe, it, expect } from 'vitest';

import {
  resolveThinkingConfig,
  isSubstantiveTurn,
  resolveOutputBudget,
  resolveModelTier,
  TIER_MODEL_ID,
  THINKING_BUDGETS,
  OUTPUT_BUDGETS,
  SUBSTANTIVE_MESSAGE_CHARS,
} from '../reasoning';

describe('isSubstantiveTurn', () => {
  it('treats any tool-using turn as substantive', () => {
    expect(isSubstantiveTurn({ hasTools: true })).toBe(true);
    expect(isSubstantiveTurn({ hasTools: true, messageLength: 2 })).toBe(true);
  });

  it('treats explicit deep intent lenses as substantive', () => {
    for (const lens of ['audit', 'improve', 'risk', 'strategy', 'compare']) {
      expect(isSubstantiveTurn({ intentLens: lens, messageLength: 1 })).toBe(true);
    }
  });

  it('treats a long message as substantive', () => {
    expect(isSubstantiveTurn({ messageLength: SUBSTANTIVE_MESSAGE_CHARS })).toBe(true);
    expect(isSubstantiveTurn({ messageLength: SUBSTANTIVE_MESSAGE_CHARS - 1 })).toBe(false);
  });

  it('treats a short, lens-less greeting as NOT substantive', () => {
    expect(isSubstantiveTurn({ messageLength: 2, intentLens: 'auto' })).toBe(false);
    expect(isSubstantiveTurn({})).toBe(false);
  });
});

describe('resolveThinkingConfig', () => {
  it('never thinks on Fast, even when substantive or high-risk', () => {
    expect(resolveThinkingConfig({ effort: 'fast', substantive: true })).toEqual({
      enabled: false,
      budgetTokens: 0,
    });
    expect(resolveThinkingConfig({ effort: 'fast', riskTier: 'high' })).toEqual({
      enabled: false,
      budgetTokens: 0,
    });
  });

  it('always thinks on Thorough', () => {
    const cfg = resolveThinkingConfig({ effort: 'thorough', substantive: false });
    expect(cfg.enabled).toBe(true);
    expect(cfg.budgetTokens).toBe(THINKING_BUDGETS.thorough);
  });

  it('Balanced thinks on substantive turns but not on small talk', () => {
    expect(resolveThinkingConfig({ effort: 'balanced', substantive: true })).toEqual({
      enabled: true,
      budgetTokens: THINKING_BUDGETS.balanced,
    });
    expect(resolveThinkingConfig({ effort: 'balanced', substantive: false })).toEqual({
      enabled: false,
      budgetTokens: 0,
    });
  });

  it('Balanced thinks on a high-risk turn even when not otherwise substantive', () => {
    const cfg = resolveThinkingConfig({ effort: 'balanced', riskTier: 'high', substantive: false });
    expect(cfg.enabled).toBe(true);
    // High-stakes floors the budget up above the plain Balanced budget.
    expect(cfg.budgetTokens).toBe(THINKING_BUDGETS.highStakesFloor);
    expect(cfg.budgetTokens).toBeGreaterThan(THINKING_BUDGETS.balanced);
  });

  it('high-stakes floor never lowers an already-higher Thorough budget', () => {
    const cfg = resolveThinkingConfig({ effort: 'thorough', riskTier: 'high' });
    expect(cfg.budgetTokens).toBe(THINKING_BUDGETS.thorough);
  });

  it('non-high risk tiers do not by themselves enable Balanced thinking', () => {
    expect(resolveThinkingConfig({ effort: 'balanced', riskTier: 'medium' }).enabled).toBe(false);
    expect(resolveThinkingConfig({ effort: 'balanced', riskTier: 'low' }).enabled).toBe(false);
  });
});

describe('resolveOutputBudget', () => {
  it('scales the requested output budget by effort', () => {
    expect(resolveOutputBudget('fast')).toBe(OUTPUT_BUDGETS.fast);
    expect(resolveOutputBudget('balanced')).toBe(OUTPUT_BUDGETS.balanced);
    expect(resolveOutputBudget('thorough')).toBe(OUTPUT_BUDGETS.thorough);
  });

  it('gives Thorough more room than Fast for long-form drafting', () => {
    expect(resolveOutputBudget('thorough')).toBeGreaterThan(resolveOutputBudget('fast'));
  });

  it('stays within the kernel planner clamp ceiling (8192)', () => {
    for (const effort of ['fast', 'balanced', 'thorough'] as const) {
      expect(resolveOutputBudget(effort)).toBeLessThanOrEqual(8192);
    }
  });

  it('falls back to the balanced budget for unknown/absent effort', () => {
    expect(resolveOutputBudget(undefined)).toBe(OUTPUT_BUDGETS.balanced);
    expect(resolveOutputBudget('nonsense')).toBe(OUTPUT_BUDGETS.balanced);
  });
});

describe('resolveModelTier', () => {
  it('keeps Fast on the economy tier (cheap, quick)', () => {
    expect(resolveModelTier({ effort: 'fast', substantive: true, riskTier: 'high' })).toBe(
      'economy',
    );
  });

  it('puts Thorough on the flagship tier (explicit depth request)', () => {
    expect(resolveModelTier({ effort: 'thorough' })).toBe('flagship');
  });

  it('routes routine Balanced turns to economy — the expensive model is NOT the default', () => {
    expect(resolveModelTier({ effort: 'balanced' })).toBe('economy');
    expect(resolveModelTier({ effort: 'balanced', intentLens: 'auto', substantive: false })).toBe(
      'economy',
    );
  });

  it('routes real Balanced work (substantive / deep lens / heavy task) to standard, not flagship', () => {
    expect(resolveModelTier({ effort: 'balanced', substantive: true })).toBe('standard');
    expect(resolveModelTier({ effort: 'balanced', intentLens: 'audit' })).toBe('standard');
    expect(resolveModelTier({ effort: 'balanced', taskType: 'document_drafting' })).toBe('standard');
    expect(resolveModelTier({ effort: 'balanced', taskType: 'regulatory_review' })).toBe('standard');
  });

  it('reserves the flagship for genuinely high-stakes Balanced turns', () => {
    expect(resolveModelTier({ effort: 'balanced', riskTier: 'high' })).toBe('flagship');
    // A high-risk turn goes straight to flagship even if also substantive.
    expect(resolveModelTier({ effort: 'balanced', riskTier: 'high', substantive: true })).toBe(
      'flagship',
    );
  });

  it('does not escalate on medium/low risk alone', () => {
    expect(resolveModelTier({ effort: 'balanced', riskTier: 'medium' })).toBe('economy');
    expect(resolveModelTier({ effort: 'balanced', riskTier: 'low' })).toBe('economy');
  });

  it('maps every tier to a governance-approved registry alias', () => {
    expect(TIER_MODEL_ID.economy).toBe('claude-haiku-4');
    expect(TIER_MODEL_ID.standard).toBe('claude-sonnet-4');
    expect(TIER_MODEL_ID.flagship).toBe('claude-opus-4');
  });
});
