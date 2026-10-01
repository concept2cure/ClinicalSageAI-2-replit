/**
 * Effort/model picker — unit tests for the pure resolution helpers.
 *
 * Covers:
 *  - EFFORT_TO_STRATEGY mapping (fast→cost, balanced→task, thorough→quality)
 *  - effort_level='garbage' → 'balanced' (no throw, never a 4xx upstream)
 *  - invalid model_override refused (null)
 *  - model_override only for an approved-models entry, and only a high-risk
 *    approved one on high-risk work (CLAUDE.md Rule 2)
 *  - governance-safe strategy precedence (policyHint wins over effort)
 *  - projectModelsForPicker: enabled and approved only, derived
 *    label/recommendedEffort, approvedForHighRisk and pqStatus from the entry
 *
 * @module server/services/ai-gateway/__tests__/effort.test
 */

import { describe, it, expect } from 'vitest';

import { EFFORT_TO_STRATEGY, type ModelConfig } from '../types';
import { APPROVED_MODELS, isApprovedForHighRisk, type ApprovedModel } from '../../ai-governance/approved-models';
import { DEFAULT_MODELS } from '../gateway';
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
  resolveApiEffort,
  claudeModelLabel,
  EFFORT_TO_API_EFFORT,
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
    thinkingMode: 'adaptive',
    supportsSamplingParams: false,
    ...overrides,
  };
}

/** A real approved-models entry, by id. Throws rather than guess. */
function entry(id: string): ApprovedModel {
  const e = APPROVED_MODELS.find((m) => m.id === id);
  if (!e) throw new Error(`APPROVED_MODELS has no '${id}'`);
  return e;
}

/**
 * A registry entry for a governed model: its id, provider and PINNED wire
 * version come from the approved-models entry, so the fixture is the model the
 * gateway would actually serve rather than a string that merely looks like it.
 */
function approvedModel(id: string, overrides: Partial<ModelConfig> = {}): ModelConfig {
  const e = entry(id);
  return model({ id: e.id, provider: e.provider, model: e.pinnedVersion, ...overrides });
}

/**
 * The high-risk answer every call has to give. `highRisk` has no default: a
 * default of "not high-risk" let a caller that forgot the question pin a model
 * with no high-risk approval on high-risk work (review objection 12).
 */
const NORMAL = { highRisk: false } as const;

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

describe('resolveModelOverride — invalid override refused (null)', () => {
  // Pinned to the approved versions: an alias pointing at a version the
  // approved-models entry does not pin is not an approved model (see below).
  const enabled: ModelConfig[] = [
    approvedModel('claude-opus-4'),
    approvedModel('gpt-4o'),
    // Its real id, so only the enabled guard can refuse it.
    approvedModel('gpt-4o-mini', { enabled: false }),
  ];

  it('resolves a valid override by registry id', () => {
    expect(resolveModelOverride('claude-opus-4', enabled, NORMAL)).toEqual({
      id: 'claude-opus-4',
      provider: 'anthropic',
      model: entry('claude-opus-4').pinnedVersion,
    });
  });

  it('resolves a valid override by wire model string', () => {
    expect(resolveModelOverride('gpt-4o', enabled, NORMAL)?.provider).toBe('openai');
  });

  it('drops an unknown override (returns null)', () => {
    expect(resolveModelOverride('not-a-real-model', enabled, NORMAL)).toBeNull();
  });

  it('drops a disabled model even if the id matches', () => {
    // The caller passes the enabled-filtered set; a disabled model should not
    // be matchable. Pass the unfiltered list and confirm the enabled guard.
    expect(resolveModelOverride('gpt-4o-mini', enabled, NORMAL)).toBeNull();
  });

  it('drops empty / non-string overrides', () => {
    expect(resolveModelOverride('', enabled, NORMAL)).toBeNull();
    expect(resolveModelOverride(undefined, enabled, NORMAL)).toBeNull();
    expect(resolveModelOverride(null, enabled, NORMAL)).toBeNull();
    expect(resolveModelOverride(123, enabled, NORMAL)).toBeNull();
  });
});

describe('projectModelsForPicker — projection', () => {
  it('filters to enabled models only', () => {
    const projected = projectModelsForPicker([
      approvedModel('gpt-4o', { enabled: true }),
      approvedModel('gpt-4o-mini', { enabled: false }),
    ]);
    expect(projected.map((m) => m.id)).toEqual(['gpt-4o']);
  });

  it('derives label + recommendedEffort and sorts by quality desc', () => {
    const projected = projectModelsForPicker([
      approvedModel('claude-haiku-4', { qualityScore: 85, costPer1kInput: 0.0008 }),
      approvedModel('claude-opus-4', { qualityScore: 99, costPer1kInput: 0.015 }),
    ]);
    expect(projected[0].id).toBe('claude-opus-4'); // highest quality first
    // Named from the pinned wire version, which is what will run.
    expect(projected[0].label).toBe(claudeModelLabel(entry('claude-opus-4').pinnedVersion));
    expect(projected[0].recommendedEffort).toBe('thorough'); // quality >= 97
    expect(projected[1].label).toBe(claudeModelLabel(entry('claude-haiku-4').pinnedVersion));
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

// ── A model is selectable only as an approved-models entry (CLAUDE.md Rule 2) ─
//
// resolveModelOverride accepted ANY enabled registry model. The gateway refuses
// an unapproved explicit model on HIGH-RISK work only, so on everything else a
// model with no governance entry — no pinned version, no rationale, no eval
// reference — could be pinned by any authenticated caller. The picker listed
// the same set. Registry side: synthetic ModelConfig. Governance side: the real
// APPROVED_MODELS, with each flag a test relies on asserted first, so a
// governance change fails here by name instead of silently changing a case.

describe('resolveModelOverride — gated on approved-models', () => {
  const OPUS = entry('claude-opus-4');
  const SONNET = entry('claude-sonnet-4');
  const GPT = entry('gpt-4o');

  // An enabled registry model with no governance entry at all.
  const UNAPPROVED = model({ id: 'claude-opus-9-preview', provider: 'anthropic', model: 'claude-opus-9-preview' });
  // An approved alias moved to a wire version its entry does not pin. The
  // served-model gate matches on the pinned version, and so does this one.
  const DRIFTED = model({ id: 'claude-opus-4', provider: 'anthropic', model: 'claude-opus-4-7' });

  const registry: ModelConfig[] = [
    approvedModel('claude-opus-4'),
    approvedModel('claude-sonnet-4'),
    approvedModel('gpt-4o'),
    UNAPPROVED,
  ];

  it('the governed data is what these cases assume', () => {
    expect(OPUS.approvedForHighRisk).toBe(true);
    expect(SONNET.approvedForHighRisk).toBe(false);
    expect(GPT.approvedForHighRisk).toBe(false);
    expect(APPROVED_MODELS.some((e) => e.id === UNAPPROVED.id || e.pinnedVersion === UNAPPROVED.model)).toBe(false);
  });

  it('refuses an enabled model with no approved entry — by id and by wire model', () => {
    expect(resolveModelOverride(UNAPPROVED.id, registry, NORMAL)).toBeNull();
    expect(resolveModelOverride(UNAPPROVED.model, registry, NORMAL)).toBeNull();
  });

  it('refuses an approved alias whose wire model is not the pinned version', () => {
    expect(resolveModelOverride('claude-opus-4', [DRIFTED], NORMAL)).toBeNull();
    expect(resolveModelOverride('claude-opus-4-7', [DRIFTED], NORMAL)).toBeNull();
  });

  it('resolves an approved entry — by id and by wire model', () => {
    const want = { id: SONNET.id, provider: SONNET.provider, model: SONNET.pinnedVersion };
    expect(resolveModelOverride(SONNET.id, registry, NORMAL)).toEqual(want);
    expect(resolveModelOverride(SONNET.pinnedVersion, registry, NORMAL)).toEqual(want);
    expect(resolveModelOverride(GPT.id, registry, NORMAL)?.provider).toBe('openai');
  });

  it('on high-risk work, refuses an approved model not approved for high risk', () => {
    expect(resolveModelOverride(SONNET.id, registry, { highRisk: true })).toBeNull();
    expect(resolveModelOverride(SONNET.pinnedVersion, registry, { highRisk: true })).toBeNull();
    expect(resolveModelOverride(GPT.id, registry, { highRisk: true })).toBeNull();
  });

  it('on high-risk work, resolves an approvedForHighRisk entry — by id and by wire model', () => {
    const want = { id: OPUS.id, provider: OPUS.provider, model: OPUS.pinnedVersion };
    expect(resolveModelOverride(OPUS.id, registry, { highRisk: true })).toEqual(want);
    expect(resolveModelOverride(OPUS.pinnedVersion, registry, { highRisk: true })).toEqual(want);
  });

  it('on high-risk work, still refuses the unapproved model', () => {
    expect(resolveModelOverride(UNAPPROVED.id, registry, { highRisk: true })).toBeNull();
  });

  it('the high-risk question has no default, and an unanswered one is the strict case', () => {
    // A fail-open default let a caller that omitted the option pin a model on
    // high-risk work with no high-risk approval (review objection 12). The type
    // now requires the answer, and a JS caller that still omits it at runtime
    // gets the high-risk answer, not the permissive one.
    // @ts-expect-error — every caller must say whether the work is high-risk
    expect(resolveModelOverride(SONNET.id, registry)).toBeNull();
    // @ts-expect-error — an options object without the answer is no answer
    expect(resolveModelOverride(SONNET.id, registry, {})).toBeNull();
    expect(resolveModelOverride(SONNET.id, registry, NORMAL)?.id).toBe(SONNET.id);
    expect(resolveModelOverride(OPUS.id, registry, { highRisk: true })?.id).toBe(OPUS.id);
  });

  // approvedEntryFor — the served-model lookup — also accepts a wire model EQUAL
  // TO an entry's alias id, which pins no version at all, and it keys on the wire
  // model where the gateway's high-risk check keys on the registry id
  // (isApprovedForHighRisk(model.id)). So a pin is governed only when the
  // registry row IS the entry: the entry's id, provider and pinned version
  // (review objections 9, 10, 11 and 16).
  const WIRE_IS_ALIAS = model({ id: OPUS.id, provider: OPUS.provider, model: OPUS.id });
  const FOREIGN_ID = model({ id: 'claude-opus-house', provider: OPUS.provider, model: OPUS.pinnedVersion });

  it('refuses a row whose wire model is the alias id, not the pinned version', () => {
    expect(APPROVED_MODELS.some((e) => e.pinnedVersion === WIRE_IS_ALIAS.model)).toBe(false);
    expect(resolveModelOverride(OPUS.id, [WIRE_IS_ALIAS], NORMAL)).toBeNull();
    expect(resolveModelOverride(OPUS.id, [WIRE_IS_ALIAS], { highRisk: true })).toBeNull();
  });

  it('refuses the pinned version under an id the entry does not carry — the gateway would refuse it on high-risk work', () => {
    expect(APPROVED_MODELS.some((e) => e.id === FOREIGN_ID.id)).toBe(false);
    expect(isApprovedForHighRisk(FOREIGN_ID.id)).toBe(false);
    for (const value of [FOREIGN_ID.id, FOREIGN_ID.model]) {
      expect(resolveModelOverride(value, [FOREIGN_ID], { highRisk: true }), value).toBeNull();
      expect(resolveModelOverride(value, [FOREIGN_ID], NORMAL), value).toBeNull();
    }
  });
});

describe('projectModelsForPicker — lists only approved models, and says how far each is approved', () => {
  const UNAPPROVED = model({ id: 'claude-opus-9-preview', provider: 'anthropic', model: 'claude-opus-9-preview', qualityScore: 100 });

  it('excludes an enabled model with no approved entry', () => {
    const projected = projectModelsForPicker([approvedModel('claude-sonnet-4'), UNAPPROVED]);
    expect(projected.map((m) => m.id)).toEqual(['claude-sonnet-4']);
  });

  it('excludes an approved alias drifted off its pinned version', () => {
    const drifted = model({ id: 'claude-opus-4', provider: 'anthropic', model: 'claude-opus-4-7' });
    expect(projectModelsForPicker([drifted])).toEqual([]);
  });

  it('excludes a row that is not exactly its approved entry', () => {
    const opus = entry('claude-opus-4');
    const wireIsAlias = model({ id: opus.id, provider: opus.provider, model: opus.id });
    const foreignId = model({ id: 'claude-opus-house', provider: opus.provider, model: opus.pinnedVersion });
    expect(projectModelsForPicker([wireIsAlias, foreignId])).toEqual([]);
  });

  it('offers every enabled model in today\'s registry — the drift gate keeps each one its own entry', () => {
    // The overcorrection check: a gate that refused everything, or keyed on
    // something the registry does not carry, would empty the picker.
    const enabledIds = DEFAULT_MODELS.filter((m) => m.enabled).map((m) => m.id).sort();
    expect(enabledIds.length).toBeGreaterThan(0);
    expect(projectModelsForPicker(DEFAULT_MODELS).map((m) => m.id).sort()).toEqual(enabledIds);
    for (const id of enabledIds) {
      expect(resolveModelOverride(id, DEFAULT_MODELS, NORMAL)?.id, id).toBe(id);
    }
  });

  it('carries approvedForHighRisk and pqStatus from the approved entry', () => {
    const projected = projectModelsForPicker([
      approvedModel('claude-opus-4', { qualityScore: 99 }),
      approvedModel('claude-sonnet-4', { qualityScore: 95 }),
    ]);
    const byId = new Map(projected.map((m) => [m.id, m]));
    for (const id of ['claude-opus-4', 'claude-sonnet-4']) {
      const option = byId.get(id);
      expect(option, id).toBeDefined();
      expect(option!.approvedForHighRisk, id).toBe(entry(id).approvedForHighRisk);
      expect(option!.pqStatus, id).toBe(entry(id).pq.status);
    }
    expect(byId.get('claude-opus-4')!.approvedForHighRisk).toBe(true);
    expect(byId.get('claude-sonnet-4')!.approvedForHighRisk).toBe(false);
  });

  it('claims no PQ pass the governed data does not record', () => {
    // Every entry is PQ pending today. The option reads the entry; it never
    // defaults to, or rounds up to, 'passed'.
    const projected = projectModelsForPicker(APPROVED_MODELS.map((e) => approvedModel(e.id)));
    expect(projected).toHaveLength(APPROVED_MODELS.length);
    for (const option of projected) {
      expect(option.pqStatus, option.id).toBe(entry(option.id).pq.status);
    }
  });
});

// ── The API's own effort, distinct from which model to pick ────────────────
//
// The Composer's Fast/Balanced/Thorough control has always meant two things,
// and only the first was ever sent: a user asking for Thorough got a better
// model that then reasoned at the same depth as Fast.

describe('resolveApiEffort', () => {
  it('maps the three levels onto API effort, in order', () => {
    expect(resolveApiEffort('fast')).toBe('low');
    expect(resolveApiEffort('balanced')).toBe('medium');
    expect(resolveApiEffort('thorough')).toBe('high');
  });

  it('is a different question from which model to route to', () => {
    // Same input, two independent answers. Collapsing them would make a
    // cost-optimised route imply shallow reasoning, which is not the same claim.
    expect(Object.keys(EFFORT_TO_API_EFFORT)).toEqual(Object.keys(EFFORT_TO_STRATEGY));
    expect(resolveApiEffort('balanced')).not.toBe(resolveEffortStrategy('balanced'));
  });

  it('sends no value the pinned SDK does not know', () => {
    // @anthropic-ai/sdk 0.82.0 types effort as low|medium|high|max — no xhigh.
    // Sending one anyway would be a guess dressed as a setting.
    const known = new Set(['low', 'medium', 'high', 'max']);
    for (const level of EFFORT_LEVELS) {
      expect(known.has(resolveApiEffort(level)), level).toBe(true);
    }
  });
});

// ── A model label is a claim about what will run ───────────────────────────

describe('claudeModelLabel', () => {
  it('reads the version out of the wire model', () => {
    expect(claudeModelLabel('claude-opus-5')).toBe('Claude Opus 5');
    expect(claudeModelLabel('claude-sonnet-5')).toBe('Claude Sonnet 5');
    expect(claudeModelLabel('claude-haiku-4-5')).toBe('Claude Haiku 4.5');
    expect(claudeModelLabel('claude-opus-4-8')).toBe('Claude Opus 4.8');
  });

  it('strips a provider prefix', () => {
    expect(claudeModelLabel('anthropic.claude-opus-4-7')).toBe('Claude Opus 4.7');
  });

  it('declines anything that is not a Claude model', () => {
    expect(claudeModelLabel('gpt-4o')).toBeNull();
    expect(claudeModelLabel('local-default')).toBeNull();
  });
});

describe('deriveModelLabel', () => {
  it('names the model that will run, not the alias that points at it', () => {
    // This is the regression the hand-mapped labels caused: the table was keyed
    // on the stable alias id, so moving 'claude-opus-4' to Opus 5 left the
    // picker offering "Claude Opus 4" for a request that ran on Opus 5.
    expect(deriveModelLabel(model({ id: 'claude-opus-4', model: 'claude-opus-5' })))
      .toBe('Claude Opus 5');
  });

  it('marks a fallback rung as one', () => {
    expect(deriveModelLabel(model({ id: 'claude-opus-4-legacy', model: 'claude-opus-4-8' })))
      .toBe('Claude Opus 4.8 (fallback)');
  });

  it('still hand-labels the non-Claude entries', () => {
    expect(deriveModelLabel(model({ id: 'gpt-4o', model: 'gpt-4o', provider: 'openai' })))
      .toBe('GPT-4o');
  });
});
