/**
 * OpenAI-compatible streaming helpers — pure, provider-agnostic.
 *
 * The gateway's OpenAI and Moonshot paths both speak the OpenAI chat-completions
 * wire format, so they share one streaming decoder. These helpers isolate the
 * fiddly part — pulling the text delta, the reasoning delta, the finish reason,
 * and the (final-chunk) usage out of a stream chunk — so the gateway's async
 * loop stays thin and this logic is unit-tested without a live API.
 *
 * Reasoning surfaces under different keys across OpenAI-compatible providers:
 * Moonshot/Kimi and DeepSeek emit `delta.reasoning_content`; some gateways
 * (e.g. OpenRouter) emit `delta.reasoning`. We accept either so a returning
 * user sees "Thought for Ns" on the cheaper providers exactly as on Anthropic.
 *
 * @module server/services/ai-gateway/openai-stream
 */

/** Token usage carried on the final stream chunk (when include_usage is set). */
export interface OpenAIStreamUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** The decoded content of a single OpenAI-compatible stream chunk. */
export interface OpenAIStreamDelta {
  /** Visible answer text in this chunk ('' when the chunk carries none). */
  text: string;
  /** Reasoning/chain-of-thought text in this chunk ('' when none). */
  reasoning: string;
  /** Set once, on the chunk that closes the choice. */
  finishReason: string | null;
  /** Set once, on the final usage chunk (null on every content chunk). */
  usage: OpenAIStreamUsage | null;
}

/** Read a possibly-present string field, returning '' for anything else. */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Decode one OpenAI-compatible stream chunk. Pure and defensive — a malformed
 * or empty chunk decodes to an all-empty delta rather than throwing, so a
 * single odd chunk can never break the stream loop.
 */
export function parseOpenAIStreamDelta(chunk: any): OpenAIStreamDelta {
  const choice = chunk?.choices?.[0];
  const delta = choice?.delta ?? {};

  // Reasoning key varies by provider; prefer reasoning_content, then reasoning.
  const reasoning = str(delta.reasoning_content) || str(delta.reasoning);

  const rawUsage = chunk?.usage;
  const usage: OpenAIStreamUsage | null = rawUsage
    ? {
        inputTokens: Number(rawUsage.prompt_tokens) || 0,
        outputTokens: Number(rawUsage.completion_tokens) || 0,
        totalTokens:
          Number(rawUsage.total_tokens) ||
          (Number(rawUsage.prompt_tokens) || 0) + (Number(rawUsage.completion_tokens) || 0),
      }
    : null;

  return {
    text: str(delta.content),
    reasoning,
    finishReason: choice?.finish_reason ?? null,
    usage,
  };
}

/**
 * Pull reasoning off a NON-streaming OpenAI-compatible message, so the blocking
 * path surfaces "thinking" at parity with the streaming path. Pure.
 */
export function extractOpenAIReasoning(message: any): string {
  if (!message) return '';
  return str(message.reasoning_content) || str(message.reasoning);
}
