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
 * Everything here is side-effect free, except that resolveTierModel writes a
 * warn log, once per process for each configuration, when it passes over or
 * withholds a tier model. All of it is unit-tested independently of the
 * gateway and the SSE transport. On the flagship reasoning-only models
 * (Opus 4.7/4.8) thinking is *adaptive* and the model self-budgets, so
 * `budgetTokens` is a hint the gateway only consumes on the legacy thinking
 * surface (where it is additionally clamped below max_tokens).
 *
 * @module server/services/ai-gateway/reasoning
 */

import type { EffortLevel, ModelConfig } from './types';
import { governedMatch } from '../ai-governance/approved-models.js';
import { createScopedLogger } from '../../utils/logger.js';

const log = createScopedLogger('ai-gateway:tier');

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
 * registry by {@link resolveTierModel}, so a tier is skipped when its model is
 * not enabled for the tenant or its registry row is not its approved-models
 * entry. Deliberately NOT a wire model string: the registry owns the concrete
 * version, and approved-models pins it.
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
  /* High risk goes to the flagship tier whatever the effort, Fast included.
     Only a model approved for high-risk work may serve it (approved-models.ts
     approvedForHighRisk, enforced in gateway.ts), and neither economy nor
     standard is. Keeping Fast on economy here would not make the turn cheaper;
     it would make the gateway refuse it. Fast still governs everything else. */
  if (input.riskTier === 'high') return 'flagship';
  if (input.effort === 'fast') return 'economy';
  if (input.effort === 'thorough') return 'flagship';

  const deepLens = !!input.intentLens && DEEP_INTENT_LENSES.has(input.intentLens);
  const heavyTask = !!input.taskType && HEAVY_TASK_TYPES.has(input.taskType);
  if (deepLens || heavyTask || input.substantive) return 'standard';

  return 'economy';
}

/**
 * Per-deployment tier→model override env vars. Values may be a registry alias
 * id ('claude-sonnet-4', 'local-default') or a wire model string. Either way
 * {@link resolveTierModel} pins the result only when it is enabled for the
 * tenant and is an approved-models entry. A typo, an un-deployed model or a
 * model with no approved entry pins nothing, and the gateway selects by
 * strategy: never a broken turn. That selection is approval-gated only on
 * high-risk work, so on other work it can still choose a row the tier withheld.
 * This is the cost-independence dial:
 *   ANA_TIER_FLAGSHIP_MODEL=claude-sonnet-4  → strict no-Opus deployment
 *   ANA_TIER_ECONOMY_MODEL=local-default     → self-hosted everyday tier
 */
export const TIER_MODEL_ENV: Record<ModelTier, string> = {
  economy: 'ANA_TIER_ECONOMY_MODEL',
  standard: 'ANA_TIER_STANDARD_MODEL',
  flagship: 'ANA_TIER_FLAGSHIP_MODEL',
};

/**
 * The model a tier is configured to, and where that value came from: the
 * tier's env var when it is set to a non-blank value (trimmed), otherwise the
 * default alias. The one statement of that rule, read by
 * {@link resolveTierModelIds} for the value and by {@link resolveTierModel}'s
 * log for the source, so the two cannot disagree.
 */
function configuredTierModel(
  tier: ModelTier,
  env: Record<string, string | undefined>,
): { value: string; source: string } {
  const envVar = TIER_MODEL_ENV[tier];
  const override = env[envVar]?.trim();
  return override ? { value: override, source: envVar } : { value: TIER_MODEL_ID[tier], source: 'default' };
}

/**
 * Resolve the tier→model mapping, applying any per-deployment env overrides on
 * top of the defaults. Pure — the env record is a parameter (callers pass
 * process.env); blank/whitespace values fall back to the default alias.
 */
export function resolveTierModelIds(
  env: Record<string, string | undefined> = {},
): Record<ModelTier, string> {
  return {
    economy: configuredTierModel('economy', env).value,
    standard: configuredTierModel('standard', env).value,
    flagship: configuredTierModel('flagship', env).value,
  };
}

/**
 * Resolve a tier to a concrete model from the tenant's registry, or null (the
 * tier pins nothing and the gateway selects by strategy). The tier's configured
 * model, an ANA_TIER_*_MODEL remap included, is matched on registry id or wire
 * model string, and the first matching row that passes both checks is pinned:
 *
 *   1. Enabled: the row is in the tenant's enabled set.
 *   2. Approved: the row is its approved-models entry: that entry's id,
 *      provider and pinned version. CLAUDE.md Rule 2: a model is selectable
 *      only as an approved-models entry with a pinned version. Until 2026-09-28
 *      enabled was the only check. The gateway refuses a model not approved for
 *      high risk on high-risk work, so on every other turn a remap, or a
 *      default alias whose row had drifted off its pinned version, served
 *      AnA's default with no approved entry.
 *
 * Both checks are {@link governedMatch}, the rule a caller's pin selects by too
 * (effort.ts resolveModelOverride), so one value against one registry gets one
 * answer from both. A row that fails step 2 is passed over exactly as a
 * disabled row always has been. High-risk approval is not asked here; the
 * gateway still refuses, on high-risk work, a tier model not approved for high
 * risk.
 *
 * What this settles is the tier's pin, not the model that runs:
 *
 *   - The pin reaches the gateway as `{ provider, model }`, and the gateway
 *     looks the row up again by that pair. The row it serves is the row judged
 *     here only while the pair names one registry row (governedMatch).
 *   - When nothing is pinned, the withheld row stays enabled in the gateway's
 *     registry, and strategy selection is approval-gated only on high-risk
 *     work. On other work it can choose the very row withheld here.
 *
 * A matching row passed over or withheld means a deployment's configuration or
 * registry is being overruled, so it is logged (warn, `ai-gateway:tier`) with
 * the rows withheld and the row pinned instead, if any. It is logged once per
 * process for each configuration, because the callers resolve on every AnA
 * turn, chat turn and deep investigation and the fault is static. The refusal
 * itself applies on every call.
 *
 * On today's registry every enabled row is its own entry (the drift gate holds
 * it there), so this passes over and withholds nothing that serves today.
 */
export function resolveTierModel(
  tier: ModelTier,
  enabledModels: ModelConfig[],
  env: Record<string, string | undefined> = {},
): { provider: ModelConfig['provider']; model: string; tier: ModelTier } | null {
  const configured = configuredTierModel(tier, env);
  const { served, withheld } = governedMatch(configured.value, enabledModels);
  if (withheld.length > 0) reportWithheld(tier, configured, withheld, served?.row);
  return served ? { provider: served.row.provider, model: served.row.model, tier } : null;
}

/** Configurations whose withheld rows have been logged in this process. */
const withheldReported = new Set<string>();

function reportWithheld(
  tier: ModelTier,
  configured: { value: string; source: string },
  withheld: ModelConfig[],
  served: ModelConfig | undefined,
): void {
  const fact = (m: ModelConfig) => ({ id: m.id, provider: m.provider, model: m.model });
  const context = {
    tier,
    configured: configured.value,
    source: configured.source,
    withheld: withheld.map(fact),
    served: served ? fact(served) : null,
  };
  const key = JSON.stringify(context);
  if (withheldReported.has(key)) return;
  withheldReported.add(key);
  log.warn(
    served
      ? 'tier model: matching rows with no approved-models entry were passed over; the tier pins the first row that is one'
      : 'tier model withheld: no matching row is an approved-models entry, so the tier pins no model. The gateway selects by strategy, which on normal-risk work is not approval-gated and can choose a withheld row',
    context,
  );
}
