/**
 * The work panel's model — pure projections of the chat turns.
 *
 * Everything AnaWorkPanel says is computed here from the messages `useAnaChat`
 * keeps, so each claim the panel makes ("Finished in 1m 12s", "Step 2 of 5",
 * "Saved · version 2") is a function of recorded facts and testable without a
 * DOM. Nothing here invents a value for a field the turn did not report: a
 * missing context row is omitted, a draft with no save report says so.
 *
 * @module client/src/concept2cure/v2/anaWorkModel
 */

import type { AnaChatMessage, AnaToolCall, RunControlStatus } from '../components/ana/useAnaChat';
import type { AnaProgressPhase, AnaRunHold, AnaStoppedReason } from '../components/ana/useAnaChat.types';
import { AUTO_TIME_WORDS, MANUAL_UNAVAILABLE_TEXT, PAUSE_WORDS, stepLabels } from '@shared/ana/run-policy';
import {
  formatElapsed,
  formatStepDuration,
  PLAN_TOOL,
  planPosition,
} from '../components/ana/anaProgress';

export interface AnaWorkContext {
  /** The open programme, by name (or id when that is all the shell has). */
  project?: string | null;
  /** The module AnA is working in ("CMC", "Document Studio"). */
  module?: string | null;
  /** The surface the conversation is drawn from. */
  surface?: string | null;
  /** Engine mode label from the composer ("Balanced", "Maximum"). */
  engine?: string | null;
  /** Tools the person pinned for the turn. */
  pinnedTools?: string[];
}

/**
 * The stops a turn's loop or its run policy made, in the panel's words. Each
 * says the stop and then its cause, so none can be read as good news; none is
 * "Finished". `cancelled` (a Stop) is said by its own branch.
 */
const STOP_LINES: ReadonlyMap<string, string> = new Map<AnaStoppedReason, string>([
  ['max_rounds', 'Stopped at the round limit'],
  ['duplicate_thrash', 'Stopped: repeating a step'],
  // The answer she was writing was cut off (the length limit, or a stream that
  // stalled mid-answer; D2, a6d82f624).
  ['answer_cut_off', 'Stopped: answer cut off'],
  // The run policy's (row 74, S4).
  ['budget_exhausted', 'Stopped at the time limit'],
  ['approval_timeout', 'Stopped: an approval was not answered'],
  ['hold_expired', 'Stopped waiting for you'],
  ['hold_unavailable', 'Stopped: Manual was unavailable'],
]);

/** A live turn's state line: working, paused, waiting for you, or stopping. */
/**
 * Whether a live turn is held for a person, and why: 'manual' when the run
 * policy stopped before her next step, 'approval' when an action she asked for
 * waits on someone's decision, null otherwise. The one rule every surface that
 * says what AnA is doing reads (row 74, end-to-end finding F2): the run is
 * held and the person is the one who has to act, so nothing may say "working"
 * or "driving" then.
 */
export function waitingForPerson(
  turn: AnaChatMessage | null | undefined,
  runStatus: RunControlStatus,
  runHold: AnaRunHold | null | undefined,
): 'manual' | 'approval' | null {
  if (!turn?.streaming) return null;
  if (runStatus === 'paused' && runHold?.reason === 'manual') return 'manual';
  return (turn.pendingSignoffs?.length ?? 0) > 0 ? 'approval' : null;
}

function liveStateLine(
  turn: AnaChatMessage,
  runStatus: RunControlStatus,
  runHold: AnaRunHold | null | undefined,
  elapsed: string,
): string {
  const waiting = waitingForPerson(turn, runStatus, runHold);
  // Under Manual AnA stopped herself: nobody pressed Pause, so it is not
  // "Paused" — she is waiting for the person to say what comes next.
  if (waiting === 'manual') return `Waiting for you · ${elapsed}`;
  // An action she asked for waits on a person's decision: she is not working.
  if (waiting === 'approval') return `Waiting for your approval · ${elapsed}`;
  if (runStatus === 'paused') return `Paused · ${elapsed}`;
  // Between hold_expired and the stream's close: the turn has ended.
  if (runHold?.reason === 'expired') return `Stopped waiting for you · ${elapsed}`;
  if (runStatus === 'cancelled') return `Stopping · ${elapsed}`;
  return `Still working · ${elapsed}`;
}

/** The header's one-line state: in flight, paused, stopped or finished, with its clock. */
export function stateLineFor(
  turn: AnaChatMessage | null,
  live: boolean,
  runStatus: RunControlStatus,
  elapsed: string,
  runHold?: AnaRunHold | null,
): string {
  if (!turn) return '';
  if (live) return liveStateLine(turn, runStatus, runHold, elapsed);
  if (turn.stopped) return `Stopped after ${elapsed}`;
  // A timeout or a lost connection never sets `stopped` (that flag is the
  // person's own stop). Both are turns that did not finish, and neither may
  // read "Finished" — including one that failed before its first phase
  // arrived, which leaves no phase to mark stopped. Ahead of the loop's own
  // stop reasons: a turn whose `done` said why the loop stopped and whose
  // stream then dropped before `post_done` did not finish either.
  if (turn.interrupted || progressCutShort(turn)) return `Did not finish · ${elapsed}`;
  // A reopened turn has no clock (the thread keeps no send or end time), so a
  // stop line restored from its metadata is said without one.
  const clocked = (label: string) => (elapsed ? `${label} · ${elapsed}` : label);
  // `cancelled` from the server is the same Stop: when its done and post_done
  // land before this client's own abort, `stopped` is never set.
  if (turn.stoppedReason === 'cancelled') return elapsed ? `Stopped after ${elapsed}` : 'Stopped';
  // The loop or the run policy ended the turn, not AnA: the round limit or
  // the time limit forced the answer, she was repeating a step, an approval
  // went unanswered, or Manual's hold ran out or could not be made. The stream
  // closed cleanly and every phase completed, so nothing above can see it —
  // and a stopped turn must never read "Finished" ("stopped repeating" would
  // say she quit repeating and carried on, hence the colon).
  const stopLine = turn.stoppedReason ? STOP_LINES.get(turn.stoppedReason) : undefined;
  if (stopLine) return clocked(stopLine);
  if (typeof turn.completedAt === 'number') return `Finished in ${elapsed}`;
  return '';
}

/** The steps a stop left unrun, as the note lists them ('' when there are none). */
function stepList(pendingSteps: readonly string[] | undefined): string {
  return stepLabels(pendingSteps).join('; ');
}

/** What the transcript says of the steps a steer replaced (null when none). */
export function replacedNoteText(replacedSteps: readonly string[] | undefined): string | null {
  const steps = stepList(replacedSteps);
  return steps ? `Not run — your steer replaced it: ${steps}.` : null;
}

function partialResponseNote(interruptedWithPartialResponse?: boolean): string | null {
  return interruptedWithPartialResponse
    ? "AnA's response was interrupted before this turn finished. The text shown may be incomplete."
    : null;
}

/**
 * What the transcript says under a turn the loop or the run policy stopped
 * before she was done, or null when there is nothing to say: she finished
 * (`no_more_tools`), or the person pressed Stop (`cancelled`) with nothing
 * held — they know. The numbers are the shared ceilings and the turn's own
 * rounds; the steps are the ones a Manual stop left unrun.
 */
export function stoppedNoteText(
  reason: AnaStoppedReason | undefined,
  rounds?: number,
  pendingSteps?: readonly string[],
  interruptedWithPartialResponse?: boolean,
): string | null {
  const steps = stepList(pendingSteps);
  switch (reason) {
    case 'max_rounds':
      return typeof rounds === 'number' && rounds > 0
        ? `AnA reached this turn's round limit (${rounds} ${rounds === 1 ? 'round' : 'rounds'}) before she said she was done.`
        : "AnA reached this turn's round limit before she said she was done.";
    case 'duplicate_thrash':
      return 'AnA stopped because she was repeating the same step. Tell her what to change.';
    case 'answer_cut_off':
      return "AnA's answer was cut off before she finished it. It ends where it stopped.";
    case 'budget_exhausted':
      return `AnA reached this turn's time limit (${AUTO_TIME_WORDS}) before she said she was done.`;
    case 'approval_timeout':
      return `Nobody answered AnA's request within ${PAUSE_WORDS}, so that change was not made and she stopped.`;
    case 'hold_expired':
      return `AnA waited ${PAUSE_WORDS} for you, then stopped before her next step${steps ? `: ${steps}` : ''}.`;
    case 'hold_unavailable':
      // Continue under Manual fails the same way when the cause is lasting
      // (a run with no owner), so the way on is Auto, then Continue.
      return `${MANUAL_UNAVAILABLE_TEXT} ${steps ? `Next step: ${steps}. ` : ''}To let her go on, switch to Auto, then Continue.`;
    case 'cancelled':
      // A Stop with nothing held needs no note (the person pressed it). One
      // that ended a Manual hold — or a page closed during it — names what
      // did not run, so a reopened turn does not read as a plain Stop.
      return steps ? `The run was stopped while AnA waited for you before her next step, so it did not run: ${steps}.` : null;
    default:
      return partialResponseNote(interruptedWithPartialResponse);
  }
}

/**
 * Whether a turn that stopped for this reason can be picked up where it left
 * off. The round limit and the time limit stopped work that was going
 * somewhere; a hold or an unanswered approval stopped it before a step she had
 * chosen. A repeated step would only be repeated again — the person has to say
 * what to change — and a Stop was the person's decision.
 */
export function isContinuable(reason: AnaStoppedReason | undefined, interruptedWithPartialResponse = false): boolean {
  switch (reason) {
    case 'max_rounds':
    case 'answer_cut_off':
    case 'budget_exhausted':
    case 'approval_timeout':
    case 'hold_expired':
    case 'hold_unavailable':
      return true;
    default:
      return interruptedWithPartialResponse && (reason === undefined || reason === 'no_more_tools');
  }
}

/**
 * What Continue sends: a new turn on the same conversation. The stopped run is
 * over — there is nothing to resume — and the next turn is told its
 * predecessor did not finish (server: formatStoppedTurnNote).
 */
export { CONTINUE_PROMPT } from '@shared/ana/continuation-context';

/**
 * The one turn a host may offer Continue on: the last message, when it is an
 * assistant turn that has settled and nothing is in flight. -1 otherwise — an
 * earlier turn has been followed by later ones, and a turn still streaming, or
 * a question already waiting, is not something to continue. Takes the rail's
 * `ana` role as well as `assistant`.
 */
export function continueTurnIndex(turns: ReadonlyArray<{ role: string; streaming?: boolean }>, busy: boolean): number {
  if (busy || turns.length === 0) return -1;
  const i = turns.length - 1;
  const last = turns[i];
  return last.role !== 'user' && !last.streaming ? i : -1;
}

/** True when the turn's progress record ended in a phase marked stopped. */
export function progressCutShort(turn: AnaChatMessage): boolean {
  const last = turn.progress?.[turn.progress.length - 1];
  return last?.status === 'stopped';
}

/** Wall-clock elapsed for the turn: to its recorded end, or to now while in flight. */
export function elapsedFor(turn: AnaChatMessage | null, now: number): string {
  const startedAt = turn?.sentAt;
  if (typeof startedAt !== 'number') return '';
  return formatElapsed((turn?.completedAt ?? now) - startedAt);
}

/** The line the progress list shows before the first phase event arrives. */
export const SENDING_PLACEHOLDER = 'Sending to AnA…';

/**
 * What the polite live region says: the active phase, then the outcome once
 * settled. Before the first phase arrives on a live turn it says what the
 * sighted user sees — the placeholder — so the two do not diverge.
 */
export function spokenLine(
  phases: AnaProgressPhase[],
  live: boolean,
  stateLine: string,
  placeholder?: string,
): string {
  const active = phases.find((p) => p.status === 'active');
  const phase = active?.label ?? (live && phases.length === 0 ? placeholder || SENDING_PLACEHOLDER : null);
  return [phase, live ? null : stateLine].filter(Boolean).join('. ');
}

/**
 * A step's duration: the server's own measurement when it sent one, else the
 * client clocks. A settled step with no recorded end claims no duration — it
 * must not read a clock that keeps running off the current time.
 */
export function stepDuration(c: AnaToolCall, now: number): string {
  if (typeof c.latencyMs === 'number') return formatStepDuration(c.latencyMs);
  if (typeof c.startedAt !== 'number') return '';
  if (typeof c.endedAt === 'number') return formatStepDuration(c.endedAt - c.startedAt);
  return c.status === 'running' ? formatStepDuration(now - c.startedAt) : '';
}

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * What is known about where a draft was saved. An authoring document exists
 * because the tool that wrote it returned its id; an artifact version because
 * the server reported `artifact_version_saved`. Anything else is said as not
 * reported — never as a failure, which is only one of the states behind it.
 */
export function draftNote(m: Pick<AnaChatMessage, 'generatedDraft' | 'streaming'>): string {
  const d = m.generatedDraft;
  if (!d) return '';
  if (d.authoringDocId) return 'Saved as an authoring document';
  if (d.artifactId) return `Saved${typeof d.version === 'number' ? ` · version ${d.version}` : ''}`;
  return m.streaming ? 'Save not yet reported' : 'Not reported as saved';
}

/**
 * Distinct tools used anywhere in the conversation, by label, first-seen
 * order. The plan tool is not listed: it is how she keeps the plan, which the
 * panel shows as the plan itself.
 */
export function conversationTools(messages: AnaChatMessage[]): string[] {
  const seen = new Map<string, string>();
  for (const m of messages) {
    for (const c of m.toolCalls ?? []) {
      if (c.name === PLAN_TOOL) continue;
      if (!seen.has(c.name)) seen.set(c.name, c.label || c.name);
    }
  }
  return [...seen.values()];
}

/* ── The header chip ──────────────────────────────────────────────────────── */

export interface ProgressChip {
  /** What the chip says: "Step 2 of 5", "5 of 5 done", "Working", "Progress". */
  text: string;
}

/**
 * The chip that opens the panel. A count appears only when AnA declared a
 * plan: both numbers are hers (planPosition). Without one there is no honest
 * total, so the chip says what is true — she is working, or here is the
 * record — and counts nothing.
 */
export function progressChip(
  turn: AnaChatMessage | null,
  live: boolean,
  runStatus: RunControlStatus = null,
  runHold: AnaRunHold | null = null,
): ProgressChip {
  // With the panel closed this is all there is to see: a hold is said, not
  // counted as work ("Working" while she waits for you would be untrue).
  const held = live ? heldChipText(runStatus, runHold) : null;
  if (held) return { text: held };
  const pos = planPosition(turn?.plan);
  if (pos) {
    if (live) return { text: `Step ${pos.current} of ${pos.total}` };
    return { text: `${pos.completed} of ${pos.total} done` };
  }
  return { text: live ? 'Working' : 'Progress' };
}

/** The chip's words while the run is held, or null when it is not. */
function heldChipText(runStatus: RunControlStatus, runHold: AnaRunHold | null): string | null {
  // Short: the strip beside it says why ("Stopped waiting for you").
  if (runHold?.reason === 'expired') return 'Stopped';
  if (runStatus !== 'paused') return null;
  return runHold?.reason === 'manual' ? 'Waiting for you' : 'Paused';
}

/* ── Used in this session ─────────────────────────────────────────────────── */

export interface UsedRow {
  key: 'uploads' | 'memory' | 'tools' | 'context';
  /** Icon key into the shell's `I` map. */
  icon: 'paperclip' | 'history' | 'zap' | 'folder';
  label: string;
  /** One line, truncated by the row: the first few items. */
  detail: string;
  /** A qualifier the row must not drop (a file attached by name only, a failed read). */
  note?: string;
}

function firstAndMore(items: string[], shown = 1): string {
  const head = items.slice(0, shown).join(', ');
  const more = items.length - shown;
  return more > 0 ? `${head} +${more}` : head;
}

/**
 * Every upload the conversation attached or a turn reported, once each. A file
 * pinned for five turns is one file: its read state is the best any turn gave
 * it (read in full once is not "by name only" because a later turn only named
 * it), and it is counted once.
 */
function tallyUploads(messages: AnaChatMessage[]): { names: Map<string, string>; nameOnly: number; unresolved: number } {
  const names = new Map<string, string>();
  const read = new Map<string, 'content' | 'name_only'>();
  let unresolved = 0;
  for (const m of messages) {
    for (const a of m.attachments ?? []) names.set(a.fileId || a.name, a.name);
    // The server reports a count, not which request failed, and a pinned
    // source that cannot be opened fails on every turn it rides. The most any
    // one turn reported is the count that cannot double a single failure.
    unresolved = Math.max(unresolved, m.contextUsed?.unresolvedUploads ?? 0);
    for (const u of m.contextUsed?.uploads ?? []) {
      const key = u.fileId || u.fileName;
      if (!names.has(key)) names.set(key, u.fileName);
      if (read.get(key) !== 'content') read.set(key, u.read);
    }
  }
  const nameOnly = [...read.values()].filter((r) => r === 'name_only').length;
  return { names, nameOnly, unresolved };
}

function uploadsRow(messages: AnaChatMessage[]): UsedRow | null {
  const { names, nameOnly, unresolved } = tallyUploads(messages);
  if (names.size === 0 && unresolved === 0) return null;
  const notes = [
    // The turn was given the file's name and id, not its text. The text may
    // still reach her through memory or a tool — rows of their own — so this
    // says what was attached, not what she could see.
    nameOnly > 0 ? `${nameOnly} attached by name only` : '',
    unresolved > 0 ? `${unresolved} could not be opened` : '',
  ].filter(Boolean);
  return {
    key: 'uploads',
    icon: 'paperclip',
    label: 'Uploads',
    detail: names.size > 0 ? firstAndMore([...names.values()]) : 'None could be opened',
    ...(notes.length ? { note: notes.join(' · ') } : {}),
  };
}

function memoryRow(messages: AnaChatMessage[]): UsedRow | null {
  const titles: string[] = [];
  let latest: AnaChatMessage['contextUsed'] | undefined;
  for (const m of messages) {
    if (!m.contextUsed) continue;
    latest = m.contextUsed;
    for (const a of m.contextUsed.memory) if (!titles.includes(a.title)) titles.push(a.title);
  }
  // No turn reported what it read: say nothing rather than guess.
  if (!latest) return null;
  if (titles.length > 0) {
    return {
      key: 'memory',
      icon: 'history',
      label: 'Memory',
      detail: `Read · ${firstAndMore(titles, 3)}`,
      ...(latest.memoryStatus === 'unavailable' ? { note: 'Could not be read on the latest turn' } : {}),
    };
  }
  return {
    key: 'memory',
    icon: 'history',
    label: 'Memory',
    detail: latest.memoryStatus === 'unavailable' ? 'Could not be read' : 'Nothing in memory matched',
  };
}

/**
 * What the conversation actually drew on, as Claude-style one-line rows. Each
 * row appears only when there is something true to say: uploads that were
 * attached or read, the memory a turn reported reading, the tools she called,
 * and the project context she was given.
 */
export function usedInSession(messages: AnaChatMessage[], context: AnaWorkContext | undefined): UsedRow[] {
  return [uploadsRow(messages), memoryRow(messages), toolsRow(messages, context), contextRow(messages, context)].filter(
    (r): r is UsedRow => r !== null,
  );
}

function toolsRow(messages: AnaChatMessage[], context: AnaWorkContext | undefined): UsedRow | null {
  const tools = conversationTools(messages);
  const pinned = context?.pinnedTools ?? [];
  if (tools.length === 0 && pinned.length === 0) return null;
  return {
    key: 'tools',
    icon: 'zap',
    label: 'Tools',
    detail: tools.length > 0 ? firstAndMore(tools, 2) : 'None called yet',
    ...(pinned.length > 0 ? { note: `Pinned: ${pinned.join(', ')}` } : {}),
  };
}

/** The project and engine she was given, and the effort the latest turn used. */
function contextRow(messages: AnaChatMessage[], context: AnaWorkContext | undefined): UsedRow | null {
  const turn = [...messages].reverse().find((m) => m.role === 'assistant');
  // "Balanced · balanced effort" says one word twice: the effort is named only
  // when it differs from the engine mode the person chose.
  const sameAsEngine = turn?.effortUsed && context?.engine?.toLowerCase() === turn.effortUsed.toLowerCase();
  const effort = turn?.effortUsed && !sameAsEngine ? `${turn.effortUsed} effort` : null;
  const parts = [context?.project, context?.module, context?.engine, effort].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
  if (parts.length === 0) return null;
  return { key: 'context', icon: 'folder', label: context?.project ? 'Project' : 'Context', detail: parts.join(' · ') };
}
