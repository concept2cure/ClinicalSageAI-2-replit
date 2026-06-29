/**
 * Submission Orchestrator metrics — in-memory accumulators surfaced via
 * /api/metrics. Mirrors the hand-rolled Prometheus pattern in
 * ana-ri-metrics.ts, coverage-metrics.ts, cs-metrics.ts etc. (no external
 * Prometheus client lib — matches the rest of the metrics surface).
 *
 * Recorded at five orchestrator lifecycle points:
 *   - runStarted (recordOrchestratorRunStarted)
 *   - stepCompleted (recordOrchestratorStepCompleted) — emits a duration sample
 *   - stepFailed (recordOrchestratorStepFailed) — with error_code label
 *   - runCompleted (recordOrchestratorRunCompleted) — overall run duration
 *   - gatewayReady (recordOrchestratorGatewayReady) — pass/fail counter
 *
 * Label cardinality is bounded:
 *   - submission_type ∈ {IND, NDA, BLA, 510k, PMA, DeNovo, MAA} — 7 values
 *   - region ∈ {US, EU, JP, CA, UK, CN, AU, CH, BR, IN, KR, SG, GLOBAL} — 13
 *   - step ∈ the ORDERED_STEPS set (~14 keys) — bounded
 *   - error_code ∈ a small set per audit; unknowns bucket to 'unknown' so a
 *     novel exception class can't explode cardinality
 *   - organization_id is NOT a label (would explode cardinality with multi-
 *     tenant fleet) — track per-org in the application logs / DB, not here
 *
 * Read via renderSubmissionOrchestratorMetrics() in O(1).
 *
 * @module server/services/submission-orchestrator-metrics
 */

const RUN_DURATION_BUCKETS_MS = [
  100, 500, 1_000, 5_000, 15_000, 60_000, 300_000, 900_000, 3_600_000,
];
const STEP_DURATION_BUCKETS_MS = [
  10, 50, 100, 500, 1_000, 5_000, 15_000, 60_000, 300_000,
];

/** Closed enum for region label values; unknown regions collapse to 'unknown'. */
const KNOWN_REGIONS = new Set([
  'US', 'EU', 'JP', 'CA', 'UK', 'CN', 'AU', 'CH', 'BR', 'IN', 'KR', 'SG', 'GLOBAL',
]);

/** Closed enum for submission_type label; unknowns collapse to 'unknown'. */
const KNOWN_SUBMISSION_TYPES = new Set([
  'IND', 'NDA', 'BLA', '510k', 'PMA', 'DeNovo', 'MAA',
]);

/** Known error codes that step failures bucket into; novel codes → 'unknown'. */
const KNOWN_ERROR_CODES = new Set([
  'validation_failed',
  'tenant_isolation_violation',
  'db_query_failed',
  'ai_gateway_error',
  'ai_hallucination_guard',
  'gateway_not_ready',
  'sequence_query_failed',
  'unknown',
]);

interface Histogram {
  count: number;
  sum: number;
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

interface OrchestratorMetricsState {
  /** Total runs started, by (submission_type, region). */
  runsStartedTotal: Map<string, number>;
  /** Total runs that ended `complete`, by (submission_type, region). */
  runsCompletedTotal: Map<string, number>;
  /** Total runs that ended `failed`, by (submission_type, region). */
  runsFailedTotal: Map<string, number>;
  /** Per-step duration histograms keyed by step name. */
  stepDurationByName: Map<string, Histogram>;
  /** Overall run duration histogram. */
  runDuration: Histogram;
  /** Step failure counter keyed by (step, error_code). */
  stepFailedTotal: Map<string, number>;
  /** gatewayReady true/false counter. */
  gatewayReadyTotal: { ready: number; not_ready: number };
  /** SEQ_QUERY_FAILED specific counter — surfaced separately so Alertmanager
   *  can fire on the rate independently of other gateway-not-ready causes. */
  sequenceQueryFailedTotal: number;
}

const state: OrchestratorMetricsState = {
  runsStartedTotal: new Map(),
  runsCompletedTotal: new Map(),
  runsFailedTotal: new Map(),
  stepDurationByName: new Map(),
  runDuration: makeHistogram(RUN_DURATION_BUCKETS_MS),
  stepFailedTotal: new Map(),
  gatewayReadyTotal: { ready: 0, not_ready: 0 },
  sequenceQueryFailedTotal: 0,
};

function normalizeRegion(region: string | undefined | null): string {
  if (!region) return 'unknown';
  const upper = region.toUpperCase();
  return KNOWN_REGIONS.has(upper) ? upper : 'unknown';
}

function normalizeSubmissionType(submissionType: string | undefined | null): string {
  if (!submissionType) return 'unknown';
  return KNOWN_SUBMISSION_TYPES.has(submissionType) ? submissionType : 'unknown';
}

function normalizeErrorCode(code: string | undefined | null): string {
  if (!code) return 'unknown';
  return KNOWN_ERROR_CODES.has(code) ? code : 'unknown';
}

function bumpMap(m: Map<string, number>, key: string, by = 1): void {
  m.set(key, (m.get(key) ?? 0) + by);
}

/** Called when runOrchestrator enters the first step of a new run. */
export function recordOrchestratorRunStarted(input: {
  submissionType: string | undefined | null;
  region: string | undefined | null;
}): void {
  const key = `${normalizeSubmissionType(input.submissionType)}|${normalizeRegion(input.region)}`;
  bumpMap(state.runsStartedTotal, key);
}

/** Called when a step transitions to `complete`. durationMs is the step's
 *  wall-clock time (started_at → completed_at). */
export function recordOrchestratorStepCompleted(input: {
  step: string;
  durationMs: number;
}): void {
  const histogram = state.stepDurationByName.get(input.step) ?? makeHistogram(STEP_DURATION_BUCKETS_MS);
  observeHistogram(histogram, STEP_DURATION_BUCKETS_MS, input.durationMs);
  state.stepDurationByName.set(input.step, histogram);
}

/** Called when a step transitions to `failed`. error_code is bucketed into
 *  the KNOWN_ERROR_CODES set; novel codes collapse to 'unknown' to bound
 *  label cardinality. */
export function recordOrchestratorStepFailed(input: {
  step: string;
  errorCode: string | undefined | null;
}): void {
  const key = `${input.step}|${normalizeErrorCode(input.errorCode)}`;
  bumpMap(state.stepFailedTotal, key);
}

/** Called when runOrchestrator transitions the run to `complete` or `failed`.
 *  durationMs is the run's total wall-clock time. */
export function recordOrchestratorRunCompleted(input: {
  submissionType: string | undefined | null;
  region: string | undefined | null;
  status: 'complete' | 'failed' | 'partial';
  durationMs: number;
}): void {
  const key = `${normalizeSubmissionType(input.submissionType)}|${normalizeRegion(input.region)}`;
  if (input.status === 'complete') {
    bumpMap(state.runsCompletedTotal, key);
  } else {
    bumpMap(state.runsFailedTotal, key);
  }
  observeHistogram(state.runDuration, RUN_DURATION_BUCKETS_MS, input.durationMs);
}

/** Called after validateEctdPackageHardened returns. ready === gatewayReady. */
export function recordOrchestratorGatewayReady(input: { ready: boolean }): void {
  if (input.ready) state.gatewayReadyTotal.ready += 1;
  else state.gatewayReadyTotal.not_ready += 1;
}

/** Called when detectSequenceGaps emits a SEQ_QUERY_FAILED finding (DB outage).
 *  Surfaced as a dedicated counter so Alertmanager can fire on the rate
 *  independently of other gateway-not-ready causes. */
export function recordOrchestratorSequenceQueryFailed(): void {
  state.sequenceQueryFailedTotal += 1;
}

function renderHistogram(
  name: string,
  help: string,
  hist: Histogram,
  boundaries: number[],
  extraLabels = '',
): string[] {
  const lines: string[] = [];
  lines.push(`# HELP ${name}_ms ${help}`);
  lines.push(`# TYPE ${name}_ms histogram`);
  const labelPrefix = extraLabels ? `${extraLabels},` : '';
  for (let i = 0; i < boundaries.length; i++) {
    lines.push(`${name}_ms_bucket{${labelPrefix}le="${boundaries[i]}"} ${hist.buckets[i]}`);
  }
  lines.push(`${name}_ms_bucket{${labelPrefix}le="+Inf"} ${hist.buckets[hist.buckets.length - 1]}`);
  lines.push(`${name}_ms_sum${extraLabels ? `{${extraLabels}}` : ''} ${hist.sum}`);
  lines.push(`${name}_ms_count${extraLabels ? `{${extraLabels}}` : ''} ${hist.count}`);
  return lines;
}

/** Render Prometheus-format text for inclusion in /api/metrics. */
export function renderSubmissionOrchestratorMetrics(): string[] {
  const lines: string[] = [];

  lines.push('# HELP submission_orchestrator_runs_started_total Runs started by submission type and region');
  lines.push('# TYPE submission_orchestrator_runs_started_total counter');
  for (const [key, value] of state.runsStartedTotal.entries()) {
    const [submissionType, region] = key.split('|');
    lines.push(
      `submission_orchestrator_runs_started_total{submission_type="${submissionType}",region="${region}"} ${value}`,
    );
  }

  lines.push('# HELP submission_orchestrator_runs_completed_total Runs that ended in complete status');
  lines.push('# TYPE submission_orchestrator_runs_completed_total counter');
  for (const [key, value] of state.runsCompletedTotal.entries()) {
    const [submissionType, region] = key.split('|');
    lines.push(
      `submission_orchestrator_runs_completed_total{submission_type="${submissionType}",region="${region}"} ${value}`,
    );
  }

  lines.push('# HELP submission_orchestrator_runs_failed_total Runs that ended in failed/partial status');
  lines.push('# TYPE submission_orchestrator_runs_failed_total counter');
  for (const [key, value] of state.runsFailedTotal.entries()) {
    const [submissionType, region] = key.split('|');
    lines.push(
      `submission_orchestrator_runs_failed_total{submission_type="${submissionType}",region="${region}"} ${value}`,
    );
  }

  lines.push('# HELP submission_orchestrator_step_failed_total Step transitions to failed by step and error_code');
  lines.push('# TYPE submission_orchestrator_step_failed_total counter');
  for (const [key, value] of state.stepFailedTotal.entries()) {
    const [step, errorCode] = key.split('|');
    lines.push(
      `submission_orchestrator_step_failed_total{step="${step}",error_code="${errorCode}"} ${value}`,
    );
  }

  for (const [step, histogram] of state.stepDurationByName.entries()) {
    lines.push(
      ...renderHistogram(
        'submission_orchestrator_step_duration',
        `Step wall-clock for "${step}"`,
        histogram,
        STEP_DURATION_BUCKETS_MS,
        `step="${step}"`,
      ),
    );
  }

  lines.push(
    ...renderHistogram(
      'submission_orchestrator_run_duration',
      'Overall orchestrator run wall-clock',
      state.runDuration,
      RUN_DURATION_BUCKETS_MS,
    ),
  );

  lines.push('# HELP submission_orchestrator_gateway_ready_total validateEctdPackageHardened outcomes');
  lines.push('# TYPE submission_orchestrator_gateway_ready_total counter');
  lines.push(`submission_orchestrator_gateway_ready_total{ready="true"} ${state.gatewayReadyTotal.ready}`);
  lines.push(`submission_orchestrator_gateway_ready_total{ready="false"} ${state.gatewayReadyTotal.not_ready}`);

  lines.push('# HELP submission_orchestrator_sequence_query_failed_total SEQ_QUERY_FAILED findings (DB outage on sequence-history check)');
  lines.push('# TYPE submission_orchestrator_sequence_query_failed_total counter');
  lines.push(`submission_orchestrator_sequence_query_failed_total ${state.sequenceQueryFailedTotal}`);

  return lines;
}

/** Snapshot for tests / debug endpoints. */
export function snapshotSubmissionOrchestratorMetrics(): OrchestratorMetricsState {
  return {
    runsStartedTotal: new Map(state.runsStartedTotal),
    runsCompletedTotal: new Map(state.runsCompletedTotal),
    runsFailedTotal: new Map(state.runsFailedTotal),
    stepDurationByName: new Map(
      Array.from(state.stepDurationByName.entries()).map(([k, v]) => [k, { ...v, buckets: [...v.buckets] }]),
    ),
    runDuration: { ...state.runDuration, buckets: [...state.runDuration.buckets] },
    stepFailedTotal: new Map(state.stepFailedTotal),
    gatewayReadyTotal: { ...state.gatewayReadyTotal },
    sequenceQueryFailedTotal: state.sequenceQueryFailedTotal,
  };
}

/** Reset all counters / histograms — test-only. */
export function resetSubmissionOrchestratorMetrics(): void {
  state.runsStartedTotal.clear();
  state.runsCompletedTotal.clear();
  state.runsFailedTotal.clear();
  state.stepDurationByName.clear();
  state.runDuration = makeHistogram(RUN_DURATION_BUCKETS_MS);
  state.stepFailedTotal.clear();
  state.gatewayReadyTotal = { ready: 0, not_ready: 0 };
  state.sequenceQueryFailedTotal = 0;
}
