import type { GatewayResponse } from '../../services/ai-gateway/types.js';

/** Qualification accepts a completed provider text reply, never a partial/cached substitute. */
export function isCompletedProviderText(response: GatewayResponse): boolean {
  return typeof response.content === 'string' && Boolean(response.content.trim()) && hasCompletedProviderFlags(response);
}

export function hasCompletedProviderFlags(response: { cached?: unknown; deterministic?: unknown; finishReason?: unknown }): boolean {
  return response.cached === false && response.deterministic === false && typeof response.finishReason === 'string' &&
    ['stop', 'end_turn', 'stop_sequence', 'STOP'].includes(response.finishReason);
}

export function providerResponseMetadata(response: GatewayResponse) {
  return { servedModel: response.resolvedModel ?? null, servedProvider: response.provider ?? null,
    finishReason: response.finishReason ?? null, cached: response.cached ?? null, deterministic: response.deterministic ?? null };
}
