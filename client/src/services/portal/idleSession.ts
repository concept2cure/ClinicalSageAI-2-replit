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
}

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const;
const THROTTLE_MS = 1000;

export function startIdleWatch(options: IdleWatchOptions): IdleWatch {
  const now = options.now ?? (() => Date.now());
  const target = options.target ?? (typeof window !== 'undefined' ? window : undefined);
  const idleMs = Math.max(1000, options.idleMs);
  const warnMs = Math.min(Math.max(0, options.warnMs), idleMs);

  let last = now();
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
  };
}
