/**
 * AI Gateway — Core Implementation
 *
 * Centralizes ALL LLM calls behind a single interface with:
 * - Multi-provider support (OpenAI, Claude, Kimi)
 * - Task-based routing
 * - Automatic fallback on failure
 * - Provider health tracking
 * - Audit logging
 * - Policy enforcement
 * - Deterministic mode for testing
 */

import { randomUUID, createHash, randomInt } from 'crypto';
import {
  gatewayRetryAttempts,
  overloadRetryAttempts,
  isHardClientError,
  isOverloadStatus,
  OVERLOAD_BASE_DELAY_MS,
} from './retry-policy.js';
import {
  fitsContextWindow,
  GatewayContextWindowError,
  type ContextWindowFit,
} from './context-budget.js';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type {
  GatewayRequest,
  GatewayResponse,
  GatewayConfig,
  GatewayMessage,
  ProviderName,
  TaskType,
  RoutingStrategy,
  ModelConfig,
  ProviderHealth,
  GatewayUsage,
  AnaGatewayResponse,
  AnaToolUse,
  GatewayCitation,
  GatewayServerToolUse,
  StreamCallback,
  ContentBlock,
} from './types';
import { GatewayAuditLogger } from './audit';
import {
  GatewayPolicyEngine,
  type ContentPolicyAction,
  type PolicyFinding,
} from './policy';
import { CLOUD_MODELS } from './providers/cloud-models';
import {
  parseOpenAIStreamDelta,
  extractOpenAIReasoning,
  parseOpenAIToolCallFragments,
  extractOpenAIToolCalls,
} from './openai-stream.js';
import {
  createBedrockClient,
  createVertexClient,
  createAzureClient,
  createLocalClient,
} from './providers/clients';
import {
  resolvePlacement,
  isPlacementCompliant,
} from './providers/placement';
import {
  getOrgPlacementResolver,
  mergeOrgPolicyDefaults,
} from './providers/org-placement';
import {
  decideSensitivePlacement,
  readProviderPlacementApprovals,
  type PlacementReasonCode,
  type ProviderPlacementApproval,
} from './sensitive-placement-policy';
import { recordApiUsageSafe, usdToCents } from '../usage-recorder.js';
import { createScopedLogger } from '../../utils/logger.js';
import { getContentClassifier } from '../ai-governance/classification/index.js';
import { isApprovedForHighRisk, isHighRiskRequest } from '../ai-governance/approved-models.js';
import {
  extractRequestText,
  getPiiEnforcement,
} from './pii-screen.js';
// In-flight concurrency limiter — bounds simultaneous outbound provider calls.
import { Semaphore, resolveMaxConcurrency } from './concurrency.js';
import { apiEffortForModel } from './effort.js';
const log = createScopedLogger('ai-gateway');

// ─────────────────────────────────────────────────────────────────────────────
// Default Model Registry
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_MODELS: ModelConfig[] = [
  {
    id: 'gpt-4o',
    provider: 'openai',
    model: 'gpt-4o',
    thinkingMode: 'none',
    supportsSamplingParams: true,
    contextWindow: 128000,
    qualityScore: 95,
    costPer1kInput: 0.005,
    costPer1kOutput: 0.015,
    capabilities: [
      'chat',
      'document_analysis',
      'structured_output',
      'regulatory_review',
      'code_generation',
      'summarization',
      'general',
    ],
    // Enabled at registry level — buildModelRegistry() gates on API key presence
    enabled: true,
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    model: 'gpt-4o-mini',
    thinkingMode: 'none',
    supportsSamplingParams: true,
    contextWindow: 128000,
    qualityScore: 82,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
    capabilities: ['chat', 'general', 'summarization'],
    // Enabled at registry level — buildModelRegistry() gates on API key presence
    enabled: true,
  },
  {
    // Internal id kept stable for alias continuity; the `model` field is the
    // actual ID sent to Anthropic and tracks the current flagship release.
    // Bumping this string is the sanctioned way to move AnA to a newer
    // flagship — and it now works, because the wire surface is DECLARED below
    // rather than inferred from the version. It used to be read off a regex
    // over this string, so a newer model fell outside the pattern, got the
    // legacy surface, and 400'd on the parameters it does not accept.
    // Bumping `model` means reviewing `thinkingMode` and
    // `supportsSamplingParams` with it, and updating the approved-models
    // lockfile (server/services/ai-governance/approved-models.ts), whose drift
    // gate fails CI on an unreviewed swap.
    id: 'claude-opus-4',
    provider: 'anthropic',
    model: 'claude-opus-5',
    maxApiEffort: 'max',
    thinkingMode: 'adaptive',
    supportsSamplingParams: false,
    supportsInlineSystem: true,
    supportsStructuredOutputs: true,
    // 1M window. It read 200000 for every Claude entry, which is the Claude 3
    // figure. Under-declaring it is the harmful direction for the admission
    // gate (see context-budget.ts): the gate refuses a request the model would
    // have taken and tells the author to cut a document that fit. Over-
    // declaring only means the provider refuses it, which is where we already
    // were.
    contextWindow: 1000000,
    qualityScore: 99,
    // $5 / $25 per MTok. These read 0.015/0.075 — Claude 3 Opus pricing —
    // through four model generations, so recordApiUsageSafe and every cost
    // report were roughly 3x over.
    costPer1kInput: 0.005,
    costPer1kOutput: 0.025,
    capabilities: [
      'chat',
      'document_analysis',
      'document_drafting',
      'structured_output',
      'regulatory_review',
      'code_generation',
      'summarization',
      'general',
    ],
    enabled: true,
  },
  {
    // Opus 4.8 — the previous flagship. Kept enabled as the top intra-provider
    // fallback rung: if Opus 5 is not yet GA for the tenant's tier or is
    // temporarily unavailable (rate limit, overloaded), the chain drops here
    // before Sonnet. It shares the reasoning-only surface (adaptive thinking,
    // no sampling params), so a fallback preserves the same reasoning
    // behaviour. Marginally lower quality score so the chain prefers Opus 5
    // when both are reachable.
    id: 'claude-opus-4-legacy',
    provider: 'anthropic',
    model: 'claude-opus-4-8',
    maxApiEffort: 'max',
    thinkingMode: 'adaptive',
    supportsSamplingParams: false,
    supportsInlineSystem: true,
    supportsStructuredOutputs: true,
    contextWindow: 1000000,
    qualityScore: 98,
    costPer1kInput: 0.005,
    costPer1kOutput: 0.025,
    capabilities: [
      'chat',
      'document_analysis',
      'document_drafting',
      'structured_output',
      'regulatory_review',
      'code_generation',
      'summarization',
      'general',
    ],
    enabled: true,
  },
  {
    // Internal id kept stable for alias continuity; model field tracks
    // the current Sonnet release.
    id: 'claude-sonnet-4',
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    maxApiEffort: 'max',
    supportsStructuredOutputs: true,
    // Sonnet 5 shares the flagship's reasoning-only surface: adaptive
    // thinking, and temperature/top_p/top_k rejected. Note this differs from
    // Sonnet 4.6 below, which keeps the legacy budget_tokens surface — the
    // reason these are per-entry flags rather than a family rule.
    thinkingMode: 'adaptive',
    supportsSamplingParams: false,
    contextWindow: 1000000,
    qualityScore: 97,
    // $2 / $10 per MTok.
    costPer1kInput: 0.002,
    costPer1kOutput: 0.010,
    capabilities: [
      'chat',
      'document_analysis',
      'document_drafting',
      'structured_output',
      'regulatory_review',
      'code_generation',
      'summarization',
      'general',
    ],
    enabled: true,
  },
  {
    // Sonnet 4.6 — the previous Sonnet. Same role as claude-opus-4-legacy:
    // the intra-provider rung below the current Sonnet. Replaces the dated
    // `claude-sonnet-4-20250514` snapshot that held this slot; a fallback
    // should be the previous generation, not a year-old pin. It keeps the
    // LEGACY thinking surface (budget_tokens + temperature), which the entry
    // above does not — so a drop to this rung changes the request shape, and
    // the declared flags are what make that safe.
    id: 'claude-sonnet-4-legacy',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    maxApiEffort: 'max',
    thinkingMode: 'budget',
    supportsSamplingParams: true,
    contextWindow: 1000000,
    qualityScore: 93,
    // $3 / $15 per MTok.
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    capabilities: [
      'chat',
      'document_analysis',
      'document_drafting',
      'structured_output',
      'regulatory_review',
      'code_generation',
      'summarization',
      'general',
    ],
    enabled: true,
  },
  {
    id: 'claude-haiku-4',
    provider: 'anthropic',
    // `claude-haiku-4-5` is the complete model id; the date suffix was a
    // stale-prior artifact. Haiku keeps the 200K window — unlike the Opus and
    // Sonnet entries above, that figure is correct here.
    model: 'claude-haiku-4-5',
    // null, not omitted: Haiku 4.5 rejects effort with a 400, and every
    // Fast turn routes here. Declared explicitly so the reason is on the
    // entry rather than implied by an absence.
    maxApiEffort: null,
    supportsStructuredOutputs: true,
    thinkingMode: 'budget',
    supportsSamplingParams: true,
    contextWindow: 200000,
    qualityScore: 85,
    // $1 / $5 per MTok.
    costPer1kInput: 0.001,
    costPer1kOutput: 0.005,
    capabilities: ['chat', 'general', 'summarization', 'structured_output'],
    enabled: true,
  },
  {
    id: 'kimi-k2-0711',
    provider: 'moonshot',
    model: 'kimi-k2-0711-preview',
    thinkingMode: 'none',
    supportsSamplingParams: true,
    contextWindow: 131072,
    qualityScore: 88,
    costPer1kInput: 0.0006,
    costPer1kOutput: 0.0018,
    capabilities: ['chat', 'document_analysis', 'general', 'structured_output', 'code_generation'],
    enabled: true,
  },
  {
    id: 'moonshot-v1-128k',
    provider: 'moonshot',
    model: 'moonshot-v1-128k',
    thinkingMode: 'none',
    supportsSamplingParams: true,
    contextWindow: 128000,
    qualityScore: 85,
    costPer1kInput: 0.0008,
    costPer1kOutput: 0.0008,
    capabilities: ['chat', 'document_analysis', 'general'],
    enabled: true,
  },
  {
    id: 'moonshot-v1-32k',
    provider: 'moonshot',
    model: 'moonshot-v1-32k',
    thinkingMode: 'none',
    supportsSamplingParams: true,
    contextWindow: 32000,
    qualityScore: 83,
    costPer1kInput: 0.0004,
    costPer1kOutput: 0.0004,
    capabilities: ['chat', 'general'],
    enabled: true,
  },
  // Private-cloud (Bedrock/Vertex/Azure) + self-hosted (local) substrates.
  // Always present in the static registry so the approved-models drift gate can
  // pin them; enabled at runtime only when their provider env is configured.
  ...CLOUD_MODELS,
];

// Task → preferred provider order
// Anthropic Claude is primary; OpenAI is automatic fallback when Claude is unavailable
const TASK_PROVIDER_PREFERENCES: Record<TaskType, ProviderName[]> = {
  chat: ['anthropic', 'openai', 'moonshot'],
  document_analysis: ['anthropic', 'openai', 'moonshot'],
  document_drafting: ['anthropic', 'openai', 'moonshot'],
  structured_output: ['anthropic', 'openai', 'moonshot'],
  regulatory_review: ['anthropic', 'openai', 'moonshot'],
  code_generation: ['anthropic', 'openai', 'moonshot'],
  summarization: ['anthropic', 'openai', 'moonshot'],
  embedding: ['anthropic', 'openai'],
  general: ['anthropic', 'openai', 'moonshot'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic Mode Responses
// ─────────────────────────────────────────────────────────────────────────────

const DETERMINISTIC_RESPONSES: Record<TaskType, string> = {
  chat:
    '## AnA Response (Demo Mode)\n\n' +
    "I'm AnA — your Audit & Narrative Assistant. I'm currently running in **demo mode** because no AI provider API key is configured.\n\n" +
    'When connected to Claude, I can:\n' +
    '- **[KNOWN]** Analyze your regulatory documents against ICH, FDA, and EMA requirements\n' +
    '- **[KNOWN]** Detect contradictions, assumption drift, and cross-section inconsistencies\n' +
    '- **[KNOWN]** Guide you through governed promotion (draft → review → approved → locked → submission-ready)\n' +
    '- **[INFERRED]** Suggest corrections based on body-specific expectations\n\n' +
    'To enable live AI responses, set `ANTHROPIC_API_KEY` in your `.env` file.\n\n' +
    '*Evidence discipline: Every claim is tagged [KNOWN], [INFERRED], or [MISSING].*',
  document_analysis:
    '## Document Analysis (Demo Mode)\n\n' +
    '**[KNOWN]** The document structure follows eCTD Module format.\n\n' +
    '**Findings:**\n' +
    '- **[KNOWN]** Section headers present and correctly numbered\n' +
    '- **[INFERRED]** Content completeness appears adequate for initial review\n' +
    '- **[MISSING]** Cross-references to supporting data not verified (requires live AI)\n\n' +
    '**Recommendation:** Enable live AI mode for full regulatory analysis with body-specific gap detection.',
  document_drafting:
    '## Document Draft (Demo Mode)\n\n' +
    '**[KNOWN]** This is a placeholder draft generated in demo mode.\n\n' +
    'When connected to Claude, AnA generates regulatory-grade document drafts with:\n' +
    '- Body-specific language (FDA/EMA/PMDA)\n' +
    '- Evidence-backed claims with citation tracking\n' +
    '- Governed content that flows through the approval pipeline\n\n' +
    'Set `ANTHROPIC_API_KEY` in `.env` to enable real document drafting.',
  structured_output:
    '{"result": "demo_mode", "status": "success", "message": "Deterministic mode active. Set ANTHROPIC_API_KEY to enable live AI.", "data": {}}',
  regulatory_review:
    '## Regulatory Review (Demo Mode)\n\n' +
    '**[KNOWN]** AnA is operating in demo mode — no live AI analysis performed.\n\n' +
    '**When connected, AnA provides:**\n' +
    '- **Compliance check** against 21 CFR Part 11, ICH E6(R2), EU MDR, ISO 14155\n' +
    '- **Gap detection** with body-specific expectations (FDA, EMA, PMDA, MHRA)\n' +
    '- **Risk ranking** with severity classification (critical → major → minor)\n' +
    '- **Correction drafts** with governed execution paths\n' +
    '- **Contradiction detection** with overlay-aware authority escalation\n\n' +
    '**[MISSING]** Live regulatory analysis requires `ANTHROPIC_API_KEY` in `.env`.',
  code_generation:
    '// Demo mode — set ANTHROPIC_API_KEY for live code generation\nfunction demoMode() {\n  return { status: "demo", message: "AI provider not configured" };\n}',
  summarization:
    '**Summary (Demo Mode):** [KNOWN] This content relates to regulatory submissions. ' +
    '[INFERRED] The document appears to follow standard eCTD formatting. ' +
    '[MISSING] Detailed analysis requires live AI — set ANTHROPIC_API_KEY in .env.',
  embedding: '[]',
  general:
    "**AnA (Demo Mode):** I'm running without an AI provider. " +
    'Set `ANTHROPIC_API_KEY` in your `.env` file to enable full regulatory intelligence. ' +
    'All governance features (promotion, contradictions, readiness) work independently of the AI provider.',
};

// ─────────────────────────────────────────────────────────────────────────────
// Gateway Class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The sampling seed to transmit, for providers that accept one.
 *
 * ── Why a seed is injected at all ───────────────────────────────────────────
 * `seed` was plumbed end-to-end — request → provider params → audit ledger —
 * and no caller has ever set it, so the column was structurally NULL. A
 * provenance record that cannot reproduce its own generation is a record of
 * very little; recording the seed is what makes "re-run this exact call" a
 * thing an auditor can actually ask for.
 *
 * ── Why RANDOM per request, not a fixed constant ────────────────────────────
 * Reproducibility here means "we can reproduce THIS generation", not "every
 * generation is identical". A constant (or a prompt-derived) seed would make
 * repeated identical requests return byte-identical output — so a user pressing
 * Regenerate on a draft they disliked would get the same draft back, forever.
 * A fresh random seed per call keeps variation intact AND makes each individual
 * output replayable, because the seed that produced it is recorded next to it.
 *
 * Range is a signed 32-bit positive integer: OpenAI documents `seed` as an
 * integer, and staying inside 2^31-1 avoids any 64-bit/float round-tripping
 * question at the JSON boundary.
 */
function resolveSeed(requested: number | undefined): number {
  if (typeof requested === 'number' && Number.isFinite(requested)) return requested;
  return randomInt(0, 2 ** 31 - 1);
}

/**
 * Test seam for resolveSeed. Exported separately so the helper itself stays a
 * private implementation detail of the provider paths.
 */
export const resolveSeedForTest = resolveSeed;

/**
 * Split `messages` into the top-level `system` prompt and the body.
 *
 * The two Anthropic executors each carried their own copy of
 * `filter(m => m.role === 'system')` / `filter(m => m.role !== 'system')`.
 * That filter ignores POSITION: every system message was hoisted to the front
 * regardless of where it sat, so a mid-conversation operator instruction
 * silently became part of the persona — and, with prompt caching on (which the
 * agentic loop always sets), could become the cache breakpoint itself,
 * invalidating the whole prefix on every steer.
 *
 * Here, a system message carrying `inlineSystem` stays in the body at its
 * position when the model accepts one. When it does not, it is folded into the
 * preceding user turn as `[User interjection]: …` — byte-for-byte what the
 * platform sent before this existed, which is what makes the capability safe to
 * land on its own.
 *
 * Placement is the API's, not ours: an inline system turn must follow a user
 * turn and cannot be first. A message that would violate that is downgraded
 * rather than sent — an invalid shape is a 400 for the whole turn, and losing
 * the cache-preserving form is a much smaller cost than losing the answer.
 */
function partitionSystemMessages(
  messages: GatewayMessage[],
  supportsInlineSystem: boolean
): { systemMessages: GatewayMessage[]; bodyMessages: GatewayMessage[] } {
  const systemMessages: GatewayMessage[] = [];
  const bodyMessages: GatewayMessage[] = [];

  for (const m of messages) {
    if (m.role !== 'system') {
      bodyMessages.push(m);
      continue;
    }
    const previousBody = bodyMessages[bodyMessages.length - 1];

    // Two operator instructions in a row are one instruction. Merging them is
    // not a nicety: the API wants an inline system turn to follow a USER turn,
    // so a second consecutive one would fail placement — and, before this
    // branch existed, fell through to the persona, where a mid-run steer would
    // have silently become part of AnA's identity for the rest of the
    // conversation. That is the worst available outcome for a steer: not
    // dropped, not applied, permanently misfiled.
    if (
      m.inlineSystem &&
      supportsInlineSystem &&
      previousBody?.role === 'system' &&
      previousBody.inlineSystem
    ) {
      bodyMessages[bodyMessages.length - 1] = {
        ...previousBody,
        content: `${previousBody.content}\n\n${m.content}`,
      };
      continue;
    }

    const placementOk = previousBody?.role === 'user';
    if (m.inlineSystem && supportsInlineSystem && placementOk) {
      bodyMessages.push(m);
      continue;
    }
    if (m.inlineSystem) {
      // Downgrade. Fold into the preceding user turn when there is one;
      // otherwise it is an opening instruction after all, and belongs in the
      // top-level system prompt.
      const previous = bodyMessages[bodyMessages.length - 1];
      if (previous && previous.role === 'user') {
        bodyMessages[bodyMessages.length - 1] = {
          ...previous,
          content: `${previous.content}\n\n[User interjection]: ${m.content}`,
        };
      } else {
        systemMessages.push(m);
      }
      continue;
    }
    systemMessages.push(m);
  }

  return { systemMessages, bodyMessages: fillEmptyBodyMessages(bodyMessages) };
}

/**
 * The Messages API refuses a body message with empty content (every message
 * but an optional final assistant one), and it refuses the WHOLE request — a
 * 400 the gateway then repeated on every fallback model, marking the provider
 * unhealthy on the way. One blank assistant turn in the agentic loop's
 * transcript (a round that called tools without narrating) was enough to end
 * the turn. A blank turn carries no information, so it is filled with a
 * neutral marker rather than sent; callers should not produce one, and this is
 * the belt for the one that does.
 */
export function fillEmptyBodyMessages(messages: GatewayMessage[]): GatewayMessage[] {
  let changed = false;
  const out = messages.map(m => {
    if (m.contentBlocks && m.contentBlocks.length > 0) return m;
    if (typeof m.content === 'string' && m.content.trim().length > 0) return m;
    changed = true;
    return { ...m, content: m.role === 'assistant' ? '(Continuing.)' : '(No message.)' };
  });
  return changed ? out : messages;
}

/**
 * Resolve the Anthropic structured-output format for a request.
 *
 * Returns the `output_config.format` value when the caller supplied a schema AND
 * the resolved model can enforce it, plus whether that guarantee was applied.
 *
 * Three rules worth stating:
 *
 *   - **No schema, no format.** Anthropic has no `json_object` mode, so the
 *     OpenAI path's schema-less fallback has no counterpart. `jsonMode` alone is
 *     a prompt instruction, not a wire parameter; fabricating an empty schema
 *     would constrain the model to nothing.
 *   - **Unsupported model answers anyway.** Around fifteen services call
 *     `ai.structured()` and the router reaches a model without the capability on
 *     every fallback. Refusing there trades a silent gap for an outage. The gap
 *     is reported instead — see `structuredOutputEnforced`.
 *   - **Citations are mutually exclusive with it.** The API returns a 400 for the
 *     pair. Refusing here, with a message naming both, is better than finding it
 *     as a provider error on a governed path.
 */
function resolveStructuredOutputFormat(
  request: GatewayRequest,
  modelConfig: ModelConfig
): { format?: { type: 'json_schema'; schema: Record<string, unknown> }; enforced: boolean } {
  if (!request.jsonSchema) return { enforced: false };

  const usesCitations = (request.messages || []).some(m =>
    m.contentBlocks?.some(b => b.type === 'document' && b.citations?.enabled)
  );
  if (usesCitations) {
    throw new GatewayPolicyError(
      'A JSON schema and document citations cannot be requested together — the ' +
        'Anthropic API refuses the pair. Ask for one or the other: a constrained ' +
        'shape, or an answer that cites the page it came from.'
    );
  }

  if (modelConfig.supportsStructuredOutputs !== true) return { enforced: false };
  return { format: { type: 'json_schema', schema: request.jsonSchema }, enforced: true };
}

/**
 * Normalise one wire citation into {@link GatewayCitation}.
 *
 * The API emits five location shapes — page, character range, content block,
 * web-search result, search result — for one idea: this claim came from here.
 * Callers recording provenance should not have to branch on all five, and a
 * shape this function does not recognise still yields its `cited_text` rather
 * than being dropped, because the span is the part that matters most.
 */
/**
 * Fold one content block into the running record of Anthropic-executed tools.
 *
 * The gateway's block loops handled `text`, `thinking` and `tool_use`, and let
 * everything else fall through. So a turn that ran a web search looked exactly
 * like a turn that did not: the citations came back, because those ride on the
 * text blocks, but the SEARCH ITSELF was gone — no record that it happened, no
 * query, and nothing for the work trace to show. For a product whose claim is
 * that AnA shows her work, a step that happened and is invisible is worse than
 * one that failed loudly: the trace reads as complete.
 *
 * Returns true when the block was a server-tool block, so a caller can tell
 * "handled here" from "not mine".
 *
 * `server_tool_use` and its result arrive as SEPARATE blocks. They are matched
 * by id where the API gives one; a result whose use we never saw still gets an
 * entry, because an unmatched result is evidence of work we are otherwise not
 * recording at all.
 */
/**
 * Did this result block carry an error rather than results?
 *
 * A server tool does not raise: a failed web search is an HTTP 200 whose result
 * body is an error OBJECT where a success would be a LIST. The shape is the
 * only signal there is, so it is read here rather than inferred at each caller.
 */
function isServerToolError(block: any): boolean {
  if (block?.is_error) return true;
  const content = block?.content;
  if (content == null || Array.isArray(content) || typeof content !== 'object') return false;
  return typeof (content as any).error_code === 'string';
}

/** Record a `server_tool_use` block: the model asked Anthropic to do something. */
function recordServerToolUse(block: any, into: GatewayServerToolUse[]): void {
  into.push({
    ...(typeof block.id === 'string' ? { id: block.id } : {}),
    name: typeof block.name === 'string' ? block.name : 'server_tool',
    ...(block.input && typeof block.input === 'object' ? { input: block.input } : {}),
  });
}

/**
 * Record a `*_tool_result` block against the use it belongs to.
 *
 * The use and its result arrive as SEPARATE blocks, matched by id where the API
 * gives one. A result whose use we never saw still gets an entry: an unmatched
 * result is evidence of work we would otherwise not be recording at all, and
 * dropping it would recreate the defect in miniature.
 */
function recordServerToolResult(block: any, type: string, into: GatewayServerToolUse[]): void {
  const isError = isServerToolError(block);
  const useId = typeof block.tool_use_id === 'string' ? block.tool_use_id : undefined;
  const existing = useId ? into.find(entry => entry.id === useId) : undefined;
  if (existing) {
    existing.result = block.content;
    if (isError) existing.isError = true;
    return;
  }
  into.push({
    ...(useId ? { id: useId } : {}),
    // Recover the tool from the block type: `web_search_tool_result` -> web_search.
    name: type.replace(/_tool_result$/, '') || 'server_tool',
    result: block.content,
    ...(isError ? { isError: true } : {}),
  });
}

/**
 * Fold one content block into the running record of Anthropic-executed tools.
 *
 * The gateway's block loops handled `text`, `thinking` and `tool_use`, and let
 * everything else fall through. So a turn that ran a web search looked exactly
 * like a turn that did not: the citations came back, because those ride on the
 * text blocks, but the SEARCH ITSELF was gone — no record that it happened, no
 * query, and nothing for the work trace to show. For a product whose claim is
 * that AnA shows her work, a step that happened and is invisible is worse than
 * one that failed loudly, because the trace reads as complete.
 *
 * Returns true when the block was a server-tool block, so a caller can tell
 * "handled here" from "not mine".
 */
function collectServerToolBlock(block: any, into: GatewayServerToolUse[]): boolean {
  const type: string = block?.type ?? '';
  if (type === 'server_tool_use') {
    recordServerToolUse(block, into);
    return true;
  }
  if (!type.endsWith('_tool_result')) return false;
  recordServerToolResult(block, type, into);
  return true;
}

/**
 * Route one opening content block to whatever is recording it.
 *
 * A `tool_use` opens a buffer for its streamed arguments. Anything else may be
 * Anthropic-executed work — a web search, a web fetch — which the handler used
 * to let fall through, so the search vanished from the record while its
 * citations (which ride on the text blocks) still arrived. Same collector as
 * the non-streaming path, so the two cannot describe the same event
 * differently.
 */
function openContentBlock(
  event: any,
  toolUses: AnaToolUse[],
  toolInputBuffers: ToolInputBuffers,
  serverToolUses: GatewayServerToolUse[]
): void {
  if (event.content_block?.type === 'tool_use') {
    toolUses.push({
      id: event.content_block.id,
      name: event.content_block.name,
      input: {},
    });
    toolInputBuffers.set(event.index, { toolIndex: toolUses.length - 1, json: '' });
    return;
  }
  collectServerToolBlock(event.content_block, serverToolUses);
}

function normalizeCitation(raw: any): GatewayCitation | null {
  const citedText = typeof raw?.cited_text === 'string' ? raw.cited_text : '';
  if (!citedText) return null;
  return {
    citedText,
    locationType: typeof raw?.type === 'string' ? raw.type : 'unknown',
    ...(typeof raw?.document_title === 'string' ? { documentTitle: raw.document_title } : {}),
    ...(typeof raw?.title === 'string' ? { documentTitle: raw.title } : {}),
    ...(typeof raw?.start_page_number === 'number' ? { startPage: raw.start_page_number } : {}),
    ...(typeof raw?.end_page_number === 'number' ? { endPage: raw.end_page_number } : {}),
    ...(typeof raw?.start_char_index === 'number' ? { startCharIndex: raw.start_char_index } : {}),
    ...(typeof raw?.end_char_index === 'number' ? { endCharIndex: raw.end_char_index } : {}),
    ...(typeof raw?.url === 'string' ? { url: raw.url } : {}),
  };
}

/** One buffer per open tool_use block, keyed by the stream event's `index`. */
type ToolInputBuffers = Map<number, { toolIndex: number; json: string }>;

/**
 * Append one `input_json_delta` fragment to its block's buffer. A fragment for
 * a block we never saw open is dropped rather than starting a buffer with no
 * tool to attach to.
 */
function appendToolInputFragment(
  buffers: ToolInputBuffers,
  index: number,
  fragment: unknown
): void {
  const buffered = buffers.get(index);
  if (buffered) buffered.json += typeof fragment === 'string' ? fragment : '';
}

/**
 * Attach a streamed tool input to its tool use.
 *
 * `buffered` is the concatenation of the block's `input_json_delta` fragments.
 * Three cases, and the difference between the last two is the whole point:
 *
 *   - empty buffer      the model emitted no fragments, so the tool genuinely
 *                       takes no arguments. `input` stays `{}` and nothing is
 *                       flagged.
 *   - parses            the model's arguments, attached as-is.
 *   - does not parse    the arguments existed and we could not reconstruct
 *                       them. `input` stays `{}` — but `inputParseError` says
 *                       so, because dispatching a handler on `{}` here would
 *                       run the tool as though the model had asked for
 *                       nothing, and report back a "missing parameters" error
 *                       that blames the model for our loss.
 *
 * `truncationReason` is for a block that never closed, where even an empty
 * buffer means arguments that had not arrived yet rather than none at all.
 *
 * Never throws: a malformed input is a reportable outcome for one tool call,
 * not a reason to fail the whole turn.
 */
function finalizeToolInput(
  toolUse: AnaToolUse | undefined,
  buffered: string,
  truncationReason?: string
): void {
  if (!toolUse) return;
  if (truncationReason) {
    // The block never closed. An empty buffer here is not a zero-argument
    // call — it is a call whose arguments had not arrived yet.
    toolUse.inputParseError = truncationReason;
    return;
  }
  if (buffered.length === 0) return;
  try {
    const parsed = JSON.parse(buffered);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      toolUse.input = parsed as Record<string, unknown>;
      return;
    }
    toolUse.inputParseError = `tool input was ${Array.isArray(parsed) ? 'an array' : typeof parsed}, not an object`;
  } catch (err: any) {
    toolUse.inputParseError = `tool input was not parseable JSON: ${err?.message ?? 'unknown error'}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI-compatible tool calling (openai / azure / local / moonshot)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Chat Completions refuses a request carrying more tools than this — the whole
 * request, with a 400. AnA's relevance selection already offers ~50 a turn, so
 * this is the belt for a caller that offers everything.
 */
const OPENAI_MAX_TOOLS = 128;

/**
 * It also refuses a function description longer than this ("Invalid
 * 'tools[n].function.description': string too long. Expected a string with
 * maximum length 1024"), on OpenAI and Azure alike — and 131 of AnA's 762
 * tools were longer when this was written. Sent as written, any turn that
 * offered one of them would fail on every OpenAI-compatible model; trimmed,
 * the model reads the head of the description and the turn keeps its tools.
 */
const OPENAI_MAX_TOOL_DESCRIPTION_CHARS = 1024;

/** The function names Chat Completions accepts. Any other name 400s the request. */
const OPENAI_TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Tools whose description has already been reported as trimmed. The same tools
 * are offered on every round of every turn; one warning per tool per process
 * says what an operator needs without burying the log in it.
 */
const openAITrimmedDescriptionsReported = new Set<string>();

interface OpenAIFunctionTool {
  type: 'function';
  function: { name: string; description?: string; parameters: Record<string, unknown> };
}

/**
 * The gateway's tool_choice vocabulary (Anthropic's) in OpenAI's. 'auto' is the
 * API's own default whenever tools are present, so it — like an unset choice —
 * sends nothing.
 */
function toOpenAIToolChoice(
  choice: GatewayRequest['toolChoice']
): 'none' | 'required' | { type: 'function'; function: { name: string } } | undefined {
  if (choice === undefined || choice === 'auto') return undefined;
  if (choice === 'none') return 'none';
  if (choice === 'any') return 'required';
  return { type: 'function', function: { name: choice.name } };
}

/**
 * Offer the request's tools on an OpenAI-compatible Chat Completions request.
 *
 * These paths used to build their params with no tools and return no tool
 * calls, so an AnA turn that landed on one — a cross-provider fallback, a model
 * pin, an ANA_TIER_*_MODEL remap, a deployment holding only an OpenAI or Kimi
 * key — lost every tool without a word: she could not navigate, act on a
 * screen, run a demo, or call anything else, and nothing reported it.
 *
 * `{ name, description, input_schema }` becomes `{ type: 'function', function:
 * { name, description, parameters } }`; the schema is the same JSON Schema on
 * both surfaces, so it passes through. Not everything crosses, and what does
 * not is logged rather than dropped quietly:
 *
 *   - Anthropic SERVER tools (web_search, web_fetch, code_execution) carry no
 *     input_schema and run in Anthropic's infrastructure. There is nothing on
 *     this side to execute one, so it is not offered.
 *   - A name this API would reject is not offered, because one bad name
 *     refuses the whole request and every other tool with it.
 *
 * `tool_choice` goes only alongside tools — the API rejects it without them.
 * Moonshot documents only 'auto' and 'none'; a forced choice ('any', or a
 * named tool) is still sent as asked, and its 400 is a hard client error that
 * moves the fallback walk to a model that can honour it, rather than a turn
 * that was required to call a tool quietly answering without one.
 */
function applyOpenAIToolParams(
  params: Record<string, unknown>,
  request: GatewayRequest,
  modelConfig: ModelConfig
): void {
  if (!request.tools || request.tools.length === 0) return;
  const target = `${modelConfig.provider}/${modelConfig.model}`;

  const functions: OpenAIFunctionTool[] = [];
  const serverTools: string[] = [];
  const rejectedNames: string[] = [];
  const newlyTrimmed: string[] = [];

  for (const tool of request.tools as Array<Record<string, any>>) {
    const schema = tool?.input_schema;
    if (!schema || typeof schema !== 'object') {
      serverTools.push(String(tool?.name ?? tool?.type ?? 'unnamed'));
      continue;
    }
    const name = tool.name;
    if (typeof name !== 'string' || !OPENAI_TOOL_NAME.test(name)) {
      rejectedNames.push(String(name));
      continue;
    }
    let description = typeof tool.description === 'string' ? tool.description : '';
    if (description.length > OPENAI_MAX_TOOL_DESCRIPTION_CHARS) {
      description = `${description.slice(0, OPENAI_MAX_TOOL_DESCRIPTION_CHARS - 1)}…`;
      if (!openAITrimmedDescriptionsReported.has(name)) {
        openAITrimmedDescriptionsReported.add(name);
        newlyTrimmed.push(name);
      }
    }
    functions.push({
      type: 'function',
      function: { name, ...(description ? { description } : {}), parameters: schema },
    });
  }

  if (serverTools.length > 0) {
    log.warn(
      `[AI Gateway] ${target}: ${serverTools.length} Anthropic server tool(s) not offered — ` +
        `they run only on Anthropic: ${serverTools.join(', ')}`
    );
  }
  if (rejectedNames.length > 0) {
    log.warn(
      `[AI Gateway] ${target}: ${rejectedNames.length} tool(s) not offered — name not accepted ` +
        `by OpenAI function calling (${OPENAI_TOOL_NAME}): ${rejectedNames.join(', ')}`
    );
  }
  if (newlyTrimmed.length > 0) {
    log.warn(
      `[AI Gateway] Tool description(s) trimmed to ${OPENAI_MAX_TOOL_DESCRIPTION_CHARS} chars for ` +
        `OpenAI-compatible providers (reported once per tool): ${newlyTrimmed.join(', ')}`
    );
  }
  if (functions.length > OPENAI_MAX_TOOLS) {
    const dropped = functions.splice(OPENAI_MAX_TOOLS);
    log.warn(
      `[AI Gateway] ${target}: ${OPENAI_MAX_TOOLS + dropped.length} tools offered, the API accepts ` +
        `${OPENAI_MAX_TOOLS} — sending the first ${OPENAI_MAX_TOOLS}, not offering: ` +
        dropped.map(f => f.function.name).join(', ')
    );
  }
  if (functions.length === 0) return;

  params.tools = functions;
  const toolChoice = toOpenAIToolChoice(request.toolChoice);
  if (toolChoice !== undefined) params.tool_choice = toolChoice;
}

/**
 * An id for a tool call a server sent without one. It is only a correlation
 * key — the loop quotes it back beside the call's result — so it needs to be
 * unique, not meaningful; a positional one would repeat every round.
 */
function openAIToolCallId(): string {
  return `call_${randomUUID()}`;
}

/**
 * Tool uses off a NON-streaming OpenAI-compatible message. Arguments arrive as
 * a JSON string, so they go through finalizeToolInput exactly as a streamed
 * Anthropic input does: parsed onto `input`, or `{}` plus `inputParseError`
 * when they will not parse (a `length` stop mid-arguments is the usual way) —
 * never a bare `{}` that dispatches as a call with no arguments.
 */
function readOpenAIToolUses(message: unknown): AnaToolUse[] {
  return extractOpenAIToolCalls(message).map(call => {
    const toolUse: AnaToolUse = { id: call.id || openAIToolCallId(), name: call.name, input: {} };
    finalizeToolInput(toolUse, call.arguments);
    return toolUse;
  });
}

/**
 * The message list for an OpenAI-compatible request.
 *
 * This surface sends `content` only (`contentBlocks` are not forwarded), so a
 * message is empty when that string is — and a blank one is filled exactly as
 * the Anthropic side fills it. Moonshot refuses the whole request over one
 * ("the message at position N with role 'assistant' must not be empty"), and
 * a round that called tools without narrating is the ordinary way to stage one.
 */
function toOpenAIChatMessages(
  messages: GatewayMessage[]
): Array<{ role: GatewayMessage['role']; content: string }> {
  return fillEmptyBodyMessages(messages.map(m => ({ role: m.role, content: m.content })));
}

/** Providers whose executor forwards contentBlocks — the Anthropic family. */
const CONTENT_BLOCK_PROVIDERS: ReadonlySet<ProviderName> = new Set(['anthropic', 'bedrock', 'vertex']);

/**
 * Refuse to send an image or document to a provider that would never see it.
 *
 * The OpenAI-compatible and Moonshot executors send message text only
 * (toOpenAIChatMessages). Until 2026-09-23 a vision request that reached one —
 * a pinned Sonnet that was down, then the fallback ladder — was answered from
 * the instructions alone, and the reply came back as an extraction of a scan
 * the model had not been given. Terminal (GatewayPolicyError): no rung that
 * drops the image can answer this request, so none is tried.
 */
function assertContentBlocksCarried(modelConfig: ModelConfig, request: GatewayRequest): void {
  if (CONTENT_BLOCK_PROVIDERS.has(modelConfig.provider)) return;
  const carriesMedia = request.messages.some(m => m.contentBlocks?.some(b => b.type !== 'text'));
  if (!carriesMedia) return;
  throw new MediaNotCarriedError(modelConfig);
}

export class AIGateway {
  private config: GatewayConfig;
  private models: ModelConfig[];
  private providerHealth: Map<ProviderName, ProviderHealth>;
  private auditLogger: GatewayAuditLogger;
  private policyEngine: GatewayPolicyEngine;
  // Bounds the number of concurrent in-flight outbound provider calls.
  private outboundLimiter: Semaphore;

  // Provider SDK instances (lazy-initialized)
  private openaiClient: any = null;
  private anthropicClient: any = null;
  private moonshotClient: any = null;
  // Private-cloud + self-hosted substrate clients.
  private bedrockClient: any = null;
  private vertexClient: any = null;
  private azureClient: any = null;
  private localClient: any = null;

  private roundRobinIndex = 0;

  constructor(config?: Partial<GatewayConfig>) {
    this.config = this.buildConfig(config);
    this.models = this.buildModelRegistry();
    this.providerHealth = new Map();
    this.auditLogger = new GatewayAuditLogger(this.config.dbPool);
    this.policyEngine = new GatewayPolicyEngine(this.config.policy);
    this.outboundLimiter = new Semaphore(resolveMaxConcurrency());

    this.initProviderHealth();
    this.initProviderClients();

    log.debug(
      `[AI Gateway] Initialized — providers: ${this.getEnabledProviders().join(', ')}, strategy: ${this.config.defaultStrategy}, deterministic: ${this.config.deterministicMode}`
    );
  }

  /**
   * Verify the provenance ledger is writable. Throws with the remedy if not.
   * No-op when auditing is switched off, which is an explicit operator choice
   * rather than the silent failure this guards against.
   */
  async assertAuditStoreReady(): Promise<void> {
    if (!this.config.auditEnabled) return;
    await this.auditLogger.initialize();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Per-request retry with exponential backoff + jitter
  // ─────────────────────────────────────────────────────────────────────────

  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 1,
    baseDelayMs: number = 1000,
    overload: { maxRetries: number; baseDelayMs: number } = { maxRetries, baseDelayMs }
  ): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return await fn();
      } catch (err: any) {
        // Governance decisions are not transient provider failures. Retrying
        // duplicated denial audits and could never make the placement safe.
        if (err instanceof GatewayPolicyError) throw err;
        // Neither is a cancel. Retrying it re-runs the work the caller just
        // stopped — the opposite of what they asked for.
        if (err instanceof GatewayAbortedError) throw err;
        const status = err?.status || err?.statusCode;
        // Hard client errors (400/401/403/404/422, …) never succeed on retry.
        if (isHardClientError(status)) throw err;

        // Overload (429/503/529 — incl. Anthropic "Overloaded") self-heals, so
        // it earns a larger budget and longer backoff than a generic transient.
        const overloaded = isOverloadStatus(status);
        const budget = overloaded ? overload.maxRetries : maxRetries;
        const base = overloaded ? overload.baseDelayMs : baseDelayMs;

        if (attempt >= budget) throw err;
        const delay = base * Math.pow(2, attempt);
        const jitter = delay * 0.3 * Math.random(); // 0-30% jitter
        await new Promise(r => setTimeout(r, delay + jitter));
        attempt++;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Route an AI request through the gateway.
   * This is the ONLY method external code should call.
   */
  async route(request: GatewayRequest): Promise<GatewayResponse> {
    const requestId = randomUUID();
    const startTime = Date.now();
    const strategy = request.strategy || this.config.defaultStrategy;

    // Already cancelled before we started — happens whenever a control lands
    // between agentic rounds. Spend nothing: no classification, no policy
    // pass, no provider call, no audit row for work that was never done.
    if (request.signal?.aborted) throw new GatewayAbortedError('pre_call');

    // Apply the org's default placement policy (residency / zero-retention) when
    // the request doesn't specify it. Explicit request values always win; if no
    // policy or the lookup fails, behavior is unchanged (explicit-only).
    request = await this.applyOrgPlacementDefaults(request);

    // Capture classification before the redaction policy can replace sensitive
    // values. The last-mile placement gate consumes this immutable category.
    if (this.config.policy.piiDetection) {
      try {
        const text = extractRequestText(request);
        const classification = text.trim()
          ? await getContentClassifier().classify(text)
          : { phi: false, pii: false };
        request = {
          ...request,
          sensitiveDataClass: classification.phi ? 'phi' : classification.pii ? 'pii' : 'none',
        };
      } catch {
        request = { ...request, sensitiveDataClass: 'unknown' };
      }
    }

    // Policy check (sync: token budget, prompt-injection scan, blocked
    // patterns, rate limits)
    const policyResult = this.policyEngine.evaluate(request);
    if (!policyResult.allowed) {
      // Content-security refusals (injection blocks) are compliance events and
      // leave an audit trace. Budget/rate denials carry no block findings and
      // keep their existing unaudited behavior (no rate-limit audit spam).
      await this.logContentPolicyBlock(
        request, strategy, requestId, startTime, policyResult.reason, policyResult.findings
      );
      throw new GatewayPolicyError(policyResult.reason || 'Request blocked by policy');
    }

    // PII/PHI content pass (async — governed ai-governance classifier).
    // Blocks fail closed; 'redact' swaps a scrubbed COPY of the messages into
    // the dispatch request, leaving the caller's original request untouched.
    const piiVerdict = await this.policyEngine.evaluatePiiPolicy(request);
    if (!piiVerdict.allowed) {
      await this.logContentPolicyBlock(
        request, strategy, requestId, startTime, piiVerdict.reason, piiVerdict.findings
      );
      throw new GatewayPolicyError(piiVerdict.reason || 'Request blocked by PII policy');
    }
    if (piiVerdict.action === 'redact' && piiVerdict.messages) {
      request = { ...request, messages: piiVerdict.messages };
    }

    // Non-blocking findings (injection flags, applied redactions, coverage
    // gaps) ride into the audit entry alongside the prompt hash.
    const contentFindings: PolicyFinding[] = [
      ...(policyResult.findings ?? []),
      ...piiVerdict.findings,
    ];
    const contentPolicy =
      contentFindings.length > 0
        ? {
            action: (piiVerdict.action === 'allow'
              ? 'flag'
              : piiVerdict.action) as ContentPolicyAction,
            findings: contentFindings,
          }
        : undefined;

    // Deterministic mode
    if (this.config.deterministicMode) {
      return this.buildDeterministicResponse(request, requestId, startTime);
    }

    // Select model — fall back to deterministic if no providers available
    let selectedModel: ModelConfig | null;
    try {
      selectedModel = this.selectModel(request, strategy);
    } catch (error) {
      // A governance refusal is a compliance event: it leaves an audit trace
      // naming the models withheld, exactly as a content-policy block does.
      if (error instanceof ModelNotApprovedError) {
        await this.logModelApprovalRefusal(request, strategy, requestId, startTime, error);
      }
      throw error;
    }
    if (!selectedModel) {
      // Fail closed in production: serving demo-mode ("[KNOWN]"/placeholder)
      // regulatory text from a keyless prod deploy would silently present
      // fabricated content as a real AI response. Demo fallback is for dev only;
      // an explicit deterministicMode (handled above) remains a deliberate opt-in.
      // See FORENSIC_CODE_AUDIT_2026-05-29.md (LOW: keyless-prod demo mode).
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          '[AI Gateway] No AI provider is configured in production; refusing to serve demo-mode content. ' +
            'Set ANTHROPIC_API_KEY / OPENAI_API_KEY, or enable deterministicMode explicitly.'
        );
      }
      log.warn(
        '[AI Gateway] No providers available — falling back to demo mode. Set ANTHROPIC_API_KEY in .env to enable live AI.'
      );
      return this.buildDeterministicResponse(request, requestId, startTime);
    }

    // Execute with fallback. Track tried MODELS (not just providers) so
    // the fallback chain can exhaust Anthropic's quality ladder
    // (Opus 4.7 → Opus 4 → Sonnet 4.6 → Sonnet 4 → Haiku 4.5) before
    // crossing to a different provider. Previously a single Anthropic
    // failure jumped straight to OpenAI, which wasted the intra-Anthropic
    // fallback surface.
    let lastError: Error | null = null;
    const triedModels: string[] = [];

    // Context-window admission (context-budget.ts). A model that cannot hold
    // the request is skipped BEFORE any SDK call: it goes on the tried list so
    // the fallback chain moves past it, and it is recorded here so the final
    // error can say so — but it is NOT a provider failure, so it never reaches
    // recordFailure and never pushes a healthy provider toward the breaker.
    // The request may still fit a model with a larger window further down the
    // chain; that is the graceful path, and the only reason to keep going.
    const refusedForSize: ContextWindowFit[] = [];
    const admit = (model: ModelConfig): boolean => {
      const fit = fitsContextWindow(request, model);
      if (fit.fits) return true;
      refusedForSize.push(fit);
      triedModels.push(model.id);
      log.warn(
        `[AI Gateway] ${model.provider}/${model.model} skipped: request is ~${fit.estimatedTokens} tokens, ` +
          `its context window is ${model.contextWindow}`
      );
      return false;
    };

    // Try primary model (per-request retry: 2 attempts, 1s base delay for
    // non-streaming). Streaming is not retried — replaying would re-emit tokens
    // already delivered to request.onStream.
    const isStreaming = Boolean(request.stream && request.onStream);
    const primaryRetries = gatewayRetryAttempts(isStreaming);
    const overloadPolicy = { maxRetries: overloadRetryAttempts(isStreaming), baseDelayMs: OVERLOAD_BASE_DELAY_MS };
    if (admit(selectedModel)) {
      try {
        const response = await this.retryWithBackoff(
          () => this.executeProvider(selectedModel, request, requestId, startTime), primaryRetries, 1000, overloadPolicy
        );
        this.recordSuccess(selectedModel.provider, response.latencyMs);
        this.recordTenantUsage(request, response, true);
        await this.logAudit(request, response, strategy, true, undefined, triedModels, contentPolicy);
        return response;
      } catch (error: any) {
        // Policy denials are terminal. Never retry or cross-provider fallback:
        // doing so would turn a placement refusal into a routing hint.
        if (error instanceof GatewayPolicyError) throw error;
        // A cancel is terminal for the same shape of reason, and the stakes
        // are higher: falling back would re-run the entire request the user
        // just stopped on every remaining rung, and recordFailure would mark a
        // provider that did nothing wrong as unhealthy for everyone else.
        if (error instanceof GatewayAbortedError) throw error;
        lastError = error;
        triedModels.push(selectedModel.id);
        this.recordFailure(selectedModel.provider, error);
        log.warn(
          `[AI Gateway] ${selectedModel.provider}/${selectedModel.model} failed: ${error.message}`
        );
      }
    }

    // Try fallback models — same provider first (quality-desc), then cross-provider.
    const fallbacks = this.getFallbackModels(
      request,
      triedModels,
      selectedModel.provider,
    );
    for (const fallback of fallbacks) {
      if (!admit(fallback)) continue;
      try {
        log.debug(`[AI Gateway] Falling back to ${fallback.provider}/${fallback.model}`);
        const response = await this.retryWithBackoff(
          () => this.executeProvider(fallback, request, requestId, startTime), 1, 1000, overloadPolicy
        );
        this.recordSuccess(fallback.provider, response.latencyMs);
        this.recordTenantUsage(request, response, true);
        await this.logAudit(request, response, strategy, true, undefined, triedModels, contentPolicy);
        return response;
      } catch (error: any) {
        if (error instanceof GatewayPolicyError) throw error;
        if (error instanceof GatewayAbortedError) throw error;
        lastError = error;
        triedModels.push(fallback.id);
        this.recordFailure(fallback.provider, error);
        log.warn(
          `[AI Gateway] Fallback ${fallback.provider}/${fallback.model} failed: ${error.message}`
        );
      }
    }

    // All providers failed — log and throw
    const errorResponse: GatewayResponse = {
      content: '',
      provider: selectedModel.provider,
      model: selectedModel.model,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      latencyMs: Date.now() - startTime,
      requestId,
      cached: false,
      deterministic: false,
      finishReason: 'error',
    };
    // When every candidate was refused for size, no provider was ever called.
    // That is not "all providers failed" — it is "this request cannot be served
    // in one call" — and it is reported as such, with the numbers the caller
    // needs to fix it, instead of being dressed as a provider outage.
    const sizeRefusal =
      lastError === null && refusedForSize.length > 0
        ? new GatewayContextWindowError(refusedForSize)
        : null;
    const skippedForSize =
      refusedForSize.length > 0
        ? ` Skipped for size: ${refusedForSize
            .map((r) => `${r.provider}/${r.model} (${r.contextWindow}-token window)`)
            .join(', ')}.`
        : '';
    this.recordTenantUsage(request, errorResponse, false);
    await this.logAudit(
      request, errorResponse, strategy, false, (sizeRefusal ?? lastError)?.message, triedModels, contentPolicy
    );

    if (sizeRefusal) throw sizeRefusal;
    throw new GatewayAllProvidersFailedError(
      `All models failed. Tried: ${triedModels.join(', ')}. Last error: ${lastError?.message}.${skippedForSize}`
    );
  }

  /**
   * Placement decision for an embedding call.
   *
   * Embeddings are the one governed egress that does not pass through
   * `route()`: `embeddings/embedding-provider.ts` calls the provider SDK
   * itself, and until P0-11 (SECURITY_AUDIT_2026-09-24 DP-07) vault text
   * reached OpenAI with no classification, no placement decision and no audit
   * row. This runs, over a synthetic `embedding` request, the same three
   * steps `route()` runs before a chat dispatch — the org's placement
   * defaults, content classification, the last-mile sensitive-dispatch gate —
   * plus the residency / zero-retention rule `selectModel()` applies to chat
   * candidates (`meetsPlacementRequirements`): an embedding provider is fixed
   * by `EMBEDDING_PROVIDER` rather than chosen by routing, so a request that
   * cannot be placed on it is refused rather than re-routed.
   *
   * Resolves when the call may proceed. Throws {@link GatewayPolicyError}
   * (terminal: never retried, never re-routed) with a stable reason code when
   * it may not; the refusal is written to the audit ledger like every other
   * content-policy block. Neither the error, the audit row nor any log line
   * carries the text — only reason code, provider, region and data class.
   */
  async authorizeEmbedding(input: {
    organizationId?: string | number;
    provider: 'openai' | 'local';
    texts: string[];
    requestId?: string;
  }): Promise<void> {
    const requestId = input.requestId ?? randomUUID();
    const startTime = Date.now();

    let request: GatewayRequest = {
      taskType: 'embedding',
      organizationId: input.organizationId,
      provider: input.provider,
      callerModule: 'embedding-provider',
      messages: [{ role: 'user', content: input.texts.join('\n') }],
    };

    request = await this.applyOrgPlacementDefaults(request);

    // Same classification block as route(): a detector failure is 'unknown',
    // which the enforced gate refuses (DENY_DETECTOR_FAILURE).
    if (this.config.policy.piiDetection) {
      try {
        const text = extractRequestText(request);
        const classification = text.trim()
          ? await getContentClassifier().classify(text)
          : { phi: false, pii: false };
        request = {
          ...request,
          sensitiveDataClass: classification.phi ? 'phi' : classification.pii ? 'pii' : 'none',
        };
      } catch {
        request = { ...request, sensitiveDataClass: 'unknown' };
      }
    }
    const dataClass = request.sensitiveDataClass ?? 'unknown';

    // (a) Residency / zero-retention — every data class, every environment.
    // For chat this is the candidate filter in selectModel(); the org's policy
    // has already been merged into the request by applyOrgPlacementDefaults.
    const needsZdr =
      request.zeroDataRetention === true ||
      request.sensitiveTenantPolicy?.zeroDataRetention === true;
    const residency =
      request.dataResidency && request.dataResidency !== 'any' ? request.dataResidency : null;
    const placement = resolvePlacement(input.provider);
    if (!isPlacementCompliant(placement, { zeroDataRetention: needsZdr, residency })) {
      const reasonCode: PlacementReasonCode =
        needsZdr && !placement.zeroDataRetention
          ? 'DENY_SHARED_PROVIDER_WITHOUT_ZDR'
          : 'DENY_TENANT_POLICY';
      const region = residency ?? placement.regions[0];
      log.info('[ai-gateway] embedding placement decision', {
        reasonCode,
        provider: input.provider,
        region,
        dataClass,
        allowed: false,
      });
      await this.logContentPolicyBlock(
        {
          ...request,
          metadata: {
            ...(request.metadata ?? {}),
            sensitivePlacement: { reasonCode, provider: input.provider, region, dataClass },
          },
        },
        request.strategy || this.config.defaultStrategy,
        requestId,
        startTime,
        reasonCode,
        [{
          scope: 'pii',
          action: 'block',
          messageIndex: -1,
          role: 'request',
          detector: 'embedding_placement_policy',
          contentClass: dataClass,
        }],
      );
      throw new GatewayPolicyError(
        `This content cannot be embedded by the configured embedding service (${reasonCode}). ` +
          'Contact your administrator to review the approved data-placement policy.'
      );
    }

    // (b) The last-mile sensitive-dispatch gate, exactly as executeProvider
    // applies it before a chat SDK call, with intended use 'embedding'.
    await this.assertSensitiveDispatchAllowed(
      { provider: input.provider } as ModelConfig,
      request,
      requestId,
      startTime,
    );
  }

  /**
   * Simple completion helper — wraps a single user message.
   */
  /**
   * Performance qualification: run a request on EXACTLY one model, by registry
   * id, and return what it produced — for `server/eval/pq/run-pq.ts` only.
   *
   * Why this exists rather than `route({ model })`. Routing now refuses an
   * explicit request for a model that is not approved for high-risk work, and
   * `docs/LAUNCH_DEFINITION_OF_DONE.md` says an unapproved model (GPT, Kimi,
   * `local`) earns approval by passing its PQ. The PQ therefore has to be able
   * to exercise an unapproved model on a drafting task. An exemption flag on
   * `route()` would be a bypass any caller could set; this is a separate,
   * narrower door instead:
   *
   *   - one named model, no selection, no fallback, no retry — a PQ result
   *     attributed to a model that did not answer is not a PQ result;
   *   - the last-mile sensitive-dispatch gate still runs (it lives in
   *     executeProvider), so evaluation cannot move data a tenant's placement
   *     policy forbids;
   *   - every call is audited with `purpose: 'performance-qualification'`;
   *   - `scripts/ci/check-pq-evaluation-callers.mjs` fails the build if anything
   *     outside `server/eval/pq/` calls it. Its output is never a governed
   *     artifact.
   */
  async evaluateModel(
    modelId: string,
    request: Omit<GatewayRequest, 'provider' | 'model' | 'strategy'>,
  ): Promise<GatewayResponse> {
    const model = this.models.find(m => m.id === modelId);
    if (!model) {
      throw new GatewayNoProviderError(`PQ: "${modelId}" is not a model the gateway knows.`);
    }
    if (!model.enabled) {
      throw new GatewayNoProviderError(
        `PQ: "${modelId}" is known but its provider (${model.provider}) is not configured — nothing was evaluated.`,
      );
    }
    const requestId = randomUUID();
    const startTime = Date.now();
    const tagged: GatewayRequest = {
      ...request,
      model: model.id,
      metadata: { ...(request.metadata ?? {}), purpose: 'performance-qualification' },
    };
    const response = await this.executeProvider(model, tagged, requestId, startTime);
    await this.logAudit(tagged, response, 'explicit', true, undefined, [model.id]);
    return response;
  }

  async complete(prompt: string, options?: Partial<GatewayRequest>): Promise<string> {
    const response = await this.route({
      taskType: options?.taskType || 'general',
      messages: [{ role: 'user', content: prompt }],
      ...options,
    });
    return response.content;
  }

  /**
   * Chat completion helper — wraps system + user messages.
   */
  async chat(
    systemPrompt: string,
    userMessage: string,
    options?: Partial<GatewayRequest>
  ): Promise<GatewayResponse> {
    return this.route({
      taskType: 'chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      ...options,
    });
  }

  /**
   * Structured output helper — wraps call with JSON mode.
   */
  async structuredOutput<T = unknown>(
    prompt: string,
    schema?: Record<string, unknown>,
    options?: Partial<GatewayRequest>
  ): Promise<T> {
    const response = await this.route({
      taskType: 'structured_output',
      messages: [{ role: 'user', content: prompt }],
      jsonMode: true,
      jsonSchema: schema,
      temperature: 0.1,
      ...options,
    });

    try {
      return JSON.parse(response.content) as T;
    } catch {
      throw new Error(
        `AI Gateway: Failed to parse structured output as JSON: ${response.content.slice(0, 200)}`
      );
    }
  }

  /**
   * Get health status of all providers.
   */
  getProviderHealth(): ProviderHealth[] {
    return Array.from(this.providerHealth.values());
  }

  /**
   * Get enabled providers.
   */
  getEnabledProviders(): ProviderName[] {
    return this.config.providers.filter(p => p.enabled).map(p => p.name);
  }

  /**
   * Get the model registry (built at construction, gated on API-key presence).
   * Read-only accessor for surfaces that need to project the available models —
   * e.g. the Composer's model picker. Returns the live array reference; callers
   * must not mutate it (project/filter into a new array instead).
   */
  getModels(): ModelConfig[] {
    return this.models;
  }

  /**
   * Check if gateway is in deterministic mode.
   */
  isDeterministic(): boolean {
    return this.config.deterministicMode;
  }

  /**
   * Toggle deterministic mode at runtime.
   */
  setDeterministicMode(enabled: boolean): void {
    this.config.deterministicMode = enabled;
    log.debug(`[AI Gateway] Deterministic mode: ${enabled}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Provider Execution
  // ─────────────────────────────────────────────────────────────────────────

  private async executeProvider(
    modelConfig: ModelConfig,
    request: GatewayRequest,
    requestId: string,
    startTime: number
  ): Promise<GatewayResponse> {
    assertContentBlocksCarried(modelConfig, request);
    await this.assertSensitiveDispatchAllowed(modelConfig, request, requestId, startTime);
    // Bound concurrent in-flight outbound calls. This is the single chokepoint
    // for every provider invocation (primary + fallback paths), so wrapping it
    // here caps outbound concurrency without touching the retry / circuit-
    // breaker / timeout logic, which all run inside the provider executors.
    return this.outboundLimiter.run(() =>
      this.dispatchProvider(modelConfig, request, requestId, startTime)
    );
  }

  /** Last-mile gate: it runs for the primary and every fallback before an SDK is invoked. */
  private async assertSensitiveDispatchAllowed(
    modelConfig: ModelConfig,
    request: GatewayRequest,
    requestId: string,
    startTime: number,
  ): Promise<void> {
    if (!this.config.policy.piiDetection) return;
    const detectedDataClass = request.sensitiveDataClass ?? 'unknown';
    // Development retains audit-only usefulness; production always uses the
    // explicit deployment contract and fails closed on unknown classification.
    // AI_SENSITIVE_DATA_POLICY_MODE is the same deployment contract the
    // production boot assert requires (strictly 'enforce'): any environment
    // that declares it — staging included — gets dispatch-time enforcement,
    // not just a passing boot check. AI_PII_ENFORCEMENT=block keeps its
    // existing meaning as an equivalent opt-in.
    const enforcement = getPiiEnforcement();
    const enforced =
      process.env.NODE_ENV === 'production' ||
      process.env.AI_SENSITIVE_DATA_POLICY_MODE === 'enforce' ||
      enforcement === 'block';
    if (!enforced) {
      // 'off' disables screening entirely. 'audit' exists to make otherwise
      // invisible exposure visible, so it still RECORDS the placement signal
      // (content-free, below) even though it never blocks.
      if (enforcement !== 'audit' || detectedDataClass === 'none') return;
    }
    const placement = resolvePlacement(modelConfig.provider);
    let approvals: Record<string, ProviderPlacementApproval>;
    try {
      approvals = readProviderPlacementApprovals();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      if (enforced) {
        // Malformed operator configuration is a governance failure, not a
        // provider outage. GatewayPolicyError is terminal — never retried and
        // never walked down the fallback chain — so the request fails closed
        // and is reported as the config error it is.
        throw new GatewayPolicyError(
          'AI provider placement approvals are misconfigured ' +
            `(AI_PROVIDER_PLACEMENT_APPROVALS: ${detail}). Sensitive dispatch fails closed ` +
            'until the configuration is fixed.'
        );
      }
      // Audit-only mode never blocks: record the config failure and evaluate
      // the decision against an empty approval set so the signal stays honest.
      log.warn('[ai-gateway] sensitive-data screen: AI_PROVIDER_PLACEMENT_APPROVALS is malformed', {
        error: detail,
      });
      approvals = {};
    }
    const region = request.dataResidency && request.dataResidency !== 'any'
      ? request.dataResidency
      : placement.regions[0];
    const approval = approvals[modelConfig.provider];
    const decision = decideSensitivePlacement({
      environment: process.env.NODE_ENV || 'development',
      detectedDataClass,
      tenantPolicy: {
        resolution: request.sensitiveTenantPolicy?.resolution ?? 'absent',
        requiredRegion: request.sensitiveTenantPolicy?.residency && request.sensitiveTenantPolicy.residency !== 'any'
          ? request.sensitiveTenantPolicy.residency
          : request.dataResidency && request.dataResidency !== 'any' ? request.dataResidency : undefined,
        requireZeroRetention: request.sensitiveTenantPolicy?.zeroDataRetention ?? request.zeroDataRetention,
        allowedProviders: request.sensitiveTenantPolicy?.allowedSubstrates &&
          !request.sensitiveTenantPolicy.allowedSubstrates.includes(placement.substrate)
          ? []
          : undefined,
      },
      provider: modelConfig.provider,
      region,
      zeroRetentionApproval: approval?.zeroRetentionApproved === true,
      intendedUse: request.taskType,
      providerApproval: approval,
    });
    if (!enforced) {
      // Audit-only (non-production): the deleted route-level screen warned
      // whenever PHI/PII headed to a provider without zero-retention approval;
      // that signal is what audit mode exists for. Content-free by
      // construction — classes/provider/region/approval and the would-be
      // decision, never message content. Never blocks.
      log.warn('[ai-gateway] sensitive-data screen', {
        classes: [decision.dataClass],
        provider: decision.provider,
        region: decision.region,
        zeroRetentionApproved: approval?.zeroRetentionApproved === true,
        reasonCode: decision.reasonCode,
        enforcement,
      });
      return;
    }
    log.info('[ai-gateway] sensitive placement decision', {
      reasonCode: decision.reasonCode,
      provider: decision.provider,
      region: decision.region,
      dataClass: decision.dataClass,
      allowed: decision.allowed,
    });
    if (!decision.allowed) {
      await this.logContentPolicyBlock(
        {
          ...request,
          metadata: {
            ...(request.metadata ?? {}),
            sensitivePlacement: {
              reasonCode: decision.reasonCode,
              provider: decision.provider,
              region: decision.region,
              dataClass: decision.dataClass,
            },
          },
        },
        request.strategy || this.config.defaultStrategy,
        requestId,
        startTime,
        decision.reasonCode,
        [{
          scope: 'pii',
          action: 'block',
          messageIndex: -1,
          role: 'request',
          detector: 'sensitive_placement_policy',
          contentClass: decision.dataClass,
        }],
      );
      throw new GatewayPolicyError(
        `This request cannot be sent to the configured AI service (${decision.reasonCode}). ` +
        'Contact your administrator to review the approved data-placement policy.'
      );
    }
  }

  private async dispatchProvider(
    modelConfig: ModelConfig,
    request: GatewayRequest,
    requestId: string,
    startTime: number
  ): Promise<GatewayResponse> {
    switch (modelConfig.provider) {
      case 'openai':
      case 'azure':
      case 'local':
        // OpenAI-compatible substrates share one execution path; the client is
        // resolved per provider inside executeOpenAI.
        return this.executeOpenAI(modelConfig, request, requestId, startTime);
      case 'anthropic':
      case 'bedrock':
      case 'vertex':
        // Anthropic-family substrates (first-party + Bedrock + Vertex) share the
        // proven Claude path; the client is resolved per provider.
        return this.executeAnthropic(modelConfig, request, requestId, startTime);
      case 'moonshot':
        return this.executeMoonshot(modelConfig, request, requestId, startTime);
      default:
        throw new Error(`Unknown provider: ${modelConfig.provider}`);
    }
  }

  /**
   * Resolve the Anthropic-family SDK client for a provider. First-party,
   * Bedrock, and Vertex all expose the same messages.create() surface, so the
   * gateway can run them through the single executeAnthropic path.
   */
  private anthropicFamilyClient(provider: ProviderName): any {
    switch (provider) {
      case 'bedrock':
        return this.bedrockClient;
      case 'vertex':
        return this.vertexClient;
      default:
        return this.anthropicClient;
    }
  }

  /** Resolve the OpenAI-compatible SDK client for a provider. */
  private openaiFamilyClient(provider: ProviderName): any {
    switch (provider) {
      case 'azure':
        return this.azureClient;
      case 'local':
        return this.localClient;
      default:
        return this.openaiClient;
    }
  }

  private async executeOpenAI(
    modelConfig: ModelConfig,
    request: GatewayRequest,
    requestId: string,
    startTime: number
  ): Promise<AnaGatewayResponse> {
    // Resolve the OpenAI-compatible client for this provider (openai / azure / local).
    const client = this.openaiFamilyClient(modelConfig.provider);
    if (!client) {
      throw new Error(
        `${modelConfig.provider} client not initialized (missing credentials/endpoint for ${modelConfig.provider})`
      );
    }

    // Streaming requested — deliver tokens (and reasoning, where the provider
    // emits it) incrementally, at parity with the Anthropic path.
    if (request.stream && request.onStream) {
      return this.executeOpenAICompatibleStream(
        client,
        modelConfig,
        request,
        requestId,
        startTime
      );
    }

    const params: any = {
      model: modelConfig.model,
      messages: toOpenAIChatMessages(request.messages),
      max_tokens: request.maxTokens || 2000,
      temperature: request.temperature ?? 0.7,
    };

    // Always send a seed here: this surface accepts one, and a recorded seed is
    // what makes the generation replayable. resolveSeed honours a caller-
    // supplied value and otherwise mints a fresh random one per call.
    const effectiveSeed = resolveSeed(request.seed);
    params.seed = effectiveSeed;

    if (request.jsonMode) {
      // Strict json_schema is a frontier/Azure feature; self-hosted
      // OpenAI-compatible servers generally support only json_object.
      const supportsStrictSchema = modelConfig.provider !== 'local';
      if (request.jsonSchema && supportsStrictSchema) {
        params.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'response',
            strict: true,
            schema: request.jsonSchema,
          },
        };
      } else {
        params.response_format = { type: 'json_object' };
      }
    }

    applyOpenAIToolParams(params, request, modelConfig);

    const completion = await Promise.race([
      client.chat.completions.create(params, request.signal ? { signal: request.signal } : undefined),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${modelConfig.provider} API call timed out after 120s`)), 120_000)
      ),
    ]).catch((error: Error) => {
      if (error.message.includes('timed out')) {
        this.recordFailure(modelConfig.provider, error);
      }
      throw error;
    });
    const choice = completion.choices?.[0];
    const reasoning = extractOpenAIReasoning(choice?.message);
    const toolUses = readOpenAIToolUses(choice?.message);

    return {
      content: choice?.message?.content || '',
      thinking: reasoning || undefined,
      toolUses: toolUses.length > 0 ? toolUses : undefined,
      provider: modelConfig.provider,
      model: modelConfig.model,
      // The snapshot the provider says answered — `modelConfig.model` is only
      // the alias we asked for. See GatewayResponse.resolvedModel.
      resolvedModel: typeof completion.model === 'string' ? completion.model : undefined,
      effectiveSeed,
      usage: {
        inputTokens: completion.usage?.prompt_tokens || 0,
        outputTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0,
        estimatedCostUsd: this.estimateCost(
          modelConfig,
          completion.usage?.prompt_tokens || 0,
          completion.usage?.completion_tokens || 0
        ),
      },
      latencyMs: Date.now() - startTime,
      requestId,
      cached: false,
      deterministic: false,
      finishReason: choice?.finish_reason || 'unknown',
    } as AnaGatewayResponse;
  }

  /**
   * Did the model that served this call accept sampling parameters?
   *
   * Answered from the registry, by the provider + model string the response
   * reports. A model the registry does not know returns `false`: the caller
   * (the audit ledger) must not assert a sampling parameter it cannot show
   * was transmitted.
   */
  private modelAcceptsSamplingParams(provider: ProviderName, model: string): boolean {
    const entry = this.models.find(m => m.provider === provider && m.model === model);
    return entry?.supportsSamplingParams === true;
  }

  /**
   * Apply Anthropic sampling + thinking params from the registry entry's
   * declared wire surface.
   *
   * This used to ask a regex — `/claude-opus-4-(\d{1,2})/`, version >= 7 —
   * whether the model was reasoning-only. That made the shape of a request a
   * function of how a model was NAMED: any model outside the pattern got the
   * legacy surface, including newer ones that reject `temperature` and
   * `budget_tokens` with a 400. The registry's own comment calls bumping the
   * model string "the sanctioned way to move AnA to a newer flagship", and
   * that bump was exactly what the regex broke.
   *
   * Capability now comes from the entry (`thinkingMode`,
   * `supportsSamplingParams`), so moving to a new model is a data change and
   * a substrate that lacks a feature can say so.
   */
  private applyAnthropicSamplingParams(
    params: any,
    modelConfig: ModelConfig,
    request: GatewayRequest
  ): void {
    if (modelConfig.thinkingMode === 'adaptive') {
      if (request.thinking?.enabled) {
        // Adaptive thinking self-budgets — the resolver's budgetTokens is a hint
        // that only the legacy surface below consumes. Summarized display keeps
        // the reasoning stream visible to the client on the SSE path.
        params.thinking = { type: 'adaptive', display: 'summarized' };
      }
      return;
    }
    if (!modelConfig.supportsSamplingParams) {
      // Declared as rejecting sampling params without adaptive thinking on
      // offer. Send neither rather than falling through to a surface this
      // model does not accept.
      return;
    }
    if (modelConfig.thinkingMode === 'none' && request.thinking?.enabled) {
      // Thinking was asked for and this model has no surface for it. Honour
      // the sampling half and leave `thinking` off, rather than sending a
      // shape that 400s.
      params.temperature = request.temperature ?? 0.7;
      return;
    }
    if (request.thinking?.enabled) {
      // Legacy manual extended thinking requires temperature=1 and no top_p/top_k.
      // Anthropic also requires budget_tokens < max_tokens (thinking shares the
      // output budget) — clamp so a large effort-scaled budget on a small
      // max_tokens turn can never 400. Leave >=1024 headroom for the answer.
      const maxTok = typeof params.max_tokens === 'number' ? params.max_tokens : 4096;
      const requested = request.thinking.budgetTokens || 10000;
      const budget = Math.max(1024, Math.min(requested, maxTok - 1024));
      params.thinking = { type: 'enabled', budget_tokens: budget };
      params.temperature = 1;
    } else {
      params.temperature = request.temperature ?? 0.7;
    }
  }

  private async executeAnthropic(
    modelConfig: ModelConfig,
    request: GatewayRequest,
    requestId: string,
    startTime: number
  ): Promise<AnaGatewayResponse> {
    // Resolve the Anthropic-family client (first-party / Bedrock / Vertex).
    const client = this.anthropicFamilyClient(modelConfig.provider);
    if (!client) {
      throw new Error(
        `${modelConfig.provider} client not initialized (missing credentials for ${modelConfig.provider})`
      );
    }

    // If streaming requested, delegate to streaming method
    if (request.stream && request.onStream) {
      return this.executeAnthropicStream(modelConfig, request, requestId, startTime);
    }

    // Convert messages — Anthropic needs system separate. Position matters:
    // an operator turn marked `inlineSystem` stays in the body (see
    // partitionSystemMessages), so it does not rewrite the persona or move the
    // cache breakpoint.
    const { systemMessages, bodyMessages: nonSystemMessages } = partitionSystemMessages(
      request.messages,
      modelConfig.supportsInlineSystem === true,
    );

    const cacheEnabled = !!request.promptCache?.enabled;
    const cacheType = request.promptCache?.type;

    // Build messages with multi-modal support (vision) + optional prompt-cache
    // breakpoints on individual user/assistant turns.
    const messages = nonSystemMessages.map(m => {
      const shouldCache = cacheEnabled && m.cacheControl === true;
      // If message has contentBlocks (images + text), use structured content
      if (m.contentBlocks && m.contentBlocks.length > 0) {
        const blocks = m.contentBlocks.map(block => {
          if (block.type === 'image') {
            return { type: 'image' as const, source: block.source } as any;
          }
          if (block.type === 'document') {
            return {
              type: 'document' as const,
              source: block.source,
              ...(block.title ? { title: block.title } : {}),
              ...(block.context ? { context: block.context } : {}),
              ...(block.citations ? { citations: block.citations } : {}),
            } as any;
          }
          return { type: 'text' as const, text: block.text } as any;
        });
        if (shouldCache && blocks.length > 0) {
          blocks[blocks.length - 1].cache_control = { type: cacheType };
        }
        return { role: m.role, content: blocks };
      }
      // Also handle request-level imageContent (convenience API)
      if (m.role === 'user' && request.imageContent && request.imageContent.length > 0) {
        const content: any[] = request.imageContent.map(img => ({
          type: 'image' as const,
          source: img.source,
        }));
        content.push({ type: 'text' as const, text: m.content });
        if (shouldCache) {
          content[content.length - 1].cache_control = { type: cacheType };
        }
        return { role: m.role, content };
      }
      if (shouldCache) {
        return {
          role: m.role,
          content: [
            {
              type: 'text' as const,
              text: m.content,
              cache_control: { type: cacheType },
            },
          ],
        };
      }
      return { role: m.role, content: m.content };
    });

    const params: any = {
      model: modelConfig.model,
      max_tokens: request.maxTokens || 4096,
      messages,
    };

    // System prompt with optional prompt caching
    if (systemMessages.length > 0) {
      if (request.promptCache?.enabled) {
        const cacheType = request.promptCache.type;
        const flagged = systemMessages.some(m => m.cacheControl === true);
        // Honor explicit per-message cacheControl flags when present;
        // otherwise apply cache_control to the last system message.
        params.system = systemMessages.map((m, i) => ({
          type: 'text',
          text: m.content,
          ...((flagged ? m.cacheControl === true : i === systemMessages.length - 1)
            ? { cache_control: { type: cacheType } }
            : {}),
        }));
      } else {
        params.system = systemMessages.map(m => m.content).join('\n\n');
      }
    }

    // Sampling + extended thinking (model-aware: reasoning-only models reject
    // temperature and manual budget_tokens thinking; older models keep the
    // legacy surface).
    this.applyAnthropicSamplingParams(params, modelConfig, request);

    // Structured output. Throws on the citations conflict before anything is
    // sent, rather than letting the provider 400 it.
    const structured = resolveStructuredOutputFormat(request, modelConfig);
    if (structured.format) {
      params.output_config = { ...(params.output_config ?? {}), format: structured.format };
    }
    // Only a level this model accepts (Haiku 4.5 rejects effort outright).
    const modelEffort = apiEffortForModel(modelConfig, request.apiEffort);
    if (modelEffort) {
      params.output_config = { ...(params.output_config ?? {}), effort: modelEffort };
    }

    // Tool use
    if (request.tools && request.tools.length > 0) {
      params.tools = request.tools;
      if (request.toolChoice) {
        params.tool_choice =
          typeof request.toolChoice === 'string'
            ? { type: request.toolChoice }
            : request.toolChoice;
      }
    }

    const usesFilesApiDoc = (request.messages || []).some(m =>
      m.contentBlocks?.some(b => b.type === 'document' && b.source.type === 'file')
    );
    // Merged, not replaced: the Files-API beta header rides in the same
    // RequestOptions object, so building one and adding to it is what keeps
    // both from clobbering each other.
    const reqOptions: Record<string, unknown> = {};
    if (usesFilesApiDoc) reqOptions.headers = { 'anthropic-beta': 'files-api-2025-04-14' };
    if (request.signal) reqOptions.signal = request.signal;

    const response = await Promise.race([
      client.messages.create(params, Object.keys(reqOptions).length > 0 ? reqOptions : undefined),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${modelConfig.provider} API call timed out after 120s`)), 120_000)
      ),
    ]).catch((error: Error) => {
      if (error.message.includes('timed out')) {
        this.recordFailure(modelConfig.provider, error);
      }
      throw error;
    });

    // Extract text, thinking, and tool use blocks
    let content = '';
    let thinking = '';
    const toolUses: AnaToolUse[] = [];

    // On the non-streaming path a cited answer splits into several text blocks,
    // each carrying the citations for the span it contains — the same facts the
    // streaming path receives as citations_delta.
    const nonStreamCitations: GatewayCitation[] = [];
    const nonStreamServerTools: GatewayServerToolUse[] = [];

    for (const block of response.content || []) {
      if (block.type === 'text') {
        content += block.text;
        for (const raw of ((block as any).citations || []) as any[]) {
          const citation = normalizeCitation(raw);
          if (citation) nonStreamCitations.push(citation);
        }
      } else if (collectServerToolBlock(block, nonStreamServerTools)) {
        // Recorded by the collector; nothing further to accumulate here.
      } else if (block.type === 'thinking') {
        thinking += (block as any).thinking || '';
      } else if (block.type === 'tool_use') {
        toolUses.push({
          id: (block as any).id,
          name: (block as any).name,
          input: (block as any).input,
        });
      }
    }

    // Calculate cache stats if prompt caching was used
    const cacheStats =
      response.usage?.cache_creation_input_tokens !== undefined
        ? {
            cacheCreationInputTokens: response.usage.cache_creation_input_tokens || 0,
            cacheReadInputTokens: response.usage.cache_read_input_tokens || 0,
          }
        : undefined;

    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;

    return {
      content,
      thinking: thinking || undefined,
      toolUses: toolUses.length > 0 ? toolUses : undefined,
      provider: modelConfig.provider,
      model: modelConfig.model,
      // Anthropic echoes the resolved snapshot on the message body; an alias
      // like claude-opus-4-8 comes back as the dated version that served it.
      resolvedModel: typeof (response as any).model === 'string' ? (response as any).model : undefined,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        estimatedCostUsd: this.estimateCost(modelConfig, inputTokens, outputTokens),
      },
      latencyMs: Date.now() - startTime,
      requestId,
      cached: false,
      cacheHit: cacheStats ? cacheStats.cacheReadInputTokens > 0 : undefined,
      cacheStats,
      deterministic: false,
      finishReason: response.stop_reason || 'unknown',
      // Says whether the caller's schema was actually enforced. Without it a
      // constrained answer and a fortunate one look identical.
      structuredOutputEnforced: structured.enforced,
      citations: nonStreamCitations.length > 0 ? nonStreamCitations : undefined,
      serverToolUses: nonStreamServerTools.length > 0 ? nonStreamServerTools : undefined,
    };
  }

  /**
   * Streaming execution for Anthropic/Claude — delivers tokens in real-time via callback.
   */
  private async executeAnthropicStream(
    modelConfig: ModelConfig,
    request: GatewayRequest,
    requestId: string,
    startTime: number
  ): Promise<AnaGatewayResponse> {
    const client = this.anthropicFamilyClient(modelConfig.provider);
    if (!client) {
      throw new Error(
        `${modelConfig.provider} client not initialized (missing credentials for ${modelConfig.provider})`
      );
    }

    const onStream = request.onStream!;
    const { systemMessages, bodyMessages: nonSystemMessages } = partitionSystemMessages(
      request.messages,
      modelConfig.supportsInlineSystem === true,
    );

    const streamCacheEnabled = !!request.promptCache?.enabled;
    const streamCacheType = request.promptCache?.type;

    const messages = nonSystemMessages.map(m => {
      const shouldCache = streamCacheEnabled && m.cacheControl === true;
      if (m.contentBlocks && m.contentBlocks.length > 0) {
        const blocks: any[] = m.contentBlocks.map(block => {
          if (block.type === 'image') {
            return { type: 'image' as const, source: block.source };
          }
          if (block.type === 'document') {
            return {
              type: 'document' as const,
              source: block.source,
              ...(block.title ? { title: block.title } : {}),
              ...(block.context ? { context: block.context } : {}),
              ...(block.citations ? { citations: block.citations } : {}),
            };
          }
          return { type: 'text' as const, text: block.text };
        });
        if (shouldCache && blocks.length > 0) {
          blocks[blocks.length - 1].cache_control = { type: streamCacheType };
        }
        return { role: m.role, content: blocks };
      }
      if (shouldCache) {
        return {
          role: m.role,
          content: [
            {
              type: 'text' as const,
              text: m.content,
              cache_control: { type: streamCacheType },
            },
          ],
        };
      }
      return { role: m.role, content: m.content };
    });

    const params: any = {
      model: modelConfig.model,
      max_tokens: request.maxTokens || 4096,
      messages,
      stream: true,
    };

    if (systemMessages.length > 0) {
      if (request.promptCache?.enabled) {
        const cacheType = request.promptCache.type;
        const flagged = systemMessages.some(m => m.cacheControl === true);
        params.system = systemMessages.map((m, i) => ({
          type: 'text',
          text: m.content,
          ...((flagged ? m.cacheControl === true : i === systemMessages.length - 1)
            ? { cache_control: { type: cacheType } }
            : {}),
        }));
      } else {
        params.system = systemMessages.map(m => m.content).join('\n\n');
      }
    }

    // Sampling + extended thinking (model-aware: Opus 4.7+ rejects temperature
    // and manual budget_tokens thinking; older models keep the legacy surface).
    this.applyAnthropicSamplingParams(params, modelConfig, request);

    if (request.tools && request.tools.length > 0) {
      params.tools = request.tools;
      if (request.toolChoice) {
        params.tool_choice =
          typeof request.toolChoice === 'string'
            ? { type: request.toolChoice }
            : request.toolChoice;
      }
    }

    // Use the Anthropic SDK streaming API
    const streamUsesFilesApiDoc = (request.messages || []).some(m =>
      m.contentBlocks?.some(b => b.type === 'document' && b.source.type === 'file')
    );
    // Same structured-output contract as the non-streaming path — including the
    // citations conflict, which must refuse before a token is streamed.
    const structured = resolveStructuredOutputFormat(request, modelConfig);
    if (structured.format) {
      params.output_config = { ...(params.output_config ?? {}), format: structured.format };
    }
    // Only a level this model accepts (Haiku 4.5 rejects effort outright).
    const modelEffort = apiEffortForModel(modelConfig, request.apiEffort);
    if (modelEffort) {
      params.output_config = { ...(params.output_config ?? {}), effort: modelEffort };
    }

    const streamOptions: Record<string, unknown> = {};
    if (streamUsesFilesApiDoc) {
      streamOptions.headers = { 'anthropic-beta': 'files-api-2025-04-14' };
    }
    // Aborting the SDK request is what actually stops GENERATION. Without it
    // a stop only stopped us reading, and the model ran to completion at full
    // cost — which is what stream.ts's own comment used to say.
    if (request.signal) streamOptions.signal = request.signal;
    const stream = await client.messages.create(
      params,
      Object.keys(streamOptions).length > 0 ? streamOptions : undefined
    );

    let content = '';
    let thinking = '';
    const toolUses: AnaToolUse[] = [];
    // Tool inputs arrive as a run of `input_json_delta` fragments between the
    // block's start and stop, split at arbitrary points (mid-key, mid-value).
    // Blocks interleave when the model calls tools in parallel, so the buffer
    // is keyed by the event's own `index` — the only thing that identifies
    // which block a fragment belongs to. `toolIndex` points back at the entry
    // in `toolUses` so the parsed object lands on the right tool.
    const toolInputBuffers: ToolInputBuffers = new Map();
    // Citations arrive interleaved with the text they support. Collected in
    // arrival order so a caller can match a claim to its source.
    const citations: GatewayCitation[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheCreationInputTokens = 0;
    let cacheReadInputTokens = 0;
    const serverToolUses: GatewayServerToolUse[] = [];
    let stopReason = 'unknown';
    let resolvedModel: string | undefined;

    // Per-chunk watchdog — detect stalled streams (no data for 30s)
    let lastChunkTime = Date.now();
    const chunkTimeoutMs = 30_000;
    let streamStalled = false;
    let streamAborted = false;
    const chunkWatchdog = setInterval(() => {
      if (Date.now() - lastChunkTime > chunkTimeoutMs) {
        streamStalled = true;
        clearInterval(chunkWatchdog);
        log.warn(
          `[AI Gateway] Stream stalled — no chunk received for ${chunkTimeoutMs / 1000}s. ` +
          `Accumulated ${content.length} chars so far. Aborting stream.`
        );
        // If the stream object has a controller/abort method, try to close it
        try {
          if (stream && typeof (stream as any).controller?.abort === 'function') {
            (stream as any).controller.abort();
          }
        } catch { /* best-effort abort */ }
      }
    }, 5_000);

    try {
      for await (const event of stream as AsyncIterable<any>) {
        // Update watchdog timestamp on every event
        lastChunkTime = Date.now();

        // Break out if watchdog flagged a stall (race between interval and iterator)
        if (streamStalled) break;

        // The caller cancelled. Stop reading and stop generating — the SDK
        // holds the same signal, so the request is already on its way down.
        // What has arrived stays: the person is reading it.
        if (request.signal?.aborted) {
          streamAborted = true;
          try {
            (stream as any).controller?.abort();
          } catch { /* best-effort abort, same shape the watchdog uses */ }
          break;
        }

        if (event.type === 'content_block_delta') {
          if (event.delta?.type === 'text_delta') {
            content += event.delta.text;
            onStream(event.delta.text, { type: 'text' });
          } else if (event.delta?.type === 'thinking_delta') {
            thinking += event.delta.thinking;
            onStream('', { type: 'thinking', thinkingContent: event.delta.thinking });
          } else if (event.delta?.type === 'citations_delta') {
            // Where the model read it. This branch did not exist, so citations
            // were produced, billed and dropped before any caller saw one.
            const citation = normalizeCitation(event.delta.citation);
            if (citation) citations.push(citation);
          } else if (event.delta?.type === 'input_json_delta') {
            // The model's arguments for a tool, one fragment at a time. Append
            // verbatim; the fragments are only valid JSON once concatenated.
            appendToolInputFragment(toolInputBuffers, event.index, event.delta.partial_json);
          }
        } else if (event.type === 'content_block_start') {
          openContentBlock(event, toolUses, toolInputBuffers, serverToolUses);
        } else if (event.type === 'content_block_stop') {
          // The block is closed, so its fragments are now a complete JSON
          // document — parse it onto the tool use it belongs to.
          const buffered = toolInputBuffers.get(event.index);
          if (buffered) {
            toolInputBuffers.delete(event.index);
            finalizeToolInput(toolUses[buffered.toolIndex], buffered.json);
          }
        } else if (event.type === 'message_delta') {
          stopReason = event.delta?.stop_reason || stopReason;
          outputTokens = event.usage?.output_tokens || outputTokens;
        } else if (event.type === 'message_start') {
          // The resolved snapshot arrives once, on message_start, alongside the
          // input-token count — the streaming path's only sighting of it.
          if (typeof event.message?.model === 'string') resolvedModel = event.message.model;
          inputTokens = event.message?.usage?.input_tokens || 0;
          // Prompt cache usage (Anthropic emits these on the message_start
          // event alongside input_tokens). They stay 0 when caching is off.
          cacheCreationInputTokens =
            event.message?.usage?.cache_creation_input_tokens || 0;
          cacheReadInputTokens = event.message?.usage?.cache_read_input_tokens || 0;
        }
      }
    } catch (streamErr: any) {
      log.error('[AI Gateway] Stream interrupted:', streamErr?.message);
      // Return whatever content was accumulated so far (partial response)
      if (!content) throw streamErr; // Re-throw if nothing was captured
    } finally {
      clearInterval(chunkWatchdog);
    }

    // Any buffer still open never saw its content_block_stop — a stall, an
    // abort, or a dropped connection cut the stream mid-input. Finalize them
    // anyway so a truncated input is reported as lost rather than silently
    // reading as a tool that was called with no arguments.
    for (const [, buffered] of toolInputBuffers) {
      finalizeToolInput(toolUses[buffered.toolIndex], buffered.json, 'the stream ended before the tool input was complete');
    }
    toolInputBuffers.clear();

    // A cancel is not a failure and not a stall: the turn ended because the
    // person ended it. Say so, so the caller can tell "she was stopped" from
    // "she finished" — a distinction the transcript has to get right.
    if (streamAborted) {
      stopReason = 'aborted';
    }

    // If stream stalled but we have partial content, mark finish reason accordingly
    if (streamStalled && content) {
      stopReason = 'chunk_timeout';
      log.warn(`[AI Gateway] Returning partial response (${content.length} chars) after stream stall`);
    }

    const streamCacheStats =
      cacheCreationInputTokens > 0 || cacheReadInputTokens > 0
        ? {
            cacheCreationInputTokens,
            cacheReadInputTokens,
          }
        : undefined;

    return {
      content,
      thinking: thinking || undefined,
      toolUses: toolUses.length > 0 ? toolUses : undefined,
      provider: modelConfig.provider,
      model: modelConfig.model,
      resolvedModel,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        estimatedCostUsd: this.estimateCost(modelConfig, inputTokens, outputTokens),
      },
      latencyMs: Date.now() - startTime,
      requestId,
      cached: false,
      deterministic: false,
      finishReason: stopReason,
      serverToolUses: serverToolUses.length > 0 ? serverToolUses : undefined,
      cacheHit: streamCacheStats ? cacheReadInputTokens > 0 : undefined,
      cacheStats: streamCacheStats,
      structuredOutputEnforced: structured.enforced,
      // Undefined, not [], when there were none — see GatewayCitation.
      citations: citations.length > 0 ? citations : undefined,
    } as AnaGatewayResponse;
  }

  private async executeMoonshot(
    modelConfig: ModelConfig,
    request: GatewayRequest,
    requestId: string,
    startTime: number
  ): Promise<AnaGatewayResponse> {
    if (!this.moonshotClient) {
      throw new Error('Moonshot client not initialized (missing KIMI_API_KEY or MOONSHOT_API_KEY)');
    }

    // Streaming requested — Kimi thinking models emit reasoning_content, so this
    // surfaces both tokens and reasoning incrementally, at Anthropic parity.
    if (request.stream && request.onStream) {
      return this.executeOpenAICompatibleStream(
        this.moonshotClient,
        modelConfig,
        request,
        requestId,
        startTime
      );
    }

    const params: any = {
      model: modelConfig.model,
      messages: toOpenAIChatMessages(request.messages),
      max_tokens: request.maxTokens || 2000,
      temperature: request.temperature ?? 0.7,
    };

    // Always send a seed here: this surface accepts one, and a recorded seed is
    // what makes the generation replayable. resolveSeed honours a caller-
    // supplied value and otherwise mints a fresh random one per call.
    const effectiveSeed = resolveSeed(request.seed);
    params.seed = effectiveSeed;

    if (request.jsonMode) {
      params.response_format = { type: 'json_object' };
    }

    applyOpenAIToolParams(params, request, modelConfig);

    const completion = await Promise.race([
      this.moonshotClient.chat.completions.create(params, request.signal ? { signal: request.signal } : undefined),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Moonshot API call timed out after 120s')), 120_000)
      ),
    ]).catch((error: Error) => {
      if (error.message.includes('timed out')) {
        this.recordFailure('moonshot', error);
      }
      throw error;
    });
    const choice = completion.choices?.[0];
    const reasoning = extractOpenAIReasoning(choice?.message);
    const toolUses = readOpenAIToolUses(choice?.message);

    return {
      content: choice?.message?.content || '',
      thinking: reasoning || undefined,
      toolUses: toolUses.length > 0 ? toolUses : undefined,
      provider: 'moonshot',
      model: modelConfig.model,
      resolvedModel: typeof completion.model === 'string' ? completion.model : undefined,
      effectiveSeed,
      usage: {
        inputTokens: completion.usage?.prompt_tokens || 0,
        outputTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0,
        estimatedCostUsd: this.estimateCost(
          modelConfig,
          completion.usage?.prompt_tokens || 0,
          completion.usage?.completion_tokens || 0
        ),
      },
      latencyMs: Date.now() - startTime,
      requestId,
      cached: false,
      deterministic: false,
      finishReason: choice?.finish_reason || 'unknown',
    } as AnaGatewayResponse;
  }

  /**
   * Streaming path shared by every OpenAI-compatible provider (openai / azure /
   * local / moonshot). Delivers text and — where the provider emits it —
   * reasoning incrementally through request.onStream, at parity with the
   * Anthropic streaming path: same text/thinking callback contract, the same
   * 30s per-chunk stall watchdog, and the same return-partial-on-error
   * resilience. Usage is read from the final include_usage chunk. Tool calls
   * come back as `toolUses` in the Anthropic path's shape, including
   * `inputParseError` for arguments that did not survive the stream.
   */
  private async executeOpenAICompatibleStream(
    client: any,
    modelConfig: ModelConfig,
    request: GatewayRequest,
    requestId: string,
    startTime: number
  ): Promise<AnaGatewayResponse> {
    const onStream = request.onStream!;
    const provider = modelConfig.provider;

    const params: any = {
      model: modelConfig.model,
      messages: toOpenAIChatMessages(request.messages),
      max_tokens: request.maxTokens || 2000,
      temperature: request.temperature ?? 0.7,
      stream: true,
      // Ask the server to append a final usage-only chunk so cost/telemetry
      // stay accurate on the streaming path (ignored by servers that lack it).
      stream_options: { include_usage: true },
    };
    const effectiveSeed = resolveSeed(request.seed);
    params.seed = effectiveSeed;
    if (request.jsonMode) {
      const supportsStrictSchema = provider !== 'local';
      params.response_format =
        request.jsonSchema && supportsStrictSchema
          ? { type: 'json_schema', json_schema: { name: 'response', strict: true, schema: request.jsonSchema } }
          : { type: 'json_object' };
    }
    applyOpenAIToolParams(params, request, modelConfig);

    const stream = await client.chat.completions.create(
      params,
      request.signal ? { signal: request.signal } : undefined,
    );

    let content = '';
    let thinking = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    let finishReason = 'unknown';
    let resolvedModel: string | undefined;
    const toolUses: AnaToolUse[] = [];
    // A call's arguments arrive in pieces across many chunks, and parallel
    // calls interleave, so the buffers are keyed by the fragment's `index` —
    // the one field every fragment of a call carries (see
    // parseOpenAIToolCallFragments). Same buffers as the Anthropic path.
    const toolInputBuffers: ToolInputBuffers = new Map();
    // OpenAI has no per-call close event. The choice's finish_reason is the
    // only thing that says every call's arguments are complete.
    let choiceClosed = false;

    // Per-chunk watchdog — abort a stream that goes silent for 30s (mirrors the
    // Anthropic path) so a hung provider can't wedge the turn.
    let lastChunkTime = Date.now();
    const chunkTimeoutMs = 30_000;
    let streamStalled = false;
    const chunkWatchdog = setInterval(() => {
      if (Date.now() - lastChunkTime > chunkTimeoutMs) {
        streamStalled = true;
        clearInterval(chunkWatchdog);
        log.warn(
          `[AI Gateway] ${provider} stream stalled — no chunk for ${chunkTimeoutMs / 1000}s. ` +
          `Accumulated ${content.length} chars. Aborting stream.`
        );
        try {
          if (stream && typeof (stream as any).controller?.abort === 'function') {
            (stream as any).controller.abort();
          }
        } catch { /* best-effort abort */ }
      }
    }, 5_000);

    let streamAborted = false;
    try {
      for await (const chunk of stream as AsyncIterable<any>) {
        lastChunkTime = Date.now();
        if (streamStalled) break;

        // Same cancel contract as the Anthropic path: stop reading, stop
        // generating, keep what arrived. AnA falls back across providers, so a
        // stop that only worked on one of them would be a stop that sometimes
        // did not.
        if (request.signal?.aborted) {
          streamAborted = true;
          try {
            (stream as any).controller?.abort();
          } catch { /* best-effort abort */ }
          break;
        }

        // Every chunk repeats the resolved model; take the first one that
        // carries it rather than re-assigning on each.
        if (resolvedModel === undefined && typeof chunk?.model === 'string') {
          resolvedModel = chunk.model;
        }

        const delta = parseOpenAIStreamDelta(chunk);
        // Reasoning precedes the answer within a turn — emit it first.
        if (delta.reasoning) {
          thinking += delta.reasoning;
          onStream('', { type: 'thinking', thinkingContent: delta.reasoning });
        }
        if (delta.text) {
          content += delta.text;
          onStream(delta.text, { type: 'text' });
        }
        for (const fragment of parseOpenAIToolCallFragments(chunk)) {
          const buffered = toolInputBuffers.get(fragment.index);
          if (!buffered) {
            toolUses.push({ id: fragment.id, name: fragment.name, input: {} });
            toolInputBuffers.set(fragment.index, { toolIndex: toolUses.length - 1, json: '' });
          } else {
            // Fill, never overwrite or append: id and name belong to the first
            // fragment, and some servers repeat them on every fragment after.
            const toolUse = toolUses[buffered.toolIndex];
            if (!toolUse.id && fragment.id) toolUse.id = fragment.id;
            if (!toolUse.name && fragment.name) toolUse.name = fragment.name;
          }
          // Verbatim; the pieces are only valid JSON once concatenated.
          appendToolInputFragment(toolInputBuffers, fragment.index, fragment.arguments);
        }
        if (delta.finishReason) {
          finishReason = delta.finishReason;
          choiceClosed = true;
        }
        if (delta.usage) {
          inputTokens = delta.usage.inputTokens;
          outputTokens = delta.usage.outputTokens;
          totalTokens = delta.usage.totalTokens;
        }
      }
    } catch (streamErr: any) {
      log.error(`[AI Gateway] ${provider} stream interrupted:`, streamErr?.message);
      if (!content) throw streamErr; // nothing captured — surface the failure
    } finally {
      clearInterval(chunkWatchdog);
    }

    // A stream that ended before finish_reason — a stall, a cancel, a dropped
    // connection — may have cut any call's arguments short, so each is
    // reported as lost rather than parsed. That matters most for a call whose
    // arguments had not started arriving: its empty buffer would otherwise
    // read as a tool called with no arguments, and dispatch. Same contract as
    // the Anthropic path's unclosed blocks.
    const truncation = choiceClosed ? undefined : 'the stream ended before the tool input was complete';
    for (const [, buffered] of toolInputBuffers) {
      const toolUse = toolUses[buffered.toolIndex];
      if (!toolUse.id) toolUse.id = openAIToolCallId();
      finalizeToolInput(toolUse, buffered.json, truncation);
    }
    toolInputBuffers.clear();

    // Ended because the person ended it — not a stall, not a failure.
    if (streamAborted) {
      finishReason = 'aborted';
    }

    if (streamStalled && content) {
      finishReason = 'chunk_timeout';
      log.warn(`[AI Gateway] Returning partial ${provider} response (${content.length} chars) after stall`);
    }

    return {
      content,
      thinking: thinking || undefined,
      toolUses: toolUses.length > 0 ? toolUses : undefined,
      provider,
      model: modelConfig.model,
      resolvedModel,
      effectiveSeed,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: totalTokens || inputTokens + outputTokens,
        estimatedCostUsd: this.estimateCost(modelConfig, inputTokens, outputTokens),
      },
      latencyMs: Date.now() - startTime,
      requestId,
      cached: false,
      deterministic: false,
      finishReason,
    } as AnaGatewayResponse;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Model Selection & Routing
  // ─────────────────────────────────────────────────────────────────────────

  private selectModel(request: GatewayRequest, strategy: RoutingStrategy): ModelConfig | null {
    // Explicit provider/model override
    if (request.provider || request.model) {
      const matches = this.models.filter(
        m =>
          m.enabled &&
          (!request.provider || m.provider === request.provider) &&
          (!request.model || m.model === request.model || m.id === request.model) &&
          this.meetsPlacementRequirements(m.provider, request)
      );
      // A caller naming a model for a high-risk task does not get a silent
      // substitute and does not get the model it named: it gets a refusal that
      // says why. Rerouting would hide the violation in the caller; honouring
      // it would be the violation.
      const explicit = matches.find(m => this.approvedForTask(m, request));
      if (!explicit && matches.length > 0 && isHighRiskRequest(request.taskType, request.riskTier)) {
        throw new ModelNotApprovedError(request.taskType, matches.map(m => m.id), 'explicit');
      }
      if (explicit && this.isProviderHealthy(explicit.provider)) return explicit;
      // Even if unhealthy, honor explicit if it's the only option
      if (explicit) return explicit;
    }

    const eligible = this.models.filter(
      m =>
        m.enabled &&
        m.capabilities.includes(request.taskType) &&
        this.meetsPlacementRequirements(m.provider, request) &&
        this.approvedForTask(m, request) &&
        this.isProviderHealthy(m.provider)
    );

    if (eligible.length === 0) {
      // Relax health check (but never relax placement or approval: residency,
      // ZDR and high-risk approval are hard compliance constraints, not
      // preferences).
      const relaxed = this.models.filter(
        m =>
          m.enabled &&
          m.capabilities.includes(request.taskType) &&
          this.meetsPlacementRequirements(m.provider, request) &&
          this.approvedForTask(m, request)
      );
      if (relaxed.length > 0) return relaxed[0];
      /* Nothing approved remains — but something capable may. That is not
         "no provider configured", and it must not be returned as null: the
         caller turns null into demo-mode content outside production and into
         a misleading "no AI provider is configured" inside it. A governance
         refusal is its own terminal outcome, and it says which models were
         withheld. */
      if (isHighRiskRequest(request.taskType, request.riskTier)) {
        const withheld = this.models.filter(
          m =>
            m.enabled &&
            m.capabilities.includes(request.taskType) &&
            this.meetsPlacementRequirements(m.provider, request)
        );
        if (withheld.length > 0) {
          throw new ModelNotApprovedError(request.taskType, withheld.map(m => m.id), 'no-approved-model');
        }
      }
      return null;
    }

    switch (strategy) {
      case 'quality_optimized':
        return eligible.sort((a, b) => b.qualityScore - a.qualityScore)[0];

      case 'cost_optimized':
        return eligible.sort((a, b) => a.costPer1kInput - b.costPer1kInput)[0];

      case 'latency_optimized': {
        // Sort by provider avg latency
        return eligible.sort((a, b) => {
          const latA = this.providerHealth.get(a.provider)?.avgLatencyMs || 0;
          const latB = this.providerHealth.get(b.provider)?.avgLatencyMs || 0;
          return latA - latB;
        })[0];
      }

      case 'round_robin': {
        const idx = this.roundRobinIndex % eligible.length;
        this.roundRobinIndex++;
        return eligible[idx];
      }

      case 'task_based':
      default: {
        // Use task preference order
        const preferred = TASK_PROVIDER_PREFERENCES[request.taskType] || [
          'openai',
          'anthropic',
          'moonshot',
        ];
        for (const providerName of preferred) {
          const model = eligible.find(m => m.provider === providerName);
          if (model) return model;
        }
        return eligible[0];
      }
    }
  }

  /**
   * Build the fallback chain, exhausting the primary provider's quality
   * ladder before crossing to a different provider. This means if Opus 4.8
   * fails, the chain is (same-provider bucket, quality-descending):
   *
   *   Opus 4.7 (same provider, previous flagship)
   *   → Sonnet 4.6 (same provider, lower quality)
   *   → Sonnet 4 legacy (same provider, lower quality)
   *   → Haiku 4.5 (same provider, lowest Anthropic quality)
   *   → [cross-provider fallbacks in quality order]
   *
   * The same-provider-first ordering reflects operator preference — when
   * the primary provider is reachable at all, staying within it preserves
   * prompt-cache hits, tool-schema consistency, and telemetry continuity.
   */
  private getFallbackModels(
    request: GatewayRequest,
    triedModels: string[],
    primaryProvider: ProviderName,
  ): ModelConfig[] {
    const eligible = this.models.filter(
      m =>
        m.enabled &&
        m.capabilities.includes(request.taskType) &&
        !triedModels.includes(m.id) &&
        // Residency / ZDR are hard constraints — never fall back across them.
        this.meetsPlacementRequirements(m.provider, request) &&
        // So is high-risk approval. This rung was where drafting used to walk
        // from Opus down to Sonnet, and review on to GPT-4o, when the approved
        // models failed: a degraded answer from a model the registry says is
        // not approved for the work, delivered as if nothing had happened.
        this.approvedForTask(m, request),
    );
    const samePriority = eligible.filter(m => m.provider === primaryProvider);
    const otherProviders = eligible.filter(m => m.provider !== primaryProvider);
    // Within each bucket, sort by quality descending.
    const sortByQuality = (list: ModelConfig[]) =>
      [...list].sort((a, b) => b.qualityScore - a.qualityScore);
    return [...sortByQuality(samePriority), ...sortByQuality(otherProviders)];
  }

  /**
   * True when this model may serve this request's task.
   *
   * `docs/LAUNCH_DEFINITION_OF_DONE.md`: only approved models serve high-risk
   * regulatory drafting. The approval is `approvedForHighRisk` in
   * `server/services/ai-governance/approved-models.ts`; an id that registry does
   * not know is not approved. Tasks that are not high-risk are unaffected.
   */
  private approvedForTask(model: ModelConfig, request: GatewayRequest): boolean {
    return !isHighRiskRequest(request.taskType, request.riskTier) || isApprovedForHighRisk(model.id);
  }

  /**
   * True when a provider's placement satisfies the request's residency / ZDR
   * requirements. Returns true when the request declares no constraints, so
   * existing callers are unaffected.
   */
  private meetsPlacementRequirements(
    provider: ProviderName,
    request: GatewayRequest,
  ): boolean {
    const needsZdr = request.zeroDataRetention === true;
    const residency =
      request.dataResidency && request.dataResidency !== 'any'
        ? request.dataResidency
        : null;
    if (!needsZdr && !residency) return true;
    return isPlacementCompliant(resolvePlacement(provider), {
      zeroDataRetention: needsZdr,
      residency,
    });
  }

  /**
   * Fill in residency / zero-retention from the org's placement policy when the
   * request didn't specify them. The resolved policy is also retained for the
   * last-mile sensitive-data decision. Production treats lookup failure as an
   * unknown policy and therefore refuses sensitive dispatch.
   */
  private async applyOrgPlacementDefaults(request: GatewayRequest): Promise<GatewayRequest> {
    if (request.organizationId === undefined || request.organizationId === null) {
      return { ...request, sensitiveTenantPolicy: { resolution: 'absent' } };
    }
    try {
      const policy = await getOrgPlacementResolver().resolve(request.organizationId);
      if (!policy) return { ...request, sensitiveTenantPolicy: { resolution: 'absent' } };
      const merged = mergeOrgPolicyDefaults(
        { dataResidency: request.dataResidency, zeroDataRetention: request.zeroDataRetention },
        policy,
      );
      return {
        ...request,
        ...merged,
        sensitiveTenantPolicy: {
          resolution: 'resolved',
          residency: policy.residency,
          zeroDataRetention: policy.zeroDataRetention,
          allowedSubstrates: policy.allowedSubstrates,
        },
      };
    } catch (err) {
      log.warn(
        `[AI Gateway] Org placement policy lookup failed for org ${request.organizationId}; ` +
          `sensitive dispatch will fail closed: ${err instanceof Error ? err.message : String(err)}`
      );
      return { ...request, sensitiveTenantPolicy: { resolution: 'unknown' } };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Deterministic Mode
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Deterministic-mode response.
   *
   * A streaming caller passes `stream: true` with an `onStream` callback and
   * renders ONLY what that callback delivers. This path used to return the
   * content and never invoke it, so in deterministic mode
   * POST /api/ana-ri/stream emitted `run_started`, three `status` events,
   * `orchestration`, `done` and `post_done` — and not one `text` event.
   *
   * The failure was silent in the worst way: `done` reported
   * `outputTokens: 71` and `turn_status: "completed"`, so the transport
   * declared success while delivering nothing, and useAnaChat rendered an
   * empty assistant bubble with no error. AnA answered with silence. That is
   * also the posture CI's production boot smoke runs in, where /readyz
   * reports `anaState: "deterministic"` and passes readiness — a green probe
   * over a chat surface that produces no words.
   *
   * Honouring the callback here fixes it for every streaming caller at once
   * rather than per-route. The content is delivered as a single chunk: it is
   * a fixed string with no generation latency to simulate, and splitting it
   * would invent a progressive arrival that nothing here is actually doing.
   */
  private buildDeterministicResponse(
    request: GatewayRequest,
    requestId: string,
    startTime: number
  ): GatewayResponse {
    const content = DETERMINISTIC_RESPONSES[request.taskType] || DETERMINISTIC_RESPONSES.general;
    if (request.stream && typeof request.onStream === 'function' && content) {
      try {
        request.onStream(content);
      } catch (err) {
        // A caller whose sink has already closed must not turn a fixture
        // response into a thrown request.
        log.warn('[ai-gateway] deterministic onStream sink threw', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return {
      content,
      provider: 'anthropic',
      model: 'demo-mode',
      usage: {
        inputTokens: 0,
        outputTokens: content.split(' ').length,
        totalTokens: content.split(' ').length,
        estimatedCostUsd: 0,
      },
      latencyMs: Date.now() - startTime,
      requestId,
      cached: false,
      deterministic: true,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Provider Health
  // ─────────────────────────────────────────────────────────────────────────

  private initProviderHealth(): void {
    for (const provider of this.config.providers) {
      if (provider.enabled) {
        this.providerHealth.set(provider.name, {
          provider: provider.name,
          healthy: true,
          consecutiveFailures: 0,
          avgLatencyMs: 0,
          requestCount: 0,
          errorRate: 0,
        });
      }
    }
  }

  private isProviderHealthy(provider: ProviderName): boolean {
    const health = this.providerHealth.get(provider);
    if (!health) return false;
    return health.healthy;
  }

  private recordSuccess(provider: ProviderName, latencyMs: number): void {
    const health = this.providerHealth.get(provider);
    if (!health) return;

    health.consecutiveFailures = 0;
    health.lastSuccess = new Date();
    health.requestCount++;
    health.healthy = true;

    // Exponential moving average for latency
    health.avgLatencyMs =
      health.avgLatencyMs === 0 ? latencyMs : health.avgLatencyMs * 0.8 + latencyMs * 0.2;

    health.errorRate = Math.max(0, health.errorRate * 0.95);
  }

  private recordFailure(provider: ProviderName, error: Error): void {
    const health = this.providerHealth.get(provider);
    if (!health) return;

    // A request the provider refused as malformed (400/404/413/422) says the
    // REQUEST was wrong, not that the provider is down. Counting it marked a
    // healthy provider unhealthy for a minute or more after three such turns,
    // so one bad transcript shape took AnA offline for every tenant.
    const status = Number((error as { status?: unknown })?.status);
    if (status === 400 || status === 404 || status === 413 || status === 422) {
      health.requestCount++;
      return;
    }

    health.consecutiveFailures++;
    health.lastFailure = new Date();
    health.requestCount++;
    health.errorRate = Math.min(1, health.errorRate + 0.1);

    // Mark unhealthy after 3 consecutive failures
    if (health.consecutiveFailures >= 3) {
      health.healthy = false;
      // Exponential backoff: 60s, 120s, 240s, max 5min
      const backoffRound = Math.floor(health.consecutiveFailures / 3) - 1;
      const backoffMs = Math.min(300_000, 60_000 * Math.pow(2, backoffRound));
      log.warn(
        `[AI Gateway] Provider ${provider} marked unhealthy after ${health.consecutiveFailures} failures — recovery in ${backoffMs / 1000}s`
      );

      const jitter = backoffMs * 0.2 * Math.random(); // 0-20% jitter on health recovery
      setTimeout(() => {
        // Only recover if no new successes have already reset it
        if (!health.healthy) {
          health.healthy = true;
          health.consecutiveFailures = 0;
          log.debug(
            `[AI Gateway] Provider ${provider} auto-recovered after ${Math.round((backoffMs + jitter) / 1000)}s backoff`
          );
        }
      }, backoffMs + jitter);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cost Estimation
  // ─────────────────────────────────────────────────────────────────────────

  private estimateCost(model: ModelConfig, inputTokens: number, outputTokens: number): number {
    return (
      (inputTokens / 1000) * model.costPer1kInput + (outputTokens / 1000) * model.costPer1kOutput
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Audit Logging
  // ─────────────────────────────────────────────────────────────────────────

  private async logAudit(
    request: GatewayRequest,
    response: GatewayResponse,
    strategy: RoutingStrategy,
    success: boolean,
    error?: string,
    triedModels?: string[],
    contentPolicy?: { action: ContentPolicyAction; findings: PolicyFinding[] }
  ): Promise<void> {
    if (!this.config.auditEnabled) return;

    try {
      const promptVersion =
        request.promptVersion ??
        (typeof request.metadata?.promptVersion === 'string'
          ? (request.metadata.promptVersion as string)
          : undefined);

      // Resolve the substrate/region/retention the serving provider ran under,
      // so the audit ledger records *where* regulated data was processed — the
      // evidence a residency- or BAA-constrained tenant asks for.
      const placement = resolvePlacement(response.provider);

      await this.auditLogger.log({
        requestId: response.requestId,
        timestamp: new Date(),
        provider: response.provider,
        model: response.model,
        // Which snapshot actually answered. `model` above is the registry entry
        // the router picked, and 13 of the 15 entries are floating aliases —
        // recording only that cannot identify the model that produced the
        // output, which is the question this row exists to answer.
        resolvedModel: response.resolvedModel,
        taskType: request.taskType,
        strategy,
        organizationId: request.organizationId,
        userId: request.userId,
        projectId: request.projectId,
        callerModule: request.callerModule,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        totalTokens: response.usage.totalTokens,
        estimatedCostUsd: response.usage.estimatedCostUsd,
        latencyMs: response.latencyMs,
        success,
        error,
        cached: response.cached,
        deterministic: response.deterministic,
        // Reproducibility: which params + prompt produced this output.
        //
        // This recorded `request.temperature ?? 0.7` — the temperature ASKED
        // FOR, defaulted — under a heading that claims to describe what
        // produced the output. For the Opus 4.7+ reasoning-only family those
        // are different things: applyAnthropicSamplingParams() returns early
        // for those models and never sets params.temperature, because sending
        // one is a 400. So the ledger asserted a sampling parameter that was
        // never transmitted, and anyone reproducing the call from this record
        // would set 0.7 against a model that does no sampling at all — a
        // provenance record that is confidently wrong is worse than one that
        // says "not applicable", because only the first gets trusted.
        //
        // Record the EFFECTIVE value: omitted when the model rejects sampling.
        // `undefined`, not `null`, because GatewayAuditEntry.temperature is
        // `number | undefined`; the writer coalesces it (`entry.temperature ??
        // null`), so the column still stores NULL — the DB outcome is identical
        // and the type is honest.
        // Read from the registry entry that served the call, not from the
        // model's name. Unknown model ⇒ record nothing: we cannot establish
        // that a temperature was sent, and by this comment's own rule an
        // unverifiable assertion is worse than "not applicable".
        temperature: this.modelAcceptsSamplingParams(response.provider, response.model)
          ? request.temperature ?? 0.7
          : undefined,
        // The seed that was actually SENT. Undefined on every Anthropic call —
        // that API has no seed parameter — so the column stays NULL there
        // rather than asserting a value the provider never saw. Exactly the
        // rule the temperature field above follows.
        seed: response.effectiveSeed,
        promptHash: this.hashPrompt(request.messages),
        promptVersion,
        triedModels: triedModels && triedModels.length > 0 ? triedModels : undefined,
        // Placement / residency evidence.
        substrate: placement.substrate,
        region:
          request.dataResidency && request.dataResidency !== 'any'
            ? request.dataResidency
            : placement.regions[0],
        retentionPolicy: placement.zeroDataRetention ? 'zero_retention' : 'standard',
        // Content-policy findings carry only detector names, classes and
        // classifier-redacted excerpts — never raw content (the prompt itself
        // is represented by promptHash alone).
        metadata: contentPolicy
          ? { ...(request.metadata ?? {}), contentPolicy }
          : request.metadata,
      });
    } catch (auditError: any) {
      log.error(`[AI Gateway] Audit log failed: ${auditError.message}`);
    }
  }

  /**
   * Audit a content-policy refusal (prompt-injection or PII/PHI block).
   * Refusals are compliance events: a request the gateway declined must be as
   * traceable as one it served. Fires only when block findings exist —
   * budget / rate-limit denials are not content events and keep their
   * pre-existing unaudited behavior. Records the prompt hash, never raw
   * content; provider/model are 'none' because nothing was dispatched.
   */
  /** Audit a {@link ModelNotApprovedError}. Never throws; an audit failure is logged. */
  private async logModelApprovalRefusal(
    request: GatewayRequest,
    strategy: RoutingStrategy,
    requestId: string,
    startTime: number,
    refusal: ModelNotApprovedError,
  ): Promise<void> {
    if (!this.config.auditEnabled) return;
    try {
      await this.auditLogger.log({
        requestId,
        timestamp: new Date(),
        provider: 'none',
        model: 'none',
        taskType: request.taskType,
        strategy,
        organizationId: request.organizationId,
        userId: request.userId,
        projectId: request.projectId,
        callerModule: request.callerModule,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        latencyMs: Date.now() - startTime,
        success: false,
        error: refusal.code,
        cached: false,
        deterministic: false,
        promptHash: this.hashPrompt(request.messages),
        metadata: {
          ...(request.metadata ?? {}),
          modelGovernance: {
            code: refusal.code,
            reason: refusal.reason,
            withheldModelIds: refusal.withheldModelIds,
            declaredRiskTier: request.riskTier ?? null,
          },
        },
      });
    } catch (auditError: any) {
      log.error(`[AI Gateway] Model-approval audit log failed: ${auditError.message}`);
    }
  }

  private async logContentPolicyBlock(
    request: GatewayRequest,
    strategy: RoutingStrategy,
    requestId: string,
    startTime: number,
    reason?: string,
    findings?: PolicyFinding[]
  ): Promise<void> {
    if (!this.config.auditEnabled) return;
    if (!findings || !findings.some(f => f.action === 'block')) return;

    try {
      await this.auditLogger.log({
        requestId,
        timestamp: new Date(),
        provider: 'none',
        model: 'none',
        taskType: request.taskType,
        strategy,
        organizationId: request.organizationId,
        userId: request.userId,
        projectId: request.projectId,
        callerModule: request.callerModule,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        latencyMs: Date.now() - startTime,
        success: false,
        error: reason,
        cached: false,
        deterministic: false,
        promptHash: this.hashPrompt(request.messages),
        metadata: {
          ...(request.metadata ?? {}),
          contentPolicy: { action: 'block' as ContentPolicyAction, findings },
        },
      });
    } catch (auditError: any) {
      log.error(`[AI Gateway] Content-policy audit log failed: ${auditError.message}`);
    }
  }

  /**
   * Meter this call into api_usage_logs — the billing/limits source table
   * (dashboard usage, weekly limits, session/weekly plan windows). Distinct
   * from logAudit: audit is the compliance ledger and can be toggled off;
   * tenant metering must survive that toggle. Fire-and-forget — a metering
   * outage never fails the AI call. Calls without a tenant org id are not
   * metered (the recorder drops them rather than guessing attribution).
   */
  private recordTenantUsage(
    request: GatewayRequest,
    response: GatewayResponse,
    success: boolean
  ): void {
    const orgRaw = request.organizationId;
    const orgId = typeof orgRaw === 'string' ? Number.parseInt(orgRaw, 10) : orgRaw;
    if (orgId == null || !Number.isFinite(orgId) || orgId <= 0) return;
    const userRaw = request.userId;
    const userId = typeof userRaw === 'string' ? Number.parseInt(userRaw, 10) : userRaw;
    recordApiUsageSafe({
      organizationId: orgId,
      userId: userId != null && Number.isFinite(userId) ? userId : null,
      module: request.callerModule || 'ai_assistance',
      endpoint: request.taskType,
      model: response.model,
      // Failed calls are recorded (observability) but must not consume the
      // weekly 'requests' quota — a provider outage would otherwise burn an
      // org's limit on calls that returned nothing.
      requestCount: success ? 1 : 0,
      tokensUsed: response.usage.totalTokens,
      costCents: usdToCents(response.usage.estimatedCostUsd),
      metadata: {
        provider: response.provider,
        requestId: response.requestId,
        success,
        estimatedCostUsd: response.usage.estimatedCostUsd,
        cached: response.cached === true,
      },
    });
  }

  /** SHA-256 of the canonicalized prompt messages, for reproducibility audit. */
  private hashPrompt(messages: GatewayMessage[]): string {
    const canonical = messages.map(m => `${m.role}:${m.content}`).join('\n');
    return createHash('sha256').update(canonical, 'utf8').digest('hex');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────────────────

  private buildConfig(overrides?: Partial<GatewayConfig>): GatewayConfig {
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const moonshotKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;

    // Private-cloud + self-hosted substrates. Each is opt-in: a deployment only
    // turns one on when it has the credentials/infra and a tenant that needs it.
    const bedrockEnabled = process.env.AI_BEDROCK_ENABLED === 'true';
    const vertexEnabled = process.env.AI_VERTEX_ENABLED === 'true';
    const azureEnabled = !!(
      process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT
    );
    const localBaseUrl = process.env.LOCAL_AI_BASE_URL || process.env.LITELLM_BASE_URL;
    const localEnabled = process.env.AI_LOCAL_ENABLED === 'true' && !!localBaseUrl;

    return {
      // AI_GATEWAY_DETERMINISTIC is the canonical switch; DETERMINISTIC_MODE
      // is honored as a legacy alias only — set the canonical var in new
      // environments.
      deterministicMode:
        process.env.AI_GATEWAY_DETERMINISTIC === 'true' ||
        process.env.DETERMINISTIC_MODE === 'true' ||
        false,
      defaultStrategy: (process.env.AI_GATEWAY_STRATEGY as RoutingStrategy) || 'task_based',
      // NOTE: model *selection* is driven by the DEFAULT_MODELS registry above
      // (task/quality strategies over qualityScore), not by these per-provider
      // `defaultModel` fields. They are a provider-level default of last resort
      // for substrates without a registry — the flagship is set on the registry
      // entry (`claude-opus-4` → claude-opus-4-8), not here.
      providers: [
        {
          name: 'openai',
          enabled: !!openaiKey,
          apiKey: openaiKey,
          defaultModel: 'gpt-4o',
          models: [],
        },
        {
          name: 'anthropic',
          enabled: !!anthropicKey,
          apiKey: anthropicKey,
          defaultModel: 'claude-sonnet-4-6',
          models: [],
        },
        {
          name: 'moonshot',
          enabled: !!moonshotKey,
          apiKey: moonshotKey,
          baseUrl: 'https://api.moonshot.ai/v1',
          defaultModel: 'kimi-k2-0711-preview',
          models: [],
        },
        {
          name: 'bedrock',
          enabled: bedrockEnabled,
          defaultModel: 'anthropic.claude-opus-4-7',
          models: [],
        },
        {
          name: 'vertex',
          enabled: vertexEnabled,
          defaultModel: 'claude-opus-4-7',
          models: [],
        },
        {
          name: 'azure',
          enabled: azureEnabled,
          apiKey: process.env.AZURE_OPENAI_API_KEY,
          baseUrl: process.env.AZURE_OPENAI_ENDPOINT,
          defaultModel: 'gpt-4o',
          models: [],
        },
        {
          name: 'local',
          enabled: localEnabled,
          baseUrl: localBaseUrl,
          defaultModel: 'local-default',
          models: [],
        },
      ],
      policy: {
        maxTokensPerRequest: 16000,
        maxRequestsPerMinutePerOrg: 100,
        maxRequestsPerMinutePerUser: 30,
        blockedPatterns: [],
        contentFilters: true,
        // Platform default posture: PII/PHI pass ON. Outbound content is
        // classified before dispatch (policy.ts::evaluatePiiPolicy) —
        // structured PHI blocks fail-closed, email/SSN spans are redacted
        // from the provider payload, FP-prone identifiers are flagged into
        // the audit trail. Opt out per-deployment with an explicit override.
        piiDetection: true,
      },
      auditEnabled: true,
      ...overrides,
    };
  }

  private buildModelRegistry(): ModelConfig[] {
    const enabledProviders = new Set(this.config.providers.filter(p => p.enabled).map(p => p.name));

    return DEFAULT_MODELS.map(m => ({
      ...m,
      enabled: m.enabled && enabledProviders.has(m.provider),
    }));
  }

  private initProviderClients(): void {
    // OpenAI
    const openaiConfig = this.config.providers.find(p => p.name === 'openai');
    if (openaiConfig?.enabled && openaiConfig.apiKey) {
      try {
        this.openaiClient = new OpenAI({ apiKey: openaiConfig.apiKey });
        log.debug('  ✅ OpenAI provider ready');
      } catch (e: any) {
        log.warn(`  ⚠️ OpenAI provider init failed: ${e.message}`);
      }
    }

    // Anthropic
    const anthropicConfig = this.config.providers.find(p => p.name === 'anthropic');
    if (anthropicConfig?.enabled && anthropicConfig.apiKey) {
      try {
        this.anthropicClient = new Anthropic({ apiKey: anthropicConfig.apiKey });
        log.debug('  ✅ Anthropic provider ready');
      } catch (e: any) {
        log.warn(`  ⚠️ Anthropic provider init failed: ${e.message}`);
      }
    }

    // Moonshot (OpenAI-compatible)
    const moonshotConfig = this.config.providers.find(p => p.name === 'moonshot');
    if (moonshotConfig?.enabled && moonshotConfig.apiKey) {
      try {
        this.moonshotClient = new OpenAI({
          apiKey: moonshotConfig.apiKey,
          baseURL: moonshotConfig.baseUrl || 'https://api.moonshot.ai/v1',
        });
        log.debug('  ✅ Moonshot/Kimi provider ready');
      } catch (e: any) {
        log.warn(`  ⚠️ Moonshot provider init failed: ${e.message}`);
      }
    }

    // ── Private-cloud + self-hosted substrates ───────────────────────────────
    // Each factory returns null (with a logged hint) when its optional SDK or
    // credentials are absent, so an enabled-but-unconfigured provider degrades
    // to "unhealthy" rather than crashing the gateway.

    if (this.config.providers.find(p => p.name === 'bedrock')?.enabled) {
      this.bedrockClient = createBedrockClient();
      if (this.bedrockClient) log.debug('  ✅ Bedrock (Claude, private-cloud) provider ready');
    }

    if (this.config.providers.find(p => p.name === 'vertex')?.enabled) {
      this.vertexClient = createVertexClient();
      if (this.vertexClient) log.debug('  ✅ Vertex (Claude, private-cloud) provider ready');
    }

    if (this.config.providers.find(p => p.name === 'azure')?.enabled) {
      this.azureClient = createAzureClient();
      if (this.azureClient) log.debug('  ✅ Azure OpenAI (private-cloud) provider ready');
    }

    if (this.config.providers.find(p => p.name === 'local')?.enabled) {
      this.localClient = createLocalClient();
      if (this.localClient) log.debug('  ✅ Local / self-hosted provider ready');
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Classes
// ─────────────────────────────────────────────────────────────────────────────

export class GatewayPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayPolicyError';
  }
}

/**
 * A high-risk task (regulatory drafting or review) could only have been served
 * by a model the approved-models registry does not approve for it.
 *
 * A {@link GatewayPolicyError}, so it is terminal on every path that already
 * treats policy refusals as terminal: never retried, never walked down the
 * fallback ladder, never counted against a provider's health.
 */
export class ModelNotApprovedError extends GatewayPolicyError {
  readonly code = 'MODEL_NOT_APPROVED_FOR_HIGH_RISK' as const;
  constructor(
    readonly taskType: TaskType,
    /** Models that could have served the request and were withheld. */
    readonly withheldModelIds: string[],
    /** `explicit`: the caller named them. `no-approved-model`: routing found only them. */
    readonly reason: 'explicit' | 'no-approved-model',
  ) {
    super(
      `MODEL_NOT_APPROVED_FOR_HIGH_RISK: ${taskType} is high-risk regulatory work and no model approved ` +
        `for it is available. Withheld: ${withheldModelIds.join(', ') || 'none'} ` +
        `(${reason === 'explicit' ? 'named by the caller' : 'the only models remaining'}). ` +
        'See approvedForHighRisk in server/services/ai-governance/approved-models.ts.',
    );
  }
}

/**
 * The request carries an image or document, and the model it reached receives
 * message text only. Terminal like every GatewayPolicyError: answering without
 * the file would be answering about something the model never saw.
 */
export class MediaNotCarriedError extends GatewayPolicyError {
  readonly code = 'MEDIA_NOT_CARRIED' as const;
  constructor(readonly modelConfig: Pick<ModelConfig, 'id' | 'provider'>) {
    super(
      `MEDIA_NOT_CARRIED: ${modelConfig.id} (${modelConfig.provider}) receives message text only, and this ` +
        'request carries images or documents it would not see, so it was not sent.',
    );
  }
}

/**
 * The caller cancelled this request.
 *
 * Terminal in exactly the way {@link GatewayPolicyError} is, and for a related
 * reason: neither is a provider failing. `route()` otherwise treats any throw
 * as a transient fault — it records a failure against the provider's health
 * and walks the fallback ladder — which for a cancel would re-run the entire
 * request the user just stopped, once per rung, and leave a healthy provider
 * marked unhealthy on the way.
 *
 * `phase` says where it was caught: `'pre_call'` before any provider was
 * contacted, `'pre_stream'` after the request went out but before a token
 * arrived. An abort DURING a stream is not an error at all — the partial text
 * is returned with `finishReason: 'aborted'`, because what the model already
 * said is worth keeping.
 */
export class GatewayAbortedError extends Error {
  constructor(readonly phase: 'pre_call' | 'pre_stream') {
    super(`AI request cancelled by the caller (${phase})`);
    this.name = 'GatewayAbortedError';
  }
}

export class GatewayNoProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayNoProviderError';
  }
}

export class GatewayAllProvidersFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayAllProvidersFailedError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

let gatewayInstance: AIGateway | null = null;

/**
 * Get (or create) the singleton AI Gateway instance.
 */
export function getGateway(config?: Partial<GatewayConfig>): AIGateway {
  if (!gatewayInstance) {
    gatewayInstance = new AIGateway(config);
  }
  return gatewayInstance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetGateway(): void {
  gatewayInstance = null;
}

/**
 * Boot-time assertion that the AI provenance ledger is present and writable.
 *
 * Separate from the per-call writer, which stays non-blocking: an audit outage
 * must not take inference down mid-request. But "non-blocking" had become
 * indistinguishable from "silently doing nothing", and did so for two reasons
 * at once (no migration, no pool — see server/services/ai-gateway/audit.ts).
 * This gives the condition exactly one place to surface loudly.
 *
 * @throws when the ledger cannot be written.
 */
export async function assertAiProvenanceLedgerReady(): Promise<void> {
  await getGateway().assertAuditStoreReady();
}
