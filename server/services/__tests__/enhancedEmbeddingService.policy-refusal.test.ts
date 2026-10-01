/**
 * An embedding refusal is final (P1-54, 2026-10-01; from the P1-45 review, R3).
 *
 * The provider seam asks the gateway's placement decision before it sends
 * anything (P0-11). A refusal is a GatewayPolicyError: the decision will not
 * change on a second ask. embedBatch's retry loop treated it as a transient
 * provider failure and asked again maxRetries times with growing back-off, so
 * an ingest the tenant's placement forbids stalled for seconds per batch and
 * logged three refusals for one decision. Every other gateway path already
 * treats a policy refusal as terminal (gateway-outcome.ts isTerminalGatewayError).
 *
 * Pinned here: a refusal is asked once and rethrown unchanged; a transient
 * failure is still retried.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const embed = vi.hoisted(() => vi.fn());
vi.mock('../ai-gateway/embeddings/embedding-provider', () => ({
  getEmbeddingProvider: () => ({ embed }),
}));

import { EnhancedEmbeddingService } from '../enhancedEmbeddingService';

function policyRefusal(): Error {
  const err = new Error('embedding to openai refused: tenant placement is in-region only');
  err.name = 'GatewayPolicyError';
  return err;
}

function service(): EnhancedEmbeddingService {
  const svc = new EnhancedEmbeddingService({ query: async () => ({ rows: [] }) } as any);
  (svc as any).sleep = vi.fn(async () => undefined);
  return svc;
}

describe('embedBatch and a placement refusal', () => {
  // Braces: a function returned from beforeEach is run as its teardown.
  beforeEach(() => {
    embed.mockReset();
  });

  it('asks once and rethrows the refusal unchanged', async () => {
    const refusal = policyRefusal();
    embed.mockRejectedValue(refusal);
    const svc = service();

    await expect(svc.embedBatch(['a protocol synopsis'])).rejects.toBe(refusal);
    expect(embed).toHaveBeenCalledTimes(1);
    expect((svc as any).sleep).not.toHaveBeenCalled();
  });

  it('still retries a transient provider failure', async () => {
    embed
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ embeddings: [[0.1, 0.2]], inputTokens: 4 });
    const svc = service();

    const out = await svc.embedBatch(['a protocol synopsis']);
    expect(out).toHaveLength(1);
    expect(embed).toHaveBeenCalledTimes(2);
  });
});
