/**
 * AnA agentic tool loop — the orchestration core behind AnA's chat.
 *
 * Drives a bounded multi-round "reason → call tools → observe → continue" loop:
 * the model proposes tool calls, they are executed, the results are fed back,
 * and the model either chains another step (e.g. extract a document's structure,
 * then search it, then compare two versions) or produces a final grounded
 * answer. This is what lets AnA actually investigate a client document rather
 * than answer in a single shot.
 *
 * The loop is dependency-injected (the model call and tool execution are passed
 * in) so it is pure orchestration logic and fully unit-testable, independent of
 * the gateway, SSE transport, or the live tool registry.
 *
 * Safety properties (the moat is reliability):
 *   - bounded: never exceeds `maxRounds`; the final permitted round drops tools
 *     to force a text answer;
 *   - thrash-resistant: if the model repeats the same tool call (name + input)
 *     beyond `duplicateLimit`, tools are withdrawn to break the loop;
 *   - fault-tolerant: a failing tool returns an error result and the loop
 *     continues (the executor is expected to encode failures as results, not
 *     throw), so one bad tool never aborts the conversation.
 */

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultEntry {
  tool_use_id: string;
  name: string;
  content: string;
}

export interface ModelTurn {
  /** The assistant's narration for this turn (may be empty). */
  text: string;
  /** Tool calls the model wants executed; empty ⇒ the turn is a final answer. */
  toolCalls: ToolCall[];
}

export interface AgenticLoopDeps {
  /**
   * Execute a batch of tool calls for a round and return their results. The
   * route implementation streams transparency events as a side effect. Should
   * not throw for individual tool failures — encode them as result content.
   */
  executeTools: (calls: ToolCall[], round: number) => Promise<ToolResultEntry[]>;
  /**
   * Call the model with the latest tool results and the prior assistant text.
   * `includeTools` is false on the terminal round to force a text answer.
   * Returns the next model turn (its narration + any further tool calls).
   */
  callModel: (
    results: ToolResultEntry[],
    priorText: string,
    round: number,
    includeTools: boolean,
  ) => Promise<ModelTurn>;
}

export interface AgenticLoopOptions {
  /** Maximum tool rounds (default 5). */
  maxRounds?: number;
  /** Withdraw tools once the same (name+input) call recurs beyond this (default 2). */
  duplicateLimit?: number;
}

export type StoppedReason = 'no_more_tools' | 'max_rounds' | 'duplicate_thrash';

export interface AgenticLoopResult {
  /** Number of tool rounds executed. */
  rounds: number;
  /** Total tool calls executed across all rounds. */
  toolCallCount: number;
  stoppedReason: StoppedReason;
}

/** Stable key for a tool call so reordered input keys still compare equal. */
function callKey(call: ToolCall): string {
  const input = call.input ?? {};
  const keys = Object.keys(input).sort();
  const norm: Record<string, unknown> = {};
  for (const k of keys) norm[k] = (input as Record<string, unknown>)[k];
  return `${call.name}|${JSON.stringify(norm)}`;
}

/**
 * Run the bounded multi-round tool loop starting from the model's first turn.
 * Returns once the model produces an answer with no tool calls, the round cap is
 * hit, or the model is thrashing — always after a final answer has been
 * produced by `callModel`.
 */
export async function runAgenticToolLoop(
  initial: ModelTurn,
  deps: AgenticLoopDeps,
  options: AgenticLoopOptions = {},
): Promise<AgenticLoopResult> {
  const maxRounds = options.maxRounds ?? 5;
  const duplicateLimit = options.duplicateLimit ?? 2;
  if (maxRounds < 1) throw new Error('maxRounds must be at least 1');

  const seen = new Map<string, number>();
  let turn = initial;
  let round = 0;
  let toolCallCount = 0;

  while (turn.toolCalls.length > 0) {
    round++;

    // Thrash detection: count how often each exact call has been requested.
    let thrashing = false;
    for (const call of turn.toolCalls) {
      const key = callKey(call);
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      if (n > duplicateLimit) thrashing = true;
    }

    const results = await deps.executeTools(turn.toolCalls, round);
    toolCallCount += turn.toolCalls.length;

    const finalRound = round >= maxRounds;
    const includeTools = !finalRound && !thrashing;

    turn = await deps.callModel(results, turn.text, round, includeTools);

    if (!includeTools) {
      // Tools were withdrawn → this turn is the forced final answer; stop here
      // even if the model attempted (ignored) further tool calls.
      return { rounds: round, toolCallCount, stoppedReason: thrashing ? 'duplicate_thrash' : 'max_rounds' };
    }
  }

  return { rounds: round, toolCallCount, stoppedReason: 'no_more_tools' };
}

/**
 * Cap an oversized tool result before it is fed back to the model.
 *
 * Tools over real client documents can return very large payloads (a full
 * structure outline, hundreds of search hits). Sending them back verbatim each
 * round bloats the context window and cost and can derail the loop. This keeps
 * the head and tail with an explicit truncation marker, so the model still sees
 * the shape and the ends of the result while staying within budget. The full
 * result is unaffected for the UI — only what is sent to the model is capped.
 */
export function capToolResultForModel(content: string, maxChars = 8000): string {
  const limit = Math.max(maxChars, 200);
  if (content.length <= limit) return content;
  const head = Math.floor(limit * 0.7);
  const tail = Math.max(limit - head - 60, 0);
  const omitted = content.length - head - tail;
  return (
    content.slice(0, head) +
    `\n… [${omitted} characters truncated to fit the model context] …\n` +
    content.slice(content.length - tail)
  );
}

/**
 * Map a worker over items with bounded concurrency, preserving input order in
 * the results. Used to run a round's independent tool calls in parallel (e.g.
 * search PubMed and ClinicalTrials at once) instead of serially, while the
 * caller still streams results in a deterministic order.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency = 4,
): Promise<R[]> {
  if (concurrency < 1) throw new Error('concurrency must be at least 1');
  const results = new Array<R>(items.length);
  let next = 0;
  const run = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  };
  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, run);
  await Promise.all(lanes);
  return results;
}

export interface PlanStep {
  tool: string;
  /** Human-readable description of what this step does, for the UI. */
  label: string;
}

function quoteArg(value: unknown, max = 60): string {
  if (value === undefined || value === null || value === '') return 'it';
  const s = String(value);
  return `"${s.length > max ? s.slice(0, max) + '…' : s}"`;
}

function humanizeToolName(name: string): string {
  const words = name.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Friendly per-tool step labels for surfacing the investigation plan. */
const TOOL_LABELS: Record<string, (input: Record<string, unknown>) => string> = {
  extract_document_structure: () => 'Analyzing the document structure',
  search_document: i => `Searching the document for ${quoteArg(i.query)}`,
  compare_document_versions: () => 'Comparing the two document versions',
  search_clinical_evidence: i => `Searching clinical trials for ${quoteArg(i.query)}`,
  search_literature: i => `Searching the literature for ${quoteArg(i.query)}`,
  search_device_adverse_events: i => `Checking device adverse events for ${quoteArg(i.device ?? i.query)}`,
  search_drug_adverse_events: i => `Checking drug adverse events for ${quoteArg(i.drug ?? i.query)}`,
  lookup_fda_guidance: i => `Looking up FDA guidance${i.topic ? ` on ${quoteArg(i.topic)}` : ''}`,
  lookup_ich_guideline: i => `Looking up the ICH guideline${i.guideline ? ` ${quoteArg(i.guideline)}` : ''}`,
  check_regulatory_compliance: () => 'Checking regulatory compliance',
  mine_precedents: i => `Mining precedents${i.document_type ? ` for ${humanizeToolName(String(i.document_type))}` : ''}`,
  analyze_predicate_device: i => `Analyzing predicate device${i.predicate_510k_number ? ` ${quoteArg(i.predicate_510k_number)}` : ''}`,
  generate_document: () => 'Drafting the document',
  generate_statistical_document: () => 'Drafting the statistical document',
  compute_sample_size: () => 'Computing the sample size',
  compute_fih_dose: () => 'Computing the first-in-human dose',
  classify_tox_findings: () => 'Classifying the toxicology findings',
  select_exposure_response_dose: () => 'Selecting the dose from exposure-response',
  load_nonclinical_program: () => 'Loading the nonclinical studies for the program',
  get_nonclinical_template: () => 'Fetching the nonclinical document template',
  draft_nonclinical_overview_m2_4: () => 'Drafting the Module 2.4 nonclinical overview',
  draft_nonclinical_summaries_m2_6: () => 'Drafting the Module 2.6 nonclinical summaries',
  assess_nonclinical_program: () => 'Assessing the nonclinical study program',
  assess_nonclinical_safety: () => 'Assembling the integrated nonclinical safety assessment',
  assess_ind_filing_readiness: () => 'Assessing IND filing readiness across the modules',
  assess_concentration_qtc: () => 'Assessing the concentration-QTc relationship',
  assess_ddi_risk: () => 'Assessing drug-interaction risk',
  characterize_pk: () => 'Characterizing the pharmacokinetics',
  draft_clinical_summary_m2_7: () => 'Drafting the Module 2.7 clinical summary',
  check_numerical_integrity: () => 'Checking numerical integrity',
  check_dossier_consistency: () => 'Checking consistency across the dossier',
};

/**
 * Turn a round's tool calls into a human-readable plan for the UI to surface
 * (e.g. "Analyzing the document structure", "Searching the document for
 * \"indemnification\""). Deterministic; unknown tools fall back to a humanized
 * name so every step gets a sensible label.
 */
export function describeToolPlan(calls: ToolCall[]): PlanStep[] {
  return calls.map(c => {
    const labeler = TOOL_LABELS[c.name];
    const label = labeler ? labeler(c.input ?? {}) : humanizeToolName(c.name);
    return { tool: c.name, label };
  });
}
