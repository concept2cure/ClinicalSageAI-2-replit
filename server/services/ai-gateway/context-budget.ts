/**
 * Context-window admission for the AI gateway.
 *
 * ── What this closes ──────────────────────────────────────────────────────────
 * Every model in the registry declares a `contextWindow`, and until this module
 * nothing read it at dispatch time. A request too large for the model it was
 * routed to went to the provider anyway, was refused with a 400, and then —
 * because a 400 is a hard client error the per-model retry rightly gives up on
 * — walked the ENTIRE fallback ladder: Opus → Sonnet → Haiku → GPT-4o → Kimi,
 * one doomed network call per rung, each counted against that provider's
 * health, before `GatewayAllProvidersFailedError` was thrown and the route
 * answered 500 "Something went wrong while saving batch". A request that could
 * never have succeeded cost five provider round-trips and told the author
 * nothing about what to change. The realistic trigger is not abuse: it is a
 * whole-section revise with a long `existingContent`, or a gap analysis over a
 * complete document — exactly the sizes a BLA or a CSR produces.
 *
 * `fitsContextWindow` is asked BEFORE each dispatch (primary and every
 * fallback). A model that cannot hold the request is skipped without a network
 * call and without a health penalty — the request may still fit a model with a
 * larger window further down the chain, and being skipped for size says
 * nothing about whether the provider is healthy. Only when NO candidate fits is
 * `GatewayContextWindowError` thrown, carrying the numbers the caller needs to
 * fix it.
 *
 * ── Why the estimate is deliberately lenient ──────────────────────────────────
 * There is no tokenizer here, only a characters-per-token ratio, and the two
 * ways to be wrong are not symmetric:
 *
 *   • UNDER-estimate → a request that will not fit is admitted and the
 *     provider refuses it. That is exactly today's behaviour: nothing lost.
 *   • OVER-estimate → a request that WOULD have fit is refused here, and the
 *     author is told to cut a document the model could have taken. That is a
 *     regression this module must not introduce.
 *
 * So the ratio errs toward admitting. English regulatory prose runs about 4.3–
 * 4.7 characters per token on current Claude/GPT tokenizers; 5 is ~10% under
 * that, so a request this gate refuses is over the window by more than any
 * tokenizer variance. The repo's other estimator, `approxTokens` in
 * ana-ri/context-composer.ts, uses 4 — correctly, because it PACKS a budget,
 * where over-counting is the safe direction. Same heuristic, opposite failure
 * modes, hence two constants rather than one shared and wrong for one of them.
 * The provider remains the authority for the borderline band; this gate exists
 * to stop the requests that cannot fit ANY model from burning a cascade.
 *
 * ── What is counted ───────────────────────────────────────────────────────────
 *   • every message's text (string content and text blocks), via the same
 *     extractor the PII screen uses, so the two never disagree about what the
 *     request contains;
 *   • tool definitions and any JSON schema — the provider tokenizes them too;
 *   • images at a flat allowance (Anthropic caps a single image near 1,600
 *     tokens); PDF/document blocks are NOT counted — their token cost depends
 *     on page count, which the bytes do not reveal, and under-counting is the
 *     safe direction (see above);
 *   • the caller's `maxTokens`, because Anthropic validates input + max_tokens
 *     against the window and refuses the pair, not just the input. When the
 *     caller set none, nothing is reserved — the executors' own defaults are
 *     small and reserving a guess would push toward the unsafe direction.
 *
 * @module server/services/ai-gateway/context-budget
 */

import type { GatewayRequest, ModelConfig } from './types';
import { extractRequestText } from './pii-screen';

/**
 * Characters per token used for ADMISSION. Lenient on purpose — see the module
 * comment for why this is 5 and the budget packer's `approxTokens` is 4.
 */
export const ADMISSION_CHARS_PER_TOKEN = 5;

/** Flat per-image allowance; Anthropic's ceiling for one image is ~1,600 tokens. */
export const IMAGE_TOKEN_ALLOWANCE = 1_600;

export interface RequestTokenEstimate {
  /** Prompt side: messages, tool schemas, JSON schema, image allowances. */
  inputTokens: number;
  /** The caller's `maxTokens`, or 0 when unset. */
  reservedOutputTokens: number;
  /** What the provider will validate against the window. */
  totalTokens: number;
}

/** Estimate what a request will occupy in a model's context window. */
export function estimateRequestTokens(request: GatewayRequest): RequestTokenEstimate {
  let chars = extractRequestText(request).length;
  if (request.tools && request.tools.length > 0) chars += JSON.stringify(request.tools).length;
  if (request.jsonSchema) chars += JSON.stringify(request.jsonSchema).length;

  let images = request.imageContent?.length ?? 0;
  for (const message of request.messages ?? []) {
    for (const block of message.contentBlocks ?? []) {
      if (block && (block as { type?: string }).type === 'image') images++;
    }
  }

  const inputTokens = Math.ceil(chars / ADMISSION_CHARS_PER_TOKEN) + images * IMAGE_TOKEN_ALLOWANCE;
  const reservedOutputTokens =
    typeof request.maxTokens === 'number' && request.maxTokens > 0 ? Math.floor(request.maxTokens) : 0;
  return { inputTokens, reservedOutputTokens, totalTokens: inputTokens + reservedOutputTokens };
}

export interface ContextWindowFit {
  fits: boolean;
  id: string;
  provider: ModelConfig['provider'];
  model: string;
  contextWindow: number;
  estimatedInputTokens: number;
  reservedOutputTokens: number;
  estimatedTokens: number;
}

/** Whether `request` can be dispatched to `model` at all. Pure. */
export function fitsContextWindow(request: GatewayRequest, model: ModelConfig): ContextWindowFit {
  const estimate = estimateRequestTokens(request);
  return {
    fits: estimate.totalTokens <= model.contextWindow,
    id: model.id,
    provider: model.provider,
    model: model.model,
    contextWindow: model.contextWindow,
    estimatedInputTokens: estimate.inputTokens,
    reservedOutputTokens: estimate.reservedOutputTokens,
    estimatedTokens: estimate.totalTokens,
  };
}

const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');

/**
 * The sentence a caller can act on: how big the request is, the largest window
 * it could have had, and how much to cut. Written for the author of the
 * document, not for the operator — the operator has the log line.
 */
export function describeContextWindowRefusal(refusals: ReadonlyArray<ContextWindowFit>): string {
  if (refusals.length === 0) {
    return 'The request is too large for any available AI model.';
  }
  const largest = refusals.reduce((a, b) => (b.contextWindow > a.contextWindow ? b : a));
  const reserved = largest.reservedOutputTokens;
  const excessTokens = Math.max(1, largest.estimatedTokens - largest.contextWindow);
  const excessChars = excessTokens * ADMISSION_CHARS_PER_TOKEN;

  const size =
    `The request is about ${fmt(largest.estimatedTokens)} tokens` +
    (reserved > 0
      ? ` (≈${fmt(largest.estimatedInputTokens)} of input plus ${fmt(reserved)} reserved for the answer)`
      : '') +
    '.';
  const ceiling =
    `The largest context window available to it is ${fmt(largest.contextWindow)} tokens ` +
    `(${largest.provider}/${largest.model}).`;
  const remedy =
    `Reduce the input by about ${fmt(excessTokens)} tokens (≈${fmt(excessChars)} characters)` +
    (reserved > 0 ? ', lower maxTokens,' : '') +
    ' or split the work into smaller sections.';
  return `${size} ${ceiling} ${remedy}`;
}

/**
 * Thrown by the gateway when NO enabled, eligible model can hold the request.
 * No provider was called. Classified as TOKEN_LIMIT_EXCEEDED (HTTP 413) by
 * gateway-error-map.ts; never retried; never a reason to fall back further
 * (there is nothing further to fall back to).
 */
export class GatewayContextWindowError extends Error {
  readonly refusals: ReadonlyArray<ContextWindowFit>;
  readonly estimatedInputTokens: number;
  readonly reservedOutputTokens: number;
  readonly estimatedTokens: number;
  readonly largestContextWindow: number;

  constructor(refusals: ReadonlyArray<ContextWindowFit>) {
    super(describeContextWindowRefusal(refusals));
    this.name = 'GatewayContextWindowError';
    this.refusals = refusals;
    const largest = refusals.length > 0
      ? refusals.reduce((a, b) => (b.contextWindow > a.contextWindow ? b : a))
      : null;
    this.estimatedInputTokens = largest?.estimatedInputTokens ?? 0;
    this.reservedOutputTokens = largest?.reservedOutputTokens ?? 0;
    this.estimatedTokens = largest?.estimatedTokens ?? 0;
    this.largestContextWindow = largest?.contextWindow ?? 0;
  }
}
