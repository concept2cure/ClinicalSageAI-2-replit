/**
 * RAG retrieval metrics — in-memory accumulators surfaced via /api/metrics.
 *
 * Mirrors ana-ri-metrics.ts: no external dependencies, hand-rolled Prometheus
 * text, counters monotonic since process start, histograms exposed as
 * sum + count + cumulative buckets so PromQL can derive avg / p95.
 *
 * Recorded once per retrieval at the single router chokepoint (ragRetrieve /
 * ragQuery), so every RAG read is observable regardless of caller. The
 * RAGContext the pipeline already returns (candidate count, strategy, latency,
 * tokens) is the signal; this module is what turns it into a time series.
 *
 * The two retrieval-quality signals worth alerting on are the empty-result rate
 * (rag_retrievals_total{outcome="empty"} / total) and the top-score
 * distribution (rag_retrieval_top_score) — both fall out of the records below.
 *
 * @module server/services/rag-metrics
 */

/** Which corpus the retrieval actually read from (derived in the router). */
export type RagCorpusLabel = 'vault' | 'rag_chunks' | 'project_atoms';
/** ok = documents returned; empty = ran but zero docs; error = threw. */
export type RagOutcome = 'ok' | 'empty' | 'error';

const LATENCY_BUCKETS_MS = [50, 100, 250, 500, 1000, 2000, 5000, 10_000, 30_000];
const CANDIDATE_BUCKETS = [0, 1, 3, 5, 10, 20, 50, 100];
const SCORE_BUCKETS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

interface Histogram {
  count: number;
  sum: number;
  /** Cumulative bucket counts aligned to the boundaries above + +Inf. */
  buckets: number[];
}

function makeHistogram(boundaries: number[]): Histogram {
  return { count: 0, sum: 0, buckets: new Array(boundaries.length + 1).fill(0) };
}

function observeHistogram(h: Histogram, boundaries: number[], value: number): void {
  if (!Number.isFinite(value) || value < 0) return;
  h.count += 1;
  h.sum += value;
  for (let i = 0; i < boundaries.length; i++) {
    if (value <= boundaries[i]) {
      for (let j = i; j < h.buckets.length; j++) h.buckets[j] += 1;
      return;
    }
  }
  h.buckets[h.buckets.length - 1] += 1;
}

interface RagMetricsState {
  /** Keyed by `corpus|intent|strategy|outcome`. */
  retrievals: Map<string, number>;
  /** Returned-document and token totals, keyed by corpus. */
  documentsReturned: Map<RagCorpusLabel, number>;
  tokens: Map<RagCorpusLabel, number>;
  latency: Histogram;
  candidates: Histogram;
  topScore: Histogram;
}

function makeState(): RagMetricsState {
  return {
    retrievals: new Map(),
    documentsReturned: new Map(),
    tokens: new Map(),
    latency: makeHistogram(LATENCY_BUCKETS_MS),
    candidates: makeHistogram(CANDIDATE_BUCKETS),
    topScore: makeHistogram(SCORE_BUCKETS),
  };
}

let state: RagMetricsState = makeState();

export interface RecordRagRetrievalInput {
  corpus: RagCorpusLabel;
  intent: string;
  strategy: string;
  outcome: RagOutcome;
  latencyMs: number;
  /** Total candidates before rerank/MMR/truncation (RAGContext.totalCandidates). */
  candidates?: number;
  /** Documents handed back to the caller after truncation. */
  returned?: number;
  /** Highest finalScore among returned documents (0..1), if any. */
  topScore?: number;
  tokensUsed?: number;
}

/** Record one retrieval. Called once per ragRetrieve / ragQuery, including on error. */
export function recordRagRetrieval(input: RecordRagRetrievalInput): void {
  const key = `${input.corpus}|${input.intent}|${input.strategy}|${input.outcome}`;
  state.retrievals.set(key, (state.retrievals.get(key) || 0) + 1);

  observeHistogram(state.latency, LATENCY_BUCKETS_MS, input.latencyMs);

  if (typeof input.candidates === 'number') {
    observeHistogram(state.candidates, CANDIDATE_BUCKETS, input.candidates);
  }
  if (typeof input.returned === 'number') {
    state.documentsReturned.set(
      input.corpus,
      (state.documentsReturned.get(input.corpus) || 0) + input.returned
    );
  }
  // Only score successful retrievals — empty/error have no meaningful top score.
  if (input.outcome === 'ok' && typeof input.topScore === 'number') {
    observeHistogram(state.topScore, SCORE_BUCKETS, input.topScore);
  }
  if (typeof input.tokensUsed === 'number') {
    state.tokens.set(input.corpus, (state.tokens.get(input.corpus) || 0) + input.tokensUsed);
  }
}

function renderHistogram(
  name: string,
  help: string,
  hist: Histogram,
  boundaries: number[]
): string[] {
  const lines: string[] = [`# HELP ${name} ${help}`, `# TYPE ${name} histogram`];
  for (let i = 0; i < boundaries.length; i++) {
    lines.push(`${name}_bucket{le="${boundaries[i]}"} ${hist.buckets[i]}`);
  }
  lines.push(`${name}_bucket{le="+Inf"} ${hist.buckets[hist.buckets.length - 1]}`);
  lines.push(`${name}_sum ${hist.sum}`);
  lines.push(`${name}_count ${hist.count}`);
  return lines;
}

/** Render Prometheus-format text for inclusion in /api/metrics. */
export function renderRagMetrics(): string[] {
  const lines: string[] = [];

  lines.push('# HELP rag_retrievals_total RAG retrievals by corpus, intent, strategy, outcome');
  lines.push('# TYPE rag_retrievals_total counter');
  for (const [key, value] of state.retrievals) {
    const [corpus, intent, strategy, outcome] = key.split('|');
    lines.push(
      `rag_retrievals_total{corpus="${corpus}",intent="${intent}",strategy="${strategy}",outcome="${outcome}"} ${value}`
    );
  }

  lines.push('# HELP rag_documents_returned_total Documents returned to callers, by corpus');
  lines.push('# TYPE rag_documents_returned_total counter');
  for (const [corpus, value] of state.documentsReturned) {
    lines.push(`rag_documents_returned_total{corpus="${corpus}"} ${value}`);
  }

  lines.push('# HELP rag_tokens_total Auxiliary LLM tokens spent on retrieval, by corpus');
  lines.push('# TYPE rag_tokens_total counter');
  for (const [corpus, value] of state.tokens) {
    lines.push(`rag_tokens_total{corpus="${corpus}"} ${value}`);
  }

  lines.push(
    ...renderHistogram(
      'rag_retrieval_latency_ms',
      'Histogram: wall clock per retrieve() (milliseconds)',
      state.latency,
      LATENCY_BUCKETS_MS
    )
  );
  lines.push(
    ...renderHistogram(
      'rag_retrieval_candidates',
      'Histogram: candidate documents before rerank/MMR/truncation',
      state.candidates,
      CANDIDATE_BUCKETS
    )
  );
  lines.push(
    ...renderHistogram(
      'rag_retrieval_top_score',
      'Histogram: top similarity score among returned documents (0..1)',
      state.topScore,
      SCORE_BUCKETS
    )
  );

  return lines;
}

/** Snapshot for tests / debug. Maps are converted to plain objects. */
export function snapshotRagMetrics() {
  return {
    retrievals: Object.fromEntries(state.retrievals),
    documentsReturned: Object.fromEntries(state.documentsReturned),
    tokens: Object.fromEntries(state.tokens),
    latency: { ...state.latency, buckets: [...state.latency.buckets] },
    candidates: { ...state.candidates, buckets: [...state.candidates.buckets] },
    topScore: { ...state.topScore, buckets: [...state.topScore.buckets] },
  };
}

/** Reset all counters / histograms — test-only. */
export function resetRagMetrics(): void {
  state = makeState();
}
