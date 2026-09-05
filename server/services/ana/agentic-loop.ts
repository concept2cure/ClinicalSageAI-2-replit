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

import { stableStringify } from '../../../shared/canonical-json.js';

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

/**
 * Round-boundary control hook. Called once before each round begins with the
 * 1-based number of the round about to start. Returns `'continue'` to proceed
 * or `'abort'` to stop the loop cleanly between rounds. The caller owns any
 * pause (awaiting inside the hook) and interjection (side-effect: splicing a
 * steering message into the next model turn); the loop only needs to honor the
 * abort. Injected like the other deps so the loop stays pure and testable.
 */
export type LoopCheckpoint = (upcomingRound: number) => Promise<'continue' | 'abort'>;

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
  /**
   * Optional round-boundary control hook (pause / interject / cancel). When it
   * returns `'abort'` the loop stops before the round runs. Absent ⇒ the loop
   * runs uninterrupted exactly as before.
   */
  checkpoint?: LoopCheckpoint;
}

export interface AgenticLoopOptions {
  /** Maximum tool rounds (default 5). */
  maxRounds?: number;
  /** Withdraw tools once the same (name+input) call recurs beyond this (default 2). */
  duplicateLimit?: number;
  /**
   * Extra rounds the loop may grant beyond `maxRounds` while the model is still
   * making real progress. A round "makes progress" when it introduces at least
   * one novel tool call (a name+input never tried before); a grant is only made
   * at the ceiling, one round at a time, and never while thrashing. This turns
   * `maxRounds` from a hard guillotine into a soft ceiling: an investigation
   * that is still discovering new ground gets to finish, while a loop that is
   * circling gets cut exactly as before. Default 0 (behavior unchanged).
   */
  progressExtension?: number;
}

/**
 * Effort levels that scale AnA's agentic depth. Kept local (not imported from
 * the gateway) so this module stays pure orchestration logic, independent of
 * the gateway/types as the file docstring promises.
 */
export type LoopEffort = 'fast' | 'balanced' | 'thorough';

/** Effort → tool-round ceiling. Balanced lifts the old flat cap of 5 to 6. */
const MAX_ROUNDS_BY_EFFORT: Record<LoopEffort, number> = {
  fast: 4,
  balanced: 6,
  thorough: 10,
};

/**
 * Resolve the tool-round ceiling for a turn from its effort level.
 *
 * The loop stops the moment the model stops asking for tools, so this is a
 * *ceiling*, not a floor — raising it only lets genuinely deep investigations
 * (extract → search → cross-check → reconcile → draft) run to completion instead
 * of being cut off mid-chain at round 5. Fast trades a little depth for latency;
 * Thorough lets her chase a multi-tool investigation all the way down. Pure;
 * an unknown/absent effort resolves to the Balanced ceiling.
 */
export function resolveMaxRounds(effort?: LoopEffort | string | null): number {
  return MAX_ROUNDS_BY_EFFORT[(effort as LoopEffort)] ?? MAX_ROUNDS_BY_EFFORT.balanced;
}

/** Effort → progress-earned rounds allowed beyond the ceiling (see progressExtension). */
const ROUND_EXTENSION_BY_EFFORT: Record<LoopEffort, number> = {
  fast: 0,
  balanced: 2,
  thorough: 4,
};

/**
 * Resolve how many progress-earned extension rounds a turn's effort allows.
 * Fast never extends (latency is the promise); Thorough may chase a genuinely
 * productive investigation four rounds past the ceiling. Pure; unknown/absent
 * effort resolves to the Balanced allowance.
 */
export function resolveRoundExtension(effort?: LoopEffort | string | null): number {
  return ROUND_EXTENSION_BY_EFFORT[(effort as LoopEffort)] ?? ROUND_EXTENSION_BY_EFFORT.balanced;
}

export type StoppedReason =
  | 'no_more_tools'
  | 'max_rounds'
  | 'duplicate_thrash'
  | 'cancelled';

export interface AgenticLoopResult {
  /** Number of tool rounds executed. */
  rounds: number;
  /** Total tool calls executed across all rounds. */
  toolCallCount: number;
  stoppedReason: StoppedReason;
  /** Progress-earned rounds granted beyond maxRounds (0 unless progressExtension was set). */
  extendedRounds: number;
}

/**
 * Stable key for a tool call so reordered input keys still compare equal.
 * In-process dedup only — never persisted, so it uses the shared canonicalizer
 * directly with no version concern (docs/CANONICALIZATION_MIGRATION_2026-08.md).
 */
function callKey(call: ToolCall): string {
  return `${call.name}|${stableStringify(call.input ?? {})}`;
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
  const progressExtension = Math.max(0, options.progressExtension ?? 0);
  if (maxRounds < 1) throw new Error('maxRounds must be at least 1');

  const seen = new Map<string, number>();
  let turn = initial;
  let round = 0;
  let toolCallCount = 0;
  let extendedRounds = 0;

  while (turn.toolCalls.length > 0) {
    // Round-boundary control: the human can pause (the hook awaits), interject a
    // steer (side-effect, spliced into the next model turn by the caller), or
    // cancel. On cancel we stop cleanly here, before spending the round — the
    // final answer the model already streamed for the prior turn stands.
    if (deps.checkpoint) {
      const directive = await deps.checkpoint(round + 1);
      if (directive === 'abort') {
        return { rounds: round, toolCallCount, stoppedReason: 'cancelled', extendedRounds };
      }
    }

    round++;

    // Thrash detection (count how often each exact call recurs) and novelty
    // detection (did this round try anything genuinely new?) share one pass.
    let thrashing = false;
    let novelInRound = false;
    for (const call of turn.toolCalls) {
      const key = callKey(call);
      const n = (seen.get(key) ?? 0) + 1;
      if (n === 1) novelInRound = true;
      seen.set(key, n);
      if (n > duplicateLimit) thrashing = true;
    }

    const results = await deps.executeTools(turn.toolCalls, round);
    toolCallCount += turn.toolCalls.length;

    // Progress-earned extension: at the ceiling, a round that tried novel work
    // (and isn't thrashing) earns one more round, up to progressExtension. A
    // repeating or thrashing loop never extends — it is cut exactly as before.
    if (
      round >= maxRounds + extendedRounds &&
      novelInRound &&
      !thrashing &&
      extendedRounds < progressExtension
    ) {
      extendedRounds++;
    }

    const finalRound = round >= maxRounds + extendedRounds;
    const includeTools = !finalRound && !thrashing;

    turn = await deps.callModel(results, turn.text, round, includeTools);

    if (!includeTools) {
      // Tools were withdrawn → this turn is the forced final answer; stop here
      // even if the model attempted (ignored) further tool calls.
      return {
        rounds: round,
        toolCallCount,
        stoppedReason: thrashing ? 'duplicate_thrash' : 'max_rounds',
        extendedRounds,
      };
    }
  }

  return { rounds: round, toolCallCount, stoppedReason: 'no_more_tools', extendedRounds };
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

export interface ToolResultBudgetOptions {
  /** Total character budget for one round's results fed to the model (default 24000). */
  totalBudget?: number;
  /** Per-result ceiling, matching the classic single-result cap (default 8000). */
  perResultMax?: number;
  /** Floor below which a result's share is never squeezed (default 1500). */
  minPerResult?: number;
}

/**
 * Budget a whole round's tool results before they are fed back to the model.
 *
 * The classic per-result cap (8k) was written for 1–3 tool rounds; with deeper
 * effort-scaled loops a single round can run many tools, and per-result caps
 * alone let one round inject 30k+ chars — bloating every later round (the loop
 * history carries all prior results). This keeps the round inside a total
 * budget: when the per-result-capped sizes already fit, results pass through
 * byte-identical to today; when they don't, the budget is split evenly across
 * the round's results (never below `minPerResult`, so a squeezed result still
 * shows its head and tail).
 *
 * Callers that also ground the final answer against a tool-evidence corpus MUST
 * feed the corpus these budgeted strings — the grounding contract is that the
 * corpus contains exactly what the model saw, no more.
 */
export function budgetToolResultsForModel(
  entries: ToolResultEntry[],
  options: ToolResultBudgetOptions = {},
): ToolResultEntry[] {
  const perResultMax = options.perResultMax ?? 8000;
  const totalBudget = options.totalBudget ?? 24000;
  const minPerResult = options.minPerResult ?? 1500;
  if (entries.length === 0) return entries;

  const capped = entries.map(e => ({ ...e, content: capToolResultForModel(e.content, perResultMax) }));
  const total = capped.reduce((sum, e) => sum + e.content.length, 0);
  if (total <= totalBudget) return capped;

  const share = Math.max(minPerResult, Math.floor(totalBudget / entries.length));
  return entries.map(e => ({ ...e, content: capToolResultForModel(e.content, share) }));
}

export interface FailedToolCall {
  name: string;
  /** Human-readable step label, when the caller has one. */
  label?: string;
  /** Short error description; truncated defensively in the note. */
  error?: string;
}

/**
 * Build a compact adaptation note for the model after a round with failures.
 *
 * Without this, the model sees per-tool error payloads but no cross-round
 * guidance, and the common failure mode is retrying the identical call (which
 * the thrash guard then kills — ending the investigation instead of adapting
 * it). One explicit note turns a dead end into a course correction. Returns ''
 * when nothing failed so callers can append unconditionally.
 */
export function buildAdaptationNote(failures: FailedToolCall[], totalCalls: number): string {
  if (failures.length === 0) return '';
  const describe = (f: FailedToolCall): string => {
    const who = f.label || humanizeToolName(f.name);
    const why = f.error ? ` — ${f.error.length > 120 ? f.error.slice(0, 120) + '…' : f.error}` : '';
    return `${who}${why}`;
  };
  const plural = totalCalls === 1 ? 'call' : 'calls';
  return (
    `[Adaptation note] ${failures.length} of ${totalCalls} tool ${plural} failed this round: ` +
    `${failures.map(describe).join('; ')}. Do not repeat a failed call verbatim — adapt: ` +
    `narrow or vary the input, try an alternative tool, or continue and state plainly what ` +
    `could not be verified.`
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
  get_csr_template: () => 'Fetching the Module 5 clinical study report template',
  draft_nonclinical_overview_m2_4: () => 'Drafting the Module 2.4 nonclinical overview',
  draft_nonclinical_summaries_m2_6: () => 'Drafting the Module 2.6 nonclinical summaries',
  draft_quality_overall_summary_m2_3: () => 'Drafting the Module 2.3 Quality Overall Summary',
  list_platform_commands: () => 'Listing the platform command surface',
  execute_platform_command: (i: Record<string, unknown>) => `Executing platform command: ${typeof i?.command === 'string' ? i.command : '…'}`,
  assess_nonclinical_program: () => 'Assessing the nonclinical study program',
  assess_nonclinical_safety: () => 'Assembling the integrated nonclinical safety assessment',
  assess_concentration_qtc: () => 'Assessing the concentration-QTc relationship',
  assess_ddi_risk: () => 'Assessing drug-interaction risk',
  characterize_pk: () => 'Characterizing the pharmacokinetics',
  draft_clinical_summary_m2_7: () => 'Drafting the Module 2.7 clinical summary',
  check_numerical_integrity: () => 'Checking numerical integrity',
  check_dossier_consistency: () => 'Checking consistency across the dossier',
  check_consistency: () => 'Checking consistency across the dossier',
  // Proactive / situational-awareness tools
  regulatory_deadline_radar: () => 'Scanning regulatory deadlines',
  scan_project_risks: () => 'Scanning open project risks',
  get_session_briefing: () => 'Reconciling where your program stands',
  // Evidence-discipline self-checks
  detect_evidence_contradictions: () => 'Checking the evidence for contradictions',
  detect_evidence_gaps: () => 'Checking the evidence for coverage gaps',
  assess_claim_evidence_integrity: () => 'Checking that claims are backed by evidence',
  assess_output_confidence: () => 'Assessing how confident this answer can be',
  ana_tool_pedigree: () => 'Checking how reliable a tool’s output is',
  // Submission diligence
  lookup_submission_deficiencies: i =>
    `Looking up likely submission deficiencies${i.submission_type ? ` for ${humanizeToolName(String(i.submission_type))}` : ''}`,
  scan_regulatory_deficiencies: () => 'Scanning for likely reviewer deficiencies',
  compare_submission_against_precedent: () => 'Comparing the submission against precedent',
  lookup_regulatory_precedents: i => `Looking up regulatory precedents${i.topic ? ` on ${quoteArg(i.topic)}` : ''}`,
  compile_correspondence_response_package: () => 'Compiling the correspondence response package',
  // Document authoring — the human should see WHAT is being drafted, calmly.
  draft_clinical_overview_m2_5: () => 'Drafting the Module 2.5 Clinical Overview',
  batch_draft_sections: i => {
    const n = Array.isArray(i.sections) ? i.sections.length : 0;
    return n > 0 ? `Drafting ${n} section${n === 1 ? '' : 's'} in parallel` : 'Drafting sections in parallel';
  },
  draft_fda_ir_response: () => 'Drafting the FDA Information Request response',
  convene_drafting_council: i =>
    `Convening the drafting council${i.section_path ? ` for ${quoteArg(i.section_path)}` : ''} — draft, verify, critique, synthesize`,
  start_deep_investigation: i =>
    `Starting a background deep investigation${i.question ? ` — ${quoteArg(i.question)}` : ''}`,
  check_deep_investigation: () => 'Checking on the background investigation',
  get_client_journey: () => 'Getting your bearings — from license to submission',
  // Project-folder catalog — legible "she knows the files and is studying them".
  list_project_documents: () => 'Checking the project folder',
  read_project_document: i =>
    typeof i.offset === 'number' && i.offset > 0
      ? 'Reading the document — continuing where it left off'
      : 'Reading the document in full',
  catalog_project_document: () => 'Recording what this document is',
  // Document vault / governed reads — legible "she's reading the right thing".
  list_vault_documents: () => 'Listing the document vault',
  read_vault_document: () => 'Reading the vault document',
  get_document_versions: () => 'Reviewing the document version history',
  list_governed_documents: () => 'Listing the governed documents',
  read_governed_document: () => 'Reading the governed document',
  save_document_to_vault: () => 'Saving the document to the vault',
  update_vault_document: () => 'Updating the vault document',
  compare_vault_versions: () => 'Comparing the document versions',
  // eTMF / inspection readiness (CRO).
  get_tmf_view: () => 'Opening the Trial Master File',
  seed_tmf: () => 'Setting up the Trial Master File structure',
  // Reporting & analytics canvas.
  generate_report: i => (i.report_type_id ? `Generating the ${quoteArg(i.report_type_id)} report` : 'Generating the report'),
  suggest_reports: () => 'Finding the reports that fit your programs',
  explain_report_blockers: () => 'Explaining what is blocking this report',
  save_report_definition: () => 'Saving the dashboard',
  list_report_definitions: () => 'Listing your saved dashboards',
  list_report_types: () => 'Listing the available reports',
  get_portfolio_readiness: () => 'Assessing portfolio readiness',
  search_connected_repositories: i => `Searching your connected repositories${i.query ? ` for ${quoteArg(i.query)}` : ''}`,
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
