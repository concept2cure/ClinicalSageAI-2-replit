/**
 * Shared OpenAI Client Singleton
 *
 * Centralizes OpenAI client creation so the entire codebase shares one
 * instance rather than 89+ independent instantiations.
 *
 * NOTE: ClinicalSageAI now uses Claude/Anthropic as the primary AI provider.
 * This client is retained ONLY for OpenAI-specific functionality (embeddings,
 * DALL-E). All chat completions should use the unified AI client instead:
 *
 *   import { ai } from '../lib/unified-ai-client';
 *   const text = await ai.complete(messages, { maxTokens: 2000 });
 *
 * @see server/lib/unified-ai-client.ts — Claude-first unified client
 * @see server/services/ai-gateway/gateway.ts — Multi-provider gateway
 */
import OpenAI from 'openai';

let _client: OpenAI | null = null;
let _warned = false;

/**
 * Get the shared OpenAI client instance.
 * Returns null if OPENAI_API_KEY is not set (graceful degradation).
 * Callers should migrate to `ai` from `../lib/unified-ai-client` for chat completions.
 */
export function getOpenAIClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      if (!_warned) {
        _warned = true;
        console.warn(
          '[openai-client] OPENAI_API_KEY not set. OpenAI-specific features (embeddings, DALL-E) unavailable. ' +
          'Chat completions route through Claude via AI Gateway.'
        );
      }
      // Return a proxy that throws descriptive errors on use
      return new Proxy({} as OpenAI, {
        get(_target, prop) {
          if (prop === 'chat' || prop === 'embeddings' || prop === 'images' || prop === 'beta') {
            return new Proxy({}, {
              get(_t, subProp) {
                return new Proxy({}, {
                  get() {
                    return (..._args: any[]) => {
                      throw new Error(
                        `OpenAI API key not configured. For chat completions, use the unified AI client: ` +
                        `import { ai } from '../lib/unified-ai-client'`
                      );
                    };
                  },
                });
              },
            });
          }
          return undefined;
        },
      });
    }
    _client = new OpenAI({ apiKey });
  }
  return _client;
}
