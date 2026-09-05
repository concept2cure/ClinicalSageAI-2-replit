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
import { formatElapsed, formatStepDuration } from '../components/ana/anaProgress';

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
  if (typeof turn.completedAt === 'number') return `Finished in ${elapsed}`;
  return '';
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

/** A step's duration: the server's own measurement when it sent one, else the client clocks. */
export function stepDuration(c: AnaToolCall, now: number): string {
  if (typeof c.latencyMs === 'number') return formatStepDuration(c.latencyMs);
  if (typeof c.startedAt === 'number') return formatStepDuration((c.endedAt ?? now) - c.startedAt);
  return '';
}

/** Group calls by agentic-loop round, preserving order. */
export function byRound(calls: AnaToolCall[]): Array<{ round: number; calls: AnaToolCall[] }> {
  const groups = new Map<number, AnaToolCall[]>();
  for (const c of calls) {
    const r = typeof c.round === 'number' && c.round > 0 ? c.round : 1;
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(c);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([round, cs]) => ({ round, calls: cs }));
}

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function draftNote(m: AnaChatMessage): string {
  const d = m.generatedDraft;
  if (!d) return '';
  if (d.artifactId) return `Saved${typeof d.version === 'number' ? ` · version ${d.version}` : ''}`;
  return m.streaming ? 'Save not yet reported' : 'Not reported as saved';
}

function actionRows(m: AnaChatMessage, i: number): OutputRow[] {
  return (m.executedActions ?? [])
    .filter((a) => a.actionType !== 'navigate' && a.actionType !== 'surface_action')
    .map((a) => ({
      key: `a-${i}-${a.label}`,
      icon: a.error ? 'alertTriangle' : 'zap',
      label: a.label,
      note: a.error ? 'Did not complete' : a.executed ? 'Done' : undefined,
    }));
}

/** Everything the conversation has produced, across every assistant turn. */
export function collectOutputs(messages: AnaChatMessage[]): OutputRow[] {
  const rows: OutputRow[] = [];
  messages.forEach((m, i) => {
    if (m.role !== 'assistant') return;
    if (m.generatedDraft?.title) {
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
    if (m.reportCanvas?.kind === 'report') {
      rows.push({ key: `r-${i}`, icon: 'barChart', label: 'Report rendered in the canvas' });
    }
    if (m.warGameReport) rows.push({ key: `w-${i}`, icon: 'shieldAlert', label: 'Audit simulation report' });
  });
  return rows;
}

/** The grounding rows the panel can honestly state — absent values are omitted, never blank. */
export function contextRows(
  context: AnaWorkContext | undefined,
  turn: AnaChatMessage | null,
): Array<[string, string]> {
  const lens = turn?.detectedLens;
  const candidates: Array<[string, string | null | undefined]> = [
    ['Project', context?.project],
    ['Working in', context?.module],
    ['Surface', context?.surface],
    ['Engine', context?.engine],
    ['Effort used', turn?.effortUsed],
    ['Read as', lens === 'auto' ? null : lens],
    ['Drafting', turn?.detectedDocumentType],
  ];
  return candidates.filter((r): r is [string, string] => typeof r[1] === 'string' && r[1].length > 0);
}

/** Distinct tools used anywhere in the conversation, by label, first-seen order. */
export function conversationTools(messages: AnaChatMessage[]): string[] {
  const seen = new Map<string, string>();
  for (const m of messages) {
    for (const c of m.toolCalls ?? []) if (!seen.has(c.name)) seen.set(c.name, c.label || c.name);
  }
  return [...seen.values()];
}
