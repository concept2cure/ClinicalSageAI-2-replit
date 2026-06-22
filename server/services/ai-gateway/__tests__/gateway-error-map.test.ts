/**
 * Unit tests for the gateway error classifier, focused on 529 "Overloaded".
 *
 * @module server/services/ai-gateway/__tests__/gateway-error-map.test.ts
 */

import { describe, it, expect } from 'vitest';
import { classifyGatewayError } from '../gateway-error-map';
import { GatewayAllProvidersFailedError } from '../gateway';

describe('classifyGatewayError — 529 Overloaded', () => {
  it('classifies a 529 message as RATE_LIMITED with an overload-specific message', () => {
    const err = new GatewayAllProvidersFailedError(
      'All models failed. Tried: anthropic/claude. Last error: 529 overloaded_error',
    );
    const out = classifyGatewayError(err);
    expect(out.code).toBe('RATE_LIMITED');
    expect(out.message).toMatch(/overloaded/i);
  });

  it('still classifies a 429 as RATE_LIMITED (rate-limit message)', () => {
    const err = new GatewayAllProvidersFailedError('Last error: 429 rate limit exceeded');
    const out = classifyGatewayError(err);
    expect(out.code).toBe('RATE_LIMITED');
    expect(out.message).toMatch(/rate limiting/i);
  });

  it('falls back to PROVIDER_UNAVAILABLE for unrecognized provider failures', () => {
    const err = new GatewayAllProvidersFailedError('Last error: connection reset');
    expect(classifyGatewayError(err).code).toBe('PROVIDER_UNAVAILABLE');
  });
});
