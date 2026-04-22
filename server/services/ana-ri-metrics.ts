/**
 * AnA RI metrics — in-memory accumulators surfaced via /api/metrics.
 *
 * No external dependencies (matches the rest of /api/metrics, which hand-rolls
 * Prometheus text). Counters are monotonic since process start; histograms are
 * exposed as sum + count + bucket counts so PromQL can derive avg / p95.
 *
 * Recorded once per turn in the /stream and /chat handlers right after the
 * telemetry payload is assembled. Reads via renderMetrics() are O(1).
 *
 * @module server/services/ana-ri-metrics
 */

type LayerName = 'workingMemory' | 'clientMemory' | 'projectMemory';
type LayerOutcome = 'ok' | 'empty' | 'timeout' | 'error' | 'skipped';

const PHASE_BUCKETS_MS = [50, 100, 250, 500, 1000, 2000, 5000, 10_000, 30_000];
const SEMANTIC_BUCKETS_MS = [25, 50, 100, 250, 500, 1000, 2000, 3000];

interface Histogram {
  count: number;
  sum: number;
  /** Cumulative bucket counts aligned to the boundaries above + +Inf. */
  buckets: number[];
}

function makeHistogram(boundaries: number[]): Histogram {
  return {
    count: 0,
    sum: 0,
    buckets: new Array(boundaries.length + 1).fill(0),
  };
}

function observeHistogram(h: Histogram, boundaries: number[], value: number): void {
  if (!Number.isFinite(value) || value < 0) return;
  h.count += 1;
  h.sum += value;
  let placed = false;
  for (let i = 0; i < boundaries.length; i++) {
    if (value <= boundaries[i]) {
      for (let j = i; j < h.buckets.length; j++) h.buckets[j] += 1;
      placed = true;
      break;
    }
  }
  if (!placed) h.buckets[h.buckets.length - 1] += 1;
}

interface AnaRiMetricsState {
  turnsTotal: { stream: number; chat: number };
  cache: { hit: number; miss: number; unknown: number };
  thinkingEnabled: number;
  phaseHistograms: {
    orchestration: Histogram;
    context: Histogram;
    gateway: Histogram;
  };
  semanticSearchHistogram: Histogram;
  memoryLayerOutcomes: Record<LayerName, Record<LayerOutcome, number>>;
}

const state: AnaRiMetricsState = {
  turnsTotal: { stream: 0, chat: 0 },
  cache: { hit: 0, miss: 0, unknown: 0 },
  thinkingEnabled: 0,
  phaseHistograms: {
    orchestration: makeHistogram(PHASE_BUCKETS_MS),
    context: makeHistogram(PHASE_BUCKETS_MS),
    gateway: makeHistogram(PHASE_BUCKETS_MS),
  },
  semanticSearchHistogram: makeHistogram(SEMANTIC_BUCKETS_MS),
  memoryLayerOutcomes: {
    workingMemory: { ok: 0, empty: 0, timeout: 0, error: 0, skipped: 0 },
    clientMemory: { ok: 0, empty: 0, timeout: 0, error: 0, skipped: 0 },
    projectMemory: { ok: 0, empty: 0, timeout: 0, error: 0, skipped: 0 },
  },
};

export interface RecordTurnInput {
  route: 'stream' | 'chat';
  phases?: {
    orchestrationMs?: number;
    contextMs?: number;
    gatewayMs?: number;
  };
  cache?: {
    hit?: boolean | undefined;
  };
  memory?: {
    layerOutcomes?: Partial<Record<LayerName, LayerOutcome>>;
    semanticSearchMs?: number;
  };
  thinkingEnabled?: boolean;
}

/** Record a single AnA RI turn. Cheap; safe to call from a hot path. */
export function recordAnaTurn(input: RecordTurnInput): void {
  state.turnsTotal[input.route] += 1;

  if (input.cache?.hit === true) state.cache.hit += 1;
  else if (input.cache?.hit === false) state.cache.miss += 1;
  else state.cache.unknown += 1;

  if (input.thinkingEnabled) state.thinkingEnabled += 1;

  const p = input.phases || {};
  if (typeof p.orchestrationMs === 'number') {
    observeHistogram(state.phaseHistograms.orchestration, PHASE_BUCKETS_MS, p.orchestrationMs);
  }
  if (typeof p.contextMs === 'number') {
    observeHistogram(state.phaseHistograms.context, PHASE_BUCKETS_MS, p.contextMs);
  }
  if (typeof p.gatewayMs === 'number') {
    observeHistogram(state.phaseHistograms.gateway, PHASE_BUCKETS_MS, p.gatewayMs);
  }

  if (input.memory) {
    if (typeof input.memory.semanticSearchMs === 'number') {
      observeHistogram(
        state.semanticSearchHistogram,
        SEMANTIC_BUCKETS_MS,
        input.memory.semanticSearchMs
      );
    }
    const outcomes = input.memory.layerOutcomes || {};
    for (const layer of Object.keys(outcomes) as LayerName[]) {
      const outcome = outcomes[layer];
      if (outcome && state.memoryLayerOutcomes[layer]) {
        state.memoryLayerOutcomes[layer][outcome] =
          (state.memoryLayerOutcomes[layer][outcome] || 0) + 1;
      }
    }
  }
}

function renderHistogram(
  name: string,
  help: string,
  hist: Histogram,
  boundaries: number[]
): string[] {
  const lines: string[] = [
    `# HELP ${name}_ms Histogram: ${help} (milliseconds)`,
    `# TYPE ${name}_ms histogram`,
  ];
  for (let i = 0; i < boundaries.length; i++) {
    lines.push(`${name}_ms_bucket{le="${boundaries[i]}"} ${hist.buckets[i]}`);
  }
  lines.push(`${name}_ms_bucket{le="+Inf"} ${hist.buckets[hist.buckets.length - 1]}`);
  lines.push(`${name}_ms_sum ${hist.sum}`);
  lines.push(`${name}_ms_count ${hist.count}`);
  return lines;
}

/** Render Prometheus-format text for inclusion in /api/metrics. */
export function renderAnaRiMetrics(): string[] {
  const lines: string[] = [];

  lines.push('# HELP ana_ri_turns_total AnA RI turns served, by route');
  lines.push('# TYPE ana_ri_turns_total counter');
  lines.push(`ana_ri_turns_total{route="stream"} ${state.turnsTotal.stream}`);
  lines.push(`ana_ri_turns_total{route="chat"} ${state.turnsTotal.chat}`);

  lines.push('# HELP ana_ri_prompt_cache_total Prompt cache outcomes');
  lines.push('# TYPE ana_ri_prompt_cache_total counter');
  lines.push(`ana_ri_prompt_cache_total{result="hit"} ${state.cache.hit}`);
  lines.push(`ana_ri_prompt_cache_total{result="miss"} ${state.cache.miss}`);
  lines.push(`ana_ri_prompt_cache_total{result="unknown"} ${state.cache.unknown}`);

  lines.push('# HELP ana_ri_thinking_enabled_total Turns with extended thinking enabled');
  lines.push('# TYPE ana_ri_thinking_enabled_total counter');
  lines.push(`ana_ri_thinking_enabled_total ${state.thinkingEnabled}`);

  lines.push(
    ...renderHistogram(
      'ana_ri_orchestration',
      'Wall clock for orchestrate()',
      state.phaseHistograms.orchestration,
      PHASE_BUCKETS_MS
    )
  );
  lines.push(
    ...renderHistogram(
      'ana_ri_context_assembly',
      'Wall clock for intelligence + memory + enrichment Promise.all',
      state.phaseHistograms.context,
      PHASE_BUCKETS_MS
    )
  );
  lines.push(
    ...renderHistogram(
      'ana_ri_gateway',
      'Wall clock for gateway.route() (full streamed response)',
      state.phaseHistograms.gateway,
      PHASE_BUCKETS_MS
    )
  );
  lines.push(
    ...renderHistogram(
      'ana_ri_memory_semantic_search',
      'Wall clock for parallel client+project semantic search',
      state.semanticSearchHistogram,
      SEMANTIC_BUCKETS_MS
    )
  );

  lines.push('# HELP ana_ri_memory_layer_outcomes_total Per-layer outcome of memory assembly');
  lines.push('# TYPE ana_ri_memory_layer_outcomes_total counter');
  for (const layer of Object.keys(state.memoryLayerOutcomes) as LayerName[]) {
    for (const outcome of Object.keys(state.memoryLayerOutcomes[layer]) as LayerOutcome[]) {
      lines.push(
        `ana_ri_memory_layer_outcomes_total{layer="${layer}",outcome="${outcome}"} ${state.memoryLayerOutcomes[layer][outcome]}`
      );
    }
  }

  return lines;
}

/** Snapshot for tests / debug endpoints. */
export function snapshotAnaRiMetrics(): AnaRiMetricsState {
  return JSON.parse(JSON.stringify(state));
}

/** Reset all counters / histograms — test-only. */
export function resetAnaRiMetrics(): void {
  state.turnsTotal = { stream: 0, chat: 0 };
  state.cache = { hit: 0, miss: 0, unknown: 0 };
  state.thinkingEnabled = 0;
  state.phaseHistograms.orchestration = makeHistogram(PHASE_BUCKETS_MS);
  state.phaseHistograms.context = makeHistogram(PHASE_BUCKETS_MS);
  state.phaseHistograms.gateway = makeHistogram(PHASE_BUCKETS_MS);
  state.semanticSearchHistogram = makeHistogram(SEMANTIC_BUCKETS_MS);
  for (const layer of Object.keys(state.memoryLayerOutcomes) as LayerName[]) {
    state.memoryLayerOutcomes[layer] = {
      ok: 0,
      empty: 0,
      timeout: 0,
      error: 0,
      skipped: 0,
    };
  }
}
