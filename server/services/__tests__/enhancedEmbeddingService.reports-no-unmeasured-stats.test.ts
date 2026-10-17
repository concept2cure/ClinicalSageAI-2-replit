/**
 * The embedding service reports no figure it did not measure.
 *
 * ── What the code used to do ────────────────────────────────────────────────
 * `getStats()` returned `avgProcessingTimeMs: 0` ("Would need to track this")
 * and `estimatedCostUSD: cacheMisses × MODEL_COSTS[model] × 0.5` ("Rough
 * estimate": an assumed 500 tokens per cache miss), typed as EmbeddingStats
 * measurements, plus whole-table counts of lumen_data_atoms across every tenant.
 * Nothing called it. It is removed with the price table that only it read,
 * rather than relabelled.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../ai-gateway/embeddings/embedding-provider', () => ({ getEmbeddingProvider: () => ({ embed: vi.fn() }) }));

import * as embeddingModule from '../enhancedEmbeddingService';

describe('EnhancedEmbeddingService', () => {
  it('has no stats method reporting an unmeasured processing time or an assumed cost', () => {
    expect('getStats' in embeddingModule.EnhancedEmbeddingService.prototype).toBe(false);
  });

  it('exports no price table from which a cost could be assumed', () => {
    expect('MODEL_COSTS' in embeddingModule).toBe(false);
  });
});
