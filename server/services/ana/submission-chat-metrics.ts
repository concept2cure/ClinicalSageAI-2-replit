/**
 * Submission-chat metrics emission.
 *
 * Lightweight structured emission for the submission-chat pipeline. Each call
 * writes one JSON line to stdout under the conventional `metric:` prefix that
 * the existing observability ingest picks up, AND fans out to any listeners
 * registered via onMetric() — so a Prometheus/OTel exporter can subscribe
 * without this module taking a hard dependency on either.
 *
 * Two metric families:
 *   - submission_chat.turn — one per chat call (intent, retrieval strategy,
 *     hits, latency, claim status counts, proposal id).
 *   - submission_chat.apply — one per applied rewrite (version delta,
 *     verification flags, signed-or-not, diff magnitude).
 *
 * Pure side-effect by design. Failures inside emit() are swallowed so the
 * chat path never breaks because of metrics.
 *
 * @module server/services/ana/submission-chat-metrics
 */

export type SubmissionChatMetricName =
  | 'submission_chat.turn'
  | 'submission_chat.apply';

export interface SubmissionChatTurnMetric {
  name: 'submission_chat.turn';
  threadId: string;
  artifactId: string;
  projectId: number;
  organizationId: number;
  intent: string;
  retrievalStrategy: 'advanced' | 'basic' | 'failed' | 'short_circuit';
  artifactsInScope: number;
  chunksRetrieved: number;
  historyMessages: number;
  priorCitations: number;
  citationCount: number;
  citationMix: { supports: number; contradicts: number; gap: number };
  rewriteEmitted: boolean;
  proposalId: string | null;
  claimStatusCounts:
    | { supported: number; weak: number; unsupported: number }
    | null;
  streaming: boolean;
  model: string;
  provider: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
}

export interface SubmissionChatApplyMetric {
  name: 'submission_chat.apply';
  artifactId: string;
  projectId: number | null;
  organizationId: number;
  threadId: string | null;
  proposalId: string | null;
  previousVersion: number;
  newVersion: number;
  signed: boolean;
  signatureRequired: boolean;
  acknowledgeUnsupported: boolean;
  unsupportedRatio: number;
  linesAdded: number;
  linesRemoved: number;
  linesUnchanged: number;
  hasContradictionsAddressed: boolean;
}

export type SubmissionChatMetric =
  | SubmissionChatTurnMetric
  | SubmissionChatApplyMetric;

export type MetricListener = (metric: SubmissionChatMetric) => void;

const listeners = new Set<MetricListener>();

/**
 * Subscribe to submission-chat metrics. Returns an unsubscribe function.
 * A Prometheus/OTel exporter would register here without this module needing
 * to know about either.
 */
export function onMetric(listener: MetricListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Emit a metric. Always writes a JSON line via console.log under `metric:`
 * so log aggregators pick it up; also fans out to subscribed listeners.
 * Never throws — listener failures are logged and swallowed.
 */
export function emit(metric: SubmissionChatMetric): void {
  try {
    console.log(`metric: ${JSON.stringify({ ...metric, ts: Date.now() })}`);
  } catch {
    // Stringification only fails on circular refs — our metrics are flat.
  }
  for (const listener of listeners) {
    try {
      listener(metric);
    } catch (err: any) {
      console.warn(
        '[submission-chat metrics] listener failed:',
        err?.message || err
      );
    }
  }
}

/**
 * Helper: count citations by relationship for a turn metric. Lets handler
 * code compute the citation mix without re-implementing this in two places.
 */
export function countCitationMix(
  citations: Array<{ relationship: 'supports' | 'contradicts' | 'gap' }>
): { supports: number; contradicts: number; gap: number } {
  const counts = { supports: 0, contradicts: 0, gap: 0 };
  for (const c of citations) counts[c.relationship] += 1;
  return counts;
}
