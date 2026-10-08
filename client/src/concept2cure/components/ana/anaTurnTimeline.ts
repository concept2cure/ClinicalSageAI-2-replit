/**
 * The client half of a turn's Summary data (ANA-SUMMARY S4,
 * docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §3.4, §3.5): the `timeline`
 * frames a live turn keeps, the stored message id a reloaded one keeps, the
 * one call that joins a reloaded conversation's records to its messages, and
 * the confirm waits that ask for a record by run id.
 *
 * Kept out of useAnaChat so the hook only routes frames and calls these.
 * Every value here is the server's: a record is attached only where the
 * server named the message it belongs to, never by position.
 *
 * @module client/src/concept2cure/components/ana/anaTurnTimeline
 */

import { readTimelineEvent } from '@shared/ana/turn-timeline';
import { getAuthHeaders } from '../../../utils/authToken';
import { readTurnRecord } from './anaProgress';
import type { AnaChatMessage, AnaTurnRecordStatus } from './useAnaChat.types';

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

/**
 * Ask the server, by run id, whether it filed a turn's record: once after
 * each wait, until one answers. Undefined when none did or the read failed —
 * a record the server cannot confirm is never shown as filed.
 */
export async function confirmRecordByRun(runId: string, waitsMs: readonly number[]): Promise<AnaTurnRecordStatus | undefined> {
  for (const waitMs of waitsMs) {
    await new Promise((r) => setTimeout(r, waitMs));
    try {
      const res = await fetch(`/api/ana-ri/turn-records?run_id=${encodeURIComponent(runId)}&limit=1`, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!res.ok) return undefined;
      const body = await res.json().catch(() => null);
      const row = body?.data?.records?.[0];
      const status = row ? recordStatusOf(row as Record<string, unknown>) : undefined;
      if (status) return status;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** The confirm waits are running for this message (the Summary reads "Recording…"), or they ended with what they found. */
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
