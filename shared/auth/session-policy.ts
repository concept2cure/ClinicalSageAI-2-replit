/** The effective session policy shared by runtime enforcement and the administration UI. */
export const DEFAULT_IDLE_MINUTES = 15;
export const MIN_IDLE_MINUTES = 1;
export const MAX_IDLE_MINUTES = 24 * 60;
export const ABSOLUTE_SESSION_HOURS = 12;
export const DEFAULT_MAX_CONCURRENT_SESSIONS = 5;
export const MIN_MAX_CONCURRENT_SESSIONS = 1;
export const MAX_MAX_CONCURRENT_SESSIONS = 20;

/** Whole seconds held inside the platform bounds; the default for a nonnumber. */
export function clampIdleSeconds(seconds: unknown): number {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return DEFAULT_IDLE_MINUTES * 60;
  return Math.min(MAX_IDLE_MINUTES * 60, Math.max(MIN_IDLE_MINUTES * 60, Math.floor(seconds)));
}

/** The organization's idle window at new sign-in. Legacy sessionTimeout is not used. */
export function idleWindowSecondsOf(settings: unknown): number {
  const security = (settings as { security?: { sessionTimeoutMinutes?: unknown } } | null | undefined)?.security;
  const minutes = security?.sessionTimeoutMinutes;
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return DEFAULT_IDLE_MINUTES * 60;
  return clampIdleSeconds(Math.floor(minutes) * 60);
}

/** The account limit applied when a sign-in registers its session. */
export function maxConcurrentSessionsOf(settings: unknown): number {
  const security = (settings as { security?: { maxConcurrentSessions?: unknown } } | null | undefined)?.security;
  const limit = security?.maxConcurrentSessions;
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_MAX_CONCURRENT_SESSIONS;
  return Math.min(MAX_MAX_CONCURRENT_SESSIONS, Math.max(MIN_MAX_CONCURRENT_SESSIONS, Math.floor(limit)));
}
