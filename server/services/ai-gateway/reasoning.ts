/**
 * Reasoning-effort resolution — pure helpers for AnA's extended thinking.
 *
 * The AnA Composer exposes a Fast/Balanced/Thorough "effort" control. This
 * module translates that choice — together with the turn's risk tier and how
 * substantive the turn is — into an extended-thinking configuration for the
 * gateway. It replaces the older hardcoded "only think on high-risk or thorough
 * turns, always at a fixed 10k budget" gate with a modern, effort-scaled policy:
 *
 *   - AnA reasons on genuinely substantive turns by default (balanced), not only
 *     when the kernel flags high risk. Casual turns ("hi", one-line lookups)
 *     stay fast — reasoning latency is only spent where it buys correctness.
 *   - The reasoning budget scales with effort (Thorough reasons harder), and is
 *     floored up on high-stakes turns.
 *
 * Everything here is side-effect free and unit-tested independently of the
 * gateway and the SSE transport. On the flagship reasoning-only models
 * (Opus 4.7/4.8) thinking is *adaptive* and the model self-budgets, so
 * `budgetTokens` is a hint the gateway only consumes on the legacy thinking
 * surface (where it is additionally clamped below max_tokens).
 *
 * @module server/services/ai-gateway/reasoning
 */

import type { EffortLevel, ModelConfig } from './types';

/** Kernel risk tiers that gate/scale reasoning depth. */
export type RiskTier = 'low' | 'medium' | 'high';

export interface ThinkingConfig {
  /** Whether extended thinking should be requested for this turn. */
  enabled: boolean;
  /**
   * Reasoning budget hint in tokens. Consumed only by the legacy (non-adaptive)
   * thinking surface; adaptive models self-budget. Always paired with a gateway
   * clamp so it can never exceed the turn's max_tokens.
   */
  budgetTokens: number;
}

/**
 * Reasoning budgets by effort (tokens). These are hints — the flagship adaptive
 * models ignore them and self-budget; the legacy surface clamps them below
 * max_tokens. Tuned so Thorough reasons materially harder than Balanced.
 */
export const THINKING_BUDGETS = {
  balanced: 8_000,
  thorough: 16_000,
  /** Floor applied on high-stakes turns regardless of effort (except Fast). */
  highStakesFloor: 12_000,
} as const;

/**
 * Requested output-token budget by effort. Thorough drafting (a full CTD section,
 * a SAP) needs more room than a quick lookup. These are *requests* — the kernel
 * planner clamps them to its own [512, 8192] range, so values here can express
 * intent without risking an invalid ceiling.
 */
export const OUTPUT_BUDGETS = {
  fast: 4_096,
  balanced: 6_144,
  thorough: 8_192,
} as const;

/**
 * Resolve the requested output-token budget for a turn from its effort level.
 * Pure; an unknown/absent effort resolves to the Balanced budget.
 */
export function resolveOutputBudget(effort?: EffortLevel | string | null): number {
  return OUTPUT_BUDGETS[(effort as EffortLevel)] ?? OUTPUT_BUDGETS.balanced;
}

/** Intent lenses that always mark a turn as substantive enough to reason on. */
const DEEP_INTENT_LENSES = new Set(['audit', 'improve', 'risk', 'strategy', 'compare']);

/** Message length (chars) above which a turn is treated as substantive. */
export const SUBSTANTIVE_MESSAGE_CHARS = 240;

export interface SubstantiveTurnInput {
  /** Length of the user's message in characters. */
  messageLength?: number;
  /** Detected intent lens for the turn (auto/audit/improve/risk/strategy/compare). */
  intentLens?: string | null;
  /** Whether the model requested tool calls this turn (investigation in progress). */
  hasTools?: boolean;
}

/**
 * Decide whether a turn is substantive enough to warrant private reasoning.
 * A short, lens-less greeting is not; a real regulatory question, an explicit
 * deep lens, or any tool-using investigation is. Pure and conservative — when
 * in doubt it returns false so Balanced stays snappy on small talk.
 */
export function isSubstantiveTurn(input: SubstantiveTurnInput): boolean {
  if (input.hasTools) return true;
  if (input.intentLens && DEEP_INTENT_LENSES.has(input.intentLens)) return true;
  return (input.messageLength ?? 0) >= SUBSTANTIVE_MESSAGE_CHARS;
}

export interface ResolveThinkingInput {
  /** Resolved effort level (fast/balanced/thorough). */
  effort: EffortLevel;
  /** Kernel risk tier for the turn, if known. */
  riskTier?: RiskTier | string | null;
  /**
   * Whether the turn is substantive (see {@link isSubstantiveTurn}). Optional so
   * callers that only have effort + risk can still resolve sensibly.
   */
  substantive?: boolean;
}

/**
 * Resolve the extended-thinking configuration for a turn.
 *
 * Policy:
 *   - Fast  → never think (the user asked for a quick turn).
 *   - Thorough → always think (depth is exactly what was requested).
 *   - Balanced → think when the turn is substantive OR high-stakes; otherwise
 *     stay fast so greetings and one-line lookups don't pay reasoning latency.
 *   - High risk tier forces thinking on (except under Fast) and floors the
 *     budget up.
 *
 * Pure — no I/O, no env reads.
 */
export function resolveThinkingConfig(input: ResolveThinkingInput): ThinkingConfig {
  const { effort } = input;
  if (effort === 'fast') return { enabled: false, budgetTokens: 0 };

  const highStakes = input.riskTier === 'high';
  const enabled = effort === 'thorough' || highStakes || Boolean(input.substantive);
  if (!enabled) return { enabled: false, budgetTokens: 0 };

  let budgetTokens: number =
    effort === 'thorough' ? THINKING_BUDGETS.thorough : THINKING_BUDGETS.balanced;
  if (highStakes) budgetTokens = Math.max(budgetTokens, THINKING_BUDGETS.highStakesFloor);

  return { enabled: true, budgetTokens };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cost-tiered model selection
// ─────────────────────────────────────────────────────────────────────────────
//
// The everyday path must not depend on an expensive flagship. These tiers keep
// routine work on a cheap model and reserve the flagship for the genuinely
// high-stakes turn — so the expensive model becomes the exception, not the rule.

/** Model tiers, cheapest → most capable. */
export type ModelTier = 'economy' | 'standard' | 'flagship';

/**
 * Stable gateway-registry alias id for each tier. Resolved against the live
 * registry at the call site (so a tier is skipped if its model isn't enabled
 * for the tenant), and deliberately NOT a wire model string — the registry owns
 * the concrete version, and every id here is already governance-approved.
 */
export const TIER_MODEL_ID: Record<ModelTier, string> = {
  economy: 'claude-haiku-4',
  standard: 'claude-sonnet-4',
  flagship: 'claude-opus-4',
};

/** Task types heavy enough to warrant the standard (not economy) tier. */
const HEAVY_TASK_TYPES = new Set(['document_drafting', 'regulatory_review']);

export interface ResolveModelTierInput {
  /** Resolved effort level (fast/balanced/thorough). */
  effort: EffortLevel;
  /** Kernel risk tier for the turn, if known. */
  riskTier?: RiskTier | string | null;
  /** Detected intent lens (auto/audit/improve/risk/strategy/compare). */
  intentLens?: string | null;
  /** Kernel task type (e.g. document_drafting, regulatory_review, chat). */
  taskType?: string | null;
  /** Whether the turn is substantive (see {@link isSubstantiveTurn}). */
  substantive?: boolean;
}

/**
 * Choose the model tier for a turn so the everyday path stays off the expensive
 * flagship.
 *
 * Policy (Balanced is the default effort):
 *   - Fast     → economy   (the user asked for a quick, cheap turn).
 *   - Thorough → flagship  (the user explicitly asked for maximum depth).
 *   - Balanced →
 *       high risk tier                      → flagship (the stakes justify it)
 *       deep lens / heavy task / substantive → standard (real work, mid-cost)
 *       otherwise                            → economy  (routine chat/lookups)
 *
 * The flagship is therefore reserved for the genuinely high-stakes turn — high
 * kernel risk or an explicit Thorough request — not spent on greetings and
 * simple questions. Pure; no I/O, no env reads.
 */
export function resolveModelTier(input: ResolveModelTierInput): ModelTier {
  if (input.effort === 'fast') return 'economy';
  if (input.effort === 'thorough') return 'flagship';

  // Balanced (the default): escalate only when the turn warrants it.
  if (input.riskTier === 'high') return 'flagship';

  const deepLens = !!input.intentLens && DEEP_INTENT_LENSES.has(input.intentLens);
  const heavyTask = !!input.taskType && HEAVY_TASK_TYPES.has(input.taskType);
  if (deepLens || heavyTask || input.substantive) return 'standard';

  return 'economy';
}

/**
 * Per-deployment tier→model override env vars. Values may be a registry alias
 * id ('claude-sonnet-4', 'local-default') or a wire model string — either way
 * the result is validated against the tenant's enabled model set at the call
 * site, so a typo or an un-deployed model degrades to strategy-based selection,
 * never a broken turn. This is the cost-independence dial:
 *   ANA_TIER_FLAGSHIP_MODEL=claude-sonnet-4  → strict no-Opus deployment
 *   ANA_TIER_ECONOMY_MODEL=local-default     → self-hosted everyday tier
 */
export const TIER_MODEL_ENV: Record<ModelTier, string> = {
  economy: 'ANA_TIER_ECONOMY_MODEL',
  standard: 'ANA_TIER_STANDARD_MODEL',
  flagship: 'ANA_TIER_FLAGSHIP_MODEL',
};

/**
 * Resolve the tier→model mapping, applying any per-deployment env overrides on
 * top of the defaults. Pure — the env record is a parameter (callers pass
 * process.env); blank/whitespace values fall back to the default alias.
 */
export function resolveTierModelIds(
  env: Record<string, string | undefined> = {},
): Record<ModelTier, string> {
  const pick = (tier: ModelTier): string => {
    const override = env[TIER_MODEL_ENV[tier]];
    return override && override.trim() ? override.trim() : TIER_MODEL_ID[tier];
  };
  return { economy: pick('economy'), standard: pick('standard'), flagship: pick('flagship') };
}

/**
 * Resolve a tier to a concrete enabled model from the tenant's registry, or
 * null when the tier's configured model isn't enabled (caller falls back to
 * strategy-based selection). Matches on registry id or wire model string, same
 * as the user model-override path. Pure.
 */
export function resolveTierModel(
  tier: ModelTier,
  enabledModels: ModelConfig[],
  env: Record<string, string | undefined> = {},
): { provider: ModelConfig['provider']; model: string; tier: ModelTier } | null {
  const wanted = resolveTierModelIds(env)[tier];
  const match = enabledModels.find(
    (m) => m.enabled && (m.id === wanted || m.model === wanted),
  );
  return match ? { provider: match.provider, model: match.model, tier } : null;
}
