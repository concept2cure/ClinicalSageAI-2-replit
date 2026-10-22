/**
 * AnA detach (docs/design/ANA_DETACH_2026-10-08.md, slice DT3): the numbers
 * and the fixed copy a turn that outlives its page is bounded and described
 * by, shared by the owner that enforces them, the run read that reports them
 * and the client that shows them.
 *
 * ── Watched and detached are two facts (§2.2) ────────────────────────────────
 *   detached  the page that started the turn closed (its socket is gone); the
 *             turn goes on.
 *   watched   the originating socket is attached, or the asker's own poll
 *             stamped `ana_runs.last_watched_at` within WATCHED_WINDOW_MS.
 * The unattended limit and the notification key on UNWATCHED.
 *
 * ── The unattended limit (§2.6, D-2) ─────────────────────────────────────────
 * Once a turn has detached it stops UNATTENDED_MS (Auto's work budget, 15
 * minutes) after watching stopped — the later of the detach and the last
 * watched stamp, so a watch resets the clock — and never later than
 * AUTO_WALL_MS (40 minutes) from the turn's start, which no watching resets.
 * At a round boundary the next model call is the closing answer; inside a
 * round a closing-answer grace of DETACHED_CLOSE_GRACE_MS follows, and then
 * the owner aborts. The one function below answers "when" for all three
 * readers. The Working marker says the bound — the limit plus that grace
 * (stoppedByMs), in UTC (utcClock) — since the stop begins at the limit and
 * has landed by then.
 *
 * Every time here is server time (ISO-8601 UTC, or epoch ms of the server's
 * clock); the client computes nothing against its own clock but displays.
 *
 * @module shared/ana/run-detach
 */

import { AUTO_ACTIVE_MS, AUTO_WALL_MS } from './run-control-limits';
import type { NotificationCategory } from '../constants/notifications';

/** A run is watched while the asker's poll stamped it within this window (§2.2). */
export const WATCHED_WINDOW_MS = 15_000;

/** The watched stamp is written at most this often per run (§3.7). */
export const WATCH_STAMP_MIN_MS = 5_000;

/** Unwatched time after which a detached turn's next model call is its closing answer. */
export const UNATTENDED_MS = AUTO_ACTIVE_MS;

/** The unattended limit in words, from the number (never a literal beside it). */
export const UNATTENDED_WORDS = `${Math.round(UNATTENDED_MS / 60_000)} minutes`;

/** The hard cap from the turn's start, whatever the watching. */
export const DETACHED_WALL_MS = AUTO_WALL_MS;

/** The cap in words, from the number: "40-minute" (DT3 review: never Auto's budget for a turn not under Auto). */
export const DETACHED_WALL_WORDS = `${Math.round(DETACHED_WALL_MS / 60_000)}-minute`;

/** The one new number (§2.6): the closing answer's grace before a hard abort. */
export const DETACHED_CLOSE_GRACE_MS = 120_000;

/** Which limit ends a detached turn: the unwatched clock, or the 40-minute cap. */
export type UnattendedReason = 'unattended_limit' | 'budget_exhausted';

export interface UnattendedDeadline {
  /** Epoch ms (server clock). */
  at: number;
  reason: UnattendedReason;
}

/**
 * When a detached turn stops if nobody watches it again, and why. Null for a
 * turn that has not detached: a page that is still open is watching.
 */
export function unattendedDeadline(input: {
  startedAtMs: number;
  detachedAtMs: number | null;
  lastWatchedAtMs: number | null;
}): UnattendedDeadline | null {
  if (input.detachedAtMs === null || !Number.isFinite(input.detachedAtMs)) return null;
  const watchStopped = Math.max(input.detachedAtMs, input.lastWatchedAtMs ?? Number.NEGATIVE_INFINITY);
  const unwatchedAt = watchStopped + UNATTENDED_MS;
  const wallAt = input.startedAtMs + DETACHED_WALL_MS;
  return unwatchedAt < wallAt ? { at: unwatchedAt, reason: 'unattended_limit' } : { at: wallAt, reason: 'budget_exhausted' };
}

/**
 * By when an unwatched detached turn has stopped, at the latest: its limit,
 * plus the closing answer's grace, when the owner's hard stop lands
 * (unattended-clock.ts). The limit is when the stop begins; a round inside a
 * long tool call can run on to this (DT3 review: "stops by" must be a bound).
 */
export function stoppedByMs(unattendedStopsAtMs: number): number {
  return unattendedStopsAtMs + DETACHED_CLOSE_GRACE_MS;
}

/**
 * "14:33 UTC": a server instant, as the notice, the record and the Working
 * marker say it (§0, one clock; DT3 review: the marker showed the device's
 * local time with no zone, beside a notice and a record in UTC).
 */
export function utcClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}

/** Is a detached turn watched now — the asker's poll stamped it within the window? */
export function isWatchedNow(lastWatchedAtMs: number | null, nowMs: number): boolean {
  return lastWatchedAtMs !== null && nowMs - lastWatchedAtMs <= WATCHED_WINDOW_MS;
}

/**
 * The record's warning when the page closed and the turn went on (§2.1): a
 * fact an inspector can read, with the limits armed at that moment. Never a
 * control event: a page closing is not a person's decision.
 */
export function detachWarning(detachedAtIso: string, startedAtMs: number): string {
  const cap = new Date(startedAtMs + DETACHED_WALL_MS).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const at = detachedAtIso.replace(/\.\d{3}Z$/, 'Z');
  return (
    `The page closed at ${at}; the turn continued. Unattended limit: stops after ${UNATTENDED_WORDS} with nobody watching, ` +
    `and no later than ${cap}.`
  );
}

/**
 * The in-app notification's category (§5.5, D-5): one of the canonical
 * categories (shared/constants/notifications.ts), so a person can mute it in
 * their notification settings and the inbox validates it like any other.
 */
export const ANA_TURN_NOTIFICATION_CATEGORY = 'ana_turn' satisfies NotificationCategory;

/**
 * The record a notice names: the conversation, as the canonical notification
 * resolver opens it (server/services/notifications/notification-record-target.ts
 * conversationTarget, which checks it is the recipient's own).
 */
export const ANA_TURN_NOTICE_RESOURCE = 'chat_thread';

/** Titles of the notification a detached, unwatched turn sends (§5.5). Fixed copy. */
export const ANA_TURN_NOTICE = {
  approval: 'AnA is waiting for your approval',
  finished: 'AnA finished your request',
  /** Followed by the stop line, without its full stop: "AnA stopped: nobody was watching for 15 minutes". */
  stoppedPrefix: 'AnA stopped',
} as const;

/**
 * How long a notice stays in the inbox (DT3 review, DP-84): it points at a
 * turn, and the turn's own record and conversation are where it is kept. 30
 * days, chosen here; a retention schedule may set another.
 */
export const ANA_TURN_NOTICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The notification body's name for the conversation (§5.5): its title when it
 * has one, otherwise when the turn started (UTC, the server's clock). Never
 * the question's words (DT3 review, DP-84: they would be copied into a second
 * store), a parameter, an id or a tool name.
 */
export function noticeConversationName(input: { threadTitle: string | null; startedAtMs: number }): string {
  const title = (input.threadTitle ?? '').trim();
  return title || `Your conversation started at ${utcClock(input.startedAtMs)}`;
}
