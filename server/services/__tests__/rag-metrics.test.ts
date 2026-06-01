import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordRagRetrieval,
  renderRagMetrics,
  snapshotRagMetrics,
  resetRagMetrics,
} from '../rag-metrics.js';

describe('rag-metrics', () => {
  beforeEach(() => resetRagMetrics());

  it('counts retrievals keyed by corpus/intent/strategy/outcome', () => {
    recordRagRetrieval({
      corpus: 'rag_chunks',
      intent: 'regulatory_qa',
      strategy: 'basic',
      outcome: 'ok',
      latencyMs: 120,
      candidates: 8,
      returned: 5,
      topScore: 0.82,
      tokensUsed: 0,
    });
    recordRagRetrieval({
      corpus: 'rag_chunks',
      intent: 'regulatory_qa',
      strategy: 'basic',
      outcome: 'ok',
      latencyMs: 90,
      candidates: 6,
      returned: 3,
      topScore: 0.7,
    });

    const snap = snapshotRagMetrics();
    expect(snap.retrievals['rag_chunks|regulatory_qa|basic|ok']).toBe(2);
    expect(snap.documentsReturned['rag_chunks']).toBe(8);
    expect(snap.latency.count).toBe(2);
    expect(snap.latency.sum).toBe(210);
    // top-score histogram only observes successful retrievals
    expect(snap.topScore.count).toBe(2);
  });

  it('does not record a top score for empty or error outcomes', () => {
    recordRagRetrieval({
      corpus: 'vault',
      intent: 'foresight',
      strategy: 'advanced',
      outcome: 'empty',
      latencyMs: 50,
      candidates: 0,
      returned: 0,
    });
    recordRagRetrieval({
      corpus: 'vault',
      intent: 'foresight',
      strategy: 'advanced',
      outcome: 'error',
      latencyMs: 30,
    });

    const snap = snapshotRagMetrics();
    expect(snap.topScore.count).toBe(0);
    // latency is observed for every retrieval, including errors
    expect(snap.latency.count).toBe(2);
    expect(snap.retrievals['vault|foresight|advanced|empty']).toBe(1);
    expect(snap.retrievals['vault|foresight|advanced|error']).toBe(1);
  });

  it('renders valid Prometheus text with the expected metric names', () => {
    recordRagRetrieval({
      corpus: 'project_atoms',
      intent: 'project_scoped',
      strategy: 'advanced',
      outcome: 'ok',
      latencyMs: 300,
      candidates: 12,
      returned: 6,
      topScore: 0.91,
      tokensUsed: 1500,
    });

    const text = renderRagMetrics().join('\n');
    expect(text).toContain('# TYPE rag_retrievals_total counter');
    expect(text).toContain(
      'rag_retrievals_total{corpus="project_atoms",intent="project_scoped",strategy="advanced",outcome="ok"} 1'
    );
    expect(text).toContain('# TYPE rag_retrieval_latency_ms histogram');
    expect(text).toContain('rag_retrieval_latency_ms_count 1');
    expect(text).toContain('rag_retrieval_top_score_bucket{le="+Inf"} 1');
    expect(text).toContain('rag_tokens_total{corpus="project_atoms"} 1500');
  });
});
