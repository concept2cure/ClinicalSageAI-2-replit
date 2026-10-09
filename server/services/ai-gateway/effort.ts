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
 *   model_override validity  resolveModelOverride (enabled + approved-models)
 *   registry → picker shape  projectModelsForPicker (approved-models only)
 *
 * @module server/services/ai-gateway/effort
 */

import {
  EFFORT_TO_STRATEGY,
  type EffortLevel,
  type ModelConfig,
  type RoutingStrategy,
} from './types';
import { approvedEntryFor, type ApprovedModel, type PqStatus } from '../ai-governance/approved-models';

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
 * The approved-models entry a registry row IS, or undefined. Found the way the
 * served-model gate finds one ({@link approvedEntryFor}: provider plus wire
 * model), then held to identity: the entry's own id, and its pinned version on
 * the wire. The lookup alone is looser than a pin in two ways, both closed here:
 *
 *   - it also accepts a wire model EQUAL TO an entry's alias id (e.g. wire
 *     'claude-opus-4'), which names no pinned version at all;
 *   - it keys on the wire model, where the gateway's high-risk check keys on the
 *     registry id (`isApprovedForHighRisk(model.id)`), so a row carrying an
 *     approved version under another id would pass here and be refused there.
 *
 * The drift gate (detectModelDrift) already holds the registry to the same id
 * and pinned version, so every model in today's registry is its own entry and
 * this refuses none of them.
 */
function governingEntry(m: ModelConfig): ApprovedModel | undefined {
  const entry = approvedEntryFor({ provider: m.provider, model: m.model });
  return entry && entry.id === m.id && entry.pinnedVersion === m.model ? entry : undefined;
}

/**
 * Validate a client-supplied `model_override`. It is pinned only when all of
 * these hold, in order:
 *
 *   1. Enabled — the model is in the enabled set, matched on either the
 *      registry `id` or the wire `model` string (the picker sends `id`, but we
 *      accept either for resilience).
 *   2. Approved — the registry row is an approved-models entry: that entry's
 *      id, provider and pinned version ({@link governingEntry}). CLAUDE.md
 *      Rule 2: a model is selectable only as an approved-models entry with a
 *      pinned version, rationale and eval reference. Until 2026-09-28 any
 *      enabled model passed, and the gateway's own check refuses an unapproved
 *      explicit model on HIGH-RISK work only — so on every other turn a model
 *      with no governance entry could be pinned by any authenticated caller.
 *      An approved alias moved to any wire model its entry does not pin —
 *      including the alias id itself — fails here too.
 *   3. High-risk — when `opts.highRisk`, the entry is `approvedForHighRisk`. The
 *      gateway would refuse such a pin on high-risk work outright; refusing it
 *      here lets the caller fall back to its default instead. Because step 2
 *      holds the row to the entry's id, this is the same answer the gateway's
 *      id-keyed check gives for the row matched here.
 *
 * `opts.highRisk` has no default. A default of "not high-risk" let any caller
 * that forgot the question skip step 3; the type now makes every caller answer
 * it, and a JS caller that still omits it gets the strict answer.
 *
 * This does not enforce Rule 2's PQ clause: `approvedForHighRisk` is the
 * entry's approval, and every entry's PQ is still 'pending'. Nor does it apply
 * the tenant's placement (residency, ZDR, vendor allow-list); the gateway does,
 * and drops a pin placement excludes without saying so.
 *
 * Anything else — including an absent, empty or non-string value — resolves to
 * `null` and the caller falls back to the effort strategy; never a 4xx. Whether
 * a refusal is SAID is the caller's decision: the stream route writes a
 * MODEL_OVERRIDE_REFUSED warning when a non-blank string resolves to null.
 *
 * Returns the resolved `{ provider, model }` to hand to the gateway's
 * explicit-override path, so the caller doesn't re-scan the registry.
 */
export function resolveModelOverride(
  value: unknown,
  enabledModels: ModelConfig[],
  opts: { highRisk: boolean },
): { id: string; provider: ModelConfig['provider']; model: string } | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const match = enabledModels.find(
    (m) => m.enabled && (m.id === value || m.model === value),
  );
  if (!match) return null;
  const entry = governingEntry(match);
  if (!entry) return null;
  // Only an explicit `false` is normal-risk work; missing is the strict case.
  const highRisk = opts?.highRisk !== false;
  if (highRisk && entry.approvedForHighRisk !== true) return null;
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
  /**
   * The entry's `approvedForHighRisk`: whether governance has approved this
   * model for high-risk work (regulatory drafting and review). A pin of one
   * that is not is refused on such a turn — see {@link resolveModelOverride}.
   * It is not a PQ result: Rule 2's "only PQ-passed models serve high-risk
   * regulatory drafting" is enforced nowhere yet, and `pqStatus` says where
   * each model stands.
   */
  approvedForHighRisk: boolean;
  /**
   * Performance qualification, read from the entry's `pq.status` — 'pending'
   * for every entry today. Read, never defaulted: an option says 'passed' only
   * where the governed data records a pass.
   */
  pqStatus: PqStatus['status'];
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
 * to enabled models that are an approved-models entry ({@link governingEntry})
 * — the set {@link resolveModelOverride} will pin on normal-risk work, so the
 * picker never offers a model the route would refuse on every turn — and
 * derives `label` + `recommendedEffort`
 * (neither exists on {@link ModelConfig}). Each option carries its entry's
 * `approvedForHighRisk` and PQ status, so an option cannot read as more
 * approved than it is. Sorted highest-quality first so the dropdown leads with
 * the flagship. Pure — takes the registry, returns a new array.
 */
export function projectModelsForPicker(models: ModelConfig[]): PickerModel[] {
  return models
    .flatMap((m): PickerModel[] => {
      if (!m.enabled) return [];
      const entry = governingEntry(m);
      if (!entry) return [];
      return [
        {
          id: m.id,
          model: m.model,
          provider: m.provider,
          label: deriveModelLabel(m),
          recommendedEffort: deriveRecommendedEffort(m),
          contextWindow: m.contextWindow,
          qualityScore: m.qualityScore,
          approvedForHighRisk: entry.approvedForHighRisk,
          pqStatus: entry.pq.status,
        },
      ];
    })
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
 *
 * Read from the entry's `maxApiEffort`, not from its name. See that field for
 * why: a name rule is exactly what let every Bedrock id skip every check.
 */
export function apiEffortForModel(
  model: Pick<ModelConfig, 'maxApiEffort' | 'defaultApiEffort'>,
  requested: 'low' | 'medium' | 'high' | 'max' | undefined
): 'low' | 'medium' | 'high' | 'max' | undefined {
  // The person's choice first; the entry's declared default only when there
  // is none (see ModelConfig.defaultApiEffort).
  const effort = requested ?? model.defaultApiEffort;
  if (!effort) return undefined;
  const ceiling = model.maxApiEffort;
  // Undeclared or null: send nothing. A missing declaration costs a turn its
  // effort hint; sending one the model rejects costs the turn its first call.
  if (!ceiling) return undefined;
  if (ceiling === 'high' && effort === 'max') return 'high';
  return effort;
}
