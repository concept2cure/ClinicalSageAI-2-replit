import { describe, expect, it } from 'vitest';
import { GatewayPolicyError } from '../gateway';
import { classifyGatewayError, GATEWAY_ERROR_HTTP_STATUS, isGatewayError } from '../gateway-error-map';

describe('source checkpoint refusal classification', () => {
  it('reports a source refusal as a conflict with an actionable fixed message', () => {
    const error = Object.assign(new GatewayPolicyError('relation private_source does not exist; do not expose this'), {
      code: 'SOURCE_CONTEXT_UNAVAILABLE',
    });
    expect(isGatewayError(error)).toBe(true);
    const classified = classifyGatewayError(error);
    expect(classified.code).toBe('SOURCE_CONTEXT_UNAVAILABLE');
    expect(GATEWAY_ERROR_HTTP_STATUS[classified.code]).toBe(409);
    expect(classified.message).toMatch(/sources|source context/i);
    expect(classified.message).toMatch(/access|versions/i);
    expect(classified.message).not.toMatch(/relation|private_source|does not exist/);
  });

  it('does not promote an arbitrary code-bearing object into a gateway refusal', () => {
    const forged = { code: 'SOURCE_CONTEXT_UNAVAILABLE', message: 'private source contents' };
    expect(isGatewayError(forged)).toBe(false);
    expect(classifyGatewayError(forged)).toEqual({
      code: 'PROVIDER_UNAVAILABLE', message: 'The AI request could not be completed.',
    });
  });

  it('preserves the existing generic policy classification', () => {
    expect(classifyGatewayError(new GatewayPolicyError('private policy details'))).toEqual({
      code: 'PROVIDER_UNAVAILABLE', message: 'This request was blocked by AI gateway policy.',
    });
  });
});
