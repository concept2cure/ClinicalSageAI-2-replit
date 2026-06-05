/**
 * Shared gateway-error classifier.
 *
 * Maps an error thrown by the AI gateway to a stable {code, message} the route
 * layer turns into an HTTP status — so rate-limit / token-limit / policy /
 * provider-unavailable are distinguished instead of being flattened to one 503.
 * Never leaks a raw provider error string to the client.
 *
 * @module server/services/ai-gateway/gateway-error-map
 */

import {
  GatewayPolicyError,
  GatewayNoProviderError,
  GatewayAllProvidersFailedError,
} from './gateway';

export type GatewayErrorCode =
  | 'RATE_LIMITED'
  | 'TOKEN_LIMIT_EXCEEDED'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_AI_RESPONSE';

export interface ClassifiedGatewayError {
  code: GatewayErrorCode;
  message: string;
}

/** Classify a thrown gateway/parse error into a stable code + safe message. */
export function classifyGatewayError(err: unknown): ClassifiedGatewayError {
  if (err instanceof SyntaxError) {
    return { code: 'INVALID_AI_RESPONSE', message: 'The AI response was not valid JSON.' };
  }
  if (err instanceof GatewayNoProviderError) {
    return { code: 'PROVIDER_UNAVAILABLE', message: 'No AI provider is available to handle this request.' };
  }
  if (err instanceof GatewayPolicyError) {
    return { code: 'PROVIDER_UNAVAILABLE', message: 'This request was blocked by AI gateway policy.' };
  }
  if (err instanceof GatewayAllProvidersFailedError) {
    const msg = err.message || '';
    if (/429|rate.?limit/i.test(msg)) {
      return { code: 'RATE_LIMITED', message: 'The AI provider is rate limiting requests. Try again shortly.' };
    }
    if (/token|context length|max.?tokens/i.test(msg)) {
      return { code: 'TOKEN_LIMIT_EXCEEDED', message: 'The input is too large for a single AI request.' };
    }
    return { code: 'PROVIDER_UNAVAILABLE', message: 'The AI provider is temporarily unavailable.' };
  }
  return { code: 'PROVIDER_UNAVAILABLE', message: 'The AI request could not be completed.' };
}
