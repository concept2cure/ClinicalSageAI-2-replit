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
import { GatewayContextWindowError } from './context-budget';

export type GatewayErrorCode =
  | 'RATE_LIMITED'
  | 'OVERLOADED'
  | 'TOKEN_LIMIT_EXCEEDED'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_AI_RESPONSE';

export interface ClassifiedGatewayError {
  code: GatewayErrorCode;
  message: string;
}

/**
 * The HTTP status each code answers with. One table, exported, so a route that
 * calls the gateway directly does not grow its own copy — the copies in
 * submissions.ts and ectd-documents.ts predate this export and agree with it.
 */
export const GATEWAY_ERROR_HTTP_STATUS: Readonly<Record<GatewayErrorCode, number>> = {
  RATE_LIMITED: 429,
  OVERLOADED: 503,
  TOKEN_LIMIT_EXCEEDED: 413,
  PROVIDER_UNAVAILABLE: 503,
  INVALID_AI_RESPONSE: 502,
};

/**
 * True for an error the gateway itself raised. A route uses this to decide
 * between "answer with the classified code and status" and "this is a fault of
 * ours — log it and answer 500". Without the distinction every AI failure is a
 * 500, and a too-large input is indistinguishable from a crash.
 */
export function isGatewayError(err: unknown): boolean {
  return (
    err instanceof GatewayContextWindowError ||
    err instanceof GatewayAllProvidersFailedError ||
    err instanceof GatewayNoProviderError ||
    err instanceof GatewayPolicyError
  );
}

/** Classify a thrown gateway/parse error into a stable code + safe message. */
export function classifyGatewayError(err: unknown): ClassifiedGatewayError {
  if (err instanceof SyntaxError) {
    return { code: 'INVALID_AI_RESPONSE', message: 'The AI response was not valid JSON.' };
  }
  // Refused by the gateway's own admission before any provider was called. The
  // message is gateway-authored (size, ceiling, how much to cut) — not a
  // provider string — so it is safe to hand to the author as written.
  if (err instanceof GatewayContextWindowError) {
    return { code: 'TOKEN_LIMIT_EXCEEDED', message: err.message };
  }
  if (err instanceof GatewayNoProviderError) {
    return { code: 'PROVIDER_UNAVAILABLE', message: 'No AI provider is available to handle this request.' };
  }
  if (err instanceof GatewayPolicyError) {
    return { code: 'PROVIDER_UNAVAILABLE', message: 'This request was blocked by AI gateway policy.' };
  }
  if (err instanceof GatewayAllProvidersFailedError) {
    const msg = err.message || '';
    // 529 = Anthropic "Overloaded" (and generic provider overload/503). Distinct
    // from a 429 rate-limit: it is transient back-pressure, retried with backoff
    // in the gateway, and surfaced as a clean "retry shortly" rather than a fault.
    if (/\b529\b|overloaded/i.test(msg)) {
      return { code: 'OVERLOADED', message: 'The AI provider is overloaded right now. Please retry in a moment.' };
    }
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
