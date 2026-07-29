/**
 * OpenTelemetry exporter for submission-chat metrics.
 *
 * Subscribes to onMetric() and translates each event into OTel
 * counters / histograms with low-cardinality labels. The submission-chat
 * pipeline emits structured metrics already (one JSON line per call); this
 * module is the bridge to the existing `@opentelemetry/api` instance the
 * rest of the server uses, so the new metrics show up alongside everything
 * else in your collector / Grafana / Honeycomb.
 *
 * Lifecycle mirrors initializeOpenTelemetry():
 *   - opt-in via OTEL_ENABLED (same gate as the trace SDK)
 *   - dynamic-imports `@opentelemetry/api` so this file has no hard dep
 *     when telemetry isn't installed
 *   - idempotent — calling start() twice is a no-op
 *   - stop() unsubscribes (used for test isolation / graceful shutdown)
 *
 * Cardinality discipline:
 *   - intent: enum (5 values) — safe label
 *   - retrievalStrategy: enum (4 values) — safe label
 *   - streaming: bool — safe label
 *   - signed / signatureRequired: bool — safe label
 *   - provider: enum (3 known values) — safe label
 *   - threadId / artifactId / proposalId: NOT used as labels — high
 *     cardinality blows up storage; they're already in the JSON-line log
 *     for trace correlation if you need them
 *
 * @module server/services/ana/submission-chat-otel-exporter
 */
import { onMetric } from './submission-chat-metrics.js';

let unsubscribe: (() => void) | null = null;

function isEnabled(): boolean {
  return ['1', 'true', 'yes', 'on'].includes(
    (process.env.OTEL_ENABLED || '').toLowerCase()
  );
}

/**
 * Start exporting submission-chat metrics to OTel. Idempotent. Returns true
 * if subscription was registered, false if skipped (disabled / already
 * running / OTel unavailable).
 */
export async function startSubmissionChatOtelExporter(): Promise<boolean> {
  if (unsubscribe) return false;
  if (!isEnabled()) return false;

  let api: any;
  try {
    const dynamicImport = new Function('m', 'return import(m)') as (
      m: string
    ) => Promise<any>;
    api = await dynamicImport('@opentelemetry/api');
  } catch (err: any) {
    console.warn(
      '[submission-chat-otel] @opentelemetry/api not installed — exporter skipped:',
      err?.message || err
    );
    return false;
  }

  let meter: any;
  try {
    meter = api.metrics.getMeter('submission-chat', '1.0.0');
  } catch (err: any) {
    console.warn(
      '[submission-chat-otel] meter creation failed — exporter skipped:',
      err?.message || err
    );
    return false;
  }

  // Per-call counters + latency / token / citation histograms.
  const turnCounter = meter.createCounter('submission_chat.turn.count', {
    description: 'Submission-chat calls (post-draft interrogations).',
  });
  const turnLatency = meter.createHistogram('submission_chat.turn.latency_ms', {
    description: 'End-to-end submission-chat call latency.',
    unit: 'ms',
  });
  const promptTokens = meter.createHistogram('submission_chat.turn.prompt_tokens', {
    description: 'Prompt token count per submission-chat call.',
  });
  const completionTokens = meter.createHistogram(
    'submission_chat.turn.completion_tokens',
    { description: 'Completion token count per submission-chat call.' }
  );
  const citationCount = meter.createHistogram(
    'submission_chat.turn.citation_count',
    { description: 'Number of distinct [SRC-n] citations surfaced per turn.' }
  );
  const supportsCount = meter.createCounter(
    'submission_chat.turn.citations.supports'
  );
  const contradictsCount = meter.createCounter(
    'submission_chat.turn.citations.contradicts'
  );
  const gapCount = meter.createCounter('submission_chat.turn.citations.gap');
  const chunksRetrieved = meter.createHistogram(
    'submission_chat.turn.chunks_retrieved',
    { description: 'RAG chunks reaching the prompt after rerank/MMR.' }
  );

  // Apply-rewrite metrics — one per governed mutation.
  const applyCounter = meter.createCounter('submission_chat.apply.count', {
    description: 'Governed rewrite applications.',
  });
  const applyLinesAdded = meter.createHistogram(
    'submission_chat.apply.lines_added',
    { description: 'Line additions per applied rewrite.' }
  );
  const applyLinesRemoved = meter.createHistogram(
    'submission_chat.apply.lines_removed',
    { description: 'Line removals per applied rewrite.' }
  );
  const applyUnsupportedRatio = meter.createHistogram(
    'submission_chat.apply.unsupported_ratio',
    {
      description:
        'Fraction of meaningful paragraphs without [SRC-n] citations (0..1).',
    }
  );

  unsubscribe = onMetric(metric => {
    try {
      if (metric.name === 'submission_chat.turn') {
        const labels = {
          intent: metric.intent,
          retrievalStrategy: metric.retrievalStrategy,
          streaming: String(metric.streaming),
          provider: metric.provider || 'unknown',
        };
        turnCounter.add(1, labels);
        turnLatency.record(metric.latencyMs, labels);
        promptTokens.record(metric.promptTokens, labels);
        completionTokens.record(metric.completionTokens, labels);
        citationCount.record(metric.citationCount, { intent: metric.intent });
        chunksRetrieved.record(metric.chunksRetrieved, {
          intent: metric.intent,
          retrievalStrategy: metric.retrievalStrategy,
        });
        if (metric.citationMix) {
          if (metric.citationMix.supports > 0)
            supportsCount.add(metric.citationMix.supports, {
              intent: metric.intent,
            });
          if (metric.citationMix.contradicts > 0)
            contradictsCount.add(metric.citationMix.contradicts, {
              intent: metric.intent,
            });
          if (metric.citationMix.gap > 0)
            gapCount.add(metric.citationMix.gap, { intent: metric.intent });
        }
      } else if (metric.name === 'submission_chat.apply') {
        const labels = {
          signed: String(metric.signed),
          signatureRequired: String(metric.signatureRequired),
          acknowledgeUnsupported: String(metric.acknowledgeUnsupported),
        };
        applyCounter.add(1, labels);
        applyLinesAdded.record(metric.linesAdded, labels);
        applyLinesRemoved.record(metric.linesRemoved, labels);
        applyUnsupportedRatio.record(metric.unsupportedRatio, labels);
      }
    } catch (err: any) {
      console.warn(
        '[submission-chat-otel] export failed for one metric:',
        err?.message || err
      );
    }
  });

  console.log('[submission-chat-otel] exporter registered');
  return true;
}

/** Stop exporting (used in tests / graceful shutdown). */
export function stopSubmissionChatOtelExporter(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
