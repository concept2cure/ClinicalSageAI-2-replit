import { describe, it, expect } from 'vitest';
import { gatewayRetryAttempts } from '../../services/ai-gateway/retry-policy';

/**
 * Fix (wave 4): the AI gateway wrapped the primary model attempt in
 * retryWithBackoff for ALL requests. For streaming, a mid-stream failure has
 * already delivered tokens to request.onStream, so a retry replays and
 * duplicates them. Streaming must get 0 retries.
 */
describe('gatewayRetryAttempts (streaming idempotency)', () => {
  it('retries non-streaming requests once', () => {
    expect(gatewayRetryAttempts(false)).toBe(1);
  });
  it('never retries streaming requests', () => {
    expect(gatewayRetryAttempts(true)).toBe(0);
  });
});
