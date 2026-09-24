/**
 * The work panel's model — pure projections of the chat turns.
 *
 * Everything AnaWorkPanel says is computed here from the messages `useAnaChat`
 * keeps, so each claim the panel makes ("Finished in 1m 12s", "Drafted X ·
 * saved", "3 of 5 steps") is a function of recorded facts and testable without
 * a DOM. Nothing here invents a value for a field the turn did not report: a
 * missing context row is omitted, a draft with no save report says so.
 *
 * @module client/src/concept2cure/v2/anaWorkModel
 */

import type { AnaChatMessage, AnaToolCall, RunControlStatus } from '../components/ana/useAnaChat';
import type { AnaProgressPhase } from '../components/ana/useAnaChat.types';
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

export interface OutputRow {
  key: string;
  /** Icon key into the shell's `I` map. */
  icon: 'fileText' | 'alertTriangle' | 'zap' | 'lock' | 'barChart' | 'shieldAlert';
  label: string;
  note?: string;
}

/** The header's one-line state: in flight, paused, stopped or finished, with its clock. */
export function stateLineFor(
  turn: AnaChatMessage | null,
  live: boolean,
  runStatus: RunControlStatus,
  elapsed: string,
): string {
  if (!turn) return '';
  if (live) {
    if (runStatus === 'paused') return `Paused · ${elapsed}`;
    if (runStatus === 'cancelled') return `Stopping · ${elapsed}`;
    return `Still working · ${elapsed}`;
  }
  if (turn.stopped) return `Stopped after ${elapsed}`;
  // A timeout or a lost connection closes the record with its last phase
  // marked stopped and never sets `stopped` (that flag is the person's own
  // stop). Both are turns that did not finish, and neither may read
  // "Finished".
  if (progressCutShort(turn)) return `Did not finish · ${elapsed}`;
  if (typeof turn.completedAt === 'number') return `Finished in ${elapsed}`;
  return '';
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

function actionRows(m: AnaChatMessage, i: number): OutputRow[] {
  return (m.executedActions ?? [])
    .filter(
      (a) => a.actionType !== 'navigate' && a.actionType !== 'surface_action' && a.actionType !== 'start_demo',
    )
    .map((a) => ({
      key: `a-${i}-${a.label}`,
      icon: a.error ? 'alertTriangle' : 'zap',
      label: a.label,
      note: a.error ? 'Did not complete' : a.executed ? 'Done' : undefined,
    }));
}

/**
 * Everything the conversation has produced, across every assistant turn.
 * `drafts: false` leaves the draft rows to a host that lists them as
 * artifact cards of its own.
 */
export function collectOutputs(messages: AnaChatMessage[], opts: { drafts?: boolean } = {}): OutputRow[] {
  const withDrafts = opts.drafts !== false;
  const rows: OutputRow[] = [];
  messages.forEach((m, i) => {
    if (m.role !== 'assistant') return;
    if (withDrafts && m.generatedDraft?.title) {
      rows.push({ key: `d-${i}`, icon: 'fileText', label: `Drafted ${m.generatedDraft.title}`, note: draftNote(m) });
    }
    rows.push(...actionRows(m, i));
    const signoffs = m.pendingSignoffs?.length ?? 0;
    if (signoffs > 0) {
      rows.push({
        key: `s-${i}`,
        icon: 'lock',
        label: `${signoffs} governed ${signoffs === 1 ? 'action' : 'actions'} waiting for sign-off`,
      });
    }
    // Produced, and said as produced: no v2 host renders these two yet, so a
    // row claiming "rendered in the canvas" described a render that never
    // happened.
    if (m.reportCanvas?.kind === 'report') {
      rows.push({ key: `r-${i}`, icon: 'barChart', label: 'Report produced' });
    }
    if (m.warGameReport) rows.push({ key: `w-${i}`, icon: 'shieldAlert', label: 'Audit simulation report produced' });
  });
  return rows;
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
export function progressChip(turn: AnaChatMessage | null, live: boolean): ProgressChip {
  const pos = planPosition(turn?.plan);
  if (pos) {
    if (live) return { text: `Step ${pos.current} of ${pos.total}` };
    return { text: `${pos.completed} of ${pos.total} done` };
  }
  return { text: live ? 'Working' : 'Progress' };
}

/* ── Used in this session ─────────────────────────────────────────────────── */

export interface UsedRow {
  key: 'uploads' | 'memory' | 'tools' | 'context';
  /** Icon key into the shell's `I` map. */
  icon: 'paperclip' | 'history' | 'zap' | 'folder';
  label: string;
  /** One line, truncated by the row: the first few items. */
  detail: string;
  /** A qualifier the row must not drop (a file read by name only, a failed read). */
  note?: string;
}

function firstAndMore(items: string[], shown = 1): string {
  const head = items.slice(0, shown).join(', ');
  const more = items.length - shown;
  return more > 0 ? `${head} +${more}` : head;
}

/** Every upload the conversation attached or a turn reported reading, by file. */
function tallyUploads(messages: AnaChatMessage[]): { names: Map<string, string>; nameOnly: number; unresolved: number } {
  const names = new Map<string, string>();
  let nameOnly = 0;
  let unresolved = 0;
  for (const m of messages) {
    for (const a of m.attachments ?? []) names.set(a.fileId || a.name, a.name);
    unresolved += m.contextUsed?.unresolvedUploads ?? 0;
    for (const u of m.contextUsed?.uploads ?? []) {
      if (!names.has(u.fileId || u.fileName)) names.set(u.fileId || u.fileName, u.fileName);
      nameOnly += u.read === 'name_only' ? 1 : 0;
    }
  }
  return { names, nameOnly, unresolved };
}

function uploadsRow(messages: AnaChatMessage[]): UsedRow | null {
  const { names, nameOnly, unresolved } = tallyUploads(messages);
  if (names.size === 0 && unresolved === 0) return null;
  const notes = [
    nameOnly > 0 ? `${nameOnly} read by name only` : '',
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
  const effort = turn?.effortUsed ? `${turn.effortUsed} effort` : null;
  const parts = [context?.project, context?.module, context?.engine, effort].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
  if (parts.length === 0) return null;
  return { key: 'context', icon: 'folder', label: context?.project ? 'Project' : 'Context', detail: parts.join(' · ') };
}
