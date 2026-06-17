/**
 * Digest preferences — org-level controls so the proactive digest informs
 * without becoming noise.
 *
 * The proactive digest rolls deadlines + open risks + open contradictions into a
 * single notification. Left ungoverned it pings everyone, every weekday, at any
 * severity — the fast road to alert fatigue and people muting it wholesale. These
 * controls let an org tune it:
 *   - minSeverity  — only fire when the rolled-up severity meets a floor
 *                    (e.g. 'critical' = only ping me when something is on fire).
 *   - mutedSignals — drop signal types the org doesn't use ('contradictions',
 *                    'risks', 'deadlines') before the digest is assembled.
 *   - quietHours   — suppress delivery during a daily quiet window (wraparound
 *                    supported, e.g. 22→7 overnight).
 *
 * Preferences are sourced from the scheduled job's `parameters` map (so an admin
 * editing the schedule config is the control surface — no new table). Everything
 * here is PURE and deterministic; the runner wires it. Defaults are permissive,
 * so an unconfigured org behaves exactly as before.
 */

import type { NotificationSeverity } from '../notifications/notification-service.js';

export type DigestSignal = 'deadlines' | 'risks' | 'contradictions';
export const DIGEST_SIGNALS: readonly DigestSignal[] = ['deadlines', 'risks', 'contradictions'];

const SEVERITY_RANK: Record<NotificationSeverity, number> = { info: 0, warning: 1, critical: 2 };

export interface DigestPreferences {
  /** Only deliver when the digest's rolled-up severity is at least this. */
  minSeverity: NotificationSeverity;
  /** Signal types to exclude from the digest entirely. */
  mutedSignals: DigestSignal[];
  /** Daily quiet window [start,end) in 0–23 local hours, or null for none. */
  quietHours: { start: number; end: number } | null;
}

export const DEFAULT_DIGEST_PREFERENCES: DigestPreferences = {
  minSeverity: 'info',
  mutedSignals: [],
  quietHours: null,
};

function isSeverity(v: unknown): v is NotificationSeverity {
  return v === 'info' || v === 'warning' || v === 'critical';
}

function toHour(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null;
}

/**
 * Pure: parse preferences from a scheduled-job `parameters` map. Unknown / absent
 * / malformed values fall back to permissive defaults (never throws). Accepts
 * `mutedSignals` as a comma-separated string or an array.
 */
export function parseDigestPreferences(
  params: Record<string, string | number | boolean> | null | undefined
): DigestPreferences {
  if (!params) return { ...DEFAULT_DIGEST_PREFERENCES, mutedSignals: [] };

  const rawSeverity = typeof params.minSeverity === 'string' ? params.minSeverity.toLowerCase() : '';
  const minSeverity: NotificationSeverity = isSeverity(rawSeverity) ? rawSeverity : 'info';

  const rawMuted = params.mutedSignals;
  const mutedTokens: string[] = Array.isArray(rawMuted)
    ? (rawMuted as unknown[]).map(String)
    : typeof rawMuted === 'string'
      ? rawMuted.split(',')
      : [];
  const mutedSignals = mutedTokens
    .map(s => s.trim().toLowerCase())
    .filter((s): s is DigestSignal => (DIGEST_SIGNALS as readonly string[]).includes(s));

  const start = toHour(params.quietHoursStart);
  const end = toHour(params.quietHoursEnd);
  const quietHours = start != null && end != null && start !== end ? { start, end } : null;

  return { minSeverity, mutedSignals: Array.from(new Set(mutedSignals)), quietHours };
}

/** Pure: does `severity` meet the configured floor? */
export function severityMeetsFloor(
  severity: NotificationSeverity,
  minSeverity: NotificationSeverity
): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[minSeverity];
}

/**
 * Pure: is `now`'s local hour inside the quiet window? Half-open [start,end);
 * supports overnight wraparound (start > end). null window → never quiet.
 */
export function isWithinQuietHours(
  now: Date,
  quietHours: DigestPreferences['quietHours']
): boolean {
  if (!quietHours) return false;
  const h = now.getHours();
  const { start, end } = quietHours;
  return start < end ? h >= start && h < end : h >= start || h < end;
}

export interface DigestSignalInputs<R, B, C> {
  radar: R;
  blockers: B[];
  contradictions: C[];
}

/**
 * Pure: zero out muted signal types before the digest is assembled. `emptyRadar`
 * is supplied by the caller (the radar shape lives in deadline-radar) so this
 * stays dependency-free and generic.
 */
export function applyMutedSignals<R, B, C>(
  inputs: DigestSignalInputs<R, B, C>,
  mutedSignals: DigestSignal[],
  emptyRadar: R
): DigestSignalInputs<R, B, C> {
  const muted = new Set(mutedSignals);
  return {
    radar: muted.has('deadlines') ? emptyRadar : inputs.radar,
    blockers: muted.has('risks') ? [] : inputs.blockers,
    contradictions: muted.has('contradictions') ? [] : inputs.contradictions,
  };
}
