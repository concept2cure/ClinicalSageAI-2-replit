/**
 * Effort/model picker — pure resolution helpers.
 *
 * The AnA Composer exposes a Fast/Balanced/Thorough "effort" control plus an
 * advanced model dropdown. This module holds the pure functions that translate
 * those user choices into gateway routing decisions, plus the model-registry
 * projection the picker renders from. Everything here is side-effect free and
 * unit-tested independently of the gateway and the SSE transport.
 *
 *   effort → strategy        resolveEffortStrategy / resolveStrategyWithPrecedence
 *   model_override validity  resolveModelOverride
 *   registry → picker shape  projectModelsForPicker
 *
 * @module server/services/ai-gateway/effort
 */

import {
  EFFORT_TO_STRATEGY,
  type EffortLevel,
  type ModelConfig,
  type RoutingStrategy,
} from './types';

/** The picker's three effort options, in display order. */
export const EFFORT_LEVELS: readonly EffortLevel[] = ['fast', 'balanced', 'thorough'] as const;

/** The picker's default effort when the user hasn't chosen one. */
export const DEFAULT_EFFORT: EffortLevel = 'balanced';

/** Type guard: is `value` one of the three valid effort levels? */
export function isEffortLevel(value: unknown): value is EffortLevel {
  return value === 'fast' || value === 'balanced' || value === 'thorough';
}

/**
 * Validate an effort value off the request body, falling back to the default.
 * Anything that isn't one of the three known levels (including `undefined`,
 * `null`, `'garbage'`) resolves to {@link DEFAULT_EFFORT} — the control is
 * user-facing and must never 4xx on a bad value.
 */
export function resolveEffortLevel(value: unknown): EffortLevel {
  return isEffortLevel(value) ? value : DEFAULT_EFFORT;
}

/** Map a (validated) effort level to its routing strategy. Pure. */
export function resolveEffortStrategy(effort: EffortLevel): RoutingStrategy {
  return EFFORT_TO_STRATEGY[effort];
}

/**
 * Effort → the API's own `output_config.effort`.
 *
 * Distinct from {@link EFFORT_TO_STRATEGY}, which answers "which model": this
 * answers "how hard should that model work". The Composer's control has always
 * meant both, and only the first half was ever sent — so a user asking for
 * Thorough got a better model that then reasoned at the same depth as Fast.
 *
 * `thorough` maps to `high` rather than `xhigh` deliberately: the pinned SDK
 * (@anthropic-ai/sdk 0.82.0) types effort as low|medium|high|max with no xhigh,
 * and sending a value the pinned client does not know is a guess. Revisit on an
 * SDK bump — `xhigh` is the better setting for long agentic work.
 */
export const EFFORT_TO_API_EFFORT = {
  fast: 'low',
  balanced: 'medium',
  thorough: 'high',
} as const satisfies Record<EffortLevel, 'low' | 'medium' | 'high' | 'max'>;

/** Map a (validated) effort level to the API effort parameter. Pure. */
export function resolveApiEffort(effort: EffortLevel): 'low' | 'medium' | 'high' | 'max' {
  return EFFORT_TO_API_EFFORT[effort];
}

/**
 * Resolve the effective routing strategy with governance-safe precedence:
 *
 *   policyHintStrategy  →  effortStrategy  →  routingPlanStrategy
 *
 * A governance-pinned `policyHint.preferredStrategy` ALWAYS wins — user effort
 * must never override a strategy the kernel adaptive policy pinned for a tenant
 * (e.g. forcing quality on a high-risk org). When no policy hint is present,
 * the user's effort choice takes effect; if neither is set, the kernel routing
 * plan's strategy is used.
 */
export function resolveStrategyWithPrecedence(input: {
  policyHintStrategy?: RoutingStrategy | null;
  effortStrategy?: RoutingStrategy | null;
  routingPlanStrategy: RoutingStrategy;
}): RoutingStrategy {
  return input.policyHintStrategy || input.effortStrategy || input.routingPlanStrategy;
}

/**
 * Validate a client-supplied `model_override` against the enabled model set.
 * Matches on either the registry `id` or the wire `model` string (the picker
 * sends `id`, but we accept either for resilience). An invalid / disabled /
 * absent override resolves to `null` so the caller can DROP IT SILENTLY and
 * fall back to the effort strategy — never a 4xx.
 *
 * Returns the resolved `{ provider, model }` to hand to the gateway's
 * explicit-override path, so the caller doesn't re-scan the registry.
 */
export function resolveModelOverride(
  value: unknown,
  enabledModels: ModelConfig[],
): { id: string; provider: ModelConfig['provider']; model: string } | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const match = enabledModels.find(
    (m) => m.enabled && (m.id === value || m.model === value),
  );
  if (!match) return null;
  return { id: match.id, provider: match.provider, model: match.model };
}

// ─────────────────────────────────────────────────────────────────────────────
// Model registry → picker projection
// ─────────────────────────────────────────────────────────────────────────────

/** The shape the Composer's model dropdown renders one option from. */
export interface PickerModel {
  /** Stable registry id — what the client sends back as `model_override`. */
  id: string;
  /** Wire model string (e.g. `claude-opus-4-7`). */
  model: string;
  /** Provider id (anthropic / openai / moonshot / …). */
  provider: ModelConfig['provider'];
  /** Human-readable display label. */
  label: string;
  /** The effort this model is the natural pick for (heuristic). */
  recommendedEffort: EffortLevel;
  contextWindow: number;
  qualityScore: number;
}

/**
 * Hand-mapped display labels for non-Claude registry ids.
 *
 * The Claude entries are deliberately NOT here. They were — 'claude-opus-4' →
 * "Claude Opus 4" — keyed on the stable ALIAS id, which meant the label stopped
 * being true the moment the alias pointed somewhere new: the picker offered
 * "Claude Opus 4" for a request that ran on Opus 5. A label is a claim about
 * what will run, so it is derived from the wire model instead (see
 * {@link deriveModelLabel}) and cannot go stale on a model bump.
 */
const MODEL_LABELS: Record<string, string> = {
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o mini',
  'kimi-k2-0711': 'Kimi K2',
  'moonshot-v1-128k': 'Kimi (Moonshot v1 128k)',
  'moonshot-v1-32k': 'Kimi (Moonshot v1 32k)',
};

/**
 * Human label for a Claude wire model id, or null for anything else.
 *
 * `claude-opus-5` → "Claude Opus 5"; `claude-haiku-4-5` → "Claude Haiku 4.5";
 * a provider prefix (`anthropic.claude-opus-4-7` on Bedrock) is stripped first.
 */
export function claudeModelLabel(model: string): string | null {
  const bare = model.replace(/^[a-z]+\./, '');
  const m = /^claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d+))?/.exec(bare);
  if (!m) return null;
  const family = m[1].charAt(0).toUpperCase() + m[1].slice(1);
  const version = m[3] ? `${m[2]}.${m[3]}` : m[2];
  return `Claude ${family} ${version}`;
}

/** Best-effort human label for a registry id with no hand-mapped entry. */
export function humanizeModelId(id: string): string {
  const spaced = id.replace(/[-_]/g, ' ').trim();
  return spaced
    ? spaced
        .split(' ')
        .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .join(' ')
    : id;
}

/** Resolve the display label for a model config. */
export function deriveModelLabel(m: ModelConfig): string {
  // Wire model first: the label describes what will actually run, and a stable
  // alias id does not. A '(legacy)' entry keeps that marker, since which rung
  // of the ladder a model sits on is not visible from its version alone.
  const claude = claudeModelLabel(m.model);
  if (claude) return m.id.endsWith('-legacy') ? `${claude} (fallback)` : claude;
  return MODEL_LABELS[m.id] ?? humanizeModelId(m.id);
}

/**
 * Derive the effort a model is the natural pick for, from its quality/cost.
 * Heuristic (no `recommendedEffort` field exists on ModelConfig):
 *   - high quality (≥97) → thorough
 *   - cheap input cost (≤ $0.001 / 1k) → fast
 *   - otherwise          → balanced
 */
export function deriveRecommendedEffort(m: ModelConfig): EffortLevel {
  if (m.qualityScore >= 97) return 'thorough';
  if (m.costPer1kInput <= 0.001) return 'fast';
  return 'balanced';
}

/**
 * Project the gateway's model registry into the picker's option list. Filters
 * to enabled models and derives `label` + `recommendedEffort` (neither exists
 * on {@link ModelConfig}). Sorted highest-quality first so the dropdown leads
 * with the flagship. Pure — takes the registry, returns a new array.
 */
export function projectModelsForPicker(models: ModelConfig[]): PickerModel[] {
  return models
    .filter((m) => m.enabled)
    .map((m) => ({
      id: m.id,
      model: m.model,
      provider: m.provider,
      label: deriveModelLabel(m),
      recommendedEffort: deriveRecommendedEffort(m),
      contextWindow: m.contextWindow,
      qualityScore: m.qualityScore,
    }))
    .sort((a, b) => b.qualityScore - a.qualityScore);
}

/**
 * The `output_config.effort` a given wire model will accept, or undefined when
 * it accepts none — so the gateway never sends a parameter the model rejects.
 *
 * Effort was attached to every Anthropic request regardless of model, and
 * Haiku 4.5 rejects it with a 400. Short asks ("take me to CMC") and every
 * Fast turn route to the economy tier, which is Haiku 4.5, so each of those
 * turns failed its first call and was re-served up the fallback ladder —
 * slower, dearer, and on a turn that had tools, sometimes on a model path that
 * carries none.
 *
 *   Haiku 4.5, Sonnet 4.5 and older   → no effort (400 if sent)
 *   Opus 4.5                          → low | medium | high
 *   Opus 4.6, Sonnet 4.6              → low | medium | high | max
 *   Opus 4.7+, Sonnet 5, Claude 5 / Fable / Mythos → all levels
 *
 * A level the model does not take is lowered to the nearest it does, never
 * raised: the person asked for at most that much work.
 */
export function apiEffortForModel(
  wireModel: string,
  effort: 'low' | 'medium' | 'high' | 'max' | undefined
): 'low' | 'medium' | 'high' | 'max' | undefined {
  if (!effort) return undefined;
  const m = (wireModel || '').toLowerCase();
  if (!m.startsWith('claude-')) return effort;
  if (/^claude-(haiku|3|instant|2)/.test(m)) return undefined;
  if (/^claude-sonnet-4(-5|-2|$|-\d{8})/.test(m) || /^claude-sonnet-4-0/.test(m)) return undefined;
  if (/^claude-opus-4(-1|-0|$|-\d{8})/.test(m)) return undefined;
  if (/^claude-opus-4-5/.test(m)) return effort === 'max' ? 'high' : effort;
  return effort;
}
