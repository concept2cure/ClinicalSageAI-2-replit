/**
 * Shared OpenAI Client Singleton
 *
 * Centralizes OpenAI client creation so the entire codebase shares one
 * instance rather than 89+ independent instantiations.
 *
 * TODO: Migrate callers to server/services/ai-gateway/gateway.ts for
 * multi-provider support, fallback, and audit logging.
 */
import OpenAI from 'openai';

let _client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    _client = new OpenAI({ apiKey });
  }
  return _client;
}
