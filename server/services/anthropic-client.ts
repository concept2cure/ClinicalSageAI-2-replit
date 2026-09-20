/**
 * Shared Anthropic/Claude Client Singleton
 *
 * Primary AI client for ClinicalSageAI. All new AI functionality should use
 * either this client directly or the unified AI client.
 *
 * Usage:
 *   import { getAnthropicClient } from './anthropic-client';
 *   const anthropic = getAnthropicClient();
 *   const response = await anthropic.messages.create({
 *     model: 'claude-sonnet-4-6',
 *     max_tokens: 2000,
 *     messages: [{ role: 'user', content: 'Hello' }],
 *   });
 *
 * For simpler usage, prefer the unified AI client:
 *   import { ai } from '../lib/unified-ai-client';
 *   const text = await ai.complete('Hello', { maxTokens: 2000 });
 *
 * @see server/lib/unified-ai-client.ts — High-level Claude-first API
 * @see server/services/ai-gateway/gateway.ts — Multi-provider gateway
 */
import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null;

/**
 * Get the shared Anthropic client instance.
 * Throws if ANTHROPIC_API_KEY is not configured.
 */
export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY environment variable is required. ' +
        'ClinicalSageAI uses Claude as its primary AI provider.'
      );
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

// `CLAUDE_MODELS` (opus / sonnet / haiku) and its `ClaudeModel` type were
// declared here and imported by nothing. A second model table with no
// consumers is not harmless: it named opus as `claude-opus-4-7` while the
// gateway registry said 4.8, so the two disagreed in the repository for as
// long as both existed, and the first place a reader looks for "which Claude
// do we use" was the wrong one.
//
// The gateway registry (server/services/ai-gateway/gateway.ts, DEFAULT_MODELS)
// is the only model table, and the approved-models lockfile is what governs
// changing it. Callers name a stable alias id — `claude-opus-4`,
// `claude-sonnet-4`, `claude-haiku-4` — never a wire version.
