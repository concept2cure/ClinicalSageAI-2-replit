/**
 * The client's own inactivity clock (security audit 2026-09-24, IAM-06; plan
 * P1-1; Annex 11 §12.4, HIPAA §164.312(a)(2)(iii)).
 *
 * The server measures requests; this measures the person. Pointer, key, touch,
 * wheel and scroll events on the window, and the tab becoming visible, are
 * activity. `warnMs` before the window ends, `onWarn` fires (the guard shows a
 * dialog); while the warning stands, ordinary activity does not extend the
 * session — only `extend()` (the "Stay signed in" button) does, so a pointer
 * moving to the "Sign out now" button cannot cancel the warning under it. At
 * the end of the window, `onIdle` fires once and the watch stops.
 */
export interface IdleWatchOptions {
  /** The idle window, in milliseconds. */
  idleMs: number;
  /** How long before the end of the window to warn. Clamped to the window. */
  warnMs: number;
  onWarn: (remainingMs: number) => void;
  onIdle: () => void;
  /** Where the activity listeners go; the window by default. */
  target?: EventTarget;
  /** The clock; Date.now by default. */
  now?: () => number;
  /**
   * When the person was last active, if known from before this watch started
   * (a reload, another tab: the stored clock below). Default: now. A value in
   * the future is taken as now.
   */
  lastActivityAt?: number;
  /** Called with each recorded activity's time (throttled), so it can be kept. */
  onActivity?: (at: number) => void;
}

export interface IdleWatch {
  /** Stop watching; no callback fires afterwards. */
  stop(): void;
  /** The person chose to stay: the window starts again and any warning is over. */
  extend(): void;
  /** When the person was last active, on the watch's clock. */
  lastActivityAt(): number;
  /** Whether the warning is standing. */
  warned(): boolean;
  /**
   * The person was active elsewhere (another tab of the same session) at
   * `at`. Later than what this watch has seen, it moves the window and ends a
   * standing warning; returns whether it did. Not called for this tab's own
   * events, so a pointer on the dialog still cannot cancel it.
   */
  adopt(at: number): boolean;
}

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const;
const THROTTLE_MS = 1000;

export function startIdleWatch(options: IdleWatchOptions): IdleWatch {
  const now = options.now ?? (() => Date.now());
  const target = options.target ?? (typeof window !== 'undefined' ? window : undefined);
  const idleMs = Math.max(1000, options.idleMs);
  const warnMs = Math.min(Math.max(0, options.warnMs), idleMs);

  const started = now();
  let last = typeof options.lastActivityAt === 'number' && Number.isFinite(options.lastActivityAt)
    ? Math.min(options.lastActivityAt, started)
    : started;
  let warned = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const tick = () => {
    timer = null;
    if (stopped) return;
    const elapsed = now() - last;
    if (elapsed >= idleMs) {
      stop();
      options.onIdle();
      return;
    }
    if (!warned && elapsed >= idleMs - warnMs) {
      warned = true;
      options.onWarn(idleMs - elapsed);
    }
    arm();
  };

  const arm = () => {
    clear();
    if (stopped) return;
    const elapsed = now() - last;
    const next = warned || warnMs === 0 ? idleMs - elapsed : idleMs - warnMs - elapsed;
    timer = setTimeout(tick, Math.max(0, next));
  };

  const onActivity = () => {
    if (stopped || warned) return;
    const t = now();
    if (t - last < THROTTLE_MS) return;
    last = t;
    options.onActivity?.(t);
    arm();
  };

  const onVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') onActivity();
  };

  for (const name of ACTIVITY_EVENTS) target?.addEventListener(name, onActivity, { capture: true, passive: true });
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);

  function stop() {
    if (stopped) return;
    stopped = true;
    clear();
    for (const name of ACTIVITY_EVENTS) target?.removeEventListener(name, onActivity, { capture: true });
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
  }

  arm();

  return {
    stop,
    extend() {
      if (stopped) return;
      last = now();
      warned = false;
      arm();
    },
    lastActivityAt: () => last,
    warned: () => warned,
    adopt(at: number) {
      if (stopped || !Number.isFinite(at) || at <= last) return false;
      last = Math.min(at, now());
      const ended = warned;
      warned = false;
      arm();
      return ended;
    },
  };
}

// ── The clock kept across reloads and tabs (QA 2026-10-08, walk 2, j9) ──────
//
// The watch above lived in memory, so it started again on every mount: a page
// reloaded while nobody was there (a dev-server reload in the walk; in
// production an F5, or any reload) counted the window from the reload, and the
// person was never signed out. The person's last activity is kept per session
// in localStorage, which every tab of the browser shares: a mount continues
// the session's clock, and activity in one tab is activity in all of them.
// Keyed by the server's session id, so a previous session's clock is never
// applied to a new sign-in. Storage that cannot be read keeps the old
// behaviour (the clock starts at mount); it never blocks a sign-out.

export const IDLE_ACTIVITY_KEY = 'c2c-idle-last-activity';

/** The stored last activity of this session, or null. */
export function readSessionActivity(sessionId: string | null, raw?: string | null): number | null {
  if (!sessionId) return null;
  try {
    const value = raw === undefined ? localStorage.getItem(IDLE_ACTIVITY_KEY) : raw;
    if (!value) return null;
    const parsed = JSON.parse(value) as { sid?: unknown; at?: unknown };
    return parsed?.sid === sessionId && typeof parsed.at === 'number' && Number.isFinite(parsed.at) ? parsed.at : null;
  } catch {
    return null;
  }
}

/** Keep this session's last activity, for the next mount and the other tabs. */
export function storeSessionActivity(sessionId: string | null, at: number): void {
  if (!sessionId) return;
  try {
    const known = readSessionActivity(sessionId);
    if (known !== null && known >= at) return;
    localStorage.setItem(IDLE_ACTIVITY_KEY, JSON.stringify({ sid: sessionId, at }));
  } catch {
    /* storage unavailable: this tab's clock still runs */
  }
}
