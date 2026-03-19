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
 *     model: 'claude-sonnet-4-20250514',
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

/** Default Claude models for different use cases */
export const CLAUDE_MODELS = {
  /** Highest capability — regulatory review, complex document drafting */
  opus: 'claude-opus-4-20250514',
  /** Best balance of quality and speed — primary workhorse */
  sonnet: 'claude-sonnet-4-20250514',
  /** Fast and cost-effective — simple tasks, classification */
  haiku: 'claude-haiku-4-5-20251001',
} as const;

export type ClaudeModel = typeof CLAUDE_MODELS[keyof typeof CLAUDE_MODELS];
