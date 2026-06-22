/**
 * Unit tests for the dependency-free retry/transient-status helpers, with
 * emphasis on HTTP 529 ("Overloaded") handling.
 *
 * @module server/services/ai-gateway/__tests__/retry-policy.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  gatewayRetryAttempts,
  extractErrorStatus,
  isTransientStatus,
  OVERLOADED_STATUS,
} from '../retry-policy';

describe('gatewayRetryAttempts', () => {
  it('does not retry streaming requests', () => {
    expect(gatewayRetryAttempts(true)).toBe(0);
  });
  it('retries non-streaming requests once', () => {
    expect(gatewayRetryAttempts(false)).toBe(1);
  });
});

describe('extractErrorStatus', () => {
  it('reads .status (Anthropic/OpenAI SDK shape)', () => {
    expect(extractErrorStatus({ status: 529 })).toBe(529);
  });
  it('reads .statusCode', () => {
    expect(extractErrorStatus({ statusCode: 503 })).toBe(503);
  });
  it('returns undefined for non-status errors', () => {
    expect(extractErrorStatus(new Error('boom'))).toBeUndefined();
    expect(extractErrorStatus(null)).toBeUndefined();
    expect(extractErrorStatus('429')).toBeUndefined();
  });
});

describe('isTransientStatus', () => {
  it('treats 529 Overloaded as transient', () => {
    expect(OVERLOADED_STATUS).toBe(529);
    expect(isTransientStatus(529)).toBe(true);
  });
  it('treats rate-limit and 5xx as transient', () => {
    for (const s of [429, 500, 502, 503, 504]) {
      expect(isTransientStatus(s)).toBe(true);
    }
  });
  it('treats client errors and success as non-transient', () => {
    for (const s of [400, 401, 403, 404, 422, 200]) {
      expect(isTransientStatus(s)).toBe(false);
    }
  });
  it('is false for undefined', () => {
    expect(isTransientStatus(undefined)).toBe(false);
  });
});
