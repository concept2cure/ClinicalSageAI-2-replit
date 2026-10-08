/**
 * A turn's Summary payload, from its stored record (ANA-SUMMARY S4,
 * docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §2.5, §2.7).
 *
 *   { id, threadId, outcome, startedAt, endedAt, schemaVersion,
 *     verdict: { ok, reason? }, recordSha256, events, controls, models }
 *
 * Built by allow-list, never by spreading the record or its metadata: the
 * record holds the system prompt, the model's whole input, every tool input,
 * result and what the model was sent, tool names, tool-use ids, request ids,
 * the organisation, the person and the reasoning, and none of it belongs here.
 * What does:
 *   - events: the sealed timeline, each note's text resolved from the record's
 *     texts — the only text this resolves. Null for a record from before /4,
 *     which has no timeline (the client then shows its trace rows);
 *   - controls: the person's pause, steer and stop, without who took them;
 *   - models: the distinct provider and model of each call, without the
 *     request id, so a reviewer sees which model narrated the turn;
 *   - verdict: whether the stored bytes verify now, and if not, why, in words.
 *
 * Pure.
 *
 * @module server/services/ana/turn-summary
 */

import { resolveTimeline, type TimelineControl, type TimelineEvent } from '@shared/ana/turn-timeline';
import type { TurnRecordBody } from './turn-record.js';
import type { StoredTurnRecord, TurnRecordVerdict } from './turn-record-verify.js';

export interface TurnSummaryPayload {
  id: string;
  threadId: string | null;
  outcome: StoredTurnRecord['outcome'];
  startedAt: string;
  endedAt: string;
  schemaVersion: string;
  verdict: { ok: boolean; reason?: string };
  recordSha256: string;
  /** Null for a record from before /4: it has no timeline. */
  events: TimelineEvent[] | null;
  /** Null when the record could not read them: never an empty list standing in for none. */
  controls: TimelineControl[] | null;
  models: Array<{ provider: string | null; model: string | null }>;
}

/** Why a record does not verify, in a person's words; the first failure found. */
function verdictReason(v: TurnRecordVerdict): string | undefined {
  if (v.ok) return undefined;
  if (!v.recordIntact) return 'The stored record no longer matches its hash.';
  if (!v.chainCarriesHash) return "The audit chain does not carry this record's hash.";
  if (v.chainPayloadIntact === false) return "The audit chain's entry for this record was altered.";
  if (v.missingTexts.length > 0) return 'Some of the texts this record references are missing.';
  if (v.alteredTexts.length > 0) return 'Some of the texts this record references were altered.';
  return 'The record could not be verified.';
}

function controlsOf(raw: unknown[] | null | undefined): TimelineControl[] | null {
  if (!Array.isArray(raw)) return null;
  const out: TimelineControl[] = [];
  for (const c of raw as Array<Record<string, unknown>>) {
    if (!c || typeof c.action !== 'string' || typeof c.at !== 'string') continue;
    out.push({
      action: c.action,
      round: typeof c.round === 'number' ? c.round : 0,
      at: c.at,
      ...(typeof c.message === 'string' && c.message ? { message: c.message } : {}),
    });
  }
  return out;
}

function modelsOf(body: TurnRecordBody): TurnSummaryPayload['models'] {
  const seen = new Map<string, { provider: string | null; model: string | null }>();
  for (const c of body.model?.calls ?? []) {
    const key = `${c.provider ?? ''}\u0000${c.model ?? ''}`;
    if (!seen.has(key)) seen.set(key, { provider: c.provider ?? null, model: c.model ?? null });
  }
  return [...seen.values()];
}

/** The Summary of a stored record, re-verified by the caller over exactly what was read. */
function bodyOf(recordText: string): TurnRecordBody | null {
  try {
    return JSON.parse(recordText) as TurnRecordBody;
  } catch {
    return null;
  }
}

export function buildTurnSummary(record: StoredTurnRecord, verdict: TurnRecordVerdict): TurnSummaryPayload {
  const body = bodyOf(record.recordText);
  const reason = verdictReason(verdict);
  return {
    id: record.id,
    threadId: record.threadId,
    outcome: record.outcome,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    schemaVersion: record.schemaVersion,
    verdict: { ok: verdict.ok, ...(reason ? { reason } : {}) },
    recordSha256: record.recordSha256,
    events: body && Array.isArray(body.timeline) ? resolveTimeline(body.timeline, record.texts) : null,
    controls: body ? controlsOf(body.controls) : null,
    models: body ? modelsOf(body) : [],
  };
}
