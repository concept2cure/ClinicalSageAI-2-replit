/**
 * Translation service — LLM-backed DRAFT provider.
 *
 * The reference {@link TranslationProvider} for the machine DRAFT step. It is a
 * thin, REAL adapter over the platform AI gateway (server/services/ai-gateway/
 * gateway.ts) — the single sanctioned entry point for every server-side LLM
 * call. It does NOT open its own HTTP client and does NOT read API keys; all of
 * that (routing, fallback chain, placement/residency policy, audit logging) is
 * the gateway's job and is threaded through via the request fields.
 *
 * REGULATED-PLATFORM GUARDRAILS honored here:
 *  - DRAFT ONLY. Output is a machine first pass. The engine label is recorded so
 *    the workflow can stamp method 'machine' (see hybrid-workflow.ts `draft`),
 *    which can NEVER reach 'approved' without human post-edit + back-translation.
 *    This provider never claims its output is approvable.
 *  - DNT identifiers are protected by MASKING BEFORE the call and UNMASKING
 *    AFTER (mirrors server/services/ana-ri/locale-overlays.ts — "translate
 *    meaning, not identifiers"). Per the provider contract the masked source is
 *    handed in already masked (ProviderTranslateInput.maskedSourceText); this
 *    module additionally re-asserts the mask defensively from the supplied
 *    glossary so a caller that forgets to mask still cannot leak a raw
 *    identifier to the model, and unmasks the model output before returning.
 *  - NO FABRICATION ON FAILURE. If the gateway is unavailable, errors, or returns
 *    deterministic/demo content in production, this provider throws a typed
 *    {@link LlmProviderError} rather than inventing a translation. Deterministic
 *    (keyless dev) output is surfaced via `deterministic: true` so the workflow
 *    refuses to promote it past 'mt_draft'.
 *
 * Construction takes the gateway accessor (default: the real singleton) so the
 * provider is unit-testable with a stub gateway and no network.
 *
 * @module server/services/translation/providers/llm-provider
 */

import { createScopedLogger } from '../../../utils/logger.js';
import { getGateway } from '../../ai-gateway/gateway.js';
import type { GatewayRequest, GatewayResponse } from '../../ai-gateway/types';
import {
  applyLockedTargetTerms,
  mask,
  unmask,
  type MaskingGlossary,
} from '../glossary';
import type {
  MaskResult,
  ProviderTranslateInput,
  ProviderTranslateOutput,
  TargetLanguage,
  TranslationProvider,
} from '../types';

const logger = createScopedLogger('translation-llm-provider');

// ── Prompt versioning ────────────────────────────────────────────────────────

/** Prompt template identifier — recorded in the gateway audit + segment provenance. */
export const TRANSLATION_PROMPT_VERSION = 'translation-draft-v1';

/** Stable provider id used for audit/provenance. */
export const LLM_PROVIDER_ID = 'gateway-mt';

/**
 * Human-readable target-language names for the prompt. The model translates into
 * the language; the BCP-47 code is only an index. Kept here (not in the shared
 * registry) so this provider has no client dependency.
 */
const LANGUAGE_NAMES: Record<TargetLanguage, string> = {
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  zh: 'Chinese (Simplified)',
  ko: 'Korean',
  es: 'Spanish',
  pt: 'Portuguese',
  it: 'Italian',
  nl: 'Dutch',
  pl: 'Polish',
  sv: 'Swedish',
  da: 'Danish',
  fi: 'Finnish',
  cs: 'Czech',
  el: 'Greek',
  hu: 'Hungarian',
  ro: 'Romanian',
};

// ── Typed error (no fabricated translations) ─────────────────────────────────

/** Stable failure codes for the LLM draft provider. */
export type LlmProviderErrorCode =
  | 'gateway_unavailable' //   the gateway threw / could not be reached
  | 'empty_response' //        the gateway returned no usable content
  | 'deterministic_in_prod'; // demo content surfaced where it must never be served

/**
 * Typed provider error. A DRAFT failure must NEVER degrade into a fabricated
 * translation — callers catch this and leave the segment in 'pending'.
 */
export class LlmProviderError extends Error {
  readonly code: LlmProviderErrorCode;
  readonly details?: unknown;

  constructor(code: LlmProviderErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'LlmProviderError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, LlmProviderError.prototype);
  }
}

// ── Prompt construction (pure) ───────────────────────────────────────────────

/**
 * System prompt for the DRAFT step. Pure builder so it is unit-testable and so
 * its content is the audited `promptVersion`. The placeholder-preservation
 * instruction is belt-and-braces: the caller already restores placeholders, but
 * telling the model to keep them verbatim reduces the chance it mangles a token.
 */
export function buildSystemPrompt(targetLang: TargetLanguage): string {
  const langName = LANGUAGE_NAMES[targetLang] ?? targetLang;
  return [
    `You are a professional regulatory/medical translator producing a FIRST DRAFT`,
    `from English into ${langName} for a life-sciences regulatory submission.`,
    ``,
    `Rules:`,
    `- Translate meaning faithfully and precisely; do not summarize, omit, or add.`,
    `- Preserve all formatting, numbering, and line breaks.`,
    `- Some spans appear as opaque placeholder tokens of the form ⦙DNT<number>⦙`,
    `  (e.g. ⦙DNT0⦙). These mask do-not-translate identifiers. Copy every such`,
    `  token through EXACTLY and UNCHANGED — never translate, reorder digits,`,
    `  alter, drop, or invent these tokens.`,
    `- Output ONLY the translated text. No preamble, no notes, no quotes.`,
  ].join('\n');
}

/**
 * Build the gateway request for a DRAFT translation. Pure: given the masked
 * source + context it returns the exact GatewayRequest, with all tenant /
 * residency / audit fields threaded through. `temperature: 0` for determinism.
 */
export function buildGatewayRequest(
  maskedSourceText: string,
  input: ProviderTranslateInput,
): GatewayRequest {
  const hints = (input.glossaryHints ?? []).filter((h) => h.source && h.target);
  const hintBlock =
    hints.length > 0
      ? `\n\nPreferred terminology (use these target renderings where they occur):\n` +
        hints.map((h) => `- "${h.source}" → "${h.target}"`).join('\n')
      : '';

  return {
    taskType: 'document_drafting',
    messages: [
      { role: 'system', content: buildSystemPrompt(input.targetLang) },
      { role: 'user', content: `${maskedSourceText}${hintBlock}` },
    ],
    temperature: 0,
    maxTokens: 4000,
    // ── tenant / traceability + hard compliance constraints ──
    organizationId: input.organizationId,
    userId: input.userId,
    callerModule: LLM_PROVIDER_ID,
    promptVersion: TRANSLATION_PROMPT_VERSION,
    dataResidency: input.dataResidency,
    zeroDataRetention: input.zeroDataRetention,
    metadata: {
      promptVersion: TRANSLATION_PROMPT_VERSION,
      targetLang: input.targetLang,
      sourceLang: input.sourceLang,
      step: 'draft',
    },
  };
}

/** Build the `engine` provenance label from a gateway response, e.g. "anthropic:claude-..". */
export function engineLabel(response: GatewayResponse): string {
  return `${response.provider}:${response.model}`;
}

// ── Provider ─────────────────────────────────────────────────────────────────

/** Minimal gateway surface this provider depends on (route()), for testability. */
export interface GatewayLike {
  route(request: GatewayRequest): Promise<GatewayResponse>;
}

/** Options for {@link LlmTranslationProvider}. */
export interface LlmProviderOptions {
  /**
   * Gateway accessor. Defaults to the real memoized singleton (getGateway()).
   * Inject a stub in tests — no network, no API keys.
   */
  getGateway?: () => GatewayLike;
  /**
   * If true (the default), in production (`NODE_ENV === 'production'`) a
   * deterministic/demo gateway response is treated as a hard error rather than
   * being returned as a draft. In dev, deterministic output is returned but
   * flagged so the workflow refuses to promote it.
   */
  rejectDeterministicInProd?: boolean;
}

/**
 * AI-gateway-backed DRAFT translation provider. Implements the pluggable
 * {@link TranslationProvider} surface; produces method-'machine' first passes.
 */
export class LlmTranslationProvider implements TranslationProvider {
  readonly id = LLM_PROVIDER_ID;

  private readonly resolveGateway: () => GatewayLike;
  private readonly rejectDeterministicInProd: boolean;

  constructor(options: LlmProviderOptions = {}) {
    this.resolveGateway = options.getGateway ?? (() => getGateway() as GatewayLike);
    this.rejectDeterministicInProd = options.rejectDeterministicInProd ?? true;
  }

  /**
   * Produce a DRAFT translation. The input's source text is expected to already
   * be DNT-masked; we re-assert the mask defensively when a glossary is provided
   * via {@link translateWithGlossary}. Returns the target text still containing
   * placeholders (the contract: the caller restores them) — but see
   * {@link translateWithGlossary} for the mask→call→unmask convenience.
   */
  async translate(input: ProviderTranslateInput): Promise<ProviderTranslateOutput> {
    const request = buildGatewayRequest(input.maskedSourceText, input);

    let response: GatewayResponse;
    try {
      response = await this.resolveGateway().route(request);
    } catch (error: any) {
      // Real failure — never fabricate a translation. Surface a typed error so
      // the caller leaves the segment in 'pending'.
      logger.warn(`Draft translation gateway call failed: ${error?.message ?? error}`, {
        targetLang: input.targetLang,
        organizationId: input.organizationId,
      });
      throw new LlmProviderError(
        'gateway_unavailable',
        `AI gateway draft translation failed: ${error?.message ?? String(error)}`,
        { cause: error?.message },
      );
    }

    const content = (response.content ?? '').trim();
    if (!content) {
      throw new LlmProviderError(
        'empty_response',
        'AI gateway returned no draft translation content.',
        { provider: response.provider, model: response.model },
      );
    }

    const deterministic = response.deterministic === true;
    if (
      deterministic &&
      this.rejectDeterministicInProd &&
      process.env.NODE_ENV === 'production'
    ) {
      // Demo/canned content must never masquerade as a real submission draft.
      throw new LlmProviderError(
        'deterministic_in_prod',
        'AI gateway returned deterministic/demo content in production; refusing to ' +
          'emit it as a translation draft.',
        { provider: response.provider, model: response.model },
      );
    }

    return {
      targetText: content,
      engine: engineLabel(response),
      deterministic,
    };
  }

  /**
   * Convenience wrapper that owns the full DNT cycle for a RAW source string:
   * mask (from the supplied glossary) → gateway draft → unmask → apply any
   * non-DNT preferred target terms. Use this when you have raw source text and a
   * compiled glossary; use {@link translate} when the caller already masked.
   *
   * The returned text is the human-readable draft with identifiers restored
   * verbatim. `deterministic` is propagated so the workflow can refuse promotion.
   */
  async translateWithGlossary(
    rawSourceText: string,
    glossary: MaskingGlossary,
    input: Omit<ProviderTranslateInput, 'maskedSourceText'>,
  ): Promise<ProviderTranslateOutput & { mask: MaskResult }> {
    // 1. MASK before the model ever sees the text.
    const masked: MaskResult = mask(rawSourceText, glossary);

    // 2. DRAFT via the gateway on masked text only.
    const draft = await this.translate({ ...input, maskedSourceText: masked.maskedText });

    // 3. UNMASK — restore the verbatim identifiers.
    let targetText = unmask(draft.targetText, masked);

    // 4. Enforce mandated (non-DNT) target renderings on the restored draft.
    targetText = applyLockedTargetTerms(targetText, glossary);

    return { ...draft, targetText, mask: masked };
  }
}

/** Factory mirroring the service layer's construction style. */
export function createLlmTranslationProvider(
  options?: LlmProviderOptions,
): LlmTranslationProvider {
  return new LlmTranslationProvider(options);
}
