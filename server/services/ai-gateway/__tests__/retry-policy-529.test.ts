import { describe, it, expect } from 'vitest';
import {
  isRetryableHttpStatus,
  isHardClientError,
  isOverloadStatus,
  gatewayRetryAttempts,
  overloadRetryAttempts,
  OVERLOAD_BASE_DELAY_MS,
} from '../retry-policy.js';
import { classifyGatewayError } from '../gateway-error-map.js';
import { GatewayAllProvidersFailedError } from '../gateway.js';

describe('retry-policy — status classification', () => {
  it('treats 529 (Anthropic Overloaded) and other transients as retryable', () => {
    for (const s of [408, 409, 425, 429, 500, 502, 503, 504, 529]) {
      expect(isRetryableHttpStatus(s)).toBe(true);
    }
  });

  it('treats hard client errors as non-retryable', () => {
    for (const s of [400, 401, 403, 404, 422]) {
      expect(isRetryableHttpStatus(s)).toBe(false);
      expect(isHardClientError(s)).toBe(true);
    }
  });

  it('treats a missing status (network error) as retryable but not a hard client error', () => {
    expect(isRetryableHttpStatus(undefined)).toBe(true);
    expect(isHardClientError(undefined)).toBe(false);
  });

  it('classifies overload statuses (429/503/529)', () => {
    expect(isOverloadStatus(429)).toBe(true);
    expect(isOverloadStatus(503)).toBe(true);
    expect(isOverloadStatus(529)).toBe(true);
    expect(isOverloadStatus(500)).toBe(false);
    expect(isHardClientError(529)).toBe(false);
  });

  it('gives overload more non-streaming retries than a generic transient, and none while streaming', () => {
    expect(gatewayRetryAttempts(false)).toBe(1);
    expect(overloadRetryAttempts(false)).toBeGreaterThan(gatewayRetryAttempts(false));
    expect(overloadRetryAttempts(true)).toBe(0);
    expect(OVERLOAD_BASE_DELAY_MS).toBeGreaterThan(0);
  });
});

describe('gateway-error-map — 529 / overloaded classification', () => {
  it('maps a 529 provider failure to OVERLOADED (not a generic fault)', () => {
    const c = classifyGatewayError(new GatewayAllProvidersFailedError('anthropic 529 Overloaded'));
    expect(c.code).toBe('OVERLOADED');
    expect(c.message).toMatch(/overloaded/i);
  });

  it('maps an "overloaded" message to OVERLOADED', () => {
    expect(classifyGatewayError(new GatewayAllProvidersFailedError('Provider overloaded')).code).toBe('OVERLOADED');
  });

  it('still maps 429 to RATE_LIMITED and generic failure to PROVIDER_UNAVAILABLE', () => {
    expect(classifyGatewayError(new GatewayAllProvidersFailedError('429 rate limit')).code).toBe('RATE_LIMITED');
    expect(classifyGatewayError(new GatewayAllProvidersFailedError('connection reset')).code).toBe('PROVIDER_UNAVAILABLE');
  });
});
