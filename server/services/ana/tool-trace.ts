/**
 * AnA tool-trace memory.
 *
 * A structured record of the tools AnA ran during a turn and what they returned,
 * so the work persists across turns. The trace is:
 *   - stored hidden in the assistant message's metadata (never in the visible
 *     answer);
 *   - surfaced live to the client via step/plan events, and reconstructable for
 *     past turns from the stored metadata;
 *   - summarized back into AnA's context on the next turn so she remembers what
 *     she already did (and does not redundantly repeat it).
 *
 * This module is the pure core: building trace entries, summarizing a tool
 * result to one line, collecting traces from prior history, and formatting the
 * continuity note. The DB persistence and route wiring live elsewhere.
 */

import { isTruncated } from '../ai-gateway/finish-reason.js';
import { parseRunPolicy, type AnaRunPolicy, type HumanControlEvent, type PolicyHold, type TurnStoppedReason } from './run-status.js';
import { AUTO_TIME_WORDS, PAUSE_WORDS, isPolicyHoldOutcome, stepLabels } from '@shared/ana/run-policy';
import type { TurnPlanStep } from './turn-plan.js';

export interface ToolTraceEntry {
  tool: string;
  /** Human-readable step label (from describeToolPlan). */
  label: string;
  /** 'cancelled' — the person stopped the run before this step finished. */
  status: 'success' | 'error' | 'not_found' | 'cancelled';
  /** One-line summary of the tool's result. */
  resultSummary: string;
}

function truncate(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

/**
 * The refusal a handler returned instead of throwing: a JSON object whose own
 * top-level `error` is a non-empty string. Handlers across the tool set say "I
 * could not do this" that way (`{ error: 'needs an open project …' }`), and a
 * step that did not happen must not be reported — or drawn with a check mark —
 * as one that did. Anything else, including a non-JSON result, is null.
 */
export function refusalOf(resultContent: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(resultContent);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const error = (parsed as { error?: unknown }).error;
  return typeof error === 'string' && error.trim() ? error.trim() : null;
}

/**
 * Summarize a tool result (JSON string) to a single informative line. Pulls out
 * the common shapes (errors, match counts, structure counts, diff summaries,
 * result arrays); falls back to truncated text.
 */
export function summarizeToolResult(content: string, max = 180): string {
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    return truncate(content, max);
  }
  if (!parsed || typeof parsed !== 'object') return truncate(String(parsed), max);

  if (parsed.error) return truncate(`error: ${parsed.error}`, max);
  if (parsed.note && Object.keys(parsed).length <= 2) return truncate(String(parsed.note), max);

  const bits: string[] = [];
  if (typeof parsed.totalMatches === 'number') {
    bits.push(`${parsed.totalMatches} match${parsed.totalMatches === 1 ? '' : 'es'}`);
  }
  if (parsed.counts && typeof parsed.counts === 'object') {
    const c = parsed.counts;
    if (typeof c.sections === 'number') bits.push(`${c.sections} sections`);
    if (typeof c.headings === 'number') bits.push(`${c.headings} headings`);
  }
  if (parsed.summary && typeof parsed.summary === 'object') {
    const s = parsed.summary;
    const parts = ['added', 'removed', 'modified']
      .filter(k => typeof s[k] === 'number' && s[k] > 0)
      .map(k => `${s[k]} ${k}`);
    if (parts.length) bits.push(parts.join(', '));
  }
  if (Array.isArray(parsed.results)) {
    bits.push(`${parsed.results.length} result${parsed.results.length === 1 ? '' : 's'}`);
  }
  if (bits.length) return truncate(bits.join('; '), max);
  return truncate(JSON.stringify(parsed), max);
}

/** Build a trace entry from a tool's label, status and raw result. */
export function buildTraceEntry(
  tool: string,
  label: string,
  status: ToolTraceEntry['status'],
  resultContent: string,
): ToolTraceEntry {
  return { tool, label, status, resultSummary: summarizeToolResult(resultContent) };
}

interface HistoryMessage {
  role: string;
  content: string;
  metadata?: unknown;
}

/**
 * Collect tool-trace entries stored on prior assistant messages, most recent
 * last, capped to `maxEntries` to bound context size.
 */
export function collectTracesFromHistory(history: HistoryMessage[], maxEntries = 12): ToolTraceEntry[] {
  const entries: ToolTraceEntry[] = [];
  for (const msg of history) {
    const meta = msg.metadata as { toolTrace?: unknown } | null | undefined;
    const trace = meta && Array.isArray(meta.toolTrace) ? meta.toolTrace : null;
    if (!trace) continue;
    for (const e of trace) {
      if (e && typeof e === 'object' && typeof (e as any).label === 'string') {
        entries.push({
          tool: String((e as any).tool ?? ''),
          label: String((e as any).label),
          status: ((e as any).status ?? 'success') as ToolTraceEntry['status'],
          resultSummary: String((e as any).resultSummary ?? ''),
        });
      }
    }
  }
  return entries.length > maxEntries ? entries.slice(entries.length - maxEntries) : entries;
}

/**
 * The tools earlier turns ran successfully, most recent first, each once: what
 * a follow-up's tool selection carries (TP-RL-3, tool-selection.ts). A step a
 * person declined is recorded as an error, so it is never carried; neither is
 * one that failed or was stopped.
 */
export function carriedToolsFrom(entries: ToolTraceEntry[]): string[] {
  const names: string[] = [];
  for (const e of [...entries].reverse()) {
    if (e.status === 'success' && e.tool && !names.includes(e.tool)) names.push(e.tool);
  }
  return names;
}

/**
 * Format collected traces into a compact continuity note injected into AnA's
 * context next turn. Returns '' when there is nothing to carry forward.
 *
 * Successful and unsuccessful attempts are reported separately and given
 * different guidance: reuse the findings of tools that succeeded (do not repeat
 * them), but treat a failed or empty attempt as unfinished — do not loop on the
 * same call, yet do not assume it covered the ground either. Lumping the two
 * together let a failed search read as "already done", leaving a real evidence
 * gap silently unfilled.
 */
export function formatTraceForContext(entries: ToolTraceEntry[]): string {
  if (entries.length === 0) return '';
  const succeeded = entries.filter(e => e.status === 'success');
  const failed = entries.filter(e => e.status !== 'success');
  const sections: string[] = [];

  if (succeeded.length > 0) {
    sections.push(
      'Tools you have already run earlier in this conversation (reuse these ' +
        'findings; do not repeat them needlessly):\n' +
        succeeded.map(e => `- ${e.label}: ${e.resultSummary}`).join('\n')
    );
  }

  if (failed.length > 0) {
    sections.push(
      'Tool attempts that did not return a usable result (do not loop on the ' +
        'same call; retry only with a changed approach, or proceed and state ' +
        'plainly what could not be retrieved — do not treat these as covered):\n' +
        failed.map(e => `- ${e.label} [${e.status}]: ${e.resultSummary}`).join('\n')
    );
  }

  return sections.join('\n\n');
}

/** Grounding verdict as persisted on the assistant message metadata. */
export interface GroundingSummary {
  checked: number;
  grounded: number;
  unsupported: Array<{ kind: string; text: string }>;
}

/** Hidden metadata stored on an assistant message: durable turn-quality record. */
export interface AssistantMessageMetadata {
  toolTrace?: ToolTraceEntry[];
  grounding?: GroundingSummary;
  /**
   * AnA's extended-thinking / reasoning for the turn. Streamed live to the
   * client as `thinking` events and persisted here so the thought process
   * survives reload and becomes part of the auditable turn record (it is
   * otherwise live-only and lost). Rendered by the client's "Reasoning"
   * collapsible on rehydration.
   */
  reasoning?: string;
  /**
   * Human control actions taken against this turn's in-flight run (pause /
   * resume / interject / cancel). Persisted so a mid-run redirection is part of
   * the auditable decision lineage and shows in the document dossier.
   */
  humanControls?: HumanControlEvent[];
  /**
   * The plan AnA last declared this turn (`update_plan`, turn-plan.ts), as the
   * server validated it. Persisted so a reopened thread still shows the plan
   * and its count; only the final list is kept, not when each step changed.
   */
  plan?: TurnPlanStep[];
  /**
   * Why the turn's work stopped, when it was NOT because she said she was done
   * (`no_more_tools` is the ordinary case and is omitted). A turn the round cap
   * or the repeat guard stopped reads as finished to anyone who cannot see
   * this: the reopened thread's note and the next turn's continuity note
   * (`formatStoppedTurnNote`) both read it from here.
   */
  stoppedReason?: TurnStoppedReason;
  /** Tool rounds the turn ran. Kept only when there was at least one. */
  rounds?: number;
  /** The run policy the turn ran under (row 74). Absent for a turn that sent none. */
  runPolicy?: AnaRunPolicy;
  /**
   * The steps she had chosen that did not run because the turn stopped first
   * (a Manual hold nobody answered, or Manual that could not hold), by label.
   */
  pendingSteps?: string[];
  /**
   * AnA's own holds under Manual, kept apart from `humanControls`: the pause
   * was the policy's, the resume after it the person's. The lineage dossier
   * reads both.
   */
  policyHolds?: PolicyHold[];
}

/** How the turn's agentic loop ended, as the stream observed it. */
export interface TurnEnding {
  stoppedReason?: TurnStoppedReason | null;
  rounds?: number | null;
  runPolicy?: AnaRunPolicy | null;
  pendingSteps?: readonly string[] | null;
  policyHolds?: readonly PolicyHold[] | null;
}

/** A policy hold as the stream wrote it; anything malformed is dropped rather than stored. */
function isPolicyHold(raw: unknown): raw is PolicyHold {
  const h = raw as Partial<PolicyHold> | null;
  return (
    !!h &&
    typeof h === 'object' &&
    Number.isInteger(h.round) &&
    h.reason === 'manual' &&
    Array.isArray(h.next) &&
    isPolicyHoldOutcome(h.outcome) &&
    typeof h.at === 'string'
  );
}

/** Cap on persisted reasoning so a pathological turn can't bloat a message row. */
const MAX_PERSISTED_REASONING_CHARS = 24_000;

/**
 * Build the assistant message's hidden metadata from the turn's tool-trace,
 * grounding verdict, and reasoning. Returns undefined when there is nothing
 * worth storing, so callers persist `null` rather than an empty object. The
 * grounding verdict is only stored when claims were actually checked
 * (`checked > 0`); reasoning is stored only when non-empty and is capped.
 * How the loop ended is added by {@link withTurnEnding}.
 */
export function buildAssistantMetadata(
  toolTrace: ToolTraceEntry[],
  grounding: GroundingSummary | null,
  reasoning?: string | null,
  humanControls?: HumanControlEvent[] | null,
  plan?: TurnPlanStep[] | null,
): AssistantMessageMetadata | undefined {
  const meta: AssistantMessageMetadata = {};
  if (toolTrace.length > 0) meta.toolTrace = toolTrace;
  if (grounding && grounding.checked > 0) {
    meta.grounding = {
      checked: grounding.checked,
      grounded: grounding.grounded,
      unsupported: grounding.unsupported,
    };
  }
  const trimmedReasoning = typeof reasoning === 'string' ? reasoning.trim() : '';
  if (trimmedReasoning) {
    meta.reasoning =
      trimmedReasoning.length > MAX_PERSISTED_REASONING_CHARS
        ? `${trimmedReasoning.slice(0, MAX_PERSISTED_REASONING_CHARS)}…`
        : trimmedReasoning;
  }
  if (humanControls && humanControls.length > 0) meta.humanControls = humanControls;
  if (plan && plan.length > 0) meta.plan = plan;
  return Object.keys(meta).length > 0 ? meta : undefined;
}

/**
 * The assistant message's metadata with how the turn's loop ended: the stop
 * reason unless she finished herself (`no_more_tools` is the ordinary case and
 * stores nothing), and the rounds when there were any. Still undefined when
 * the result has nothing worth storing.
 *
 * Its own step rather than more arguments to {@link buildAssistantMetadata}:
 * the facts a turn's END carries (and, with the run-policy work, its policy
 * and the steps a hold left unrun) belong together, and they compose onto
 * whatever the turn's work produced.
 */
export function withTurnEnding(
  meta: AssistantMessageMetadata | undefined,
  ending: TurnEnding | null | undefined,
): AssistantMessageMetadata | undefined {
  const out: AssistantMessageMetadata = { ...meta };
  const reason = ending?.stoppedReason;
  if (reason && reason !== 'no_more_tools') out.stoppedReason = reason;
  const rounds = ending?.rounds;
  if (typeof rounds === 'number' && Number.isInteger(rounds) && rounds > 0) out.rounds = rounds;
  withPolicyEnding(out, ending);
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The run policy's part of the ending (row 74): the policy, the steps not run, her own holds. Only well-formed values. */
function withPolicyEnding(out: AssistantMessageMetadata, ending: TurnEnding | null | undefined): void {
  const runPolicy = parseRunPolicy(ending?.runPolicy);
  if (runPolicy) out.runPolicy = runPolicy;
  const pending = stepLabels(ending?.pendingSteps);
  if (pending.length > 0) out.pendingSteps = pending;
  const holds = (ending?.policyHolds ?? []).filter(isPolicyHold);
  if (holds.length > 0) out.policyHolds = holds.map(h => ({ ...h, next: stepLabels(h.next) }));
}

/** How the turn record names a policy. */
const POLICY_NAME: Record<AnaRunPolicy, string> = { manual: 'Manual', auto: 'Auto' };

/** The steps a stop left unrun, as the record says them. */
function notRunSentence(pendingSteps: readonly string[] | null | undefined): string {
  const steps = stepLabels(pendingSteps);
  return steps.length > 0 ? ` Steps not run: ${steps.join('; ')}.` : '';
}

/**
 * The turn record's warning for a loop that did not end by her choice. The
 * record keeps the answer the person was given; this says what that answer
 * is — written from the work done when the loop was stopped — so an inspector
 * does not read it as a concluded analysis. '' for `no_more_tools`, which is
 * not a stop anyone needs warning of.
 */
export function turnStopWarning(
  reason: TurnStoppedReason,
  rounds: number,
  context?: {
    runPolicy?: AnaRunPolicy | null;
    pendingSteps?: readonly string[] | null;
    /** Her own holds this turn: an expired one means SHE was waiting, not a person's pause. */
    policyHolds?: readonly PolicyHold[] | null;
  },
): string {
  const heldByHer = (context?.policyHolds ?? []).some(h => h.outcome === 'expired');
  const words = stopWords(reason, rounds, context?.pendingSteps, heldByHer);
  const policy = parseRunPolicy(context?.runPolicy);
  return words && policy ? `${words} Run policy: ${POLICY_NAME[policy]}.` : words;
}

/** The record's words for a hold that expired: hers under Manual, or a person's own pause. */
function expiredWords(ran: string, heldByHer: boolean): string {
  return heldByHer
    ? `Manual: AnA waited ${PAUSE_WORDS} for the person before her next step and nobody answered, so the turn ended${ran}`
    : `Manual: the run was paused and nobody resumed it within ${PAUSE_WORDS}, so the turn ended${ran}`;
}

/** The record's words for a stop, before the policy is named. */
function stopWords(
  reason: TurnStoppedReason,
  rounds: number,
  pendingSteps?: readonly string[] | null,
  heldByHer = false,
): string {
  // The round limit and the repeat guard fire only after a round has run
  // (agentic-loop: round++ precedes both). A cancel can land at the first
  // checkpoint, before any round — so "after N rounds" is said only when
  // there were some, and a stop before the first round claims no round.
  const ran = rounds > 0 ? ` after ${rounds} ${rounds === 1 ? 'round' : 'rounds'}` : '';
  switch (reason) {
    case 'no_more_tools':
      return '';
    case 'max_rounds':
      return `The turn stopped at the round limit${ran}, before AnA said she was done. The answer was written from the work done up to that point.`;
    case 'duplicate_thrash':
      return `The turn stopped${ran} because AnA was repeating the same step. The answer was written from the work done up to that point.`;
    case 'cancelled':
      return (
        (rounds > 0
          ? `The run was stopped between rounds${ran}, before AnA said she was done.`
          : 'The run was stopped before its first tool round.') + notRunSentence(pendingSteps)
      );
    case 'budget_exhausted':
      return (
        `The turn stopped at its time limit${ran} (${AUTO_TIME_WORDS}), before AnA ` +
        'said she was done. The answer was written from the work done up to that point.'
      );
    case 'approval_timeout':
      return (
        `The turn stopped${ran} because an approval AnA asked for was not answered within ${PAUSE_WORDS}. ` +
        'That action was not taken; the answer was written from the work done up to that point.'
      );
    case 'hold_expired':
      return `${expiredWords(ran, heldByHer)}, before she said she was done.${notRunSentence(pendingSteps)}`;
    case 'hold_unavailable':
      return (
        `Manual was asked for, but run control was not available for this turn, so AnA stopped${ran} ` +
        `where she would have asked the person.${notRunSentence(pendingSteps)}`
      );
    case 'answer_cut_off':
      return `The answer was cut off${ran}, before AnA finished writing it. What the person saw ends where it stopped.`;
    default:
      // A reason this module has no words for. Said plainly rather than
      // dropped, so a record can never be silent about a stop.
      return `The turn stopped (${reason})${ran}, before AnA said she was done.`;
  }
}

/**
 * The turn record's line for one of AnA's own holds under Manual: what she
 * held before, and what the person did. The pause is the policy's, so it is
 * not in the record's controls; this is where it is written down.
 */
export function policyHoldWarning(hold: PolicyHold): string {
  const next = stepLabels(hold.next);
  const steps = next.length > 0 ? ` (${next.join('; ')})` : '';
  const before = `Manual: AnA stopped before round ${hold.round}${steps}`;
  switch (hold.outcome) {
    case 'continued':
      return `${before} and waited; the person said to run it.`;
    case 'redirected':
      return `${before}; the person replaced the step with an instruction, and it was not run.`;
    case 'superseded':
      // Not a hold: nothing paused and no Next was shown. Never "she stopped".
      return (
        `Manual: before round ${hold.round}, a steer the person sent while AnA was working replaced her next ` +
        `step${steps} before it was shown; it was not run.`
      );
    case 'expired':
      return `${before} and nobody answered within ${PAUSE_WORDS}, so the turn ended there.`;
    case 'stopped':
      return `${before}; the run was stopped while she waited, and the step was not run.`;
    case 'disconnected':
      return `${before}; the page was closed while she waited, and the step was not run.`;
  }
}

/**
 * The stops that leave a turn's work unfinished, in the words the next turn is
 * told. `no_more_tools` (she said she was done) and `cancelled` (the person
 * stopped it, and asks again if they want more) are not here.
 *
 * A Map, not an object literal: the reason is read back from a stored row, and
 * a string naming an Object.prototype member (`constructor`, `toString`) would
 * otherwise find a function here and reach the model as a stop.
 */
const UNFINISHED_STOP: ReadonlyMap<string, (rounds: number | null) => string> = new Map<
  TurnStoppedReason,
  (rounds: number | null) => string
>([
  ['max_rounds', (rounds) => `stopped at the round limit${rounds ? ` (${rounds} rounds)` : ''}`],
  ['duplicate_thrash', () => 'was stopped because it was repeating the same step,'],
  // The run policy's stops (row 74, S4).
  ['budget_exhausted', () => 'stopped at its time limit'],
  ['approval_timeout', () => 'stopped when an approval you asked for went unanswered, so that action was not taken,'],
  ['hold_expired', () => `stopped after waiting ${PAUSE_WORDS} for the person to say whether to go on,`],
  ['hold_unavailable', () => 'stopped where it would have asked the person (Manual could not hold this turn)'],
  ['answer_cut_off', () => 'had its answer cut off'],
]);

/**
 * Why the turn ended, once its last answer is known. A loop that ended for
 * want of tools ended by her choice — unless the answer she was writing was
 * cut off (the model's length limit, or a stream that stalled mid-answer:
 * isTruncated). Then the turn did not finish, and nothing may show it as
 * finished. Any other reason already says the turn stopped short, and stands.
 */
export function turnEndingReason(
  loopReason: TurnStoppedReason,
  lastFinishReason: string | null | undefined,
): TurnStoppedReason {
  return loopReason === 'no_more_tools' && isTruncated(lastFinishReason) ? 'answer_cut_off' : loopReason;
}

/**
 * The continuity note for a turn whose predecessor did not finish.
 *
 * The trace note (`formatTraceForContext`) tells her to reuse what earlier
 * turns found. For a turn the round cap or the repeat guard cut short that is
 * the wrong instruction: its answer was forced from the work so far, and its
 * findings are what she had, not what she concluded. This says so, beside the
 * trace note, so the next turn neither presents that work as complete nor
 * repeats it blindly.
 *
 * Covers only the IMMEDIATELY PRECEDING assistant turn — the last assistant
 * message, whatever it was. That is not the same as "every stop not yet
 * followed up": if another exchange comes between a capped turn and a typed
 * "continue" ("which study?" → a short reply), the capped turn's findings
 * reach the model through the trace note again with no caveat. The one
 * control that continues a stopped turn (Continue) is offered on the latest
 * turn only, so the note is there when it is pressed; naming every unfinished
 * turn since the last finished one is left to the run-policy work (row 74).
 *
 * Server history only: the client-history fallback in stream.ts carries role
 * and content, not metadata, so a turn served from it gets no note.
 * Returns '' when there is nothing to say.
 */
export function formatStoppedTurnNote(history: HistoryMessage[]): string {
  let last: HistoryMessage | undefined;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === 'assistant') {
      last = history[i];
      break;
    }
  }
  const meta = last?.metadata as { stoppedReason?: unknown; rounds?: unknown; pendingSteps?: unknown } | null | undefined;
  const reason = typeof meta?.stoppedReason === 'string' ? meta.stoppedReason : null;
  const words = reason ? UNFINISHED_STOP.get(reason) : undefined;
  if (!words) return '';
  const rounds = typeof meta?.rounds === 'number' && Number.isInteger(meta.rounds) && meta.rounds > 0 ? meta.rounds : null;
  const pending = stepLabels(meta?.pendingSteps);
  const unrun =
    pending.length > 0
      ? ` Steps you had chosen that did not run: ${pending.join('; ')}. Nothing from them was used.`
      : '';
  return (
    `Your previous turn ${words(rounds)} before it was finished.${unrun} Its answer was ` +
    'written from the work done up to that point. Do not reuse that turn\'s ' +
    'findings as complete or present its answer as a finished analysis: say ' +
    'what it did not cover, and if the person asks you to continue, pick up ' +
    'where it stopped rather than starting over.'
  );
}
