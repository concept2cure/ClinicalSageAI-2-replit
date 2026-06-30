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
 * Hand-mapped display labels for the well-known registry ids, so the picker
 * shows "Claude Opus 4" rather than the raw wire id. Unknown ids fall back to a
 * humanized form of the registry id (see {@link humanizeModelId}).
 */
const MODEL_LABELS: Record<string, string> = {
  'claude-opus-4': 'Claude Opus 4',
  'claude-opus-4-legacy': 'Claude Opus 4 (legacy)',
  'claude-sonnet-4': 'Claude Sonnet 4',
  'claude-sonnet-4-legacy': 'Claude Sonnet 4 (legacy)',
  'claude-haiku-4': 'Claude Haiku 4',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o mini',
  'kimi-k2-0711': 'Kimi K2',
  'moonshot-v1-128k': 'Kimi (Moonshot v1 128k)',
  'moonshot-v1-32k': 'Kimi (Moonshot v1 32k)',
};

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
