/**
 * The progress record of one AnA turn — pure helpers.
 *
 * A turn already tells the client what it is doing: the stream emits a
 * `status` event at every phase change ("Loading project memory…", "Running
 * 3 steps…", "Reading the results…"), a `tool_use` / `tool_result` pair for
 * every step, `done` when the answer has landed and `post_done` when the
 * background finishing work (evidence check, action execution, persistence)
 * is over. `useAnaChat` kept only the LATEST phase as a single label and
 * replaced it on every event, so the person waiting saw one line that kept
 * changing and had no way to see what had already happened, how long it had
 * taken, or how far along the turn was.
 *
 * These helpers turn that stream of events into an ORDERED LIST of phases the
 * turn actually passed through, each with the moment it began and ended. The
 * list is derived, never templated: a turn that ran no tools has no "running
 * steps" phase, and a phase appears only once its event has arrived. That is
 * what lets the work panel number them like a plan without ever showing a
 * step that did not happen.
 *
 * Pure and side-effect free so the panel and the hook share one definition
 * and the behaviour is unit-tested without a stream or a DOM.
 *
 * @module client/src/concept2cure/components/ana/anaProgress
 */

import type {
  AnaChatMessage,
  AnaContextUsed,
  AnaPlanChange,
  AnaPlanStep,
  AnaProgressPhase,
  AnaToolCall,
  AnaTurnRecordStatus,
} from './useAnaChat.types';

/**
 * Phases the client itself observes (no server `status` event carries them).
 * `composing` begins on the first answer token, `reasoning` on the first
 * extended-thinking token, `finalizing` on `done` — the window between the
 * answer landing and the server's background finishing work reporting in.
 */
export const CLIENT_PHASE_LABELS = {
  reasoning: 'Reasoning through the question…',
  composing: 'Composing the answer…',
  finalizing: 'Checking evidence and recording the turn…',
} as const;

/**
 * How AnA read the question, as a noun phrase that completes "Reading this
 * as …" and stands alone after "Read as". One table for the transcript record
 * and the dock's Context row: a lens is assigned by a classifier, so naming
 * the CATEGORY of question is both true and how a colleague would say it —
 * never a verb phrase claiming a deliberation nothing performed.
 */
export const LENS_PHRASE: Record<string, string> = {
  audit: 'an audit',
  improve: 'a request to strengthen the argument',
  risk: 'a risk question',
  strategy: 'a strategy question',
  compare: 'a comparison',
};

/**
 * Append a phase unless it is the one already active. A repeat of the same
 * phase with a DIFFERENT label is a new entry — "Round 2 — running 2 more
 * steps…" after "Running 3 steps…" is a second pass, and the record should
 * read as the progression it was. The previous active phase is closed at the
 * same instant the new one opens, so durations never overlap or leave gaps.
 */
export function advanceProgress(
  progress: AnaProgressPhase[] | undefined,
  phase: string,
  label: string,
  now: number,
): AnaProgressPhase[] {
  const list = progress ?? [];
  const last = list[list.length - 1];
  if (last && last.status === 'active' && last.phase === phase && last.label === label) return list;
  const closed = last && last.status === 'active' ? { ...last, status: 'done' as const, endedAt: now } : last;
  const head = closed ? [...list.slice(0, -1), closed] : list;
  return [...head, { phase, label, status: 'active', startedAt: now }];
}

/**
 * Close the record. `done` marks the active phase complete; `stopped` marks
 * it as cut short (the person stopped the run, the server cancelled it, the
 * stream failed or timed out). A record with no active phase is returned as is.
 */
export function closeProgress(
  progress: AnaProgressPhase[] | undefined,
  outcome: 'done' | 'stopped',
  now: number,
): AnaProgressPhase[] {
  const list = progress ?? [];
  const last = list[list.length - 1];
  if (!last || last.status !== 'active') return list;
  return [...list.slice(0, -1), { ...last, status: outcome, endedAt: now }];
}

/** "57s", "1m 12s", "2h 05m". Whole seconds; a duration is never fractional here. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** "340 ms" under a second, "2.4s" above it. For a single tool step. */
export function formatStepDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

export interface ToolTally {
  total: number;
  running: number;
  succeeded: number;
  failed: number;
  rounds: number;
}

export function tallyTools(calls: AnaToolCall[] | undefined): ToolTally {
  const list = calls ?? [];
  const rounds = new Set<number>();
  let running = 0;
  let succeeded = 0;
  let failed = 0;
  for (const c of list) {
    rounds.add(typeof c.round === 'number' && c.round > 0 ? c.round : 1);
    if (c.status === 'running') running += 1;
    else if (c.status === 'success') succeeded += 1;
    else failed += 1;
  }
  return { total: list.length, running, succeeded, failed, rounds: rounds.size };
}

/**
 * The one-line summary of a turn's tool work, in the voice of the transcript:
 * "Searched the literature, computed the sample size · 4 tools". Built from
 * the real step labels (lower-cased, deduplicated, first three) so it never
 * names work that was not done. Empty when no tool ran — the caller decides
 * whether to say nothing or say "no tools".
 */
export function summarizeToolWork(calls: AnaToolCall[] | undefined): string {
  const list = calls ?? [];
  if (list.length === 0) return '';
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const c of list) {
    const raw = (c.label || c.name || '').trim();
    if (!raw) continue;
    // "Searching the literature for X" → "searching the literature for X".
    const l = raw.charAt(0).toLowerCase() + raw.slice(1);
    if (seen.has(l)) continue;
    seen.add(l);
    labels.push(l);
  }
  const shown = labels.slice(0, 3);
  const more = labels.length - shown.length;
  const head = shown.join(', ') + (more > 0 ? ` and ${more} more` : '');
  const n = list.length;
  return `${head} · ${n} ${n === 1 ? 'tool' : 'tools'}`;
}

/**
 * Group calls by agentic-loop round, preserving order. The one implementation
 * for the transcript record and the dock; a single-round turn is one group.
 */
export function byRound(calls: AnaToolCall[]): Array<{ round: number; calls: AnaToolCall[] }> {
  const groups = new Map<number, AnaToolCall[]>();
  for (const c of calls) {
    const r = typeof c.round === 'number' && c.round > 0 ? c.round : 1;
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(c);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([round, cs]) => ({ round, calls: cs }));
}

/**
 * Close every step still "running" when the turn ends before they report —
 * a stop, a timeout, a lost connection. A step the turn never heard back
 * from did not complete, and a row that keeps saying "running" beside
 * "Stopped after 12s" is a contradiction on screen. `note` is the sentence
 * the row shows for why. Pure; returns the same array when nothing is open.
 */
export function settleRunningCalls(
  calls: AnaToolCall[] | undefined,
  note: string,
  now: number,
): AnaToolCall[] | undefined {
  if (!calls || !calls.some(c => c.status === 'running')) return calls;
  return calls.map(c => (c.status === 'running' ? { ...c, status: 'error', endedAt: now, message: note } : c));
}

/** The step currently in flight, if any — the row the panel highlights. */
export function currentStep(calls: AnaToolCall[] | undefined): AnaToolCall | null {
  const list = calls ?? [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].status === 'running') return list[i];
  }
  return null;
}

/* ── The declared plan ────────────────────────────────────────────────────── */

const PLAN_STATUSES: ReadonlySet<string> = new Set(['pending', 'in_progress', 'completed']);

/** The `update_plan` tool, whose rows the transcript shows as plan changes instead. */
export const PLAN_TOOL = 'update_plan';

/**
 * Parse a `plan` event's steps. The server already validated them; this only
 * refuses a malformed payload rather than rendering half of one.
 */
export function readPlanSteps(raw: unknown): AnaPlanStep[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const steps: AnaPlanStep[] = [];
  for (const r of raw) {
    const title = typeof r?.title === 'string' ? r.title.trim() : '';
    const status = typeof r?.status === 'string' ? r.status : '';
    if (!title || !PLAN_STATUSES.has(status)) return null;
    steps.push({ title, status: status as AnaPlanStep['status'] });
  }
  return steps;
}

/**
 * The changes from one plan to the next, keyed by title (the tool asks for the
 * same titles on every call). A first plan is all `added`, marked `initial`,
 * so the transcript can say "Planned 5 steps" once rather than five times.
 */
export function diffPlan(
  prev: AnaPlanStep[] | undefined,
  next: AnaPlanStep[],
  at: number,
  round?: number,
): AnaPlanChange[] {
  const before = new Map((prev ?? []).map((s) => [s.title.toLowerCase(), s]));
  const initial = !prev || prev.length === 0;
  const tag = { at, ...(round ? { round } : {}), ...(initial ? { initial: true } : {}) };
  const changes: AnaPlanChange[] = [];
  for (const s of next) {
    const was = before.get(s.title.toLowerCase());
    if (!was) changes.push({ kind: 'added', title: s.title, ...tag });
    if (s.status !== was?.status) {
      if (s.status === 'in_progress') changes.push({ kind: 'started', title: s.title, ...tag });
      if (s.status === 'completed') changes.push({ kind: 'completed', title: s.title, ...tag });
    }
    before.delete(s.title.toLowerCase());
  }
  for (const gone of before.values()) changes.push({ kind: 'removed', title: gone.title, at, ...(round ? { round } : {}) });
  return changes;
}

/** Apply a `plan` event to the turn it belongs to. A malformed payload changes nothing. */
export function applyPlanEvent(
  m: AnaChatMessage,
  event: { steps?: unknown; round?: unknown },
  now: number,
): AnaChatMessage {
  const steps = readPlanSteps(event.steps);
  if (!steps) return m;
  const round = typeof event.round === 'number' && event.round > 0 ? event.round : undefined;
  return { ...m, plan: steps, planChanges: [...(m.planChanges ?? []), ...diffPlan(m.plan, steps, now, round)] };
}

/** Parse a `context_used` event. Null when the payload is not one. */
export function readContextUsed(event: Record<string, unknown>): AnaContextUsed | null {
  const status = event.memoryStatus;
  if (!Array.isArray(event.uploads) || !Array.isArray(event.memory)) return null;
  if (status !== 'read' && status !== 'none' && status !== 'unavailable') return null;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    uploads: event.uploads
      .filter((u) => u && typeof u.fileName === 'string')
      .map((u) => ({
        fileId: str(u.fileId),
        fileName: u.fileName as string,
        mimeType: str(u.mimeType),
        read: u.read === 'content' ? ('content' as const) : ('name_only' as const),
      })),
    unresolvedUploads: typeof event.unresolvedUploads === 'number' ? Math.max(0, event.unresolvedUploads) : 0,
    memory: event.memory
      .filter((a) => a && typeof a.title === 'string' && a.title)
      .map((a) => ({
        layer: str(a.layer),
        title: a.title as string,
        ...(typeof a.documentName === 'string' && a.documentName ? { documentName: a.documentName } : {}),
      })),
    memoryStatus: status,
  };
}

/**
 * Read the `turnRecord` a closing event carries. Undefined when it is absent or
 * malformed: a status that cannot be read is not shown, and never as recorded.
 */
export function readTurnRecord(raw: unknown): AnaTurnRecordStatus | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (r.status === 'recorded' && typeof r.id === 'string' && typeof r.sha256 === 'string' && /^[0-9a-f]{64}$/.test(r.sha256)) {
    return { status: 'recorded', id: r.id, sha256: r.sha256 };
  }
  if (r.status === 'not_recorded') {
    return { status: 'not_recorded', reason: typeof r.reason === 'string' && r.reason ? r.reason : 'The server did not say why.' };
  }
  return undefined;
}

export interface PlanPosition {
  /** 1-based step the work is on: the first in progress, else the first not yet done. */
  current: number;
  total: number;
  completed: number;
}

/**
 * Where the declared plan stands. Null without a plan — the caller then shows
 * no count at all, because there is nothing honest to count against.
 */
export function planPosition(plan: AnaPlanStep[] | undefined): PlanPosition | null {
  if (!plan || plan.length === 0) return null;
  const completed = plan.filter((s) => s.status === 'completed').length;
  const active = plan.findIndex((s) => s.status === 'in_progress');
  const next = plan.findIndex((s) => s.status !== 'completed');
  const current = active >= 0 ? active + 1 : next >= 0 ? next + 1 : plan.length;
  return { current, total: plan.length, completed };
}
