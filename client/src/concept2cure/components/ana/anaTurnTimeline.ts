/**
 * The client half of a turn's Summary data (ANA-SUMMARY S4,
 * docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §3.4, §3.5): the `timeline`
 * frames a live turn keeps, the stored message id a reloaded one keeps, and
 * the one call that joins a reloaded conversation's records to its messages.
 *
 * And, since AnA detach DT2 (docs/design/ANA_DETACH_2026-10-08.md §4), the
 * one way this client asks what became of a run: `pollRun`, the read of
 * GET /runs/:runId/events. A device that did not start a turn follows it by
 * polling; a turn that ended here before the server spoke for it asks the
 * same read whether its record was filed. Polled rows and live `timeline`
 * frames reach a turn through the same `applyTimelineFrame`, which keeps each
 * seq once — so the two sources merge by seq and there is one delivery path.
 *
 * Kept out of useAnaChat so the hook only routes frames and calls these.
 * Every value here is the server's: a record is attached only where the
 * server named the message it belongs to, never by position.
 *
 * @module client/src/concept2cure/components/ana/anaTurnTimeline
 */

import { MIRROR_TRUNCATED_SEQ, readTimelineEvent, type TimelineControl } from '@shared/ana/turn-timeline';
import { isAnaRunPolicy } from '@shared/ana/run-policy';
import type { AnaRunPolicy } from '@shared/ana/run-control-limits';
import { getAuthHeaders } from '../../../utils/authToken';
import { readPlanSteps, readTurnRecord } from './anaProgress';
import type { AnaChatMessage, AnaFollow, AnaPlanStep, AnaTurnRecordStatus } from './useAnaChat.types';

/** A `timeline` frame's event onto its turn; a malformed one, or one already kept, changes nothing. */
export function applyTimelineFrame(m: AnaChatMessage, raw: unknown): AnaChatMessage {
  const event = readTimelineEvent(raw);
  if (!event || m.timeline?.some((e) => e.seq === event.seq)) return m;
  return { ...m, timeline: [...(m.timeline ?? []), event] };
}

/** A stored message's id, when the history row carries a whole, positive one. */
export function readServerId(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : undefined;
}

/** A listed record as the client keeps it, or undefined when it cannot be read whole. */
function recordStatusOf(row: Record<string, unknown>): AnaTurnRecordStatus | undefined {
  return readTurnRecord({ status: 'recorded', id: row.id, sha256: row.recordSha256 });
}

/**
 * The conversation's turn records, by the assistant message each one names
 * (one call: GET /api/ana-ri/turn-records?thread_id=). Empty when the list
 * cannot be read: a message then keeps no record status, which reads as
 * "Not recorded" only where nothing says otherwise — never as recorded.
 */
export async function fetchThreadRecords(threadId: string, signal?: AbortSignal): Promise<Map<number, AnaTurnRecordStatus>> {
  const byMessage = new Map<number, AnaTurnRecordStatus>();
  try {
    const res = await fetch(`/api/ana-ri/turn-records?thread_id=${encodeURIComponent(threadId)}&limit=500`, {
      headers: getAuthHeaders(),
      credentials: 'include',
      signal,
    });
    if (!res.ok) return byMessage;
    const body = await res.json().catch(() => null);
    const rows: unknown[] = Array.isArray(body?.data?.records) ? body.data.records : [];
    for (const raw of rows) {
      const row = (raw ?? {}) as Record<string, unknown>;
      const messageId = readServerId(row.assistantMessageId);
      const status = recordStatusOf(row);
      // Newest first: the first record a message is named by is its own.
      if (messageId !== undefined && status && !byMessage.has(messageId)) byMessage.set(messageId, status);
    }
  } catch {
    /* No join: the messages keep what they had. */
  }
  return byMessage;
}

/** Each message whose stored id a record names gets that record; nothing else changes. */
export function joinTurnRecords(messages: AnaChatMessage[], records: ReadonlyMap<number, AnaTurnRecordStatus>): AnaChatMessage[] {
  if (records.size === 0) return messages;
  return messages.map((m) => {
    const record = m.role === 'assistant' && m.serverId !== undefined ? records.get(m.serverId) : undefined;
    return record && !m.turnRecord ? { ...m, turnRecord: record } : m;
  });
}

/** The record poll is running for this message (the Summary reads "Recording…"), or it ended with what it found. */
export function settleRecordConfirm(
  messages: AnaChatMessage[],
  messageId: string,
  phase: { confirming: true } | { confirming: false; record: AnaTurnRecordStatus | undefined },
): AnaChatMessage[] {
  return messages.map((m) => {
    if (m.id !== messageId) return m;
    if (phase.confirming) return { ...m, recordConfirming: true };
    const recorded = phase.record && m.turnRecord?.status === 'unconfirmed' ? { turnRecord: phase.record } : {};
    return { ...m, recordConfirming: false, ...recorded };
  });
}

/* ── Following a run without its socket (AnA detach DT2, §4) ──────────────── */

/** The run statuses that are still working. Anything else has ended. */
export const LIVE_RUN_STATUSES: ReadonlySet<string> = new Set(['running', 'paused', 'awaiting_approval']);

/** One run as GET /runs?thread_id= lists it. */
export interface ListedRun {
  runId: string;
  userMessageId: number | null;
  status: string;
  stoppedReason: string | null;
  runPolicy: AnaRunPolicy | null;
  startedAt: string | null;
  releasedAt: string | null;
}

/** One read of GET /runs/:runId/events, as the client keeps it. Allow-listed; nothing else is read. */
export interface RunPoll {
  runId: string;
  userMessageId: number | null;
  status: string;
  stoppedReason: string | null;
  runPolicy: AnaRunPolicy | null;
  /** `{ reason, next }` while a Manual hold or a person's pause is open (written from DT3). */
  hold: { reason: unknown; next: unknown } | null;
  plan: AnaPlanStep[] | null;
  startedAt: string | null;
  lastBeatAt: string | null;
  releasedAt: string | null;
  serverNow: string;
  highWater: number;
  /** The page's events, each read by the one reader the frames use. */
  events: ReturnType<typeof readTimelineEvent>[];
  /** The highest seq this page held, the truncation marker included: where the next read starts. */
  lastSeq: number;
  /** The page carried the cap's marker (seq 2,000). */
  truncated: boolean;
  /** A full page: more rows are waiting. */
  more: boolean;
  controls: TimelineControl[];
  sealed: { recordId: string; assistantMessageId: number | null } | null;
  /** The asker's pending approval, as the `approval_required` frame carries it; null for anyone else. */
  approval: Record<string, unknown> | null;
  /** 'all' for the asker; 'cancel' for an organisation admin. */
  scope: 'all' | 'cancel';
}

export type RunPollResult =
  | { ok: true; poll: RunPoll }
  /** 403: a colleague, who may read the transcript but not the live progress. */
  | { ok: false; kind: 'forbidden'; message: string }
  /** 404: not this organisation's run, or none. */
  | { ok: false; kind: 'gone' }
  /** The read did not reach the server, or the server failed it. The last known state stays. */
  | { ok: false; kind: 'unreachable' };

/** The page size the route serves (server runs.ts RUN_EVENTS_PAGE). */
const RUN_EVENTS_PAGE = 200;

const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const intOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null);

/** A poll body read field by field, or null when it is not one. Exported for its test. */
export function readRunPoll(raw: unknown): RunPoll | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, any>;
  if (typeof b.runId !== 'string' || typeof b.status !== 'string' || typeof b.serverNow !== 'string') return null;
  const rawEvents: unknown[] = Array.isArray(b.events) ? b.events : [];
  const seqs = rawEvents.map((e) => (e && typeof (e as { seq?: unknown }).seq === 'number' ? (e as { seq: number }).seq : 0));
  const sealed = b.sealed && typeof b.sealed === 'object' && typeof b.sealed.recordId === 'string'
    ? { recordId: b.sealed.recordId as string, assistantMessageId: intOrNull(b.sealed.assistantMessageId) }
    : null;
  return {
    runId: b.runId,
    userMessageId: intOrNull(b.userMessageId),
    status: b.status,
    stoppedReason: strOrNull(b.stoppedReason),
    runPolicy: isAnaRunPolicy(b.runPolicy) ? b.runPolicy : null,
    hold: b.hold && typeof b.hold === 'object' ? { reason: b.hold.reason, next: b.hold.next } : null,
    plan: readPlanSteps(b.plan),
    startedAt: strOrNull(b.startedAt),
    lastBeatAt: strOrNull(b.lastBeatAt),
    releasedAt: strOrNull(b.releasedAt),
    serverNow: b.serverNow,
    highWater: typeof b.highWater === 'number' && b.highWater >= 0 ? b.highWater : 0,
    events: rawEvents.map(readTimelineEvent),
    lastSeq: seqs.length > 0 ? Math.max(...seqs) : 0,
    truncated: seqs.includes(MIRROR_TRUNCATED_SEQ),
    more: rawEvents.length >= RUN_EVENTS_PAGE,
    controls: Array.isArray(b.controls) ? (b.controls as TimelineControl[]) : [],
    sealed,
    approval: b.approval && typeof b.approval === 'object' ? (b.approval as Record<string, unknown>) : null,
    scope: b.controlScope === 'cancel' ? 'cancel' : 'all',
  };
}

/**
 * One read of a run's state and its rows after `after`. `visible` tells the
 * server the asker's page is on screen (its watched stamp, written from DT3).
 * Never throws: a failure is a kind, and the caller keeps what it had.
 */
export async function pollRun(
  runId: string,
  after: number,
  opts: { visible?: boolean; signal?: AbortSignal } = {},
): Promise<RunPollResult> {
  const q = `after=${Math.max(0, Math.floor(after))}${opts.visible ? '&visible=1' : ''}`;
  try {
    const res = await fetch(`/api/ana-ri/runs/${encodeURIComponent(runId)}/events?${q}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
      signal: opts.signal,
    });
    const body = await res.json().catch(() => null);
    if (res.status === 403) {
      const message = typeof body?.error === 'string' && body.error ? body.error : "You don't have access to this conversation's live progress.";
      return { ok: false, kind: 'forbidden', message };
    }
    if (res.status === 404) return { ok: false, kind: 'gone' };
    const poll = res.ok ? readRunPoll(body) : null;
    return poll ? { ok: true, poll } : { ok: false, kind: 'unreachable' };
  } catch {
    return { ok: false, kind: 'unreachable' };
  }
}

/** The conversation's runs to rejoin (GET /runs?thread_id=), newest first; null when the list could not be read. */
export async function listThreadRuns(threadId: string, signal?: AbortSignal): Promise<ListedRun[] | null> {
  try {
    const res = await fetch(`/api/ana-ri/runs?thread_id=${encodeURIComponent(threadId)}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
      signal,
    });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    const rows: unknown[] = Array.isArray(body?.runs) ? body.runs : [];
    return rows
      .map((raw) => (raw ?? {}) as Record<string, any>)
      .filter((r) => typeof r.runId === 'string' && typeof r.status === 'string')
      .map((r) => ({
        runId: r.runId as string,
        userMessageId: intOrNull(r.userMessageId),
        status: r.status as string,
        stoppedReason: strOrNull(r.stoppedReason),
        runPolicy: isAnaRunPolicy(r.runPolicy) ? r.runPolicy : null,
        startedAt: strOrNull(r.startedAt),
        releasedAt: strOrNull(r.releasedAt),
      }));
  } catch {
    return null;
  }
}

/**
 * The sealed record a poll named, as the turn keeps it: read through the
 * record's own Summary, which verifies it on that read (S4). Undefined when it
 * cannot be read — never recorded on no evidence.
 */
export async function readSealedRecord(recordId: string, signal?: AbortSignal): Promise<AnaTurnRecordStatus | undefined> {
  try {
    const res = await fetch(`/api/ana-ri/turn-records/${encodeURIComponent(recordId)}/summary`, {
      headers: getAuthHeaders(),
      credentials: 'include',
      signal,
    });
    if (!res.ok) return undefined;
    const body = await res.json().catch(() => null);
    return readTurnRecord({ status: 'recorded', id: recordId, sha256: body?.data?.recordSha256 });
  } catch {
    return undefined;
  }
}

/**
 * Which listed run a reloaded conversation rejoins: the newest one that is
 * still working, or that ended and whose question has no answer in the
 * transcript yet (its recording window, or a turn that was never recorded).
 * A run whose question is already answered is the transcript's; one that
 * names no question cannot be placed, and is not guessed at.
 */
export function runToRejoin(messages: readonly AnaChatMessage[], runs: readonly ListedRun[]): ListedRun | null {
  for (const run of runs) {
    if (run.userMessageId === null) continue;
    const i = messages.findIndex((m) => m.role === 'user' && m.serverId === run.userMessageId);
    if (LIVE_RUN_STATUSES.has(run.status)) return run;
    if (i >= 0 && messages[i + 1]?.role !== 'assistant') return run;
  }
  return null;
}

/** The id a followed turn's message goes by. */
export const followedTurnId = (runId: string) => `f-${runId}`;

/**
 * The followed turn, placed after the question it answers (by the stored id
 * the run names), or at the end when the transcript does not hold it.
 */
export function placeFollowedTurn(
  messages: readonly AnaChatMessage[],
  turn: AnaChatMessage,
  userMessageId: number | null,
): AnaChatMessage[] {
  const without = messages.filter((m) => m.id !== turn.id);
  const i = userMessageId === null ? -1 : without.findIndex((m) => m.role === 'user' && m.serverId === userMessageId);
  if (i < 0) return [...without, turn];
  return [...without.slice(0, i + 1), turn, ...without.slice(i + 1)];
}

/** A followed turn before its first read: working, with nothing claimed. */
export function followedTurn(runId: string, scope: AnaFollow['scope'] = 'all'): AnaChatMessage {
  return {
    id: followedTurnId(runId),
    role: 'assistant',
    text: '',
    streaming: true,
    follow: { runId, scope, status: 'running', startedAt: null, skewMs: 0, lastBeatAt: null, highWater: 0 },
  };
}

const ms = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/**
 * One poll onto the turn it follows. The rows merge by seq through the same
 * `applyTimelineFrame` the live frames use, so a row seen on both is one row.
 * Every time is the server's: `sentAt` is the run's start moved onto this
 * client's clock by the poll's own `serverNow`, never this clock's guess.
 */
export function applyRunPoll(m: AnaChatMessage, poll: RunPoll, clientNow: number): AnaChatMessage {
  let next = m;
  for (const e of poll.events) if (e) next = applyTimelineFrame(next, e);
  const serverNow = ms(poll.serverNow) ?? clientNow;
  const skewMs = serverNow - clientNow;
  const startedAt = ms(poll.startedAt);
  const live = LIVE_RUN_STATUSES.has(poll.status);
  return {
    ...next,
    ...(poll.plan ? { plan: poll.plan } : {}),
    ...(poll.runPolicy ? { runPolicy: poll.runPolicy } : {}),
    ...(startedAt !== null ? { sentAt: startedAt - skewMs } : {}),
    ...(!live && poll.stoppedReason ? { stoppedReason: poll.stoppedReason as AnaChatMessage['stoppedReason'] } : {}),
    follow: {
      ...(next.follow ?? { runId: poll.runId, scope: poll.scope, status: poll.status, startedAt: null, skewMs: 0, lastBeatAt: null, highWater: 0 }),
      runId: poll.runId,
      scope: poll.scope,
      status: poll.status,
      startedAt,
      skewMs,
      lastBeatAt: ms(poll.lastBeatAt),
      highWater: Math.max(next.follow?.highWater ?? 0, poll.highWater),
      truncated: Boolean(next.follow?.truncated) || poll.truncated,
      released: poll.releasedAt !== null,
      approvalWaiting: poll.status === 'awaiting_approval' && poll.approval === null,
      unreachable: false,
    },
  };
}
